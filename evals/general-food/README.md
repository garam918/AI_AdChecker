# General Food evaluation set

일반식품 광고 사전검수의 결정론적 분류·후보 추출 동작을 고정하는 30개 사례입니다.

- `HIGH_CANDIDATE` 10개: 규정 검색과 맥락 분석으로 전달해야 할 명확한 후보
- `CONTEXT_DEPENDENT` 10개: 주의사항·영양정보·부정문·제품 분류 불확실성 등 문맥 구분 사례
- `SAFE_CONTEXT` 10개: 맛·원재료·섭취 방법·영양정보 중심의 표현

`expectedRiskFamily`는 법적 결론이나 모델 정확도를 뜻하지 않습니다. 현재 MVP 파이프라인에서 기대하는 사전검수 후보군을 의미하며, 실제 Issue는 공식 규정 검색과 출처 검증을 통과해야 표시됩니다.
