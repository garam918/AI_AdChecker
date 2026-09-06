import type { RegulationRepository } from './ingestion';
import {
  RetrievalHitSchema,
  RetrievalOptionsSchema,
  type RetrievalHit,
  type RetrievalOptions,
} from './schemas';

const STOP_WORDS = new Set([
  '광고',
  '광고의',
  '광고를',
  '표시',
  '일반',
  '검토',
  '주장',
  '유형',
]);

const SOURCE_BOOST = {
  LAW: 0.1,
  ENFORCEMENT_DECREE: 0.08,
  ADMINISTRATIVE_RULE: 0.07,
  OFFICIAL_GUIDELINE: 0.06,
  OFFICIAL_CASE: 0.04,
} as const;

export class RegulatoryRetriever {
  constructor(private readonly repository: RegulationRepository) {}

  async retrieve(
    query: string,
    options: RetrievalOptions,
  ): Promise<RetrievalHit[]> {
    const parsedOptions = RetrievalOptionsSchema.parse(options);
    const candidates = await this.repository.findRelevantChunks(
      query,
      parsedOptions,
    );
    const queryTerms = tokenize(query);

    return candidates
      .map((chunk) => {
        const topicText = chunk.metadata.topics.join(' ').toLowerCase();
        const matchedTerms = queryTerms.filter(
          (term) =>
            chunk.normalizedText.includes(term) || topicText.includes(term),
        );
        const lexicalScore =
          queryTerms.length > 0 ? matchedTerms.length / queryTerms.length : 0;
        const topicMatches = matchedTerms.filter((term) =>
          topicText.includes(term),
        ).length;
        const topicBoost = Math.min(0.25, topicMatches * 0.045);
        const sourceBoost =
          matchedTerms.length > 0 ? SOURCE_BOOST[chunk.metadata.sourceType] : 0;
        const score = Math.min(
          1,
          lexicalScore * 0.72 + topicBoost + sourceBoost,
        );

        return RetrievalHitSchema.parse({
          chunk,
          score: Number(score.toFixed(4)),
          matchedTerms,
        });
      })
      .filter((hit) => hit.score >= parsedOptions.minimumScore)
      .sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id))
      .slice(0, parsedOptions.maxResults);
  }
}

function tokenize(value: string) {
  return [
    ...new Set(
      value
        .normalize('NFKC')
        .toLowerCase()
        .split(/[^\p{L}\p{N}.%]+/u)
        .map((term) => term.trim())
        .filter((term) => term.length >= 2 && !STOP_WORDS.has(term)),
    ),
  ];
}
