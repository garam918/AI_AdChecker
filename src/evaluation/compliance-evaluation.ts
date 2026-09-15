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
    /** Baseline ÷ median tool time. Baseline is an assumption until measured. */
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
      ...rate(falsePositives.length, safe.length),
      ids: falsePositives.map((item) => item.id),
    },
    contextDependent: {
      detection: rate(
        context.filter((item) => item.detected === true).length,
        context.filter((item) => item.group === 'FLAG').length,
      ),
      falsePositives: rate(
        context.filter((item) => item.falsePositive === true).length,
        context.filter((item) => item.group === 'SAFE').length,
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
        withIssues.filter((item) => item.issueCount <= 3).length,
        withIssues.length,
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
      speedup:
        medianMs === null || medianMs === 0
          ? null
          : (baselineMinutes * 60_000) / medianMs,
      baselineIsAssumption: true,
    },
    byPack: Object.fromEntries(
      [...new Set(outcomes.map((item) => item.pack))].map((pack) => {
        const packFlagged = flagged.filter((item) => item.pack === pack);
        const packSafe = safe.filter((item) => item.pack === pack);
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
  meta: { evaluatedAt: string; mode: string; model: string | null },
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
    ``,
    `## 핵심 지표`,
    ``,
    `| 지표 | 값 |`,
    `| --- | --- |`,
    `| 분류 정확도 | ${pct(summary.categoryAccuracy)} |`,
    `| 탐지 성공률 (FLAG 사례에서 기대 이슈 유형 모두 탐지) | ${pct(summary.detection)} |`,
    `| 출처 연결률 (탐지된 이슈가 모두 검증된 조항 인용) | ${pct(summary.sourceLink)} |`,
    `| 검증 인용 이슈 비율 (전체 이슈 기준) | ${pct(summary.verifiedIssueShare)} |`,
    `| 오탐률 (SAFE 사례에서 이슈 발생) | ${pct(summary.falsePositives)} |`,
    `| 문맥 의존 사례 탐지 / 오탐 | ${pct(summary.contextDependent.detection)} / ${pct(summary.contextDependent.falsePositives)} |`,
    `| 결과당 평균 이슈 수 / 최대 | ${summary.keyIssues.meanIssues?.toFixed(2) ?? 'n/a'} / ${summary.keyIssues.maxIssues} |`,
    `| 3개 이하 핵심 이슈로 정리된 결과 | ${pct(summary.keyIssues.withinThree)} |`,
    `| 지연 시간 평균 / 중앙값 / p95 | ${ms(summary.latency.meanMs)} / ${ms(summary.latency.medianMs)} / ${ms(summary.latency.p95Ms)} |`,
    ``,
    `## 가치 검증 (측정값 + 가정)`,
    ``,
    `- 도구 분석 중앙값: ${summary.value.medianSeconds === null ? 'n/a' : `${summary.value.medianSeconds.toFixed(2)}초`}`,
    `- 수동 사전검수 기준선: ${summary.value.baselineMinutes}분 — **가정값**입니다. 실제 사용자 시간 측정으로 대체해야 합니다 (docs/value-metrics.md 참고).`,
    `- 기준선 대비 속도: ${summary.value.speedup === null ? 'n/a' : `약 ${Math.round(summary.value.speedup).toLocaleString()}배`}`,
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
    `> 이 수치는 현재 규칙·검색 코퍼스와 선택된 ${summary.cases}개 사례에 대한 회귀 측정입니다. 법적 판단의 정확도나 실제 광고 모집단의 탐지율을 뜻하지 않습니다.`,
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
