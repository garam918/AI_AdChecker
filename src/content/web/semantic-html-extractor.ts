import { DomUtils, ElementType, parseDocument } from 'htmlparser2';

import {
  ExtractedWebContentSchema,
  type ExtractedWebContent,
  type PageSection,
  type PageSectionType,
} from './schemas';

const REMOVED_TAGS = new Set([
  'script',
  'style',
  'noscript',
  'iframe',
  'svg',
  'nav',
  'footer',
]);
const NOISE_PATTERN =
  /(?:^|[-_\s])(cookie|consent|breadcrumb|global-nav|site-nav|footer|tracking|pixel|screen-reader|sr-only)(?:$|[-_\s])/i;
const CONTEXT_PATTERNS: Array<[PageSectionType, RegExp]> = [
  ['PRICING', /pricing|price|plan|요금|가격|무료/i],
  ['TESTIMONIAL', /testimonial|review|customer|후기|고객사례/i],
  ['COMPARISON', /comparison|compare|versus|\bvs\b|비교/i],
  ['FAQ', /faq|question|자주.*질문/i],
  ['FEATURE', /feature|benefit|기능|특징|혜택/i],
  ['HERO', /hero|masthead|headline|jumbotron/i],
];
const PRIORITY: Record<PageSectionType, number> = {
  HERO: 100,
  HEADING: 90,
  COMPARISON: 88,
  PRICING: 86,
  CTA: 82,
  FEATURE: 76,
  TESTIMONIAL: 72,
  FAQ: 66,
  PARAGRAPH: 58,
  IMAGE_ALT: 52,
  META_DESCRIPTION: 48,
};

type ExtractHtmlInput = {
  html: string;
  url: string;
  finalUrl: string;
  responseTruncated?: boolean;
  fixtureId?: string;
};

type HtmlElement = ReturnType<typeof DomUtils.findAll>[number];
type SectionCandidate = {
  text: string;
  type: PageSectionType;
  heading: string | null;
  position: number;
  cssPath: string;
  sourceTag: string;
  metadata: Record<string, string | number | boolean | null>;
};

export class SemanticHtmlExtractor {
  constructor(private readonly maximumVisibleTextLength = 40_000) {}

  extract(input: ExtractHtmlInput): ExtractedWebContent {
    const document = parseDocument(input.html, {
      decodeEntities: true,
      lowerCaseAttributeNames: true,
      lowerCaseTags: true,
      withStartIndices: true,
    });
    const structuredData = extractStructuredData(document);

    const elements = DomUtils.findAll(() => true, document);
    elements
      .filter((element) => shouldRemoveElement(element))
      .forEach((element) => DomUtils.removeElement(element));

    const remainingElements = DomUtils.findAll(() => true, document);
    const title =
      getElementText(
        remainingElements.find((element) => element.name === 'title'),
      ) || new URL(input.finalUrl).hostname;
    const description = getMetaContent(
      remainingElements,
      'name',
      'description',
    );
    const language =
      remainingElements.find((element) => element.name === 'html')?.attribs
        .lang || null;
    const headings = uniqueText(
      remainingElements
        .filter((element) => /^h[1-3]$/.test(element.name))
        .map(getElementText),
    );
    const paragraphs = uniqueText(
      remainingElements
        .filter((element) => ['p', 'blockquote'].includes(element.name))
        .map(getElementText),
    );
    const buttons = uniqueText(
      remainingElements
        .filter(
          (element) =>
            element.name === 'button' ||
            (element.name === 'a' && isCtaElement(element)),
        )
        .map(getElementText),
    );
    const links = uniqueBy(
      remainingElements
        .filter((element) => element.name === 'a' && element.attribs.href)
        .map((element) => ({
          text: getElementText(element),
          url: resolvePublicAssetUrl(element.attribs.href, input.finalUrl),
        }))
        .filter((link): link is { text: string; url: string } =>
          Boolean(link.url),
        ),
      (link) => `${link.text}:${link.url}`,
    ).slice(0, 100);
    const images = uniqueBy(
      remainingElements
        .filter(
          (element) =>
            element.name === 'img' &&
            !isTrackingPixel(element) &&
            Boolean(normalizeText(element.attribs.alt ?? '')),
        )
        .map((element) => ({
          alt: normalizeText(element.attribs.alt ?? ''),
          src: resolvePublicAssetUrl(element.attribs.src, input.finalUrl),
        }))
        .filter((image): image is { alt: string; src: string } =>
          Boolean(image.src),
        ),
      (image) => `${image.alt}:${image.src}`,
    ).slice(0, 100);

    const rawSections = buildSections(remainingElements, images, description);
    const { sections, truncatedByTextLimit } = selectPrioritySections(
      rawSections,
      this.maximumVisibleTextLength,
    );
    const visibleText = sections.map((section) => section.text).join('\n');

    return ExtractedWebContentSchema.parse({
      url: input.url,
      finalUrl: input.finalUrl,
      title,
      description,
      language,
      headings,
      paragraphs,
      buttons,
      links,
      images,
      structuredData,
      sections,
      visibleText,
      contentTruncated:
        Boolean(input.responseTruncated) || truncatedByTextLimit,
      extractedAt: new Date().toISOString(),
      ...(input.fixtureId && { fixtureId: input.fixtureId }),
    });
  }
}

