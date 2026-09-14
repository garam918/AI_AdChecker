import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import cases from '../evals/gemini/cases.json';

if (!process.argv.includes('--live')) {
  throw new Error(
    '실제 API 비용이 발생합니다. 실행하려면 npm run ai:eval -- --live 를 사용하세요.',
  );
}
if (existsSync('.env')) process.loadEnvFile('.env');
if (!process.env.GEMINI_API_KEY?.trim())
  throw new Error('서버 환경변수 GEMINI_API_KEY를 설정해 주세요.');

const { contentComplianceScanService, geminiContentProvider } =
  await import('../src/server/regulatory-runtime');
const { urlComplianceScanService } =
  await import('../src/server/url-scan-runtime');
const { ImageComplianceScanService } =
  await import('../src/content/image/image-compliance-scan-service');
const imageService = new ImageComplianceScanService(
  geminiContentProvider,
  contentComplianceScanService,
);
const report = [];
for (const item of cases) {
  const start = Date.now();
  const result =
    item.inputType === 'URL'
      ? await urlComplianceScanService.analyze({ fixtureId: item.fixtureId! })
      : item.inputType === 'IMAGE'
        ? await imageService.analyze(
            new File([await readFile(item.file!)], 'demo-ad.png', {
              type: 'image/png',
            }),
          )
        : await contentComplianceScanService.analyze(item.input!);
  const categoryMatches = result.detectedCategory === item.expectedCategory;
  const hasVerifiedFinding = result.issues.some(
    (issue) => issue.citationStatus === 'VERIFIED',
  );
  report.push({
    id: item.id,
    elapsedMs: Date.now() - start,
    categoryMatches,
    hasVerifiedFinding,
    humanReview: item.notes,
    result,
  });
  console.log(
    `${item.id}: category=${categoryMatches}, verifiedFinding=${hasVerifiedFinding}, issues=${result.issues.length}`,
  );
}
await mkdir('outputs', { recursive: true });
await writeFile(
  'outputs/gemini-evaluation.json',
  JSON.stringify(
    {
      evaluatedAt: new Date().toISOString(),
      model: geminiContentProvider.model,
      report,
    },
    null,
    2,
  ),
);
console.log(
  '결과: outputs/gemini-evaluation.json. 이 소수 예제 검증은 모델 정확도 벤치마크가 아닙니다. 출처 적합성과 수정안은 사람이 검토해야 합니다.',
);
if (report.some((item) => !item.categoryMatches || !item.hasVerifiedFinding))
  process.exitCode = 1;
