import { z } from 'zod';
import { ScanAnalysisResultSchema } from '@/src/compliance/core/schemas';
import type { AnalysisProgress } from './providers/content-analysis-provider';

const EventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('progress'),
    stage: z.enum([
      'EXTRACTING',
      'CLASSIFYING',
      'RETRIEVING',
      'ANALYZING',
      'VALIDATING',
    ]),
  }),
  z.object({ type: z.literal('result'), result: ScanAnalysisResultSchema }),
  z.object({ type: z.literal('error'), message: z.string() }),
]);

export async function requestAnalysis(
  url: string,
  init: RequestInit,
  onProgress?: AnalysisProgress,
) {
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/x-ndjson');
  const response = await fetch(url, {
    ...init,
    headers,
  });
  if (!response.ok) {
    const body = z
      .object({ message: z.string() })
      .safeParse(await response.json().catch(() => null));
    throw new Error(
      body.success ? body.data.message : '분석 요청을 완료하지 못했습니다.',
    );
  }
  if (!response.body) throw new Error('분석 응답을 받지 못했습니다.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += done
        ? decoder.decode()
        : decoder.decode(value, { stream: true });
      if (buffer.length > 4_000_000)
        throw new Error('분석 응답이 허용 크기를 초과했습니다.');
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      if (done && buffer.trim()) {
        lines.push(buffer);
        buffer = '';
      }
      for (const line of lines) {
        if (!line.trim()) continue;
        const parsed = EventSchema.safeParse(JSON.parse(line));
        if (!parsed.success)
          throw new Error('분석 응답 형식을 검증하지 못했습니다.');
        const event = parsed.data;
        if (event.type === 'progress') onProgress?.(event.stage);
        else if (event.type === 'error') throw new Error(event.message);
        else return event.result;
      }
      if (done)
        throw new Error(
          '분석 연결이 종료되었습니다. 완전한 결과를 받지 못했으니 다시 시도해 주세요.',
        );
    }
  } finally {
    await reader.cancel();
  }
}
