import { describe, expect, it } from 'vitest';

import {
  UnsafeUrlError,
  validatePublicHttpUrl,
  validateResolvedPublicUrl,
} from './url-validator';

describe('validatePublicHttpUrl', () => {
  it.each([
    'file:///etc/passwd',
    'ftp://example.com/file',
    'data:text/html,hello',
    'javascript:alert(1)',
    'http://localhost:3000',
    'http://service.internal',
    'http://printer',
    'http://127.0.0.1',
    'http://127.8.9.10',
    'http://10.0.0.1',
    'http://172.16.0.1',
    'http://172.31.255.255',
    'http://192.168.1.1',
    'http://169.254.169.254/latest/meta-data',
    'http://[::1]',
    'http://[fc00::1]',
    'http://[fe80::1]',
    'http://[::ffff:127.0.0.1]',
    'http://2130706433',
  ])('rejects unsafe destination %s', (input) => {
    expect(() => validatePublicHttpUrl(input)).toThrow(UnsafeUrlError);
  });

  it.each(['https://example.com', 'http://8.8.8.8/path'])(
    'accepts public HTTP destinations %s',
    (input) => {
      expect(validatePublicHttpUrl(input).toString()).toBe(
        new URL(input).toString(),
      );
    },
  );

  it('rejects a hostname resolving to a private address', async () => {
    await expect(
      validateResolvedPublicUrl('https://public-looking.example', {
        async resolve() {
          return ['93.184.216.34', '10.0.0.8'];
        },
      }),
    ).rejects.toThrow('내부 네트워크');
  });
});
