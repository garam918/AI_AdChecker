import type { HostnameResolver } from './url-validator';

type DnsJsonResponse = {
  Status?: number;
  Answer?: Array<{ type?: number; data?: string }>;
};

export class CloudflareDnsResolver implements HostnameResolver {
  constructor(
    private readonly fetchImplementation: typeof fetch = fetch,
    private readonly timeoutMilliseconds = 3_000,
  ) {}

  async resolve(hostname: string) {
    const responses = await Promise.all([
      this.query(hostname, 'A'),
      this.query(hostname, 'AAAA'),
    ]);
    return [
      ...new Set(
        responses.flatMap((response) =>
          (response.Answer ?? [])
            .filter((answer) => answer.type === 1 || answer.type === 28)
            .map((answer) => answer.data)
            .filter((value): value is string => Boolean(value)),
        ),
      ),
    ];
  }

  private async query(hostname: string, type: 'A' | 'AAAA') {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.timeoutMilliseconds,
    );
    try {
      const url = new URL('https://cloudflare-dns.com/dns-query');
      url.searchParams.set('name', hostname);
      url.searchParams.set('type', type);
      const response = await this.fetchImplementation(url, {
        headers: { accept: 'application/dns-json' },
        signal: controller.signal,
      });
      if (!response.ok)
        throw new Error(`DNS lookup failed: ${response.status}`);
      const result = (await response.json()) as DnsJsonResponse;
      if (result.Status !== 0) return {};
      return result;
    } finally {
      clearTimeout(timeout);
    }
  }
}