function extractStructuredData(document: ReturnType<typeof parseDocument>) {
  return DomUtils.findAll(
    (element) =>
      element.name === 'script' &&
      element.attribs.type?.toLowerCase() === 'application/ld+json',
    document,
  ).flatMap((element) => {
    try {
      const value: unknown = JSON.parse(DomUtils.textContent(element));
      return selectSupportedStructuredData(value);
    } catch {
      return [];
    }
  });
}

function selectSupportedStructuredData(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(selectSupportedStructuredData);
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  if (Array.isArray(record['@graph'])) {
    return record['@graph'].flatMap(selectSupportedStructuredData);
  }
  const types = Array.isArray(record['@type'])
    ? record['@type']
    : [record['@type']];
  return types.some((type) =>
    ['Product', 'Offer', 'SoftwareApplication', 'FAQPage'].includes(
      String(type),
    ),
  )
    ? [record]
    : [];
}

function shouldRemoveElement(element: HtmlElement) {
  if (REMOVED_TAGS.has(element.name)) return true;
  if (
    'hidden' in element.attribs ||
    element.attribs['aria-hidden'] === 'true'
  ) {
    return true;
  }
  if (
    /display\s*:\s*none|visibility\s*:\s*hidden/i.test(
      element.attribs.style ?? '',
    )
  ) {
    return true;
  }
  const identity = `${element.attribs.id ?? ''} ${element.attribs.class ?? ''}`;
  return NOISE_PATTERN.test(identity) || isTrackingPixel(element);
}

function isTrackingPixel(element: HtmlElement) {
  if (element.name !== 'img') return false;
  const width = Number.parseInt(element.attribs.width ?? '', 10);
  const height = Number.parseInt(element.attribs.height ?? '', 10);
  return (
    (Number.isFinite(width) && width <= 1) ||
    (Number.isFinite(height) && height <= 1)
  );
}

function getMetaContent(
  elements: HtmlElement[],
  attribute: string,
  value: string,
) {
  return (
    elements.find(
      (element) =>
        element.name === 'meta' &&
        element.attribs[attribute]?.toLowerCase() === value,
    )?.attribs.content ?? null
  );
}

function getElementText(element?: HtmlElement) {
  return element ? normalizeText(DomUtils.textContent(element)) : '';
}

