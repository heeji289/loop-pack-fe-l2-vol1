'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

import { LOGIN_PATH } from '../model/login-url';

import { LogoutButton } from './LogoutButton';

import { sessionQueries } from '@/entities/session';

export function SessionMenu() {
  const {
    data: user,
    isPending,
    isError,
    refetch,
  } = useQuery(sessionQueries.me());

  // 재조회가 실패해도 캐시에 남은 사용자를 지우지 않고 로그인 상태로 그린다.
  if (user) {
    return (
      <>
        <Link href="/my">{user.name}</Link>
        <LogoutButton />
      </>
    );
  }

  // 서버 layout이 ['me']를 채워줘 보통 오지 않는다. 캐시가 비워진 극단 상황의 자리 표시다.
  if (isPending) return null;

  if (isError) {
    return (
      <button
        type="button"
        onClick={() => {
          void refetch();
        }}
      >
        로그인 확인 다시 시도
      </button>
    );
  }

  return <Link href={LOGIN_PATH}>로그인</Link>;
}
