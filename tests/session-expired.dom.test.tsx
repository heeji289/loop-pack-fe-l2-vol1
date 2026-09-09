import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  initAnalytics,
  registerProviders,
  resetAnalyticsForTest,
} from '@/analytics/logger';
import type { AnalyticsProvider } from '@/analytics/provider';
import { makeAppQueryClient } from '@/app/query-client';
import { useCartStore } from '@/entities/cart/model/cart-store';
import {
  orderQueries,
  type OrderCreateResponse,
  type OrderListResponse,
} from '@/entities/order';
import { useCheckoutStore } from '@/entities/order/model/checkout-store';
import { productQueries } from '@/entities/product';
import { replaceSessionUser, sessionQueries } from '@/entities/session';
import { LoginForm, type SessionResponse } from '@/features/auth';
import { OrderForm } from '@/features/order';
import { PRODUCT, SESSION_PASSWORD, SESSION_USER } from '@tests/msw/fixtures';
import { server } from '@tests/msw/server';
import { renderWithProviders } from '@tests/render-with-providers';

const { replaceDocument, routerReplace } = vi.hoisted(() => ({
  replaceDocument: vi.fn<(url: string) => void>(),
  routerReplace: vi.fn<(url: string) => void>(),
}));

// jsdom은 실제 문서 이동을 구현하지 않아 이동 지점만 mock으로 받는다.
vi.mock('@/shared/navigation', () => ({ replaceDocument }));

// OrderForm이 주문 성공 시 쓰는 라우터. 진짜 라우터가 없는 jsdom에서만 빈 구현을 준다.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplace }),
}));

// 중복 이동 방지 플래그가 client 수명을 따르므로, 새 문서처럼 테스트마다 client를 새로 만든다.
const makeNewDocumentClient = () => makeAppQueryClient();

const meQueryKey = sessionQueries.me().queryKey;
const userOrderQuery = orderQueries.list(SESSION_USER.id);

const USER_ORDERS: OrderListResponse = {
  orders: [
    {
      id: 'o1',
      createdAt: '2026-09-01T09:00:00.000Z',
      items: [{ productId: 'p1', quantity: 2 }],
    },
  ],
};

/** 실제 fetch 경로로 캐시를 만들어 화면과 같은 query(메타 포함)가 생기게 한다. */
const seedLoggedInCaches = async (
  queryClient: ReturnType<typeof makeNewDocumentClient>,
) => {
  server.use(
    http.get('*/api/auth/me', () =>
      HttpResponse.json<SessionResponse>({ user: SESSION_USER }),
    ),
    http.get('*/api/orders', () => HttpResponse.json(USER_ORDERS)),
  );
  await queryClient.fetchQuery({ ...sessionQueries.me(), staleTime: 0 });
  await queryClient.fetchQuery(userOrderQuery);
  queryClient.setQueryData(productQueries.all(), 'public-products');
  useCheckoutStore.setState({ draftItems: [{ productId: 'p1', quantity: 2 }] });
};

/** 이후의 인증 요청이 모두 401을 받는 만료 상태 */
const expireSession = () => {
  server.use(
    http.get('*/api/auth/me', () =>
      HttpResponse.json({ message: '로그인이 필요합니다.' }, { status: 401 }),
    ),
    http.get('*/api/orders', () =>
      HttpResponse.json({ message: '로그인이 필요합니다.' }, { status: 401 }),
    ),
  );
};

const visit = (path: string) => {
  window.history.replaceState(null, '', path);
};

afterEach(() => {
  window.history.replaceState(null, '', '/');
  // 분석 로거의 provider·큐도 모듈 상태라 테스트 간에 넘어가지 않게 비운다
  resetAnalyticsForTest();
  vi.clearAllMocks();
});

