import processedGeneralAdvertisingCorpus from '@/data/regulations/processed/general-advertising.chunks.json';
import processedGeneralFoodCorpus from '@/data/regulations/processed/general-food.chunks.json';
import rawHealthFunctionalFoodCorpus from '@/data/regulations/raw/health-functional-food.official.json';
import rawPharmaceuticalCorpus from '@/data/regulations/raw/pharmaceutical.official.json';
import rawMedicalDeviceCorpus from '@/data/regulations/raw/medical-device.official.json';
import rawCosmeticCorpus from '@/data/regulations/raw/cosmetic.official.json';

import type { ProcessedRegulationLoader } from './ingestion';
import {
  ProcessedRegulationCorpusSchema,
  RawRegulationCorpusSchema,
  type CompliancePackId,
} from './schemas';
import { StructureAwareRegulationParser } from './structure-aware-regulation-parser';

export class LocalProcessedRegulationLoader implements ProcessedRegulationLoader {
  constructor(
    private readonly packId: CompliancePackId = 'GENERAL_ADVERTISING',
  ) {}

  async load() {
    const rawCorpus = rawCorpora[this.packId as keyof typeof rawCorpora];
    if (rawCorpus) {
      const parsed = new StructureAwareRegulationParser().parse(
        RawRegulationCorpusSchema.parse(rawCorpus),
      );
      return ProcessedRegulationCorpusSchema.parse({
        generatedFrom: `data/regulations/raw/${rawFileNames[this.packId as keyof typeof rawFileNames]}`,
        schemaVersion: 1,
        ...parsed,
      });
    }
    return ProcessedRegulationCorpusSchema.parse(
      this.packId === 'GENERAL_FOOD'
        ? processedGeneralFoodCorpus
        : processedGeneralAdvertisingCorpus,
    );
  }
}

const rawCorpora = {
  HEALTH_FUNCTIONAL_FOOD: rawHealthFunctionalFoodCorpus,
  PHARMACEUTICAL: rawPharmaceuticalCorpus,
  MEDICAL_DEVICE: rawMedicalDeviceCorpus,
  COSMETIC: rawCosmeticCorpus,
};

const rawFileNames = {
  HEALTH_FUNCTIONAL_FOOD: 'health-functional-food.official.json',
  PHARMACEUTICAL: 'pharmaceutical.official.json',
  MEDICAL_DEVICE: 'medical-device.official.json',
  COSMETIC: 'cosmetic.official.json',
};
