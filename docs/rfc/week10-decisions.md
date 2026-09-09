# 10주차 결정 로그 (계획 그릴링 ADR)

> 구현 전 계획 그릴링(2026-09-09)에서 합의한 결정 기록. 측정·실험 결과와 그에 따른 최종 판단은 week10-ci.md에 기록한다.

## ADR-1. workflow 정리: quality.yml 기준 통합, ci.yml 삭제

- **상태**: 합의 (2026-09-09)
- **맥락**: 4주차에 본인이 만든 ci.yml(lint·unit·E2E, node 22 하드코딩)과 5주차 스타터 quality.yml(`pnpm check` 전체, SHA 핀, permissions, .nvmrc)이 모든 PR에서 동시 실행 — ci.yml 검증은 quality.yml의 완전 부분집합, PR마다 E2E·lint·unit 2중 실행 중.
- **결정**: quality.yml을 기준으로 보강하고 ci.yml은 삭제. "새로 만들지 않고 보강" 원칙 준수.
- **근거**: (1) 하드닝(SHA 핀·permissions)·.nvmrc 정합이 이미 quality.yml에 있음 (2) ci.yml의 node 22는 .nvmrc 24와 불일치 — 발제의 "로컬·CI·배포가 같은 기준" 위반 (3) "측정으로 5주간의 중복 실행을 발견하고 통합"이 1단계 서사가 됨.
- **주의**: ci.yml 삭제는 wall-clock 개선이 아니라 러너 사용량·소음 절감임 (두 workflow는 병렬 실행이므로). 개선 수치로 주장할 때 축을 구분할 것.

## ADR-2. Before 기준선: 현재 상태에서 측정, 비교 축은 quality.yml wall-clock

- **상태**: 합의 (2026-09-09)
- **결정**: Before 측정은 ci.yml 삭제 전 현재 상태에서 수행. wall-clock Before/After 비교 축은 quality.yml(→통합 workflow)로 고정. ci.yml 삭제 효과는 러너 사용 분(×2→×1) 절감으로 **별도 표에 분리 표기**하고 wall-clock 성과로 섞지 않음.
- **근거**: 0단계 취지(손대기 전 상태 고정)를 지키면서 "측정이 중복 실행을 발견했다"를 산출물에 포함. 두 workflow는 병렬이라 삭제가 wall-clock에 거의 무영향 — 섞으면 측정 정직성 훼손.

## ADR-3. 실험 무대: fork = 실험실, upstream 제출 PR = 최종 무대 (하이브리드)

- **상태**: 합의 (2026-09-09)
- **맥락**: fork(heeji289/...)는 Actions 실행 이력 0건 (지금까지 CI는 upstream PR에서만 실행). upstream에서는 캐시 삭제(cold 재현)·re-run·branch protection·label 부착이 전부 권한 부족으로 불가. fork는 User 소유라 **merge queue(merge_group) 사용 불가** — 2단계 최종 방어선 설계에서 제외.
- **결정 (2026-09-09 개정)**: 권한이 필요한 실험(측정 cold/warm, 캐시 hit/miss, branch protection, 조건부 실행 PR 2개, 빨간불 PR)은 fork에서. **최초 1회 `feat/round-10` → fork `main` 통합 PR로 main을 작업 최신 상태로 만든 뒤, 실험 브랜치 → `main` base로 PR 생성**(통합 후엔 diff가 실험 변경만 담겨 path filter 검증 유효). branch protection도 fork `main`에. 작업은 feat/round-10에서 계속, 구간마다 main으로 PR(= "main 머지 PR"에서만 블로커 동작). 제출 흐름(upstream/heeji289 base PR)은 기존대로. fork main의 upstream 미러 역할 상실은 수용 — 새 주차 수급은 늘 로컬 `git fetch upstream`이라 실사용 없음.
- **준비 작업**: fork Actions 활성화 (Actions 탭 enable) 선행.