describe('보호 화면의 세션 만료', () => {
  it('주문 재조회 401이면 계정 상태만 정리하고 직전 경로·이유를 담아 로그인 문서로 이동한다', async () => {
    visit('/orders?status=pending');
    const queryClient = makeNewDocumentClient();
    await seedLoggedInCaches(queryClient);

    expireSession();
    await queryClient.refetchQueries({ queryKey: orderQueries.all() });

    await waitFor(() => {
      expect(queryClient.getQueryData(meQueryKey)).toBeNull();
    });
    expect(queryClient.getQueryData(userOrderQuery.queryKey)).toBeUndefined();
    expect(queryClient.getQueryData(productQueries.all())).toBe(
      'public-products',
    );
    // 재로그인 후 직전 작업을 복원해야 하므로 checkout draft는 만료 정리에서 제외한다
    expect(useCheckoutStore.getState().draftItems).toEqual([
      { productId: 'p1', quantity: 2 },
    ]);

    expect(replaceDocument).toHaveBeenCalledTimes(1);
    const loginUrl = new URL(
      replaceDocument.mock.calls[0][0],
      'http://localhost',
    );
    expect(loginUrl.pathname).toBe('/login');
    expect(loginUrl.searchParams.get('reason')).toBe('expired');
    expect(loginUrl.searchParams.get('from')).toBe('orders');
    expect(loginUrl.searchParams.get('next')).toBe('/orders?status=pending');
  });

  it('여러 401이 겹쳐도 로그인 이동은 한 번만 한다', async () => {
    visit('/orders');
    const queryClient = makeNewDocumentClient();
    await seedLoggedInCaches(queryClient);

    expireSession();
    // 주문 401(onError)과 /me의 null 성공(onSuccess)이 같은 만료를 동시에 알린다
    await Promise.all([
      queryClient.refetchQueries({ queryKey: orderQueries.all() }),
      queryClient.refetchQueries({ queryKey: meQueryKey }),
    ]);

    await waitFor(() => {
      expect(replaceDocument).toHaveBeenCalledTimes(1);
    });
  });

  it('재로그인으로 문서가 바뀌면(새 client) 다음 만료를 다시 처리한다', async () => {
    visit('/orders');
    const firstDocumentClient = makeNewDocumentClient();

    await seedLoggedInCaches(firstDocumentClient);
    expireSession();
    await firstDocumentClient.refetchQueries({ queryKey: orderQueries.all() });

    await waitFor(() => {
      expect(replaceDocument).toHaveBeenCalledTimes(1);
    });

    // 재로그인은 문서 이동이라 client가 새로 만들어진다
    const nextDocumentClient = makeNewDocumentClient();

    await seedLoggedInCaches(nextDocumentClient);
    expireSession();
    await nextDocumentClient.refetchQueries({ queryKey: orderQueries.all() });

    await waitFor(() => {
      expect(replaceDocument).toHaveBeenCalledTimes(2);
    });
  });

  it('주문 생성이 401이면 만료로 처리해 계정 캐시를 정리하고 로그인 문서로 이동한다', async () => {
    visit('/orders/new');
    const queryClient = makeNewDocumentClient();
    await seedLoggedInCaches(queryClient);

    server.use(
      http.post('*/api/orders', () =>
        HttpResponse.json({ message: '로그인이 필요합니다.' }, { status: 401 }),
      ),
    );
    const { user } = renderWithProviders(
      <OrderForm
        orderProducts={[
          { productId: PRODUCT.id, quantity: 1, product: PRODUCT },
        ]}
        totalPrice={PRODUCT.price}
      />,
      { queryClient, initialUser: SESSION_USER },
    );

    await user.click(screen.getByRole('button', { name: '주문하기' }));

    await waitFor(() => {
      expect(queryClient.getQueryData(meQueryKey)).toBeNull();
    });
    expect(queryClient.getQueryData(userOrderQuery.queryKey)).toBeUndefined();
    expect(replaceDocument).toHaveBeenCalledTimes(1);
    const loginUrl = new URL(
      replaceDocument.mock.calls[0][0],
      'http://localhost',
    );
    expect(loginUrl.pathname).toBe('/login');
    expect(loginUrl.searchParams.get('reason')).toBe('expired');
    expect(loginUrl.searchParams.get('next')).toBe('/orders/new');
  });
});

