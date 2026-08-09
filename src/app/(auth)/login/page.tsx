import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

import { getSession } from '@/lib/auth/session';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Iniciar sesión' };

export default async function LoginPage() {
  const session = await getSession();
  if (session?.organizationId) redirect('/');

  return <LoginForm />;
}
