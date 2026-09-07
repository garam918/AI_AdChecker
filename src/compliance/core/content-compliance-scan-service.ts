import type {
  ComplianceAnalysisInput,
  ComplianceAnalyzer,
} from './compliance-analyzer';
import type {
  CompliancePackDefinition,
  PackContentInput,
} from './compliance-pack';
import { CompliancePackRouter } from './compliance-pack-router';
import {
  ScanAnalysisResultSchema,
  type Issue,
  type ScanAnalysisResult,
  type Severity,
} from './schemas';
import type { EnforcementCase } from '@/src/compliance/regulatory/enforcement-case-schemas';
import type { EnforcementCaseRepository } from '@/src/compliance/regulatory/local-enforcement-case-repository';
import type { ProductAuthorizationResolution } from '@/src/compliance/product-authorization/schemas';
import type { ProductAuthorizationResolver } from '@/src/compliance/product-authorization/health-functional-food-authorization';

const AUTHORIZATION_CATEGORIES = [
  'HEALTH_FUNCTIONAL_FOOD',
  'PHARMACEUTICAL',
  'MEDICAL_DEVICE',
  'COSMETIC',
] as const;

export type PackAnalyzerRegistration = {
  pack: CompliancePackDefinition;
  analyzer: ComplianceAnalyzer;
};

export class ContentComplianceScanService implements ComplianceAnalyzer {
  private readonly router: CompliancePackRouter;

  constructor(
    private readonly registrations: readonly PackAnalyzerRegistration[],
    private readonly enforcementCaseRepository?: EnforcementCaseRepository,
    private readonly productAuthorizationResolver?: ProductAuthorizationResolver,
  ) {
    this.router = new CompliancePackRouter(
      registrations.map((registration) => registration.pack),
    );
  }

  async analyze(input: ComplianceAnalysisInput) {
    const text = typeof input === 'string' ? input : input.text;
    return this.analyzeContent({
      text,
      detectedContentType: 'ADVERTISEMENT_TEXT',
    });
  }

  async analyzeContent(input: PackContentInput): Promise<ScanAnalysisResult> {
    const normalizedText = input.text.trim();
    if (!normalizedText) throw new Error('분석할 광고 문구를 입력해 주세요.');

    const routed = this.router.route({ ...input, text: normalizedText });
    if (routed.detectedCategory === 'UNKNOWN') {
      return ScanAnalysisResultSchema.parse({
        detectedContentType: input.detectedContentType,
        detectedCategory: 'UNKNOWN',
        overallRisk: 'REVIEW_REQUIRED',
        claims: [],
        issues: [],
        sources: [],
        activePacks: [],
        notices: [
          {
            code: 'UNKNOWN_CATEGORY',
            message:
              '제품 유형을 지원 범위 안에서 확정하지 못했습니다. 제품 분류를 확인해 주세요.',
          },
        ],
      });
    }

    const productAuthorization = AUTHORIZATION_CATEGORIES.includes(
      routed.detectedCategory as (typeof AUTHORIZATION_CATEGORIES)[number],
    )
      ? await this.resolveProductAuthorization(input, routed.detectedCategory)
      : undefined;

    const results = await Promise.all(
      routed.activePacks.map(async (pack) => {
        const registration = this.registrations.find(
          (candidate) => candidate.pack.metadata.id === pack.metadata.id,
        );
        if (!registration) {
          throw new Error(
            `${pack.metadata.id} analyzer가 등록되지 않았습니다.`,
          );
        }
        const claims = pack.extractClaims(input);
        return registration.analyzer.analyze({
          text: normalizedText,
          claims,
          productAuthorization,
        });
      }),
    );

    return this.mergeResults(
      input,
      routed.detectedCategory,
      results,
      productAuthorization,
    );
  }

  private async resolveProductAuthorization(
    input: PackContentInput,
    category: ScanAnalysisResult['detectedCategory'],
  ) {
    if (this.productAuthorizationResolver) {
      return this.productAuthorizationResolver.resolve(input, category);
    }
    return undefined;
  }

  private async mergeResults(
    input: PackContentInput,
    detectedCategory: ScanAnalysisResult['detectedCategory'],
    results: ScanAnalysisResult[],
    productAuthorization?: ProductAuthorizationResolution,
  ) {
    const issues = deduplicateIssues(
      results.flatMap((result) => result.issues),
    );
    const enforcementCases: EnforcementCase[] = [];

    if (this.enforcementCaseRepository) {
      for (const issue of issues) {
        const matches = await this.enforcementCaseRepository.findRelevantCases(
          issue.packId,
          issue.category,
        );
        issue.similarEnforcementCaseIds = matches.map((match) => match.id);
        enforcementCases.push(...matches);
      }
    }

    const uniqueSources = uniqueBy(
      results.flatMap((result) => result.sources),
      (source) => source.id,
    );
    const uniqueCases = uniqueBy(enforcementCases, (item) => item.id);
    const debugResults = results
      .map((result) => result.debug)
      .filter((debug): debug is NonNullable<ScanAnalysisResult['debug']> =>
        Boolean(debug),
      );

    const notices = createProductAuthorizationNotices(
      detectedCategory,
      productAuthorization,
    );
    const issueRisk = calculateOverallRisk(issues);
    const overallRisk =
      AUTHORIZATION_CATEGORIES.includes(
        detectedCategory as (typeof AUTHORIZATION_CATEGORIES)[number],
      ) &&
      productAuthorization?.status !== 'VERIFIED' &&
      issueRisk === 'LOW'
        ? 'REVIEW_REQUIRED'
        : issueRisk;

    return ScanAnalysisResultSchema.parse({
      detectedContentType: input.detectedContentType,
      detectedCategory,
      overallRisk,
      claims: results.flatMap((result) => result.claims),
      issues,
      sources: uniqueSources,
      enforcementCases: uniqueCases,
      activePacks: unique(results.flatMap((result) => result.activePacks)),
      productAuthorization,
      notices,
      ...(debugResults.length > 0 && {
        debug: {
          queries: debugResults.flatMap((debug) => debug.queries),
          retrieved: debugResults.flatMap((debug) => debug.retrieved),
          selectedSourceChunkIds: debugResults.flatMap(
            (debug) => debug.selectedSourceChunkIds,
          ),
          rejectedCitations: debugResults.flatMap(
            (debug) => debug.rejectedCitations,
          ),
        },
      }),
    });
  }
}

