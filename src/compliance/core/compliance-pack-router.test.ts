import { describe, expect, it } from 'vitest';

import { generalAdvertisingCompliancePack } from '@/src/compliance/packs/general-advertising/general-advertising-compliance-pack';
import { generalFoodCompliancePack } from '@/src/compliance/packs/general-food/general-food-compliance-pack';
import { CompliancePackRouter } from './compliance-pack-router';

const router = new CompliancePackRouter([
  generalAdvertisingCompliancePack,
  generalFoodCompliancePack,
]);

const route = (text: string) =>
  router.route({ text, detectedContentType: 'ADVERTISEMENT_TEXT' });

describe('CompliancePackRouter', () => {
  it('composes general advertising and general food for food content', () => {
    const result = route('국내 1위 혈당 개선 차');

    expect(result.detectedCategory).toBe('GENERAL_FOOD');
    expect(result.activePacks.map((pack) => pack.metadata.id)).toEqual([
      'GENERAL_ADVERTISING',
      'GENERAL_FOOD',
    ]);
  });

  it('routes software with health wording to general advertising only', () => {
    const result = route('혈당 관리 SaaS 서비스');

    expect(result.detectedCategory).toBe('GENERAL_ADVERTISING');
    expect(result.activePacks.map((pack) => pack.metadata.id)).toEqual([
      'GENERAL_ADVERTISING',
    ]);
  });

  it('returns no active packs for excluded product classes', () => {
    const result = route('건강기능식품 면역력 제품');

    expect(result.detectedCategory).toBe('UNKNOWN');
    expect(result.activePacks).toEqual([]);
  });
});
