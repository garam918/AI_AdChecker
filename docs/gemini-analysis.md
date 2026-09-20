# AI 분석 연결: Vertex AI → OpenAI → 규칙 기반

텍스트, 공개 URL·상품 상세페이지, 업로드 이미지의 분석은 **Vertex AI의 Gemini**(`gemini-3.8-flash`, `VERTEX_MODEL`로 변경 가능)를 기본 제공자로 사용합니다. Gemini Developer API(`generativelanguage.googleapis.com`, `GEMINI_API_KEY`)는 더 이상 사용하지 않습니다. YouTube·영상은 제외하며, 기존 규정 Pack의 범위를 유지합니다.

## 제공자 체인

```
요청 → Vertex AI Gemini ──성공──▶ 결과 (analysisModel: vertex/<model>, metrics.mode: live)
          │ 실패(인증·할당량·과부하·시간 초과·형식 오류)
          ▼
        OpenAI Responses API (OPENAI_API_KEY 있을 때) ──성공──▶ 결과 (analysisModel: openai/<model>)
          │ 실패
          ▼
        규칙 기반 탐지 + 공식 규정 검색 ──▶ 결과 (analysisModel: rules-only, metrics.mode: offline,
                                              notice AI_UNAVAILABLE_RULES_ONLY)
```

