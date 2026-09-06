import type {
  DetectedCategory,
  DetectedContentType,
  ExtractedWebContent,
} from './schemas';
import { detectGeneralFoodCategory } from '@/src/compliance/packs/general-food/category-detector';

const DOCUMENTATION_PATTERN =
  /documentation|developer|api reference|개발자 문서|사용 설명서/i;
const BLOG_PATTERN = /blog|article|게시일|작성일|뉴스룸/i;

export function classifyWebContent(content: ExtractedWebContent): {
  detectedContentType: DetectedContentType;
  detectedCategory: DetectedCategory;
} {
  const structuralTypes = content.structuredData.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const type = (entry as Record<string, unknown>)['@type'];
    if (typeof type === 'string') return [type];
    if (Array.isArray(type)) {
      return type.filter((value): value is string => typeof value === 'string');
    }
    return [];
  });
  const searchableText = [
    content.title,
    content.description,
    ...content.headings,
    content.visibleText.slice(0, 12_000),
  ]
    .filter(Boolean)
    .join(' ');

  let detectedContentType: DetectedContentType = 'UNKNOWN';
  if (structuralTypes.includes('SoftwareApplication')) {
    detectedContentType = 'LANDING_PAGE';
  } else if (
    structuralTypes.includes('Product') ||
    structuralTypes.includes('Offer') ||
    content.sections.some((section) => section.type === 'PRICING')
  ) {
    detectedContentType = 'PRODUCT_DETAIL';
  } else if (BLOG_PATTERN.test(searchableText)) {
    detectedContentType = 'BLOG';
  } else if (DOCUMENTATION_PATTERN.test(searchableText)) {
    detectedContentType = 'DOCUMENTATION';
  } else if (
    content.sections.some(
      (section) => section.type === 'HERO' || section.type === 'CTA',
    )
  ) {
    detectedContentType = 'LANDING_PAGE';
  }

  if (
    detectedContentType === 'BLOG' ||
    detectedContentType === 'DOCUMENTATION' ||
    detectedContentType === 'UNKNOWN'
  ) {
    return { detectedContentType, detectedCategory: 'UNKNOWN' };
  }

  const foodDetection = detectGeneralFoodCategory({
    text: searchableText,
    detectedContentType,
    webContent: content,
  });
  const detectedCategory: DetectedCategory =
    foodDetection.disposition === 'MATCH'
      ? 'GENERAL_FOOD'
      : foodDetection.disposition === 'UNCERTAIN'
        ? 'UNKNOWN'
        : 'GENERAL_ADVERTISING';

  return { detectedContentType, detectedCategory };
}