## ADR-4. 측정 프로토콜: cold = 캐시 전삭제 후 re-run, 기록은 docs/rfc/week10-ci.md

- **상태**: 합의 (2026-09-09)
- **결정**: 동일 커밋에서 cold = `gh cache delete --all` → "Re-run all jobs" × 3, warm = 캐시 보존 re-run × 3. 수치는 `gh run view <id> --json`으로 run wall-clock + step별 시간 수집(raw 3개·중앙값·범위). 기록은 `docs/rfc/week10-ci.md`에 본문, PR 본문엔 요약+링크.
- **근거**: 캐시 삭제는 서버 저장물만 비워 코드·커밋·workflow 무변경 — "같은 커밋에서 측정" 원칙 유지. lockfile 변조는 2단계 miss 재현 실험 전용으로 분리해 실험 구분 유지. docs/rfc 축적은 7~9주차 문서 패턴과 일관, 6단계 회고 인용 용이.

## ADR-5. 최적화 전략은 측정 후 결정, concurrency는 낭비 방지 축으로 도입

- **상태**: 합의 (2026-09-09)
- **결정**: (1) job 분리 등 wall-clock 전략은 Before 측정이 병목을 지목한 뒤 선택 — "측정이 전략을 고른다"를 결정 규칙으로 문서화, 예상 시나리오(직렬 pnpm check에서 E2E·build 최장 예상)만 사전 기록. (2) concurrency는 병목 전략이 아닌 낭비 방지로 분리 기록하고 도입 — `group`에 `github.ref` 포함, `cancel-in-progress`는 PR에서만(main push 취소 금지). 도입 근거는 upstream 본인 PR run 이력에서 연속 push로 겹쳐 돈 run 수를 실측해 인용.

## ADR-6. 조건부 실행: 검증 3층 구조 (2단계 설계)

- **상태**: 합의 (2026-09-09)
- **결정**:
  - **층 1 (모든 PR, 무조건)**: lint · typecheck · unit test. integration은 기본 전체 실행하되 related-only 실험(ADR-7) 결과에 따라 조건부 채택 여부 재결정.
  - **층 2 (코드·설정·lockfile 변경 PR)**: core E2E만 — 로그인·주문 스펙에 `@critical` 태그 + `--grep @critical`. **문서만 바뀐 PR은 E2E 전체 스킵** + guard job이 성공 보고(required 충돌 방지).
  - **층 3 (최종 방어, 2026-09-09 재개정)**: fork `main` **push(=머지) 시 전체 E2E 5종** — 머지 직후 사후 검출. 기존 quality.yml의 `push: branches: [main]` 트리거와 그대로 정합. 온디맨드 단독안은 폐기.
  - **층 4 (정기)**: **주 1회 schedule로 전체 E2E + Lighthouse**. `workflow_dispatch` 병행 트리거 유지. main이 default 브랜치이자 작업 최신 상태가 되면서 "schedule은 default 브랜치만" 제약이 자동 해소 — 별도 우회 불필요.
- **근거**: core만 게이트하는 이유는 시간 절약(스펙당 몇 초)이 아니라 **신호 품질** — PR 게이트의 flaky 표면 축소 + 실패 비용 큰 흐름(로그인·주문)만 게이트. 문서만 PR 스킵의 안전 논리: 코드가 안 바뀌면 E2E가 검증할 런타임 변경이 없음. Lighthouse를 게이트 밖에 두는 근거: 측정 변동성(과제 권장과 일치).
- **주의**: E2E 비용 대부분은 고정비(브라우저 설치 31초 + build)라 스펙 수 절감을 시간 성과로 서술하지 않기.

## ADR-7. 통합 테스트 related-only 실험 (측정 후 판정)