describe('공개 화면의 세션 만료', () => {
  it('공개 화면에서 만료를 처리한 뒤 다시 확인된 세션의 다음 만료도 정리한다', async () => {
    visit('/products');
    const queryClient = makeNewDocumentClient();

    for (let attempt = 0; attempt < 2; attempt++) {
      await seedLoggedInCaches(queryClient);
      expect(queryClient.getQueryData(meQueryKey)).toEqual(SESSION_USER);
      expireSession();
      await queryClient.refetchQueries({ queryKey: orderQueries.all() });
      await waitFor(() => {
        expect(queryClient.getQueryData(meQueryKey)).toBeNull();
      });
      expect(queryClient.getQueryData(userOrderQuery.queryKey)).toBeUndefined();
    }

    expect(replaceDocument).not.toHaveBeenCalled();
  });

  it('/me가 401이면 오류 없이 null 사용자로 남고 화면을 이동하지 않는다', async () => {
    visit('/products');
    const queryClient = makeNewDocumentClient();
    await seedLoggedInCaches(queryClient);

    expireSession();
    const user = await queryClient.fetchQuery({
      ...sessionQueries.me(),
      staleTime: 0,
    });

    expect(user).toBeNull();
    // 사용자·계정 조회 취소와 계정 캐시 정리가 끝난 뒤 ['me']에 null을 기록한다.
    await waitFor(() => {
      expect(queryClient.getQueryData(meQueryKey)).toBeNull();
    });
    expect(queryClient.getQueryData(userOrderQuery.queryKey)).toBeUndefined();
    expect(replaceDocument).not.toHaveBeenCalled();
  });

  it('로그인 화면에 늦게 도착한 401은 정리만 하고 next를 로그인 URL로 덮지 않는다', async () => {
    visit('/login?next=%2Forders');
    const queryClient = makeNewDocumentClient();
    await seedLoggedInCaches(queryClient);

    expireSession();
    await queryClient.refetchQueries({ queryKey: orderQueries.all() });

    await waitFor(() => {
      expect(queryClient.getQueryData(meQueryKey)).toBeNull();
    });
    expect(replaceDocument).not.toHaveBeenCalled();
  });
});

describe('만료가 아닌 실패', () => {
  it('로그인 401은 만료로 처리하지 않아 폼 오류만 남기고 계정 캐시와 화면을 유지한다', async () => {
    visit('/login?next=%2Forders');
    const queryClient = makeNewDocumentClient();
    // 다른 계정으로 로그인 시도 중이어도 기존 계정 상태를 전역에서 초기화하지 않는다
    await seedLoggedInCaches(queryClient);

    server.use(
      http.post('*/api/auth/login', () =>
        HttpResponse.json(
          { message: '이메일 또는 비밀번호를 확인해주세요.' },
          { status: 401 },
        ),
      ),
    );
    const { user } = renderWithProviders(
      <LoginForm redirectPathAfterLogin="/orders" from="direct" />,
      { queryClient, initialUser: SESSION_USER },
    );

    await user.type(screen.getByLabelText('이메일'), SESSION_USER.email);
    await user.type(screen.getByLabelText('비밀번호'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: '로그인' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '이메일 또는 비밀번호를 확인해주세요.',
    );
    expect(queryClient.getQueryData(meQueryKey)).toEqual(SESSION_USER);
    expect(queryClient.getQueryData(userOrderQuery.queryKey)).toEqual(
      USER_ORDERS,
    );
    expect(replaceDocument).not.toHaveBeenCalled();
  });

  it('/me의 500은 기존 사용자 캐시와 계정 캐시를 유지한다', async () => {
    visit('/my');
    const queryClient = makeNewDocumentClient();
    await seedLoggedInCaches(queryClient);

    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json(
          { message: '세션을 확인하지 못했습니다.' },
          { status: 500 },
        ),
      ),
    );

    await expect(
      queryClient.fetchQuery({
        ...sessionQueries.me(),
        staleTime: 0,
        retryDelay: 0,
      }),
    ).rejects.toThrow('세션을 확인하지 못했습니다.');

    expect(queryClient.getQueryData(meQueryKey)).toEqual(SESSION_USER);
    expect(queryClient.getQueryData(userOrderQuery.queryKey)).toEqual(
      USER_ORDERS,
    );
    expect(replaceDocument).not.toHaveBeenCalled();
  });
});

