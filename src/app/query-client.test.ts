import { environmentManager } from '@tanstack/react-query';
import { beforeEach, describe, expect, it } from 'vitest';

import { getQueryClient } from './query-client';

import { sessionQueries } from '@/entities/session';
import { SESSION_USER } from '@tests/msw/fixtures';

beforeEach(() => {
  environmentManager.setIsServer(() => true);
});

describe('서버 QueryClient 격리', () => {
  it('호출마다 새 QueryClient를 만들어 요청 간 사용자 캐시를 공유하지 않는다', () => {
    const firstRequestClient = getQueryClient();

    firstRequestClient.setQueryData(sessionQueries.me().queryKey, SESSION_USER);

    const secondRequestClient = getQueryClient();

    expect(secondRequestClient).not.toBe(firstRequestClient);
    expect(
      secondRequestClient.getQueryData(sessionQueries.me().queryKey),
    ).toBeUndefined();
  });
});
