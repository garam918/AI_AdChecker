import { RagComplianceAnalyzer } from '@/src/ai/rag-compliance-analyzer';
import { MockRagReasoningProvider } from '@/src/ai/providers/mock-rag-reasoning-provider';
import { InMemoryRegulationRepository } from '@/src/compliance/regulatory/in-memory-regulation-repository';
import { LocalProcessedRegulationLoader } from '@/src/compliance/regulatory/local-processed-regulation-loader';

export function createRagComplianceAnalyzer(options?: {
  includeDebug?: boolean;
}) {
  return new RagComplianceAnalyzer({
    corpusLoader: new LocalProcessedRegulationLoader(),
    repository: new InMemoryRegulationRepository(),
    reasoningProvider: new MockRagReasoningProvider(),
    includeDebug: options?.includeDebug ?? false,
  });
}

export const regulatoryAnalyzer = createRagComplianceAnalyzer({
  includeDebug: process.env.NODE_ENV === 'development',
});
