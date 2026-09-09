# 10주차 — CI 측정·최적화 기록

> 계획 결정: [week10-decisions.md](week10-decisions.md) (ADR-1~13). 측정 프로토콜은 ADR-2·4.
> 이 문서는 측정이 진행되며 채워진다. 개선 수치는 세 축으로 분리해 기록한다:
> **wall-clock 개선** (quality workflow 기준) / **러너 사용량 절감** (중복 workflow 제거) / **낭비 방지** (concurrency).

## 측정 조건

- 비교 축: quality workflow의 run wall-clock (attempt별 시작→종료)
- cold = `gh cache delete --all`로 서버 캐시 전부 삭제 후 같은 커밋 "Re-run all jobs" / warm = 캐시 보존 재실행
- 각 조건 3회 — 러너 시간대별 변동을 범위로 드러내기 위함 (7주차 measure-protocol 방식)
- 측정 무대: fork(heeji289) 실험 PR — upstream은 캐시 삭제·re-run 권한이 없어 fork에서 수행 (근거: ADR-3)

## Before (2026-09-09, run [34329855053](https://github.com/heeji289/loop-pack-fe-l2-vol1/actions/runs/34329855053), 커밋 08344858)

### 실행 시간 — quality workflow run wall-clock

| 조건 | 1회 | 2회 | 3회 | 중앙값 | 범위 |
|---|---|---|---|---|---|
| cold (attempt 2·3·4) | 144s | 128s | 146s | **144s** | 18s (128–146) |
| warm (attempt 5·6·7) | 151s | 132s | 134s | **134s** | 19s (132–151) |

### step별 소요 (Actions job 화면의 step 이름 그대로, attempt 범위)

| step | cold (attempt 2·3·4) | warm (attempt 5·6·7) |
|---|---|---|
| Set up job | 1s | 1s |
| Checkout | 1~2s | 2s |
| Set up pnpm | 3~5s | 3~8s |
| Set up Node.js | 5~8s | 8~9s |
| Install dependencies | 6~7s | **2s** |
| Install Playwright Chromium when used | 24~26s | 23~32s |
| **Run quality checks** | **67~89s** | **86~90s** |
| Post Set up Node.js | 4~5s | 0s |

> Post Set up Node.js는 pnpm store 캐시 **업로드** 단계 — cold에선 새 캐시를 저장하느라 4~5s, warm은 hit이라 저장을 건너뛰어 0s.

### Run quality checks 내부 분해 (raw 로그 줄 타임스탬프, cold attempt 2 / warm attempt 6)

`pnpm check` = 아래 스크립트 5개의 직렬 실행:

| 스크립트 (실행 명령) | cold | warm |
|---|---|---|
| `pnpm test` (vitest run) | 23.4s | 21.8s |
| `pnpm lint` (eslint .) | 16.8s | 16.2s |
| `pnpm typecheck` (tsc --noEmit) | 4.7s | 4.6s |
| `pnpm build` (next build) | 11.5s | 11.1s |
| **`pnpm test:e2e` (playwright test)** | **32.7s** | **31.7s** |

### 병목 지목

가장 긴 단일 step은 **Run quality checks**(중앙값 ~88s)이고, 그 내부 최장 구간은 **`pnpm test:e2e` 32~33s**다. step 밖에서는 **Install Playwright Chromium when used 23~32s**가 매 실행 반복된다(브라우저 캐시 없음). 합치면 **E2E 계열 비용(브라우저 설치 + 실행)이 ~60s로 전체 wall-clock(~140s)의 43%** — 이것이 병목이다. 둘째는 `pnpm test` 22s, 셋째 `pnpm lint` 17s.

### 발견 1 — cold와 warm의 차이가 거의 없다

