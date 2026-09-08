import { describe, expect, it, vi } from 'vitest';
import rawAdvertising from '@/data/regulations/raw/general-advertising.official.json';
import { buildRegulationIndex } from './regulation-index-builder';
import type { EmbeddingProvider } from './embedding-provider';
import { IndexedSemanticRegulationSearch } from './semantic-regulation-search';
import { RegulatoryRetriever } from './regulatory-retriever';
import { InMemoryRegulationRepository } from './in-memory-regulation-repository';

const targetId =
  'advertising-substantiation-operation-2015:section-4-relevance';
async function setup() {
  // Synthetic vectors exercise ranking/integrity, not a model's Korean accuracy.
  const embed = vi.fn(async (texts: string[]) =>
    texts.map((text) =>
      text.includes('직접적으로 관계') || text === 'semantic-only-query'
        ? [1, 0]
        : [0, 1],
    ),
  );
  const provider: EmbeddingProvider = {
    identity: { provider: 'openai', model: 'test-embedding', dimensions: 2 },
    embed,
  };
  const index = await buildRegulationIndex(
    [{ path: 'advertising.json', corpus: rawAdvertising }],
    { provider },
  );
  const repository = new InMemoryRegulationRepository();
  await repository.saveDocuments(index.documents);
  await repository.saveChunks(index.chunks);
  return {
    index,
    repository,
    provider,
    embed,
    search: new IndexedSemanticRegulationSearch(index, provider),
  };
}

describe('semantic and hybrid retrieval', () => {
  it('finds a semantically matching source without lexical overlap and deduplicates hybrid results', async () => {
    const { repository, search } = await setup();
    const retriever = new RegulatoryRetriever(repository, search);
    const hits = await retriever.retrieve('semantic-only-query', {
      pack: 'GENERAL_ADVERTISING',
    });
    expect(hits.map((hit) => hit.chunk.id)).toEqual([targetId]);
    const hybrid = await retriever.retrieve('직접적으로 관계 실증자료', {
      pack: 'GENERAL_ADVERTISING',
    });
    expect(hybrid[0].chunk.id).toBe(targetId);
    expect(new Set(hybrid.map((hit) => hit.chunk.id)).size).toBe(hybrid.length);
  });

  it('applies date and source type filters before sending any embedding query', async () => {
    const { repository, search, embed } = await setup();
    const retriever = new RegulatoryRetriever(repository, search);
    embed.mockClear();
    expect(
      await retriever.retrieve('semantic-only-query', {
        pack: 'GENERAL_ADVERTISING',
        effectiveAt: '1900-01-01',
      }),
    ).toEqual([]);
    expect(embed).not.toHaveBeenCalled();
    expect(
      await retriever.retrieve('semantic-only-query', {
        pack: 'GENERAL_ADVERTISING',
        sourceTypes: ['LAW'],
      }),
    ).toEqual([]);
  });

  it('rejects model changes and stale provision content instead of using mismatched vectors', async () => {
    const { search, index, provider } = await setup();
    expect(
      () =>
        new IndexedSemanticRegulationSearch(index, {
          ...provider,
          identity: { ...provider.identity, model: 'changed-model' },
        }),
    ).toThrow('일치하지');
    const altered = { ...index.chunks[0], text: '변경된 법령 본문' };
    await expect(search.search('query', [altered])).rejects.toThrow(
      '인덱스를 재생성',
    );
  });

  it('propagates embedding failures rather than silently returning a successful scan', async () => {
    const { repository, search, embed } = await setup();
    embed.mockRejectedValue(new Error('embedding unavailable'));
    await expect(
      new RegulatoryRetriever(repository, search).retrieve('실증', {
        pack: 'GENERAL_ADVERTISING',
      }),
    ).rejects.toThrow('embedding unavailable');
  });
});
