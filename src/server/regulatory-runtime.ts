import { RagComplianceAnalyzer } from '@/src/ai/rag-compliance-analyzer';
import { MockRagReasoningProvider } from '@/src/ai/providers/mock-rag-reasoning-provider';
import { ContentComplianceScanService } from '@/src/compliance/core/content-compliance-scan-service';
import { generalAdvertisingCompliancePack } from '@/src/compliance/packs/general-advertising/general-advertising-compliance-pack';
import { generalFoodCompliancePack } from '@/src/compliance/packs/general-food/general-food-compliance-pack';
import { GeneralFoodReasoningProvider } from '@/src/compliance/packs/general-food/reasoning-provider';
import { InMemoryRegulationRepository } from '@/src/compliance/regulatory/in-memory-regulation-repository';
import { LocalEnforcementCaseRepository } from '@/src/compliance/regulatory/local-enforcement-case-repository';
import { LocalProcessedRegulationLoader } from '@/src/compliance/regulatory/local-processed-regulation-loader';

export function createRagComplianceAnalyzer(options?: {
  includeDebug?: boolean;
}) {
  return new RagComplianceAnalyzer({
    corpusLoader: new LocalProcessedRegulationLoader(),
    repository: new InMemoryRegulationRepository(),
    reasoningProvider: new MockRagReasoningProvider(),
    pack: generalAdvertisingCompliancePack,
    includeDebug: options?.includeDebug ?? false,
  });
}

export function createGeneralFoodRagComplianceAnalyzer(options?: {
  includeDebug?: boolean;
}) {
  return new RagComplianceAnalyzer({
    corpusLoader: new LocalProcessedRegulationLoader('GENERAL_FOOD'),
    repository: new InMemoryRegulationRepository(),
    reasoningProvider: new GeneralFoodReasoningProvider(),
    pack: generalFoodCompliancePack,
    includeDebug: options?.includeDebug ?? false,
  });
}

export const regulatoryAnalyzer = createRagComplianceAnalyzer({
  includeDebug: process.env.NODE_ENV === 'development',
});

export const generalFoodRegulatoryAnalyzer =
  createGeneralFoodRagComplianceAnalyzer({
    includeDebug: process.env.NODE_ENV === 'development',
  });

export const contentComplianceScanService = new ContentComplianceScanService(
  [
    {
      pack: generalAdvertisingCompliancePack,
      analyzer: regulatoryAnalyzer,
    },
    {
      pack: generalFoodCompliancePack,
      analyzer: generalFoodRegulatoryAnalyzer,
    },
  ],
  new LocalEnforcementCaseRepository(),
);
