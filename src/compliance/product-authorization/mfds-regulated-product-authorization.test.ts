import { describe, expect, it, vi } from 'vitest';

import { MfdsRegulatedProductAuthorizationResolver } from './mfds-regulated-product-authorization';

describe('MfdsRegulatedProductAuthorizationResolver', () => {
  it.each([
    {
      category: 'PHARMACEUTICAL' as const,
      row: {
        ITEM_SEQ: '200000001',
        ITEM_NAME: '테스트정',
        ENTP_NAME: '테스트제약',
        ITEM_PERMIT_DATE: '20200101',
        ETC_OTC_CODE: '전문의약품',
        EE_DOC_DATA: '두통의 완화',
        UD_DOC_DATA: '1일 1회 복용',
      },
      expectedNumber: '200000001',
      expectedScope: '두통의 완화',
    },
    {
      category: 'MEDICAL_DEVICE' as const,
      row: {
        PRMSN_NO: '제허00-001호',
        PRDLST_NM: '테스트 통증완화기',
        ENTRPS_NM: '테스트메디칼',
        PRMSN_YMD: '20200101',
        GRADE: '2등급',
        USE_PURPS_CN: '근육통 완화에 사용',
      },
      expectedNumber: '제허00-001호',
      expectedScope: '근육통 완화에 사용',
    },
    {
      category: 'COSMETIC' as const,
      row: {
        RPT_SEQ: 'FC-001',
        PRDLST_NM: '테스트 미백크림',
        RESPONSIBLE_SELLER_NM: '테스트코스메틱',
        RPT_DE: '20200101',
        FNCLTY_NM: '피부의 미백에 도움',
      },
      expectedNumber: 'FC-001',
      expectedScope: '피부의 미백에 도움',
    },
  ])('maps $category official product fields', async (fixture) => {
    const fetchImpl = vi.fn(async (_input: string | URL | Request) =>
      Response.json({
        response: {
          header: { resultCode: '00', resultMsg: 'NORMAL SERVICE' },
          body: { items: { item: [fixture.row] } },
        },
      }),
    );
    const resolver = new MfdsRegulatedProductAuthorizationResolver(
      'server-key',
      { [fixture.category]: 'https://example.test/items' },
      fetchImpl,
    );

    const result = await resolver.resolve(
      {
        text: fixture.row.PRDLST_NM ?? fixture.row.ITEM_NAME ?? '',
        detectedContentType: 'ADVERTISEMENT_TEXT',
        productIdentity: {
          productName: fixture.row.PRDLST_NM ?? fixture.row.ITEM_NAME,
        },
      },
      fixture.category,
    );

    expect(result.status).toBe('VERIFIED');
    expect(result.selectedProduct).toMatchObject({
      category: fixture.category,
      reportNumber: fixture.expectedNumber,
      primaryFunctionality: fixture.expectedScope,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const request = fetchImpl.mock.calls[0]?.[0];
    const requestUrl =
      request instanceof Request
        ? request.url
        : request instanceof URL
          ? request.toString()
          : request;
    expect(requestUrl).toContain('serviceKey=server-key');
  });

  it('does not infer a product when the API is not configured', async () => {
    const resolver = new MfdsRegulatedProductAuthorizationResolver();
    const result = await resolver.resolve(
      {
        text: '의약품 테스트정',
        detectedContentType: 'ADVERTISEMENT_TEXT',
        productIdentity: { productName: '테스트정' },
      },
      'PHARMACEUTICAL',
    );

    expect(result.status).toBe('UNAVAILABLE');
    expect(result.selectedProduct).toBeNull();
    expect(result.candidates).toEqual([]);
  });
});
