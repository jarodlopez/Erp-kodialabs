'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';

import { completeRegistration, establishSession } from '@/app/actions/auth';
import { Button, Card, Field, Input } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { translateAuthError } from '@/lib/auth/client-errors';
import { getClientAuth } from '@/lib/firebase/client';
import { parseSafe } from '@/lib/validation/parse';
import { registerSchema } from '@/lib/validation/schemas';

export function RegisterForm() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    const form = new FormData(event.currentTarget);
    const parsed = parseSafe(registerSchema, {
      displayName: String(form.get('displayName') ?? ''),
      organizationName: String(form.get('organizationName') ?? ''),
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
      confirmPassword: String(form.get('confirmPassword') ?? ''),
    });

    if (!parsed.ok) {
      setErrors(parsed.fieldErrors);
      return;
    }

    setErrors({});
    setLoading(true);

    try {
      const auth = getClientAuth();
      const credential = await createUserWithEmailAndPassword(
        auth,
        parsed.data.email,
        parsed.data.password,
      );
      await updateProfile(credential.user, { displayName: parsed.data.displayName });

      const idToken = await credential.user.getIdToken(true);
      const provisioned = await completeRegistration({
        idToken,
        displayName: parsed.data.displayName,
        organizationName: parsed.data.organizationName,
        email: parsed.data.email,
      });

      if (!provisioned.ok) {
        toast.error('No se pudo crear la organización', provisioned.error.message);
        setLoading(false);
        return;
      }

      // El token se refresca para incorporar los custom claims recién asignados.
      const refreshed = await credential.user.getIdToken(true);
      const session = await establishSession(refreshed);

      if (!session.ok) {
        toast.error('No se pudo iniciar la sesión', session.error.message);
        setLoading(false);
        return;
      }

      toast.success('Organización creada', 'Ya puedes empezar a operar.');
      router.replace('/');
      router.refresh();
    } catch (error) {
      toast.error('No se pudo completar el registro', translateAuthError(error));
      setLoading(false);
    }
  }

  return (
    <Card className="p-6 shadow-sm">
      <h1 className="text-xl font-semibold text-[var(--color-ink)]">Crea tu organización</h1>
      <p className="mt-1 text-sm text-[var(--color-ink-subtle)]">
        Tu usuario quedará como administrador con acceso total.
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        <Field label="Tu nombre" htmlFor="displayName" required error={errors.displayName}>
          <Input
            id="displayName"
            name="displayName"
            autoComplete="name"
            placeholder="Ana Martínez"
            invalid={Boolean(errors.displayName)}
            required
          />
        </Field>

        <Field
          label="Nombre del negocio"
          htmlFor="organizationName"
          required
          error={errors.organizationName}
        >
          <Input
            id="organizationName"
            name="organizationName"
            placeholder="HomeMart"
            invalid={Boolean(errors.organizationName)}
            required
          />
        </Field>

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

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Contraseña"
            htmlFor="password"
            required
            error={errors.password}
            hint="Mínimo 8 caracteres, con letras y números."
          >
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              invalid={Boolean(errors.password)}
              required
            />
          </Field>

          <Field label="Confirmar" htmlFor="confirmPassword" required error={errors.confirmPassword}>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              invalid={Boolean(errors.confirmPassword)}
              required
            />
          </Field>
        </div>

        <Button type="submit" className="w-full" loading={loading}>
          Crear organización
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-[var(--color-ink-subtle)]">
        ¿Ya tienes cuenta?{' '}
        <Link href="/login" className="font-medium text-[var(--color-brand-600)] hover:underline">
          Inicia sesión
        </Link>
      </p>
    </Card>
  );
}
