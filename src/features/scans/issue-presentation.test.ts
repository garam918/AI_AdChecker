import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  ScanAnalysisResultSchema,
  IssueSchema,
} from '@/src/compliance/core/schemas';
import { conciseIssueReason, issueNextAction } from './issue-presentation';
import { AnalysisCoverageBanner } from './analysis-coverage-banner';

describe('action-oriented presentation', () => {
  it('bounds the list explanation without rewriting its meaning', () => {
    const text = '조건과 근거를 확인하세요. '.repeat(20);
    expect(conciseIssueReason(text).length).toBeLessThanOrEqual(78);
    expect(conciseIssueReason('  조건을\n확인하세요. ')).toBe(
      '조건을 확인하세요.',
    );
  });
  it('does not suggest automatic editing for an unverified citation', () => {
    const item = IssueSchema.parse({
      id: 'issue',
      scanId: 'scan',
      claimId: 'claim',
      originalText: '국내 최고',
      explanation: '확인 필요',
      category: 'COMPARATIVE_CLAIM',
      severity: 'REVIEW_REQUIRED',
      citationStatus: 'REVIEW_REQUIRED',
      regulationSourceIds: [],
      suggestedRewrites: ['표현을 검토하세요.'],
      requiredEvidence: [],
      resolutionType: 'PROVIDE_EVIDENCE',
    });
    expect(issueNextAction(item)).toBe('근거를 확인한 뒤 직접 검토');
  });
  it('renders a prominent incomplete/no-hit message, not an approval', () => {
    const result = ScanAnalysisResultSchema.parse({
      detectedContentType: 'ADVERTISEMENT_TEXT',
      detectedCategory: 'GENERAL_ADVERTISING',
      overallRisk: 'LOW',
      analysisModel: 'rules-only',
      claims: [],
      issues: [],
      sources: [],
    });
    const html = renderToStaticMarkup(
      createElement(AnalysisCoverageBanner, { result }),
    );
    expect(html).toContain('부분 분석');
    expect(html).toContain('AI 문맥 검토 미완료');
    expect(html).toContain('위험이 낮거나 게시해도 된다는 뜻은 아닙니다');
  });
});
