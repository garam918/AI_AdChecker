import { loadEnv } from 'vite';
import { InMemoryRegulationRepository } from '@/src/compliance/regulatory/in-memory-regulation-repository';
import { loadLocalRegulationIndex } from '@/src/compliance/regulatory/local-processed-regulation-loader';
import { RegulatoryRetriever } from '@/src/compliance/regulatory/regulatory-retriever';
import { IndexedSemanticRegulationSearch } from '@/src/compliance/regulatory/semantic-regulation-search';
import { CompliancePackIdSchema } from '@/src/compliance/regulatory/schemas';
import { createEmbeddingProviderFromEnv } from '@/src/server/rag-embedding-provider';

const [query, rawPack = 'GENERAL_ADVERTISING', ...extra] =
  process.argv.slice(2);
if (!query?.trim() || query.length > 2000 || extra.length) {
  throw new Error(
    '사용법: npm run rag:query -- "검색할 내용(최대 2,000자)" GENERAL_ADVERTISING',
  );
}
const pack = CompliancePackIdSchema.parse(rawPack);
const index = loadLocalRegulationIndex();
const provider = createEmbeddingProviderFromEnv({
  ...loadEnv('development', process.cwd(), ''),
  ...process.env,
});
const repository = new InMemoryRegulationRepository();
await repository.saveDocuments(index.documents);
await repository.saveChunks(index.chunks);
const retriever = new RegulatoryRetriever(
  repository,
  provider ? new IndexedSemanticRegulationSearch(index, provider) : undefined,
);
const hits = await retriever.retrieve(query, {
  pack,
  maxResults: 5,
  effectiveAt: new Date(Date.now() + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10),
});
console.log(
  JSON.stringify(
    {
      mode: provider ? 'HYBRID' : 'BM25',
      corpusHash: index.corpusHash,
      query,
      pack,
      sources: hits.map(({ chunk, score }) => ({
        chunkId: chunk.id,
        title: chunk.metadata.documentTitle,
        provision: [chunk.article, chunk.paragraph, chunk.section]
          .filter(Boolean)
          .join(' '),
        text: chunk.text,
        url: chunk.sourceUrl,
        score,
      })),
    },
    null,
    2,
  ),
);
