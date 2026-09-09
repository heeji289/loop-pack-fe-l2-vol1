import { environmentManager } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from './api-client';
import { makeQueryClient } from './query-client';

describe('기본 QueryClient 생성 정책', () => {
  it('서버에서는 실패한 query를 재시도하지 않는다', async () => {
    environmentManager.setIsServer(() => true);
    const queryFn = vi.fn().mockRejectedValue(new Error('조회 실패'));

    await expect(
      makeQueryClient().fetchQuery({
        queryKey: ['server-query'],
        queryFn,
        retryDelay: 0,
      }),
    ).rejects.toThrow('조회 실패');
    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it('브라우저에서도 401은 다시 로그인하기 전엔 같으므로 재시도하지 않는다', async () => {
    environmentManager.setIsServer(() => false);
    const queryFn = vi
      .fn()
      .mockRejectedValue(new ApiError(401, '로그인이 필요합니다.'));

    await expect(
      makeQueryClient().fetchQuery({
        queryKey: ['protected-query'],
        queryFn,
        retryDelay: 0,
      }),
    ).rejects.toThrow('로그인이 필요합니다.');
    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it('브라우저의 401이 아닌 실패는 2회 재시도한다', async () => {
    environmentManager.setIsServer(() => false);
    const queryFn = vi
      .fn()
      .mockRejectedValue(new ApiError(500, '요청에 실패했습니다.'));

    await expect(
      makeQueryClient().fetchQuery({
        queryKey: ['flaky-query'],
        queryFn,
        retryDelay: 0,
      }),
    ).rejects.toThrow('요청에 실패했습니다.');
    expect(queryFn).toHaveBeenCalledTimes(3);
  });
});
