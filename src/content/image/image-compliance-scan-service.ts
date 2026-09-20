import type { GeminiImage } from '@/src/ai/providers/gemini-client';
import { AIAnalysisError } from '@/src/ai/providers/gemini-client';
import type { AnalysisProgress } from '@/src/ai/providers/content-analysis-provider';
import { ImageExtractionSchema } from '@/src/ai/providers/gemini-content-provider';
import type { ContentComplianceScanService } from '@/src/compliance/core/content-compliance-scan-service';
import type { PackContentInput } from '@/src/compliance/core/compliance-pack';
import { ScanAnalysisResultSchema } from '@/src/compliance/core/schemas';
import type { z } from 'zod';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;

export function verifyImageBytes(
  bytes: Uint8Array,
  mimeType: string,
): GeminiImage['mimeType'] {
  const isPng = [137, 80, 78, 71, 13, 10, 26, 10].every(
    (byte, index) => bytes[index] === byte,
  );
  const isJpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const ascii = (start: number, end: number) =>
    String.fromCharCode(...bytes.slice(start, end));
  const isWebp = ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
  const expected = isPng
    ? 'image/png'
    : isJpeg
      ? 'image/jpeg'
      : isWebp
        ? 'image/webp'
        : null;
  if (
    bytes.length < 24 ||
    bytes.length > MAX_IMAGE_BYTES ||
    !expected ||
    expected !== mimeType
  )
    throw new AIAnalysisError(
      'INVALID_IMAGE',
      '5MB 이하의 PNG, JPEG, WebP 이미지를 업로드해 주세요. 파일 내용과 형식이 일치해야 합니다.',
      400,
    );
  // Animated PNG/WebP are outside the single-image scope. Scan chunk tags, not arbitrary compressed bytes.
  let cursor = isPng ? 8 : 12;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (isPng || isWebp)
    while (cursor + 8 <= bytes.length) {
      const tag = ascii(
        isPng ? cursor + 4 : cursor,
        isPng ? cursor + 8 : cursor + 4,
      );
      if (tag === 'acTL' || tag === 'ANIM' || tag === 'ANMF')
        throw new AIAnalysisError(
          'ANIMATED_IMAGE_UNSUPPORTED',
          '움직이는 이미지는 지원하지 않습니다. 정지 화면을 업로드해 주세요.',
          400,
        );
      const length = view.getUint32(isPng ? cursor : cursor + 4, !isPng);
      cursor += isPng ? length + 12 : length + 8 + (length % 2);
    }
  return expected;
}

export class ImageComplianceScanService {
  constructor(
    private readonly vision: {
      analyzeImage(
        image: GeminiImage,
      ): Promise<z.infer<typeof ImageExtractionSchema>>;
    },
    private readonly compliance: Pick<
      ContentComplianceScanService,
      'analyzeContent'
    >,
  ) {}

  async analyze(
    file: File,
    options: Pick<PackContentInput, 'categoryHint' | 'productIdentity'> = {},
    progress?: AnalysisProgress,
  ) {
    if (file.size > MAX_IMAGE_BYTES)
      throw new AIAnalysisError(
        'IMAGE_TOO_LARGE',
        '이미지는 5MB 이하로 업로드해 주세요.',
        413,
      );
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mimeType = verifyImageBytes(bytes, file.type);
    progress?.('EXTRACTING');
    const extraction = ImageExtractionSchema.parse(
      await this.vision.analyzeImage({
        mimeType,
        data: Buffer.from(bytes).toString('base64'),
      }),
    );
    const analysisText = [
      extraction.extractedText,
      ...extraction.visualObservations.map((item) => `[시각 관찰] ${item}`),
    ]
      .filter(Boolean)
      .join('\n')
      .trim();
    if (!analysisText)
      throw new AIAnalysisError(
        'IMAGE_EMPTY',
        '이미지에서 분석 가능한 광고 문구나 시각적 정보를 읽지 못했습니다. 더 선명한 이미지나 텍스트를 입력해 주세요.',
        422,
      );
    const result = await this.compliance.analyzeContent(
      {
        ...options,
        text: analysisText,
        detectedContentType: 'ADVERTISEMENT_TEXT',
      },
      progress,
    );
    return ScanAnalysisResultSchema.parse({
      ...result,
      inputType: 'IMAGE',
      // Coverage normalization preserves already-discovered HIGH/MEDIUM findings.
      imageContent: {
        ...extraction,
        analysisText,
        fileName: file.name.slice(0, 160),
        mimeType,
      },
      notices: [
        ...result.notices,
        {
          code: 'IMAGE_EXTRACTION_LIMITS',
          message: extraction.incomplete
            ? '이미지의 일부 정보를 읽지 못해 부분 분석으로 표시합니다. 원본을 확인하고 선명한 이미지로 다시 검사해 주세요.'
            : '이미지에서 읽은 문구와 시각 관찰을 기반으로 분석했습니다. 작은 글씨와 배치 해석은 원본과 대조해 주세요. 수정 문구 재검사는 텍스트만 검사하며, 수정한 이미지는 새로 업로드해야 합니다.',
        },
      ],
    });
  }
}
