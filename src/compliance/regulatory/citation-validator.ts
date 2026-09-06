import type { RegulationRepository } from './ingestion';
import type { RegulationChunk, RegulationDocument } from './schemas';

export type CitationAssertion = {
  chunkId: string;
  article: string | null;
};

export type CitationRejectionReason =
  | 'CHUNK_NOT_FOUND'
  | 'DOCUMENT_NOT_FOUND'
  | 'ARTICLE_MISMATCH';

export type CitationValidationResult = {
  verified: Array<{
    assertion: CitationAssertion;
    chunk: RegulationChunk;
    document: RegulationDocument;
  }>;
  rejected: Array<{
    assertion: CitationAssertion;
    reason: CitationRejectionReason;
  }>;
};

export class CitationValidator {
  constructor(private readonly repository: RegulationRepository) {}

  async validate(
    assertions: CitationAssertion[],
  ): Promise<CitationValidationResult> {
    const result: CitationValidationResult = { verified: [], rejected: [] };

    for (const assertion of assertions) {
      const chunk = await this.repository.findChunk(assertion.chunkId);
      if (!chunk) {
        result.rejected.push({ assertion, reason: 'CHUNK_NOT_FOUND' });
        continue;
      }

      const document = await this.repository.findDocument(chunk.documentId);
      if (!document) {
        result.rejected.push({ assertion, reason: 'DOCUMENT_NOT_FOUND' });
        continue;
      }

      if (
        normalizeProvision(assertion.article) !==
        normalizeProvision(chunk.article)
      ) {
        result.rejected.push({ assertion, reason: 'ARTICLE_MISMATCH' });
        continue;
      }

      result.verified.push({ assertion, chunk, document });
    }

    return result;
  }
}

function normalizeProvision(value: string | null) {
  return value?.replace(/\s+/g, '').trim() ?? null;
}
