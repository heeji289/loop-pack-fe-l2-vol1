import {
  environmentManager,
  hashKey,
  MutationCache,
  QueryCache,
  type QueryClient,
} from '@tanstack/react-query';

import { identify, reset } from '@/analytics/events';
import { replaceSessionUser, sessionQueries } from '@/entities/session';
import { buildExpiredLoginUrl, isProtectedPath } from '@/features/auth';
import { isUnauthorizedError } from '@/shared/api-client';
import { replaceDocument } from '@/shared/navigation';
import { makeQueryClient } from '@/shared/query-client';

const ME_QUERY_HASH = hashKey(sessionQueries.me().queryKey);

/**
 * 앱 인증 정책이 연결된 브라우저용 QueryClient.
 * 중복 이동 방지 플래그는 client와 수명을 같이해, 문서 이동으로 client가 새로 만들어지면
 * (재로그인 뒤) 다음 만료를 다시 처리할 수 있다.
 */
export function makeAppQueryClient() {
  // 공개 화면에서는 정리 완료 후 해제하고, 보호 화면에서는 문서 교체까지 유지한다.
  let isHandlingSessionExpiry = false;

  // 같은 계정의 재확인마다 identify를 반복하지 않기 위한 마지막 식별 계정
  let identifiedUserId: string | undefined;

  /**
   * 세션 만료 공통 처리. 사용자 단일 출처를 비우고 계정 범위 캐시만 제거한다(상품 캐시 유지).
   * 로그인 이동 여부는 요청이 아니라 현재 화면의 접근 정책(보호 경로 여부)으로 결정한다.
   */
  const handleSessionExpired = async () => {
    if (isHandlingSessionExpiry) return;
    isHandlingSessionExpiry = true;

    await replaceSessionUser(queryClient, null);
    reset();
    identifiedUserId = undefined;

    // 로그인 화면(비보호)에 늦게 도착한 401은 여기서 걸러져 next를 로그인 URL로 덮지 않는다.
    const { pathname, search } = window.location;
    if (!isProtectedPath(pathname)) {
      isHandlingSessionExpiry = false;

      return;
    }

    // 라우터 대신 문서 이동으로 서버가 로그인 화면을 새로 그리고, 이전 캐시가 남지 않게 한다.
    replaceDocument(buildExpiredLoginUrl(pathname, search));
  };

  const queryClient: QueryClient = makeQueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (query.meta?.requiresAuth && isUnauthorizedError(error)) {
          void handleSessionExpired();
        }
      },
      // /me는 401을 null 데이터로 성공시켜 onError가 없다. null 성공도 만료 흐름에 잇는다.
      onSuccess: (_data, query) => {
        if (query.queryHash !== ME_QUERY_HASH) return;

        // 전역 콜백의 data는 unknown이라, 방금 기록된 캐시를 쿼리 타입 그대로 다시 읽는다
        const user =
          queryClient.getQueryData(sessionQueries.me().queryKey) ?? null;

        if (user === null) {
          void handleSessionExpired();

          return;
        }

        // 다른 탭의 계정 전환 등으로 세션이 다른 계정으로 확인되면 화면과 분석 식별을 함께 맞춘다.
        // 서버 초기 식별(CommerceAnalytics)과 기준을 공유하지 않아 첫 재확인은 같은 계정을
        // 한 번 더 식별할 수 있다. identify는 같은 계정의 재설정이라 멱등이고, 이후 반복은 여기서 막는다.
        if (user.id !== identifiedUserId) {
          identify(user.id);
          identifiedUserId = user.id;
        }
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        if (mutation.meta?.requiresAuth && isUnauthorizedError(error)) {
          return handleSessionExpired();
        }
      },
    }),
  });

  return queryClient;
}

let browserQueryClient: QueryClient | undefined;

/**
 * 서버는 요청마다 새 client를 만들어 사용자 간 캐시가 섞이지 않게 한다.
 * 브라우저는 인증 정책이 연결된 client 하나만 재사용한다. useState로 만들면 초기 렌더에서
 * 아래 RSC가 suspend할 때 React가 client를 버려 캐시가 조용히 초기화된다.
 */
export function getQueryClient() {
  if (environmentManager.isServer()) return makeQueryClient();

  if (!browserQueryClient) browserQueryClient = makeAppQueryClient();

  return browserQueryClient;
}
