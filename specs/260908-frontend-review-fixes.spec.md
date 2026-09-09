# Frontend Fundamentals 리뷰 수정

## 목표와 승인 범위

사용자가 직전 리뷰의 두 개선안 수정을 승인했다. QueryClient 설정 계약을 실제 지원 범위로 좁히고, 장바구니 구매 조건을 하나로 모은다. 비로그인 사용자도 로그인 안내로 이어갈 수 있어야 한다.

## 조사 결과와 결정 사항

- `makeQueryClient`의 설정 전달 호출자는 앱의 queryCache·mutationCache 조합뿐이다. 인자를 `Pick<QueryClientConfig, 'queryCache' | 'mutationCache'>`로 제한한다.
- `canPurchase`에 `user !== undefined`를 포함하고 클릭 핸들러의 별도 세션 가드를 제거한다. `null`은 구매 시 로그인 안내를 열 수 있는 정상 상태다.
- 기존 세션 조회 실패 테스트를 구매 버튼 비활성화 및 재조회 후 복구 검증으로 수정한다.

## 비범위

- 설정 병합 기능, 외부 의존성, 환경설정 변경
- 다른 인증·주문 흐름 재설계

## 완료 조건

- [x] QueryClient 설정 인자가 두 캐시 설정으로 제한되며 기존 호출부 타입 검사를 통과한다.
- [x] 세션을 확인하지 못한 동안 구매 버튼이 비활성화된다.
- [x] 재조회로 비로그인이 확인되면 구매 버튼이 활성화되고 로그인 안내를 연다.
- [x] 관련 테스트, lint, typecheck, build 통과.
- [x] self-review 및 변경 테스트의 test-review 완료.

## Self Review 결과

**판정: PASS**

- 기능 완성도: 완료 조건 충족. 기존 호출부의 캐시 조합과 로그인·비로그인 구매 흐름을 유지한다.
- 정적 검사: `pnpm lint`, `pnpm typecheck`, `pnpm build` 통과.
- 관련 테스트: `pnpm test src/shared/query-client.test.ts tests/cart-page.dom.test.tsx` — 2개 파일, 13개 통과.
- test-review: PASS. 지적 사항 없음.

## Test Review 결과

**판정: PASS**

- 대상: `tests/cart-page.dom.test.tsx`의 수정 테스트.
- 의도 출처: 사용자 승인과 이 문서의 구매 조건·복구 완료 조건.
- 누락: 없음. 기존 테스트가 로그인·비로그인 구매를 검증하고, 수정 테스트가 조회 실패 후 복구를 검증한다.
- 실패 의미: 상품이 준비돼도 세션 미확인 상태에서 구매 버튼이 활성화되거나, 재조회 후 구매 및 로그인 안내가 복구되지 않는다.
- 거짓 초록불 점검: 상품 조회 완료를 기다려 상품 로딩으로 인한 비활성화와 구분한다. 재시도 후 버튼 활성화를 기다리고 로그인 안내 표시까지 확인한다.
- 지적 사항: 없음.
