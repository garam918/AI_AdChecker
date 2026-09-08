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
      productName: '테스트정',
      expectedNumber: '200000001',
      expectedScope: '두통의 완화',
    },
    {
      category: 'MEDICAL_DEVICE' as const,
      row: {
        PRDUCT_PRMISN_NO: '제허00-001호',
        PRDUCT: '테스트 통증완화기',
        ENTRPS: '테스트메디칼',
        PRMISN_DT: '20200101',
        GRADE: '2등급',
        USE_PURPS: '근육통 완화에 사용',
      },
      productName: '테스트 통증완화기',
      expectedNumber: '제허00-001호',
      expectedScope: '근육통 완화에 사용',
    },
    {
      category: 'COSMETIC' as const,
      row: {
        COSMETIC_REPORT_SEQ: 'FC-001',
        ITEM_NAME: '테스트 미백크림',
        ENTP_NAME: '테스트코스메틱',
        REPORT_DATE: '20200101',
        EE_DOC_DATA: '피부의 미백에 도움',
      },
      productName: '테스트 미백크림',
      expectedNumber: 'FC-001',
      expectedScope: '피부의 미백에 도움',
    },
  ])('maps $category official product fields', async (fixture) => {
    const fetchImpl = vi.fn(async (_input: string | URL | Request) =>
      Response.json({
        header: { resultCode: '00', resultMsg: 'NORMAL SERVICE' },
        body: {
          items:
            fixture.category === 'MEDICAL_DEVICE'
              ? [{ item: fixture.row }]
              : { item: [fixture.row] },
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
        text: fixture.productName,
        detectedContentType: 'ADVERTISEMENT_TEXT',
        productIdentity: {
          productName: fixture.productName,
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
    const parsedRequestUrl = new URL(requestUrl);
    expect(parsedRequestUrl.searchParams.get('serviceKey')).toBe('server-key');
    if (fixture.category === 'MEDICAL_DEVICE') {
      expect(parsedRequestUrl.searchParams.get('PRDUCT')).toBe(
        fixture.productName,
      );
    }
    if (fixture.category === 'COSMETIC') {
      expect(parsedRequestUrl.searchParams.get('item_name')).toBe(
        fixture.productName,
      );
      expect(parsedRequestUrl.searchParams.has('RESPONSIBLE_SELLER_NM')).toBe(
        false,
      );
    }
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

  it.each([
    {
      category: 'MEDICAL_DEVICE' as const,
      identity: { permitNumber: '체외 제허 14-235 호' },
      queryKey: 'PRDUCT_PRMISN_NO',
      row: {
        PRDUCT_PRMISN_NO: '체외 제허 14-235 호',
        PRDUCT: '개인용혈당측정기',
        ENTRPS: '(주)올메디쿠스',
        USE_PURPS: '혈당을 측정하는 체외진단 의료기기',
      },
      responseItems: (row: Record<string, string | undefined>) => [
        { item: row },
      ],
    },
    {
      category: 'COSMETIC' as const,
      identity: { reviewNumber: '2012009455' },
      queryKey: 'cosmetic_report_seq',
      row: {
        COSMETIC_REPORT_SEQ: '2012009455',
        ITEM_NAME: '페리페라아쿠아원더선크림',
        ENTP_NAME: '(주)코스메카코리아',
        EE_DOC_DATA: '자외선으로부터 피부를 보호한다.',
      },
      responseItems: (row: Record<string, string | undefined>) => ({
        item: [row],
      }),
    },
  ])(
    'uses the official $category identifier query field',
    async ({ category, identity, queryKey, row, responseItems }) => {
      const fetchImpl = vi.fn(async (_input: string | URL | Request) =>
        Response.json({
          header: { resultCode: '00', resultMsg: 'NORMAL SERVICE' },
          body: { items: responseItems(row) },
        }),
      );
      const resolver = new MfdsRegulatedProductAuthorizationResolver(
        'server-key',
        { [category]: 'https://example.test/items' },
        fetchImpl,
      );

      const result = await resolver.resolve(
        {
          text: '규제 제품',
          detectedContentType: 'ADVERTISEMENT_TEXT',
          productIdentity: identity,
        },
        category,
      );

      const request = fetchImpl.mock.calls[0]?.[0];
      const requestUrl = new URL(
        request instanceof Request
          ? request.url
          : request instanceof URL
            ? request.toString()
            : request,
      );
      expect(requestUrl.searchParams.get(queryKey)).toBe(
        Object.values(identity)[0],
      );
      expect(result.status).toBe('VERIFIED');
      expect(result.selectedProduct?.reportNumber).toBe(
        Object.values(identity)[0],
      );
    },
  );
});
