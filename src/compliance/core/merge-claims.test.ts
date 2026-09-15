import { describe, expect, it } from 'vitest';

import type { PreparedClaim } from './compliance-analyzer';
import { mergeClaims } from './merge-claims';

const TEXT = '업무 시간을 70% 줄여주는 국내 최고의 AI 서비스';

function claim(
  text: string,
  claimType: string,
  extra: Partial<PreparedClaim> = {},
): PreparedClaim {
  const startOffset = TEXT.indexOf(text);
  return {
    text,
    claimType,
    startOffset,
    endOffset: startOffset + text.length,
    ...extra,
  };
}

describe('mergeClaims', () => {
  it('merges a rule claim with the longer AI quote covering the same span', () => {
    const merged = mergeClaims(
      [
        claim('70% 줄여주는', 'NUMERICAL', { signals: ['percent'] }),
        claim('업무 시간을 70% 줄여주는', 'OBJECTIVE_PERFORMANCE', {
          contextText: '전체 문맥',
        }),
      ],
      'GENERAL_ADVERTISING',
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      text: '업무 시간을 70% 줄여주는',
      claimType: 'OBJECTIVE_PERFORMANCE',
      signals: ['percent'],
      contextText: '전체 문맥',
    });
  });

  it('keeps distinct expressions and different claim types apart', () => {
    const merged = mergeClaims(
      [
        claim('업무 시간을 70% 줄여주는', 'OBJECTIVE_PERFORMANCE'),
        claim('국내 최고의', 'SUPERIORITY'),
        claim('국내 최고의 AI 서비스', 'GENERAL_MARKETING'),
      ],
      'GENERAL_ADVERTISING',
    );
    expect(merged.map((item) => item.claimType)).toEqual([
      'OBJECTIVE_PERFORMANCE',
      'SUPERIORITY',
      'GENERAL_MARKETING',
    ]);
  });

  it('never merges a testimonial or warning into an advertising claim', () => {
    const merged = mergeClaims(
      [
        claim('국내 최고의', 'SUPERIORITY'),
        claim('국내 최고의', 'SUPERIORITY', { contextRole: 'TESTIMONIAL' }),
      ],
      'GENERAL_ADVERTISING',
    );
    expect(merged).toHaveLength(2);
  });

  it('does not apply advertising aliases to other packs', () => {
    const merged = mergeClaims(
      [claim('70% 줄여주는', 'NUMERICAL')],
      'GENERAL_FOOD',
    );
    expect(merged[0].claimType).toBe('NUMERICAL');
  });
});
