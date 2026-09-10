import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, expect, it } from 'vitest';

// config/instrumentation이 쓰는 검증 함수를 독립 CLI에서 실행해 종료 코드·값 비노출을 확인한다.
const SCRIPT_PATH = fileURLToPath(
  new URL('./validate-env.mjs', import.meta.url),
);

// 레포의 .env 파일이 로드되지 않도록 빈 임시 디렉터리에서 실행한다.
const ISOLATED_CWD = mkdtempSync(join(tmpdir(), 'validate-env-'));

afterAll(() => rmSync(ISOLATED_CWD, { recursive: true, force: true }));

const runValidateEnv = (
  env: Record<string, string>,
  { args = [] as string[], cwd = ISOLATED_CWD } = {},
) => {
  const result = spawnSync(process.execPath, [SCRIPT_PATH, ...args], {
    cwd,
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
    '시크릿 공백',
    { ...VALID_LOCAL, AUTH_SESSION_SECRET: '   ' },
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

// dev 서버(next dev)는 .env.development*까지 읽으므로 --dev 검증도 같은 파일을 봐야 한다.
const DEV_ENV_CWD = mkdtempSync(join(tmpdir(), 'validate-env-dev-'));

writeFileSync(
  join(DEV_ENV_CWD, '.env.development'),
  'NEXT_PUBLIC_AUTH_SESSION_SECRET=dev-file-value\n',
);
afterAll(() => rmSync(DEV_ENV_CWD, { recursive: true, force: true }));

it('--dev면 .env.development의 오류값을 읽어 실패한다', () => {
  const { status, output } = runValidateEnv(VALID_LOCAL, {
    args: ['--dev'],
    cwd: DEV_ENV_CWD,
  });

  expect(status).toBe(1);
  expect(output).toContain('NEXT_PUBLIC_AUTH_SESSION_SECRET');
  expect(output).not.toContain('dev-file-value');
});

it('--dev가 아니면 .env.development를 읽지 않는다', () => {
  const { status } = runValidateEnv(VALID_LOCAL, { cwd: DEV_ENV_CWD });

  expect(status).toBe(0);
});

it('빌드 검증은 런타임 전용 시크릿 없이 통과한다', () => {
  const { status } = runValidateEnv(
    { APP_ORIGIN: VALID_LOCAL.APP_ORIGIN },
    { args: ['--build'] },
  );

  expect(status).toBe(0);
});

it('빌드 검증도 잘못된 origin과 비밀 공개 변수를 거부한다', () => {
  const { status, output } = runValidateEnv(
    {
      APP_ORIGIN: 'ftp://commerce.example',
      NEXT_PUBLIC_AUTH_SESSION_SECRET: 'test-secret',
    },
    { args: ['--build'] },
  );

  expect(status).toBe(1);
  expect(output).toContain('APP_ORIGIN');
  expect(output).toContain('NEXT_PUBLIC_AUTH_SESSION_SECRET');
  expect(output).not.toContain('test-secret');
});

it('배포 빌드도 런타임 인증값 없이 통과한다', () => {
  const { status } = runValidateEnv(
    {
      VERCEL_ENV: 'production',
      APP_ORIGIN: VALID_PRODUCTION.APP_ORIGIN,
      VERCEL_PROJECT_PRODUCTION_URL:
        VALID_PRODUCTION.VERCEL_PROJECT_PRODUCTION_URL,
    },
    { args: ['--build'] },
  );

  expect(status).toBe(0);
});

it('import에는 env가 필요 없고 호출 시점의 서버 env를 검증한다', () => {
  const moduleUrl = new URL('../../src/env/validate.ts', import.meta.url).href;
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `const { validateServerEnv } = await import(${JSON.stringify(moduleUrl)});
     process.env.APP_ORIGIN = 'http://localhost:3000';
     process.env.AUTH_SESSION_SECRET = 'test-secret';
     validateServerEnv();
     process.env.AUTH_SESSION_SECRET = '   ';
     validateServerEnv();`,
    ],
    { cwd: ISOLATED_CWD, env: { NODE_ENV: 'test' }, encoding: 'utf8' },
  );

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('AUTH_SESSION_SECRET: 공백');
  expect(result.stderr).not.toContain('APP_ORIGIN: 누락');
});
