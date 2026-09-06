import { describe, expect, it } from 'vitest';

import type { Claim } from '@/src/compliance/core/schemas';
import { GeneralFoodRetrievalQueryBuilder } from './retrieval-query-builder';

describe('GeneralFoodRetrievalQueryBuilder', () => {
  it('adds product and taxonomy context without hard-coded article numbers', () => {
    const claim: Claim = {
      id: 'claim-1',
      scanId: 'scan-1',
      text: '혈당 관리',
      claimType: 'HEALTH_FUNCTIONAL_FOOD_CONFUSION',
      startOffset: 0,
      endOffset: 5,
    };

    const query = new GeneralFoodRetrievalQueryBuilder().build(claim);

    expect(query).toContain('일반식품');
    expect(query).toContain('건강기능식품 오인');
    expect(query).toContain('혈당 관리');
    expect(query).not.toMatch(/제\d+조/);
  });
});