describe('세션 재확인과 분석 식별', () => {
  it('다른 계정의 세션이 확인되면 분석 식별을 새 계정으로 갱신하고, 같은 계정 재확인은 반복하지 않는다', async () => {
    visit('/products');
    const queryClient = makeNewDocumentClient();

    // 앱 모듈은 mock하지 않는다. 실제 로거에 기록용 provider를 등록해 식별 호출을 관찰한다.
    const identifiedUserIds: string[] = [];
    const recordingProvider: AnalyticsProvider = {
      name: 'test-recorder',
      initialize: () => {},
      track: () => {},
      identify: (userId) => {
        identifiedUserIds.push(userId);
      },
      reset: () => {},
    };

    // 앞 테스트들이 큐에 쌓은 이벤트가 초기화 시점에 흘러들지 않게 비우고 시작한다
    resetAnalyticsForTest();
    registerProviders([recordingProvider]);
    await initAnalytics();

    await seedLoggedInCaches(queryClient);
    // 첫 확인(u1)의 식별은 관찰 대상이 아니다
    identifiedUserIds.length = 0;

    // 다른 탭의 계정 전환처럼 /me가 다른 계정을 반환한다
    const otherUser = { id: 'u2', name: '루퍼2', email: 'looper2@loopers.dev' };

    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json<SessionResponse>({ user: otherUser }),
      ),
    );
    await queryClient.fetchQuery({ ...sessionQueries.me(), staleTime: 0 });

    expect(identifiedUserIds).toEqual(['u2']);

    // 같은 계정의 재확인은 식별을 다시 보내지 않는다
    await queryClient.fetchQuery({ ...sessionQueries.me(), staleTime: 0 });

    expect(identifiedUserIds).toEqual(['u2']);
  });
});

