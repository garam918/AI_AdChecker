# End-to-end evaluation set

40개 사례로 전체 파이프라인(분류 → 주장 추출 → 규정 검색 → 인용 검증 → 핵심 이슈 정리)의 탐지 성공률·출처 연결률·오탐률·지연 시간을 측정합니다.

- `group: FLAG` — `expectedIssueTypes`가 모두 이슈로 나타나야 하며, 해당 이슈는 검증된 조항 인용을 가져야 합니다.
- `group: SAFE` — 어떤 이슈도 나오면 오탐으로 집계합니다.
- `contextDependent: true` — 부정문·주의사항·체험기 등 문맥 판단 사례. 별도 집계합니다.
- 규제 제품군 사례는 UI와 동일하게 `categoryHint`와 `productIdentity`를 함께 넘깁니다.

실행: `npm run eval:e2e` (오프라인) 또는 `npm run eval:e2e -- --live` (Vertex → OpenAI → 규칙). 지표 정의와 결과 해석은 [docs/value-metrics.md](../../docs/value-metrics.md)를 참고하세요. 이 파일은 모델 정확도 벤치마크가 아니라 현재 규칙·코퍼스에 대한 회귀 기준입니다.
