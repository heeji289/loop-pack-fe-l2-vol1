import type { Metadata } from 'next';

import { OrderNewPage } from '@/_pages/order-new';
import { requireServerSession } from '@/app/server-session';

export const metadata: Metadata = { title: '주문서' };

export default async function OrderNew() {
  // 주문서 데이터는 클라이언트 draft라 선조회가 없고, 제출 API가 요청 시점에 다시 검증한다.
  await requireServerSession('/orders/new');

  return <OrderNewPage />;
}
