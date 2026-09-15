import { describe, expect, it } from 'vitest';
import { getComparisonState } from './review-comparison';

describe('review comparison scope', () => {
  it('does not count image observations outside OCR as deleted advertising copy', () => {
    expect(
      getComparisonState(
        '[시각 관찰] 강조 배치',
        '광고 문구',
        '수정한 광고 문구',
        [],
      ),
    ).toBe('NOT_IN_TEXT');
  });
  it('distinguishes removed, redetected and unchanged-but-not-detected text', () => {
    expect(
      getComparisonState('최고의', '최고의 서비스', '협업 서비스', []),
    ).toBe('REMOVED');
    expect(
      getComparisonState('최고의', '최고의 서비스', '최고의 서비스', [
        '최고의 서비스',
      ]),
    ).toBe('REDETECTED');
    expect(
      getComparisonState('최고의', '최고의 서비스', '최고의 서비스', []),
    ).toBe('NOT_DETECTED');
  });
});
