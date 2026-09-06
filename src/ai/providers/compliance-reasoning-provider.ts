import { z } from 'zod';

import { ClaimSchema } from '@/src/compliance/core/schemas';
import { RegulationChunkSchema } from '@/src/compliance/regulatory/schemas';

export const ComplianceFindingSchema = z
  .object({
    claimId: z.string().min(1),
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'REVIEW_REQUIRED']),
    issueType: z.enum([
      'EVIDENCE_REQUIRED',
      'COMPARATIVE_CLAIM',
      'CONDITION_DISCLOSURE',
    ]),
    explanation: z.string().min(1),
    sourceChunkIds: z.array(z.string().min(1)),
    citationAssertions: z.array(
      z.object({
        chunkId: z.string().min(1),
        article: z.string().min(1).nullable(),
      }),
    ),
    requiredEvidence: z.array(z.string().min(1)),
    suggestedRewrites: z.array(z.string().min(1)).min(1),
    uncertaintyReason: z.string().min(1).optional(),
  })
  .superRefine((finding, context) => {
    const assertionIds = new Set(
      finding.citationAssertions.map((assertion) => assertion.chunkId),
    );
    finding.sourceChunkIds.forEach((chunkId, index) => {
      if (!assertionIds.has(chunkId)) {
        context.addIssue({
          code: 'custom',
          message: 'Every source chunk must have a citation assertion.',
          path: ['sourceChunkIds', index],
        });
      }
    });
    finding.citationAssertions.forEach((assertion, index) => {
      if (!finding.sourceChunkIds.includes(assertion.chunkId)) {
        context.addIssue({
          code: 'custom',
          message: 'Citation assertions must reference declared source chunks.',
          path: ['citationAssertions', index, 'chunkId'],
        });
      }
    });
  });

export const ComplianceReasoningInputSchema = z.object({
  instructions: z.array(z.string().min(1)).min(1),
  items: z.array(
    z.object({
      claim: ClaimSchema,
      query: z.string().min(1),
      retrievedChunks: z.array(RegulationChunkSchema),
    }),
  ),
});

export type ComplianceFinding = z.infer<typeof ComplianceFindingSchema>;
export type ComplianceReasoningInput = z.infer<
  typeof ComplianceReasoningInputSchema
>;

export interface ComplianceReasoningProvider {
  analyze(input: ComplianceReasoningInput): Promise<ComplianceFinding[]>;
}
