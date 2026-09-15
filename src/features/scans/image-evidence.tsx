'use client';

/* oxlint-disable next/no-img-element -- The local upload blob must stay in this browser, not the server image optimizer. */

import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import type { ScanAnalysisResult } from '@/src/compliance/core/schemas';

export function ImageEvidence({
  result,
  file,
  selectedQuote,
  onNewImage,
}: {
  result: ScanAnalysisResult;
  file: File | null;
  selectedQuote?: string;
  onNewImage: () => void;
}) {
  const imageRef = useRef<HTMLImageElement>(null);
  const linkRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (!file || !imageRef.current || !linkRef.current) return;
    const url = URL.createObjectURL(file);
    imageRef.current.src = url;
    linkRef.current.href = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const content = result.imageContent;
  if (!content) return null;
  const quote = selectedQuote?.replace(/^\[시각 관찰\]\s*/, '');
  const highlight = (text: string) => {
    const index = quote ? text.indexOf(quote) : -1;
    return index >= 0 && quote ? (
      <>
        {text.slice(0, index)}
        <mark className="rounded bg-amber-100 px-1 text-amber-950">
          {quote}
        </mark>
        {text.slice(index + quote.length)}
      </>
    ) : (
      text
    );
  };
  return (
    <section
      id="image-evidence"
      className="rounded-2xl border border-slate-200 bg-white p-5"
      aria-label="이미지 원본과 추출 정보 대조"
    >
      <h2 className="font-semibold text-slate-900">이미지 원본과 대조하기</h2>
      <p className="mt-1 text-xs leading-5 text-slate-600">
        {content.fileName} · 위치 좌표는 추정하지 않습니다. 표시한 문구를
        원본에서 직접 확인하세요.
      </p>
      <div className="mt-4 grid items-start gap-5 md:grid-cols-2">
        <div>
          {file ? (
            <a
              href="#image-original"
              ref={linkRef}
              target="_blank"
              rel="noreferrer"
              aria-label="분석한 원본 이미지 크게 보기"
            >
              <img
                id="image-original"
                ref={imageRef}
                alt="검사에 사용한 원본 광고 이미지"
                className="max-h-[560px] w-full rounded-xl border border-slate-200 object-contain"
              />
            </a>
          ) : (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
              이미지 원본은 저장하지 않습니다. 원본을 보려면 파일을 다시 선택해
              주세요.
            </p>
          )}
          <Button variant="outline" onClick={onNewImage} className="mt-3">
            수정한 이미지 새로 검사
          </Button>
        </div>
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">
              읽어낸 문구 · 원본 확인 필요
            </h3>
            <p className="mt-2 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-700">
              {highlight(content.extractedText) || '읽어낸 문구가 없습니다.'}
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-800">
              시각 관찰 · AI 해석
            </h3>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              텍스트 인식과 다릅니다. 사진의 의미·배치는 원본과 대조해야 합니다.
            </p>
            {content.visualObservations.length ? (
              <ul className="mt-2 space-y-2">
                {content.visualObservations.map((item, index) => (
                  <li
                    key={index}
                    className="rounded-xl border border-indigo-100 p-3 text-sm leading-6 text-slate-700"
                  >
                    {highlight(item)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-slate-600">
                별도의 시각 관찰이 없습니다.
              </p>
            )}
          </div>
          {content.incomplete && (
            <output className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
              일부 내용을 읽지 못한 부분 분석입니다. 더 선명한 원본으로
              재검사하세요.
            </output>
          )}
          <p className="text-xs leading-5 text-slate-600">
            수정 초안 재검사는 텍스트만 확인합니다. 이미지의 배치·각주·사진까지
            확인하려면 수정한 이미지를 업로드해야 합니다.
          </p>
        </div>
      </div>
    </section>
  );
}
