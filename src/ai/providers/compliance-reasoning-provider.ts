import { z } from 'zod';

import { ClaimSchema } from '@/src/compliance/core/schemas';
import { RegulationChunkSchema } from '@/src/compliance/regulatory/schemas';
import { ProductAuthorizationResolutionSchema } from '@/src/compliance/product-authorization/schemas';

export const ComplianceFindingSchema = z
  .object({
    claimId: z.string().min(1),
    disposition: z.enum(['ISSUE', 'PASS']).default('ISSUE'),
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'REVIEW_REQUIRED']),
    issueType: z.string().min(1),
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
    resolutionType: z
      .enum([
        'REMOVE_OR_REWRITE',
        'VERIFY_PRODUCT_CLASSIFICATION',
        'PROVIDE_EVIDENCE',
        'HUMAN_REVIEW',
      ])
      .default('HUMAN_REVIEW'),
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
  text: z.string().optional(),
  instructions: z.array(z.string().min(1)).min(1),
  productAuthorization: ProductAuthorizationResolutionSchema.optional(),
  items: z.array(
    z.object({
      claim: ClaimSchema,
      query: z.string().min(1),
      retrievedChunks: z.array(RegulationChunkSchema),
    }),
  ),
});

export type ComplianceFinding = z.input<typeof ComplianceFindingSchema>;
export type ComplianceReasoningInput = z.infer<
  typeof ComplianceReasoningInputSchema
>;

export interface ComplianceReasoningProvider {
  analyze(input: ComplianceReasoningInput): Promise<ComplianceFinding[]>;
}