- 안전성 차단(`AI_INCOMPLETE`)은 다른 AI 제공자로 재시도하지 않습니다.
- 별도 제공자 인증이 없으면 일시적 429/503 응답만 1.5~2초의 무작위 대기 후 최대 1회 재시도합니다. `Retry-After`가 더 길면 이를 존중하되 5초 대기 또는 전체 남은 예산을 초과하면 재시도하지 않습니다. 일일 한도·인증·시간 초과·응답 검증·안전 차단은 이 경로로 재시도하지 않습니다. 각 시도는 별도 기록합니다. [Google의 429 처리 지침](https://cloud.google.com/vertex-ai/generative-ai/docs/error-code-429)
- 이미지의 OCR·시각 관찰 단계는 AI 없이는 대체할 수 없습니다. 추출이 실패하면 오류를 반환하고, 추출 후 규정 해석 단계가 실패하면 추출된 문구에 대해 규칙 기반 결과를 제공합니다.
- 규칙 기반 최종 결과는 결정론적 패턴 탐지와 검증된 조항 인용으로 구성됩니다. 앞선 OCR·주장 추출은 성공하고 최종 AI 해석만 실패할 수 있으므로 호출 기록에서 부분 성공을 구분합니다. UI는 최종 규칙 대체와 문맥 해석의 한계를 표시하며, 부분 성공을 "AI 미사용"으로 뭉뚱그리지 않습니다.
- 모든 시도는 `metrics.attempts`(제공자·모델·소요 시간·결과 코드)에 기록되고 `metrics.elapsedMs`에 전체 소요 시간이 남습니다. 요청마다 새 클라이언트를 만들어 동시 사용자의 기록이 섞이지 않습니다.
- `AI_FALLBACK_PROVIDER=none`은 OpenAI 대체를, `AI_RULES_FALLBACK=off`는 규칙 기반 대체를 끕니다. 대표 데모(`업무 시간을 70% 줄여주는 국내 최고의 AI 서비스`)는 기본 설정에서 어떤 AI 제공자가 실패해도 규칙 기반 경로로 완료됩니다 ([production-analysis.test.ts](../src/server/production-analysis.test.ts)).

## Vertex AI 설정

### Express 모드 (가장 간단)

Vertex AI Studio에서 API 키를 발급하고 `.env`에 `VERTEX_API_KEY`를 넣습니다. 엔드포인트는 `https://aiplatform.googleapis.com/v1/publishers/google/models/<model>:generateContent`, 인증은 `x-goog-api-key` 헤더입니다.

### 프로젝트 모드

1. GCP 프로젝트에서 Vertex AI API(`aiplatform.googleapis.com`)를 활성화합니다. [scripts/configure-vertex.mjs](../scripts/configure-vertex.mjs)가 `--inspect`, `--create-project`, `--enable-vertex`를 제공합니다 (개발자의 Google ADC 자격증명을 명시적으로 지정해야 하며, 토큰과 오류 본문을 출력하지 않습니다).
2. 서비스 계정을 만들고 `roles/aiplatform.user`를 부여한 뒤 JSON 키를 발급합니다.
3. `.env`에 `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`(기본 `global`), `VERTEX_SERVICE_ACCOUNT_JSON`(JSON 한 줄)을 설정합니다. 서버는 WebCrypto로 JWT를 서명해 `oauth2.googleapis.com/token`에서 액세스 토큰을 받습니다. 파일시스템이나 gcloud CLI는 사용하지 않아 Cloudflare Workers에서도 동작합니다.
4. 이미 발급된 단기 토큰이 있으면 `VERTEX_ACCESS_TOKEN`으로 서비스 계정을 대신할 수 있습니다 (만료 관리는 운영자 책임).

배포 환경에는 같은 이름의 서버 Secret을 별도로 등록합니다. 키를 채팅, 클라이언트 환경변수 또는 저장소에 넣지 않습니다. 개발 서버 실행 중 키를 바꿨다면 재시작하세요.

### 전용 서버 계정 자동 설정

개발자 ADC 경로를 `GOOGLE_ADC_PATH`로 지정한 상태에서 다음 순서로 실행합니다. 프로젝트 생성과 결제 연결은 별도 승인 후 진행하며, 아래 명령은 기존 프로젝트를 사용합니다.

```sh
node scripts/configure-vertex.mjs --enable-vertex --project=<id>
node scripts/configure-vertex.mjs --enable-auth-api --project=<id>
node scripts/configure-vertex.mjs --configure-server --project=<id>
node scripts/configure-vertex.mjs --server-status --project=<id>
```

`--configure-server`는 `contentlint-server` 계정에 `roles/aiplatform.user`만 부여하고 기존 IAM 정책을 보존합니다. 기존 키가 있으면 재사용하며, 새 JSON 키는 Git에서 제외된 `secrets/`에 소유자만 읽을 수 있게 저장합니다. `.env`에도 같은 권한으로 설정하지만 배포 서버 Secret 등록은 별도로 필요합니다. 다른 프로젝트·계정의 설정은 덮어쓰지 않습니다. 신규 API·IAM 설정은 반영까지 시간이 걸릴 수 있으므로 실제 호출로 확인해야 합니다.

장기 서비스 계정 키를 사용하므로 정기적으로 교체하고, 폐기할 때는 IAM에서 해당 키를 비활성화·삭제합니다. 키 없이 인증 가능한 GCP 호스팅으로 옮길 경우 연결된 서비스 계정/워크로드 아이덴티티 방식으로 전환하는 것을 권장합니다.

## 분석 과정

1. URL은 SSRF 방어가 적용된 정적 HTML 추출기를 사용합니다. 원격 이미지를 내려받거나 JavaScript를 실행하지 않습니다.
2. 이미지는 Gemini가 보이는 문구와 시각 관찰을 구분해 추출합니다. 시각 관찰에는 `[시각 관찰]` 표시를 붙이며, 읽기 불완전한 이미지는 부분 분석으로 표시합니다.
3. Gemini가 콘텐츠를 분류하고 주장을 추출합니다. 원문에 없는 인용이나 지원되지 않는 주장 유형은 거부합니다.
4. 규칙 탐지 주장과 AI 주장을 **병합**합니다 ([merge-claims.ts](../src/compliance/core/merge-claims.ts)): 같은 Pack·유형·문맥 역할·페이지 섹션에서 80% 이상 겹치는 구간은 긴 인용 하나로 합칩니다.
5. BM25 검색으로 Pack·시행일을 필터링하고 주장별 최대 5개 조항을 검색합니다.
6. Gemini가 전체 문맥, 규칙 탐지 신호, 조회된 공식 품목정보, 검색된 조항을 대조하고 위험 설명·수정안·필요 증빙을 생성합니다.
7. 주장별 출처 ID와 인용 원문을 검증한 뒤 인용 검증기가 Pack·시행일·저장된 조항을 확인합니다. 검증되지 않은 근거는 `REVIEW_REQUIRED`로 낮춥니다.
8. 이슈를 **핵심 이슈로 정리**합니다 ([key-issues.ts](../src/compliance/core/key-issues.ts)): 같은 Pack·유형에서 한 인용이 다른 인용을 포함하면 하나로 합치고(검증 인용·높은 심각도 우선, 출처·증빙·수정안 합집합), 심각도 → 검증 인용 → 원문 위치로 정렬한 뒤 서로 다른 유형을 우선해 최대 3개를 `keyIssueIds`로 표시합니다. UI는 핵심 이슈를 먼저 보여주고 나머지는 접습니다.

## 입력·비용 제한

- 텍스트: 최대 20,000자, JSON 요청 본문 최대 64,000바이트.
- URL: 추출 제한 40,000자. 추출 생략은 결과에 표시합니다.
- 이미지: 정지 이미지 1장, 최대 5MB, PNG/JPEG/WebP. MIME과 파일 시그니처를 함께 확인하며 영상·움직이는 PNG/WebP는 제외합니다.
- AI 추가 주장 최대 24개, Pack별 병합 주장 최대 40개.
- 분류·이미지 추출·규정 해석의 기본값은 `low` thinking입니다. 규정 해석만 `AI_ANALYSIS_THINKING=medium`으로 높일 수 있습니다. `gemini-2.5-*` 모델은 `thinkingBudget`(0 / 2048)으로 자동 변환합니다. 주장 8개씩 묶어 생성하며 호출별 출력 상한 12,000토큰, 응답 상한 1MB입니다. 전체 문맥은 한 번만 전송하고, 주장별 검색 조항은 원문을 자르지 않은 채 중복 메타데이터만 제외합니다.
- 요청별 AI 클라이언트의 공유 예산은 65초, Vertex 호출별 상한은 35초, OpenAI 대체 호출별 상한은 25초입니다. 매 호출은 남은 예산까지만 대기하며, 분류·이미지 추출·여러 주장 묶음과 재시도가 같은 예산을 공유합니다. 콘텐츠 추출·검색·전송까지 포함한 HTTP 전체의 65초 완료 보장은 아닙니다. 별도 제공자 인증이 있으면 기존 대체 경로를 우선합니다.
- HTTP 분석 진입점은 단일 서버 인스턴스에서 동시 3건·직전 1분 15건으로 제한하고, 다른 Origin의 브라우저 요청을 거부합니다. IP나 광고 원문을 제한용 기록에 보관하지 않습니다. **분산 인스턴스 전체의 일일 비용 제한이나 인증이 아닙니다.** Origin 없는 API 클라이언트는 허용되므로 공개 서비스의 악용 방지를 완료했다고 볼 수 없으며, 전역 사용량 제한·계정별 할당량·결제 알림이 추가로 필요합니다. 평가 스크립트는 HTTP 진입점을 거치지 않습니다.
- JSON·스트리밍 결과와 오류는 `no-store`로 반환합니다. 저장 기록을 복원할 때에도 AI 미완료를 LOW로 안심시키지 않으며, 이미 찾은 HIGH/MEDIUM 이슈와 분석 완성도는 따로 표시합니다.
- Gemini에 보내는 JSON Schema에서는 `$schema`, `minLength`, `maxLength`, `minItems`, `maxItems`를 제외하고 서버의 Zod 스키마로 계속 검증합니다. Vertex 구조화 출력은 `generationConfig.responseMimeType: "application/json"` + `responseJsonSchema`를 사용합니다.
- OpenAI 대체도 `text.format`의 `strict: true` 구조화 출력과 서버 Zod 검증을 함께 사용합니다. 거부 응답은 별도 실패로 보존하고 다른 제공자로 안전성 거부를 우회하지 않습니다. 키의 존재를 나타내는 `metrics.fallbackConfigured`는 인증·잔액·실제 호출 성공을 보증하지 않습니다. [OpenAI 구조화 출력 공식 문서](https://developers.openai.com/api/docs/guides/structured-outputs)
- 문구 제안은 사실 확인이 아닙니다. 수치·수상·검증·빈칸 템플릿과 수정 지침은 직접 검토 항목으로 나누고 자동 적용하지 않습니다. 일괄 수정은 인용 검증된 검토 대상 주장의 삭제만 수행하며, 현재 초안과 일치하지 않거나 위치가 모호하면 건너뜁니다. 삭제가 광고의 품질이나 적법성을 보장하지는 않습니다.

## 검증

`npm test`는 외부 API를 호출하지 않습니다. Vertex 엔드포인트·헤더·스키마, 제공자 대체 순서, 규칙 기반 대체, 이미지 경로의 부분 대체, 핵심 이슈 정리를 모의 응답으로 검사합니다.

실제 제공자 점검(API 비용 발생):

```sh
npm run ai:eval -- --live --text-repeats=5 # 대표 텍스트 각각 5회 + URL 1·이미지 1
npm run ai:eval -- --live --case=image-ad # 이미지 1건만; 실패해도 시간·시도 기록 보존
npm run eval:e2e -- --dataset=challenge --live # 새 내부 문맥 사례 40개
npm run eval:e2e -- --dataset=validation --live # 추가 합성 검증셋 40개
```

결과는 Git에서 제외된 `outputs/evaluations/`에 실행별 고유 이름으로 저장되며, 중단된 실행도 완료한 관측값을 보존합니다. 결과 반환율(규칙 대체 포함)과 최종 AI 완료율을 따로 확인하세요. 소수 데모의 반복 성공을 향후 100% 성공 보장으로 표현하지 않습니다. 평가 지표의 정의와 가치 검증 방법은 [value-metrics.md](./value-metrics.md)를 참고하세요.
