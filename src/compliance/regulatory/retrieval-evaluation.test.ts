import { describe, expect, it } from 'vitest';
import cases from '@/evals/retrieval/cases.json';
import { InMemoryRegulationRepository } from './in-memory-regulation-repository';
import { LocalProcessedRegulationLoader } from './local-processed-regulation-loader';
import { RegulatoryRetriever } from './regulatory-retriever';
import { CompliancePackIdSchema } from './schemas';

describe('checked-in corpus retrieval evaluation (BM25, top 5)', () => {
  it.each(cases)('$id', async (testCase) => {
    const pack = CompliancePackIdSchema.parse(testCase.pack);
    const corpus = await new LocalProcessedRegulationLoader(pack).load();
    const repository = new InMemoryRegulationRepository();
    await repository.saveDocuments(corpus.documents);
    await repository.saveChunks(corpus.chunks);
    const hits = await new RegulatoryRetriever(repository).retrieve(
      testCase.query,
      {
        pack,
        effectiveAt: testCase.effectiveAt,
        maxResults: 5,
      },
    );
    if (testCase.expectEmpty) expect(hits).toEqual([]);
    for (const chunkId of testCase.expectedChunkIds) {
      expect(hits.map((hit) => hit.chunk.id)).toContain(chunkId);
    }
    expect(
      hits.every(
        (hit) =>
          hit.chunk.metadata.pack === pack &&
          hit.chunk.metadata.effectiveDate <= testCase.effectiveAt,
      ),
    ).toBe(true);
  });
});
