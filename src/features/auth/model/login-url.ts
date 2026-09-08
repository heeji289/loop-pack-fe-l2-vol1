export const LOGIN_PATH = '/login';

export const LOGIN_REASONS = ['expired'] as const;

export type LoginReason = (typeof LOGIN_REASONS)[number];

export const LOGIN_REASON_MESSAGE: Record<LoginReason, string> = {
  expired: '세션이 만료되었습니다. 다시 로그인해주세요.',
};

/**
 * 로그인이 필요한 모든 진입점이 같은 규칙으로 돌아갈 경로를 next에 싣는다.
 * 만료는 reason으로 구분해 로그인 화면이 안내를 띄우고,
 * from은 로그인 화면에 들어온 출처로 login_start·login_success 계측에 쓴다.
 */
export function buildLoginUrl(
  next: string,
  options: { from: string; reason?: LoginReason },
) {
  const params = new URLSearchParams({
    next,
    ...(options.reason ? { reason: options.reason } : {}),
    from: options.from,
  });

  return `${LOGIN_PATH}?${params}`;
}

/**
 * 만료로 쫓겨난 화면이 직전 경로와 이유를 담아 돌아올 로그인 URL.
 * 서버 페이지 검사와 앱의 401 공통 처리가 같은 규칙을 쓴다.
 */
export function buildExpiredLoginUrl(pathname: string, search = '') {
  return buildLoginUrl(pathname + search, {
    reason: 'expired',
    from: pathname.split('/')[1] || 'direct',
  });
}

/**
 * 세션이 끊기면 로그인으로 보내는 보호 화면. proxy matcher는 빌드 시 정적 분석되어
 * 이 함수를 가져다 쓸 수 없으므로, src/proxy.ts의 리터럴과 같은 기준을 수동으로 맞춘다.
 */
export function isProtectedPath(pathname: string) {
  return pathname === '/orders' || pathname.startsWith('/orders/');
}

const VALIDATION_ORIGIN = 'https://app.invalid';

/**
 * next는 URL에 노출돼 누구나 바꿀 수 있다. 같은 origin 경로만 허용하고 나머지는 홈으로 보낸다.
 */
export function toSafeNextPath(next: string | null | undefined) {
  if (!next?.startsWith('/')) return '/';

  try {
    const url = new URL(next, VALIDATION_ORIGIN);
    const path = `${url.pathname}${url.search}${url.hash}`;

    return url.origin === VALIDATION_ORIGIN && !path.startsWith('//')
      ? path
      : '/';
  } catch {
    return '/';
  }
}
