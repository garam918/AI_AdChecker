import { describe, expect, it } from 'vitest';
import { hasExplicitNonRenewingTrial } from './trial-conditions';
import { createContentComplianceScanService } from '@/src/server/regulatory-runtime';

const disclosed =
  '이 앱은 무료 체험 14일을 제공합니다. 자동 결제는 없으며, 직접 유료 구독을 신청할 경우에만 매월 12,000원이 청구됩니다.';

describe('explicitly disclosed non-renewing trial', () => {
  it('does not allege missing conditions when they are present', async () => {
    expect(hasExplicitNonRenewingTrial(disclosed)).toBe(true);
    const result =
      await createContentComplianceScanService().analyze(disclosed);
    expect(result.issues).toEqual([]);
    expect(result.sources.length).toBeGreaterThan(0);
  });
  it.each([
    '무료 체험을 제공합니다.',
    disclosed.replace('14일', ''),
    disclosed.replace('매월 12,000원', '요금표 기준'),
    `${disclosed} 실제로는 자동으로 결제됩니다.`,
    `${disclosed} 별도 제품도 무료 체험을 제공합니다.`,
  ])(
    'retains review for missing, conflicting or multiple-offer terms: %s',
    (text) => {
      expect(hasExplicitNonRenewingTrial(text)).toBe(false);
    },
  );
});
