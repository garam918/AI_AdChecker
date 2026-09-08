import { readdir, readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import rawAdvertising from '@/data/regulations/raw/general-advertising.official.json';
import storedIndex from '@/data/regulations/processed/rag-index.json';
import { buildRegulationIndex } from './regulation-index-builder';
import type { EmbeddingProvider } from './embedding-provider';
import { RegulationSearchIndexSchema } from './regulation-search-index';

const sources = [
  { path: 'general-advertising.official.json', corpus: rawAdvertising },
];
function provider(): EmbeddingProvider & { embed: ReturnType<typeof vi.fn> } {
  return {
    identity: { provider: 'openai', model: 'test-embedding', dimensions: 2 },
    embed: vi.fn(async (texts: string[]) => texts.map(() => [1, 0])),
  };
}

describe('regulation index ingestion', () => {
  it('keeps every checked-in source and provision in sync, including exact source text', async () => {
    const files = (await readdir('data/regulations/raw')).filter((file) =>
      file.endsWith('.json'),
    );
    const allSources = await Promise.all(
      files.map(async (file) => {
        const path = `data/regulations/raw/${file}`;
        return {
          path,
          corpus: JSON.parse(await readFile(path, 'utf8')) as unknown,
        };
      }),
    );
    const expected = await buildRegulationIndex(allSources);
    const actual = RegulationSearchIndexSchema.parse(storedIndex);
    expect(actual.documents).toEqual(expected.documents);
    expect(actual.chunks).toEqual(expected.chunks);
    expect(actual.corpusHash).toBe(expected.corpusHash);
    expect(actual.sourceFiles).toEqual(expected.sourceFiles);
    expect(
      actual.entries.map(({ chunkId, contentHash }) => ({
        chunkId,
        contentHash,
      })),
    ).toEqual(
      expected.entries.map(({ chunkId, contentHash }) => ({
        chunkId,
        contentHash,
      })),
    );
  });

  it('reuses unchanged vectors and embeds only an amended provision', async () => {
    const embedding = provider();
    const previous = await buildRegulationIndex(sources, {
      provider: embedding,
    });
    embedding.embed.mockClear();
    expect(
      await buildRegulationIndex(sources, { provider: embedding, previous }),
    ).toEqual(previous);
    expect(embedding.embed).not.toHaveBeenCalled();
    const changed = structuredClone(rawAdvertising);
    changed.documents[0].sections[0].text += ' 테스트용 변경';
    const next = await buildRegulationIndex(
      [{ ...sources[0], corpus: changed }],
      { provider: embedding, previous },
    );
    expect(embedding.embed).toHaveBeenCalledOnce();
    expect(embedding.embed.mock.calls[0][0]).toHaveLength(1);
    expect(next.corpusHash).not.toBe(previous.corpusHash);
  });

  it('rebuilds every vector after a model change', async () => {
    const first = provider();
    const previous = await buildRegulationIndex(sources, { provider: first });
    const next = provider();
    next.identity.model = 'another-model';
    await buildRegulationIndex(sources, { provider: next, previous });
    expect(next.embed.mock.calls[0][0]).toHaveLength(previous.chunks.length);
  });

  it('rejects duplicate IDs before embedding and rejects malformed vectors', async () => {
    const embedding = provider();
    await expect(
      buildRegulationIndex([...sources, ...sources], { provider: embedding }),
    ).rejects.toThrow();
    expect(embedding.embed).not.toHaveBeenCalled();
    embedding.embed.mockImplementation(async (texts: string[]) =>
      texts.map(() => [0, 0]),
    );
    await expect(
      buildRegulationIndex(sources, { provider: embedding }),
    ).rejects.toThrow('임베딩 응답');
  });
});
