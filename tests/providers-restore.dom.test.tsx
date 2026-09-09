import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { CartPage } from '@/_pages/cart';
import Providers from '@/app/providers';
import { getQueryClient } from '@/app/query-client';
import { CART_STORAGE_KEY } from '@/entities/cart/model/cart-store';
import { sessionQueries } from '@/entities/session';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/cart',
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * 화면 테스트들은 rehydrate를 직접 부르므로 Providers의 복원 시작 연결이 빠져도 통과한다.
 * 이 연결은 아직 아무도 복원을 부르지 않은 모듈에서만 검증할 수 있어 파일을 따로 둔다.
 */
it('Providers가 저장된 장바구니의 복원을 시작한다', async () => {
  localStorage.setItem(
    CART_STORAGE_KEY,
    JSON.stringify({
      state: { items: [{ productId: 'p9', quantity: 1, checked: true }] },
      version: 2,
    }),
  );

  // 서버 layout의 hydration을 대신해 비로그인 사용자를 시드한다 (/me 네트워크 요청 방지)
  getQueryClient().setQueryData(sessionQueries.me().queryKey, null);

  render(
    <Providers>
      <CartPage />
    </Providers>,
  );

  expect(await screen.findByRole('checkbox', { name: 'p9' })).toBeChecked();
  expect(screen.queryByText('장바구니를 불러오는 중')).not.toBeInTheDocument();
});
