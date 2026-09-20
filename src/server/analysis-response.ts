import { AIAnalysisError } from '@/src/ai/providers/gemini-client';
import type {
  AnalysisProgress,
  AnalysisStage,
} from '@/src/ai/providers/content-analysis-provider';
import {
  ScanAnalysisResultSchema,
  type ScanAnalysisResult,
} from '@/src/compliance/core/schemas';
import { WebExtractionError } from '@/src/content/web/web-extraction-error';
import { UnsafeUrlError } from '@/src/security/url-validator';
import {
  analysisAdmission,
  AnalysisAdmissionError,
} from './analysis-admission';

export class AnalysisInputError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

export function analysisError(error: unknown) {
  if (error instanceof AnalysisAdmissionError)
    return {
      code: error.status === 429 ? 'ANALYSIS_BUSY' : 'ORIGIN_REJECTED',
      message: error.message,
      status: error.status,
    };
  if (error instanceof AIAnalysisError)
    return { code: error.code, message: error.message, status: error.status };
  if (error instanceof AnalysisInputError || error instanceof UnsafeUrlError)
    return {
      code: 'INVALID_INPUT',
      message: error.message,
      status: error instanceof AnalysisInputError ? error.status : 400,
    };
  if (error instanceof WebExtractionError)
    return {
      code: error.code,
      message: error.message,
      status: error.httpStatus,
    };
  return {
    code: 'ANALYSIS_FAILED',
    message: '분석을 완료하지 못했습니다. 결과를 생성하지 않았습니다.',
    status: 500,
  };
}

export function errorResponse(error: unknown) {
  const { status, ...body } = analysisError(error);
  return Response.json(body, {
    status,
    headers: {
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

export async function readLimitedBody(request: Request, limit: number) {
  if (Number(request.headers.get('content-length')) > limit)
    throw new AnalysisInputError('입력 용량이 허용 범위를 초과했습니다.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new AnalysisInputError('분석할 내용을 입력해 주세요.');
  let size = 0;
  const parts: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new AnalysisInputError(
        '입력 용량이 허용 범위를 초과했습니다.',
        413,
      );
    }
    parts.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  return bytes;
}

export async function readAnalysisJson(request: Request) {
  const bytes = await readLimitedBody(request, 64_000);
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new AnalysisInputError('올바른 JSON 입력이 필요합니다.');
  }
}

export async function analysisResponse(
  request: Request,
  work: (progress: AnalysisProgress) => Promise<ScanAnalysisResult>,
) {
  let release: () => void;
  try {
    release = analysisAdmission.enter(request);
  } catch (error) {
    return errorResponse(error);
  }
  if (!request.headers.get('accept')?.includes('application/x-ndjson')) {
    try {
      return Response.json(
        ScanAnalysisResultSchema.parse(await work(() => {})),
        {
          headers: {
            'cache-control': 'no-store',
            'x-content-type-options': 'nosniff',
          },
        },
      );
    } catch (error) {
      return errorResponse(error);
    } finally {
      release();
    }
  }
  let closed = false;
  const encoder = new TextEncoder();
  const stages: AnalysisStage[] = [
    'EXTRACTING',
    'CLASSIFYING',
    'RETRIEVING',
    'ANALYZING',
    'VALIDATING',
  ];
  const stream = new ReadableStream({
    async start(controller) {
      const send = (value: unknown) => {
        if (!closed)
          controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
      };
      let lastStage = -1;
      try {
        const result = await work((stage) => {
          const index = stages.indexOf(stage);
          // Citation validation happens per pack. Show the final stage after all packs finish.
          if (stage !== 'VALIDATING' && index > lastStage) {
            lastStage = index;
            send({ type: 'progress', stage });
          }
        });
        send({ type: 'progress', stage: 'VALIDATING' });
        send({
          type: 'result',
          result: ScanAnalysisResultSchema.parse(result),
        });
      } catch (error) {
        send({ type: 'error', ...analysisError(error) });
      } finally {
        release();
        if (!closed) controller.close();
        closed = true;
      }
    },
    cancel() {
      closed = true;
    },
  });
  return new Response(stream, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
