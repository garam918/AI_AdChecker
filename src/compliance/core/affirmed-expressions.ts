// A deliberately narrow language guard, not an entailment model. Only a denial
// grammatically attached to this expression is excluded. A later disclaimer
// must not erase a positive claim elsewhere in the sentence or document.
const DIRECT_DENIAL =
  /^[\s“”"'‘’]*(?:(?:이|가|은|는|을|를)\s*)?(?:(?:라고|이라는|란)\s*)?(?:(?:표현|주장|효능|효과|기능성|사진)(?:을|를|이|가|은|는)?\s*)?(?:(?:사용|주장|표방|의미|보장|약속|제공|추천|대체|광고)(?:을|를)?\s*)?(?:하지\s*(?:않|말|마)|하지는\s*않|아닙니다|아니(?:며|고|지만|라(?!고)|다|에요)|없(?:습니다|어요|다|지만))/;
const LIST_JOIN = /^\s*(?:또는|및|와|과|이나|나|,)\s*$/;

export function affirmedExpressionMatches(
  input: string,
  pattern: RegExp,
  additionalDenial?: RegExp,
) {
  const flags = pattern.flags.includes('g')
    ? pattern.flags
    : `${pattern.flags}g`;
  const matches = [...input.matchAll(new RegExp(pattern.source, flags))];
  return matches.filter((match, index) => {
    let end = match.index + match[0].length;
    // Coordinated claims share a predicate: "업계 1위 또는 국내 최고라고 주장하지 않습니다".
    for (const next of matches.slice(index + 1)) {
      if (!LIST_JOIN.test(input.slice(end, next.index))) break;
      end = next.index + next[0].length;
    }
    const tail = input
      .slice(end)
      .split(/[.!?\n;]/, 1)[0]
      .slice(0, 140);
    if (
      /^(?:이|가|은|는)?\s*(?:아니지\s*않|하지\s*않는\s*(?:것|다고).*아니)/.test(
        tail.trim(),
      )
    )
      return true;
    return !DIRECT_DENIAL.test(tail) && !additionalDenial?.test(tail);
  });
}
