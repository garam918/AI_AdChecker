import { z } from 'zod';

export const RegulationSourceTypeSchema = z.enum([
  'LAW',
  'ENFORCEMENT_DECREE',
  'ENFORCEMENT_RULE',
  'ADMINISTRATIVE_RULE',
  'OFFICIAL_GUIDELINE',
  'OFFICIAL_CASE',
]);

export const CompliancePackIdSchema = z.enum([
  'GENERAL_ADVERTISING',
  'GENERAL_FOOD',
  'HEALTH_FUNCTIONAL_FOOD',
  'PHARMACEUTICAL',
  'MEDICAL_DEVICE',
  'COSMETIC',
]);

export const RegulationDocumentSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  shortTitle: z.string().min(1),
  authority: z.string().min(1),
  sourceType: RegulationSourceTypeSchema,
  sourceUrl: z.url(),
  effectiveDate: z.iso.date(),
  version: z.string().min(1),
  retrievedAt: z.iso.datetime({ offset: true }),
});

export const RawRegulationSectionSchema = z.object({
  id: z.string().min(1),
  article: z.string().nullable(),
  paragraph: z.string().nullable(),
  section: z.string().nullable(),
  heading: z.string().min(1),
  text: z.string().min(1),
  metadata: z
    .object({
      topics: z.array(z.string().min(1)).min(1),
    })
    .loose(),
});

export const RawRegulationDocumentSchema = RegulationDocumentSchema.extend({
  pack: CompliancePackIdSchema,
  sections: z.array(RawRegulationSectionSchema).min(1),
});

export const RawRegulationCorpusSchema = z.object({
  pack: CompliancePackIdSchema,
  documents: z.array(RawRegulationDocumentSchema).min(1),
});

export const RegulationChunkMetadataSchema = z
  .object({
    pack: CompliancePackIdSchema,
    documentTitle: z.string().min(1),
    shortTitle: z.string().min(1),
    authority: z.string().min(1),
    sourceType: RegulationSourceTypeSchema,
    effectiveDate: z.iso.date(),
    topics: z.array(z.string().min(1)).min(1),
  })
  .loose();

export const RegulationChunkSchema = z.object({
  id: z.string().min(1),
  documentId: z.string().min(1),
  article: z.string().nullable(),
  paragraph: z.string().nullable(),
  section: z.string().nullable(),
  heading: z.string().min(1),
  text: z.string().min(1),
  normalizedText: z.string().min(1),
  sourceUrl: z.url(),
  metadata: RegulationChunkMetadataSchema,
});

export const RetrievalOptionsSchema = z.object({
  pack: CompliancePackIdSchema,
  maxResults: z.number().int().positive().max(20).default(5),
  sourceTypes: z.array(RegulationSourceTypeSchema).optional(),
  effectiveAt: z.iso.date().optional(),
  minimumScore: z.number().min(0).max(1).default(0.08),
});

export const RetrievalHitSchema = z.object({
  chunk: RegulationChunkSchema,
  score: z.number().min(0).max(1),
  matchedTerms: z.array(z.string()),
});

export const ProcessedRegulationCorpusSchema = z.object({
  generatedFrom: z.string().min(1),
  schemaVersion: z.literal(1),
  documents: z.array(RegulationDocumentSchema).min(1),
  chunks: z.array(RegulationChunkSchema).min(1),
});

export type RegulationSourceType = z.infer<typeof RegulationSourceTypeSchema>;
export type CompliancePackId = z.infer<typeof CompliancePackIdSchema>;
export type RegulationDocument = z.infer<typeof RegulationDocumentSchema>;
export type RawRegulationDocument = z.infer<typeof RawRegulationDocumentSchema>;
export type RawRegulationCorpus = z.infer<typeof RawRegulationCorpusSchema>;
export type RegulationChunk = z.infer<typeof RegulationChunkSchema>;
export type RetrievalOptions = z.input<typeof RetrievalOptionsSchema>;
export type RetrievalHit = z.infer<typeof RetrievalHitSchema>;
export type ProcessedRegulationCorpus = z.infer<
  typeof ProcessedRegulationCorpusSchema
>;
