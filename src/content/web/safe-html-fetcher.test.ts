import { describe, expect, it, vi } from 'vitest';

import type { HostnameResolver } from '@/src/security/url-validator';
import { SafeHtmlFetcher } from './safe-html-fetcher';

describe('SafeHtmlFetcher', () => {
  it('validates a private redirect target before following it', async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: 'http://127.0.0.1/admin' },
      }),
    );
    const fetcher = new SafeHtmlFetcher(publicResolver, fetchImplementation);

    await expect(fetcher.fetch('https://example.com')).rejects.toMatchObject({
      code: 'UNSAFE_URL',
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it('detects a private DNS answer returned after the request', async () => {
    const answers = [['93.184.216.34'], ['10.0.0.2']];
    const resolver: HostnameResolver = {
      async resolve() {
        return answers.shift() ?? ['10.0.0.2'];
      },
    };
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('<html><body><h1>Public page</h1></body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    );
    const fetcher = new SafeHtmlFetcher(resolver, fetchImplementation);

    await expect(fetcher.fetch('https://example.com')).rejects.toMatchObject({
      code: 'UNSAFE_URL',
    });
  });

  it('reads only the configured maximum response size', async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(`<html><body>${'A'.repeat(500)}</body></html>`, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
    );
    const fetcher = new SafeHtmlFetcher(publicResolver, fetchImplementation, {
      maximumBytes: 80,
    });

    const result = await fetcher.fetch('https://example.com');

    expect(result.responseTruncated).toBe(true);
    expect(
      new TextEncoder().encode(result.html).byteLength,
    ).toBeLessThanOrEqual(80);
  });
});

const publicResolver: HostnameResolver = {
  async resolve() {
    return ['93.184.216.34'];
  },
};
