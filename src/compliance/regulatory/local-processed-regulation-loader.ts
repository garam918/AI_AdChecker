import processedGeneralAdvertisingCorpus from '@/data/regulations/processed/general-advertising.chunks.json';
import processedGeneralFoodCorpus from '@/data/regulations/processed/general-food.chunks.json';

import type { ProcessedRegulationLoader } from './ingestion';
import {
  ProcessedRegulationCorpusSchema,
  type CompliancePackId,
} from './schemas';

export class LocalProcessedRegulationLoader implements ProcessedRegulationLoader {
  constructor(
    private readonly packId: CompliancePackId = 'GENERAL_ADVERTISING',
  ) {}

  async load() {
    return ProcessedRegulationCorpusSchema.parse(
      this.packId === 'GENERAL_FOOD'
        ? processedGeneralFoodCorpus
        : processedGeneralAdvertisingCorpus,
    );
  }
}
