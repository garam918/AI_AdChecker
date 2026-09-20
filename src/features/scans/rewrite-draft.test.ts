import { describe, expect, it } from 'vitest';
import type { Issue } from '@/src/compliance/core/schemas';
import {
  buildRewriteOptions,
  defaultRewriteId,
} from '@/src/compliance/core/rewrite-options';
import { applyDraftEdits, removeFlaggedClaims } from './rewrite-draft';

function issue(
  id: string,
  originalText: string,
  suggestedRewrites: string[] = ['업무를 돕는'],
): Issue {
  return {
    id,
    scanId: 'scan',
    claimId: id,
    packId: 'GENERAL_ADVERTISING',
    severity: 'HIGH',
    category: 'EVIDENCE_REQUIRED',
    originalText,
    explanation: '근거 확인 필요',
    regulationSourceIds: ['source'],
    sourceChunkIds: ['source'],
    citationStatus: 'VERIFIED',
    uncertaintyReason: null,
    suggestedRewrites,
    requiredEvidence: ['실증 자료'],
    resolutionType: 'PROVIDE_EVIDENCE',
    similarEnforcementCaseIds: [],
  };
}

describe('rewrite options and draft edits', () => {
  it('requires an explicit choice instead of preselecting deletion or generated text', () => {
    expect(defaultRewriteId(issue('a', '국내 최고의', ['업무를 돕는']))).toBe(
      '',
    );
    expect(defaultRewriteId(null)).toBe('');
  });
  it('does not auto-apply placeholders, rankings or new awards', () => {
    const found = issue('a', '국내 최고의', [
      '[확인된 수상/평가 내역] 선정 AI 서비스',
      '국내 유수의 AI 서비스',
      '99% 정확한 서비스',
      '자체 테스트 환경과 측정 조건을 명시한 뒤 확인된 결과를 안내합니다.',
    ]);
    const options = buildRewriteOptions(found);
    expect(options.map((item) => item.kind)).toEqual([
      'REMOVE',
      'CONDITIONAL',
      'CONDITIONAL',
      'CONDITIONAL',
      'CONDITIONAL',
    ]);
    expect(
      applyDraftEdits('국내 최고의 AI 서비스', [
        { issue: found, option: options[1] },
      ]),
    ).toMatchObject({ text: '국내 최고의 AI 서비스', appliedIssueIds: [] });
  });

  it('finishes the audited SaaS demo without inventing evidence or repeating the suffix', () => {
    const text = '업무 시간을 70% 줄여주는 국내 최고의 AI 서비스';
    const edits = [
      issue('performance', '업무 시간을 70% 줄여주는', [
        '[확인된 조건] 기준 업무 시간 최대 70% 단축 확인',
      ]),
      issue('rank', '국내 최고의', ['[확인된 수상/평가 내역] 선정 AI 서비스']),
    ];
    expect(removeFlaggedClaims(text, edits)).toEqual({
      text: 'AI 서비스',
      appliedIssueIds: ['rank', 'performance'],
      skipped: [],
    });
  });

  it('consumes only a matching whole-word suffix when applying an AI suggestion', () => {
    const found = issue('a', '국내 최고의', ['업무를 돕는 AI 서비스']);
    const option = buildRewriteOptions(found)[1];
    expect(
      applyDraftEdits('국내 최고의 AI 서비스', [{ issue: found, option }]).text,
    ).toBe('업무를 돕는 AI 서비스');
    expect(
      applyDraftEdits('국내 최고의 AI 서비스업체', [{ issue: found, option }])
        .text,
    ).toBe('국내 최고의 AI 서비스업체');
  });

  it('preserves manual edits and refuses a stale claim', () => {
    const found = issue('a', '국내 최고의');
    expect(
      removeFlaggedClaims('이미 직접 고친 서비스 설명', [found]),
    ).toMatchObject({
      text: '이미 직접 고친 서비스 설명',
      appliedIssueIds: [],
    });
    expect(
      removeFlaggedClaims('팀 협업용 국내 최고의 AI 서비스', [found]).text,
    ).toBe('팀 협업용 AI 서비스');
    expect(
      removeFlaggedClaims('첫 줄  수동 편집\n\n국내 최고의 AI 서비스', [found])
        .text,
    ).toBe('첫 줄  수동 편집\n\n AI 서비스');
    expect(removeFlaggedClaims('  이미  고친 초안  ', [found]).text).toBe(
      '  이미  고친 초안  ',
    );
  });

  it('does not guess which of repeated quotes the user intended', () => {
    expect(
      removeFlaggedClaims('최고의 앱. 최고의 도구.', [issue('a', '최고의')]),
    ).toMatchObject({
      text: '최고의 앱. 최고의 도구.',
      appliedIssueIds: [],
      skipped: [{ issueId: 'a', reason: expect.stringContaining('여러 곳') }],
    });
  });

  it('applies the larger overlapping span once', () => {
    const result = removeFlaggedClaims('업무 시간을 70% 줄여주는 AI 서비스', [
      issue('a', '업무 시간을 70% 줄여주는'),
      issue('b', '70% 줄여주는'),
    ]);
    expect(result.text).toBe('AI 서비스');
    expect(result.appliedIssueIds).toEqual(['a']);
    expect(result.skipped).toHaveLength(1);
  });

  it('keeps the draft when deletion would erase all content', () => {
    expect(
      removeFlaggedClaims('국내 최고의', [issue('a', '국내 최고의')]),
    ).toMatchObject({ text: '국내 최고의', appliedIssueIds: [] });
  });

  it('does not turn unverified citations or visual observations into automatic text edits', () => {
    expect(
      buildRewriteOptions({
        ...issue('a', '의미가 불명확한 문구'),
        citationStatus: 'REVIEW_REQUIRED',
      }).every((item) => item.kind === 'MANUAL_REVIEW'),
    ).toBe(true);
    expect(
      buildRewriteOptions(issue('a', '[시각 관찰] 전후 비교 사진')).some(
        (item) => item.kind === 'REMOVE',
      ),
    ).toBe(false);
  });

  it('rejects a forged conditional option relabelled as an applicable rewrite', () => {
    const found = issue('a', '국내 최고의', ['[평가] 1위']);
    const option = {
      ...buildRewriteOptions(found)[1],
      kind: 'REPLACE' as const,
    };
    expect(
      applyDraftEdits('국내 최고의 AI 서비스', [{ issue: found, option }])
        .appliedIssueIds,
    ).toEqual([]);
  });
});
