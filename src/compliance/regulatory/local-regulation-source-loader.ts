import rawGeneralAdvertisingCorpus from '@/data/regulations/raw/general-advertising.official.json';
import rawGeneralFoodCorpus from '@/data/regulations/raw/general-food.official.json';
import rawHealthFunctionalFoodCorpus from '@/data/regulations/raw/health-functional-food.official.json';
import rawPharmaceuticalCorpus from '@/data/regulations/raw/pharmaceutical.official.json';
import rawMedicalDeviceCorpus from '@/data/regulations/raw/medical-device.official.json';
import rawCosmeticCorpus from '@/data/regulations/raw/cosmetic.official.json';

import { RawRegulationCorpusSchema } from './schemas';
import type { CompliancePackId } from './schemas';
import type { RegulationSourceLoader } from './ingestion';

export class LocalRegulationSourceLoader implements RegulationSourceLoader {
  constructor(
    private readonly packId: CompliancePackId = 'GENERAL_ADVERTISING',
  ) {}

  async load() {
    const rawCorpus = rawCorpora[this.packId as keyof typeof rawCorpora];
    if (rawCorpus) return RawRegulationCorpusSchema.parse(rawCorpus);
    return RawRegulationCorpusSchema.parse(
      this.packId === 'GENERAL_FOOD'
        ? rawGeneralFoodCorpus
        : rawGeneralAdvertisingCorpus,
    );
  }
}

const rawCorpora = {
  HEALTH_FUNCTIONAL_FOOD: rawHealthFunctionalFoodCorpus,
  PHARMACEUTICAL: rawPharmaceuticalCorpus,
  MEDICAL_DEVICE: rawMedicalDeviceCorpus,
  COSMETIC: rawCosmeticCorpus,
};
