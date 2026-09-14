import { describe, expect, it, vi } from 'vitest';
import { GeminiClient } from './gemini-client';
import { GeminiContentProvider } from './gemini-content-provider';
import { createContentComplianceScanService } from '@/src/server/regulatory-runtime';
import { generalAdvertisingCompliancePack } from '@/src/compliance/packs/general-advertising/general-advertising-compliance-pack';
import { FixtureWebContentExtractor } from '@/src/content/web/fixture-web-content-extractor';
import { UrlComplianceScanService } from '@/src/content/web/url-compliance-scan-service';
import type { ComplianceReasoningInput } from './compliance-reasoning-provider';

type Mode =
  | 'normal'
  | 'extra-claim'
  | 'bad-quote'
  | 'bad-source'
  | 'bad-source-quote'
  | 'pass'
  | 'missing-claim'
  | 'unknown'
  | 'article-in-prose';

function harness(mode: Mode = 'normal') {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async (_url, init) => {
      const body = JSON.parse(typeof init?.body === 'string' ? init.body : '');
      const data = JSON.parse(
        body.contents[0].parts.find((part: { text?: string }) => part.text)
          ?.text,
      );
      let output: unknown;
      if (data.packs)
        output = {
          category: mode === 'unknown' ? 'UNKNOWN' : 'GENERAL_ADVERTISING',
          contentType: data.contentType,
          uncertain: mode === 'unknown',
          truncated: false,
          claims: ['extra-claim', 'bad-quote'].includes(mode)
            ? [
                {
                  packId: 'GENERAL_ADVERTISING',
                  quote:
                    mode === 'bad-quote'
                      ? '원문에 없는 성과'
                      : '손이 닿기 전에 일이 끝납니다',
                  claimType: 'OBJECTIVE_PERFORMANCE',
                  contextRole: 'ADVERTISING',
                },
              ]
            : [],
        };
      else
        output = {
          findings: (data.items as ComplianceReasoningInput['items'])
            .map((item) => {
              const chunk = item.retrievedChunks[0];
              return {
                claimId: item.claim.id,
                disposition: mode === 'pass' ? 'PASS' : 'ISSUE',
                severity: 'MEDIUM',
                issueType: 'EVIDENCE_REQUIRED',
                explanation:
                  mode === 'article-in-prose'
                    ? '가상의 법 제999조에 위반됩니다.'
                    : '객관적 성과로 해석될 수 있어 적용 조건과 근거 확인이 필요합니다.',
                sources: chunk
                  ? [
                      {
                        chunkId:
                          mode === 'bad-source' ? 'invented-law' : chunk.id,
                        quote:
                          mode === 'bad-source-quote'
                            ? '이것은 검색된 법령에 존재하지 않는 인용문입니다.'
                            : chunk.text.slice(0, 100),
                      },
                    ]
                  : [],
                suggestedRewrites: ['[확인된 기능과 적용 조건]을 안내합니다.'],
                requiredEvidence: ['측정 조건과 원본 자료'],
                resolutionType: 'PROVIDE_EVIDENCE',
                uncertaintyReason: '',
              };
            })
            .slice(mode === 'missing-claim' ? 1 : 0),
        };
      return Response.json({
        candidates: [
          {
            finishReason: 'STOP',
            content: { parts: [{ text: JSON.stringify(output) }] },
          },
        ],
      });
    });
  const provider = new GeminiContentProvider(
    new GeminiClient({ apiKey: () => 'test-key', fetch: fetcher }),
  );
  return {
    provider,
    fetcher,
    service: createContentComplianceScanService(provider),
  };
}

