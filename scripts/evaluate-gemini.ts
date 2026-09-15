import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

import cases from '../evals/gemini/cases.json';
import type { ScanAnalysisResult } from '../src/compliance/core/schemas';

/**
 * Sends the four representative examples (2 text, 1 URL fixture, 1 image)
 * through the production provider chain: Vertex AI → OpenAI → rules.
 *
 *   npm run ai:eval -- --live --text-repeats=5
 */
if (!process.argv.includes('--live')) {
  throw new Error(
    '실제 API 비용이 발생합니다. 실행하려면 npm run ai:eval -- --live 를 사용하세요.',
  );
}
if (existsSync('.env')) process.loadEnvFile('.env');

const { isVertexConfigured } = await import('../src/ai/providers/vertex-auth');
if (!isVertexConfigured(process.env) && !process.env.OPENAI_API_KEY?.trim())
  throw new Error(
    'Vertex AI(VERTEX_API_KEY 또는 GOOGLE_CLOUD_PROJECT + 서비스 계정) 또는 OPENAI_API_KEY를 설정해 주세요.',
  );

const { createProductionAnalysis } =
  await import('../src/server/production-analysis');

const textRepeats = Number(
  process.argv
    .find((arg) => arg.startsWith('--text-repeats='))
    ?.split('=')[1] ?? 1,
);
if (!Number.isInteger(textRepeats) || textRepeats < 1 || textRepeats > 10)
  throw new Error('--text-repeats must be an integer between 1 and 10.');
const runCases = cases.flatMap((item) =>
  Array.from(
    { length: item.inputType === 'TEXT' ? textRepeats : 1 },
    (_, repeat) => ({ ...item, repeat: repeat + 1 }),
  ),
);
const startedAt = new Date().toISOString();
const outputPath = `outputs/evaluations/demo-${startedAt.replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}.json`;
await mkdir('outputs/evaluations', { recursive: true });
const report: Array<{
  id: string;
  repeat: number;
  elapsedMs: number | null;
  mode: 'live' | 'offline' | null;
  analysisModel: string | null;
  attempts: NonNullable<ScanAnalysisResult['metrics']>['attempts'];
  categoryMatches: boolean;
  hasVerifiedFinding: boolean;
  keyIssues: number;
  totalIssues: number;
  expectedReviewInstructions: string;
  humanReview: { status: 'PENDING' };
  result: ScanAnalysisResult;
}> = [];
const errors: Array<{ id: string; repeat: number; error: string }> = [];
async function checkpoint(completed: boolean) {
  await writeFile(
    outputPath,
    JSON.stringify(
      {
        startedAt,
        evaluatedAt: new Date().toISOString(),
        completed,
        expectedCases: runCases.length,
        textRepeats,
        report,
        errors,
      },
      null,
      2,
    ),
  );
}
await checkpoint(false);
for (const item of runCases) {
  try {
    const analysis = createProductionAnalysis();
    const result = await analysis.measure(() =>
      item.inputType === 'URL'
        ? analysis.url.analyze({ fixtureId: item.fixtureId! })
        : item.inputType === 'IMAGE'
          ? readFile(item.file!).then((bytes) =>
              analysis.image.analyze(
                new File([bytes], 'demo-ad.png', { type: 'image/png' }),
                {},
              ),
            )
          : analysis.text.analyzeContent({
              text: item.input!,
              detectedContentType: 'ADVERTISEMENT_TEXT',
            }),
    );
    const categoryMatches = result.detectedCategory === item.expectedCategory;
    const hasVerifiedFinding = result.issues.some(
      (issue) => issue.citationStatus === 'VERIFIED',
    );
    report.push({
      id: item.id,
      repeat: item.repeat,
      elapsedMs: result.metrics?.elapsedMs ?? null,
      mode: result.metrics?.mode ?? null,
      analysisModel: result.analysisModel ?? null,
      attempts: result.metrics?.attempts ?? [],
      categoryMatches,
      hasVerifiedFinding,
      keyIssues: result.keyIssueIds.length,
      totalIssues: result.issues.length,
      expectedReviewInstructions: item.notes,
      humanReview: { status: 'PENDING' },
      result,
    });
    console.log(
      `${item.id} #${item.repeat}: mode=${result.metrics?.mode} model=${result.analysisModel} category=${categoryMatches} verifiedFinding=${hasVerifiedFinding} issues=${result.issues.length} key=${result.keyIssueIds.length} ${result.metrics?.elapsedMs}ms`,
    );
  } catch (error) {
    errors.push({
      id: item.id,
      repeat: item.repeat,
      error: error instanceof Error ? error.message : String(error),
    });
    console.log(`${item.id} #${item.repeat}: ERROR (see report)`);
  }
  await checkpoint(false);
}
await checkpoint(true);
console.log(
  `결과: ${outputPath}. 결과 반환 ${report.length}/${runCases.length}, 최종 AI 완료 ${report.filter((item) => item.mode === 'live').length}/${runCases.length}. 반복 성공은 향후 100% 성공 보장이 아닙니다. 출처 적합성과 수정안은 사람이 검토해야 합니다.`,
);
if (
  errors.length > 0 ||
  report.some(
    (item) =>
      !item.categoryMatches || !item.hasVerifiedFinding || item.mode !== 'live',
  )
)
  process.exitCode = 1;
