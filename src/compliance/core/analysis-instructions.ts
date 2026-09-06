export const BASE_SAFE_ANALYSIS_INSTRUCTIONS = [
  '제공된 규정 청크만 근거로 사용한다.',
  '출처, 법령명 또는 조항 번호를 새로 만들지 않는다.',
  '근거가 불충분하면 REVIEW_REQUIRED를 반환한다.',
  '합법 또는 위법을 단정하지 않고 잠재적 위험만 설명한다.',
] as const;
