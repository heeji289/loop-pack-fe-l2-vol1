import { mutationOptions } from '@tanstack/react-query';

import { login, logout } from './auth';

// 로그인 401은 세션 만료가 아니라 폼에서 보여줄 자격 증명 오류다.
// requiresAuth를 붙이지 않아 앱의 만료 공통 처리 대상에서 빠진다.
export const loginMutationOptions = mutationOptions({ mutationFn: login });

export const logoutMutationOptions = mutationOptions({ mutationFn: logout });
