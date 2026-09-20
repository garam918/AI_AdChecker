import { describe, expect, it, vi, afterEach } from 'vitest';
import { POST as analyze } from '@/app/api/analyze/route';
import { POST as analyzeUrl } from '@/app/api/analyze-url/route';
import { POST as analyzeImage } from '@/app/api/analyze-image/route';
import { analysisResponse, readLimitedBody } from './analysis-response';
import { ScanAnalysisResultSchema } from '@/src/compliance/core/schemas';
import { AIAnalysisError } from '@/src/ai/providers/gemini-client';

afterEach(() => vi.unstubAllEnvs());
function stubNoAiProviders() {
  for (const name of [
    'VERTEX_API_KEY',
    'GOOGLE_CLOUD_PROJECT',
    'VERTEX_ACCESS_TOKEN',
    'VERTEX_SERVICE_ACCOUNT_JSON',
    'OPENAI_API_KEY',
    'AI_RULES_FALLBACK',
  ])
    vi.stubEnv(name, '');
}
const request = (body: unknown, accept = 'application/json') =>
  new Request('https://example.test/api/analyze', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept },
    body: JSON.stringify(body),
  });

describe('analysis API boundaries', () => {
  it('rejects cross-origin browser analysis before any model work', async () => {
    const work = vi.fn();
    const response = await analysisResponse(
      new Request('https://example.test/api/analyze', {
        headers: {
          origin: 'https://other.test',
          accept: 'application/x-ndjson',
        },
      }),
      work,
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'ORIGIN_REJECTED' });
    expect(work).not.toHaveBeenCalled();
  });
  it('falls back to a clearly labelled rules-only result when no AI provider is configured', async () => {
    stubNoAiProviders();
    const response = await analyze(request({ text: '국내 최고의 AI 서비스' }));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = ScanAnalysisResultSchema.parse(await response.json());
    expect(body.analysisModel).toBe('rules-only');
    expect(body.metrics?.mode).toBe('offline');
    expect(body.notices.map((notice) => notice.code)).toContain(
      'AI_UNAVAILABLE_RULES_ONLY',
    );
    expect(body.issues.length).toBeGreaterThan(0);
  });

  it('reports missing AI configuration with 503 when the rules fallback is disabled', async () => {
    stubNoAiProviders();
    vi.stubEnv('AI_RULES_FALLBACK', 'off');
    const response = await analyze(request({ text: '국내 최고의 AI 서비스' }));
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({ code: 'AI_NOT_CONFIGURED' });
  });

  it('validates user input separately from AI response failures', async () => {
    expect((await analyze(request({ text: '' }))).status).toBe(400);
    expect((await analyze(request({ text: 'a'.repeat(20001) }))).status).toBe(
      400,
    );
    const response = await analyze(
      new Request('https://example.test', { method: 'POST', body: '{invalid' }),
    );
    expect(response.status).toBe(400);
  });

  it('rejects unsafe URLs and excluded YouTube analysis', async () => {
    expect(
      (await analyzeUrl(request({ url: 'http://127.0.0.1' }))).status,
    ).toBe(400);
    const response = await analyzeUrl(
      request({ url: 'https://www.youtube.com/watch?v=abc' }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      message: expect.stringContaining('YouTube'),
    });
  });

  it('requires one image and rejects video before invoking Gemini', async () => {
    const empty = new FormData();
    expect(
      (
        await analyzeImage(
          new Request('https://example.test', { method: 'POST', body: empty }),
        )
      ).status,
    ).toBe(400);
    const form = new FormData();
    form.set(
      'image',
      new File([new Uint8Array(50)], 'video.mp4', { type: 'video/mp4' }),
    );
    expect(
      (
        await analyzeImage(
          new Request('https://example.test', { method: 'POST', body: form }),
        )
      ).status,
    ).toBe(400);
  });

  it('enforces body limits even when content-length is missing', async () => {
    const input = new Request('https://example.test', {
      method: 'POST',
      body: 'x'.repeat(101),
    });
    await expect(readLimitedBody(input, 100)).rejects.toMatchObject({
      status: 413,
    });
  });

  it('streams real milestones and a schema-validated result, ignoring backwards pack progress', async () => {
    const result = ScanAnalysisResultSchema.parse({
      detectedContentType: 'ADVERTISEMENT_TEXT',
      detectedCategory: 'GENERAL_ADVERTISING',
      overallRisk: 'LOW',
      claims: [],
      issues: [],
      sources: [],
    });
    const response = await analysisResponse(
      request({}, 'application/x-ndjson'),
      async (progress) => {
        progress('CLASSIFYING');
        progress('RETRIEVING');
        progress('ANALYZING');
        progress('VALIDATING');
        progress('RETRIEVING');
        return result;
      },
    );
    const events = (await response.text())
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(
      events
        .filter((event) => event.type === 'progress')
        .map((event) => event.stage),
    ).toEqual(['CLASSIFYING', 'RETRIEVING', 'ANALYZING', 'VALIDATING']);
    expect(events.at(-1).type).toBe('result');
  });

  it('streams an error instead of completion on Gemini failure', async () => {
    const response = await analysisResponse(
      request({}, 'application/x-ndjson'),
      async () => {
        throw new AIAnalysisError('AI_INCOMPLETE', '응답 불완전');
      },
    );
    const body = await response.text();
    expect(body).toContain('"type":"error"');
    expect(body).not.toContain('"type":"result"');
  });
});
