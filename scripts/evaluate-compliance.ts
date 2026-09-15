import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';

import rawCases from '../evals/end-to-end/cases.json';
import {
  EvaluationDatasetSchema,
  evaluateCase,
  renderMarkdown,
  summarize,
  type CaseOutcome,
  type Scanner,
} from '../src/evaluation/compliance-evaluation';

/**
 * End-to-end evaluation over evals/end-to-end/cases.json.
 *
 *   npm run eval:e2e                 # deterministic rules + retrieval, no network
 *   npm run eval:e2e -- --live       # Vertex AI → OpenAI → rules chain (API cost)
 *   npm run eval:e2e -- --baseline-minutes=45 --strict
 *
 * Writes outputs/compliance-evaluation.{json,md}. `--strict` exits non-zero
 * when any FLAG case is missed or any SAFE case raises an issue.
 */
const args = process.argv.slice(2);
const live = args.includes('--live');
const strict = args.includes('--strict');
const baselineMinutes = Number(
  args.find((arg) => arg.startsWith('--baseline-minutes='))?.split('=')[1] ??
    30,
);
if (!Number.isFinite(baselineMinutes) || baselineMinutes <= 0)
  throw new Error('--baseline-minutes must be a positive number.');

const cases = EvaluationDatasetSchema.parse(rawCases);

let scan: Scanner;
let model: string | null = null;
if (live) {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const { isVertexConfigured } =
    await import('../src/ai/providers/vertex-auth');
  if (!isVertexConfigured(process.env) && !process.env.OPENAI_API_KEY?.trim())
    throw new Error(
      'Vertex AI(VERTEX_API_KEY 또는 GOOGLE_CLOUD_PROJECT+서비스 계정) 또는 OPENAI_API_KEY를 설정해 주세요.',
    );
  const { createProductionAnalysis } =
    await import('../src/server/production-analysis');
  scan = async (input) => {
    const analysis = createProductionAnalysis();
    return analysis.measure(() => analysis.text.analyzeContent(input));
  };
  model = 'per-case (see analysisModel)';
} else {
  const { createContentComplianceScanService } =
    await import('../src/server/regulatory-runtime');
  const service = createContentComplianceScanService();
  scan = async (input) => {
    const started = Date.now();
    const result = await service.analyzeContent(input);
    return {
      ...result,
      metrics: {
        elapsedMs: Date.now() - started,
        mode: 'offline',
        attempts: [],
      },
    };
  };
  model = 'rules-only';
}

const outcomes: CaseOutcome[] = [];
for (const item of cases) {
  const outcome = await evaluateCase(scan, item);
  outcomes.push(outcome);
  const status =
    outcome.error !== null
      ? `ERROR ${outcome.error}`
      : outcome.group === 'FLAG'
        ? `detected=${outcome.detected} sourceLinked=${outcome.sourceLinked}`
        : `falsePositive=${outcome.falsePositive}`;
  console.log(
    `${outcome.id.padEnd(32)} ${outcome.group.padEnd(4)} ${status} issues=${outcome.issueCount} ${outcome.elapsedMs}ms`,
  );
}

const summary = summarize(outcomes, { baselineMinutes });
const evaluatedAt = new Date().toISOString();
const mode = live ? 'live' : 'offline (rules + retrieval)';
await mkdir('outputs', { recursive: true });
await writeFile(
  'outputs/compliance-evaluation.json',
  JSON.stringify({ evaluatedAt, mode, model, summary, outcomes }, null, 2),
);
await writeFile(
  'outputs/compliance-evaluation.md',
  renderMarkdown(summary, outcomes, { evaluatedAt, mode, model }),
);

const pct = (value: { rate: number | null }) =>
  value.rate === null ? 'n/a' : `${(value.rate * 100).toFixed(1)}%`;
console.log('');
console.log(`탐지 성공률  ${pct(summary.detection)}`);
console.log(`출처 연결률  ${pct(summary.sourceLink)}`);
console.log(`오탐률       ${pct(summary.falsePositives)}`);
console.log(
  `지연 중앙값  ${summary.latency.medianMs ?? 'n/a'} ms (기준선 ${baselineMinutes}분은 가정값)`,
);
console.log('결과: outputs/compliance-evaluation.md');

if (
  strict &&
  (summary.misses.length > 0 ||
    summary.falsePositives.ids.length > 0 ||
    summary.errors > 0)
)
  process.exitCode = 1;
