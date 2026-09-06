import { z } from 'zod';

import {
  DetectedCategorySchema,
  DetectedContentTypeSchema,
  ExtractedWebContentSchema,
} from '@/src/content/web/schemas';

import { RegulationSourceTypeSchema } from '../regulatory/schemas';

export const SeveritySchema = z.enum([
  'LOW',
  'MEDIUM',
  'HIGH',
  'REVIEW_REQUIRED',
]);

export const ScanStatusSchema = z.enum([
  'PENDING',
  'ANALYZING',
  'COMPLETED',
  'FAILED',
]);

export const CitationStatusSchema = z.enum(['VERIFIED', 'REVIEW_REQUIRED']);
export const ClaimImportanceSchema = z.enum(['LOW', 'MEDIUM', 'HIGH']);
export const ClaimSignalSchema = z.enum([
  'NUMERICAL',
  'PERCENTAGE',
  'MULTIPLIER',
  'SUPERLATIVE',
  'FREE',
  'GUARANTEE',
  'SOCIAL_PROOF',
  'TESTIMONIAL',
]);

export const RegulationSourceSchema = z.object({
  id: z.string().min(1),
  documentId: z.string().min(1).nullable().default(null),
  chunkId: z.string().min(1).nullable().default(null),
  title: z.string().min(1),
  shortTitle: z.string().min(1).nullable().default(null),
  authority: z.string().min(1),
  sourceType: RegulationSourceTypeSchema.nullable().default(null),
  effectiveDate: z.iso.date().nullable().default(null),
  article: z.string().min(1).nullable().default(null),
  paragraph: z.string().min(1).nullable().default(null),
  section: z.string().min(1).nullable().default(null),
  heading: z.string().min(1).nullable().default(null),
  provision: z.string().nullable(),
  text: z.string().min(1),
  sourceUrl: z.url().nullable(),
  citationStatus: CitationStatusSchema.default('REVIEW_REQUIRED'),
  isDemoData: z.boolean(),
});

export const ClaimSchema = z.object({
  id: z.string().min(1),
  scanId: z.string().min(1),
  text: z.string().min(1),
  claimType: z.enum([
    'OBJECTIVE_PERFORMANCE',
    'SUPERIORITY',
    'COMPARATIVE',
    'PRICE_CONDITION',
    'NUMERICAL',
    'GUARANTEE',
    'FREE',
    'TESTIMONIAL',
    'GENERAL_MARKETING',
    'UNKNOWN',
  ]),
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().positive(),
  sourceSectionId: z.string().min(1).nullable().optional(),
  importance: ClaimImportanceSchema.optional(),
  signals: z.array(ClaimSignalSchema).optional(),
});

export const IssueSchema = z.object({
  id: z.string().min(1),
  scanId: z.string().min(1),
  claimId: z.string().min(1),
  severity: SeveritySchema,
  category: z.enum([
    'EVIDENCE_REQUIRED',
    'COMPARATIVE_CLAIM',
    'CONDITION_DISCLOSURE',
  ]),
  originalText: z.string().min(1),
  explanation: z.string().min(1),
  regulationSourceIds: z.array(z.string().min(1)),
  sourceChunkIds: z.array(z.string().min(1)).default([]),
  citationStatus: CitationStatusSchema.default('REVIEW_REQUIRED'),
  uncertaintyReason: z.string().min(1).nullable().default(null),
  suggestedRewrites: z.array(z.string().min(1)).min(1),
  requiredEvidence: z.array(z.string().min(1)),
});

export const AnalysisDebugSchema = z.object({
  queries: z.array(
    z.object({
      claimId: z.string(),
      query: z.string(),
    }),
  ),
  retrieved: z.array(
    z.object({
      claimId: z.string(),
      chunkId: z.string(),
      score: z.number(),
    }),
  ),
  selectedSourceChunkIds: z.array(z.string()),
  rejectedCitations: z.array(
    z.object({
      claimId: z.string(),
      chunkId: z.string(),
      reason: z.string(),
    }),
  ),
});

export const ScanSchema = z.object({
  id: z.string().min(1),
  inputType: z.enum(['TEXT', 'URL']),
  inputText: z.string().min(1).nullable(),
  inputUrl: z.url().nullable(),
  detectedContentType: DetectedContentTypeSchema,
  detectedCategory: DetectedCategorySchema,
  status: ScanStatusSchema,
  overallRisk: SeveritySchema,
  createdAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
});

export const ScanAnalysisResultSchema = z
  .object({
    inputType: z.enum(['TEXT', 'URL']).default('TEXT'),
    detectedContentType: DetectedContentTypeSchema,
    detectedCategory: DetectedCategorySchema,
    overallRisk: SeveritySchema,
    claims: z.array(ClaimSchema),
    issues: z.array(IssueSchema),
    sources: z.array(RegulationSourceSchema),
    webContent: ExtractedWebContentSchema.optional(),
    notices: z
      .array(
        z.object({
          code: z.enum([
            'CONTENT_TRUNCATED',
            'GENERAL_FOOD_PACK_DISABLED',
            'UNKNOWN_CATEGORY',
          ]),
          message: z.string().min(1),
        }),
      )
      .default([]),
    debug: AnalysisDebugSchema.optional(),
  })
  .superRefine((result, context) => {
    const claimIds = new Set(result.claims.map((claim) => claim.id));
    const sourceIds = new Set(result.sources.map((source) => source.id));

    if (result.inputType === 'URL' && !result.webContent) {
      context.addIssue({
        code: 'custom',
        message: 'URL analysis must include extracted web content.',
        path: ['webContent'],
      });
    }

    result.issues.forEach((issue, issueIndex) => {
      if (!claimIds.has(issue.claimId)) {
        context.addIssue({
          code: 'custom',
          message: 'Issue must reference an existing claim.',
          path: ['issues', issueIndex, 'claimId'],
        });
      }

      issue.regulationSourceIds.forEach((sourceId, sourceIndex) => {
        if (!sourceIds.has(sourceId)) {
          context.addIssue({
            code: 'custom',
            message: 'Issue must reference a validated regulation source.',
            path: ['issues', issueIndex, 'regulationSourceIds', sourceIndex],
          });
        }
      });

      issue.sourceChunkIds.forEach((sourceId, sourceIndex) => {
        if (!sourceIds.has(sourceId)) {
          context.addIssue({
            code: 'custom',
            message: 'Issue must reference a resolved regulation chunk.',
            path: ['issues', issueIndex, 'sourceChunkIds', sourceIndex],
          });
        }
      });
    });
  });

export type Severity = z.infer<typeof SeveritySchema>;
export type CitationStatus = z.infer<typeof CitationStatusSchema>;
export type ClaimImportance = z.infer<typeof ClaimImportanceSchema>;
export type ClaimSignal = z.infer<typeof ClaimSignalSchema>;
export type Scan = z.infer<typeof ScanSchema>;
export type Claim = z.infer<typeof ClaimSchema>;
export type Issue = z.infer<typeof IssueSchema>;
export type RegulationSource = z.infer<typeof RegulationSourceSchema>;
export type ScanAnalysisResult = z.infer<typeof ScanAnalysisResultSchema>;
