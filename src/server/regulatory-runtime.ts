import { GeminiContentProvider } from '@/src/ai/providers/gemini-content-provider';
import type { ComplianceReasoningProvider } from '@/src/ai/providers/compliance-reasoning-provider';
import { RagComplianceAnalyzer } from '@/src/ai/rag-compliance-analyzer';
import { MockRagReasoningProvider } from '@/src/ai/providers/mock-rag-reasoning-provider';
import { ContentComplianceScanService } from '@/src/compliance/core/content-compliance-scan-service';
import { generalAdvertisingCompliancePack } from '@/src/compliance/packs/general-advertising/general-advertising-compliance-pack';
import { generalFoodCompliancePack } from '@/src/compliance/packs/general-food/general-food-compliance-pack';
import { GeneralFoodReasoningProvider } from '@/src/compliance/packs/general-food/reasoning-provider';
import { healthFunctionalFoodCompliancePack } from '@/src/compliance/packs/health-functional-food/health-functional-food-compliance-pack';
import { HealthFunctionalFoodReasoningProvider } from '@/src/compliance/packs/health-functional-food/reasoning-provider';
import { HealthFunctionalFoodAuthorizationResolver } from '@/src/compliance/product-authorization/health-functional-food-authorization';
import {
  CompositeProductAuthorizationResolver,
  MfdsRegulatedProductAuthorizationResolver,
} from '@/src/compliance/product-authorization/mfds-regulated-product-authorization';
import { pharmaceuticalCompliancePack } from '@/src/compliance/packs/pharmaceutical/pharmaceutical-compliance-pack';
import { medicalDeviceCompliancePack } from '@/src/compliance/packs/medical-device/medical-device-compliance-pack';
import { cosmeticCompliancePack } from '@/src/compliance/packs/cosmetic/cosmetic-compliance-pack';
import { RegulatedProductReasoningProvider } from '@/src/compliance/packs/regulated-product/reasoning-provider';
import { PHARMACEUTICAL_ANALYSIS_INSTRUCTIONS } from '@/src/compliance/packs/pharmaceutical/pharmaceutical-compliance-pack';
import { MEDICAL_DEVICE_ANALYSIS_INSTRUCTIONS } from '@/src/compliance/packs/medical-device/medical-device-compliance-pack';
import { COSMETIC_ANALYSIS_INSTRUCTIONS } from '@/src/compliance/packs/cosmetic/cosmetic-compliance-pack';
import { InMemoryRegulationRepository } from '@/src/compliance/regulatory/in-memory-regulation-repository';
import { LocalEnforcementCaseRepository } from '@/src/compliance/regulatory/local-enforcement-case-repository';
import {
  LocalProcessedRegulationLoader,
  loadLocalRegulationIndex,
} from '@/src/compliance/regulatory/local-processed-regulation-loader';
import {
  IndexedSemanticRegulationSearch,
  type SemanticRegulationSearch,
} from '@/src/compliance/regulatory/semantic-regulation-search';
import { createEmbeddingProviderFromEnv } from './rag-embedding-provider';

// Read runtime secrets only when handling a request; no network call during import/build.
const configuredSemanticSearch: SemanticRegulationSearch = {
  async search(query, candidates) {
    const provider = createEmbeddingProviderFromEnv();
    if (!provider) return [];
    return new IndexedSemanticRegulationSearch(
      loadLocalRegulationIndex(),
      provider,
    ).search(query, candidates);
  },
};

export function createRagComplianceAnalyzer(options?: {
  includeDebug?: boolean;
  reasoningProvider?: ComplianceReasoningProvider;
}) {
  return new RagComplianceAnalyzer({
    corpusLoader: new LocalProcessedRegulationLoader(),
    repository: new InMemoryRegulationRepository(),
    semanticSearch: configuredSemanticSearch,
    reasoningProvider:
      options?.reasoningProvider ?? new MockRagReasoningProvider(),
    pack: generalAdvertisingCompliancePack,
    includeDebug: options?.includeDebug ?? false,
  });
}

export function createGeneralFoodRagComplianceAnalyzer(options?: {
  includeDebug?: boolean;
  reasoningProvider?: ComplianceReasoningProvider;
}) {
  return new RagComplianceAnalyzer({
    corpusLoader: new LocalProcessedRegulationLoader('GENERAL_FOOD'),
    repository: new InMemoryRegulationRepository(),
    semanticSearch: configuredSemanticSearch,
    reasoningProvider:
      options?.reasoningProvider ?? new GeneralFoodReasoningProvider(),
    pack: generalFoodCompliancePack,
    includeDebug: options?.includeDebug ?? false,
  });
}

export function createHealthFunctionalFoodRagComplianceAnalyzer(options?: {
  includeDebug?: boolean;
  reasoningProvider?: ComplianceReasoningProvider;
}) {
  return new RagComplianceAnalyzer({
    corpusLoader: new LocalProcessedRegulationLoader('HEALTH_FUNCTIONAL_FOOD'),
    repository: new InMemoryRegulationRepository(),
    semanticSearch: configuredSemanticSearch,
    reasoningProvider:
      options?.reasoningProvider ?? new HealthFunctionalFoodReasoningProvider(),
    pack: healthFunctionalFoodCompliancePack,
    includeDebug: options?.includeDebug ?? false,
  });
}

export function createPharmaceuticalRagComplianceAnalyzer(options?: {
  includeDebug?: boolean;
  reasoningProvider?: ComplianceReasoningProvider;
}) {
  return new RagComplianceAnalyzer({
    corpusLoader: new LocalProcessedRegulationLoader('PHARMACEUTICAL'),
    repository: new InMemoryRegulationRepository(),
    semanticSearch: configuredSemanticSearch,
    reasoningProvider:
      options?.reasoningProvider ??
      new RegulatedProductReasoningProvider(
        'PHARMACEUTICAL',
        PHARMACEUTICAL_ANALYSIS_INSTRUCTIONS,
      ),
    pack: pharmaceuticalCompliancePack,
    includeDebug: options?.includeDebug ?? false,
  });
}