cold 중앙값 144s vs warm 134s. 차이 10s는 측정 범위(18~19s)보다 작아 유의미하지 않다. 이유를 step 단위로 분해하면 캐시의 손익이 세 step에 나뉘어 찍힌다: 이득은 Install dependencies 6~7s → 2s(**−4~5s**), 비용은 Set up Node.js의 198MB 복원(**warm이 +2~3s 더 걸림**) — 순이득 **~2초**. cold 쪽은 Post Set up Node.js에서 새 캐시 업로드로 +4~5s를 낸다. 즉 의존성이 작은 이 레포에선 복원 비용이 이득을 거의 상쇄한다. "캐시를 걸면 빨라진다"는 통념이 규모에 따라 미미할 수 있다는 실측.

**개선 판정 규칙 (After 측정 전 고정)**: Before와 After 각각의 wall-clock [최소, 최대] 구간이 **겹치지 않을 때만** "개선"으로 인정하고, 겹치면 "유의미하지 않음"으로 기록한다. 특정 수치(예: 범위 19s)를 문턱으로 못박지 않는 이유 — 3회 표본의 범위는 이상치 하나에 좌우되는 거친 추정이라, After 자체의 흔들림까지 함께 보는 구간 비교가 더 강건하다.

### 발견 2 — Run quality checks step 자체의 러너 편차가 크다

check step raw: cold 89/67/88s(중앙값 88), warm 90/86/87s(중앙값 87). 이 step은 캐시와 무관하므로 cold/warm 중앙값이 사실상 같고, cold의 67s(attempt 3)는 **같은 조건 안에서 22s 벌어진 러너 뽑기 이상치**다. 러너 성능 편차가 측정 범위의 주요 원인 — 개별 raw가 아니라 중앙값으로 판정하고 범위를 병기해야 하는 이유의 실증.

### 발견: 5주간의 중복 실행

4주차에 만든 ci.yml(lint·unit·E2E, node 22 하드코딩)과 5주차 스타터 quality.yml(`pnpm check` 전체)이 모든 PR에서 동시 실행돼 왔다. ci.yml의 검증은 quality.yml의 완전 부분집합 — PR마다 E2E·lint·unit이 2중 실행. 두 workflow는 병렬이라 제거해도 wall-clock은 줄지 않으므로, 이 정리는 러너 사용량 축(×2→×1)에만 기록한다.

## 전략 결정 (Before 측정 직후, After 측정 전 확정 — 2026-09-09)

병목 분해가 드러낸 낭비는 세 종류였고, 각각 해법이 다르다. **세 가지 모두 적용한다.**

| 전략 | 대응하는 낭비 | 예상 효과 |
|---|---|---|
| ① Playwright 브라우저 캐시 (`actions/cache`) | 다운로드 반복 — Install Playwright Chromium when used 24~32s | −20~25s |
| ② job 병렬화 — lint·type·unit job ∥ build+E2E job | 줄 서기 — `pnpm test` 22s + `pnpm lint` 17s가 E2E 뒤 직렬로 합산 | 크리티컬 패스에서 44s 제거 |
| ③ E2E 안의 2차 build 제거 — CI에선 webServer가 start만 | 중복 실행 — `pnpm check`의 build 직후 webServer가 `pnpm build`를 반복 | −8~10s |

### 과제 제시 전략 3종과의 대조 (선택/미선택 근거)

| 과제의 전략 | 효과 조건("언제 효과 있나") | 판단 | 근거 |
|---|---|---|---|
| job 병렬화 | 독립 검증이 한 job에서 직렬 | **채택 (②)** | 정확히 우리 상황 — `pnpm check`가 test 22s·lint 17s를 E2E 뒤 직렬로 합산. 이 44s는 캐시로 줄일 수 없는 실행 시간이라 병렬 배치만이 해법 |
| concurrency 그룹 | 같은 PR에 연속 push 잦음 | **채택 — 단 wall-clock 축 아님** | 리뷰 중 연속 push가 실제 잦음(upstream PR run 이력으로 실측 예정). 단 단일 run 시간을 줄이는 게 아니라 중복 run을 없애는 것이므로 개선 수치는 "낭비 방지" 축에 분리 기록 |
| setup-node·pnpm store 캐시 | install이 매번 새로 받는 경우 | **해당 없음 — 이미 적용돼 있음** | 5주차 스타터가 이미 `cache: pnpm`을 걸어둠. Before 측정으로 이 레포에서의 효과가 순이득 ~2s임을 실측(발견 1) — 추가 보강은 무의미해서 안 함 |

