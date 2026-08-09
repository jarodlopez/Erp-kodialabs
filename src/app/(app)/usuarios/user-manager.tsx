'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Plus, ShieldCheck, UserX } from 'lucide-react';

import {
  changeUserRoleAction,
  inviteUserAction,
  setUserStatusAction,
} from '@/app/actions/admin';
import { Button, Field, Input, Select } from '@/components/ui/primitives';
import { ConfirmDialog, Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLE_LIST, type Role } from '@/lib/rbac';
import type { UserProfile } from '@/types/organization';

export function InviteUserButton() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [role, setRole] = useState<Role>('SALES');

  async function submit(formData: FormData) {
    setLoading(true);
    setErrors({});

    const result = await inviteUserAction({
      email: String(formData.get('email') ?? ''),
      displayName: String(formData.get('displayName') ?? ''),
      password: String(formData.get('password') ?? ''),
      role: String(formData.get('role') ?? 'SALES'),
    });

    setLoading(false);

    if (!result.ok) {
      setErrors(result.error.fieldErrors ?? {});
      toast.error('No se pudo crear el usuario', result.error.message);
      return;
    }

    toast.success('Usuario creado', 'Comparte la contraseña temporal de forma segura.');
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Nuevo usuario
      </Button>

      <Modal
        open={open}
        onClose={() => !loading && setOpen(false)}
        title="Crear usuario"
        description="El usuario podrá iniciar sesión inmediatamente con estas credenciales."
        size="sm"
      >
        <form action={submit} className="space-y-4">
          <Field label="Nombre completo" required error={errors.displayName}>
            <Input name="displayName" required />
          </Field>
          <Field label="Correo electrónico" required error={errors.email}>
            <Input name="email" type="email" required />
          </Field>
          <Field
            label="Contraseña temporal"
            required
            error={errors.password}
            hint="Mínimo 8 caracteres con letras y números. El usuario podrá cambiarla."
          >
            <Input name="password" type="text" required />
          </Field>
          <Field label="Rol" required error={errors.role}>
            <Select
              name="role"
              value={role}
              onChange={(event) => setRole(event.target.value as Role)}
            >
              {ROLE_LIST.map((item) => (
                <option key={item} value={item}>
                  {ROLE_LABELS[item]}
                </option>
              ))}
            </Select>
          </Field>
          <p className="rounded-lg bg-[var(--color-surface-muted)] p-3 text-xs text-[var(--color-ink-muted)]">
            {ROLE_DESCRIPTIONS[role]}
          </p>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" loading={loading}>
              Crear usuario
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function UserRowActions({
  user,
  canManageRoles,
  canManageUsers,
  isSelf,
}: {
  user: UserProfile;
  canManageRoles: boolean;
  canManageUsers: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [dialog, setDialog] = useState<'none' | 'role' | 'status'>('none');
  const [loading, setLoading] = useState(false);

  if (isSelf) {
    return <span className="text-xs text-[var(--color-ink-subtle)]">Tu usuario</span>;
  }

  async function changeRole(formData: FormData) {
    setLoading(true);
    const result = await changeUserRoleAction({
      uid: user.id,
      role: String(formData.get('role') ?? user.role),
    });
    setLoading(false);

    if (!result.ok) {
      toast.error('No se pudo cambiar el rol', result.error.message);
      return;
    }
    toast.success('Rol actualizado', 'El usuario deberá iniciar sesión nuevamente.');
    setDialog('none');
    router.refresh();
  }

  async function toggleStatus() {
    setLoading(true);
    const next = user.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const result = await setUserStatusAction({ uid: user.id, status: next });
    setLoading(false);

    if (!result.ok) {
      toast.error('No se pudo cambiar el estado', result.error.message);
      return;
    }
    toast.success(next === 'ACTIVE' ? 'Usuario activado' : 'Usuario desactivado');
    setDialog('none');
    router.refresh();
  }

  return (
    <div className="flex justify-end gap-1">
      {canManageRoles && (
        <Button variant="ghost" size="sm" onClick={() => setDialog('role')}>
          <ShieldCheck className="h-3.5 w-3.5" /> Rol
        </Button>
      )}
      {canManageUsers && (
        <Button variant="ghost" size="sm" onClick={() => setDialog('status')}>
          <UserX className="h-3.5 w-3.5" />
          {user.status === 'ACTIVE' ? 'Desactivar' : 'Activar'}
        </Button>
      )}

      <Modal
        open={dialog === 'role'}
        onClose={() => !loading && setDialog('none')}
        title="Cambiar rol"
        description={user.email}
        size="sm"
      >
        <form action={changeRole} className="space-y-4">
          <Field label="Nuevo rol" required>
            <Select name="role" defaultValue={user.role}>
              {ROLE_LIST.map((item) => (
                <option key={item} value={item}>
                  {ROLE_LABELS[item]}
                </option>
              ))}
            </Select>
          </Field>
          <p className="text-xs text-[var(--color-ink-subtle)]">
            Al cambiar el rol se revocan las sesiones activas del usuario para que los nuevos
            permisos se apliquen de inmediato.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setDialog('none')} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" loading={loading}>
              Guardar
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={dialog === 'status'}
        onClose={() => !loading && setDialog('none')}
        onConfirm={toggleStatus}
        loading={loading}
        tone={user.status === 'ACTIVE' ? 'danger' : 'primary'}
        title={user.status === 'ACTIVE' ? 'Desactivar usuario' : 'Activar usuario'}
        confirmLabel={user.status === 'ACTIVE' ? 'Desactivar' : 'Activar'}
        message={
          user.status === 'ACTIVE'
            ? `${user.email} perderá el acceso al sistema de inmediato. Su historial se conserva.`
            : `${user.email} podrá volver a iniciar sesión.`
        }
      />
    </div>
  );
}
