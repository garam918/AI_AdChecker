import { describe, expect, it, vi } from 'vitest';
import { HttpEmbeddingProvider } from './http-embedding-provider';
import { createEmbeddingProviderFromEnv } from '@/src/server/rag-embedding-provider';

const identity = {
  provider: 'openai' as const,
  model: 'text-embedding-3-small',
  dimensions: 2,
};

describe('HTTP embedding providers', () => {
  it('restores API response order and requests float vectors without leaking credentials to the body', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        model: identity.model,
        data: [
          { index: 1, embedding: [0, 1] },
          { index: 0, embedding: [1, 0] },
        ],
      }),
    );
    const provider = new HttpEmbeddingProvider(identity, {
      apiKey: 'test-key',
      fetcher,
    });
    expect(await provider.embed(['a', 'b'])).toEqual([
      [1, 0],
      [0, 1],
    ]);
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.openai.com/v1/embeddings',
      expect.objectContaining({
        redirect: 'error',
        body: JSON.stringify({
          model: identity.model,
          input: ['a', 'b'],
          dimensions: 2,
          encoding_format: 'float',
        }),
      }),
    );
  });

  it('fails on duplicate indices, a different model, wrong dimensions and zero vectors', async () => {
    const responses = [
      { model: identity.model, data: [{ index: 1, embedding: [1, 0] }] },
      { model: 'unexpected', data: [{ index: 0, embedding: [1, 0] }] },
      { model: identity.model, data: [{ index: 0, embedding: [1] }] },
      { model: identity.model, data: [{ index: 0, embedding: [0, 0] }] },
    ];
    for (const body of responses) {
      const provider = new HttpEmbeddingProvider(identity, {
        apiKey: 'test-key',
        fetcher: async () => Response.json(body),
      });
      await expect(provider.embed(['text'])).rejects.toThrow();
    }
  });

  it('does not expose a vendor error body or silently retry a paid request', async () => {
    const fetcher = vi.fn(
      async () => new Response('secret-original-ad', { status: 429 }),
    );
    const provider = new HttpEmbeddingProvider(identity, {
      apiKey: 'test-key',
      fetcher,
    });
    await expect(provider.embed(['text'])).rejects.toThrow('HTTP 429');
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('uses Ollama batches and disables silent input truncation', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ model: 'local-model', embeddings: [[1, 0]] }),
    );
    const provider = new HttpEmbeddingProvider(
      { ...identity, provider: 'ollama', model: 'local-model' },
      { fetcher },
    );
    expect(await provider.embed(['text'])).toEqual([[1, 0]]);
    expect(fetcher).toHaveBeenCalledWith(
      'http://127.0.0.1:11434/api/embed',
      expect.objectContaining({
        body: JSON.stringify({
          model: 'local-model',
          input: ['text'],
          dimensions: 2,
          truncate: false,
        }),
      }),
    );
  });

  it('defaults to no external API and rejects incomplete configuration and insecure remote URLs', () => {
    expect(createEmbeddingProviderFromEnv({})).toBeNull();
    expect(() =>
      createEmbeddingProviderFromEnv({ RAG_EMBEDDING_PROVIDER: 'openai' }),
    ).toThrow('OPENAI_API_KEY');
    expect(() =>
      createEmbeddingProviderFromEnv({ RAG_EMBEDDING_PROVIDER: 'ollama' }),
    ).toThrow('모델');
    expect(
      () =>
        new HttpEmbeddingProvider(
          { ...identity, provider: 'ollama' },
          { ollamaBaseUrl: 'http://example.com' },
        ),
    ).toThrow('HTTPS');
  });
});