과제 표 밖에서 병목이 직접 지목한 전략 2종(①브라우저 캐시, ③2차 build 제거)을 추가 채택:
- ①은 캐시만이 해법(병렬화해도 e2e job 경로에 다운로드 25s가 남음), ③은 ci.yml 삭제와 같은 중복 제거 카테고리(검증 항목 불변 — build는 여전히 1회 검증).
- 안 고른 조합의 근거: ① 단독은 예상 개선폭이 측정 흔들림과 비슷해 구간 비겹침 판정이 경계선. ② 단독은 브라우저 다운로드 25s가 e2e job에 그대로 남아 효과 반감.
- 제외한 전략의 근거: pnpm 캐시 보강 — 순이득 ~2s 실측(발견 1)이라 무의미. next build 캐시 — 대상 구간이 11s라 실익 대비 검증 신뢰 리스크. 검증 축소 — 금지.
- **검토했으나 제외 — job 간 setup+install 재사용**: job은 매번 새 VM이라 머신 상태(설치된 node_modules·바이너리)는 구조적으로 공유 불가. 공유 가능한 것(pnpm store 캐시 198MB)은 이미 두 job이 같은 캐시를 복원해 공유 중이며, 남는 고정비 ~20s는 대부분 VM 준비·런타임 설치 비용. 대안 3종도 손익이 안 맞아 제외 — ⑴ node_modules artifact 업/다운로드: 수백 MB 전송이 install 2s보다 느림 ⑵ 선행 준비 job(needs): 병렬 앞에 직렬 단계(+자기 setup 20s)가 추가돼 크리티컬 패스가 오히려 증가 ⑶ 의존성 내장 커스텀 러너 이미지: 실무적 정답이지만 개인 레포 규모엔 이미지 관리 비용이 이득 초과. 결론: 고정비 20s는 제거 대상이 아니라 병렬화의 입장료로 보고, 입장료보다 큰 구간(build+E2E ~70s)에만 job을 신설.
- ②의 함정 검증 의무: 각 job의 install 중복 시간을 After에서 실측해 병렬화 이득을 까먹지 않는지 기록한다.
- ②의 분할 굵기(2-job에서 멈춘 근거): job 하나당 setup+install 고정비 ~20s. lint(17s)·typecheck(5s)를 별도 job으로 더 쪼개면 옮기는 시간보다 고정비가 커서 손해. build+E2E(~70s) 분리만 고정비를 넘는 이득. job 내 동시 실행(test ∥ lint)은 vitest가 이미 코어를 포화시켜(로컬 CPU 448%) 경합만 남 — 제외.
- build를 별도 job으로 두지 않은 근거: E2E가 build 산출물(.next)에 의존하는데 job 간 파일 시스템은 공유되지 않아, 분리하면 재빌드(중복 부활) 또는 artifact 전송+직렬화(needs로 크리티컬 패스 ~70s→~100s 후퇴) 중 하나를 강요당함. 원칙 — **독립인 검증은 job으로 가르고(lint·type·test ∥ build+E2E), 의존인 검증은 한 job 안에서 step으로 가른다**(빌드 실패는 Build step에서 독립적으로 보임).
- 함께 적용(별도 축): ci.yml 삭제(러너 사용량 ×2→×1), concurrency(ref 포함·PR만 취소, 낭비 방지), timeout-minutes 10분(warm 중앙값 2m14s의 ~4배, 측정 기반 산정).

## After (2026-09-09, run [34357394959](https://github.com/heeji289/loop-pack-fe-l2-vol1/actions/runs/34357394959) attempt 2~7, 커밋 5cadb544, PR #3)

Before와 같은 프로토콜: cold = `gh cache delete --all` 후 같은 커밋 re-run ×3, warm = 캐시 보존 re-run ×3.

### Before/After 비교 — run wall-clock

