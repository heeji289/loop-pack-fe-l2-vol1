// build에 전달될 환경값을 build 시작 전에 검증한다. 실패하면 next build가 실행되지 않는다.
// 앱·클라이언트 코드에서는 import하지 않는다 — 번들 밖(빌드 전 명령)에만 둔다.
// 오류에는 변수명과 이유만 출력하고 값은 출력하지 않는다.
import { appendFileSync } from 'node:fs';

import nextEnv from '@next/env';
import { z } from 'zod';

const { loadEnvConfig } = nextEnv;

// next build와 같은 파일 로딩·우선순위를 재현한다 (셸 env가 .env 파일보다 우선).
loadEnvConfig(process.cwd(), false);

// 환경 구분은 NODE_ENV가 아니라 배포 플랫폼이 주입하는 VERCEL_ENV를 쓴다.
const DEPLOY_TARGETS = ['preview', 'production'];
const target = DEPLOY_TARGETS.includes(process.env.VERCEL_ENV)
  ? process.env.VERCEL_ENV
  : 'local';

// src/app/api/_data/auth.ts의 데모 기본값과 같은 문자열을 유지해야 한다.
const DEMO_SESSION_SECRET = 'loopers-week09-secret';

// 공개 접두(NEXT_PUBLIC_) 변형이 설정되면 안 되는 서버 비밀 변수.
const SERVER_SECRET_NAMES = ['AUTH_SESSION_SECRET', 'VERCEL_TOKEN'];

// 변수별 규칙 조각.
const requiredValue = z.string('누락').trim().min(1, '공백');
const httpOrigin = requiredValue.pipe(
  z.url({ protocol: /^https?$/, error: 'http·https URL이 아니다' }),
);
const deploySecret = requiredValue
  .refine(
    (value) => value !== DEMO_SESSION_SECRET,
    '배포 환경에서 데모 기본값을 사용했다',
  )
  // vercel pull이 Sensitive 값을 내려받지 못하면 자리표시자를 남긴다 — 실제 값 검증 불가로 실패시킨다.
  .refine(
    (value) => value !== '[SENSITIVE]',
    'Sensitive 자리표시자 — 실제 값을 검증할 수 없다',
  );

// 배포 origin은 형식에 더해 해당 환경의 Vercel 주소와 대조한다 — 다른 환경 주소 오설정 차단.
const deployOrigin = (allowedHostVars) =>
  httpOrigin.superRefine((value, ctx) => {
    // 형식 검사가 실패해도 refinement는 실행된다 — 비URL 값은 앞의 검사가 이미 보고했다.
    let host;
    try {
      host = new URL(value).host;
    } catch {
      return;
    }
    const allowedHosts = allowedHostVars
      .map((name) => process.env[name])
      .filter(Boolean);
    if (allowedHosts.length === 0) {
      ctx.addIssue({
        code: 'custom',
        message: `허용 주소(${allowedHostVars.join('·')})가 없어 대조할 수 없다`,
      });
    } else if (!allowedHosts.includes(host)) {
      ctx.addIssue({ code: 'custom', message: '이 환경의 배포 주소와 다르다' });
    }
  });

// 서버 비밀 변수의 공개 접두 변형은 빈 값이어도 거부한다.
const publicVariantRules = Object.fromEntries(
  SERVER_SECRET_NAMES.map((name) => [
    `NEXT_PUBLIC_${name}`,
    z.never('서버 비밀 변수의 공개 접두 변형 — 빈 값이어도 금지').optional(),
  ]),
);

const ENV_SCHEMAS = {
  local: z.looseObject({
    APP_ORIGIN: httpOrigin,
    AUTH_SESSION_SECRET: requiredValue,
    ...publicVariantRules,
  }),
  // Preview는 배포마다 주소가 달라 origin 설정이 선택이다 — 없으면 서버 prefetch가
  // 빠져 서버 렌더 문구가 비는 것을 감수한다. 설정했다면 자기 배포 주소와 일치해야 한다.
  preview: z.looseObject({
    APP_ORIGIN: deployOrigin(['VERCEL_URL', 'VERCEL_BRANCH_URL']).optional(),
    AUTH_SESSION_SECRET: deploySecret,
    ...publicVariantRules,
  }),
  production: z.looseObject({
    APP_ORIGIN: deployOrigin(['VERCEL_PROJECT_PRODUCTION_URL']),
    AUTH_SESSION_SECRET: deploySecret,
    ...publicVariantRules,
  }),
};

const result = ENV_SCHEMAS[target].safeParse(process.env);

if (!result.success) {
  const problems = result.error.issues.map((i) => ({
    name: String(i.path[0] ?? 'env'),
    reason: i.message,
  }));
  const lines = problems.map((p) => `- \`${p.name}\`: ${p.reason}`).join('\n');
  const summary = `## env 검증: FAIL (${target})\n\n${lines}\n`;
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  }
  console.error(
    `::error::env 검증 실패(${target}) — ${problems
      .map((p) => `${p.name}: ${p.reason}`)
      .join('; ')}`,
  );
  console.error(summary);
  process.exit(1);
}

const summary = `## env 검증: PASS (${target})\n`;
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
}
console.log(summary.trim());
