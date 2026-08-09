import type { Metadata } from 'next';

import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  TableWrapper,
  Td,
  Th,
  Tr,
} from '@/components/ui/primitives';
import { requirePermission } from '@/lib/auth/session';
import { PERMISSIONS, ROLE_LABELS } from '@/lib/rbac';
import { userRepository } from '@/lib/repositories/organization';
import { formatDateTime } from '@/lib/utils';
import { InviteUserButton, UserRowActions } from './user-manager';

export const metadata: Metadata = { title: 'Usuarios' };
export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const session = await requirePermission(PERMISSIONS.USERS_MANAGE);
  const users = await userRepository.listByOrganization(session.organizationId);

  const canManageRoles = session.permissions.includes(PERMISSIONS.ROLES_MANAGE);

  return (
    <>
      <PageHeader
        title="Usuarios"
        description="Personas con acceso a esta organización y el rol que determina sus permisos."
        actions={<InviteUserButton />}
      />

      <Card>
        <CardHeader title={`${users.length} usuario(s)`} />
        {users.length === 0 ? (
          <EmptyState
            title="Sin usuarios"
            description="Crea usuarios para que tu equipo opere el sistema con permisos acotados."
            action={<InviteUserButton />}
          />
        ) : (
          <TableWrapper>
            <thead>
              <tr>
                <Th>Usuario</Th>
                <Th>Rol</Th>
                <Th>Estado</Th>
                <Th>Último acceso</Th>
                <Th align="right">Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <Tr key={user.id}>
                  <Td>
                    <span className="font-medium">{user.displayName}</span>
                    <p className="text-xs text-[var(--color-ink-subtle)]">{user.email}</p>
                  </Td>
                  <Td>
                    <Badge tone="brand">{ROLE_LABELS[user.role] ?? user.role}</Badge>
                  </Td>
                  <Td>
                    {user.status === 'ACTIVE' ? (
                      <Badge tone="positive">Activo</Badge>
                    ) : (
                      <Badge tone="danger">Desactivado</Badge>
                    )}
                  </Td>
                  <Td className="text-[var(--color-ink-subtle)]">
                    {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Nunca'}
                  </Td>
                  <Td align="right">
                    <UserRowActions
                      user={user}
                      canManageRoles={canManageRoles}
                      canManageUsers
                      isSelf={user.id === session.uid}
                    />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrapper>
        )}
      </Card>
    </>
  );
}
