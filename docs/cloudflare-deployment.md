# Cloudflare Workers 배포

기본 운영 주소는 <https://contentlint-ai.garam918.workers.dev/>입니다. 별도의 Sites 주소와 자동 동기화되지 않습니다. `.openai/hosting.json`은 기존 Sites 연결을 보존하기 위한 설정이며, 아래 명령은 Sites를 변경하지 않습니다.

## 사전 조건

- Node.js와 프로젝트 의존성 설치
- 해당 Worker를 소유한 Cloudflare 계정으로 Wrangler 로그인
- `.env`의 전용 Vertex 프로젝트·서비스 계정 JSON 설정
- 필요한 식약처 API 키와 상세기능 URL 설정

서버 인증키는 Git에서 제외된 `.env`에 보관하고 브라우저 코드나 배포 설정 파일에 직접 넣지 않습니다.

## 배포

```sh
npm run deploy:workers -- --dry-run
npm run deploy:workers
```

두 명령 모두 먼저 최신 코드를 빌드합니다. `--dry-run`은 업로드하지 않습니다. 실제 배포는 계정과 Worker 이름을 고정하고, 기존 버전과 연결된 자원을 확인한 뒤 필요한 비밀 설정만 표준 입력으로 전달합니다. 다른 저장소 연결이나 우선순위가 높은 별도 Vertex 인증이 발견되면 중단합니다.

일반 환경변수는 `--keep-vars`로 기존 항목을 보존하고, 명시된 항목만 갱신합니다. 비밀 설정 역시 목록에 없는 값을 삭제하지 않습니다. 비밀 설정 업로드와 코드 배포는 별도 단계이므로 코드 배포가 실패해도 업로드한 비밀 설정은 남을 수 있습니다.

서비스 계정 JSON, 식품안전나라 키, 공공데이터포털 키, 설정된 경우에만 OpenAI 키를 전달합니다. 기존 Gemini Developer API 키는 새로 업로드하지 않습니다. OpenAI 키가 없으면 다른 AI 제공자로의 전환은 활성화되지 않습니다.

## 확인과 복구

배포 후 위 운영 주소에서 대표 텍스트 분석을 실행하고, HTTP 성공뿐 아니라 `analysisModel: vertex/<model>`, `metrics.mode: live`, 검증된 출처 연결을 확인합니다. `rules-only`는 인증 성공의 증거가 아닙니다.

배포 명령은 이전 버전을 출력합니다. 문제가 발생하면 배포 이력에서 해당 버전을 확인해 되돌릴 수 있습니다. 비밀 설정은 별도 변경일 수 있으므로 함께 확인해야 합니다. 실제 광고의 정확도·시간 초과 개선은 배포 성공과 별도로 검증합니다.

참고: [Cloudflare 환경변수 보존](https://developers.cloudflare.com/workers/wrangler/configuration/), [서버 비밀 설정](https://developers.cloudflare.com/workers/configuration/secrets/).
