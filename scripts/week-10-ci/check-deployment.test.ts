import { expect, it } from 'vitest';

import { assertDeploymentResponse } from './check-deployment.mjs';

it('앱의 비로그인 응답이면 후보 검증을 통과한다', () => {
  expect(() =>
    assertDeploymentResponse('{"message":"로그인이 필요합니다."}', 401),
  ).not.toThrow();
});

it.each([
  ['서버 기동 오류', '{"error":"FUNCTION_INVOCATION_FAILED"}', 500],
  ['배포 보호 페이지', '<html>Authentication Required</html>', 401],
  ['다른 JSON 오류', '{"error":"unauthorized"}', 401],
  ['잘못된 성공 상태', '{"message":"로그인이 필요합니다."}', 200],
])('%s이면 후보 승격 조건을 통과하지 못한다', (_, body, status) => {
  expect(() => assertDeploymentResponse(body, status)).toThrow();
});
