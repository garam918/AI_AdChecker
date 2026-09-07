import { z } from 'zod';

export const PageSectionTypeSchema = z.enum([
  'HERO',
  'HEADING',
  'PARAGRAPH',
  'CTA',
  'FEATURE',
  'PRICING',
  'TESTIMONIAL',
  'COMPARISON',
  'FAQ',
  'IMAGE_ALT',
  'META_DESCRIPTION',
]);

export const PageSectionSchema = z.object({
  id: z.string().min(1),
  type: PageSectionTypeSchema,
  heading: z.string().min(1).nullable(),
  text: z.string().min(1),
  order: z.number().int().nonnegative(),
  cssPath: z.string().min(1).optional(),
  sourceTag: z.string().min(1),
  metadata: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), z.null()]),
  ),
});

export const ExtractedWebContentSchema = z.object({
  url: z.url(),
  finalUrl: z.url(),
  title: z.string().min(1),
  description: z.string().nullable(),
  language: z.string().nullable(),
  headings: z.array(z.string()),
  paragraphs: z.array(z.string()),
  buttons: z.array(z.string()),
  links: z.array(
    z.object({
      text: z.string(),
      url: z.url(),
    }),
  ),
  images: z.array(
    z.object({
      alt: z.string(),
      src: z.url(),
    }),
  ),
  structuredData: z.array(z.unknown()),
  sections: z.array(PageSectionSchema),
  visibleText: z.string(),
  contentTruncated: z.boolean(),
  extractedAt: z.iso.datetime(),
  fixtureId: z.string().min(1).optional(),
});

export const DetectedContentTypeSchema = z.enum([
  'ADVERTISEMENT_TEXT',
  'LANDING_PAGE',
  'PRODUCT_DETAIL',
  'BLOG',
  'DOCUMENTATION',
  'UNKNOWN',
]);

export const DetectedCategorySchema = z.enum([
  'GENERAL_ADVERTISING',
  'GENERAL_FOOD',
  'HEALTH_FUNCTIONAL_FOOD',
  'PHARMACEUTICAL',
  'MEDICAL_DEVICE',
  'COSMETIC',
  'UNKNOWN',
]);

export type PageSectionType = z.infer<typeof PageSectionTypeSchema>;
export type PageSection = z.infer<typeof PageSectionSchema>;
export type ExtractedWebContent = z.infer<typeof ExtractedWebContentSchema>;
export type DetectedContentType = z.infer<typeof DetectedContentTypeSchema>;
export type DetectedCategory = z.infer<typeof DetectedCategorySchema>;
