import type { Metadata } from 'next';

import { OrdersPage } from '@/_pages/orders';
import { requireServerSession } from '@/app/server-session';

export const metadata: Metadata = { title: '주문 내역' };

export default async function Orders() {
  await requireServerSession('/orders');

  return <OrdersPage />;
}
