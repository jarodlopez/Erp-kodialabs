'use client';

import Link from 'next/link';
import { useState } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';

import { Button, Card, Field, Input } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { translateAuthError } from '@/lib/auth/client-errors';
import { getClientAuth } from '@/lib/firebase/client';
import { parseSafe } from '@/lib/validation/parse';
import { forgotPasswordSchema } from '@/lib/validation/schemas';
import {
  Mail,
} from 'lucide-react';

export function RecoverForm() {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    const form = new FormData(event.currentTarget);
    const parsed = parseSafe(forgotPasswordSchema, { email: String(form.get('email') ?? '') });

    if (!parsed.ok) {
      setError(parsed.fieldErrors.email ?? 'Correo inválido.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      await sendPasswordResetEmail(getClientAuth(), parsed.data.email);
      setSent(true);
      toast.success('Correo enviado', 'Revisa tu bandeja de entrada para restablecer la contraseña.');
    } catch (err) {
      // Por seguridad no se revela si el correo existe o no.
      const message = translateAuthError(err);
      if (message.includes('No encontramos')) {
        setSent(true);
      } else {
        toast.error('No se pudo enviar el correo', message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="p-6 shadow-sm">
      <h1 className="text-xl font-semibold text-[var(--color-ink)]">Recuperar contraseña</h1>
      <p className="mt-1 text-sm text-[var(--color-ink-subtle)]">
        Te enviaremos un enlace para crear una contraseña nueva.
      </p>

      {sent ? (
        <div className="mt-6 rounded-lg bg-[var(--color-positive-50)] p-4 text-sm text-[var(--color-positive-700)]">
          Si el correo está registrado, recibirás un enlace en los próximos minutos. Revisa también
          la carpeta de spam.
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
          <Field label="Correo electrónico" icon={<Mail />} htmlFor="email" required error={error}>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="tu@empresa.com"
              invalid={Boolean(error)}
              required
            />
          </Field>
          <Button type="submit" className="w-full" loading={loading}>
            Enviar enlace
          </Button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-[var(--color-ink-subtle)]">
        <Link href="/login" className="font-medium text-[var(--color-brand-600)] hover:underline">
          Volver a iniciar sesión
        </Link>
      </p>
    </Card>
  );
}
