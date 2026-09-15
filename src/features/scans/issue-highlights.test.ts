import { describe, expect, it } from 'vitest';
import { createContentComplianceScanService } from '@/src/server/regulatory-runtime';
import { findIssueHighlights } from './issue-highlights';

describe('issue highlight ranges', () => {
  it('preserves original text exactly when rule and AI ranges overlap', async () => {
    const text = '업무 시간을 70% 줄여주는 국내 최고의 AI 서비스';
    const result = await createContentComplianceScanService().analyzeContent({
      text,
      detectedContentType: 'ADVERTISEMENT_TEXT',
    });
    const first = result.issues[0]!;
    const issues = [
      ...result.issues,
      { ...first, id: 'nested', originalText: '70% 줄여주는' },
    ];
    const matches = findIssueHighlights(text, issues, result.claims);
    expect(matches).toHaveLength(2);
    expect(
      matches.every(
        (item, index) => index === 0 || item.start >= matches[index - 1]!.end,
      ),
    ).toBe(true);
    expect(matches.map((item) => text.slice(item.start, item.end))).toEqual(
      matches.map((item) => item.issue.originalText),
    );
  });

  it('does not highlight a guessed occurrence when a merged quote is repeated', async () => {
    const result = await createContentComplianceScanService().analyzeContent({
      text: '국내 최고의 서비스',
      detectedContentType: 'ADVERTISEMENT_TEXT',
    });
    const issue = {
      ...result.issues[0]!,
      claimId: 'missing',
      originalText: '최고의',
    };
    expect(
      findIssueHighlights('최고의 서비스, 최고의 기능', [issue], []),
    ).toEqual([]);
    expect(
      findIssueHighlights('국내 최고의 서비스', [issue], []),
    ).toMatchObject([{ start: 3, end: 6 }]);
  });
});
