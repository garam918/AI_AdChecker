import { describe, expect, it } from 'vitest';
import { ScanAnalysisResultSchema } from '@/src/compliance/core/schemas';
import {
  HISTORY_STORAGE_KEY,
  readScanHistory,
  saveScanHistory,
  removeSavedScan,
  type SavedScan,
} from './scan-history';

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}
function record(id = 'one'): SavedScan {
  return {
    id,
    savedAt: '2026-09-15T00:00:00.000Z',
    analyzedText: '팀 협업 도구',
    draftText: '팀 협업 도구',
    review: { elapsedMs: null, completed: false, note: '' },
    result: ScanAnalysisResultSchema.parse({
      detectedContentType: 'ADVERTISEMENT_TEXT',
      detectedCategory: 'GENERAL_ADVERTISING',
      overallRisk: 'LOW',
      claims: [],
      issues: [],
      sources: [],
    }),
  };
}

describe('explicit browser scan history', () => {
  it('starts empty and saves/restores the actual result and draft', () => {
    const target = storage();
    expect(readScanHistory(target)).toEqual([]);
    const saved = { ...record(), draftText: '수정한 설명' };
    saveScanHistory(target, saved);
    expect(readScanHistory(target)).toEqual([saved]);
  });
  it('keeps at most 10 records, newest first, and deletes only the requested id', () => {
    const target = storage();
    target.setItem('unrelated-data', 'keep');
    for (let i = 0; i < 12; i++) saveScanHistory(target, record(String(i)));
    expect(readScanHistory(target).map((item) => item.id)).toEqual([
      '11',
      '10',
      '9',
      '8',
      '7',
      '6',
      '5',
      '4',
      '3',
      '2',
    ]);
    expect(removeSavedScan(target, '7')).toHaveLength(9);
    expect(target.getItem('unrelated-data')).toBe('keep');
  });
  it('does not silently overwrite corrupt existing records', () => {
    const target = storage();
    target.setItem(HISTORY_STORAGE_KEY, '{broken');
    expect(() => saveScanHistory(target, record())).toThrow();
    expect(target.getItem(HISTORY_STORAGE_KEY)).toBe('{broken');
  });
  it('rejects executable source URLs before storing or reopening a result', () => {
    const target = storage();
    const bad = record();
    bad.result.sources = [
      {
        id: 'a',
        documentId: null,
        chunkId: null,
        title: '출처',
        shortTitle: null,
        authority: '기관',
        sourceType: null,
        effectiveDate: null,
        article: null,
        paragraph: null,
        section: null,
        heading: null,
        provision: null,
        text: '본문',
        sourceUrl: 'javascript:alert(1)',
        citationStatus: 'REVIEW_REQUIRED',
        isDemoData: false,
      },
    ];
    expect(() => saveScanHistory(target, bad)).toThrow();
    target.setItem(HISTORY_STORAGE_KEY, JSON.stringify([bad]));
    expect(() => readScanHistory(target)).toThrow();
  });
  it('never stores unknown image binary fields or unmeasured completion', () => {
    const target = storage();
    const extra = { ...record(), imageFile: 'private-image-bytes' };
    saveScanHistory(target, extra);
    expect(target.getItem(HISTORY_STORAGE_KEY)).not.toContain(
      'private-image-bytes',
    );
    expect(() =>
      saveScanHistory(target, {
        ...record('bad'),
        review: { completed: true, elapsedMs: null, note: '' },
      }),
    ).toThrow();
  });
  it('surfaces unavailable storage and quota errors', () => {
    expect(() =>
      saveScanHistory(
        {
          getItem: () => null,
          setItem: () => {
            throw new Error('quota');
          },
        },
        record(),
      ),
    ).toThrow('quota');
    expect(() =>
      readScanHistory({
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {},
      }),
    ).toThrow('blocked');
  });
});
