'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, type SubmitEvent } from 'react';

import { loginMutationOptions } from '../api/mutations';
import { toSafeNextPath } from '../model/login-url';

import {
  identify,
  toLoginFailReason,
  trackEvent,
  type LoginFrom,
} from '@/analytics/events';
import { replaceSessionUser } from '@/entities/session';
import { replaceDocument } from '@/shared/navigation';

export function LoginForm({
  redirectPathAfterLogin,
  from,
}: {
  redirectPathAfterLogin: string | null;
  from: LoginFrom;
}) {
  const queryClient = useQueryClient();

  useEffect(() => {
    trackEvent('login_start', { from });
  }, [from]);

  const { mutate, isPending, error } = useMutation({
    ...loginMutationOptions,
    onSuccess: async ({ user }) => {
      await replaceSessionUser(queryClient, user);
      identify(user.id);
      trackEvent('login_success', { from });
      // 라우터 대신 문서 이동으로 서버가 새 쿠키 기준의 화면을 그리고 이전 캐시가 남지 않게 한다.
      replaceDocument(toSafeNextPath(redirectPathAfterLogin));
    },
    onError: (loginError) => {
      trackEvent('login_fail', { reason: toLoginFailReason(loginError) });
    },
  });

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    const form = new FormData(event.currentTarget);

    mutate({
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
    });
  };

  return (
    <form className="week05-form" aria-label="로그인" onSubmit={handleSubmit}>
      <label>
        이메일
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        비밀번호
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>
      {error && <p role="alert">{error.message}</p>}
      <button type="submit" disabled={isPending}>
        로그인
      </button>
    </form>
  );
}