describe('Gemini analysis through rules, retrieval and citation validation', () => {
  it('uses AI for text reasoning and rewrites while preserving deterministic claim detection', async () => {
    const { service, fetcher } = harness();
    const progress = vi.fn();
    const result = await service.analyzeContent(
      {
        text: '업무 시간을 70% 줄여주는 국내 최고의 AI 서비스',
        detectedContentType: 'ADVERTISEMENT_TEXT',
      },
      progress,
    );
    expect(result.analysisModel).toBe('gemini-3.8-flash');
    expect(result.claims.length).toBeGreaterThan(0); // AI returned no extra claims; deterministic detections survive.
    expect(
      result.issues.every((issue) => issue.citationStatus === 'VERIFIED'),
    ).toBe(true);
    expect(result.issues[0].suggestedRewrites).toEqual([
      '[확인된 기능과 적용 조건]을 안내합니다.',
    ]);
    expect(
      result.sources.every((source) => source.sourceUrl && source.documentId),
    ).toBe(true);
    expect(fetcher.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(progress.mock.calls.flat()).toEqual(
      expect.arrayContaining([
        'CLASSIFYING',
        'RETRIEVING',
        'ANALYZING',
        'VALIDATING',
      ]),
    );
  });

  it('adds implied claims that keyword rules missed, with exact source offsets', async () => {
    const { service } = harness('extra-claim');
    const text = '새로운 도구. 손이 닿기 전에 일이 끝납니다';
    const result = await service.analyze(text);
    const claim = result.claims.find(
      (claim) => claim.text === '손이 닿기 전에 일이 끝납니다',
    );
    expect(claim).toBeDefined();
    expect(text.slice(claim!.startOffset, claim!.endOffset)).toBe(claim!.text);
  });

  it('rejects hallucinated original text before retrieval', async () => {
    const { provider, fetcher } = harness('bad-quote');
    await expect(
      provider.prepareContent(
        { text: '일반 광고', detectedContentType: 'ADVERTISEMENT_TEXT' },
        [generalAdvertisingCompliancePack],
      ),
    ).rejects.toMatchObject({ code: 'AI_UNGROUNDED_CLAIM' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each(['bad-source', 'bad-source-quote', 'article-in-prose'] as const)(
    'downgrades unverified legal findings: %s',
    async (mode) => {
      const { service } = harness(mode);
      const result = await service.analyze('업무 시간을 70% 줄여드립니다');
      expect(result.overallRisk).toBe('REVIEW_REQUIRED');
      expect(result.sources).toHaveLength(0);
      expect(
        result.issues.every(
          (issue) => issue.citationStatus === 'REVIEW_REQUIRED',
        ),
      ).toBe(true);
      expect(JSON.stringify(result)).not.toContain('999');
      expect(result.issues[0].suggestedRewrites).not.toContain(
        '[확인된 기능과 적용 조건]을 안내합니다.',
      );
    },
  );

  it('allows contextual no-issue reasoning only with verified sources', async () => {
    const { service } = harness('pass');
    const result = await service.analyze(
      '업무 시간을 70% 줄여드립니다. 측정 조건은 별도 자료를 확인하세요.',
    );
    expect(result.claims.length).toBeGreaterThan(0);
    expect(result.issues).toHaveLength(0);
  });

  it('fails incomplete coverage instead of showing a partial success', async () => {
    const { service } = harness('missing-claim');
    await expect(
      service.analyze('업무 시간을 70% 줄여드립니다'),
    ).rejects.toMatchObject({ code: 'AI_INVALID_COVERAGE' });
  });

  it('keeps unknown categories in review without generating unsupported findings', async () => {
    const { service, fetcher } = harness('unknown');
    const result = await service.analyze('분류가 불명확한 상품');
    expect(result.overallRisk).toBe('REVIEW_REQUIRED');
    expect(result.activePacks).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('routes extracted URL content through the same Gemini pipeline with source sections', async () => {
    const { service, fetcher } = harness();
    const fixture = new FixtureWebContentExtractor();
    const urlService = new UrlComplianceScanService(
      { extract: vi.fn().mockRejectedValue(new Error('no network')) },
      fixture,
      service,
      true,
    );
    const result = await urlService.analyze({ fixtureId: 'ai-saas-landing' });
    expect(result.inputType).toBe('URL');
    expect(result.analysisModel).toBe('gemini-3.8-flash');
    expect(result.claims.every((claim) => Boolean(claim.sourceSectionId))).toBe(
      true,
    );
    expect(fetcher.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
