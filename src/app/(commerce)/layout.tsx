import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { CommerceAnalytics } from '@/analytics/CommerceAnalytics';
import { readServerSession } from '@/app/server-session';
import { CartCount } from '@/entities/cart';
import { sessionQueries } from '@/entities/session';
import { WishlistCount } from '@/entities/wishlist';
import { SessionMenu } from '@/features/auth';
import { makeQueryClient } from '@/shared/query-client';

/**
 * /api/auth/me 대신 쿠키를 직접 검증해 500ms mock 지연 없이 첫 HTML부터 로그인 상태를 그린다.
 * 확인한 사용자를 ['me'] 캐시로 hydration해 클라이언트가 같은 요청을 반복하지 않는다.
 * cookies()를 읽으므로 커머스 화면은 모두 동적 렌더링이 된다.
 */
export default async function CommerceLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await readServerSession();

  const queryClient = makeQueryClient();
  queryClient.setQueryData(sessionQueries.me().queryKey, user);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <CommerceAnalytics initialUserId={user?.id ?? null}>
        <main className="week05-page">
          <header className="week05-header">
            <Link href="/">Commerce</Link>
            <div className="week05-header-actions">
              <nav aria-label="주요 메뉴">
                <Link href="/products">상품</Link>
              </nav>
              <WishlistCount />
              <Link href="/cart">
                <CartCount />
              </Link>
              <SessionMenu />
            </div>
          </header>
          {children}
        </main>
      </CommerceAnalytics>
    </HydrationBoundary>
  );
}
