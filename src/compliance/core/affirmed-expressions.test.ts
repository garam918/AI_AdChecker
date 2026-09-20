import { describe, expect, it } from 'vitest';
import { affirmedExpressionMatches } from './affirmed-expressions';
import { extractGeneralAdvertisingClaimCandidates } from '../packs/general-advertising/claim-extractor';

describe('expression-scoped denials', () => {
  it.each([
    '국내 최고라고 주장하지 않습니다.',
    '업계 1위 또는 국내 최고라고 주장하지 않습니다.',
    '국내 최고의 표현을 사용하지 않습니다.',
  ])('does not flag an explicitly denied superiority claim: %s', (text) => {
    expect(extractGeneralAdvertisingClaimCandidates(text)).toEqual([]);
  });

  it.each([
    '국내 최고의 앱. 업계 1위라고 주장하지 않습니다.',
    '국내 최고의 앱이지만 효과를 보장하지 않습니다.',
    '업계 1위라고 주장하지 않지만 국내 최고의 앱입니다.',
    '국내 최고의 앱이며, 가격이 가장 낮다는 뜻은 아닙니다.',
  ])('preserves a positive claim beside a different disclaimer: %s', (text) => {
    expect(
      extractGeneralAdvertisingClaimCandidates(text).map((item) => item.text),
    ).toContain('국내 최고의');
  });

  it('keeps original offsets and repeated affirmed occurrences', () => {
    const text = '국내 최고가 아닙니다. 국내 최고 서비스. 국내 최고 플랫폼.';
    expect(
      affirmedExpressionMatches(text, /국내 최고/).map((match) => match.index),
    ).toEqual([13, 24]);
  });

  it('does not treat double-negation as a denial', () => {
    expect(
      affirmedExpressionMatches(
        '국내 최고가 아니라고 할 수 없습니다.',
        /국내 최고/,
      ),
    ).toHaveLength(1);
  });
});
