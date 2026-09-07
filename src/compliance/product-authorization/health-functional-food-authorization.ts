import type { PackContentInput } from '@/src/compliance/core/compliance-pack';
import type { DetectedCategory } from '@/src/content/web/schemas';

import {
  HealthFunctionalFoodAuthorizationSchema,
  ProductAuthorizationResolutionSchema,
  ProductIdentitySchema,
  type HealthFunctionalFoodAuthorization,
  type ProductAuthorizationResolution,
  type ProductIdentity,
} from './schemas';

const SERVICE_ID = 'I0030';
const SOURCE_NAME = '식품안전나라 건강기능식품 품목제조신고' as const;
const SOURCE_URL =
  'https://www.foodsafetykorea.go.kr/api/openApiInfo.do?menu_grp=MENU_GRP31&menu_no=661&show_cnt=10&start_idx=1&svc_no=I0030';

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface ProductAuthorizationResolver {
  resolve(
    input: PackContentInput,
    category?: DetectedCategory,
  ): Promise<ProductAuthorizationResolution>;
}

export class HealthFunctionalFoodAuthorizationResolver implements ProductAuthorizationResolver {
  constructor(
    private readonly apiKey?: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async resolve(input: PackContentInput) {
    const query = extractHealthFunctionalFoodIdentity(input);
    const base = {
      query,
      sourceName: SOURCE_NAME,
      sourceUrl: SOURCE_URL,
      checkedAt: new Date().toISOString(),
    };

    if (!query.reportNumber && !query.productName) {
      return ProductAuthorizationResolutionSchema.parse({
        ...base,
        status: 'UNAVAILABLE',
        selectedProduct: null,
        candidates: [],
        message: '허가정보 대조에 필요한 제품명 또는 품목제조번호가 없습니다.',
      });
    }

    if (!this.apiKey) {
      return ProductAuthorizationResolutionSchema.parse({
        ...base,
        status: 'UNAVAILABLE',
        selectedProduct: null,
        candidates: [],
        message:
          '식품안전나라 API 인증키가 설정되지 않아 허가정보를 조회하지 못했습니다.',
      });
    }

    try {
      const response = await this.fetchImpl(
        buildRequestUrl(this.apiKey, query),
        {
          headers: { accept: 'application/json' },
          signal: AbortSignal.timeout(7_000),
        },
      );
      if (!response.ok) {
        throw new Error(`식품안전나라 응답 오류(${response.status})`);
      }
      const payload: unknown = await response.json();
      const parsed = parseApiPayload(payload);
      if (parsed.code !== 'INFO-000' && parsed.code !== 'INFO-200') {
        throw new Error(parsed.message || parsed.code || '알 수 없는 API 오류');
      }

      const candidates = rankCandidates(parsed.rows, query).slice(0, 10);
      if (candidates.length === 0) {
        return ProductAuthorizationResolutionSchema.parse({
          ...base,
          status: 'NOT_FOUND',
          selectedProduct: null,
          candidates: [],
          message:
            '입력한 제품 정보와 일치하는 건강기능식품 품목제조신고를 찾지 못했습니다.',
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
          message:
            '동일하거나 유사한 제품이 여러 건 조회되었습니다. 품목제조번호를 입력해 제품을 확정해 주세요.',
        });
      }

      return ProductAuthorizationResolutionSchema.parse({
        ...base,
        status: 'VERIFIED',
        selectedProduct: resolvedCandidates[0],
        candidates: resolvedCandidates,
        message:
          '식품안전나라 품목제조신고 정보와 제품을 연결했습니다. 광고 문구를 주된 기능성과 대조합니다.',
      });
    } catch (error) {
      return ProductAuthorizationResolutionSchema.parse({
        ...base,
        status: 'UNAVAILABLE',
        selectedProduct: null,
        candidates: [],
        message: `식품안전나라 허가정보 조회를 완료하지 못했습니다: ${
          error instanceof Error ? error.message : '알 수 없는 오류'
        }`,
      });
    }
  }
}

export function extractHealthFunctionalFoodIdentity(
  input: PackContentInput,
): ProductIdentity {
  const structuredProduct = findStructuredProduct(
    input.webContent?.structuredData ?? [],
  );
  const reportNumberMatch = input.text.match(
    /품목(?:제조)?(?:신고|보고)?번호\s*[:：]?\s*([0-9-]{8,40})/,
  );
  const identity = {
    reportNumber: input.productIdentity?.reportNumber ?? reportNumberMatch?.[1],
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

function buildRequestUrl(apiKey: string, query: ProductIdentity) {
  const filter = query.reportNumber
    ? `PRDLST_REPORT_NO=${encodeURIComponent(query.reportNumber)}`
    : `PRDLST_NM=${encodeURIComponent(query.productName!)}`;
  return `https://openapi.foodsafetykorea.go.kr/api/${encodeURIComponent(apiKey)}/${SERVICE_ID}/json/1/100/${filter}`;
}

function parseApiPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return { code: '', message: '응답 형식이 올바르지 않습니다.', rows: [] };
  }
  const service = (payload as Record<string, unknown>)[SERVICE_ID];
  if (!service || typeof service !== 'object') {
    return { code: '', message: '서비스 응답을 찾지 못했습니다.', rows: [] };
  }
  const record = service as Record<string, unknown>;
  const result =
    record.RESULT && typeof record.RESULT === 'object'
      ? (record.RESULT as Record<string, unknown>)
      : {};
  const rows = Array.isArray(record.row)
    ? record.row.flatMap((row) => {
        const parsed = toAuthorization(row);
        return parsed ? [parsed] : [];
      })
    : [];
  return {
    code: typeof result.CODE === 'string' ? result.CODE : '',
    message: typeof result.MSG === 'string' ? result.MSG : '',
    rows,
  };
}

function toAuthorization(row: unknown) {
  if (!row || typeof row !== 'object') return null;
  const value = row as Record<string, unknown>;
  const string = (key: string) =>
    typeof value[key] === 'string' ? value[key] : '';
  const parsed = HealthFunctionalFoodAuthorizationSchema.safeParse({
    category: 'HEALTH_FUNCTIONAL_FOOD',
    authorizationType: '품목제조신고',
    licenseNumber: string('LCNS_NO'),
    companyName: string('BSSH_NM'),
    reportNumber: string('PRDLST_REPORT_NO'),
    productName: string('PRDLST_NM'),
    authorizationDate: string('PRMS_DT'),
    productForm: string('DISPOS'),
    intakeMethod: string('NTK_MTHD'),
    primaryFunctionality: string('PRIMARY_FNCLTY'),
    intakePrecautions: string('IFTKN_ATNT_MATR_CN'),
    productType: string('PRDLST_CDNM'),
    functionalIngredients: string('INDIV_RAWMTRL_NM'),
    productionStatus: string('PRODUCTION'),
    lastUpdatedAt: string('LAST_UPDT_DTM'),
  });
  return parsed.success ? parsed.data : null;
}

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

function findStructuredProduct(entries: unknown[]) {
  for (const entry of entries) {
    const objects = flattenStructuredData(entry);
    for (const object of objects) {
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
