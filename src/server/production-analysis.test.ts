import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';

import type { ComplianceReasoningInput } from '@/src/ai/providers/compliance-reasoning-provider';
import { ScanAnalysisResultSchema } from '@/src/compliance/core/schemas';

import { createProductionAnalysis } from './production-analysis';

// Representative text demo shown on the New Scan screen.
const DEMO_TEXT = '업무 시간을 70% 줄여주는 국내 최고의 AI 서비스';

type Behaviour = {
  prepare?: 'ok' | 'fail';
  findings?: 'ok' | 'fail';
  vision?: 'ok' | 'fail';
};

const vertexJson = (value: unknown) =>
  Response.json({
    candidates: [
      {
        finishReason: 'STOP',
        content: { parts: [{ text: JSON.stringify(value) }] },
      },
    ],
  });

/** Answers Vertex calls by request shape; OpenAI fallback is left unconfigured. */
function fakeVertex(behaviour: Behaviour = {}) {
  return vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
    const body = JSON.parse(typeof init?.body === 'string' ? init.body : '');
    const parts = body.contents[0].parts as Array<{
      text?: string;
      inlineData?: unknown;
    }>;
    if (parts.some((part) => part.inlineData)) {
      if (behaviour.vision === 'fail') return new Response('', { status: 500 });
      return vertexJson({
        extractedText: DEMO_TEXT,
        visualObservations: ['비교 대상 없이 1위 배지가 크게 배치됨'],
        incomplete: false,
      });
    }
    const data = JSON.parse(parts.find((part) => part.text)!.text!);
    if (data.packs) {
      if (behaviour.prepare === 'fail')
        return new Response('', { status: 500 });
      return vertexJson({
        category: 'GENERAL_ADVERTISING',
        contentType: data.contentType,
        uncertain: false,
        truncated: false,
        claims: [
          {
            packId: 'GENERAL_ADVERTISING',
            quote: '업무 시간을 70% 줄여주는 국내 최고의 AI 서비스',
            claimType: 'OBJECTIVE_PERFORMANCE',
            contextRole: 'ADVERTISING',
          },
        ],
      });
    }
    if (behaviour.findings === 'fail') return new Response('', { status: 500 });
    const items = data.items as ComplianceReasoningInput['items'];
    return vertexJson({
      findings: items.map((item) => {
        const chunk = item.retrievedChunks[0];
        return {
          claimId: item.claim.id,
          disposition: 'ISSUE',
          severity: 'HIGH',
          issueType:
            item.claim.claimType === 'SUPERIORITY'
              ? 'COMPARATIVE_CLAIM'
              : 'EVIDENCE_REQUIRED',
          explanation: '수치와 우월성 표현의 근거 확인이 필요합니다.',
          sources: chunk
            ? [{ chunkId: chunk.id, quote: chunk.text.slice(0, 40) }]
            : [],
          requiredEvidence: ['측정 방법'],
          suggestedRewrites: ['반복 업무를 줄여 효율 개선을 지원합니다.'],
          resolutionType: 'PROVIDE_EVIDENCE',
          uncertaintyReason: '',
        };
      }),
    });
  });
}

const env = { VERTEX_API_KEY: 'vertex-secret', OPENAI_API_KEY: '' };

