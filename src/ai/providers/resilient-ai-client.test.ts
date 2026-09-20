import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { ResilientAIClient } from './resilient-ai-client';

const schema = z.object({ answer: z.string() });

const vertexResponse = (text: string, finishReason = 'STOP') =>
  Response.json({
    candidates: [{ finishReason, content: { parts: [{ text }] } }],
  });

const openaiResponse = (text: string) =>
  Response.json({
    status: 'completed',
    output: [{ type: 'message', content: [{ type: 'output_text', text }] }],
  });

const env = {
  VERTEX_API_KEY: 'vertex-secret',
  OPENAI_API_KEY: 'openai-secret',
};

describe('ResilientAIClient', () => {
  it.each([429, 503])(
    'retries transient HTTP %s once without an alternate account and records both attempts',
    async (status) => {
      vi.useFakeTimers();
      try {
        const fetcher = vi
          .fn<typeof fetch>()
          .mockResolvedValueOnce(
            new Response('', { status, headers: { 'retry-after': '3' } }),
          )
          .mockResolvedValueOnce(vertexResponse('{"answer":"recovered"}'));
        const client = new ResilientAIClient(
          { VERTEX_API_KEY: 'test-only' },
          fetcher,
        );
        const pending = client.generate(schema, '', {});
        await vi.advanceTimersByTimeAsync(2999);
        expect(fetcher).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);
        await expect(pending).resolves.toEqual({ answer: 'recovered' });
        expect(client.attempts.map(({ outcome }) => outcome)).toEqual([
          'error',
          'success',
        ]);
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it('bounds persistent overload to two calls under the same total deadline', async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockImplementation(async () => new Response('', { status: 429 }));
      const client = new ResilientAIClient(
        { VERTEX_API_KEY: 'test-only' },
        fetcher,
      );
      const pending = expect(
        client.generate(schema, '', {}),
      ).rejects.toMatchObject({ code: 'AI_RATE_LIMIT' });
      await vi.advanceTimersByTimeAsync(2000);
      await pending;
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(client.attempts).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    { budget: 1000, delay: '1' },
    { budget: 65000, delay: '60' },
  ])(
    'does not retry when the cooldown exceeds the available wait: %o',
    async ({ budget, delay }) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response('', { status: 429, headers: { 'retry-after': delay } }),
        );
      const client = new ResilientAIClient(
        { VERTEX_API_KEY: 'test-only' },
        fetcher,
        budget,
      );
      await expect(client.generate(schema, '', {})).rejects.toMatchObject({
        code: 'AI_RATE_LIMIT',
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it('never retries explicit daily exhaustion without a fallback account', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        {
          error: { details: [{ violations: [{ quotaId: 'RequestsPerDay' }] }] },
        },
        { status: 429 },
      ),
    );
    const client = new ResilientAIClient(
      { VERTEX_API_KEY: 'test-only' },
      fetcher,
    );
    await expect(client.generate(schema, '', {})).rejects.toMatchObject({
      code: 'AI_DAILY_LIMIT',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('uses Vertex when it succeeds and records a single attempt', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(vertexResponse('{"answer":"ok"}'));
    const client = new ResilientAIClient(env, fetcher);
    await expect(client.generate(schema, '', {})).resolves.toEqual({
      answer: 'ok',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(client.attempts).toEqual([
      expect.objectContaining({ provider: 'vertex', outcome: 'success' }),
    ]);
    expect(client.model).toBe('vertex/gemini-3.8-flash');
  });

  it('falls back to OpenAI after a Vertex provider failure and reports both attempts', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('private', { status: 500 }))
      .mockResolvedValueOnce(openaiResponse('{"answer":"fallback"}'));
    const client = new ResilientAIClient(env, fetcher);
    await expect(client.generate(schema, '', {})).resolves.toEqual({
      answer: 'fallback',
    });
    const [, openaiCall] = fetcher.mock.calls;
    expect(openaiCall[0]).toBe('https://api.openai.com/v1/responses');
    expect(openaiCall[1]?.headers).toMatchObject({
      authorization: 'Bearer openai-secret',
    });
    expect(
      client.attempts.map((attempt) => [attempt.provider, attempt.outcome]),
    ).toEqual([
      ['vertex', 'error'],
      ['openai', 'success'],
    ]);
    expect(client.attempts[0].code).toBe('AI_UNAVAILABLE');
    expect(client.model).toBe('openai/gpt-4.1-mini');
  });

  it('forwards the image to the fallback provider', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(openaiResponse('{"answer":"seen"}'));
    const client = new ResilientAIClient(env, fetcher);
    await client.generate(
      schema,
      '',
      {},
      {
        image: { mimeType: 'image/png', data: 'AAAA' },
      },
    );
    const body = JSON.parse(fetcher.mock.calls[1][1]?.body as string);
    expect(body.input[0].content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'input_image',
          image_url: 'data:image/png;base64,AAAA',
        }),
      ]),
    );
  });

  it('never retries a safety block through another provider', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(vertexResponse('{}', 'SAFETY'));
    const client = new ResilientAIClient(env, fetcher);
    await expect(client.generate(schema, '', {})).rejects.toMatchObject({
      code: 'AI_INCOMPLETE',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('rethrows the original error when no fallback key is configured', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('', { status: 401 }));
    const client = new ResilientAIClient(
      { VERTEX_API_KEY: 'vertex-secret' },
      fetcher,
    );
    await expect(client.generate(schema, '', {})).rejects.toMatchObject({
      code: 'AI_AUTH_FAILED',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('honours AI_FALLBACK_PROVIDER=none', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('', { status: 500 }));
    const client = new ResilientAIClient(
      { ...env, AI_FALLBACK_PROVIDER: 'none' },
      fetcher,
    );
    await expect(client.generate(schema, '', {})).rejects.toMatchObject({
      code: 'AI_UNAVAILABLE',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('reports a combined failure without leaking either provider body', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response('vertex-secret body', { status: 500 }),
      )
      .mockResolvedValueOnce(
        new Response('openai-secret body', { status: 500 }),
      );
    const client = new ResilientAIClient(env, fetcher);
    const failure = client.generate(schema, '', {});
    await expect(failure).rejects.toMatchObject({
      code: 'AI_ALL_PROVIDERS_FAILED',
      status: 503,
    });
    await expect(failure).rejects.not.toThrow(/secret/);
    expect(client.attempts.map((attempt) => attempt.outcome)).toEqual([
      'error',
      'error',
    ]);
  });

  it('validates the fallback output against the same schema', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 500 }))
      .mockResolvedValueOnce(openaiResponse('{"answer":12}'));
    const client = new ResilientAIClient(env, fetcher);
    await expect(client.generate(schema, '', {})).rejects.toMatchObject({
      code: 'AI_ALL_PROVIDERS_FAILED',
    });
  });

  it('uses strict structured output with required fields on the fallback', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(openaiResponse('{"answer":"ok"}'));
    const client = new ResilientAIClient(env, fetcher);
    await client.generate(schema, '', {});
    const request = JSON.parse(fetcher.mock.calls[1][1]?.body as string);
    expect(request.text.format).toMatchObject({
      strict: true,
      schema: { required: ['answer'], additionalProperties: false },
    });
    expect(request.store).toBe(false);
  });

  it('preserves fallback refusals as incomplete instead of a generic provider outage', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 500 }))
      .mockResolvedValueOnce(
        Response.json({
          status: 'completed',
          output: [
            {
              type: 'message',
              content: [{ type: 'refusal', refusal: 'refused' }],
            },
          ],
        }),
      );
    await expect(
      new ResilientAIClient(env, fetcher).generate(schema, '', {}),
    ).rejects.toMatchObject({ code: 'AI_INCOMPLETE' });
  });

  it('does not reset the overall deadline between generation steps', async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(vertexResponse('{"answer":"ok"}'));
      const client = new ResilientAIClient(env, fetcher, 1000);
      await client.generate(schema, '', {});
      vi.setSystemTime(Date.now() + 1001);
      await expect(client.generate(schema, '', {})).rejects.toMatchObject({
        code: 'AI_BUDGET_EXCEEDED',
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('bounds a hanging primary request by the remaining budget', async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn<typeof fetch>(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener(
              'abort',
              () => reject(new DOMException('aborted', 'AbortError')),
              { once: true },
            );
          }),
      );
      const client = new ResilientAIClient(
        { VERTEX_API_KEY: 'test-only' },
        fetcher,
        1000,
      );
      const failure = expect(
        client.generate(schema, '', {}),
      ).rejects.toMatchObject({ code: 'AI_TIMEOUT' });
      await vi.advanceTimersByTimeAsync(1001);
      await failure;
      expect(client.fallbackConfigured).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
