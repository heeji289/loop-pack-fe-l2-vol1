import { expect, getTestAccount, submitLoginForm, test } from './auth.fixture';

test('세션이 만료되면 로그인으로 가고, 재로그인하면 보호 경로로 돌아오며 다음 만료도 처리한다', async ({
  page,
}) => {
  // 화면이 쓰지 않는 query라도 만료 → 재로그인 왕복에서 유실되지 않아야 한다
  await page.goto('/orders?utm_source=newsletter');
  await expect(page.getByRole('heading', { name: '주문 내역' })).toBeVisible();

  await page
    .context()
    .addCookies([{ name: 'scenario', value: 'expired', url: page.url() }]);
  await page.reload();

  await expect(page).toHaveURL(
    (url) =>
      url.pathname === '/login' &&
      url.searchParams.get('reason') === 'expired' &&
      url.searchParams.get('next') === '/orders?utm_source=newsletter',
  );
  await expect(page.getByRole('status')).toHaveText(
    '세션이 만료되었습니다. 다시 로그인해주세요.',
  );

  // 테스트용 만료 시나리오를 명시적으로 해제해야 재로그인이 실제로 검증된다
  await page.context().clearCookies({ name: 'scenario' });
  await submitLoginForm(page, getTestAccount(test.info().parallelIndex));

  await expect(page).toHaveURL(
    (url) =>
      url.pathname === '/orders' &&
      url.searchParams.get('utm_source') === 'newsletter',
  );
  await expect(page.getByRole('heading', { name: '주문 내역' })).toBeVisible();

  // 재로그인 뒤의 다음 만료도 같은 방식으로 처리된다
  await page
    .context()
    .addCookies([{ name: 'scenario', value: 'expired', url: page.url() }]);
  await page.reload();

  await expect(page).toHaveURL(
    (url) =>
      url.pathname === '/login' &&
      url.searchParams.get('reason') === 'expired' &&
      url.searchParams.get('next') === '/orders?utm_source=newsletter',
  );
});

test('주문서에서 만료돼도 재로그인하면 checkout draft가 복원된다', async ({
  page,
}) => {
  await page.goto('/products');

  const firstProduct = page.getByRole('article').first();
  const firstProductName = firstProduct.getByRole('heading', { level: 2 });
  await expect(firstProductName).toBeVisible();
  const productName = await firstProductName.innerText();

  await firstProduct.getByRole('button', { name: /담기$/ }).click();
  await page.getByRole('link', { name: '장바구니 1' }).click();
  await page.getByRole('button', { name: '총 1개 상품 구매하기' }).click();

  await expect(page.getByRole('heading', { name: '주문서' })).toBeVisible();
  await expect(page.getByText(productName, { exact: true })).toBeVisible();

  // 주문 제출 시점에 세션이 만료된 상황. url을 그대로 쓰면 쿠키 path가 /orders로 좁혀져 루트로 고정한다.
  await page.context().addCookies([
    {
      name: 'scenario',
      value: 'expired',
      url: new URL('/', page.url()).href,
    },
  ]);
  await page.getByRole('button', { name: '주문하기' }).click();

  await expect(page).toHaveURL(
    (url) =>
      url.pathname === '/login' &&
      url.searchParams.get('reason') === 'expired' &&
      url.searchParams.get('next') === '/orders/new',
  );

  // 만료 시나리오를 명시적으로 해제하고 재로그인하면 같은 주문서와 draft가 복원된다
  await page.context().clearCookies({ name: 'scenario' });
  await submitLoginForm(page, getTestAccount(test.info().parallelIndex));

  await expect(page).toHaveURL((url) => url.pathname === '/orders/new');
  await expect(page.getByRole('heading', { name: '주문서' })).toBeVisible();
  await expect(page.getByText(productName, { exact: true })).toBeVisible();
});
