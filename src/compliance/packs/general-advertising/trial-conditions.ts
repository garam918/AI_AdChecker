/** Detects explicitly disclosed non-renewing trial conditions, not their truth. */
export function hasExplicitNonRenewingTrial(text: string): boolean {
  // Multiple offers need contextual review; do not borrow another offer's terms.
  if ([...text.matchAll(/무료/g)].length !== 1) return false;
  return (
    /무료\s*체험\s*\d+\s*(?:일|주|개월)/.test(text) &&
    /자동\s*결제(?:는|가)?\s*없(?:으며|습니다|어요)/.test(text) &&
    /직접\s*유료\s*구독(?:을)?\s*(?:선택|신청)(?:할|한)\s*(?:때만|경우에만)/.test(
      text,
    ) &&
    /(?:월|매월|연|매년)\s*\d[\d,]*\s*원/.test(text) &&
    !/(?:자동\s*갱신|자동으로\s*결제|자동\s*결제됩니다)/.test(text)
  );
}
