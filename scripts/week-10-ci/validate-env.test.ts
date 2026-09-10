import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, expect, it } from 'vitest';

// CI가 실제로 호출하는 명령의 종료 코드와 공개 출력을 검증한다.
const SCRIPT_PATH = fileURLToPath(
  new URL('./validate-env.mjs', import.meta.url),
);

// 레포의 .env 파일이 로드되지 않도록 빈 임시 디렉터리에서 실행한다.
const ISOLATED_CWD = mkdtempSync(join(tmpdir(), 'validate-env-'));

afterAll(() => rmSync(ISOLATED_CWD, { recursive: true, force: true }));

const runValidateEnv = (env: Record<string, string>) => {
  const result = spawnSync(process.execPath, [SCRIPT_PATH], {
    cwd: ISOLATED_CWD,
    env: env as NodeJS.ProcessEnv,
    encoding: 'utf8',
  });

  return { status: result.status, output: result.stdout + result.stderr };
};

const VALID_LOCAL = {
  APP_ORIGIN: 'http://localhost:3000',
  AUTH_SESSION_SECRET: 'test-secret',
};

const VALID_PRODUCTION = {
  VERCEL_ENV: 'production',
  APP_ORIGIN: 'https://commerce.example',
  VERCEL_PROJECT_PRODUCTION_URL: 'commerce.example',
  AUTH_SESSION_SECRET: 'test-secret',
};

it.each<[string, Record<string, string>]>([
  [
    '로컬·CI — 데모 시크릿과 정상 공개 변수 허용',
    {
      ...VALID_LOCAL,
      AUTH_SESSION_SECRET: 'loopers-week09-secret',
      NEXT_PUBLIC_FEATURE_FLAG: 'on',
    },
  ],
  ['Production', VALID_PRODUCTION],
  [
    'Preview — origin 설정은 선택',
    { VERCEL_ENV: 'preview', AUTH_SESSION_SECRET: 'test-secret' },
  ],
  [
    'Preview — 자기 배포 주소 origin',
    {
      VERCEL_ENV: 'preview',
      APP_ORIGIN: 'https://pr-1.commerce.vercel.app',
      VERCEL_URL: 'pr-1.commerce.vercel.app',
      AUTH_SESSION_SECRET: 'test-secret',
    },
  ],
])('%s의 정상 설정이면 성공한다', (_, env) => {
  expect(runValidateEnv(env).status).toBe(0);
});

it.each<[string, Record<string, string>, string]>([
  ['origin 누락', { AUTH_SESSION_SECRET: 'test-secret' }, 'APP_ORIGIN'],
  ['origin 공백', { ...VALID_LOCAL, APP_ORIGIN: '   ' }, 'APP_ORIGIN'],
  [
    'origin이 URL 형식이 아님',
    { ...VALID_LOCAL, APP_ORIGIN: 'commerce.example' },
    'APP_ORIGIN',
  ],
  [
    'http·https 외 URL',
    { ...VALID_LOCAL, APP_ORIGIN: 'ftp://commerce.example' },
    'APP_ORIGIN',
  ],
  [
    '시크릿 누락',
    { APP_ORIGIN: VALID_LOCAL.APP_ORIGIN },
    'AUTH_SESSION_SECRET',
  ],
  [
    '비밀 변수 공개 접두 — 빈 값도 금지',
    { ...VALID_LOCAL, NEXT_PUBLIC_AUTH_SESSION_SECRET: '' },
    'NEXT_PUBLIC_AUTH_SESSION_SECRET',
  ],
  [
    'Production origin 누락',
    { VERCEL_ENV: 'production', AUTH_SESSION_SECRET: 'test-secret' },
    'APP_ORIGIN',
  ],
  [
    'Preview origin 형식 오류',
    {
      VERCEL_ENV: 'preview',
      APP_ORIGIN: 'not-a-url',
      AUTH_SESSION_SECRET: 'test-secret',
    },
    'APP_ORIGIN',
  ],
  [
    '배포 데모 시크릿',
    { ...VALID_PRODUCTION, AUTH_SESSION_SECRET: 'loopers-week09-secret' },
    'AUTH_SESSION_SECRET',
  ],
  [
    '배포 시크릿이 [SENSITIVE] 자리표시자',
    { ...VALID_PRODUCTION, AUTH_SESSION_SECRET: '[SENSITIVE]' },
    'AUTH_SESSION_SECRET',
  ],
  [
    'Production origin이 배포 주소와 다름',
    { ...VALID_PRODUCTION, APP_ORIGIN: 'https://other.example' },
    'APP_ORIGIN',
  ],
  // 값이 비노출 단언에 걸리도록 비URL 값을 시크릿 문자열로 준다.
  [
    '배포 origin이 URL 형식이 아님 — 값 비노출',
    { ...VALID_PRODUCTION, APP_ORIGIN: 'test-secret' },
    'APP_ORIGIN',
  ],
  [
    'Production 허용 주소 정보가 없어 대조 불가',
    {
      VERCEL_ENV: 'production',
      APP_ORIGIN: 'https://commerce.example',
      AUTH_SESSION_SECRET: 'test-secret',
    },
    'APP_ORIGIN',
  ],
  [
    'Preview origin이 자기 배포 주소와 다름',
    {
      VERCEL_ENV: 'preview',
      APP_ORIGIN: 'https://commerce.example',
      VERCEL_URL: 'pr-1.commerce.vercel.app',
      AUTH_SESSION_SECRET: 'test-secret',
    },
    'APP_ORIGIN',
  ],
])('%s이면 실패하고 변수명만 출력한다', (_, env, field) => {
  const { status, output } = runValidateEnv(env);

  expect(status).toBe(1);
  expect(output).toContain(field);
  expect(output).not.toContain('test-secret');
  expect(output).not.toContain('loopers-week09-secret');
});
