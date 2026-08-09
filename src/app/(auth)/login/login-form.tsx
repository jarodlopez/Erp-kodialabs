'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';

import { establishSession } from '@/app/actions/auth';
import { Button, Card, Field, Input } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { translateAuthError } from '@/lib/auth/client-errors';
import { getClientAuth } from '@/lib/firebase/client';
import { parseSafe } from '@/lib/validation/parse';
import { loginSchema } from '@/lib/validation/schemas';

export function LoginForm() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return; // Evita el doble envío.

    const form = new FormData(event.currentTarget);
    const parsed = parseSafe(loginSchema, {
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
    });

    if (!parsed.ok) {
      setErrors(parsed.fieldErrors);
      return;
    }

    setErrors({});
    setLoading(true);

    try {
      const credential = await signInWithEmailAndPassword(
        getClientAuth(),
        parsed.data.email,
        parsed.data.password,
      );
      const idToken = await credential.user.getIdToken(true);
      const result = await establishSession(idToken);

      if (!result.ok) {
        toast.error('No se pudo iniciar sesión', result.error.message);
        setLoading(false);
        return;
      }

      if (!result.data.organizationId) {
        toast.warning(
          'Cuenta sin organización',
          'Tu usuario existe pero no pertenece a ninguna organización. Contacta al administrador.',
        );
        setLoading(false);
        return;
      }

      router.replace('/');
      router.refresh();
    } catch (error) {
      toast.error('No se pudo iniciar sesión', translateAuthError(error));
      setLoading(false);
    }
  }

  return (
    <Card className="p-6 shadow-sm">
      <h1 className="text-xl font-semibold text-[var(--color-ink)]">Iniciar sesión</h1>
      <p className="mt-1 text-sm text-[var(--color-ink-subtle)]">
        Accede con tu correo corporativo.
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        <Field label="Correo electrónico" htmlFor="email" required error={errors.email}>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="tu@empresa.com"
            invalid={Boolean(errors.email)}
            required
          />
        </Field>

        <Field label="Contraseña" htmlFor="password" required error={errors.password}>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            invalid={Boolean(errors.password)}
            required
          />
        </Field>

        <div className="flex justify-end">
          <Link
            href="/recuperar"
            className="text-sm text-[var(--color-brand-600)] hover:underline"
          >
            ¿Olvidaste tu contraseña?
          </Link>
        </div>

        <Button type="submit" className="w-full" loading={loading}>
          Entrar
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-[var(--color-ink-subtle)]">
        ¿No tienes cuenta?{' '}
        <Link href="/registro" className="font-medium text-[var(--color-brand-600)] hover:underline">
          Crea tu organización
        </Link>
      </p>
    </Card>
  );
}
