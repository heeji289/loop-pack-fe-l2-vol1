import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { readSessionToken } from '@/app/api/_data/auth';
import { SCENARIO_COOKIE, SESSION_COOKIE } from '@/app/api/_data/auth-cookies';
import type { SessionUser } from '@/entities/session';
import { buildExpiredLoginUrl } from '@/features/auth';

/**
 * 현재 요청의 세션 사용자. 첫 HTML도 /api/auth/me와 같은 판정이 되도록
 * 테스트용 만료 시나리오 쿠키(scenario=expired)를 API와 동일하게 해석한다.
 */
export async function readServerSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();

  if (cookieStore.get(SCENARIO_COOKIE)?.value === 'expired') return null;

  return readSessionToken(cookieStore.get(SESSION_COOKIE)?.value);
}

/**
 * 보호 서버 페이지 검사. proxy의 조기 검사와 별개로 렌더 시점에 다시 확인한다.
 * 비로그인 직접 진입은 proxy가 먼저 거르므로 여기 걸리는 건 만료가 대부분이다.
 */
export async function requireServerSession(
  currentPath: string,
): Promise<SessionUser> {
  const user = await readServerSession();

  if (!user) {
    redirect(buildExpiredLoginUrl(currentPath));
  }

  return user;
}
