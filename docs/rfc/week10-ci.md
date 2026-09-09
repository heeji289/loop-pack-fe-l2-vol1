# 10주차 — CI 측정·최적화 기록

> 계획 결정: [week10-decisions.md](week10-decisions.md) (ADR-1~13). 측정 프로토콜은 ADR-2·4.
> 이 문서는 측정이 진행되며 채워진다. 개선 수치는 세 축으로 분리해 기록한다:
> **wall-clock 개선** (quality workflow 기준) / **러너 사용량 절감** (중복 workflow 제거) / **낭비 방지** (concurrency).

## 측정 조건

- 비교 축: quality workflow의 run wall-clock (attempt별 시작→종료)
- cold = `gh cache delete --all`로 서버 캐시 전부 삭제 후 같은 커밋 "Re-run all jobs" / warm = 캐시 보존 재실행
- 각 조건 3회 — 러너 시간대별 변동을 범위로 드러내기 위함 (7주차 measure-protocol 방식)
- 측정 무대: fork(heeji289) 실험 PR — upstream은 캐시 삭제·re-run 권한이 없어 fork에서 수행 (근거: ADR-3)

## Before

### 실행 시간 (측정 예정)

| 조건 | 1회 | 2회 | 3회 | 중앙값 | 범위 |
|---|---|---|---|---|---|
| cold | | | | | |
| warm | | | | | |

### 병목 지목 (측정 후 작성)

`pnpm check`는 한 step이라 step 단위로는 내부가 안 보인다. raw 로그의 줄 타임스탬프로 unit→lint→type→build→E2E 구간을 분해해 지목한다.

### 발견: 5주간의 중복 실행

4주차에 만든 ci.yml(lint·unit·E2E, node 22 하드코딩)과 5주차 스타터 quality.yml(`pnpm check` 전체)이 모든 PR에서 동시 실행돼 왔다. ci.yml의 검증은 quality.yml의 완전 부분집합 — PR마다 E2E·lint·unit이 2중 실행. 두 workflow는 병렬이라 제거해도 wall-clock은 줄지 않으므로, 이 정리는 러너 사용량 축(×2→×1)에만 기록한다.

## 전략 결정 (Before 측정 직후 작성)

## After (전략 적용 후 측정)

## 캐시 hit/miss 증명

## concurrency (낭비 방지)
