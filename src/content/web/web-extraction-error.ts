export const WebExtractionErrorCode = {
  UNSAFE_URL: 'UNSAFE_URL',
  DNS_UNRESOLVED: 'DNS_UNRESOLVED',
  HTTP_ERROR: 'HTTP_ERROR',
  BLOCKED: 'BLOCKED',
  NON_HTML: 'NON_HTML',
  TOO_MANY_REDIRECTS: 'TOO_MANY_REDIRECTS',
  TIMEOUT: 'TIMEOUT',
  JAVASCRIPT_ONLY: 'JAVASCRIPT_ONLY',
  EMPTY_CONTENT: 'EMPTY_CONTENT',
} as const;

export type WebExtractionErrorCode =
  (typeof WebExtractionErrorCode)[keyof typeof WebExtractionErrorCode];

export class WebExtractionError extends Error {
  constructor(
    readonly code: WebExtractionErrorCode,
    message: string,
    readonly httpStatus = 422,
  ) {
    super(message);
    this.name = 'WebExtractionError';
  }
}
