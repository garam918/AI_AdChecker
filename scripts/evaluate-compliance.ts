import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

import rawCases from '../evals/end-to-end/cases.json';
import challengeCases from '../evals/challenge/cases.json';
import {
  EvaluationDatasetSchema,
  evaluateCase,
  renderMarkdown,
  summarize,
  type CaseOutcome,
  type Scanner,
} from '../src/evaluation/compliance-evaluation';

/**
 * End-to-end evaluation with immutable dataset identity and per-run artifacts.
 *
 *   npm run eval:e2e                 # deterministic rules + retrieval, no network
 *   npm run eval:e2e -- --live       # Vertex AI → OpenAI → rules chain (API cost)
 *   npm run eval:e2e -- --dataset=challenge --live
 *
 * Writes outputs/evaluations/<dataset>-<mode>-<run>.{json,md}. `--strict` exits non-zero
 * when any FLAG case is missed or any SAFE case raises an issue.
 */
const args = process.argv.slice(2);
const live = args.includes('--live');
const strict = args.includes('--strict');
const dataset =
  args.find((arg) => arg.startsWith('--dataset='))?.split('=')[1] ??
  'regression';
if (dataset !== 'regression' && dataset !== 'challenge')
  throw new Error('--dataset must be regression or challenge.');
const baselineMinutes = Number(
  args.find((arg) => arg.startsWith('--baseline-minutes='))?.split('=')[1] ??
    30,
);
if (!Number.isFinite(baselineMinutes) || baselineMinutes <= 0)
  throw new Error('--baseline-minutes must be a positive number.');

const cases = EvaluationDatasetSchema.parse(
  dataset === 'challenge' ? challengeCases : rawCases,
);
const datasetSha256 = createHash('sha256')
  .update(JSON.stringify(cases))
  .digest('hex');
const startedAt = new Date().toISOString();
const mode = live ? 'live' : 'offline (rules + retrieval)';
const outputBase = `outputs/evaluations/${dataset}-${live ? 'live' : 'rules'}-${startedAt.replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
const revision = execFileSync('git', ['rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim();
const worktreeDirty =
  execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()
    .length > 0;

const implementationHash = createHash('sha256');
for (const file of execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', 'src', 'scripts'],
  { encoding: 'utf8' },
)
  .trim()
  .split('\n')
  .sort()) {
  implementationHash.update(file).update('\0').update(readFileSync(file));
}
const implementationSha256 = implementationHash.digest('hex');

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
await mkdir('outputs/evaluations', { recursive: true });
async function checkpoint(completed: boolean) {
  const evaluatedAt = new Date().toISOString();
  const summary = summarize(outcomes, { baselineMinutes });
  const meta = {
    evaluatedAt,
    mode,
    model,
    dataset,
    datasetSha256,
    completed,
    expectedCases: cases.length,
  };
  await writeFile(
    `${outputBase}.json`,
    JSON.stringify(
      {
        ...meta,
        startedAt,
        revision,
        worktreeDirty,
        implementationSha256,
        summary,
        outcomes,
      },
      null,
      2,
    ),
  );
  await writeFile(`${outputBase}.md`, renderMarkdown(summary, outcomes, meta));
}
await checkpoint(false);
for (const item of cases) {
  const outcome = await evaluateCase(scan, item);
  outcomes.push(outcome);
  // Preserve completed observations if a long paid run is interrupted.
  await checkpoint(false);
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
await checkpoint(true);

const pct = (value: { rate: number | null }) =>
  value.rate === null ? 'n/a' : `${(value.rate * 100).toFixed(1)}%`;
console.log('');
console.log(`탐지 성공률  ${pct(summary.detection)}`);
console.log(`출처 연결률  ${pct(summary.sourceLink)}`);
console.log(`오탐률       ${pct(summary.falsePositives)}`);
console.log(
  `지연 중앙값  ${summary.latency.medianMs ?? 'n/a'} ms (기준선 ${baselineMinutes}분은 가정값)`,
);
console.log(
  `결과: ${outputBase}.md (완료 ${outcomes.length}/${cases.length}, 데이터 SHA-256 ${datasetSha256})`,
);

if (
  strict &&
  (summary.misses.length > 0 ||
    summary.falsePositives.ids.length > 0 ||
    summary.errors > 0)
)
  process.exitCode = 1;