- **상태**: 합의 (2026-09-09) — 실험 예정
- **실험**: 같은 커밋에서 전체 vitest 실행 vs `pnpm vitest related --run <변경 파일들>` 을 CI에서 각 3회, 중앙값 비교. 로컬 참고치: 전체 46파일 402개 = 7.4초(M칩, CI 러너에선 더 길 수 있음).
- **판정 기준 (측정 전 고정)**: 절약분이 측정 흔들림(범위)과 장치 오버헤드(변경 파일 감지 step)를 빼고도 유의미하게 남으면 채택, 아니면 전체 실행 유지 + 실험 기록만 남김.
- **채택 시 안전 논리 필수**: 모듈 그래프 밖 의존(MSW 핸들러·설정·테스트 셋업 변경) 시 전체 실행 폴백.
- **과제 정합**: "무조건" 요구는 lint/type/unit까지, integration은 조건부 허용 대상.

## ADR-8. flaky 정책: CI 한정 재시도 + 격리 상한 + trace 수집

- **상태**: 합의 (2026-09-09)
- **결정**: (1) `retries: process.env.CI ? 2 : 0` — 로컬 0(흔들림 즉시 노출), CI 2회. Playwright가 재시도 후 성공을 "flaky"로 별도 표기 → 재시도 자체가 흔들림/진짜 실패의 구분 장치. (2) flaky 발생이 로그 안 열고 보이게 리포트 노출. (3) 같은 스펙 2회 이상 flaky 기록 시 `test.fixme` 격리 + 이슈 기록 — 만성 흔들림 은폐 방지 상한. (4) CI 한정 `trace: retain-on-failure` — flaky 원인 사후 분석용 증거 수집.
- **검토 후 제외 (판단 흔적)**: 타임아웃 연장(진짜 실패 판명 지연), quarantine 별도 트랙(스펙 5개 규모에 과함), 개별 재시도(어떤 스펙이 흔들릴지 겪은 후 좁히는 게 순서), 재시도 0+수동 재실행(구분이 기록에 안 남음). 자동 대기 준수는 flaky 발생 시 1차 수리 방법으로 정책에 한 줄 명시.

## ADR-9. Vercel 배포: fork 연결, Production 브랜치 = feat/round-10

- **상태**: 합의 (2026-09-09)
- **결정 (2026-09-09 개정)**: Vercel(heeji289@gmail.com 계정)을 fork에 연결. **Production 브랜치 = `main` 기본값 그대로** — 최초 통합 PR(feat/round-10→main) 이후 main이 작업 최신 상태이므로 브랜치 지정 우회 불필요. 실험 브랜치·fork 내부 PR은 Preview 자동 배포.
- **효과**: 층 3 "배포 전" 시점 실물화, 회고 6절 배포·운영 근거, APP_ORIGIN 환경별 분리 실물, preview smoke test·릴리즈 추적성 차별화 요소 해금, 질문 3 답변의 실물 증거.
- **일관성**: 보호(branch protection)·배포(Production)·실험 PR base·정기 schedule·main push 전체 E2E가 모두 fork `main`으로 통일 — "어떤 코드가 어떤 검증을 통과해 어떤 환경에 나갔는가" 서사가 실무 표준 모델 그대로 이어짐.

## ADR-10. 예산 게이트 구성: size-limit + zod env 스크립트 + Lighthouse 임계값은 7주차 LCP 근거

