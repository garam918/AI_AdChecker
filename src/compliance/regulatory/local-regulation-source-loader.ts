import rawGeneralAdvertisingCorpus from '@/data/regulations/raw/general-advertising.official.json';
import rawGeneralFoodCorpus from '@/data/regulations/raw/general-food.official.json';

import { RawRegulationCorpusSchema } from './schemas';
import type { CompliancePackId } from './schemas';
import type { RegulationSourceLoader } from './ingestion';

export class LocalRegulationSourceLoader implements RegulationSourceLoader {
  constructor(
    private readonly packId: CompliancePackId = 'GENERAL_ADVERTISING',
  ) {}

  async load() {
    return RawRegulationCorpusSchema.parse(
      this.packId === 'GENERAL_FOOD'
        ? rawGeneralFoodCorpus
        : rawGeneralAdvertisingCorpus,
    );
  }
}
