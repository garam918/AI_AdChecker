import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

// This command deliberately targets the existing personal Cloudflare Worker,
// not the separate Site recorded in .openai/hosting.json.
const accountId = '41e2fe3f6bc58043cb08f93caf8179b1';
const workerName = 'contentlint-ai';
const projectId = 'contentlint-ai-garam-2026';
const productionUrl = 'https://contentlint-ai.garam918.workers.dev';
const root = fileURLToPath(new URL('../', import.meta.url));
const wrangler = fileURLToPath(
  new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url),
);
process.chdir(root);

const args = process.argv.slice(2);
if (args.some((arg) => arg !== '--dry-run'))
  throw new Error(
    'Only --dry-run is supported. The deployment target is fixed.',
  );
const dryRun = args.includes('--dry-run');
const configPath = 'dist/server/wrangler.json';
const build = JSON.parse(readFileSync(configPath, 'utf8'));
if (build.name !== workerName)
  throw new Error('Unexpected build target. Run npm run build first.');

const env = { ...parseEnv(readFileSync('.env', 'utf8')), ...process.env };
if (env.GOOGLE_CLOUD_PROJECT !== projectId)
  throw new Error('The dedicated Vertex project must be configured in .env.');
const account = JSON.parse(env.VERTEX_SERVICE_ACCOUNT_JSON || '{}');
if (
  account.project_id !== projectId ||
  account.client_email !==
    `contentlint-server@${projectId}.iam.gserviceaccount.com` ||
  !account.private_key
)
  throw new Error('The dedicated Vertex server credential is missing.');
if (env.VERTEX_API_KEY?.trim() || env.VERTEX_ACCESS_TOKEN?.trim())
  throw new Error('Clear alternate Vertex credentials before this deployment.');

const secretNames = [
  'VERTEX_SERVICE_ACCOUNT_JSON',
  'FOOD_SAFETY_KOREA_API_KEY',
  'DATA_GO_KR_SERVICE_KEY',
  'OPENAI_API_KEY',
];
const secrets = Object.fromEntries(
  secretNames.filter((key) => env[key]?.trim()).map((key) => [key, env[key]]),
);
const vars = {
  GOOGLE_CLOUD_PROJECT: projectId,
  GOOGLE_CLOUD_LOCATION: env.GOOGLE_CLOUD_LOCATION || 'global',
  VERTEX_MODEL: env.VERTEX_MODEL || 'gemini-3.8-flash',
};
for (const key of [
  'MFDS_DRUG_PRODUCT_API_URL',
  'MFDS_MEDICAL_DEVICE_PRODUCT_API_URL',
  'MFDS_COSMETIC_PRODUCT_API_URL',
  'AI_FALLBACK_PROVIDER',
  'AI_RULES_FALLBACK',
  'AI_ANALYSIS_THINKING',
  'OPENAI_ANALYSIS_MODEL',
  'RAG_EMBEDDING_PROVIDER',
  'RAG_EMBEDDING_MODEL',
  'RAG_EMBEDDING_DIMENSIONS',
])
  if (env[key]?.trim()) vars[key] = env[key];

const childEnv = {
  ...process.env,
  CLOUDFLARE_ACCOUNT_ID: accountId,
  WRANGLER_WRITE_LOGS: 'false',
  WRANGLER_LOG_PATH: '.wrangler/logs',
  CI: 'true',
};
const targetArgs = ['--name', workerName, '--config', configPath];
function run(command, { input, capture = false } = {}) {
  const result = spawnSync(process.execPath, [wrangler, ...command], {
    cwd: root,
    env: childEnv,
    encoding: 'utf8',
    input,
    stdio: capture ? ['pipe', 'pipe', 'pipe'] : 'inherit',
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error || result.status !== 0)
    // Captured secret-upload output must never be echoed on failure.
    throw new Error(`Wrangler ${command.slice(0, 2).join(' ')} failed.`);
  return result.stdout;
}

console.log(`Deployment target: ${productionUrl}`);
if (!dryRun) {
  const deployments = JSON.parse(
    run(['deployments', 'list', ...targetArgs, '--json'], { capture: true }),
  );
  const current = deployments.sort((a, b) =>
    b.created_on.localeCompare(a.created_on),
  )[0];
  if (!current || current.versions.length !== 1)
    throw new Error('Expected an existing Worker with one active version.');
  const previousVersion = current.versions[0].version_id;
  const version = JSON.parse(
    run(['versions', 'view', previousVersion, ...targetArgs, '--json'], {
      capture: true,
    }),
  );
  const bindings = version.resources?.bindings;
  if (!Array.isArray(bindings))
    throw new Error('Could not verify the existing Worker bindings.');
  if (
    bindings.some(
      (binding) =>
        !['plain_text', 'secret_text', 'assets'].includes(binding.type) ||
        ['VERTEX_API_KEY', 'VERTEX_ACCESS_TOKEN'].includes(binding.name),
    )
  )
    throw new Error(
      'Review existing storage or alternate Vertex bindings first.',
    );
  console.log(`Previous version: ${previousVersion}`);
  // Additive upload. Secrets only travel over stdin, never command arguments,
  // temporary files, source control, or build output. Unlisted keys stay intact.
  run(['secret', 'bulk', ...targetArgs], {
    input: JSON.stringify(secrets),
    capture: true,
  });
  console.log(`Server secrets configured: ${Object.keys(secrets).join(', ')}`);
}

run([
  'deploy',
  ...targetArgs,
  '--keep-vars',
  '--message',
  'ContentLint Vertex AI server migration',
  ...Object.entries(vars).flatMap(([key, value]) => [
    '--var',
    `${key}:${value}`,
  ]),
  ...(dryRun ? ['--dry-run'] : []),
]);
