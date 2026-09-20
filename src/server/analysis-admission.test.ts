import { describe, expect, it } from 'vitest';
import { AnalysisAdmission } from './analysis-admission';

const request = (origin?: string) =>
  new Request('https://contentlint.test/api/analyze', {
    headers: origin ? { origin } : {},
  });

describe('best-effort analysis admission', () => {
  it('rejects foreign and opaque browser origins without consuming capacity', () => {
    const gate = new AnalysisAdmission(() => 0, 1, 1);
    expect(() => gate.enter(request('https://foreign.test'))).toThrow();
    expect(() => gate.enter(request('null'))).toThrow();
    expect(() => gate.enter(request('https://contentlint.test'))).not.toThrow();
  });
  it('limits concurrency and releases each lease only once', () => {
    const gate = new AnalysisAdmission(() => 0, 1, 10);
    const release = gate.enter(request());
    expect(() => gate.enter(request())).toThrow();
    release();
    release();
    gate.enter(request());
    expect(() => gate.enter(request())).toThrow();
  });
  it('limits rapid completed calls and expires the rolling window', () => {
    let now = 0;
    const gate = new AnalysisAdmission(() => now, 1, 2);
    gate.enter(request())();
    gate.enter(request())();
    expect(() => gate.enter(request())).toThrow();
    now = 60000;
    expect(() => gate.enter(request())).not.toThrow();
  });
});
