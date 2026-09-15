import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import {
  ImageComplianceScanService,
  MAX_IMAGE_BYTES,
  verifyImageBytes,
} from './image-compliance-scan-service';
import { ScanAnalysisResultSchema } from '@/src/compliance/core/schemas';

const png = () =>
  readFile(new URL('../../../public/demo-ad.png', import.meta.url));
const emptyResult = () =>
  ScanAnalysisResultSchema.parse({
    detectedCategory: 'GENERAL_ADVERTISING',
    detectedContentType: 'ADVERTISEMENT_TEXT',
    overallRisk: 'LOW',
    claims: [],
    issues: [],
    sources: [],
  });

describe('single-image analysis', () => {
  it('passes the image to vision and preserves OCR and visual context in the compliance input', async () => {
    const vision = {
      analyzeImage: vi.fn().mockResolvedValue({
        extractedText: '업무 시간을 70% 줄입니다',
        visualObservations: [
          '무료 체험 버튼 아래에 작은 조건 문구가 보입니다.',
        ],
        incomplete: false,
      }),
    };
    const compliance = {
      analyzeContent: vi.fn().mockResolvedValue(emptyResult()),
    };
    const service = new ImageComplianceScanService(vision, compliance);
    const result = await service.analyze(
      new File([await png()], 'demo.png', { type: 'image/png' }),
    );
    expect(vision.analyzeImage).toHaveBeenCalledWith(
      expect.objectContaining({
        mimeType: 'image/png',
        data: expect.any(String),
      }),
    );
    expect(compliance.analyzeContent.mock.calls[0][0].text).toContain(
      '[시각 관찰] 무료 체험',
    );
    expect(result.inputType).toBe('IMAGE');
    expect(result.imageContent?.extractedText).toBe('업무 시간을 70% 줄입니다');
    expect(JSON.stringify(result)).not.toContain('base64');
  });

  it('marks unreadable/cropped content as partial review, not a clean result', async () => {
    const service = new ImageComplianceScanService(
      {
        analyzeImage: vi.fn().mockResolvedValue({
          extractedText: '일부 문구',
          visualObservations: [],
          incomplete: true,
        }),
      },
      { analyzeContent: vi.fn().mockResolvedValue(emptyResult()) },
    );
    const result = await service.analyze(
      new File([await png()], 'partial.png', { type: 'image/png' }),
    );
    expect(result.overallRisk).toBe('REVIEW_REQUIRED');
    expect(result.notices.at(-1)?.message).toContain('부분 분석');
  });

  it('does not fabricate results for an unreadable image', async () => {
    const compliance = { analyzeContent: vi.fn() };
    const service = new ImageComplianceScanService(
      {
        analyzeImage: vi.fn().mockResolvedValue({
          extractedText: '',
          visualObservations: [],
          incomplete: true,
        }),
      },
      compliance,
    );
    await expect(
      service.analyze(
        new File([await png()], 'empty.png', { type: 'image/png' }),
      ),
    ).rejects.toMatchObject({ code: 'IMAGE_EMPTY' });
    expect(compliance.analyzeContent).not.toHaveBeenCalled();
  });

  it('rejects video, spoofed MIME types and oversized images before AI calls', async () => {
    const bytes = new Uint8Array(await png());
    expect(() => verifyImageBytes(bytes, 'video/mp4')).toThrow();
    expect(() => verifyImageBytes(bytes, 'image/jpeg')).toThrow();
    expect(() => verifyImageBytes(new Uint8Array(100), 'image/png')).toThrow();
    const vision = { analyzeImage: vi.fn() };
    const service = new ImageComplianceScanService(vision, {
      analyzeContent: vi.fn(),
    });
    await expect(
      service.analyze(
        new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], 'large.png', {
          type: 'image/png',
        }),
      ),
    ).rejects.toMatchObject({ code: 'IMAGE_TOO_LARGE' });
    expect(vision.analyzeImage).not.toHaveBeenCalled();
  });

  it('rejects animated PNG inputs', async () => {
    const bytes = new Uint8Array(40);
    bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
    bytes.set([97, 99, 84, 76], 12); // acTL first chunk tag
    expect(() => verifyImageBytes(bytes, 'image/png')).toThrow(
      '움직이는 이미지',
    );
  });
});
