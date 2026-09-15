import { z } from 'zod';

import type { PackContentInput } from '@/src/compliance/core/compliance-pack';
import type { ScanAnalysisResult } from '@/src/compliance/core/schemas';
import { ProductIdentitySchema } from '@/src/compliance/product-authorization/schemas';
import { CompliancePackIdSchema } from '@/src/compliance/regulatory/schemas';
import { DetectedCategorySchema } from '@/src/content/web/schemas';

export const EvaluationCaseSchema = z.object({
  id: z.string().min(1),
  pack: CompliancePackIdSchema,
  // FLAG: at least the expected issue types must appear. SAFE: no issue at all.
  group: z.enum(['FLAG', 'SAFE']),
  // Negations, warnings, testimonials: cases where context decides the outcome.
  contextDependent: z.boolean().default(false),
  input: z.string().min(1),
  categoryHint: z
    .enum([
      'HEALTH_FUNCTIONAL_FOOD',
      'PHARMACEUTICAL',
      'MEDICAL_DEVICE',
      'COSMETIC',
    ])
    .optional(),
  productIdentity: ProductIdentitySchema.optional(),
  expectedCategory: DetectedCategorySchema,
  expectedIssueTypes: z.array(z.string().min(1)),
  notes: z.string().min(1),
});

export const EvaluationDatasetSchema = z
  .array(EvaluationCaseSchema)
  .min(30)
  .max(50)
  .refine(
    (cases) => new Set(cases.map((item) => item.id)).size === cases.length,
    'Evaluation case ids must be unique.',
  );

export type EvaluationCase = z.infer<typeof EvaluationCaseSchema>;

export type CaseOutcome = {
  id: string;
  pack: EvaluationCase['pack'];
  group: EvaluationCase['group'];
  contextDependent: boolean;
  input: string;
  expectedCategory: EvaluationCase['expectedCategory'];
  detectedCategory: ScanAnalysisResult['detectedCategory'] | null;
  categoryMatch: boolean;
  expectedIssueTypes: string[];
  actualIssueTypes: string[];
  /** FLAG: every expected type present (or any issue when none listed). SAFE: n/a. */
  detected: boolean | null;
  /** FLAG & detected: every issue matching an expected type carries a verified citation. */
  sourceLinked: boolean | null;
  /** SAFE: at least one issue was raised. */
  falsePositive: boolean | null;
  issueCount: number;
  verifiedIssueCount: number;
  keyIssueCount: number;
  overallRisk: ScanAnalysisResult['overallRisk'] | null;
  elapsedMs: number;
  mode: 'live' | 'offline' | 'rules';
  analysisModel: string | null;
  error: string | null;
  usedFallback?: boolean;
  analysis?: ScanAnalysisResult;
  humanReview?: {
    status: 'PENDING';
    sourceRelevance: null;
    rewriteTruthfulness: null;
    missedClaims: null;
    reviewer: null;
  };
};

export type Scanner = (input: PackContentInput) => Promise<ScanAnalysisResult>;