function createProductAuthorizationNotices(
  detectedCategory: ScanAnalysisResult['detectedCategory'],
  authorization?: ProductAuthorizationResolution,
): ScanAnalysisResult['notices'] {
  if (
    !AUTHORIZATION_CATEGORIES.includes(
      detectedCategory as (typeof AUTHORIZATION_CATEGORIES)[number],
    )
  ) {
    return [];
  }
  const priorReviewMessage = {
    HEALTH_FUNCTIONAL_FOOD:
      '건강기능식품 광고는 식품표시광고법 제10조 및 같은 법 시행규칙 제10조에 따라, 법정 표시사항만 그대로 안내하는 예외 등을 제외하고 게시 전 자율심의 대상입니다. 심의 결과와 실제 게시 문구의 일치 여부를 별도로 확인하세요.',
    PHARMACEUTICAL:
      '의약품 광고는 약사법 제68조의2 및 의약품안전규칙 제79조에 따른 광고심의 대상 매체인지 확인해야 합니다. 전문의약품 등은 일반 소비자 대상 광고 제한도 먼저 확인하세요.',
    MEDICAL_DEVICE:
      '의료기기 광고는 의료기기법 제25조에 따른 매체별 사전 자율심의 대상일 수 있습니다. 허가·인증·신고 내용만으로 구성된 광고 등 법정 예외와 실제 게시 문구의 일치 여부를 확인하세요.',
    COSMETIC: null,
  }[detectedCategory as (typeof AUTHORIZATION_CATEGORIES)[number]];
  const notices: ScanAnalysisResult['notices'] = priorReviewMessage
    ? [
        {
          code: 'PRIOR_REVIEW_REQUIRED',
          message: priorReviewMessage,
        },
      ]
    : [];
  if (!authorization) {
    notices.push({
      code: 'PRODUCT_AUTHORIZATION_UNAVAILABLE',
      message:
        '제품 허가정보 조회기가 연결되지 않아 기능성 범위를 대조하지 못했습니다.',
    });
    return notices;
  }
  const hasQuery = Boolean(
    authorization.query.reportNumber || authorization.query.productName,
  );
  const code =
    authorization.status === 'NOT_FOUND'
      ? 'PRODUCT_AUTHORIZATION_NOT_FOUND'
      : authorization.status === 'AMBIGUOUS'
        ? 'PRODUCT_AUTHORIZATION_AMBIGUOUS'
        : authorization.status === 'UNAVAILABLE' && !hasQuery
          ? 'PRODUCT_AUTHORIZATION_REQUIRED'
          : authorization.status === 'UNAVAILABLE'
            ? 'PRODUCT_AUTHORIZATION_UNAVAILABLE'
            : null;
  if (code) notices.push({ code, message: authorization.message });
  return notices;
}

export function deduplicateIssues(issues: Issue[]) {
  const merged = new Map<string, Issue>();
  issues.forEach((issue) => {
    const key = [
      issue.category,
      normalize(issue.originalText),
      [...issue.sourceChunkIds].sort().join(','),
    ].join(':');
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...issue });
      return;
    }
    merged.set(key, {
      ...existing,
      severity: higherSeverity(existing.severity, issue.severity),
      requiredEvidence: unique([
        ...existing.requiredEvidence,
        ...issue.requiredEvidence,
      ]),
      suggestedRewrites: unique([
        ...existing.suggestedRewrites,
        ...issue.suggestedRewrites,
      ]),
      similarEnforcementCaseIds: unique([
        ...existing.similarEnforcementCaseIds,
        ...issue.similarEnforcementCaseIds,
      ]),
    });
  });
  return [...merged.values()];
}

function calculateOverallRisk(issues: Issue[]): Severity {
  if (issues.length === 0) return 'LOW';
  return ['HIGH', 'MEDIUM', 'REVIEW_REQUIRED', 'LOW'].find((severity) =>
    issues.some((issue) => issue.severity === severity),
  ) as Severity;
}

function higherSeverity(left: Severity, right: Severity) {
  const order: Severity[] = ['LOW', 'REVIEW_REQUIRED', 'MEDIUM', 'HIGH'];
  return order.indexOf(left) >= order.indexOf(right) ? left : right;
}

function normalize(value: string) {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function uniqueBy<T>(values: T[], keyFor: (value: T) => string) {
  const result = new Map<string, T>();
  values.forEach((value) => result.set(keyFor(value), value));
  return [...result.values()];
}
