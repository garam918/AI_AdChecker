import { describe, expect, it } from 'vitest';

import type { Claim } from '../core/schemas';
import { RegulatoryQueryBuilder } from './regulatory-query-builder';

const baseClaim: Claim = {
  id: 'claim-1',
  scanId: 'scan-1',
  text: '경쟁사 대비 3배 빠릅니다',
  claimType: 'COMPARATIVE',
  startOffset: 0,
  endOffset: 16,
};

describe('RegulatoryQueryBuilder', () => {
  it('adds legal context rather than searching only the raw claim', () => {
    const query = new RegulatoryQueryBuilder().build(baseClaim);

    expect(query).toContain(baseClaim.text);
    expect(query).toContain('비교 대상');
    expect(query).toContain('비교 기준');
    expect(query).toContain('시험 조사');
  });
});
