# 10주차 — CI 측정·최적화 기록

quality workflow를 측정한 뒤 job 병렬화, 중복 빌드 제거, Playwright 브라우저 캐시를 적용했다. 전체 실행 시간의 중앙값은 cold **144→94초**, warm **134→71초**로 줄었다. unit·integration, lint, typecheck, production build, E2E 검증은 모두 유지했다.

결과는 세 축으로 구분한다. 중복 workflow 제거 효과를 quality workflow 자체의 속도 개선으로 계산하지 않는다.

| 축 | Before | After |
|---|---|---|
| 전체 실행 시간 (quality run wall-clock) | cold 144초 · warm 134초 | cold 94초 (−35%) · warm 71초 (−47%) |
| PR당 러너 사용 시간 추정 | 두 workflow 합계 약 266초 | 두 job 합계 약 130초 |
| 연속 push의 중복 검증 | 이전 PR run도 계속 실행 | 같은 PR의 이전 run 취소, main run은 독립 실행 |

계획과 의사 결정은 [week10-decisions.md](week10-decisions.md)에 기록했다. 측정 프로토콜은 ADR-2·4, 실험 환경은 ADR-3을 따른다.

## 측정 조건과 판정 기준

- **대상**: fork `heeji289`의 실험 PR. upstream에서는 캐시 삭제와 재실행 권한이 없어 fork에서 측정했다.
- **전체 실행 시간**: quality workflow의 attempt별 시작부터 종료까지 걸린 시간.
- **cold**: `gh cache delete --all`로 서버 캐시를 모두 삭제한 뒤 같은 커밋에서 “Re-run all jobs”.
- **warm**: 캐시를 보존한 채 같은 커밋에서 재실행.
- **반복**: 각 조건에서 3회. [7주차 측정 방식](../week-07-performance/measure-protocol.md)을 따라 원자료·중앙값·범위를 함께 기록했다.

**판정 규칙은 After 측정 전에 고정했다.** After의 [최소, 최대] 구간이 Before보다 낮고 두 구간이 겹치지 않을 때만 “개선”으로 판정한다. 겹치면 “유의미하지 않음”으로 기록한다. 이는 3회 표본에 적용한 실무 판정 기준이며, 통계적 유의성을 검정한 결과는 아니다.

## Before — 병목 확인

