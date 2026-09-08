import type { PackContentInput } from '@/src/compliance/core/compliance-pack';
import type { DetectedCategory } from '@/src/content/web/schemas';

import type { ProductAuthorizationResolver } from './health-functional-food-authorization';
import {
  HealthFunctionalFoodAuthorizationSchema,
  ProductAuthorizationResolutionSchema,
  ProductIdentitySchema,
  type HealthFunctionalFoodAuthorization,
  type ProductAuthorizationResolution,
  type ProductIdentity,
} from './schemas';

type SupportedCategory = Extract<
  DetectedCategory,
  'PHARMACEUTICAL' | 'MEDICAL_DEVICE' | 'COSMETIC'
>;

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

type ResolverConfig = {
  sourceName: string;
  sourceUrl: string;
  endpoint?: string;
  authorizationType: string;
  numberLabel: string;
  queryKeys: {
    reportNumber: string;
    productName: string;
    companyName?: string;
  };
};

export type MfdsAuthorizationEndpoints = Partial<
  Record<SupportedCategory, string>
>;

const CONFIG: Record<SupportedCategory, Omit<ResolverConfig, 'endpoint'>> = {
  PHARMACEUTICAL: {
    sourceName: '식품의약품안전처 의약품 제품 허가정보',
    sourceUrl: 'https://www.data.go.kr/data/15095677/openapi.do',
    authorizationType: '품목허가·신고',
    numberLabel: '품목기준코드',
    queryKeys: {
      reportNumber: 'item_seq',
      productName: 'item_name',
      companyName: 'entp_name',
    },
  },
  MEDICAL_DEVICE: {
    sourceName: '식품의약품안전처 의료기기 품목허가정보',
    sourceUrl: 'https://www.data.go.kr/data/15057456/openapi.do',
    authorizationType: '품목허가·인증·신고',
    numberLabel: '품목허가번호',
    queryKeys: {
      reportNumber: 'PRDUCT_PRMISN_NO',
      productName: 'PRDUCT',
      companyName: 'ENTRPS',
    },
  },
  COSMETIC: {
    sourceName: '식품의약품안전처 기능성화장품 심사·보고 품목정보',
    sourceUrl: 'https://www.data.go.kr/data/15095680/openapi.do',
    authorizationType: '기능성화장품 심사·보고',
    numberLabel: '심사·보고번호',
    queryKeys: {
      reportNumber: 'cosmetic_report_seq',
      productName: 'item_name',
    },
  },
};

