import type { Metadata } from 'next';
import { Check, Minus } from 'lucide-react';

import {
  Badge,
  Card,
  CardHeader,
  PageHeader,
  TableWrapper,
  Td,
  Th,
  Tr,
} from '@/components/ui/primitives';
import { requirePermission } from '@/lib/auth/session';
import {
  PERMISSION_GROUPS,
  PERMISSIONS,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  ROLE_LIST,
  ROLE_PERMISSIONS,
} from '@/lib/rbac';
import { userRepository } from '@/lib/repositories/organization';

export const metadata: Metadata = { title: 'Roles y permisos' };
export const dynamic = 'force-dynamic';

export default async function RolesPage() {
  const session = await requirePermission(PERMISSIONS.ROLES_MANAGE);
  const users = await userRepository.listByOrganization(session.organizationId);

  const counts = ROLE_LIST.reduce<Record<string, number>>((acc, role) => {
    acc[role] = users.filter((user) => user.role === role).length;
    return acc;
  }, {});

  return (
    <>
      <PageHeader
        title="Roles y permisos"
        description="Matriz de permisos por rol. La validación es server-side: el frontend solo oculta lo que el usuario no puede hacer."
      />

      <section className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {ROLE_LIST.map((role) => (
          <Card key={role} className="p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold">{ROLE_LABELS[role]}</p>
              <Badge tone="brand">{counts[role] ?? 0}</Badge>
            </div>
            <p className="mt-1.5 text-xs text-[var(--color-ink-subtle)]">
              {ROLE_DESCRIPTIONS[role]}
            </p>
            <p className="mt-2 text-xs text-[var(--color-ink-subtle)]">
              {ROLE_PERMISSIONS[role].length} permisos
            </p>
          </Card>
        ))}
      </section>

      {PERMISSION_GROUPS.map((group) => (
        <Card key={group.module} className="mb-4">
          <CardHeader title={group.module} />
          <TableWrapper>
            <thead>
              <tr>
                <Th>Permiso</Th>
                {ROLE_LIST.map((role) => (
                  <Th key={role} align="center">
                    {ROLE_LABELS[role]}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {group.permissions.map((permission) => (
                <Tr key={permission.key}>
                  <Td>
                    <span className="font-medium">{permission.label}</span>
                    <p className="font-mono text-xs text-[var(--color-ink-subtle)]">
                      {permission.key}
                    </p>
                  </Td>
                  {ROLE_LIST.map((role) => {
                    const granted = ROLE_PERMISSIONS[role].includes(permission.key);
                    return (
                      <Td key={role} align="center">
                        {granted ? (
                          <Check className="mx-auto h-4 w-4 text-[var(--color-positive-500)]" />
                        ) : (
                          <Minus className="mx-auto h-4 w-4 text-[var(--color-border-strong)]" />
                        )}
                      </Td>
                    );
                  })}
                </Tr>
              ))}
            </tbody>
          </TableWrapper>
        </Card>
      ))}

      <Card className="p-5">
        <p className="text-sm text-[var(--color-ink-muted)]">
          Los permisos de cada rol están definidos en el código (<code>src/lib/rbac.ts</code>) y
          viajan dentro del token de Firebase como <em>custom claims</em>, de modo que también las
          Security Rules de Firestore y Storage pueden aplicarlos. Para asignar un rol a una persona,
          ve a <strong>Usuarios</strong>.
        </p>
      </Card>
    </>
  );
}
