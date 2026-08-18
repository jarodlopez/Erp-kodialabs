import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { storeSettingsRepository } from '@/lib/repositories/store';
import { CheckoutForm } from './checkout-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Checkout',
  robots: { index: false, follow: false },
};

export default async function StoreCheckoutPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const settings = await storeSettingsRepository.findBySlug(slug);
  if (!settings || settings.status !== 'PUBLISHED') notFound();

  return <CheckoutForm settings={settings} />;
}
