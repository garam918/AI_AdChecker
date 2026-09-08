import {
  sameEmbeddingIdentity,
  validateVectors,
  type EmbeddingProvider,
} from './embedding-provider';
import {
  chunkContentHash,
  RegulationSearchIndexSchema,
  type RegulationSearchIndex,
} from './regulation-search-index';
import type { RegulationChunk } from './schemas';

export interface SemanticRegulationSearch {
  search(
    query: string,
    candidates: RegulationChunk[],
  ): Promise<Array<{ chunk: RegulationChunk; score: number }>>;
}

export class IndexedSemanticRegulationSearch implements SemanticRegulationSearch {
  private readonly index: RegulationSearchIndex;
  private readonly entries: Map<
    string,
    RegulationSearchIndex['entries'][number]
  >;

  constructor(
    index: RegulationSearchIndex,
    private readonly provider: EmbeddingProvider,
  ) {
    this.index = RegulationSearchIndexSchema.parse(index);
    if (
      !this.index.embedding ||
      !sameEmbeddingIdentity(this.index.embedding, provider.identity)
    ) {
      throw new Error(
        '임베딩 모델과 법령 인덱스가 일치하지 않습니다. 동일한 설정으로 npm run rag:index -- --embed를 실행해 주세요.',
      );
    }
    this.entries = new Map(
      this.index.entries.map((entry) => [entry.chunkId, entry]),
    );
  }

  async search(query: string, candidates: RegulationChunk[]) {
    if (!query.trim() || !candidates.length) return [];
    const entries = await Promise.all(
      candidates.map(async (chunk) => {
        const entry = this.entries.get(chunk.id);
        if (
          !entry?.embedding ||
          entry.contentHash !== (await chunkContentHash(chunk))
        ) {
          throw new Error(
            '법령 본문과 벡터 인덱스가 일치하지 않습니다. 인덱스를 재생성해 주세요.',
          );
        }
        return { chunk, vector: entry.embedding };
      }),
    );
    const [queryVector] = validateVectors(
      await this.provider.embed([query]),
      1,
      this.provider.identity.dimensions,
    );
    return entries
      .map(({ chunk, vector }) => ({
        chunk,
        score: cosineSimilarity(queryVector, vector),
      }))
      .filter((hit) => hit.score > 0)
      .sort(
        (a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id),
      );
  }
}

function cosineSimilarity(left: number[], right: number[]) {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] ** 2;
    rightNorm += right[index] ** 2;
  }
  return Math.max(-1, Math.min(1, dot / Math.sqrt(leftNorm * rightNorm)));
}
