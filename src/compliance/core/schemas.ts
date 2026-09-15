import { z } from 'zod';

import {
  DetectedCategorySchema,
  DetectedContentTypeSchema,
  ExtractedWebContentSchema,
} from '@/src/content/web/schemas';
import { EnforcementCaseSchema } from '@/src/compliance/regulatory/enforcement-case-schemas';
import { ProductAuthorizationResolutionSchema } from '@/src/compliance/product-authorization/schemas';

import {
  CompliancePackIdSchema,
  RegulationSourceTypeSchema,
} from '../regulatory/schemas';

export const SeveritySchema = z.enum([
  'LOW',
  'MEDIUM',
  'HIGH',
  'REVIEW_REQUIRED',
]);

export const AnalysisAudienceSchema = z.enum(['CONSUMER', 'BUSINESS']);

export const ScanStatusSchema = z.enum([
  'PENDING',
  'ANALYZING',
  'COMPLETED',
  'FAILED',
]);

export const CitationStatusSchema = z.enum(['VERIFIED', 'REVIEW_REQUIRED']);
export const ClaimImportanceSchema = z.enum(['LOW', 'MEDIUM', 'HIGH']);
export const ClaimSignalSchema = z.string().min(1);
export const ClaimContextRoleSchema = z.enum([
  'ADVERTISING',
  'TESTIMONIAL',
  'WARNING',
  'NUTRITION_INFORMATION',
  'UNKNOWN',
]);
export const ResolutionTypeSchema = z.enum([
  'REMOVE_OR_REWRITE',
  'VERIFY_PRODUCT_CLASSIFICATION',
  'PROVIDE_EVIDENCE',
  'HUMAN_REVIEW',
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
  claimType: z.string().min(1),
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().positive(),
  sourceSectionId: z.string().min(1).nullable().optional(),
  importance: ClaimImportanceSchema.optional(),
  signals: z.array(ClaimSignalSchema).optional(),
  contextText: z.string().min(1).nullable().optional(),
  contextRole: ClaimContextRoleSchema.optional(),
});

export const RewriteOptionSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['REMOVE', 'REPLACE', 'CONDITIONAL', 'MANUAL_REVIEW']),
  text: z.string(),
  label: z.string().min(1),
  explanation: z.string().min(1),
});
export type RewriteOption = z.infer<typeof RewriteOptionSchema>;