| 조건 | Before raw (중앙값) | After raw (중앙값) | 판정 (구간 비겹침 규칙) |
|---|---|---|---|
| cold | 144/128/146s (**144s**) | 94/91/110s (**94s**) | [128,146] vs [91,110] — 겹침 없음 → **개선 (−50s, −35%)** |
| warm | 151/132/134s (**134s**) | 69/83/71s (**71s**) | [132,151] vs [69,83] — 겹침 없음 → **개선 (−63s, −47%)** |

### 변화가 병목과 연결되는가 (전략별 인과)

| 전략 | Before | After | 확인 |
|---|---|---|---|
| ② job 병렬화 | test 22s+lint 17s가 E2E 뒤 직렬 | checks job(63~73s) ∥ build-e2e job(64~104s) — wall = max | 직렬 합산이면 ~130s였을 경로가 max로 접힘. 두 job 크기가 비슷해 균형도 좋음 |
| ③ 2차 build 제거 | `pnpm test:e2e` 32~33s (내부에 재빌드 포함) | E2E tests step 20~22s | **예측한 −10s가 그대로 실현.** Build는 독립 step(11~13s)으로 분리 가시화 |
| ① 브라우저 캐시 | miss 경로: 브라우저+OS deps 설치 26/27/38s (중앙값 **27s**) + 캐시 저장 3~6s(비교에서 제외) | hit 경로: 복원 2~7s + OS deps 11~13s + 캐시 후처리 0~1s = 14/20/15s (중앙값 **15s**) | **새 설치 27s(캐시 저장 제외) 대비 hit 전체 15s — 관찰 이득 ~12s** (표본 3회 한정 — 항상 보장 아님). 예상(−20~25s)보다 작은 이유: OS 라이브러리(apt)는 캐시 대상이 아니라 hit에도 `install-deps` 비용이 남음. Playwright 공식 문서는 같은 근거로 브라우저 캐시를 비권장하되, 쓴다면 버전 키를 권고 — 현 구현은 버전 키·hit 시 deps 설치 조건을 준수. **채택 근거: 공식 권고를 검토한 뒤 우리 실행에서 27→15s를 관찰해 유지** (miss가 잦은 환경이면 손해일 수 있음). 컨테이너 이미지 대안은 pull 비용이 절약분을 초과할 공산 + 내장 Node의 .nvmrc 불일치 위험으로 제외 — 시각 회귀·self-hosted 규모의 카드로 회고에 기록 |

### 병렬화 함정 검증 — install 중복이 캐시 이득을 까먹는가

- 두 job의 Install dependencies는 warm에서 **각 2s** (pnpm store 캐시를 양쪽이 공유 복원) — 중복 비용 합계 ~4s로 무시 가능. **함정 통과.**
- 러너 사용량(billable) 관점: Before는 PR당 quality 134s + ci.yml ~132s ≈ **266s**, After는 checks ~64s + build-e2e ~65s ≈ **130s** — 병렬화로 job이 늘었는데도 ci.yml 삭제와 효율화로 **사용량도 절반**. wall-clock과 별개 축임을 유지.

### 검증 항목 동일성

Before와 After 모두 unit·integration / lint / typecheck / production build / E2E 5종 전부 실행 — 제거·축소 없음 (After에선 step 단위로 분리돼 실패 위치가 즉시 보임).

## 캐시 hit/miss 증명

### hit (Before warm 측정에서 확보)

![warm attempt의 캐시 복원과 install 재사용](../images/week10-cache-hit-warm.png)

- warm attempt의 "Set up Node.js" step: `Cache hit for: node-cache-Linux-x64-pnpm-ea3717af…`, `Cache Size: ~198 MB`, 그리고 **`Cache restored from key: …`** — 과제 예시 문구 그대로. 이어지는 "Install dependencies"는 `reused 540, downloaded 0`으로 **2s**
- 대조: cold attempt 2(캐시 삭제 직후) 같은 step: `pnpm cache is not found` → install은 `downloaded 540`으로 6~7s
- hit/miss install 시간 차: **4~5s** (발견 1과 동일 수치)

### miss — lockfile 변조 재현 (티켓 05에서 수행 예정)

## concurrency (낭비 방지)
