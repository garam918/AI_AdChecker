import { z } from 'zod';

import { CompliancePackIdSchema } from './schemas';

export const EnforcementCaseSchema = z.object({
  id: z.string().min(1),
  pack: CompliancePackIdSchema,
  authority: z.string().min(1),
  publishedAt: z.iso.date(),
  category: z.string().min(1),
  problematicExpression: z.string().min(1),
  issueType: z.string().min(1),
  description: z.string().min(1),
  sourceUrl: z.url(),
});

export const EnforcementCaseCorpusSchema = z.object({
  pack: CompliancePackIdSchema,
  cases: z.array(EnforcementCaseSchema),
});

export type EnforcementCase = z.infer<typeof EnforcementCaseSchema>;
