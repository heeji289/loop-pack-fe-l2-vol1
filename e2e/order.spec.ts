import { expect, test } from './auth.fixture';

test.describe('주문', { tag: '@critical' }, () => {
  test('장바구니에서 선택한 상품을 주문하면 새 주문이 내역에 나타난다', async ({
    page,
  }) => {
    await page.goto('/products');

    const firstProduct = page.getByRole('article').first();
    const firstProductName = firstProduct.getByRole('heading', { level: 2 });
    await expect(firstProductName).toBeVisible();
    const productName = await firstProductName.innerText();

    await firstProduct.getByRole('button', { name: /담기$/ }).click();
    const cartLink = page.getByRole('link', { name: '장바구니 1' });
    await expect(cartLink).toBeVisible();
    await cartLink.click();

    await expect(page.getByRole('heading', { name: '장바구니' })).toBeVisible();
    await expect(
      page.getByRole('checkbox', { name: productName }),
    ).toBeChecked();
    await page.getByRole('button', { name: '총 1개 상품 구매하기' }).click();

    await expect(page).toHaveURL((url) => url.pathname === '/orders/new');
    await expect(page.getByRole('heading', { name: '주문서' })).toBeVisible();
    await expect(page.getByText(productName, { exact: true })).toBeVisible();

    const orderResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/orders',
    );
    await page.getByRole('button', { name: '주문하기' }).click();
    const orderResponse = await orderResponsePromise;
    expect(orderResponse.status()).toBe(201);

    const { order } = (await orderResponse.json()) as {
      order: { id: string };
    };

    await expect(page).toHaveURL((url) => url.pathname === '/orders');
    const createdOrder = page.getByRole('listitem', {
      name: `주문 ${order.id}`,
    });
    await expect(createdOrder).toContainText(productName);

    // 실제 주문이 있어도 첫 HTML은 로딩 상태다. 주문 내역은 브라우저가 조회한다.
    const documentResponse = await page.request.get('/orders');
    expect(documentResponse.status()).toBe(200);
    const html = await documentResponse.text();
    expect(html).toContain('주문 내역을 불러오는 중');
    expect(html).not.toContain(`aria-label="주문 ${order.id}"`);
  });
});
