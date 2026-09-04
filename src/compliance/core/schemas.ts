import { z } from 'zod';

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

export const RegulationSourceSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  authority: z.string().min(1),
  provision: z.string().nullable(),
  text: z.string().min(1),
  sourceUrl: z.url().nullable(),
  isDemoData: z.boolean(),
});

export const ClaimSchema = z.object({
  id: z.string().min(1),
  scanId: z.string().min(1),
  text: z.string().min(1),
  claimType: z.enum(['OBJECTIVE_PERFORMANCE', 'SUPERIORITY']),
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().positive(),
});

export const IssueSchema = z.object({
  id: z.string().min(1),
  scanId: z.string().min(1),
  claimId: z.string().min(1),
  severity: SeveritySchema,
  category: z.enum(['EVIDENCE_REQUIRED', 'COMPARATIVE_CLAIM']),
  originalText: z.string().min(1),
  explanation: z.string().min(1),
  regulationSourceIds: z.array(z.string().min(1)).min(1),
  suggestedRewrites: z.array(z.string().min(1)).min(1),
  requiredEvidence: z.array(z.string().min(1)),
});

export const ScanSchema = z.object({
  id: z.string().min(1),
  inputType: z.literal('TEXT'),
  inputText: z.string().min(1),
  detectedContentType: z.literal('ADVERTISEMENT_TEXT'),
  detectedCategory: z.literal('GENERAL_ADVERTISING'),
  status: ScanStatusSchema,
  overallRisk: SeveritySchema,
  createdAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
});

export const ScanAnalysisResultSchema = z
  .object({
    detectedContentType: z.literal('ADVERTISEMENT_TEXT'),
    detectedCategory: z.literal('GENERAL_ADVERTISING'),
    overallRisk: SeveritySchema,
    claims: z.array(ClaimSchema),
    issues: z.array(IssueSchema),
    sources: z.array(RegulationSourceSchema),
  })
  .superRefine((result, context) => {
    const claimIds = new Set(result.claims.map((claim) => claim.id));
    const sourceIds = new Set(result.sources.map((source) => source.id));

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
    });
  });

export type Severity = z.infer<typeof SeveritySchema>;
export type Scan = z.infer<typeof ScanSchema>;
export type Claim = z.infer<typeof ClaimSchema>;
export type Issue = z.infer<typeof IssueSchema>;
export type RegulationSource = z.infer<typeof RegulationSourceSchema>;
export type ScanAnalysisResult = z.infer<typeof ScanAnalysisResultSchema>;
