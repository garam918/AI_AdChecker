'use client';

/* oxlint-disable next/no-img-element -- Local upload blob URLs must stay in the browser and cannot use the server image optimizer. */

import { useEffect, useRef, useState } from 'react';
import { FileImage, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function ImageScanInput({
  file,
  setFile,
  onAnalyze,
}: {
  file: File | null;
  setFile: (file: File | null) => void;
  onAnalyze: () => void;
}) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!file || !imageRef.current) return;
    const url = URL.createObjectURL(file);
    imageRef.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function selectFile(selected?: File) {
    setError('');
    if (!selected) {
      setFile(null);
      return;
    }
    if (
      !['image/png', 'image/jpeg', 'image/webp'].includes(selected.type) ||
      selected.size > 5 * 1024 * 1024
    ) {
      setFile(null);
      setError('5MB 이하의 PNG, JPEG, WebP 이미지 한 장을 선택해 주세요.');
      return;
    }
    setFile(selected);
  }

  return (
    <div className="space-y-5">
      <div>
        <label
          htmlFor="scan-image"
          className="text-sm font-semibold text-slate-800"
        >
          광고 이미지 또는 상세페이지 스크린샷
        </label>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          이미지의 문구와 시각적 맥락을 함께 검사합니다. 작은 글씨까지 선명하게
          보이는 PNG, JPEG, WebP 파일을 선택하세요. 최대 5MB.
        </p>
      </div>
      <Input
        id="scan-image"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(event) => selectFile(event.target.files?.[0])}
        className="h-auto rounded-xl p-3"
      />
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {file ? (
        <figure className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <img
            ref={imageRef}
            alt="분석할 광고 이미지 미리보기"
            className="mx-auto max-h-80 max-w-full object-contain"
          />
          <figcaption className="mt-3 text-center text-xs text-slate-500">
            {file?.name} · 원본 이미지가 분석 서버로 전송됩니다.
          </figcaption>
        </figure>
      ) : (
        <div className="grid place-items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-sm text-slate-500">
          <FileImage className="size-8 text-slate-400" />
          이미지를 선택하면 미리보기가 표시됩니다.
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="outline"
          onClick={async () => {
            try {
              const response = await fetch('/demo-ad.png');
              if (!response.ok) throw new Error();
              selectFile(
                new File([await response.blob()], '광고-이미지-예제.png', {
                  type: 'image/png',
                }),
              );
            } catch {
              setError(
                '예제 이미지를 불러오지 못했습니다. 파일을 직접 선택해 주세요.',
              );
            }
          }}
        >
          예제 이미지 불러오기
        </Button>
        <Button
          size="lg"
          disabled={!file || Boolean(error)}
          onClick={onAnalyze}
          className="rounded-xl bg-indigo-600 hover:bg-indigo-700"
        >
          <Sparkles /> AI 이미지 분석 시작
        </Button>
      </div>
    </div>
  );
}
