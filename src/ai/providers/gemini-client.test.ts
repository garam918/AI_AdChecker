import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { GeminiClient, parseRetryAfter } from './gemini-client';

const schema = z.object({ answer: z.string() });
const response = (text: string, finishReason = 'STOP') =>
  Response.json({
    candidates: [
      {
        finishReason,
        content: {
          parts: [{ thought: true, text: 'private reasoning' }, { text }],
        },
      },
    ],
  });

describe('Gemini structured HTTP boundary', () => {
  it('preserves a safe retry delay for rate limiting', async () => {
    const client = new GeminiClient({
      apiKey: () => 'test-secret',
      fetch: vi.fn<typeof fetch>().mockResolvedValue(
        new Response('', {
          status: 429,
          headers: { 'retry-after': '3' },
        }),
      ),
    });
    await expect(client.generate(schema, '', {})).rejects.toMatchObject({
      code: 'AI_RATE_LIMIT',
      retryAfterMs: 3000,
    });
  });

  it('parses seconds and HTTP dates without shortening a long cooldown', () => {
    expect(parseRetryAfter('120')).toBe(120000);
    expect(parseRetryAfter('-1')).toBeUndefined();
    expect(parseRetryAfter('private error')).toBeUndefined();
    expect(parseRetryAfter(null)).toBeUndefined();
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-09-20T00:00:00Z'));
      expect(parseRetryAfter('Sun, 20 Sep 2026 00:00:04 GMT')).toBe(4000);
    } finally {
      vi.useRealTimers();
    }
  });
  it('reports daily quota exhaustion without suggesting an immediate retry or exposing provider text', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        {
          error: {
            message: 'private test-secret details',
            details: [
              {
                violations: [
                  {
                    quotaId:
                      'GenerateRequestsPerDayPerProjectPerModel-FreeTier',
                  },
                ],
              },
            ],
          },
        },
        { status: 429 },
      ),
    );
    const client = new GeminiClient({
      apiKey: () => 'test-secret',
      fetch: fetcher,
    });
    await expect(client.generate(schema, '', {})).rejects.toMatchObject({
      code: 'AI_DAILY_LIMIT',
      status: 429,
      message: expect.stringContaining('일일 사용 한도'),
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('does not retry a rejected request configuration', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response('private test-secret details', { status: 400 }),
      );
    const client = new GeminiClient({
      apiKey: () => 'test-secret',
      fetch: fetcher,
    });
    await expect(client.generate(schema, '', {})).rejects.toMatchObject({
      code: 'AI_REQUEST_REJECTED',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('keeps string bounds in server validation without forwarding unsupported JSON Schema keywords', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response('{"answer":"longer than allowed"}'));
    const client = new GeminiClient({
      apiKey: () => 'test-secret',
      fetch: fetcher,
    });
    await expect(
      client.generate(z.object({ answer: z.string().max(5) }), '', {}),
    ).rejects.toMatchObject({ code: 'AI_INVALID_RESPONSE' });
    const body = JSON.parse(fetcher.mock.calls[0][1]!.body as string);
    expect(body.generationConfig.responseJsonSchema.properties.answer).toEqual({
      type: 'string',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('recovers from explicit temporary overload without retrying completed generation', async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(new Response('', { status: 503 }))
        .mockResolvedValueOnce(response('{"answer":"확인 필요"}'));
      const client = new GeminiClient({
        apiKey: () => 'test-secret',
        fetch: fetcher,
      });
      const pending = client.generate(schema, '', {});
      await vi.advanceTimersByTimeAsync(1500);
      await expect(pending).resolves.toEqual({ answer: '확인 필요' });
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps nested array bounds in server validation without expanding the generation grammar', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        response(JSON.stringify({ findings: [{ sources: ['one', 'two'] }] })),
      );
    const client = new GeminiClient({
      apiKey: () => 'test-secret',
      fetch: fetcher,
    });
    const bounded = z.object({
      findings: z
        .array(z.object({ sources: z.array(z.string()).min(1).max(1) }))
        .max(8),
    });
    await expect(client.generate(bounded, '', {})).rejects.toMatchObject({
      code: 'AI_INVALID_RESPONSE',
    });
    const body = JSON.parse(fetcher.mock.calls[0][1]!.body as string);
    const wire = body.generationConfig.responseJsonSchema;
    expect(JSON.stringify(wire)).not.toMatch(/minItems|maxItems/);
    expect(wire.properties.findings.items.properties.sources.items).toEqual({
      type: 'string',
    });
  });

  it('limits temporary overload retries and returns a safe service-unavailable error', async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockImplementation(async () => new Response('', { status: 503 }));
      const client = new GeminiClient({
        apiKey: () => 'test-secret',
        fetch: fetcher,
      });
      const expectation = expect(
        client.generate(schema, '', {}),
      ).rejects.toMatchObject({ code: 'AI_BUSY', status: 503 });
      await vi.advanceTimersByTimeAsync(4500);
      await expectation;
      expect(fetcher).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
  it('uses the requested model, server header, supported thinking and a JSON schema', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response('{"answer":"검토 필요"}'));
    const client = new GeminiClient({
      apiKey: () => 'test-secret',
      fetch: fetcher,
    });
    expect(
      await client.generate(schema, 'instructions', { text: '광고' }),
    ).toEqual({ answer: '검토 필요' });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(
      'https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-3.8-flash:generateContent',
    );
    expect(url).not.toContain('test-secret');
    const body = JSON.parse(typeof init?.body === 'string' ? init.body : '');
    expect(body.generationConfig.thinkingConfig.thinkingLevel).toBe('low');
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.responseJsonSchema.required).toContain(
      'answer',
    );
    expect(body.generationConfig).not.toHaveProperty('temperature');
    expect(init?.headers).toMatchObject({ 'x-goog-api-key': 'test-secret' });
  });

  it('does not make a request or invent a fallback result without a key', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = new GeminiClient({ apiKey: () => '', fetch: fetcher });
    await expect(client.generate(schema, '', {})).rejects.toMatchObject({
      code: 'AI_NOT_CONFIGURED',
      status: 503,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('calls the regional project endpoint with a bearer token and never leaks it', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response('{"answer":"확인"}'));
    const client = new GeminiClient({
      env: {
        GOOGLE_CLOUD_PROJECT: 'demo-project',
        GOOGLE_CLOUD_LOCATION: 'asia-northeast3',
        VERTEX_ACCESS_TOKEN: 'ya29.test-secret',
        VERTEX_MODEL: 'gemini-2.5-flash',
      },
      fetch: fetcher,
    });
    await expect(
      client.generate(schema, '', {}, { thinking: 'medium' }),
    ).resolves.toEqual({ answer: '확인' });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(
      'https://asia-northeast3-aiplatform.googleapis.com/v1/projects/demo-project/locations/asia-northeast3/publishers/google/models/gemini-2.5-flash:generateContent',
    );
    expect(init?.headers).toMatchObject({
      authorization: 'Bearer ya29.test-secret',
    });
    const body = JSON.parse(typeof init?.body === 'string' ? init.body : '');
    // 2.5 models take a token budget; 3.x models take a thinking level.
    expect(body.generationConfig.thinkingConfig).toEqual({
      thinkingBudget: 2048,
    });
  });

  it('rejects an unsafe project or model name before any network call', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = new GeminiClient({
      env: {
        GOOGLE_CLOUD_PROJECT: 'demo/../other',
        VERTEX_ACCESS_TOKEN: 'token',
      },
      fetch: fetcher,
    });
    await expect(client.generate(schema, '', {})).rejects.toMatchObject({
      code: 'AI_NOT_CONFIGURED',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    ['not json', 'STOP', 'AI_INVALID_RESPONSE'],
    ['{"answer":12}', 'STOP', 'AI_INVALID_RESPONSE'],
    ['{"answer":"partial"}', 'MAX_TOKENS', 'AI_INCOMPLETE'],
    ['{}', 'SAFETY', 'AI_INCOMPLETE'],
  ])(
    'rejects malformed or incomplete output: %s / %s',
    async (body, finish, code) => {
      const client = new GeminiClient({
        apiKey: () => 'test-secret',
        fetch: vi.fn<typeof fetch>().mockResolvedValue(response(body, finish)),
      });
      await expect(client.generate(schema, '', {})).rejects.toMatchObject({
        code,
      });
    },
  );

  it.each([401, 403, 429, 500])(
    'never exposes upstream error bodies for HTTP %i',
    async (status) => {
      const client = new GeminiClient({
        apiKey: () => 'test-secret',
        fetch: vi
          .fn<typeof fetch>()
          .mockResolvedValue(
            new Response('test-secret: private prompt', { status }),
          ),
      });
      await expect(client.generate(schema, '', {})).rejects.not.toThrow(
        /test-secret|private prompt/,
      );
    },
  );

  it('aborts a stalled call and reports a bounded timeout', async () => {
    const client = new GeminiClient({
      apiKey: () => 'test-secret',
      timeoutMs: 5,
      fetch: vi.fn<typeof fetch>().mockImplementation(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new Error('aborted test-secret')),
            );
          }),
      ),
    });
    await expect(client.generate(schema, '', {})).rejects.toMatchObject({
      code: 'AI_TIMEOUT',
      status: 504,
    });
  });
});
