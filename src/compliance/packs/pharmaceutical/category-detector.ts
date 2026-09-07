import type {
  PackCategoryDetection,
  PackContentInput,
} from '@/src/compliance/core/compliance-pack';

const STRONG_PATTERN =
  /전문\s*의약품|일반\s*의약품|의약품|품목기준코드|복약정보|의약품\s*허가|(?:정제|캡슐제|시럽제)\s*(?:의약품|제품)/;

export function detectPharmaceuticalCategory(
  input: PackContentInput,
): PackCategoryDetection {
  if (input.categoryHint === 'PHARMACEUTICAL') {
    return {
      category: 'PHARMACEUTICAL',
      confidence: 1,
      disposition: 'MATCH',
      reasons: ['사용자가 제품 유형을 의약품으로 지정했습니다.'],
    };
  }
  if (STRONG_PATTERN.test(searchable(input))) {
    return {
      category: 'PHARMACEUTICAL',
      confidence: 0.995,
      disposition: 'MATCH',
      reasons: ['의약품의 명시적 제품 정체성 신호를 확인했습니다.'],
    };
  }
  return {
    category: 'PHARMACEUTICAL',
    confidence: 0,
    disposition: 'NO_MATCH',
    reasons: ['의약품 정체성 신호를 확인하지 못했습니다.'],
  };
}

function searchable(input: PackContentInput) {
  return `${input.text} ${(input.webContent?.structuredData ?? [])
    .map((entry) => JSON.stringify(entry))
    .join(' ')}`;
}