describe('만료 정리와 늦은 응답', () => {
  it.each([
    {
      scenario: 'active',
      name: '정상 주문 성공은 상품·draft를 정리하고 주문 내역으로 이동한다',
      expectedUser: SESSION_USER,
      expectedOrders: USER_ORDERS,
      expectedRouterCalls: [['/orders']],
      expectedDocumentCalls: 0,
    },
    {
      scenario: 'expired',
      name: '만료 뒤 늦은 주문 성공은 상품·draft만 정리하고 로그인 이동을 덮지 않는다',
      expectedUser: null,
      expectedOrders: undefined,
      expectedRouterCalls: [],
      expectedDocumentCalls: 1,
    },
    {
      scenario: 'changed',
      name: '다른 계정으로 교체된 뒤 늦은 주문 성공은 새 계정의 이동을 요청하지 않는다',
      expectedUser: { ...SESSION_USER, id: 'u2' },
      expectedOrders: undefined,
      expectedRouterCalls: [],
      expectedDocumentCalls: 0,
    },
  ])(
    '$name',
    async ({
      scenario,
      expectedUser,
      expectedOrders,
      expectedRouterCalls,
      expectedDocumentCalls,
    }) => {
      visit('/orders/new');
      const queryClient = makeNewDocumentClient();
      await seedLoggedInCaches(queryClient);
      useCartStore.getState().actions.toggle(PRODUCT.id);

      const { promise: orderResponseAllowed, resolve: allowOrderResponse } =
        Promise.withResolvers<void>();
      server.use(
        http.post('*/api/orders', async () => {
          await orderResponseAllowed;

          return HttpResponse.json<OrderCreateResponse>(
            { order: USER_ORDERS.orders[0] },
            { status: 201 },
          );
        }),
      );
      const { user } = renderWithProviders(
        <OrderForm
          orderProducts={[
            { productId: PRODUCT.id, quantity: 2, product: PRODUCT },
          ]}
          totalPrice={PRODUCT.price * 2}
        />,
        { queryClient, initialUser: SESSION_USER },
      );
      await user.click(screen.getByRole('button', { name: '주문하기' }));

      if (scenario === 'expired') {
        expireSession();
        await queryClient.fetchQuery({ ...sessionQueries.me(), staleTime: 0 });
      } else if (scenario === 'changed') {
        await replaceSessionUser(queryClient, expectedUser);
      }
      await waitFor(() => {
        expect(replaceDocument).toHaveBeenCalledTimes(expectedDocumentCalls);
      });
      expect(useCheckoutStore.getState().draftItems).toEqual(
        USER_ORDERS.orders[0].items,
      );

      allowOrderResponse();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: '주문하기' })).toBeEnabled();
      });

      expect(useCheckoutStore.getState().draftItems).toEqual([]);
      expect(useCartStore.getState().items).toEqual([]);
      expect(routerReplace.mock.calls).toEqual(expectedRouterCalls);
      expect(replaceDocument).toHaveBeenCalledTimes(expectedDocumentCalls);
      expect(queryClient.getQueryData(meQueryKey)).toEqual(expectedUser);
      expect(queryClient.getQueryData(userOrderQuery.queryKey)).toEqual(
        expectedOrders,
      );
    },
  );

  it('만료 정리로 취소된 /me의 늦은 응답이 로그인 상태를 되살리지 않는다', async () => {
    visit('/products');
    const queryClient = makeNewDocumentClient();

    server.use(http.get('*/api/orders', () => HttpResponse.json(USER_ORDERS)));
    await queryClient.fetchQuery(userOrderQuery);

    // 만료 직전에 시작해 아직 답이 오지 않은 /me 조회
    const { promise: meResponseAllowed, resolve: allowMeResponse } =
      Promise.withResolvers<void>();

    server.use(
      http.get('*/api/auth/me', async () => {
        await meResponseAllowed;

        return HttpResponse.json({ user: SESSION_USER });
      }),
    );
    // 취소로 끝나는 promise라 거절을 미리 받아 둔다
    const inflightMe = queryClient
      .fetchQuery(sessionQueries.me())
      .catch(() => undefined);

    server.use(
      http.get('*/api/orders', () =>
        HttpResponse.json({ message: '로그인이 필요합니다.' }, { status: 401 }),
      ),
    );
    await queryClient.refetchQueries({ queryKey: orderQueries.all() });

    await waitFor(() => {
      expect(queryClient.getQueryData(meQueryKey)).toBeNull();
    });

    // 뒤늦게 로그인 사용자 응답이 도착해도 취소된 조회라 비로그인 상태를 덮지 않는다
    allowMeResponse();
    await inflightMe;

    expect(queryClient.getQueryData(meQueryKey)).toBeNull();
  });

  it('로그인 성공이 진행 중이던 계정 조회를 취소해 늦은 401이 새 사용자를 지우지 않는다', async () => {
    visit('/login');
    const queryClient = makeNewDocumentClient();

    // 이전 사용자 화면이 남긴, 만료 응답(401)을 기다리는 주문 조회
    const { promise: orderResponseAllowed, resolve: allowOrderResponse } =
      Promise.withResolvers<void>();

    server.use(
      http.get('*/api/orders', async () => {
        await orderResponseAllowed;

        return HttpResponse.json(
          { message: '로그인이 필요합니다.' },
          { status: 401 },
        );
      }),
    );
    const staleOrders = queryClient
      .fetchQuery(orderQueries.list('previous-user'))
      .catch(() => undefined);

    const { user } = renderWithProviders(
      <LoginForm redirectPathAfterLogin="/my" from="direct" />,
      { queryClient, initialUser: null },
    );

    await user.type(screen.getByLabelText('이메일'), SESSION_USER.email);
    await user.type(screen.getByLabelText('비밀번호'), SESSION_PASSWORD);
    await user.click(screen.getByRole('button', { name: '로그인' }));

    await waitFor(() => {
      expect(replaceDocument).toHaveBeenCalledWith('/my');
    });

    // 뒤늦은 401이 도착해도 취소된 조회라 새 로그인 사용자를 만료로 지우지 않는다
    allowOrderResponse();
    await staleOrders;
    // "지워지지 않았다"는 waitFor로 기다릴 수 없어, 비동기 정리가 있었다면 반영됐을 한 틱을 소진한다
    await new Promise((flushed) => setTimeout(flushed, 0));

    expect(queryClient.getQueryData(meQueryKey)).toEqual(SESSION_USER);
  });
});
