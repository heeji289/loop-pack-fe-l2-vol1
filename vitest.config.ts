import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';

/**
 * 환경은 파일 이름이 정한다. `*.dom.test.*`만 jsdom, 나머지는 node.
 * 확장자는 문법(JSX 유무)만 뜻한다.
 *
 * unit/integration은 책임이 정한다.
 * 화면·상태·API 등 여러 부분의 연결 동작만 여기 열거하고, 나머지 전부
 * (순수 계산·단일 모듈 계약·새로 추가되는 테스트)는 unit이다 —
 * 애매한 파일이 "변경 관련일 때만 실행"으로 새지 않도록 항상 실행되는 unit이 기본값.
 * CI의 PR 검증은 unit 전체 + 변경 관련 integration만 돌린다
 * (scripts/week-10-ci/related-integration.mjs).
 */
const INTEGRATION_NODE_TESTS = [
  'tests/**/*.test.{ts,tsx}',
  'src/_pages/**/*.test.{ts,tsx}',
  'src/app/api/**/route.test.ts',
];

const INTEGRATION_DOM_TESTS = [
  'tests/**/*.dom.test.{ts,tsx}',
  'src/_pages/**/*.dom.test.{ts,tsx}',
  'src/entities/**/*-store.dom.test.ts',
  // features는 unit성 hook 테스트도 섞이는 레이어라 폴더 glob 대신 파일을 열거한다
  // — 새 테스트가 조건부 실행 집합으로 새지 않고 unit(항상 실행)에 남게.
  'src/features/auth/ui/LoginForm.dom.test.tsx',
  'src/features/auth/ui/LogoutButton.dom.test.tsx',
  'src/features/product/model/search-params.dom.test.tsx',
];

const INTEGRATION_TESTS = [...INTEGRATION_NODE_TESTS, ...INTEGRATION_DOM_TESTS];

const NODE_SETUP = ['./vitest.msw.setup.ts'];
const JSDOM_SETUP = ['./vitest.msw.setup.ts', './vitest.setup.ts'];

export default defineConfig({
  plugins: [react()],
  resolve: {
    // tsconfig의 "@/*" -> "./src/*" 별칭을 Vitest에도 동일하게 적용
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@tests': fileURLToPath(new URL('./tests', import.meta.url)),
    },
  },
  test: {
    restoreMocks: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit-node',
          environment: 'node',
          setupFiles: NODE_SETUP,
          include: ['{src,tests}/**/*.test.{ts,tsx}'],
          exclude: [
            ...configDefaults.exclude,
            '**/*.dom.test.*',
            ...INTEGRATION_TESTS,
          ],
        },
      },
      {
        extends: true,
        test: {
          name: 'unit-jsdom',
          environment: 'jsdom',
          setupFiles: JSDOM_SETUP,
          include: ['{src,tests}/**/*.dom.test.{ts,tsx}'],
          exclude: [...configDefaults.exclude, ...INTEGRATION_TESTS],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration-node',
          environment: 'node',
          setupFiles: NODE_SETUP,
          include: INTEGRATION_NODE_TESTS,
          exclude: [...configDefaults.exclude, '**/*.dom.test.*'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration-jsdom',
          environment: 'jsdom',
          setupFiles: JSDOM_SETUP,
          include: INTEGRATION_DOM_TESTS,
          exclude: [...configDefaults.exclude],
        },
      },
    ],
  },
});