- **상태**: 합의 (2026-09-09)
- **결정**:
  - **size-limit 채택** (새 devDependency, 사용자 승인). 대상 확정: **홈·상품목록·상품상세 First Load JS + 공유 청크(shared by all) + hero 이미지 소스 파일** — 공유 청크는 전역 회귀(공통 모듈에 무거운 import) 검출용으로 빨간불 실험과 짝. 페이지 전수·총량 예산은 소음이라 제외. 임계값은 이번 주 실측 후 `현재값 + 측정 범위 + 여유폭 N%` 공식으로 본인이 결정 — 7주차 인용의 실체는 "전송 크기가 LCP를 지배한다는 발견의 회귀 방지".
  - **env 검증은 zod 기반 스크립트** (devDependency, 사용자 제안). 검증: APP_ORIGIN URL 형식, 비밀값(AUTH_SESSION_SECRET 등)에 `NEXT_PUBLIC_` 접두 검출, 환경별 필수값. **클라이언트 번들 밖(빌드 전 스크립트)에만 배치** — 앱 코드에 import하면 자기 번들 예산과 충돌. 변수 2개엔 과하다는 정직한 한 줄 + 스키마 선언성 학습 목적 병기.
  - **LCP·FCP·TTFB는 Lighthouse CI가 측정** (층 4 정기 + 수동). assertion 임계값 근거 = **7주차 실측 LCP 값** (docs/week-07-performance rf-after) — "7주차 값 인용" 요구의 본류. 변동성 대응은 numberOfRuns 3 중앙값.
- **주의**: 층 3(main push 전체 E2E)은 게이트가 아니라 사후 검출 — Vercel Production 배포와 병렬로 돌므로 깨진 코드가 잠시 Production에 노출될 수 있음을 안전 논리에 명시(검출 → revert/fix-forward).

## ADR-11. AI 리뷰: 두 모드 구도, CI 통합(advisory, PR 코멘트)

- **상태**: 합의 (2026-09-09)
- **트리거 (확정)**: (c) 코드 변경 PR만 자동 — 층 2의 paths 필터(코드·설정·lockfile) 재사용, 문서만 PR은 E2E와 함께 AI 리뷰도 스킵. 스킵 논리 일관("문서 PR엔 컨벤션 리뷰 대상 없음") + 장치 추가 비용 0. 프롬프트 개선 전/후 비교는 같은 diff에 job re-run으로 수행.
- **결정**:
  - **모드 1 (기존 유지)**: 무유도 Codex 리뷰 — 선입견 없는 버그 사냥, 구현 단계마다 로컬.
  - **모드 2 (신설)**: 컨벤션 명문화 프롬프트 리뷰를 **CI(GitHub Actions)에 통합**. 기준 = CONVENTIONS.md + 6주차 FSD 경계 + 5주차 URL·서버상태 규칙 + 1주차 any/as 금지. "잘 잡은 1/헛소리 1" 수집과 프롬프트 개선은 모드 2에서.
  - **배치 = advisory**: required 미지정, 결과는 PR 코멘트로만. 근거: 비결정적 검증을 게이트로 두면 거짓 빨간불이 머지를 막음(flaky 논리와 동일 계열, 과제 기본 권장과 일치).
- **안전장치 (workflow에 실물로)**: 해당 job에만 `pull-requests: write`, `max_turns`·`timeout-minutes` 제한, concurrency 중복 취소, `pull_request_target` 미사용(fork 내부 same-repo PR이라 `pull_request`로 secrets 접근 가능), 리뷰 실패가 체크를 더럽히지 않게 continue-on-error 검토.
- **인증**: 결제 강제 없는 경로 — Claude 구독의 `claude setup-token` OAuth 토큰(또는 보유한 키)을 fork secrets에. 로그에 노출 금지.
- **상세 설계 (2026-09-09 합의)**:
  - **프롬프트**: 번호 붙은 규칙 목록(C1 any/as/disable 침묵 금지 · C2 파생값 useEffect 동기화 금지 · C3 컴포넌트 API 직접 호출 금지 · C4 서버 응답 store 복사 금지 · C5 URL 상태 nuqs · C6 FSD 경계·Public API · C7 queryOptions 계약 · C8 핸들러 on*/handle* · C9 selector 구독) — component-review·architecture-review SKILL + CONVENTIONS에서 조립. 출력 형식 강제: `[규칙번호] 파일:줄 — 근거 — 확신도`, 목록 외 지적은 "기준 외 관찰"로 분리, 확신 낮으면 질문으로.
  - **판별**: 잘 잡은/헛소리 구분은 **본인이 직접 판정** (기준표 기계화 안 함 — 판별력이 과제의 핵심). 출력 형식은 판정 보조 재료.
  - **개선 루프**: 같은 diff에 v1 → 판정 기록 → 프롬프트 수정 → v2 재실행 → 오탐 수 전/후 표.
  - **리뷰 대상**: 이번 주 실제 구간 PR (통합 PR 제외, 부족 시 round-9 diff 재활용).
  - **CI 세부**: max_turns 소수(≈5)·timeout-minutes 10·concurrency 취소 (구현 시 조정 가능).
  - **4→5 연결**: 규칙별 지적 빈도 집계 → 최다 반복 ∩ 결정적 판별 가능 ∩ 후보 풀 → 1개 승격 → 프롬프트에서 해당 규칙 제거.

