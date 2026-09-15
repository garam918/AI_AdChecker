import { z } from 'zod';
import { ScanAnalysisResultSchema } from '@/src/compliance/core/schemas';

export const HISTORY_STORAGE_KEY = 'contentlint.saved-scans.v1';
export const HISTORY_LIMIT = 10;
const MAX_STORAGE_CHARS = 2_000_000;

export const SavedScanSchema = z
  .object({
    id: z.string().min(1).max(100),
    savedAt: z.iso.datetime(),
    analyzedText: z.string().max(200_000),
    draftText: z.string().max(200_000),
    result: ScanAnalysisResultSchema,
    review: z.object({
      elapsedMs: z.number().nonnegative().nullable(),
      completed: z.boolean(),
      note: z.string().max(2000),
    }),
  })
  .superRefine(({ result, review }, context) => {
    const links = [
      ...result.sources.map((source) => source.sourceUrl),
      ...result.enforcementCases.map((item) => item.sourceUrl),
      result.webContent?.url,
      result.webContent?.finalUrl,
      result.productAuthorization?.sourceUrl,
    ];
    if (links.some((url) => url && !/^https?:\/\//i.test(url)))
      context.addIssue({
        code: 'custom',
        message: '저장된 출처 주소를 검증하지 못했습니다.',
      });
    if (review.completed !== (review.elapsedMs !== null))
      context.addIssue({
        code: 'custom',
        message: '검토 완료와 시간 기록이 일치하지 않습니다.',
      });
  });
export type SavedScan = z.infer<typeof SavedScanSchema>;
type HistoryStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function readScanHistory(storage: HistoryStorage): SavedScan[] {
  const raw = storage.getItem(HISTORY_STORAGE_KEY);
  if (!raw) return [];
  if (raw.length > MAX_STORAGE_CHARS)
    throw new Error('저장된 기록이 허용 크기를 초과했습니다.');
  const records = z
    .array(SavedScanSchema)
    .max(HISTORY_LIMIT)
    .parse(JSON.parse(raw));
  return records;
}

export function saveScanHistory(
  storage: HistoryStorage,
  record: SavedScan,
): SavedScan[] {
  const parsed = SavedScanSchema.parse(record);
  const records = [
    parsed,
    ...readScanHistory(storage).filter((item) => item.id !== parsed.id),
  ].slice(0, HISTORY_LIMIT);
  const raw = JSON.stringify(records);
  if (raw.length > MAX_STORAGE_CHARS)
    throw new Error(
      '저장 공간 한도에 도달했습니다. 오래된 기록을 지우고 다시 저장해 주세요.',
    );
  storage.setItem(HISTORY_STORAGE_KEY, raw);
  return records;
}

export function removeSavedScan(
  storage: HistoryStorage,
  id: string,
): SavedScan[] {
  const records = readScanHistory(storage).filter((item) => item.id !== id);
  storage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(records));
  return records;
}
