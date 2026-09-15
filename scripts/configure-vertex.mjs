import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { parseEnv } from 'node:util';

/**
 * One-time Google Cloud setup helper for Vertex AI (project mode).
 *
 *   GOOGLE_ADC_PATH=~/.config/gcloud/application_default_credentials.json \
 *   node scripts/configure-vertex.mjs --inspect
 *   node scripts/configure-vertex.mjs --create-project --project=<id> --name="ContentLint AI"
 *   node scripts/configure-vertex.mjs --project-status --project=<id>
 *   node scripts/configure-vertex.mjs --link-billing --project=<id> --billing-account=<id>
 *   node scripts/configure-vertex.mjs --enable-vertex --project=<id>
 *   node scripts/configure-vertex.mjs --enable-auth-api --project=<id>
 *   node scripts/configure-vertex.mjs --configure-server --project=<id>
 *   node scripts/configure-vertex.mjs --server-status --project=<id>
 *
 * Reuses the signed-in developer's Application Default Credentials only for
 * these explicit setup calls. Never prints tokens, private keys, or upstream
 * error bodies. Runtime requests never use this path; they use the service
 * account or express-mode key documented in docs/gemini-analysis.md.
 */
const args = process.argv.slice(2);
const option = (name) =>
  args
    .find((arg) => arg.startsWith(`--${name}=`))
    ?.split('=')
    .slice(1)
    .join('=');

const credentialPath = process.env.GOOGLE_ADC_PATH;
if (!credentialPath)
  throw new Error(
    'GOOGLE_ADC_PATH에 Application Default Credentials JSON 경로를 지정해 주세요.',
  );
const credential = JSON.parse(await readFile(credentialPath, 'utf8'));
if (
  !credential.client_id ||
  !credential.client_secret ||
  !credential.refresh_token
)
  throw new Error(
    'ADC 파일에 client_id, client_secret, refresh_token이 필요합니다.',
  );

const refreshed = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  body: new URLSearchParams({
    client_id: credential.client_id,
    client_secret: credential.client_secret,
    refresh_token: credential.refresh_token,
    grant_type: 'refresh_token',
  }),
});
if (!refreshed.ok)
  throw new Error(`Google authentication: ${refreshed.status}`);
const { access_token: token } = await refreshed.json();

