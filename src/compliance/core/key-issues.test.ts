import { describe, expect, it } from 'vitest';

import { consolidateIssues, rankIssues, selectKeyIssueIds } from './key-issues';
import type { Issue } from './schemas';

function issue(overrides: Partial<Issue> & { id: string }): Issue {
  return {
    scanId: 'scan',
    claimId: `claim-${overrides.id}`,
    packId: 'GENERAL_ADVERTISING',
    severity: 'HIGH',
    category: 'EVIDENCE_REQUIRED',
    originalText: '업무 시간을 70% 줄여주는',
    explanation: '설명',
    regulationSourceIds: ['chunk-a'],
    sourceChunkIds: ['chunk-a'],
    citationStatus: 'VERIFIED',
    uncertaintyReason: null,
    suggestedRewrites: ['수정안 A'],
    requiredEvidence: ['테스트 방법'],
    resolutionType: 'PROVIDE_EVIDENCE',
    similarEnforcementCaseIds: [],
    ...overrides,
  };
}

describe('consolidateIssues', () => {
  it('folds a nested quote of the same category into one issue with merged sources', () => {
    const result = consolidateIssues([
      issue({ id: 'rule', originalText: '70% 줄여주는', severity: 'MEDIUM' }),
      issue({
        id: 'ai',
        originalText: '업무 시간을 70% 줄여주는',
        regulationSourceIds: ['chunk-b'],
        sourceChunkIds: ['chunk-b'],
        suggestedRewrites: ['수정안 B'],
      }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'rule',
      originalText: '업무 시간을 70% 줄여주는',
      severity: 'HIGH',
      sourceChunkIds: ['chunk-b', 'chunk-a'],
      suggestedRewrites: ['수정안 B', '수정안 A'],
    });
  });

  it('prefers the verified issue when an unverified duplicate overlaps', () => {
    const result = consolidateIssues([
      issue({
        id: 'unverified',
        citationStatus: 'REVIEW_REQUIRED',
        severity: 'REVIEW_REQUIRED',
        regulationSourceIds: [],
        sourceChunkIds: [],
        explanation: '근거 부족',
      }),
      issue({ id: 'verified', explanation: '검증된 설명' }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      citationStatus: 'VERIFIED',
      explanation: '검증된 설명',
      severity: 'HIGH',
    });
  });

  it('keeps different categories and different expressions separate', () => {
    const result = consolidateIssues([
      issue({ id: 'a' }),
      issue({ id: 'b', category: 'COMPARATIVE_CLAIM' }),
      issue({ id: 'c', originalText: '국내 최고의' }),
    ]);
    expect(result.map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('rankIssues and selectKeyIssueIds', () => {
  it('orders by severity, then verified citation, then original position', () => {
    const ranked = rankIssues([
      issue({ id: 'low', severity: 'LOW' }),
      issue({ id: 'review', severity: 'REVIEW_REQUIRED' }),
      issue({
        id: 'high-unverified',
        citationStatus: 'REVIEW_REQUIRED',
        regulationSourceIds: [],
        sourceChunkIds: [],
      }),
      issue({ id: 'high-verified' }),
      issue({ id: 'medium', severity: 'MEDIUM' }),
    ]);
    expect(ranked.map((item) => item.id)).toEqual([
      'high-verified',
      'high-unverified',
      'medium',
      'review',
      'low',
    ]);
  });

  it('picks at most three key issues covering distinct categories first', () => {
    const ranked = rankIssues([
      issue({ id: 'ev-1' }),
      issue({ id: 'ev-2', originalText: '99% 정확도' }),
      issue({ id: 'cmp', category: 'COMPARATIVE_CLAIM' }),
      issue({
        id: 'food',
        packId: 'GENERAL_FOOD',
        category: 'HEALTH_FUNCTIONAL_FOOD_CONFUSION',
        severity: 'MEDIUM',
      }),
      issue({ id: 'ev-3', originalText: '3배 빠른', severity: 'MEDIUM' }),
    ]);
    expect(selectKeyIssueIds(ranked)).toEqual(['ev-1', 'cmp', 'food']);
  });

  it('fills remaining slots by rank when fewer categories exist', () => {
    const ranked = rankIssues([
      issue({ id: 'a' }),
      issue({ id: 'b', originalText: '다른 문구' }),
    ]);
    expect(selectKeyIssueIds(ranked)).toEqual(['a', 'b']);
  });
});
