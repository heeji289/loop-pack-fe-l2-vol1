'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import type { ReactNode } from 'react';

import { getQueryClient } from './query-client';

import { useRestoreCart } from '@/entities/cart';
import { useRestoreWishlist } from '@/entities/wishlist';

export default function Providers({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();

  useRestoreCart();
  useRestoreWishlist();

  return (
    <NuqsAdapter>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </NuqsAdapter>
  );
}