export class MfdsRegulatedProductAuthorizationResolver implements ProductAuthorizationResolver {
  constructor(
    private readonly serviceKey?: string,
    private readonly endpoints: MfdsAuthorizationEndpoints = {},
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async resolve(
    input: PackContentInput,
    category?: DetectedCategory,
  ): Promise<ProductAuthorizationResolution> {
    if (!isSupportedCategory(category)) {
      throw new Error(`지원하지 않는 식약처 허가정보 유형입니다: ${category}`);
    }

    const config = { ...CONFIG[category], endpoint: this.endpoints[category] };
    const query = extractRegulatedProductIdentity(input, category);
    const base = {
      query,
      sourceName: config.sourceName,
      sourceUrl: config.sourceUrl,
      checkedAt: new Date().toISOString(),
    };

    if (!query.reportNumber && !query.productName) {
      return ProductAuthorizationResolutionSchema.parse({
        ...base,
        status: 'UNAVAILABLE',
        selectedProduct: null,
        candidates: [],
        message: `허가정보 대조에 필요한 제품명 또는 ${config.numberLabel}가 없습니다.`,
      });
    }

    if (!this.serviceKey || !config.endpoint) {
      return ProductAuthorizationResolutionSchema.parse({
        ...base,
        status: 'UNAVAILABLE',
        selectedProduct: null,
        candidates: [],
        message:
          '공공데이터포털 서비스키 또는 식약처 품목정보 API 주소가 설정되지 않아 공식 품목정보를 조회하지 못했습니다.',
      });
    }

    try {
      const response = await this.fetchImpl(
        buildRequestUrl(config.endpoint, this.serviceKey, config, query),
        {
          headers: { accept: 'application/json' },
          signal: AbortSignal.timeout(7_000),
        },
      );
      if (!response.ok) {
        throw new Error(`공공데이터포털 응답 오류(${response.status})`);
      }

      const payload: unknown = await response.json();
      const apiError = extractApiError(payload);
      if (apiError) throw new Error(apiError);
      const candidates = rankCandidates(
        extractRows(payload).flatMap((row) => {
          const parsed = toAuthorization(row, category, config);
          return parsed ? [parsed] : [];
        }),
        query,
      ).slice(0, 10);

      if (candidates.length === 0) {
        return ProductAuthorizationResolutionSchema.parse({
          ...base,
          status: 'NOT_FOUND',
          selectedProduct: null,
          candidates: [],
          message: `입력한 제품 정보와 일치하는 ${config.authorizationType} 정보를 찾지 못했습니다.`,
        });
      }

      const exactCandidates = candidates.filter((candidate) =>
        isExactMatch(candidate, query),
      );
      const resolvedCandidates =
        exactCandidates.length > 0 ? exactCandidates : candidates;
      if (resolvedCandidates.length !== 1) {
        return ProductAuthorizationResolutionSchema.parse({
          ...base,
          status: 'AMBIGUOUS',
          selectedProduct: null,
          candidates: resolvedCandidates,
          message: `유사한 제품이 여러 건 조회되었습니다. ${config.numberLabel}를 입력해 제품을 확정해 주세요.`,
        });
      }

      return ProductAuthorizationResolutionSchema.parse({
        ...base,
        status: 'VERIFIED',
        selectedProduct: resolvedCandidates[0],
        candidates: resolvedCandidates,
        message: `${config.sourceName}와 제품을 연결했습니다. 광고 표현을 공식 허가·심사 범위와 대조합니다.`,
      });
    } catch (error) {
      return ProductAuthorizationResolutionSchema.parse({
        ...base,
        status: 'UNAVAILABLE',
        selectedProduct: null,
        candidates: [],
        message: `공식 품목정보 조회를 완료하지 못했습니다: ${
          error instanceof Error ? error.message : '알 수 없는 오류'
        }`,
      });
    }
  }
}

export class CompositeProductAuthorizationResolver implements ProductAuthorizationResolver {
  constructor(
    private readonly healthFunctionalFoodResolver: ProductAuthorizationResolver,
    private readonly mfdsResolver: ProductAuthorizationResolver,
  ) {}