function normalizeText(value: string) {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function buildSections(
  elements: HtmlElement[],
  images: Array<{ alt: string; src: string }>,
  description: string | null,
) {
  const candidates: SectionCandidate[] = elements
    .filter(isSemanticCandidate)
    .map((element) => {
      const text = getElementText(element);
      const type = classifySectionType(element);
      return {
        text,
        type,
        heading: /^h[1-3]$/.test(element.name)
          ? text
          : findContextHeading(element),
        position: element.startIndex ?? Number.MAX_SAFE_INTEGER,
        cssPath: createCssPath(element),
        sourceTag: element.name,
        metadata: {
          priority: PRIORITY[type],
          ...(element.attribs.href && { href: element.attribs.href }),
        },
      };
    })
    .filter((candidate) => candidate.text.length >= 2);

  images.forEach((image, index) => {
    candidates.push({
      text: image.alt,
      type: 'IMAGE_ALT',
      heading: null,
      position: Number.MAX_SAFE_INTEGER - 2_000 + index,
      cssPath: 'img',
      sourceTag: 'img',
      metadata: { priority: PRIORITY.IMAGE_ALT, src: image.src },
    });
  });
  if (description) {
    candidates.push({
      text: normalizeText(description),
      type: 'META_DESCRIPTION',
      heading: null,
      position: Number.MAX_SAFE_INTEGER - 1_000,
      cssPath: 'meta[name="description"]',
      sourceTag: 'meta',
      metadata: { priority: PRIORITY.META_DESCRIPTION },
    });
  }

  const deduplicated = uniqueBy(candidates, (candidate) =>
    candidate.text.toLocaleLowerCase('ko-KR'),
  ).sort((a, b) => a.position - b.position);

  return deduplicated.map(
    (candidate, index): PageSection => ({
      id: `section-${index + 1}`,
      type: candidate.type,
      heading: candidate.heading,
      text: candidate.text,
      order: index,
      cssPath: candidate.cssPath,
      sourceTag: candidate.sourceTag,
      metadata: candidate.metadata,
    }),
  );
}

function isSemanticCandidate(element: HtmlElement) {
  if (/^h[1-3]$/.test(element.name)) return true;
  if (['p', 'blockquote', 'button'].includes(element.name)) return true;
  if (element.name === 'a') return isCtaElement(element);
  if (element.name === 'li') {
    return classifyContext(element) !== null;
  }
  return false;
}

function isCtaElement(element: HtmlElement) {
  const identity = `${element.attribs.class ?? ''} ${element.attribs.role ?? ''}`;
  return /cta|button|btn|signup|trial|구매|시작/i.test(identity);
}

function classifySectionType(element: HtmlElement): PageSectionType {
  if (element.name === 'button' || isCtaElement(element)) return 'CTA';
  const contextualType = classifyContext(element);
  if (contextualType) return contextualType;
  if (element.name === 'h1') return 'HERO';
  if (/^h[2-3]$/.test(element.name)) return 'HEADING';
  return 'PARAGRAPH';
}

function classifyContext(element: HtmlElement) {
  let current: HtmlElement | null = element;
  while (current) {
    const identity = [
      current.name,
      current.attribs.id,
      current.attribs.class,
      current.attribs['data-section'],
    ]
      .filter(Boolean)
      .join(' ');
    const match = CONTEXT_PATTERNS.find(([, pattern]) =>
      pattern.test(identity),
    );
    if (match) return match[0];
    current = isElement(current.parent) ? current.parent : null;
  }
  return null;
}

function findContextHeading(element: HtmlElement) {
  let current = isElement(element.parent) ? element.parent : null;
  while (current) {
    const heading = DomUtils.findOne(
      (candidate) => /^h[1-3]$/.test(candidate.name),
      current.children,
      true,
    );
    const text = getElementText(heading ?? undefined);
    if (text) return text;
    current = isElement(current.parent) ? current.parent : null;
  }
  return null;
}

function isElement(value: HtmlElement['parent']): value is HtmlElement {
  return Boolean(
    value &&
    (value.type === ElementType.Tag ||
      value.type === ElementType.Script ||
      value.type === ElementType.Style),
  );
}

function createCssPath(element: HtmlElement) {
  if (element.attribs.id) return `${element.name}#${element.attribs.id}`;
  const firstClass = element.attribs.class?.trim().split(/\s+/)[0];
  return firstClass ? `${element.name}.${firstClass}` : element.name;
}

function resolvePublicAssetUrl(value: string | undefined, baseUrl: string) {
  if (!value) return null;
  try {
    const url = new URL(value, baseUrl);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function selectPrioritySections(
  sections: PageSection[],
  maximumVisibleTextLength: number,
) {
  const selected = new Set<string>();
  let length = 0;
  for (const section of [...sections].sort(
    (a, b) =>
      Number(b.metadata.priority) - Number(a.metadata.priority) ||
      a.order - b.order,
  )) {
    const nextLength = length + section.text.length + 1;
    if (nextLength > maximumVisibleTextLength) continue;
    selected.add(section.id);
    length = nextLength;
  }
  return {
    sections: sections.filter((section) => selected.has(section.id)),
    truncatedByTextLimit: selected.size < sections.length,
  };
}

function uniqueText(values: string[]) {
  return uniqueBy(values.map(normalizeText).filter(Boolean), (value) =>
    value.toLocaleLowerCase('ko-KR'),
  );
}

function uniqueBy<T>(values: T[], key: (value: T) => string) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const identity = key(value);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}
