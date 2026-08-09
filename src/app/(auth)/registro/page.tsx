import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

import { getSession } from '@/lib/auth/session';
import { RegisterForm } from './register-form';

export const metadata: Metadata = { title: 'Crear organización' };

export default async function RegisterPage() {
  const session = await getSession();
  if (session?.organizationId) redirect('/');

  return <RegisterForm />;
}
