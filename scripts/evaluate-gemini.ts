import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

import cases from '../evals/gemini/cases.json';

/**
 * Sends the four representative examples (2 text, 1 URL fixture, 1 image)
 * through the production provider chain: Vertex AI → OpenAI → rules.
 *
 *   npm run ai:eval -- --live
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

const report = [];
for (const item of cases) {
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
    elapsedMs: result.metrics?.elapsedMs ?? null,
    mode: result.metrics?.mode ?? null,
    analysisModel: result.analysisModel ?? null,
    attempts: result.metrics?.attempts ?? [],
    categoryMatches,
    hasVerifiedFinding,
    keyIssues: result.keyIssueIds.length,
    totalIssues: result.issues.length,
    humanReview: item.notes,
    result,
  });
  console.log(
    `${item.id}: mode=${result.metrics?.mode} model=${result.analysisModel} category=${categoryMatches} verifiedFinding=${hasVerifiedFinding} issues=${result.issues.length} key=${result.keyIssueIds.length} ${result.metrics?.elapsedMs}ms`,
  );
}
await mkdir('outputs', { recursive: true });
await writeFile(
  'outputs/gemini-evaluation.json',
  JSON.stringify({ evaluatedAt: new Date().toISOString(), report }, null, 2),
);
console.log(
  '결과: outputs/gemini-evaluation.json. 이 소수 예제 검증은 모델 정확도 벤치마크가 아닙니다. 출처 적합성과 수정안은 사람이 검토해야 합니다.',
);
if (
  report.some(
    (item) =>
      !item.categoryMatches || !item.hasVerifiedFinding || item.mode !== 'live',
  )
)
  process.exitCode = 1;