export function createMedicalDeviceRagComplianceAnalyzer(options?: {
  includeDebug?: boolean;
  reasoningProvider?: ComplianceReasoningProvider;
}) {
  return new RagComplianceAnalyzer({
    corpusLoader: new LocalProcessedRegulationLoader('MEDICAL_DEVICE'),
    repository: new InMemoryRegulationRepository(),
    semanticSearch: configuredSemanticSearch,
    reasoningProvider:
      options?.reasoningProvider ??
      new RegulatedProductReasoningProvider(
        'MEDICAL_DEVICE',
        MEDICAL_DEVICE_ANALYSIS_INSTRUCTIONS,
      ),
    pack: medicalDeviceCompliancePack,
    includeDebug: options?.includeDebug ?? false,
  });
}

export function createCosmeticRagComplianceAnalyzer(options?: {
  includeDebug?: boolean;
  reasoningProvider?: ComplianceReasoningProvider;
}) {
  return new RagComplianceAnalyzer({
    corpusLoader: new LocalProcessedRegulationLoader('COSMETIC'),
    repository: new InMemoryRegulationRepository(),
    semanticSearch: configuredSemanticSearch,
    reasoningProvider:
      options?.reasoningProvider ??
      new RegulatedProductReasoningProvider(
        'COSMETIC',
        COSMETIC_ANALYSIS_INSTRUCTIONS,
      ),
    pack: cosmeticCompliancePack,
    includeDebug: options?.includeDebug ?? false,
  });
}

// Pass no provider only for deterministic regression evaluations. Production always uses Gemini.
export function createContentComplianceScanService(
  provider?: GeminiContentProvider,
) {
  const regulatoryAnalyzer = createRagComplianceAnalyzer({
    includeDebug: process.env.NODE_ENV === 'development',
    reasoningProvider: provider?.reasoningProvider(
      new MockRagReasoningProvider(),
    ),
  });

  const generalFoodRegulatoryAnalyzer = createGeneralFoodRagComplianceAnalyzer({
    includeDebug: process.env.NODE_ENV === 'development',
    reasoningProvider: provider?.reasoningProvider(
      new GeneralFoodReasoningProvider(),
    ),
  });

  const healthFunctionalFoodRegulatoryAnalyzer =
    createHealthFunctionalFoodRagComplianceAnalyzer({
      includeDebug: process.env.NODE_ENV === 'development',
      reasoningProvider: provider?.reasoningProvider(
        new HealthFunctionalFoodReasoningProvider(),
      ),
    });

  const pharmaceuticalRegulatoryAnalyzer =
    createPharmaceuticalRagComplianceAnalyzer({
      includeDebug: process.env.NODE_ENV === 'development',
      reasoningProvider: provider?.reasoningProvider(
        new RegulatedProductReasoningProvider(
          'PHARMACEUTICAL',
          PHARMACEUTICAL_ANALYSIS_INSTRUCTIONS,
        ),
      ),
    });

  const medicalDeviceRegulatoryAnalyzer =
    createMedicalDeviceRagComplianceAnalyzer({
      includeDebug: process.env.NODE_ENV === 'development',
      reasoningProvider: provider?.reasoningProvider(
        new RegulatedProductReasoningProvider(
          'MEDICAL_DEVICE',
          MEDICAL_DEVICE_ANALYSIS_INSTRUCTIONS,
        ),
      ),
    });

  const cosmeticRegulatoryAnalyzer = createCosmeticRagComplianceAnalyzer({
    includeDebug: process.env.NODE_ENV === 'development',
    reasoningProvider: provider?.reasoningProvider(
      new RegulatedProductReasoningProvider(
        'COSMETIC',
        COSMETIC_ANALYSIS_INSTRUCTIONS,
      ),
    ),
  });

  return new ContentComplianceScanService(
    [
      {
        pack: generalAdvertisingCompliancePack,
        analyzer: regulatoryAnalyzer,
      },
      {
        pack: generalFoodCompliancePack,
        analyzer: generalFoodRegulatoryAnalyzer,
      },
      {
        pack: healthFunctionalFoodCompliancePack,
        analyzer: healthFunctionalFoodRegulatoryAnalyzer,
      },
      {
        pack: pharmaceuticalCompliancePack,
        analyzer: pharmaceuticalRegulatoryAnalyzer,
      },
      {
        pack: medicalDeviceCompliancePack,
        analyzer: medicalDeviceRegulatoryAnalyzer,
      },
      {
        pack: cosmeticCompliancePack,
        analyzer: cosmeticRegulatoryAnalyzer,
      },
    ],
    new LocalEnforcementCaseRepository(),
    new CompositeProductAuthorizationResolver(
      new HealthFunctionalFoodAuthorizationResolver(
        process.env.FOOD_SAFETY_KOREA_API_KEY,
      ),
      new MfdsRegulatedProductAuthorizationResolver(
        process.env.DATA_GO_KR_SERVICE_KEY,
        {
          PHARMACEUTICAL: process.env.MFDS_DRUG_PRODUCT_API_URL,
          MEDICAL_DEVICE: process.env.MFDS_MEDICAL_DEVICE_PRODUCT_API_URL,
          COSMETIC: process.env.MFDS_COSMETIC_PRODUCT_API_URL,
        },
      ),
    ),
    provider,
  );
}

export const geminiContentProvider = new GeminiContentProvider();
export const contentComplianceScanService = createContentComplianceScanService(
  geminiContentProvider,
);