export async function evaluateCase(
  scan: Scanner,
  item: EvaluationCase,
): Promise<CaseOutcome> {
  const started = Date.now();
  const base = {
    id: item.id,
    pack: item.pack,
    group: item.group,
    contextDependent: item.contextDependent,
    input: item.input,
    expectedCategory: item.expectedCategory,
    expectedIssueTypes: item.expectedIssueTypes,
  };
  try {
    const result = await scan({
      text: item.input,
      detectedContentType: 'ADVERTISEMENT_TEXT',
      categoryHint: item.categoryHint,
      productIdentity: item.productIdentity,
    });
    const actualIssueTypes = [
      ...new Set(result.issues.map((issue) => issue.category)),
    ];
    const relevantIssues = result.issues.filter(
      (issue) =>
        item.expectedIssueTypes.length === 0 ||
        item.expectedIssueTypes.includes(issue.category),
    );
    const detected =
      item.group === 'FLAG'
        ? item.expectedIssueTypes.length === 0
          ? result.issues.length > 0
          : item.expectedIssueTypes.every((type) =>
              actualIssueTypes.includes(type),
            )
        : null;
    return {
      ...base,
      detectedCategory: result.detectedCategory,
      categoryMatch: result.detectedCategory === item.expectedCategory,
      actualIssueTypes,
      detected,
      sourceLinked:
        detected === true
          ? relevantIssues.every(
              (issue) =>
                issue.citationStatus === 'VERIFIED' &&
                issue.sourceChunkIds.length > 0,
            )
          : null,
      falsePositive: item.group === 'SAFE' ? result.issues.length > 0 : null,
      issueCount: result.issues.length,
      verifiedIssueCount: result.issues.filter(
        (issue) => issue.citationStatus === 'VERIFIED',
      ).length,
      keyIssueCount: result.keyIssueIds.length,
      overallRisk: result.overallRisk,
      elapsedMs: result.metrics?.elapsedMs ?? Date.now() - started,
      mode: result.metrics?.mode ?? 'rules',
      analysisModel: result.analysisModel ?? null,
      error: null,
      usedFallback: result.notices.some(
        (notice) => notice.code === 'AI_UNAVAILABLE_RULES_ONLY',
      ),
      analysis: result,
      humanReview: {
        status: 'PENDING',
        sourceRelevance: null,
        rewriteTruthfulness: null,
        missedClaims: null,
        reviewer: null,
      },
    };
  } catch (error) {
    return {
      ...base,
      detectedCategory: null,
      categoryMatch: false,
      actualIssueTypes: [],
      detected: item.group === 'FLAG' ? false : null,
      sourceLinked: null,
      falsePositive: null,
      issueCount: 0,
      verifiedIssueCount: 0,
      keyIssueCount: 0,
      overallRisk: null,
      elapsedMs: Date.now() - started,
      mode: 'rules',
      analysisModel: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export type Rate = { hit: number; total: number; rate: number | null };

export type EvaluationSummary = {
  cases: number;
  errors: number;
  completion: Rate;
  aiCompletion: Rate;
  fallbackIds: string[];
  reviewRequiredIds: string[];
  safeErrors: string[];
  categoryAccuracy: Rate;
  /** FLAG cases where every expected issue type was raised. */
  detection: Rate;
  /** Detected FLAG cases whose relevant issues all carry verified citations. */
  sourceLink: Rate;
  /** Share of all raised issues that carry a verified citation. */
  verifiedIssueShare: Rate;
  /** SAFE cases that raised any issue. */
  falsePositives: Rate & { ids: string[] };
  contextDependent: { detection: Rate; falsePositives: Rate };
  misses: string[];
  keyIssues: {
    meanIssues: number | null;
    maxIssues: number;
    withinThree: Rate;
  };
  latency: {
    meanMs: number | null;
    medianMs: number | null;
    p95Ms: number | null;
    modes: Record<string, number>;
  };
  value: {
    baselineMinutes: number;
    medianSeconds: number | null;
    /** Deprecated: never infer user time savings from a server-time benchmark. */
    speedup: number | null;
    baselineIsAssumption: true;
  };
  byPack: Record<string, { detection: Rate; falsePositives: Rate }>;
};

export function summarize(
  outcomes: CaseOutcome[],
  options: { baselineMinutes?: number } = {},
): EvaluationSummary {
  const baselineMinutes = options.baselineMinutes ?? 30;
  const flagged = outcomes.filter((item) => item.group === 'FLAG');
  const safe = outcomes.filter((item) => item.group === 'SAFE');
  const evaluatedSafe = safe.filter((item) => item.error === null);
  const detected = flagged.filter((item) => item.detected === true);
  const falsePositives = safe.filter((item) => item.falsePositive === true);
  const context = outcomes.filter((item) => item.contextDependent);
  const withIssues = outcomes.filter((item) => item.error === null);
  const elapsed = withIssues.map((item) => item.elapsedMs);
  const medianMs = percentile(elapsed, 0.5);
  const totalIssues = sum(outcomes.map((item) => item.issueCount));

  return {
    cases: outcomes.length,
    errors: outcomes.filter((item) => item.error !== null).length,
    completion: rate(withIssues.length, outcomes.length),
    aiCompletion: rate(
      withIssues.filter((item) => item.mode === 'live').length,
      outcomes.length,
    ),
    fallbackIds: outcomes
      .filter((item) => item.usedFallback)
      .map((item) => item.id),
    reviewRequiredIds: outcomes
      .filter((item) => item.overallRisk === 'REVIEW_REQUIRED')
      .map((item) => item.id),
    safeErrors: safe
      .filter((item) => item.error !== null)
      .map((item) => item.id),
    categoryAccuracy: rate(
      outcomes.filter((item) => item.categoryMatch).length,
      outcomes.length,
    ),
    detection: rate(detected.length, flagged.length),
    sourceLink: rate(
      detected.filter((item) => item.sourceLinked === true).length,
      detected.length,
    ),
    verifiedIssueShare: rate(
      sum(outcomes.map((item) => item.verifiedIssueCount)),
      totalIssues,
    ),
    falsePositives: {
      ...rate(falsePositives.length, evaluatedSafe.length),
      ids: falsePositives.map((item) => item.id),
    },
    contextDependent: {
      detection: rate(
        context.filter((item) => item.detected === true).length,
        context.filter((item) => item.group === 'FLAG').length,
      ),
      falsePositives: rate(
        context.filter((item) => item.falsePositive === true).length,
        context.filter((item) => item.group === 'SAFE' && item.error === null)
          .length,
      ),
    },
    misses: flagged
      .filter((item) => item.detected !== true)
      .map((item) => item.id),
    keyIssues: {
      meanIssues:
        withIssues.length > 0 ? totalIssues / withIssues.length : null,
      maxIssues: Math.max(0, ...outcomes.map((item) => item.issueCount)),
      withinThree: rate(
        withIssues.filter(
          (item) =>
            item.issueCount > 0 &&
            item.keyIssueCount > 0 &&
            item.keyIssueCount <= 3,
        ).length,
        withIssues.filter((item) => item.issueCount > 0).length,
      ),
    },
    latency: {
      meanMs: elapsed.length > 0 ? sum(elapsed) / elapsed.length : null,
      medianMs,
      p95Ms: percentile(elapsed, 0.95),
      modes: outcomes.reduce<Record<string, number>>((acc, item) => {
        acc[item.mode] = (acc[item.mode] ?? 0) + 1;
        return acc;
      }, {}),
    },
    value: {
      baselineMinutes,
      medianSeconds: medianMs === null ? null : medianMs / 1000,
      speedup: null,
      baselineIsAssumption: true,
    },
    byPack: Object.fromEntries(
      [...new Set(outcomes.map((item) => item.pack))].map((pack) => {
        const packFlagged = flagged.filter((item) => item.pack === pack);
        const packSafe = evaluatedSafe.filter((item) => item.pack === pack);
        return [
          pack,
          {
            detection: rate(
              packFlagged.filter((item) => item.detected === true).length,
              packFlagged.length,
            ),
            falsePositives: rate(
              packSafe.filter((item) => item.falsePositive === true).length,
              packSafe.length,
            ),
          },
        ];
      }),
    ),
  };
}

export function renderMarkdown(
  summary: EvaluationSummary,
  outcomes: CaseOutcome[],
  meta: {
    evaluatedAt: string;
    mode: string;
    model: string | null;
    dataset?: string;
    datasetSha256?: string;
    completed?: boolean;
    expectedCases?: number;
  },
) {
  const pct = (value: Rate) =>
    value.rate === null
      ? 'n/a'
      : `${(value.rate * 100).toFixed(1)}% (${value.hit}/${value.total})`;
  const ms = (value: number | null) =>
    value === null ? 'n/a' : `${Math.round(value)} ms`;
  const lines = [
    `# ContentLint 평가 결과`,
    ``,
    `- 실행 시각: ${meta.evaluatedAt}`,
    `- 실행 모드: ${meta.mode}${meta.model ? ` · 모델: ${meta.model}` : ''}`,
    `- 사례 수: ${summary.cases} (오류 ${summary.errors})`,
    ...(meta.dataset
      ? [
          `- 데이터셋: ${meta.dataset} · SHA-256: ${meta.datasetSha256}`,
          `- 실행 상태: ${meta.completed ? '완료' : '진행 중 — 최종 수치 아님'} (${summary.cases}/${meta.expectedCases})`,
        ]
      : []),
    ``,
    `## 핵심 지표`,
    ``,
    `| 지표 | 값 |`,
    `| --- | --- |`,
    `| 결과 반환율 (규칙 대체 포함) | ${pct(summary.completion)} |`,
    `| 최종 AI 분석 완료율 | ${meta.mode.includes('live') ? pct(summary.aiCompletion) : '미실행 — 규칙 평가'} |`,
    `| 규칙 대체 / 추가 검토 결과 | ${summary.fallbackIds.length} / ${summary.reviewRequiredIds.length} |`,
    `| 분류 정확도 | ${pct(summary.categoryAccuracy)} |`,
    `| 탐지 성공률 (FLAG 사례에서 기대 이슈 유형 모두 탐지) | ${pct(summary.detection)} |`,
    `| 출처 연결률 (탐지된 이슈가 모두 검증된 조항 인용) | ${pct(summary.sourceLink)} |`,
    `| 검증 인용 이슈 비율 (전체 이슈 기준) | ${pct(summary.verifiedIssueShare)} |`,
    `| 오탐률 (결과가 반환된 SAFE 사례에서 이슈 발생) | ${pct(summary.falsePositives)} |`,
    `| SAFE 분석 오류 (오탐률 분모에서 제외·별도 실패) | ${summary.safeErrors.length} |`,
    `| 문맥 의존 사례 탐지 / 오탐 | ${pct(summary.contextDependent.detection)} / ${pct(summary.contextDependent.falsePositives)} |`,
    `| 결과당 평균 이슈 수 / 최대 | ${summary.keyIssues.meanIssues?.toFixed(2) ?? 'n/a'} / ${summary.keyIssues.maxIssues} |`,
    `| 이슈 있는 결과 중 핵심 항목 1~3개를 제시한 비율 | ${pct(summary.keyIssues.withinThree)} |`,
    `| 지연 시간 평균 / 중앙값 / p95 | ${ms(summary.latency.meanMs)} / ${ms(summary.latency.medianMs)} / ${ms(summary.latency.p95Ms)} |`,
    ``,
    `## 처리 시간과 사용자 가치의 구분`,
    ``,
    `- 도구 분석 중앙값: ${summary.value.medianSeconds === null ? 'n/a' : `${summary.value.medianSeconds.toFixed(2)}초`}`,
    `- 이전 기준선 ${summary.value.baselineMinutes}분은 **가정값**이며 절감 배수를 계산하지 않습니다.`,
    `- 서버 처리 시간은 사용자의 검토·수정 완료 시간이 아닙니다. 실제 사용자 비교 실험이 필요합니다 (docs/value-metrics.md).`,
    ``,
    `## 사람이 확인해야 하는 품질`,
    ``,
    `- JSON의 각 analysis에는 전체 이슈·수정안·출처·호출 기록을 보존합니다. humanReview는 아직 PENDING입니다.`,
    `- 출처 연결은 조항 존재·인용 검증이며, 해당 주장에 대한 출처 적합성·해석의 정확성은 별도 검토해야 합니다.`,
    `- 수정안의 새로운 사실 추가, 누락된 주장, 정상 문구의 불필요한 지적을 검토하세요. 자동 구조 검증을 사람의 검토로 대체하지 않습니다.`,
    `- AI 미완료 후 규칙 대체: ${summary.fallbackIds.join(', ') || '없음'}`,
    `- 추가 검토 결과: ${summary.reviewRequiredIds.join(', ') || '없음'}`,
    ``,
    `## Pack별`,
    ``,
    `| Pack | 탐지 성공률 | 오탐률 |`,
    `| --- | --- | --- |`,
    ...Object.entries(summary.byPack).map(
      ([pack, value]) =>
        `| ${pack} | ${pct(value.detection)} | ${pct(value.falsePositives)} |`,
    ),
    ``,
    `## 미탐 사례`,
    ``,
    ...(summary.misses.length > 0
      ? summary.misses.map((id) => {
          const item = outcomes.find((outcome) => outcome.id === id)!;
          return `- \`${id}\`: 기대 ${item.expectedIssueTypes.join(', ') || '(이슈 1개 이상)'} / 실제 ${item.actualIssueTypes.join(', ') || '없음'}${item.error ? ` / 오류: ${item.error}` : ''}`;
        })
      : ['- 없음']),
    ``,
    `## 오탐 사례`,
    ``,
    ...(summary.falsePositives.ids.length > 0
      ? summary.falsePositives.ids.map((id) => {
          const item = outcomes.find((outcome) => outcome.id === id)!;
          return `- \`${id}\`: "${item.input}" → ${item.actualIssueTypes.join(', ')}`;
        })
      : ['- 없음']),
    ``,
    `## 사례별 결과`,
    ``,
    `| id | 그룹 | 분류 | 탐지 | 출처 | 오탐 | 이슈 | 핵심 | 위험도 | ms |`,
    `| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |`,
    ...outcomes.map(
      (item) =>
        `| ${item.id} | ${item.group}${item.contextDependent ? '·ctx' : ''} | ${item.categoryMatch ? '✓' : '✗'} | ${flag(item.detected)} | ${flag(item.sourceLinked)} | ${item.falsePositive === null ? '-' : item.falsePositive ? '✗' : '✓'} | ${item.issueCount} | ${item.keyIssueCount} | ${item.overallRisk ?? 'ERR'} | ${item.elapsedMs} |`,
    ),
    ``,
    `> 이 수치는 선택된 ${summary.cases}개 내부 사례와 실행 모드에 한정된 측정입니다. 새 도전 사례도 독립적인 전문가 검증 데이터는 아닙니다. 법적 판단의 정확도나 실제 광고 모집단의 탐지율을 뜻하지 않습니다.`,
  ];
  return lines.join('\n');
}

function flag(value: boolean | null) {
  return value === null ? '-' : value ? '✓' : '✗';
}

function rate(hit: number, total: number): Rate {
  return { hit, total, rate: total === 0 ? null : hit / total };
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function percentile(values: number[], fraction: number) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(fraction * sorted.length) - 1),
  );
  return sorted[index];
}
