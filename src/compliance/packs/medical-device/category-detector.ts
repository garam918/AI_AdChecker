import type {
  PackCategoryDetection,
  PackContentInput,
} from '@/src/compliance/core/compliance-pack';

const STRONG_PATTERN =
  /의료\s*기기|품목허가번호|의료기기\s*[1-4]\s*등급|식약처\s*(?:허가|인증|신고)\s*(?:받은\s*)?의료기기/;

export function detectMedicalDeviceCategory(
  input: PackContentInput,
): PackCategoryDetection {
  if (input.categoryHint === 'MEDICAL_DEVICE') {
    return {
      category: 'MEDICAL_DEVICE',
      confidence: 1,
      disposition: 'MATCH',
      reasons: ['사용자가 제품 유형을 의료기기로 지정했습니다.'],
    };
  }
  if (STRONG_PATTERN.test(searchable(input))) {
    return {
      category: 'MEDICAL_DEVICE',
      confidence: 0.995,
      disposition: 'MATCH',
      reasons: ['의료기기의 명시적 제품 정체성 신호를 확인했습니다.'],
    };
  }
  return {
    category: 'MEDICAL_DEVICE',
    confidence: 0,
    disposition: 'NO_MATCH',
    reasons: ['의료기기 정체성 신호를 확인하지 못했습니다.'],
  };
}

function searchable(input: PackContentInput) {
  return `${input.text} ${(input.webContent?.structuredData ?? [])
    .map((entry) => JSON.stringify(entry))
    .join(' ')}`;
}
