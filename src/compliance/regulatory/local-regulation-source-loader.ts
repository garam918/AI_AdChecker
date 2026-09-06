import rawGeneralAdvertisingCorpus from '@/data/regulations/raw/general-advertising.official.json';

import { RawRegulationCorpusSchema } from './schemas';
import type { RegulationSourceLoader } from './ingestion';

export class LocalRegulationSourceLoader implements RegulationSourceLoader {
  async load() {
    return RawRegulationCorpusSchema.parse(rawGeneralAdvertisingCorpus);
  }
}