2026-09-09 측정. 커밋 `08344858`, run [34329855053](https://github.com/heeji289/loop-pack-fe-l2-vol1/actions/runs/34329855053).

### 전체 실행 시간

| 조건 | 1회 | 2회 | 3회 | 중앙값 | 최소–최대 (폭) |
|---|---|---|---|---|---|
| cold — attempt 2·3·4 | 144초 | 128초 | 146초 | **144초** | 128–146초 (18초) |
| warm — attempt 5·6·7 | 151초 | 132초 | 134초 | **134초** | 132–151초 (19초) |

### step별 소요 시간

Actions 화면의 step 이름을 그대로 사용했다.

| step | cold — attempt 2·3·4 | warm — attempt 5·6·7 |
|---|---|---|
| Set up job | 1초 | 1초 |
| Checkout | 1~2초 | 2초 |
| Set up pnpm | 3~5초 | 3~8초 |
| Set up Node.js | 5~8초 | 8~9초 |
| Install dependencies | 6~7초 | **2초** |
| Install Playwright Chromium when used | 24~26초 | 23~32초 |
| **Run quality checks** | **67~89초** | **86~90초** |
| Post Set up Node.js | 4~5초 | 0초 |

`Post Set up Node.js`는 pnpm store 캐시를 저장하는 단계다. cold에서는 업로드에 4~5초가 들었고, warm에서는 기존 캐시를 사용해 저장을 건너뛰었다.

### 가장 긴 step 내부 분해

`Run quality checks`는 `pnpm check` 한 명령으로 아래 검증을 직렬 실행했다. raw 로그의 줄별 타임스탬프로 cold attempt 2와 warm attempt 6을 분해했다.

| 명령 | cold | warm |
|---|---|---|
| `pnpm test` | 23.4초 | 21.8초 |
| `pnpm lint` | 16.8초 | 16.2초 |
| `pnpm typecheck` | 4.7초 | 4.6초 |
| `pnpm build` | 11.5초 | 11.1초 |
| **`pnpm test:e2e`** | **32.7초** | **31.7초** |

가장 긴 구간은 E2E 실행 32~33초였다. 여기에 매번 반복되는 Playwright 설치 23~32초를 더하면 **E2E 준비·실행에 약 60초**, 전체 약 140초의 43%가 들었다. 설치 시간에는 브라우저 다운로드와 OS 의존성 설치가 모두 포함된다. E2E 실행에는 `webServer`가 수행하는 두 번째 production build도 포함돼 있었다.

### 캐시 이득과 실행 편차

pnpm store 캐시는 이미 적용돼 있었다. warm에서 의존성 설치는 6~7초에서 2초로 줄었지만, `Set up Node.js`의 약 198MB 캐시 복원에는 cold보다 약 2~3초가 더 들었다. 두 step만 보면 순이득은 약 2초였다. cold의 캐시 업로드 비용 4~5초는 별도로 발생했다.

전체 실행 시간의 cold·warm 구간은 겹쳤다. 이 표본만으로 pnpm 캐시가 전체 시간을 뚜렷하게 줄였다고 판단하지 않았다.

`Run quality checks` 자체도 cold 89/67/88초, warm 90/86/87초로 흔들렸다. 같은 조건에서 최대 22초 차이가 나므로 한 번의 빠른 실행을 대표값으로 삼지 않았다. 러너 성능 등 실행 환경의 영향을 의심할 수 있지만, 원인을 별도로 분리 측정하지는 않았다.

### 중복 workflow 확인

4주차의 `ci.yml`은 lint·unit·E2E를, 5주차의 `quality.yml`은 `pnpm check` 전체를 실행했다. `ci.yml`의 검증은 quality의 부분집합이어서 PR마다 lint·unit·E2E가 두 번씩 실행됐다. Node 버전도 `ci.yml`의 22와 `.nvmrc` 기준이 달랐다.

두 workflow는 병렬로 실행되므로 `ci.yml` 삭제 효과는 **러너 사용 시간 절감**으로 기록한다. 이를 quality workflow의 wall-clock 단축으로 계산하지 않는다.

## 전략 선택

2026-09-09, Before 측정 직후 아래 세 전략을 함께 적용하기로 결정했다. 예상치는 당시의 가설로 남기고, 실제 결과와 구분한다.

| 전략 | 대응하는 비용 | 당시 예상 |
|---|---|---|
| Playwright 브라우저 캐시 | 매번 반복되는 브라우저 다운로드 | 20~25초 단축 — OS 의존성 비용을 충분히 반영하지 못한 예상 |
| `checks` ∥ `build-e2e` 병렬화 | unit·lint·typecheck와 build·E2E의 직렬 실행 | 전체 완료를 결정하는 경로에서 약 44초 분리 |
| CI의 중복 build 제거 | Build 직후 E2E의 `webServer`가 다시 build | 8~10초 단축 |

과제에서 제시한 job 병렬화와 concurrency는 채택했다. pnpm store 캐시는 이미 적용돼 있었고 관찰한 순이득도 작아 추가 보강하지 않았다. concurrency의 목적과 검증은 [별도 절](#concurrency--pr의-중복-검증-취소)에 정리했다.

### job은 둘로, build와 E2E는 같은 job으로

`checks`에는 unit·integration, lint, typecheck를 두고, `build-e2e`에는 production build와 E2E를 뒀다. 두 job은 독립적으로 실행한다.

job마다 준비·설치에 약 20초가 들기 때문에 lint 약 17초나 typecheck 약 5초까지 별도 job으로 나누지는 않았다. 더 잘게 나눴을 때의 전체 시간은 별도로 측정하지 않았다. job 안에서 test와 lint를 동시에 실행하는 방안도 vitest의 CPU 사용량이 높다는 관찰(로컬 약 448%)을 고려해 채택하지 않았다.

build와 E2E는 `.next` 산출물로 연결돼 있다. 별도 job으로 나누면 다시 빌드하거나 artifact로 전달해야 하므로 같은 job에 유지했다. 대신 **Build와 E2E를 별도 step으로 나눠 시간과 실패 위치를 확인**한다. CI의 Playwright `webServer`는 `pnpm start`만 실행한다.

### 추가하지 않은 최적화

- **job 간 setup·install 공유**: 각 job은 별도 VM에서 실행한다. pnpm store 캐시는 두 job에서 복원하되, `node_modules` artifact 전송이나 선행 준비 job은 추가하지 않았다. warm install이 2초인 상황에서 전송·준비 단계를 늘릴 근거가 부족했다.
- **커스텀 러너 이미지**: 준비 비용을 줄일 수 있지만 개인 레포에서 이미지 관리까지 도입하지 않았다.
- **Next.js build 캐시**: 측정한 build가 약 11초여서 이번에는 적용 범위를 늘리지 않았다.
- **검증 축소**: Before와 같은 검증 항목을 유지한다는 측정 조건에 따라 제외했다.

단독 전략별 A/B 실험은 하지 않았다. 아래 After 결과는 세 전략을 함께 적용한 결과이며, 각 전략의 효과는 관련 step의 변화로 해석한다.

workflow 통합과 함께 job timeout을 10분으로 설정했다. Before warm 중앙값 2분 14초의 약 4.5배를 여유로 둔 값이다.

## After — 같은 조건에서 재측정

2026-09-09 측정. 커밋 `5cadb544`, PR #3, run [34357394959](https://github.com/heeji289/loop-pack-fe-l2-vol1/actions/runs/34357394959)의 attempt 2~7. Before와 동일하게 cold·warm 각 3회를 측정했다.

### 전체 실행 시간 비교

| 조건 | Before 원자료 (중앙값) | After 원자료 (중앙값) | 판정 |
|---|---|---|---|
| cold | 144/128/146초 (**144초**) | 94/91/110초 (**94초**) | [128,146]과 [91,110]이 겹치지 않음 — **50초·35% 단축** |
| warm | 151/132/134초 (**134초**) | 69/83/71초 (**71초**) | [132,151]과 [69,83]이 겹치지 않음 — **63초·47% 단축** |

unit·integration, lint, typecheck, production build, E2E는 Before와 After에서 모두 실행했다. 검증을 제거하거나 축소해 얻은 단축은 없다.

### 병렬화와 중복 build 제거

| 관찰 대상 | Before | After |
|---|---|---|
| 검증 실행 구조 | `pnpm check`에서 직렬 실행 | `checks` 63~73초 ∥ `build-e2e` 64~104초 |
| E2E step | 32~33초 — 재빌드 포함 | 20~22초 — 기존 빌드 사용 |
| Build step | `pnpm check` 내부 11초대 | 독립 step 11~13초 |

두 job의 실행 구간이 겹치면서 전체 완료 시간은 주로 더 늦게 끝나는 job에 좌우됐다. workflow 전체 시간에는 job 시작 시차 등도 포함되므로 job 소요 시간의 최댓값과 정확히 같지는 않다. E2E의 약 10초 단축은 중복 build 제거의 예상과도 맞았다.

job 분리로 늘어난 설치 비용도 확인했다. warm의 `Install dependencies`는 두 job에서 **각 2초**, 합계 약 4초였다. 이 실행에서는 설치 중복이 전체 시간 단축을 상쇄하지 않았다.

### Playwright 캐시는 유지할 가치가 있었나

같은 After run의 miss attempt 2·3·4와 hit attempt 5·6·7을 비교했다.

| 비교 구간 | 원자료 | 중앙값 |
|---|---|---|
| 새 설치: 브라우저 + OS 의존성, 캐시 저장 제외 | 26/27/38초 | **27초** |
| hit 전체: 캐시 복원 + OS 의존성 + 캐시 후처리 | 14/20/15초 | **15초** |

hit의 구성은 복원 2~7초, OS 의존성 설치 11~13초, 캐시 후처리 0~1초였다. miss에서는 새 설치 외에 캐시 저장 비용 **3~6초**가 추가됐다.

[Playwright 공식 문서](https://playwright.dev/docs/ci#caching-browsers)는 복원 시간이 다운로드 시간과 비슷할 수 있고 Linux의 OS 의존성은 캐시할 수 없다는 이유로 브라우저 캐시를 권장하지 않는다. 사용한다면 Playwright 버전에 맞춰 캐시 키를 구분하도록 안내한다. 현재 구현은 버전 키를 사용하며 hit에서도 `install-deps chromium`을 실행한다.

**새 설치 27초(캐시 저장 제외) 대비 hit 전체 15초로, 설치 관련 구간에서 약 12초의 이득을 관찰해 캐시를 유지했다.** 예상했던 20~25초보다 작았던 이유는 hit에도 OS 의존성 설치가 남기 때문이다. 표본은 각 3회이며 항상 같은 이득을 보장하지 않는다. miss가 잦으면 저장 비용 때문에 손해일 수 있다.

이 비교는 브라우저 바이너리 다운로드만의 시간이 아니라 **설치 관련 구간 전체**의 비교다. 전체 workflow의 단축분에는 pnpm 캐시 상태와 다른 최적화도 영향을 주므로 이를 모두 브라우저 캐시 효과로 계산하지 않는다.

공식 컨테이너 이미지도 검토했지만 이번에는 도입하지 않았다. 이미지 pull 비용과 `.nvmrc`에 맞춘 Node 설정을 추가로 확인해야 하며, 현재 캐시보다 빠른지는 측정하지 않았다.

### 러너 사용 시간 추정

Before는 PR당 quality 약 134초와 `ci.yml` 약 132초를 합쳐 **약 266초**, After는 warm의 `checks` 약 64초와 `build-e2e` 약 65초를 합쳐 **약 130초**로 추산했다.

중복 workflow 삭제와 실행 효율화로 사용 시간도 약 절반으로 줄었다. 이 수치는 대표 소요 시간으로 계산한 추정치이며, 실제 청구 시간을 집계한 값은 아니다.

## 캐시 키 검증 — hit, miss, 원복

### pnpm store의 hit 확인

Before warm에서 다음 로그를 확보했다.

![warm attempt의 캐시 복원과 install 재사용](../images/week10-cache-hit-warm.png)

| 관찰 지점 | warm | cold — attempt 2 |
|---|---|---|
| Set up Node.js | `Cache hit for: node-cache-Linux-x64-pnpm-ea3717af…`, 약 198MB 복원 | `pnpm cache is not found` |
| Install dependencies | `reused 540, downloaded 0` — 2초 | `downloaded 540` — 6~7초 |

install step에서 관찰한 차이는 4~5초다. 캐시 복원과 저장 비용은 이 차이에 포함하지 않는다.

### lockfile 변경으로 miss 재현

2026-09-09, 커밋 `7b1c55a5`에서 lockfile 끝에 YAML 주석 한 줄을 추가했다. 의존성 정의는 유지하면서 파일 내용의 해시만 바꾸기 위해서다. `--frozen-lockfile` 검증도 통과했다.

변경 후 run [34363213822](https://github.com/heeji289/loop-pack-fe-l2-vol1/actions/runs/34363213822)에서 다음을 확인했다.

| 관찰 지점 | 기존 warm | lockfile 변경 후 |
|---|---|---|
| Set up Node.js | `Cache hit for: node-cache-…` | `pnpm cache is not found` |
| Install dependencies | `reused 540, downloaded 0` — 2초 | `reused 0, downloaded 540` — 6.4초 |

같은 run의 브라우저 캐시는 `playwright-browsers-Linux-1.61.1` 키로 hit했다. lockfile 주석 변경으로 Playwright 버전은 바뀌지 않았으므로, pnpm store만 miss가 발생했다.

커밋 `a098c839`에서 주석을 제거한 뒤 run [34363761765](https://github.com/heeji289/loop-pack-fe-l2-vol1/actions/runs/34363761765)이 green으로 끝났고 install도 **2초로 복귀**했다. 이 실험으로 lockfile 내용이 pnpm store 캐시 키에 반영되며, 브라우저 캐시는 별도의 버전 키를 사용함을 확인했다. 실험용 주석은 남아 있지 않다.

## concurrency — PR의 중복 검증 취소

### 이벤트별 정책

| 이벤트 | group 예시 | 동작 |
|---|---|---|
| PR push | `Quality-refs/pull/N/merge` | 같은 PR의 이전 run을 취소하고 최신 변경 검증 |
| main push | `Quality-<run_id>` | 서로 다른 그룹으로 독립 실행, 후속 push에 의한 concurrency 취소 방지 |

`cancel-in-progress: false`만으로는 같은 그룹의 대기 run까지 보호할 수 없다. 기본 큐에서는 한 run이 실행 중이고 다른 run이 대기할 때 세 번째 run이 들어오면 기존 대기 run을 대체한다. main에는 서로 다른 `run_id`를 사용해 이 충돌을 피했다.

GitHub은 `queue: max`로 여러 run을 대기시키는 방식도 지원한다. 다만 현재 검증은 독립된 러너와 로컬 서버에서 실행하므로 직렬로 대기시킬 필요가 없다. 이 정책은 배포 순서를 제어하는 설정과는 별개다. [GitHub concurrency 문서](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)

### main의 각 push를 검증하는 이유

최신 run만으로도 최신 코드의 상태는 확인할 수 있다. 이 프로젝트에서는 PR의 핵심 E2E를 main의 전체 E2E로 보완할 계획이므로, 각 push의 검증 결과를 남기기로 했다. 실패 원인인 머지를 찾거나 flaky 결과를 대조할 때도 도움이 된다.

이는 머지된 코드의 검증 기록이며, 실제 Production 배포 환경을 테스트했다는 뜻은 아니다. main run을 모두 유지하면 그만큼 러너를 사용한다. 현재 규모에서는 이를 수용하되, 머지 빈도가 높아지면 최신 run만 검증하는 정책과 다시 비교한다.

### 도입 근거와 검증 범위

“연속 push가 잦다”는 초기 가정과 달리, upstream round-6~9 브랜치의 **32 run 중 겹침은 2건**이었다. 큰 절감 효과를 입증한 것은 아니다. 기존 workflow에 간단한 설정을 추가해 연속 push 때의 중복 검증을 줄이는 목적으로 유지했다.

PR의 이전 run 취소는 문서 마감 커밋 두 건을 시차를 두고 push해 재현했다. 취소된 run 목록 캡처는 PR 본문에 첨부했다. main은 비취소를 별도로 실측하지 않았으며, 서로 다른 그룹을 사용한다는 설정 근거로 판단했다. 후속 main push에 의한 concurrency 취소는 피하지만, 수동 취소나 timeout까지 막는 것은 아니다.
