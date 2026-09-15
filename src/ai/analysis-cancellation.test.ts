import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyzeContent } from './analyze-content';
import { analyzeUrl } from './analyze-url';
import { analyzeImage } from './analyze-image';

afterEach(() => vi.unstubAllGlobals());

describe('analysis gateway cancellation', () => {
  it.each(['TEXT', 'URL', 'IMAGE'] as const)(
    'forwards cancellation to the %s request',
    async (kind) => {
      const controller = new AbortController();
      const fetcher = vi.fn<typeof fetch>().mockImplementation(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            expect(init?.signal).toBe(controller.signal);
            init?.signal?.addEventListener(
              'abort',
              () => reject(new DOMException('Cancelled', 'AbortError')),
              { once: true },
            );
          }),
      );
      vi.stubGlobal('fetch', fetcher);
      const pending =
        kind === 'TEXT'
          ? analyzeContent(
              '합성 검사 문구',
              'BUSINESS',
              undefined,
              undefined,
              controller.signal,
            )
          : kind === 'URL'
            ? analyzeUrl(
                { fixtureId: 'ai-saas-landing' },
                undefined,
                controller.signal,
              )
            : analyzeImage(
                new File(['fixture'], 'test.png', { type: 'image/png' }),
                'BUSINESS',
                undefined,
                undefined,
                controller.signal,
              );
      controller.abort();
      await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
});
