import {
  sameEmbeddingIdentity,
  validateVectors,
  type EmbeddingProvider,
} from './embedding-provider';
import { RawRegulationCorpusSchema } from './schemas';
import { StructureAwareRegulationParser } from './structure-aware-regulation-parser';
import {
  chunkContentHash,
  corpusContentHash,
  embeddingText,
  RegulationSearchIndexSchema,
  type RegulationSearchIndex,
} from './regulation-search-index';

export async function buildRegulationIndex(
  sources: Array<{ path: string; corpus: unknown }>,
  options: {
    provider?: EmbeddingProvider | null;
    previous?: RegulationSearchIndex | null;
  } = {},
): Promise<RegulationSearchIndex> {
  const parsed = sources
    .slice()
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((source) => {
      const corpus = RawRegulationCorpusSchema.parse(source.corpus);
      if (corpus.documents.some((doc) => doc.pack !== corpus.pack)) {
        throw new Error(
          `법령 분류가 원본 파일과 일치하지 않습니다: ${source.path}`,
        );
      }
      return new StructureAwareRegulationParser().parse(corpus);
    });
  const documents = parsed.flatMap((item) => item.documents);
  const chunks = parsed.flatMap((item) => item.chunks);
  const entries = await Promise.all(
    chunks.map(async (chunk) => ({
      chunkId: chunk.id,
      contentHash: await chunkContentHash(chunk),
      embedding: null as number[] | null,
    })),
  );
  const base = {
    schemaVersion: 1 as const,
    corpusHash: await corpusContentHash({ documents, chunks }),
    sourceFiles: sources.map((source) => source.path).sort(),
    provenance: 'EXISTING_CURATED_CORPUS' as const,
    documents,
    chunks,
    embedding: null,
    entries,
  };
  // Reject broken/duplicate sources before making any paid request.
  RegulationSearchIndexSchema.parse(base);
  if (!options.provider) return base;

  const provider = options.provider;
  const previous = options.previous
    ? RegulationSearchIndexSchema.parse(options.previous)
    : null;
  const cache = new Map(
    previous && sameEmbeddingIdentity(previous.embedding, provider.identity)
      ? previous.entries.map((entry) => [entry.chunkId, entry])
      : [],
  );
  const pending: number[] = [];
  entries.forEach((entry, index) => {
    const cached = cache.get(entry.chunkId);
    if (cached?.contentHash === entry.contentHash && cached.embedding)
      entry.embedding = cached.embedding;
    else pending.push(index);
  });
  for (let start = 0; start < pending.length; start += 32) {
    const batch = pending.slice(start, start + 32);
    const vectors = validateVectors(
      await provider.embed(batch.map((index) => embeddingText(chunks[index]))),
      batch.length,
      provider.identity.dimensions,
    );
    batch.forEach((index, position) => {
      entries[index].embedding = vectors[position];
    });
  }
  return RegulationSearchIndexSchema.parse({
    ...base,
    embedding: provider.identity,
    entries,
  });
}
