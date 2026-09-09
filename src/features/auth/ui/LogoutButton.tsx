'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { logoutMutationOptions } from '../api/mutations';

import { reset } from '@/analytics/events';
import { useCheckoutActions } from '@/entities/order';
import { replaceSessionUser } from '@/entities/session';
import { replaceDocument } from '@/shared/navigation';

export function LogoutButton() {
  const queryClient = useQueryClient();

  const { clearCheckoutDraft } = useCheckoutActions();
  const { mutate, isPending, error } = useMutation({
    ...logoutMutationOptions,
    onSuccess: async () => {
      // 장바구니·위시리스트는 브라우저가 유일한 원본이라 두고, 계정 범위 상태만 정리한다
      clearCheckoutDraft();
      await replaceSessionUser(queryClient, null);
      reset();

      // 문서 이동으로 서버가 쿠키 없는 화면을 새로 그리고 이전 캐시가 남지 않게 한다.
      replaceDocument('/');
    },
  });

  return (
    <>
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          mutate();
        }}
      >
        로그아웃
      </button>
      {error && <p role="alert">{error.message}</p>}
    </>
  );
}
