import processedGeneralAdvertisingCorpus from '@/data/regulations/processed/general-advertising.chunks.json';

import type { ProcessedRegulationLoader } from './ingestion';
import { ProcessedRegulationCorpusSchema } from './schemas';

export class LocalProcessedRegulationLoader implements ProcessedRegulationLoader {
  async load() {
    return ProcessedRegulationCorpusSchema.parse(
      processedGeneralAdvertisingCorpus,
    );
  }
}
