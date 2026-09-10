'use client';

import { useState } from 'react';
import { z } from 'zod';

const CURRENCIES = [
  { code: 'KRW', label: '원 (KRW)' },
  { code: 'USD', label: '달러 (USD)' },
  { code: 'JPY', label: '엔 (JPY)' },
] as const;

type Currency = (typeof CURRENCIES)[number];

// 저장된 설정은 사용자가 고칠 수 있으므로 신뢰하지 않고 스키마로 검증한다.
const storedCurrencySchema = z.object({
  code: z.enum(['KRW', 'USD', 'JPY']),
  updatedAt: z.iso.datetime(),
});

function readStoredCurrency(): Currency {
  try {
    const parsed = storedCurrencySchema.safeParse(
      JSON.parse(window.localStorage.getItem('commerce:currency') ?? ''),
    );

    if (!parsed.success) return CURRENCIES[0];

    return (
      CURRENCIES.find((item) => item.code === parsed.data.code) ?? CURRENCIES[0]
    );
  } catch {
    return CURRENCIES[0];
  }
}

export function CurrencySelect() {
  const [currency, setCurrency] = useState<Currency>(readStoredCurrency);

  return (
    <select
      aria-label="표시 통화"
      value={currency.code}
      onChange={(event) => {
        const next =
          CURRENCIES.find((item) => item.code === event.target.value) ??
          CURRENCIES[0];

        setCurrency(next);
        window.localStorage.setItem(
          'commerce:currency',
          JSON.stringify({
            code: next.code,
            updatedAt: new Date().toISOString(),
          }),
        );
      }}
    >
      {CURRENCIES.map((item) => (
        <option key={item.code} value={item.code}>
          {item.label}
        </option>
      ))}
    </select>
  );
}
