import type { RegulationRepository } from './ingestion';
import type {
  CompliancePackId,
  RegulationChunk,
  RegulationDocument,
} from './schemas';

export type CitationAssertion = {
  chunkId: string;
  article: string | null;
};

export type CitationRejectionReason =
  | 'CHUNK_NOT_FOUND'
  | 'DOCUMENT_NOT_FOUND'
  | 'ARTICLE_MISMATCH'
  | 'CHUNK_NOT_RETRIEVED'
  | 'PACK_MISMATCH'
  | 'NOT_EFFECTIVE';

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
    scope?: {
      allowedChunkIds: ReadonlySet<string>;
      pack: CompliancePackId;
      effectiveAt: string;
    },
  ): Promise<CitationValidationResult> {
    const result: CitationValidationResult = { verified: [], rejected: [] };

    for (const assertion of assertions) {
      const chunk = await this.repository.findChunk(assertion.chunkId);
      if (!chunk) {
        result.rejected.push({ assertion, reason: 'CHUNK_NOT_FOUND' });
        continue;
      }

      if (scope && !scope.allowedChunkIds.has(chunk.id)) {
        result.rejected.push({ assertion, reason: 'CHUNK_NOT_RETRIEVED' });
        continue;
      }
      if (scope && chunk.metadata.pack !== scope.pack) {
        result.rejected.push({ assertion, reason: 'PACK_MISMATCH' });
        continue;
      }
      if (scope && chunk.metadata.effectiveDate > scope.effectiveAt) {
        result.rejected.push({ assertion, reason: 'NOT_EFFECTIVE' });
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

      if (!result.verified.some((item) => item.chunk.id === chunk.id)) {
        result.verified.push({ assertion, chunk, document });
      }
    }

    return result;
  }
}

function normalizeProvision(value: string | null) {
  return value?.replace(/\s+/g, '').trim() ?? null;
}