## ADR-12. required 선정: 5개 전부 (core E2E 포함), 제외 3종 근거 확정

- **상태**: 합의 (2026-09-09)
- **결정 (2026-09-09 개정)**: fork **`main`** branch protection의 required = **lint·type·unit / production build / size-limit / env 검증 / core E2E(guard 구조 전제)**. "main 머지 PR만 블로커, 평소 PR(작업 브랜치 간)은 무관"은 branch protection이 base 브랜치별 설정이라 구조적으로 자동 충족.
- **required 제외 + 근거**: AI 리뷰(비결정적 — 거짓 빨간불이 머지를 막음), 전체 E2E(main push 사후 검출이라 PR 체크가 아님), Lighthouse(측정 변동성 + 주 1회 배치).
- **core E2E를 넣은 근거**: 실패 비용 큰 흐름(로그인·주문)만 게이트 + retry 2회·guard job으로 flaky 잠금 리스크 완화 — 층 2 설계 논리와 일관.

## 5단계 승격 후보 풀 (1~10주차 과제 문서 스캔 반영, 최종 선택은 모드 2 AI 리뷰 결과와 대조 후)

- **① HTTP 호출 위치 강제** — api-client 밖 `fetch`/`axios` + `'/api/...'` 리터럴 금지. 출처 삼중(week-03 API 분리, 05 팩토리, 09 401 단일화). 현재 위반 0 → 정상 통과 보장. **유력**
- **② as 단언 제한** — week-01 "새 as 금지" + 최근 커밋의 반복 제거 이력. selector: `TSAsExpression`(as const 제외). 잔존 ~10곳 전수 검토로 룰 좁히기 필요(오탐 검증 과제와 부합)
- **④ Query 옵션 계약** — useQuery 인라인 객체 금지 + `queryOptions`에 staleTime 누락 금지 (week-05·07 이중 출처)
- **⑤ Zustand 무인자 전체 구독 금지** — `useXxxStore()` 인자 없이 호출 시 위반 (week-05 selector 규율)
- 이미 승격 완료(중복 제외): FSD 경계+Public API(6주차), 테스트 단언 품질 toBeTruthy 류(8주차)
- 부산물 흡수: **'use client' 파일에서 비-NEXT_PUBLIC process.env 접근 금지** → 3단계 validate-env/lint 게이트에 추가 검토. workflow 메타 검사(concurrency ref·permissions·SHA 핀)는 actionlint 계열 도구 아이디어로 회고에 언급 가능
- 탈락(비결정) 확정: 서버 응답 store 복사(맥락), 성급한 추상화(맥락), staleTime 값의 근거(판단)

## ADR-13. 심화·선택 범위: 둘 다 수행 + AI 관행 유지

- **상태**: 합의 (2026-09-09)
- **결정**: (1) rollback 심화 질문 답변 — 필수 질문 4개와 함께 PR 본문에. (2) **Docker 실습 수행** — multi-stage Dockerfile로 이미지 빌드 → `docker run` → production build smoke 확인 (발제 수준: 클라우드 배포까지는 안 감). (3) 5관점 workflow AI 리뷰 1회 편입(질문 4 답변의 실물 증거). (4) 전 주차 AI 관행 유지 — PR에 AI 생성 부분 표기 + 위임 경계 선언(YAML 초안·selector·스크립트 골격은 AI, required·임계값·승격 선택·안전 논리는 사람).
- **준비 확인 필요**: 로컬 Docker 실행 환경(Docker Desktop 등) 설치 여부 — 구현 시작 시 확인.

