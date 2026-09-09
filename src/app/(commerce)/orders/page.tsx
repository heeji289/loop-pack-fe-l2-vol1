import type { Metadata } from 'next';
import type { SearchParams } from 'nuqs/server';

import { OrdersPage } from '@/_pages/orders';
import { requireServerSession } from '@/app/server-session';

export const metadata: Metadata = { title: '주문 내역' };

export default async function Orders({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireServerSession('/orders', searchParams);

  return <OrdersPage />;
}
