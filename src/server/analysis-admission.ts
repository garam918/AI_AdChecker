/** Best-effort protection inside one worker isolate, not an account-wide cost cap.
 * No IP addresses, ad text or user identifiers are retained.
 */
export class AnalysisAdmissionError extends Error {
  constructor(
    public readonly status: 403 | 429,
    message: string,
  ) {
    super(message);
  }
}

export class AnalysisAdmission {
  private active = 0;
  private starts: number[] = [];
  constructor(
    private readonly now = () => Date.now(),
    private readonly concurrency = 3,
    private readonly perMinute = 15,
  ) {}

  enter(request: Request) {
    const origin = request.headers.get('origin');
    // Browser cross-origin forms must not spend this public demo's AI budget.
    // Origin-less API clients remain supported; this is not authentication.
    if (origin && origin !== new URL(request.url).origin)
      throw new AnalysisAdmissionError(
        403,
        '서비스 화면에서 다시 검사를 시작해 주세요.',
      );
    const now = this.now();
    this.starts = this.starts.filter((started) => started > now - 60000);
    if (this.active >= this.concurrency || this.starts.length >= this.perMinute)
      throw new AnalysisAdmissionError(
        429,
        '현재 검사 요청이 많습니다. 잠시 후 다시 시도해 주세요. 입력 내용은 유지됩니다.',
      );
    this.active += 1;
    this.starts.push(now);
    let released = false;
    return () => {
      if (!released) {
        this.active -= 1;
        released = true;
      }
    };
  }
}

export const analysisAdmission = new AnalysisAdmission();
