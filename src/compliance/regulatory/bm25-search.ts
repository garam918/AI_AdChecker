import type { RegulationChunk } from './schemas';

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

export function tokenizeRegulatoryText(value: string): string[] {
  const words =
    value
      .normalize('NFKC')
      .toLowerCase()
      .match(/[\p{L}\p{N}.%]+/gu) ?? [];
  return words
    .filter((word) => word.length >= 2 && !STOP_WORDS.has(word))
    .flatMap((word) => {
      // Korean character bigrams bridge particles/spacing without changing cited text.
      const tokens = [word];
      if (/^[가-힣]+$/.test(word) && word.length > 2) {
        for (let index = 0; index < word.length - 1; index += 1) {
          const pair = word.slice(index, index + 2);
          if (!STOP_WORDS.has(pair)) tokens.push(pair);
        }
      }
      return tokens;
    });
}

export function rankWithBm25(query: string, chunks: RegulationChunk[]) {
  const queryTerms = [...new Set(tokenizeRegulatoryText(query))];
  if (!queryTerms.length || !chunks.length) return [];
  const documents = chunks.map((chunk) => {
    const tokens = tokenizeRegulatoryText(
      [
        chunk.heading,
        chunk.text,
        chunk.article,
        chunk.paragraph,
        chunk.section,
        ...chunk.metadata.topics,
        ...chunk.metadata.topics,
      ]
        .filter(Boolean)
        .join(' '),
    );
    const frequencies = new Map<string, number>();
    tokens.forEach((token) =>
      frequencies.set(token, (frequencies.get(token) ?? 0) + 1),
    );
    return { chunk, frequencies, length: tokens.length };
  });
  const averageLength =
    documents.reduce((total, doc) => total + doc.length, 0) /
      documents.length || 1;
  const documentFrequency = new Map(
    queryTerms.map((term) => [
      term,
      documents.filter((doc) => doc.frequencies.has(term)).length,
    ]),
  );
  return documents
    .map((doc) => {
      const matchedTerms = queryTerms.filter((term) =>
        doc.frequencies.has(term),
      );
      const bm25 = matchedTerms.reduce((total, term) => {
        const frequency = doc.frequencies.get(term)!;
        const df = documentFrequency.get(term)!;
        const idf = Math.log(1 + (documents.length - df + 0.5) / (df + 0.5));
        const k1 = 1.2;
        const b = 0.75;
        return (
          total +
          (idf * frequency * (k1 + 1)) /
            (frequency + k1 * (1 - b + (b * doc.length) / averageLength))
        );
      }, 0);
      return { chunk: doc.chunk, score: bm25 / (bm25 + 5), matchedTerms };
    })
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id));
}
