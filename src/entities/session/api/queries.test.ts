import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { replaceSessionUser, sessionQueries } from './queries';

import { SESSION_USER } from '@tests/msw/fixtures';

describe('세션 교체', () => {
  it.each([SESSION_USER, null])(
    '사용자를 %j로 교체하면 이전 계정 조회를 정리하고 공개 캐시는 유지한다',
    async (nextUser) => {
      const queryClient = new QueryClient();
      const me = sessionQueries.me();
      const { promise: lateUser, resolve: resolveUser } =
        Promise.withResolvers<typeof SESSION_USER>();
      const { promise: lateAccount, resolve: resolveAccount } =
        Promise.withResolvers<string>();
      queryClient.setQueryData(['public'], 'public-content');

      const pendingUser = queryClient
        .fetchQuery({ ...me, queryFn: () => lateUser })
        .catch(() => undefined);
      const pendingAccount = queryClient
        .fetchQuery({
          queryKey: ['account', 'previous-user'],
          queryFn: () => lateAccount,
          meta: { requiresAuth: true },
        })
        .catch(() => undefined);

      await replaceSessionUser(queryClient, nextUser);
      resolveUser({ ...SESSION_USER, id: 'previous-user' });
      resolveAccount('previous-account-content');
      await Promise.all([pendingUser, pendingAccount]);

      expect(queryClient.getQueryData(me.queryKey)).toEqual(nextUser);
      expect(
        queryClient.getQueryData(['account', 'previous-user']),
      ).toBeUndefined();
      expect(queryClient.getQueryData(['public'])).toBe('public-content');
      queryClient.clear();
    },
  );
});
