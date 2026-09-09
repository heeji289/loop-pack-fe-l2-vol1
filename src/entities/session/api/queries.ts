import {
  queryOptions,
  type Query,
  type QueryClient,
} from '@tanstack/react-query';

import type { SessionUser } from '../model/types';

import { apiClient, isUnauthorizedError } from '@/shared/api-client';

type MeResponse = { user: SessionUser };

/** /me의 401은 "비로그인"이라는 정상 답이므로 오류가 아니라 null 데이터로 다룬다. */
const getSessionUser = async (): Promise<SessionUser | null> => {
  try {
    const { user } = await apiClient<MeResponse>('/api/auth/me', {
      cache: 'no-store',
    });

    return user;
  } catch (error) {
    if (isUnauthorizedError(error)) return null;

    throw error;
  }
};

export const sessionQueries = {
  /**
   * 브라우저 사용자 정보의 단일 출처. 서버 layout이 확인한 사용자로 시작한다.
   * staleTime 60초는 마운트·포커스마다 재요청하지 않기 위한 값일 뿐 토큰 만료 시간과 무관하다.
   */
  me: () =>
    queryOptions({
      queryKey: ['me'] as const,
      queryFn: getSessionUser,
      staleTime: 60_000,
    }),
};

/**
 * 로그인·로그아웃·만료에서 이전 계정 조회를 정리하고 사용자를 교체한다.
 * 늦은 응답이 새 세션을 덮지 않도록 사용자·계정 조회를 모두 취소한다.
 */
export async function replaceSessionUser(
  queryClient: QueryClient,
  user: SessionUser | null,
) {
  const isAccountQuery = (query: Query) => query.meta?.requiresAuth === true;

  await Promise.all([
    queryClient.cancelQueries({ queryKey: sessionQueries.me().queryKey }),
    queryClient.cancelQueries({ predicate: isAccountQuery }),
  ]);
  queryClient.removeQueries({ predicate: isAccountQuery });
  queryClient.setQueryData(sessionQueries.me().queryKey, user);
}
