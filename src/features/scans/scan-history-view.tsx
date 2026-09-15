'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { SavedScan } from './scan-history';

export function ScanHistoryView({
  records,
  notice,
  onOpen,
  onDelete,
  onNew,
}: {
  records: SavedScan[];
  notice: string | null;
  onOpen: (record: SavedScan) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <section className="space-y-5">
      <h1 className="text-3xl font-semibold text-slate-950">저장한 검사</h1>
      <p className="text-sm leading-6 text-slate-600">
        이 브라우저에 직접 저장한 최근 10개 기록입니다. 다른 기기와 동기화되지
        않으며 이미지 원본은 저장하지 않습니다. 삭제한 기록은 복구할 수
        없습니다.
      </p>
      {notice && (
        <output className="block rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          {notice}
        </output>
      )}
      {records.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8">
          <p className="text-slate-700">저장한 검사가 없습니다.</p>
          <p className="mt-2 text-sm text-slate-600">
            검사 결과의 ‘이 브라우저에 결과 저장’을 눌러 보관할 수 있습니다.
          </p>
          <Button className="mt-4" onClick={onNew}>
            새 검사 시작
          </Button>
        </div>
      ) : (
        <ul className="space-y-3">
          {records.map((record) => (
            <li
              key={record.id}
              className="rounded-2xl border border-slate-200 bg-white p-5"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <Badge variant="outline">{record.result.overallRisk}</Badge>
                <span>{new Date(record.savedAt).toLocaleString('ko-KR')}</span>
                <span>
                  {record.result.inputType === 'IMAGE'
                    ? '이미지'
                    : record.result.inputType === 'URL'
                      ? '웹페이지'
                      : '텍스트'}
                </span>
              </div>
              <p className="mt-3 line-clamp-2 text-sm font-medium text-slate-800">
                {record.analyzedText}
              </p>
              {record.draftText !== record.analyzedText && (
                <p className="mt-2 text-xs text-amber-800">
                  아직 재검사하지 않은 수정 초안이 함께 보관되어 있습니다.
                </p>
              )}
              <div className="mt-3 flex gap-2">
                <Button variant="outline" onClick={() => onOpen(record)}>
                  결과·초안 열기
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (
                      window.confirm(
                        '이 브라우저의 저장 기록 한 개를 삭제할까요? 복구할 수 없습니다.',
                      )
                    )
                      onDelete(record.id);
                  }}
                >
                  삭제
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