export const IssueSchema = z.object({
  id: z.string().min(1),
  scanId: z.string().min(1),
  claimId: z.string().min(1),
  packId: CompliancePackIdSchema.default('GENERAL_ADVERTISING'),
  severity: SeveritySchema,
  category: z.string().min(1),
  originalText: z.string().min(1),
  explanation: z.string().min(1),
  regulationSourceIds: z.array(z.string().min(1)),
  sourceChunkIds: z.array(z.string().min(1)).default([]),
  citationStatus: CitationStatusSchema.default('REVIEW_REQUIRED'),
  uncertaintyReason: z.string().min(1).nullable().default(null),
  suggestedRewrites: z.array(z.string().min(1)).min(1),
  rewriteOptions: z.array(RewriteOptionSchema).optional(),
  requiredEvidence: z.array(z.string().min(1)),
  resolutionType: ResolutionTypeSchema.default('HUMAN_REVIEW'),
  similarEnforcementCaseIds: z.array(z.string().min(1)).default([]),
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

export const AnalysisAttemptSchema = z.object({
  provider: z.enum(['vertex', 'openai']),
  model: z.string().min(1),
  elapsedMs: z.number().nonnegative(),
  outcome: z.enum(['success', 'error']),
  code: z.string().optional(),
});

export const AnalysisMetricsSchema = z.object({
  elapsedMs: z.number().nonnegative(),
  mode: z.enum(['live', 'offline']),
  attempts: z.array(AnalysisAttemptSchema),
  fallbackConfigured: z.boolean().optional(),
  aiBudgetMs: z.number().positive().optional(),
});

export const ScanSchema = z.object({
  id: z.string().min(1),
  inputType: z.enum(['TEXT', 'URL', 'IMAGE']),
  audience: AnalysisAudienceSchema.default('CONSUMER'),
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
    inputType: z.enum(['TEXT', 'URL', 'IMAGE']).default('TEXT'),
    analysisModel: z.string().min(1).optional(),
    // `offline` identifies the final rule-based risk analysis. Earlier steps
    // (e.g. image extraction) may still have succeeded with AI; inspect attempts.
    metrics: AnalysisMetricsSchema.optional(),
    // Issue ids the user should read first, in display order (at most 3).
    keyIssueIds: z.array(z.string().min(1)).default([]),
    imageContent: z
      .object({
        fileName: z.string(),
        mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
        extractedText: z.string(),
        visualObservations: z.array(z.string()),
        analysisText: z.string(),
        incomplete: z.boolean(),
      })
      .optional(),
    audience: AnalysisAudienceSchema.default('CONSUMER'),
    detectedContentType: DetectedContentTypeSchema,
    detectedCategory: DetectedCategorySchema,
    overallRisk: SeveritySchema,
    claims: z.array(ClaimSchema),
    issues: z.array(IssueSchema),
    sources: z.array(RegulationSourceSchema),
    enforcementCases: z.array(EnforcementCaseSchema).default([]),
    activePacks: z.array(CompliancePackIdSchema).default([]),
    productAuthorization: ProductAuthorizationResolutionSchema.optional(),
    webContent: ExtractedWebContentSchema.optional(),
    notices: z
      .array(
        z.object({
          code: z.enum([
            'CONTENT_TRUNCATED',
            'AI_REVIEW_REQUIRED',
            'AI_UNAVAILABLE_RULES_ONLY',
            'IMAGE_EXTRACTION_LIMITS',
            'UNKNOWN_CATEGORY',
            'PRODUCT_AUTHORIZATION_REQUIRED',
            'PRODUCT_AUTHORIZATION_NOT_FOUND',
            'PRODUCT_AUTHORIZATION_AMBIGUOUS',
            'PRODUCT_AUTHORIZATION_UNAVAILABLE',
            'PRIOR_REVIEW_REQUIRED',
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
    const enforcementCaseIds = new Set(
      result.enforcementCases.map((enforcementCase) => enforcementCase.id),
    );

    if (result.inputType === 'URL' && !result.webContent) {
      context.addIssue({
        code: 'custom',
        message: 'URL analysis must include extracted web content.',
        path: ['webContent'],
      });
    }
    if (result.inputType === 'IMAGE' && !result.imageContent) {
      context.addIssue({
        code: 'custom',
        message: 'Image analysis must include extraction metadata.',
        path: ['imageContent'],
      });
    }

    const issueIds = new Set(result.issues.map((issue) => issue.id));
    result.keyIssueIds.forEach((issueId, index) => {
      if (!issueIds.has(issueId)) {
        context.addIssue({
          code: 'custom',
          message: 'Key issue must reference an existing issue.',
          path: ['keyIssueIds', index],
        });
      }
    });

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
      issue.similarEnforcementCaseIds.forEach((caseId, caseIndex) => {
        if (!enforcementCaseIds.has(caseId)) {
          context.addIssue({
            code: 'custom',
            message: 'Issue must reference a resolved enforcement case.',
            path: [
              'issues',
              issueIndex,
              'similarEnforcementCaseIds',
              caseIndex,
            ],
          });
        }
      });
    });
  });

export type Severity = z.infer<typeof SeveritySchema>;
export type AnalysisAudience = z.infer<typeof AnalysisAudienceSchema>;
export type CitationStatus = z.infer<typeof CitationStatusSchema>;
export type ClaimImportance = z.infer<typeof ClaimImportanceSchema>;
export type ClaimSignal = z.infer<typeof ClaimSignalSchema>;
export type ClaimContextRole = z.infer<typeof ClaimContextRoleSchema>;
export type ResolutionType = z.infer<typeof ResolutionTypeSchema>;
export type Scan = z.infer<typeof ScanSchema>;
export type AnalysisAttempt = z.infer<typeof AnalysisAttemptSchema>;
export type AnalysisMetrics = z.infer<typeof AnalysisMetricsSchema>;
export type Claim = z.infer<typeof ClaimSchema>;
export type Issue = z.infer<typeof IssueSchema>;
export type RegulationSource = z.infer<typeof RegulationSourceSchema>;
export type ScanAnalysisResult = z.infer<typeof ScanAnalysisResultSchema>;
