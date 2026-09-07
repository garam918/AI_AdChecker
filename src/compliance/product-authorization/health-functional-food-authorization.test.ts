import { describe, expect, it } from 'vitest';

import { HealthFunctionalFoodAuthorizationResolver } from './health-functional-food-authorization';

const apiRow = {
  LCNS_NO: '1234',
  BSSH_NM: '테스트바이오',
  PRDLST_REPORT_NO: '20040020000123',
  PRDLST_NM: '테스트 면역 제품',
  PRMS_DT: '20240101',
  DISPOS: '정제',
  NTK_MTHD: '1일 1회, 1회 1정',
  PRIMARY_FNCLTY: '면역기능에 도움을 줄 수 있음',
  IFTKN_ATNT_MATR_CN: '이상사례 발생 시 섭취를 중단할 것',
  PRDLST_CDNM: '건강기능식품',
  INDIV_RAWMTRL_NM: '아연',
  PRODUCTION: '생산',
  LAST_UPDT_DTM: '20260101120000',
};

describe('HealthFunctionalFoodAuthorizationResolver', () => {
  it('matches the official product record by report number', async () => {
    const resolver = new HealthFunctionalFoodAuthorizationResolver(
      'test-key',
      async () =>
        new Response(
          JSON.stringify({
            I0030: {
              RESULT: { CODE: 'INFO-000', MSG: '정상 처리되었습니다.' },
              row: [apiRow],
            },
          }),
          { status: 200 },
        ),
    );

    const result = await resolver.resolve({
      text: '품목제조신고번호 20040020000123 면역력 강화',
      detectedContentType: 'ADVERTISEMENT_TEXT',
    });

    expect(result.status).toBe('VERIFIED');
    expect(result.selectedProduct).toMatchObject({
      productName: '테스트 면역 제품',
      primaryFunctionality: '면역기능에 도움을 줄 수 있음',
    });
  });

  it('does not guess authorization when the API key is missing', async () => {
    const resolver = new HealthFunctionalFoodAuthorizationResolver();
    const result = await resolver.resolve({
      text: '건강기능식품 면역력 강화',
      detectedContentType: 'ADVERTISEMENT_TEXT',
      productIdentity: { productName: '테스트 면역 제품' },
    });

    expect(result.status).toBe('UNAVAILABLE');
    expect(result.selectedProduct).toBeNull();
  });
});
