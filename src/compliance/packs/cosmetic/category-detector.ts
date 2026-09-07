import type {
  PackCategoryDetection,
  PackContentInput,
} from '@/src/compliance/core/compliance-pack';

const STRONG_PATTERN =
  /기능성\s*화장품|화장품|기능성\s*(?:심사|보고)번호|미백\s*(?:크림|화장품)|주름\s*개선\s*(?:크림|화장품)|자외선\s*차단제|선크림|(?:피부|페이스)\s*(?:세럼|앰플|토너|로션|에센스)/;

export function detectCosmeticCategory(
  input: PackContentInput,
): PackCategoryDetection {
  if (input.categoryHint === 'COSMETIC') {
    return {
      category: 'COSMETIC',
      confidence: 1,
      disposition: 'MATCH',
      reasons: ['사용자가 제품 유형을 화장품으로 지정했습니다.'],
    };
  }
  if (STRONG_PATTERN.test(searchable(input))) {
    return {
      category: 'COSMETIC',
      confidence: 0.995,
      disposition: 'MATCH',
      reasons: ['화장품의 명시적 제품 정체성 신호를 확인했습니다.'],
    };
  }
  return {
    category: 'COSMETIC',
    confidence: 0,
    disposition: 'NO_MATCH',
    reasons: ['화장품 정체성 신호를 확인하지 못했습니다.'],
  };
}

function searchable(input: PackContentInput) {
  return `${input.text} ${(input.webContent?.structuredData ?? [])
    .map((entry) => JSON.stringify(entry))
    .join(' ')}`;
}