## 실행 순서 (계획)

0. **준비**: fork Actions 활성화 → feat/round-10 origin push → **통합 PR(feat/round-10→fork main) 머지** → Vercel 연동(Production=main) → fork secrets(Claude 토큰) → Docker 환경 확인
1. **1단계 측정**: Before cold/warm 각 3회(gh cache delete + re-run) → 병목 지목 → 전략 적용(quality.yml 보강·ci.yml 삭제 포함) → After 재측정 → 캐시 hit/miss 실험(lockfile 원복) → `docs/rfc/week10-ci.md` 기록
2. **2단계 조건부**: paths filter + guard job + `@critical` 태그 + retries/trace + main push 전체 E2E + 주 1회 schedule → 걸리는/안 걸리는 PR 실험 → 통합 테스트 related 실험(ADR-7 판정 기준)
3. **3단계 예산**: size-limit 기준선 실측 → 임계값 결정 → validate-env(zod) → branch protection required 5종 → 빨간불 PR 실험 → step summary 가시성 + 릴리즈 추적성(SHA·run URL·배포 URL)
4. **4단계 AI 리뷰**: 모드 2 프롬프트 조립(component-review·architecture-review SKILL + CONVENTIONS) → CI 통합(안전장치·paths 조건) → 잘 잡은 1/헛소리 1 수집 → 프롬프트 개선 전후 재실행 비교 → 완성 workflow에 5관점 AI 리뷰
5. **5단계 승격**: AI 리뷰 결과와 후보 풀(①②④⑤) 대조 → 1개 선택 → 위반/정상 양방향 검증 → 승격 항목을 AI 프롬프트에서 제거 → 책임 모델 문단
6. **심화**: Docker 이미지 빌드·실행 smoke / rollback 답변
7. **6단계 회고** + 질문 4개 답변 → 마무리 게이트(pnpm check, 실험 잔재 제거, AI 표기) → 제출 PR

## 4단계 프롬프트·회고 7절 재료 (1~9주차 AI 요구사항 스캔, 2026-09-09)

- **모드 2 리뷰 프롬프트는 조립이지 신작이 아님**: 3주차 `component-review` SKILL + 6주차 `architecture-review` SKILL이 이미 리뷰 지침 초안. 여기에 CONVENTIONS.md + 1주차 셀프리뷰 4단(any/as/@ts-ignore/eslint-disable 침묵 금지, 기존 유틸 중복 생성 금지) + 5·7주차(URL 규칙, 서버 응답 복사 금지) + 8·9주차(AI 생성 테스트의 단언·모킹 경계 검토)를 합쳐 조립.
- **"잘 잡은 1/헛소리 1"의 선행 형식 존재**: 6주차 "AI 지적 중 수용/반려를 근거와 함께 기록" — 같은 형식 재사용. 헛소리 후보 최빈 지점은 7주차 경험상 "측정과 무관한 최적화 제안".
- **전 주차 반복 필수 관행 (10주차 PR에도 유지)**: ① AI로 생성한 부분 표기 + 직접 검토 명시 ② 위임 경계 선언 — 반복 코드(셋업·픽스처·YAML 초안)는 AI, 단언·모킹 경계·E2E 범위·required·임계값 판단은 사람.
- **회고 7절 뼈대**: 1주차 책임 모델 표("하네스가 약한 레포에선 AI 에이전트도 약해진다", "git hook은 AI 커밋에도 걸린다") → 10주차 CI/AI/사람 표로 재작성 + 8·9주차 위임 경계 선언을 결론 문장 재료로.
