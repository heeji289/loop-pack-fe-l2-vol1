'use client';

import { useState } from 'react';

const CURRENCIES = [
  { code: 'KRW', label: '원 (KRW)' },
  { code: 'USD', label: '달러 (USD)' },
  { code: 'JPY', label: '엔 (JPY)' },
] as const;

type Currency = (typeof CURRENCIES)[number];

// 저장된 설정은 사용자가 고칠 수 있어 신뢰하지 않는다. 확인할 것이 "아는 코드인가"
// 하나뿐이라 스키마 라이브러리를 클라이언트로 들이지 않고 목록 대조로 끝낸다.
function readStoredCurrency(): Currency {
  try {
    const stored: unknown = JSON.parse(
      window.localStorage.getItem('commerce:currency') ?? '',
    );
    const code =
      typeof stored === 'object' && stored !== null && 'code' in stored
        ? stored.code
        : null;

    return CURRENCIES.find((item) => item.code === code) ?? CURRENCIES[0];
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
