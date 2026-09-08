import storedIndex from '@/data/regulations/processed/rag-index.json';
import type { ProcessedRegulationLoader } from './ingestion';
import {
  RegulationSearchIndexSchema,
  type RegulationSearchIndex,
} from './regulation-search-index';
import {
  ProcessedRegulationCorpusSchema,
  type CompliancePackId,
} from './schemas';

let validatedIndex: RegulationSearchIndex | undefined;

export function loadLocalRegulationIndex() {
  validatedIndex ??= RegulationSearchIndexSchema.parse(storedIndex);
  return validatedIndex;
}

export class LocalProcessedRegulationLoader implements ProcessedRegulationLoader {
  constructor(
    private readonly packId: CompliancePackId = 'GENERAL_ADVERTISING',
  ) {}

  async load() {
    const index = loadLocalRegulationIndex();
    const chunks = index.chunks.filter(
      (chunk) => chunk.metadata.pack === this.packId,
    );
    const documentIds = new Set(chunks.map((chunk) => chunk.documentId));
    return ProcessedRegulationCorpusSchema.parse({
      generatedFrom: 'data/regulations/processed/rag-index.json',
      schemaVersion: 1,
      documents: index.documents.filter((document) =>
        documentIds.has(document.id),
      ),
      chunks,
    });
  }
}