  resolve(input: PackContentInput, category?: DetectedCategory) {
    return category === 'HEALTH_FUNCTIONAL_FOOD'
      ? this.healthFunctionalFoodResolver.resolve(input, category)
      : this.mfdsResolver.resolve(input, category);
  }
}

export function extractRegulatedProductIdentity(
  input: PackContentInput,
  category: SupportedCategory,
): ProductIdentity {
  const structuredProduct = findStructuredProduct(
    input.webContent?.structuredData ?? [],
  );
  const numberPattern = {
    PHARMACEUTICAL:
      /(?:품목기준코드|품목허가번호|허가번호)\s*[:：]?\s*([A-Za-z0-9가-힣-]{4,80})/,
    MEDICAL_DEVICE:
      /(?:품목허가번호|인증번호|신고번호|허가번호)\s*[:：]?\s*([A-Za-z0-9가-힣-]{4,80})/,
    COSMETIC:
      /(?:심사번호|보고번호|보고일련번호)\s*[:：]?\s*([A-Za-z0-9가-힣-]{4,80})/,
  }[category];
  const numberMatch = input.text.match(numberPattern);
  const explicitNumber =
    input.productIdentity?.reportNumber ??
    (category === 'PHARMACEUTICAL'
      ? input.productIdentity?.itemCode
      : category === 'MEDICAL_DEVICE'
        ? input.productIdentity?.permitNumber
        : input.productIdentity?.reviewNumber);
  const identity = {
    reportNumber: explicitNumber ?? numberMatch?.[1],
    productName:
      input.productIdentity?.productName ?? structuredProduct.productName,
    companyName:
      input.productIdentity?.companyName ?? structuredProduct.companyName,
  };
  return ProductIdentitySchema.parse(
    Object.fromEntries(
      Object.entries(identity).filter(([, value]) => Boolean(value?.trim())),
    ),
  );
}

function buildRequestUrl(
  endpoint: string,
  serviceKey: string,
  config: ResolverConfig,
  query: ProductIdentity,
) {
  const url = new URL(endpoint);
  url.searchParams.set('serviceKey', serviceKey);
  url.searchParams.set('type', 'json');
  url.searchParams.set('pageNo', '1');
  url.searchParams.set('numOfRows', '100');
  if (query.reportNumber) {
    url.searchParams.set(config.queryKeys.reportNumber, query.reportNumber);
  } else if (query.productName) {
    url.searchParams.set(config.queryKeys.productName, query.productName);
  }
  if (query.companyName && config.queryKeys.companyName) {
    url.searchParams.set(config.queryKeys.companyName, query.companyName);
  }
  return url;
}

function extractRows(payload: unknown): Array<Record<string, unknown>> {
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  const response = asRecord(record.response) ?? record;
  const body = asRecord(response.body) ?? response;
  const items = asRecord(body.items)?.item ?? body.items ?? body.item;
  const rows = unwrapRows(items);
  if (rows.length > 0) return rows;

  for (const value of Object.values(body)) {
    const nestedRows = unwrapRows(value);
    if (nestedRows.length > 0) return nestedRows;
  }
  return [];
}

function extractApiError(payload: unknown) {
  const record = asRecord(payload);
  const response = asRecord(record?.response) ?? record;
  const header = asRecord(response?.header);
  const code = readString(header, 'resultCode', 'RESULT_CODE', 'code');
  if (
    !code ||
    ['00', '0000', '0', '03', 'NORMAL_SERVICE', 'NO_DATA'].includes(code)
  ) {
    return null;
  }
  return readString(header, 'resultMsg', 'RESULT_MSG', 'message') || code;
}

function toAuthorization(
  row: Record<string, unknown>,
  category: SupportedCategory,
  config: ResolverConfig,
) {
  const fields = FIELD_KEYS[category];
  const parsed = HealthFunctionalFoodAuthorizationSchema.safeParse({
    category,
    authorizationType: config.authorizationType,
    licenseNumber: readString(row, ...fields.licenseNumber),
    companyName: readString(row, ...fields.companyName),
    reportNumber: readString(row, ...fields.reportNumber),
    productName: readString(row, ...fields.productName),
    authorizationDate: readString(row, ...fields.authorizationDate),
    productForm: readString(row, ...fields.productForm),
    intakeMethod: readString(row, ...fields.intakeMethod),
    primaryFunctionality: readString(row, ...fields.primaryFunctionality),
    intakePrecautions: readString(row, ...fields.intakePrecautions),
    productType: readString(row, ...fields.productType),
    functionalIngredients: readString(row, ...fields.functionalIngredients),
    productionStatus: readString(row, ...fields.productionStatus),
    lastUpdatedAt: readString(row, ...fields.lastUpdatedAt),
  });
  if (
    !parsed.success ||
    (!parsed.data.productName && !parsed.data.reportNumber)
  ) {
    return null;
  }
  return parsed.data;
}

const FIELD_KEYS: Record<
  SupportedCategory,
  Record<
    keyof Omit<
      HealthFunctionalFoodAuthorization,
      'category' | 'authorizationType'
    >,
    string[]
  >
> = {
  PHARMACEUTICAL: {
    licenseNumber: ['BIZRNO', 'bizrno', 'PERMIT_NO', 'permitNo'],
    companyName: ['ENTP_NAME', 'entpName', 'entp_name'],
    reportNumber: ['ITEM_SEQ', 'itemSeq', 'item_seq'],
    productName: ['ITEM_NAME', 'itemName', 'item_name'],
    authorizationDate: ['ITEM_PERMIT_DATE', 'itemPermitDate', 'permit_date'],
    productForm: ['CHART', 'chart', 'FORM_CODE_NAME'],
    intakeMethod: ['UD_DOC_DATA', 'udDocData', 'USE_METHOD_QESITM'],
    primaryFunctionality: ['EE_DOC_DATA', 'eeDocData', 'EFCP_NM'],
    intakePrecautions: ['NB_DOC_DATA', 'nbDocData', 'ATPN_QESITM'],
    productType: ['ETC_OTC_CODE', 'etcOtcCode', 'PERMIT_KIND_NAME'],
    functionalIngredients: ['MATERIAL_NAME', 'materialName', 'MAIN_ITEM_INGR'],
    productionStatus: ['CANCEL_NAME', 'cancelName', 'STATE'],
    lastUpdatedAt: ['CHANGE_DATE', 'changeDate', 'LAST_UPDT_DTM'],
  },
  MEDICAL_DEVICE: {
    licenseNumber: ['BRNO', 'ENTRPS_NO', 'entrpsNo', 'BIZRNO'],
    companyName: ['ENTRPS', 'ENTRPS_NM', 'entrpsNm', 'ENTP_NAME'],
    reportNumber: [
      'PRDUCT_PRMISN_NO',
      'PRDLST_PRMSN_NO',
      'prdlstPrmsnNo',
      'PRMSN_NO',
      'PERMIT_NO',
    ],
    productName: ['PRDUCT', 'PRDLST_NM', 'prdlstNm', 'ITEM_NAME'],
    authorizationDate: ['PRMISN_DT', 'PRMSN_YMD', 'prmsnYmd', 'PERMIT_DATE'],
    productForm: ['TYPE_NAME', 'MDEQ_CLF_NM', 'mdeqClfNm', 'PRDLST_CL_NM'],
    intakeMethod: ['USE_MTHD_CN', 'useMthdCn', 'USAGE_MTHD'],
    primaryFunctionality: [
      'USE_PURPS',
      'USE_PURPS_CN',
      'usePurpsCn',
      'PERFORM_CN',
      'PURPOSE',
    ],
    intakePrecautions: ['USE_AT', 'useAt', 'CAUTION_CN'],
    productType: ['GRADE', 'grade', 'PRDLST_GRADE', 'MDEQ_DIVS_NM'],
    functionalIngredients: ['MTRAL_CN', 'mtralCn', 'MATERIAL_NAME'],
    productionStatus: [
      'RTRCN_DSCTN_DIVS_CD',
      'PRMSN_STATE_NM',
      'prmsnStateNm',
      'STATE',
    ],
    lastUpdatedAt: ['CHG_DT', 'LAST_UPDT_DTM', 'lastUpdtDtm', 'UPDATE_DATE'],
  },
  COSMETIC: {
    licenseNumber: [
      'BIZRNO',
      'ENTP_SEQ',
      'RESPONSIBLE_SELLER_REG_NO',
      'responsibleSellerRegNo',
      'MNFCTR_REG_NO',
    ],
    companyName: [
      'RESPONSIBLE_SELLER_NM',
      'responsibleSellerNm',
      'MNFCTR_NM',
      'ENTP_NAME',
    ],
    reportNumber: [
      'COSMETIC_REPORT_SEQ',
      'RPT_SEQ',
      'rptSeq',
      'EXAM_NO',
      'REPORT_NO',
      'ITEM_SEQ',
    ],
    productName: ['PRDLST_NM', 'prdlstNm', 'ITEM_NAME'],
    authorizationDate: ['RPT_DE', 'rptDe', 'EXAM_DE', 'REPORT_DATE'],
    productForm: [
      'COSMETIC_STD_NAME',
      'COSMETIC_TARGET_FLAG_NAME',
      'DOSAGE_FORM',
      'dosageForm',
      'FORM_NM',
    ],
    intakeMethod: [
      'USAGE_DOSAGE',
      'UD_DOC_DATA',
      'USE_MTHD',
      'useMthd',
      'USAGE_MTHD',
    ],
    primaryFunctionality: [
      'EE_DOC_DATA',
      'EE_NAME',
      'COSMETIC_STD_NAME',
      'FNCLTY_NM',
      'fncltyNm',
      'EXAM_RSLT',
      'FUNCTIONALITY',
      'PRDLST_SE_NM',
    ],
    intakePrecautions: [
      'NB_DOC_DATA',
      'USE_ATNT_MATR',
      'useAtntMatr',
      'CAUTION_CN',
    ],
    productType: [
      'REPORT_FLAG_NAME',
      'COSMETIC_TARGET_FLAG_NAME',
      'PRDLST_SE_NM',
      'prdlstSeNm',
      'REPORT_TYPE',
    ],
    functionalIngredients: ['MAIN_INGR_NM', 'mainIngrNm', 'MATERIAL_NAME'],
    productionStatus: ['CANCEL_APPROVAL_YN', 'STATE_NM', 'stateNm', 'STATE'],
    lastUpdatedAt: [
      'REPORT_DATE',
      'LAST_UPDT_DTM',
      'lastUpdtDtm',
      'UPDATE_DATE',
    ],
  },
};

function rankCandidates(
  candidates: HealthFunctionalFoodAuthorization[],
  query: ProductIdentity,
) {
  return [...candidates]
    .filter(
      (candidate) =>
        !query.companyName ||
        normalize(candidate.companyName) === normalize(query.companyName),
    )
    .sort((left, right) => score(right, query) - score(left, query));
}

function score(
  candidate: HealthFunctionalFoodAuthorization,
  query: ProductIdentity,
) {
  let value = 0;
  if (
    query.reportNumber &&
    normalize(candidate.reportNumber) === normalize(query.reportNumber)
  ) {
    value += 100;
  }
  if (
    query.productName &&
    normalize(candidate.productName) === normalize(query.productName)
  ) {
    value += 20;
  } else if (
    query.productName &&
    normalize(candidate.productName).includes(normalize(query.productName))
  ) {
    value += 10;
  }
  if (
    query.companyName &&
    normalize(candidate.companyName) === normalize(query.companyName)
  ) {
    value += 5;
  }
  return value;
}

function isExactMatch(
  candidate: HealthFunctionalFoodAuthorization,
  query: ProductIdentity,
) {
  if (query.reportNumber) {
    return normalize(candidate.reportNumber) === normalize(query.reportNumber);
  }
  return Boolean(
    query.productName &&
    normalize(candidate.productName) === normalize(query.productName) &&
    (!query.companyName ||
      normalize(candidate.companyName) === normalize(query.companyName)),
  );
}

function normalize(value: string) {
  return value
    .normalize('NFKC')
    .replace(/[\s-]+/g, '')
    .toLowerCase();
}

function readString(record: Record<string, unknown> | null, ...keys: string[]) {
  if (!record) return '';
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number') return String(value);
  }
  return '';
}

function asRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function unwrapRows(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.flatMap(unwrapRows);
  const record = asRecord(value);
  if (!record) return [];
  if ('item' in record) return unwrapRows(record.item);
  return [record];
}

function isSupportedCategory(
  category?: DetectedCategory,
): category is SupportedCategory {
  return (
    category === 'PHARMACEUTICAL' ||
    category === 'MEDICAL_DEVICE' ||
    category === 'COSMETIC'
  );
}

function findStructuredProduct(entries: unknown[]) {
  for (const entry of entries) {
    for (const object of flattenStructuredData(entry)) {
      const type = object['@type'];
      const types = Array.isArray(type) ? type : [type];
      if (!types.includes('Product')) continue;
      const productName =
        typeof object.name === 'string' ? object.name.trim() : undefined;
      const companyName = extractOrganizationName(
        object.manufacturer ?? object.brand,
      );
      if (productName || companyName) return { productName, companyName };
    }
  }
  return {};
}

function flattenStructuredData(value: unknown): Array<Record<string, unknown>> {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap(flattenStructuredData);
  const record = value as Record<string, unknown>;
  const graph = Array.isArray(record['@graph'])
    ? record['@graph'].flatMap(flattenStructuredData)
    : [];
  return [record, ...graph];
}

function extractOrganizationName(value: unknown) {
  if (typeof value === 'string') return value.trim();
  if (!value || typeof value !== 'object') return undefined;
  const name = (value as Record<string, unknown>).name;
  return typeof name === 'string' ? name.trim() : undefined;
}
