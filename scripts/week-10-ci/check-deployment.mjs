import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function assertDeploymentResponse(body, status) {
  assert.equal(status, 401, '후보 인증 API가 기대한 HTTP 401이 아니다');
  let response;
  try {
    response = JSON.parse(body);
  } catch {
    throw new Error(
      '후보 응답이 JSON이 아니다 — 배포 보호 페이지도 성공으로 인정하지 않는다',
    );
  }
  assert.deepEqual(
    response,
    { message: '로그인이 필요합니다.' },
    '후보 응답이 앱의 비로그인 응답이 아니다',
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const deployment = new URL(process.argv[2]);
    assert.equal(deployment.protocol, 'https:');
    assert.equal(deployment.hostname.endsWith('.vercel.app'), true);
    assert.equal(deployment.href, `${deployment.origin}/`);
    const result = spawnSync(
      'pnpm',
      [
        'dlx',
        process.env.VERCEL_CLI ?? 'vercel@59.14.0',
        'curl',
        '/api/auth/me',
        '--deployment',
        deployment.origin,
        '--yes',
        ...(process.env.VERCEL_TOKEN
          ? ['--token', process.env.VERCEL_TOKEN]
          : []),
        '--',
        '--silent',
        '--show-error',
        '--max-time',
        '30',
        '--write-out',
        '\n%{http_code}',
      ],
      { encoding: 'utf8', timeout: 60_000 },
    );
    if (result.error || result.status !== 0) {
      throw new Error(
        '후보 API 요청 실패 — 네트워크·인증·CLI 실행 로그를 확인한다',
      );
    }
    const separator = result.stdout.lastIndexOf('\n');
    assertDeploymentResponse(
      result.stdout.slice(0, separator),
      Number(result.stdout.slice(separator + 1)),
    );
    const summary = `## 배포 후보 검증: PASS\n\n${deployment.origin}의 동적 인증 API HTTP 401·본문 확인.\n`;
    console.log(summary);
    if (process.env.GITHUB_STEP_SUMMARY)
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : '배포 후보 검증 실패',
    );
    if (process.env.GITHUB_STEP_SUMMARY)
      appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        '## 배포 후보 검증: FAIL\n\n승격하지 않는다.\n',
      );
    process.exitCode = 1;
  }
}
