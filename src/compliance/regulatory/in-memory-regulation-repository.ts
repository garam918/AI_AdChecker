import type { RegulationRepository } from './ingestion';
import {
  RetrievalOptionsSchema,
  type RegulationChunk,
  type RegulationDocument,
  type RetrievalOptions,
} from './schemas';

export class InMemoryRegulationRepository implements RegulationRepository {
  private readonly documents = new Map<string, RegulationDocument>();
  private readonly chunks = new Map<string, RegulationChunk>();

  async saveDocuments(documents: RegulationDocument[]) {
    documents.forEach((document) => this.documents.set(document.id, document));
  }

  async saveChunks(chunks: RegulationChunk[]) {
    chunks.forEach((chunk) => this.chunks.set(chunk.id, chunk));
  }

  async findDocument(id: string) {
    return this.documents.get(id) ?? null;
  }

  async findChunk(id: string) {
    return this.chunks.get(id) ?? null;
  }

  async findRelevantChunks(query: string, options: RetrievalOptions) {
    const parsedOptions = RetrievalOptionsSchema.parse(options);
    const normalizedQuery = query.normalize('NFKC').toLowerCase();

    return [...this.chunks.values()].filter((chunk) => {
      if (chunk.metadata.pack !== parsedOptions.pack) return false;
      if (
        parsedOptions.sourceTypes &&
        !parsedOptions.sourceTypes.includes(chunk.metadata.sourceType)
      ) {
        return false;
      }
      if (
        parsedOptions.effectiveAt &&
        chunk.metadata.effectiveDate > parsedOptions.effectiveAt
      ) {
        return false;
      }
      return normalizedQuery.length === 0 || chunk.normalizedText.length > 0;
    });
  }
}
