import { rankWithBm25 } from './bm25-search';
import type { RegulationRepository } from './ingestion';
import type { SemanticRegulationSearch } from './semantic-regulation-search';
import {
  RetrievalHitSchema,
  RetrievalOptionsSchema,
  type RetrievalHit,
  type RetrievalOptions,
} from './schemas';

export class RegulatoryRetriever {
  constructor(
    private readonly repository: RegulationRepository,
    private readonly semanticSearch?: SemanticRegulationSearch,
  ) {}

  async retrieve(
    query: string,
    options: RetrievalOptions,
  ): Promise<RetrievalHit[]> {
    const parsedOptions = RetrievalOptionsSchema.parse(options);
    if (!query.trim()) return [];
    const candidates = await this.repository.findRelevantChunks(
      query,
      parsedOptions,
    );
    const lexical = rankWithBm25(query, candidates).filter(
      (hit) => hit.score >= parsedOptions.minimumScore,
    );
    if (!this.semanticSearch)
      return lexical
        .slice(0, parsedOptions.maxResults)
        .map((hit) => RetrievalHitSchema.parse(hit));

    // Filter applicability before vector ranking, not after cutting the top results.
    const semantic = (
      await this.semanticSearch.search(query, candidates)
    ).filter((hit) => hit.score >= Math.max(0.3, parsedOptions.minimumScore));
    if (!semantic.length)
      return lexical
        .slice(0, parsedOptions.maxResults)
        .map((hit) => RetrievalHitSchema.parse(hit));
    const combined = new Map<string, RetrievalHit>();
    const matchedTermsById = new Map(
      lexical.map((hit) => [hit.chunk.id, hit.matchedTerms]),
    );
    const candidateLimit = Math.max(20, parsedOptions.maxResults * 2);
    for (const list of [
      lexical.slice(0, candidateLimit),
      semantic.slice(0, candidateLimit),
    ]) {
      list.forEach((hit, position) => {
        const existing = combined.get(hit.chunk.id);
        // Reciprocal rank fusion. This score orders sources; it is never legal probability.
        const contribution = 61 / (60 + position + 1) / 2;
        combined.set(hit.chunk.id, {
          chunk: hit.chunk,
          score: (existing?.score ?? 0) + contribution,
          matchedTerms: matchedTermsById.get(hit.chunk.id) ?? [],
        });
      });
    }
    return [...combined.values()]
      .sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id))
      .slice(0, parsedOptions.maxResults)
      .map((hit) => RetrievalHitSchema.parse(hit));
  }
}
