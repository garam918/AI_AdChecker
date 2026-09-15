import { z } from 'zod';

const NAME_PATTERN = /^[a-z0-9-]+$/;
const MODEL_PATTERN = /^[a-zA-Z0-9._-]+$/;

export type VertexEnv = Record<string, string | undefined>;

export type VertexRequestConfig = {
  url: string;
  headers: Record<string, string>;
};

/**
 * Resolves the Vertex AI generateContent endpoint and auth headers.
 *
 * Two modes are supported, in priority order:
 * 1. Express mode: `VERTEX_API_KEY` (no project required).
 * 2. Project mode: `GOOGLE_CLOUD_PROJECT` + `GOOGLE_CLOUD_LOCATION` with either
 *    a pre-issued `VERTEX_ACCESS_TOKEN` or a service account JSON in
 *    `VERTEX_SERVICE_ACCOUNT_JSON` (signed here with WebCrypto).
 *
 * Works in Cloudflare Workers as well as Node: no filesystem, gcloud CLI or
 * browser credentials are touched.
 */
export async function vertexRequestConfig(
  env: VertexEnv,
  model: string,
  fetcher: typeof fetch,
  signal: AbortSignal,
): Promise<VertexRequestConfig> {
  if (!MODEL_PATTERN.test(model)) throw new Error('Invalid Vertex model name');

  const apiKey = env.VERTEX_API_KEY?.trim();
  if (apiKey) {
    return {
      url: `https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:generateContent`,
      headers: { 'x-goog-api-key': apiKey },
    };
  }

  const project = env.GOOGLE_CLOUD_PROJECT?.trim();
  const location = env.GOOGLE_CLOUD_LOCATION?.trim() || 'global';
  if (!project || !NAME_PATTERN.test(project) || !NAME_PATTERN.test(location))
    throw new Error('Vertex project and location are required');

  const token =
    env.VERTEX_ACCESS_TOKEN?.trim() ||
    (await serviceAccountToken(env, fetcher, signal));
  const host =
    location === 'global'
      ? 'aiplatform.googleapis.com'
      : `${location}-aiplatform.googleapis.com`;
  return {
    url: `https://${host}/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`,
    headers: { authorization: `Bearer ${token}` },
  };
}

export function isVertexConfigured(env: VertexEnv) {
  return Boolean(
    env.VERTEX_API_KEY?.trim() ||
    (env.GOOGLE_CLOUD_PROJECT?.trim() &&
      (env.VERTEX_ACCESS_TOKEN?.trim() ||
        env.VERTEX_SERVICE_ACCOUNT_JSON?.trim())),
  );
}

const ServiceAccountSchema = z.object({
  client_email: z.email(),
  private_key: z.string().min(1),
});

async function serviceAccountToken(
  env: VertexEnv,
  fetcher: typeof fetch,
  signal: AbortSignal,
) {
  const account = ServiceAccountSchema.parse(
    JSON.parse(env.VERTEX_SERVICE_ACCOUNT_JSON || '{}'),
  );
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const message = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    Buffer.from(
      account.private_key.replace(/-----[^-]+-----|\s/g, ''),
      'base64',
    ),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(message),
  );
  const response = await fetcher('https://oauth2.googleapis.com/token', {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${message}.${Buffer.from(signature).toString('base64url')}`,
    }),
  });
  if (!response.ok) {
    await response.body?.cancel();
    // Never surface the token endpoint body; it can echo the assertion.
    throw new Error('Vertex token exchange failed');
  }
  return z
    .object({ access_token: z.string().min(1) })
    .parse(await response.json()).access_token;
}
