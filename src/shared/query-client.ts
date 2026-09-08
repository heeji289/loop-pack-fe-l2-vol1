import {
  environmentManager,
  QueryClient,
  type QueryClientConfig,
} from '@tanstack/react-query';

import { isUnauthorizedError } from './api-client';

/**
 * 세션이 필요한 요청 표시. 앱의 401 공통 처리가 이 표시로 정리 대상을 고른다.
 * meta 기본 타입은 아무 키나 받으므로, 좁혀 둬야 표시 오타가 컴파일에서 걸린다.
 */
type RequestAuthMeta = {
  requiresAuth?: boolean;
};

declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: RequestAuthMeta;
    mutationMeta: RequestAuthMeta;
  }
}

/**
 * 도메인을 모르는 QueryClient 기본 생성. 앱 정책(캐시 콜백)은 호출부가 config로 조합한다.
 * 서버 선조회도 이 함수로 요청마다 새로 만들어 사용자 간 캐시가 섞이지 않게 한다.
 */
export function makeQueryClient(config?: QueryClientConfig) {
  const maxRetryCount = environmentManager.isServer() ? 0 : 2;

  return new QueryClient({
    ...config,
    defaultOptions: {
      queries: {
        // 401은 다시 로그인하기 전엔 몇 번을 보내도 같으므로 재시도하지 않는다.
        retry: (failureCount, error) =>
          !isUnauthorizedError(error) && failureCount < maxRetryCount,
      },
    },
  });
}
