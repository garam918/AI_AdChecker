import { describe, expect, it } from 'vitest';

import { detectGeneralFoodCategory } from './category-detector';

const detect = (text: string) =>
  detectGeneralFoodCategory({
    text,
    detectedContentType: 'ADVERTISEMENT_TEXT',
  });

describe('detectGeneralFoodCategory', () => {
  it('detects general-food identity independently from health keywords', () => {
    expect(detect('구수하게 즐기는 무가당 보리차')).toMatchObject({
      category: 'GENERAL_FOOD',
      disposition: 'MATCH',
    });
  });

  it('does not treat a blood-sugar SaaS as food', () => {
    expect(detect('혈당 관리 SaaS 서비스')).toMatchObject({
      disposition: 'NO_MATCH',
    });
  });

  it('keeps a health claim without product identity uncertain', () => {
    expect(detect('혈당 관리와 면역력 개선을 연구합니다')).toMatchObject({
      category: 'UNKNOWN',
      disposition: 'UNCERTAIN',
    });
  });

  it('keeps excluded product classes outside this pack', () => {
    expect(detect('건강기능식품 면역력 제품')).toMatchObject({
      category: 'UNKNOWN',
      disposition: 'UNCERTAIN',
    });
  });

  it('does not mistake a denied product class for an affirmative identity', () => {
    expect(
      detect('일반식품 과일 음료입니다. 건강기능식품이 아닙니다.'),
    ).toMatchObject({
      category: 'GENERAL_FOOD',
      disposition: 'MATCH',
    });
    expect(detect('일반식품과 달리 건강기능식품입니다.')).toMatchObject({
      category: 'UNKNOWN',
      disposition: 'UNCERTAIN',
    });
  });
});
