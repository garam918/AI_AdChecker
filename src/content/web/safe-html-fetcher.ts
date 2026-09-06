import {
  UnsafeUrlError,
  validatePublicHttpUrl,
  validateResolvedPublicUrl,
  type HostnameResolver,
} from '@/src/security/url-validator';

import { WebExtractionError } from './web-extraction-error';

export const DEFAULT_MAXIMUM_HTML_BYTES = 1_000_000;
export const DEFAULT_FETCH_TIMEOUT_MILLISECONDS = 8_000;
export const DEFAULT_MAXIMUM_REDIRECTS = 4;

const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);
const HTML_CONTENT_TYPES = ['text/html', 'application/xhtml+xml'];

export type FetchedHtml = {
  url: string;
  finalUrl: string;
  html: string;
  responseTruncated: boolean;
};

export class SafeHtmlFetcher {
  constructor(
    private readonly resolver: HostnameResolver,
    private readonly fetchImplementation: typeof fetch = fetch,
    private readonly options: {
      maximumBytes?: number;
      timeoutMilliseconds?: number;
      maximumRedirects?: number;
    } = {},
  ) {}

  async fetch(input: string): Promise<FetchedHtml> {
    const originalUrl = this.validateInput(input);
    let currentUrl = originalUrl;
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.options.timeoutMilliseconds ?? DEFAULT_FETCH_TIMEOUT_MILLISECONDS,
    );

    try {
      for (
        let redirectCount = 0;
        redirectCount <=
        (this.options.maximumRedirects ?? DEFAULT_MAXIMUM_REDIRECTS);
        redirectCount += 1
      ) {
        await this.validateDestination(currentUrl);
        const response = await this.fetchImplementation(currentUrl, {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
          headers: {
            accept: 'text/html,application/xhtml+xml',
            'user-agent': 'ContentLintAI/0.1 (+compliance-precheck)',
          },
        });
        await this.validateDestination(currentUrl);

        if (REDIRECT_STATUS_CODES.has(response.status)) {
          const location = response.headers.get('location');
          if (!location) {
            throw new WebExtractionError(
              'HTTP_ERROR',
              '리디렉션 위치가 없어 페이지를 불러오지 못했습니다.',
            );
          }
          if (
            redirectCount ===
            (this.options.maximumRedirects ?? DEFAULT_MAXIMUM_REDIRECTS)
          ) {
            throw new WebExtractionError(
              'TOO_MANY_REDIRECTS',
              '리디렉션이 너무 많아 페이지를 불러오지 못했습니다.',
            );
          }
          currentUrl = this.validateInput(
            new URL(location, currentUrl).toString(),
          );
          continue;
        }

        if ([401, 403, 429].includes(response.status)) {
          throw new WebExtractionError(
            'BLOCKED',
            '사이트가 자동 접근을 차단했습니다.',
            422,
          );
        }
        if (!response.ok) {
          throw new WebExtractionError(
            'HTTP_ERROR',
            `페이지를 불러오지 못했습니다. (HTTP ${response.status})`,
            422,
          );
        }

        const contentType = response.headers.get('content-type')?.toLowerCase();
        if (
          !contentType ||
          !HTML_CONTENT_TYPES.some((type) => contentType.includes(type))
        ) {
          throw new WebExtractionError(
            'NON_HTML',
            '현재 웹페이지 HTML 형식만 지원합니다.',
          );
        }

        const { text, truncated } = await readLimitedText(
          response,
          this.options.maximumBytes ?? DEFAULT_MAXIMUM_HTML_BYTES,
        );
        return {
          url: originalUrl.toString(),
          finalUrl: currentUrl.toString(),
          html: text,
          responseTruncated: truncated,
        };
      }
      throw new WebExtractionError(
        'TOO_MANY_REDIRECTS',
        '리디렉션이 너무 많아 페이지를 불러오지 못했습니다.',
      );
    } catch (error) {
      if (error instanceof WebExtractionError) throw error;
      if (error instanceof UnsafeUrlError) {
        throw new WebExtractionError('UNSAFE_URL', error.message, 400);
      }
      if (controller.signal.aborted) {
        throw new WebExtractionError(
          'TIMEOUT',
          '페이지 응답 시간이 초과되었습니다.',
        );
      }
      throw new WebExtractionError(
        'HTTP_ERROR',
        '페이지를 불러오지 못했습니다.',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private validateInput(input: string) {
    try {
      return validatePublicHttpUrl(input);
    } catch (error) {
      throw new WebExtractionError(
        'UNSAFE_URL',
        error instanceof UnsafeUrlError
          ? error.message
          : '올바른 웹사이트 URL을 입력해 주세요.',
        400,
      );
    }
  }

  private async validateDestination(url: URL) {
    try {
      await validateResolvedPublicUrl(url, this.resolver);
    } catch (error) {
      if (error instanceof UnsafeUrlError) {
        throw new WebExtractionError('UNSAFE_URL', error.message, 400);
      }
      throw error;
    }
  }
}

async function readLimitedText(response: Response, maximumBytes: number) {
  if (!response.body) {
    throw new WebExtractionError(
      'EMPTY_CONTENT',
      '페이지에서 분석할 콘텐츠를 읽지 못했습니다.',
    );
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parts: string[] = [];
  let bytesRead = 0;
  let truncated = false;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const remaining = maximumBytes - bytesRead;
    if (remaining <= 0) {
      truncated = true;
      await reader.cancel();
      break;
    }
    const accepted =
      value.byteLength > remaining ? value.slice(0, remaining) : value;
    parts.push(decoder.decode(accepted, { stream: true }));
    bytesRead += accepted.byteLength;
    if (accepted.byteLength < value.byteLength) {
      truncated = true;
      await reader.cancel();
      break;
    }
  }
  parts.push(decoder.decode());
  return { text: parts.join(''), truncated };
}