async function api(host, path, method = 'GET', body) {
  const response = await fetch(`https://${host}/${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    ...(body && { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const error = new Error(`${host}: ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

const project = option('project');
const requireProject = () => {
  if (!project || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project))
    throw new Error('--project=<gcp-project-id> 를 지정해 주세요.');
  return project;
};

if (args.includes('--inspect')) {
  const projects = await api(
    'cloudresourcemanager.googleapis.com',
    'v1/projects',
  );
  const filter = option('filter') ?? 'contentlint|adchecker';
  const pattern = new RegExp(filter, 'i');
  console.log(
    JSON.stringify({
      matchingProjects: (projects.projects || [])
        .filter((item) => pattern.test(`${item.projectId} ${item.name}`))
        .map((item) => ({ projectId: item.projectId, name: item.name })),
    }),
  );
  const billing = await api(
    'cloudbilling.googleapis.com',
    'v1/billingAccounts',
  );
  console.log(
    JSON.stringify({
      billingAccounts: (billing.billingAccounts || []).map((item) => ({
        name: item.name,
        displayName: item.displayName,
        open: item.open,
      })),
    }),
  );
} else if (args.includes('--create-project')) {
  console.log(
    JSON.stringify(
      await api('cloudresourcemanager.googleapis.com', 'v1/projects', 'POST', {
        projectId: requireProject(),
        name: option('name') ?? 'ContentLint AI',
      }),
    ),
  );
} else if (args.includes('--operation-status')) {
  const operation = option('operation');
  if (!operation || !/^operations\/[a-zA-Z0-9._-]+$/.test(operation))
    throw new Error('--operation=operations/<id> 를 지정해 주세요.');
  const result = await api(
    'cloudresourcemanager.googleapis.com',
    `v1/${operation}`,
  );
  console.log(
    JSON.stringify({
      name: result.name,
      done: result.done ?? false,
      errorCode: result.error?.code ?? null,
    }),
  );
} else if (args.includes('--project-status')) {
  const id = requireProject();
  const resource = await api(
    'cloudresourcemanager.googleapis.com',
    `v1/projects/${id}`,
  );
  const billing = await api(
    'cloudbilling.googleapis.com',
    `v1/projects/${id}/billingInfo`,
  );
  console.log(
    JSON.stringify({
      projectId: resource.projectId,
      projectNumber: resource.projectNumber,
      name: resource.name,
      lifecycleState: resource.lifecycleState,
      billingAccountName: billing.billingAccountName ?? null,
      billingEnabled: billing.billingEnabled ?? false,
    }),
  );
} else if (args.includes('--link-billing')) {
  const id = requireProject();
  const accountId = option('billing-account');
  if (!accountId || !/^[A-F0-9]{6}-[A-F0-9]{6}-[A-F0-9]{6}$/.test(accountId))
    throw new Error('--billing-account=<billing-account-id> 를 지정해 주세요.');
  const accountName = `billingAccounts/${accountId}`;
  const account = await api('cloudbilling.googleapis.com', `v1/${accountName}`);
  if (!account.open) throw new Error('선택한 결제 계정이 닫혀 있습니다.');
  const current = await api(
    'cloudbilling.googleapis.com',
    `v1/projects/${id}/billingInfo`,
  );
  if (current.billingAccountName && current.billingAccountName !== accountName)
    throw new Error(
      '프로젝트에 다른 결제 계정이 이미 연결되어 있습니다. 변경하지 않았습니다.',
    );
  if (current.billingAccountName !== accountName) {
    await api(
      'cloudbilling.googleapis.com',
      `v1/projects/${id}/billingInfo`,
      'PUT',
      {
        billingAccountName: accountName,
      },
    );
  }
  const verified = await api(
    'cloudbilling.googleapis.com',
    `v1/projects/${id}/billingInfo`,
  );
  console.log(
    JSON.stringify({
      projectId: id,
      billingAccountName: verified.billingAccountName,
      billingEnabled: verified.billingEnabled,
    }),
  );
  if (verified.billingAccountName !== accountName || !verified.billingEnabled)
    throw new Error('요청한 결제 연결의 활성화 상태를 확인하지 못했습니다.');
} else if (args.includes('--enable-vertex')) {
  console.log(
    JSON.stringify(
      await api(
        'serviceusage.googleapis.com',
        `v1/projects/${requireProject()}/services/aiplatform.googleapis.com:enable`,
        'POST',
        {},
      ),
    ),
  );
} else if (args.includes('--enable-auth-api')) {
  console.log(
    JSON.stringify(
      await api(
        'serviceusage.googleapis.com',
        `v1/projects/${requireProject()}/services/iam.googleapis.com:enable`,
        'POST',
        {},
      ),
    ),
  );
} else if (args.includes('--configure-server')) {
  const id = requireProject();
  const accountId = 'contentlint-server';
  const email = `${accountId}@${id}.iam.gserviceaccount.com`;
  const accountPath = `v1/projects/${id}/serviceAccounts/${email}`;
  const envText = await readFile('.env', 'utf8');
  const localEnv = parseEnv(envText);
  if (localEnv.GOOGLE_CLOUD_PROJECT && localEnv.GOOGLE_CLOUD_PROJECT !== id)
    throw new Error(
      '다른 프로젝트의 로컬 설정이 있습니다. 변경하지 않았습니다.',
    );
  // Validate the local patch tool before issuing any private credential.
  if (spawnSync('apply_patch', ['--help'], { stdio: 'ignore' }).error)
    throw new Error('apply_patch가 필요합니다. 인증키를 발급하지 않았습니다.');
  let account;
  try {
    account = await api('iam.googleapis.com', accountPath);
  } catch (error) {
    if (error.status !== 404) throw error;
    account = await api(
      'iam.googleapis.com',
      `v1/projects/${id}/serviceAccounts`,
      'POST',
      {
        accountId,
        serviceAccount: {
          displayName: 'ContentLint AI server',
          description: 'Vertex AI analysis for ContentLint only',
        },
      },
    );
  }
  if (account.disabled) throw new Error('서비스 계정이 비활성 상태입니다.');
  const member = `serviceAccount:${email}`;
  const policy = await api(
    'cloudresourcemanager.googleapis.com',
    `v1/projects/${id}:getIamPolicy`,
    'POST',
    { options: { requestedPolicyVersion: 3 } },
  );
  policy.bindings ??= [];
  let binding = policy.bindings.find(
    (item) => item.role === 'roles/aiplatform.user' && !item.condition,
  );
  if (!binding?.members.includes(member)) {
    if (!binding) {
      binding = { role: 'roles/aiplatform.user', members: [] };
      policy.bindings.push(binding);
    }
    binding.members.push(member);
    // Preserve etag, version, conditions and every unrelated binding.
    await api(
      'cloudresourcemanager.googleapis.com',
      `v1/projects/${id}:setIamPolicy`,
      'POST',
      { policy },
    );
  }
  const credentialFile = `secrets/${id}-vertex-service-account.json`;
  let runtimeCredential;
  if (localEnv.VERTEX_SERVICE_ACCOUNT_JSON)
    runtimeCredential = JSON.parse(localEnv.VERTEX_SERVICE_ACCOUNT_JSON);
  else {
    try {
      runtimeCredential = JSON.parse(await readFile(credentialFile, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  if (runtimeCredential) {
    if (
      runtimeCredential.client_email !== email ||
      runtimeCredential.project_id !== id
    )
      throw new Error('기존 인증키의 계정이 다릅니다. 덮어쓰지 않았습니다.');
    const key = await api(
      'iam.googleapis.com',
      `${accountPath}/keys/${runtimeCredential.private_key_id}`,
    );
    if (key.disabled)
      throw new Error('저장된 서비스 계정 키가 비활성 상태입니다.');
  } else {
    await mkdir('secrets', { recursive: true, mode: 0o700 });
    const key = await api('iam.googleapis.com', `${accountPath}/keys`, 'POST', {
      privateKeyType: 'TYPE_GOOGLE_CREDENTIALS_FILE',
      keyAlgorithm: 'KEY_ALG_RSA_2048',
    });
    runtimeCredential = JSON.parse(
      Buffer.from(key.privateKeyData, 'base64').toString('utf8'),
    );
    // Downloaded credential artifact is ignored by Git and only owner-readable.
    await writeFile(credentialFile, JSON.stringify(runtimeCredential), {
      flag: 'wx',
      mode: 0o600,
    });
  }
  const values = {
    GOOGLE_CLOUD_PROJECT: id,
    GOOGLE_CLOUD_LOCATION: localEnv.GOOGLE_CLOUD_LOCATION || 'global',
    VERTEX_MODEL: localEnv.VERTEX_MODEL || 'gemini-3.8-flash',
    VERTEX_API_KEY: '',
    VERTEX_ACCESS_TOKEN: '',
    VERTEX_SERVICE_ACCOUNT_JSON: `'${JSON.stringify(runtimeCredential)}'`,
  };
  let next = envText;
  for (const [key, value] of Object.entries(values)) {
    const pattern = new RegExp(`^${key}=.*$`, 'gm');
    if (pattern.test(next))
      next = next.replace(pattern, () => `${key}=${value}`);
    else next = `${next.replace(/\n*$/, '')}\n${key}=${value}\n`;
  }
  if (next !== envText) {
    const patch = `*** Begin Patch\n*** Update File: .env\n@@\n${envText
      .trimEnd()
      .split('\n')
      .map((line) => `-${line}`)
      .join('\n')}\n${next
      .trimEnd()
      .split('\n')
      .map((line) => `+${line}`)
      .join('\n')}\n*** End Patch\n`;
    const result = spawnSync('apply_patch', [], {
      input: patch,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (result.status !== 0)
      throw new Error(
        '로컬 환경 설정 적용 실패. 인증키는 secrets 폴더에 보관되어 있습니다.',
      );
  }
  await chmod('.env', 0o600);
  const saved = parseEnv(await readFile('.env', 'utf8'));
  if (JSON.parse(saved.VERTEX_SERVICE_ACCOUNT_JSON).client_email !== email)
    throw new Error('저장된 환경 설정을 검증하지 못했습니다.');
  console.log(
    JSON.stringify({
      projectId: id,
      serviceAccount: email,
      role: 'roles/aiplatform.user',
      location: values.GOOGLE_CLOUD_LOCATION,
      localServerAuthConfigured: true,
    }),
  );
} else if (args.includes('--server-status')) {
  const id = requireProject();
  const services = await Promise.all(
    ['aiplatform.googleapis.com', 'iam.googleapis.com'].map(async (service) => {
      const state = await api(
        'serviceusage.googleapis.com',
        `v1/projects/${id}/services/${service}`,
      );
      return { service, state: state.state };
    }),
  );
  const policy = await api(
    'cloudresourcemanager.googleapis.com',
    `v1/projects/${id}:getIamPolicy`,
    'POST',
    { options: { requestedPolicyVersion: 3 } },
  );
  const member = `serviceAccount:contentlint-server@${id}.iam.gserviceaccount.com`;
  console.log(
    JSON.stringify({
      projectId: id,
      services,
      serverRoles:
        policy.bindings
          ?.filter((b) => b.members.includes(member))
          .map((b) => b.role) ?? [],
    }),
  );
} else {
  throw new Error(
    'Use --inspect, --create-project, --operation-status, --project-status, --link-billing, --enable-vertex, --enable-auth-api, --configure-server, or --server-status',
  );
}
