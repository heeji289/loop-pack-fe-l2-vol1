// 독립 실행·CLI 테스트용 진입점. Next.js는 config/instrumentation에서 직접 검증한다.
import nextEnv from '@next/env';

import { validateBuildEnv, validateServerEnv } from '../../src/env/validate.ts';

nextEnv.loadEnvConfig(process.cwd(), process.argv.includes('--dev'));

try {
  if (process.argv.includes('--build')) validateBuildEnv();
  else validateServerEnv();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'env 검증 실패');
  process.exitCode = 1;
}