describe('production analysis chain', () => {
  it('produces a live result with 2–3 key issues for the representative demo', async () => {
    const analysis = createProductionAnalysis({ env, fetch: fakeVertex() });
    const result = ScanAnalysisResultSchema.parse(
      await analysis.measure(() =>
        analysis.text.analyzeContent({
          text: DEMO_TEXT,
          detectedContentType: 'ADVERTISEMENT_TEXT',
        }),
      ),
    );
    expect(result.metrics?.mode).toBe('live');
    expect(result.analysisModel).toBe('vertex/gemini-3.8-flash');
    expect(result.overallRisk).toBe('HIGH');
    // Rule claim "업무 시간을 70% 줄여주는" and the AI's full-sentence quote collapse
    // into one evidence issue; the superiority claim stays separate.
    expect(result.issues.length).toBeGreaterThanOrEqual(2);
    expect(result.issues.length).toBeLessThanOrEqual(3);
    expect(result.keyIssueIds.length).toBe(result.issues.length);
    expect(new Set(result.issues.map((issue) => issue.category))).toEqual(
      new Set(['EVIDENCE_REQUIRED', 'COMPARATIVE_CLAIM']),
    );
    expect(
      result.issues.every((issue) => issue.citationStatus === 'VERIFIED'),
    ).toBe(true);
    expect(result.metrics?.attempts.every((a) => a.outcome === 'success')).toBe(
      true,
    );
  });

  it('completes the demo through the rules pipeline when every AI call fails', async () => {
    const analysis = createProductionAnalysis({
      env,
      fetch: fakeVertex({ prepare: 'fail' }),
    });
    const result = ScanAnalysisResultSchema.parse(
      await analysis.measure(() =>
        analysis.text.analyzeContent({
          text: DEMO_TEXT,
          detectedContentType: 'ADVERTISEMENT_TEXT',
        }),
      ),
    );
    expect(result.metrics?.mode).toBe('offline');
    expect(result.analysisModel).toBe('rules-only');
    expect(result.notices[0]).toMatchObject({
      code: 'AI_UNAVAILABLE_RULES_ONLY',
      message: expect.stringContaining('AI_UNAVAILABLE'),
    });
    expect(result.issues.map((issue) => issue.category).sort()).toEqual([
      'COMPARATIVE_CLAIM',
      'EVIDENCE_REQUIRED',
    ]);
    expect(result.keyIssueIds).toHaveLength(2);
    expect(result.metrics?.attempts).toEqual([
      expect.objectContaining({ provider: 'vertex', outcome: 'error' }),
    ]);
  });

  it('keeps the rules fallback off when AI_RULES_FALLBACK=off', async () => {
    const analysis = createProductionAnalysis({
      env: { ...env, AI_RULES_FALLBACK: 'off' },
      fetch: fakeVertex({ findings: 'fail' }),
    });
    await expect(
      analysis.text.analyzeContent({
        text: DEMO_TEXT,
        detectedContentType: 'ADVERTISEMENT_TEXT',
      }),
    ).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
  });

  it('analyzes the demo image end to end and falls back only after extraction', async () => {
    const png = await readFile('public/demo-ad.png');
    const file = new File([png], 'demo-ad.png', { type: 'image/png' });

    const live = createProductionAnalysis({ env, fetch: fakeVertex() });
    const liveResult = ScanAnalysisResultSchema.parse(
      await live.measure(() => live.image.analyze(file, {})),
    );
    expect(liveResult.inputType).toBe('IMAGE');
    expect(liveResult.imageContent?.extractedText).toBe(DEMO_TEXT);
    expect(liveResult.metrics?.mode).toBe('live');
    expect(liveResult.issues.length).toBeGreaterThanOrEqual(2);

    const degraded = createProductionAnalysis({
      env,
      fetch: fakeVertex({ findings: 'fail' }),
    });
    const degradedResult = ScanAnalysisResultSchema.parse(
      await degraded.measure(() => degraded.image.analyze(file, {})),
    );
    expect(degradedResult.inputType).toBe('IMAGE');
    expect(degradedResult.metrics?.mode).toBe('offline');
    expect(degradedResult.notices.map((notice) => notice.code)).toEqual(
      expect.arrayContaining([
        'AI_UNAVAILABLE_RULES_ONLY',
        'IMAGE_EXTRACTION_LIMITS',
      ]),
    );

    const blind = createProductionAnalysis({
      env,
      fetch: fakeVertex({ vision: 'fail' }),
    });
    // OCR cannot be replaced by rules: the failure must surface, not a fake result.
    await expect(blind.image.analyze(file, {})).rejects.toMatchObject({
      code: 'AI_UNAVAILABLE',
    });
  });
});
