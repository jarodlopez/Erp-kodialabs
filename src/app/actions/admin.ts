'use server';

import { revalidatePath } from 'next/cache';

import { fail, logError, ok, type ActionResult } from '@/lib/errors';
import { PERMISSIONS, type Role } from '@/lib/rbac';
import { getActorContext } from '@/lib/server-context';
import { organizationService, userService } from '@/lib/services/organization';
import { parseOrThrow } from '@/lib/validation/parse';
import {
  changeRoleSchema,
  inviteUserSchema,
  organizationSchema,
  settingsSchema,
  userStatusSchema,
} from '@/lib/validation/schemas';

export async function inviteUserAction(input: unknown): Promise<ActionResult<{ uid: string }>> {
  try {
    const { actor } = await getActorContext(PERMISSIONS.USERS_MANAGE);
    const data = parseOrThrow(inviteUserSchema, input);
    const result = await userService.inviteUser(actor, { ...data, role: data.role as Role });
    revalidatePath('/usuarios');
    return ok(result);
  } catch (error) {
    logError('admin.inviteUser', error);
    return fail(error);
  }
}

export async function changeUserRoleAction(input: unknown): Promise<ActionResult<undefined>> {
  try {
    const { actor } = await getActorContext(PERMISSIONS.ROLES_MANAGE);
    const data = parseOrThrow(changeRoleSchema, input);
    await userService.changeRole(actor, data.uid, data.role as Role);
    revalidatePath('/usuarios');
    return ok();
  } catch (error) {
    logError('admin.changeRole', error);
    return fail(error);
  }
}

export async function setUserStatusAction(input: unknown): Promise<ActionResult<undefined>> {
  try {
    const { actor } = await getActorContext(PERMISSIONS.USERS_MANAGE);
    const data = parseOrThrow(userStatusSchema, input);
    await userService.setStatus(actor, data.uid, data.status);
    revalidatePath('/usuarios');
    return ok();
  } catch (error) {
    logError('admin.setUserStatus', error);
    return fail(error);
  }
}

export async function updateSettingsAction(input: unknown): Promise<ActionResult<undefined>> {
  try {
    const { actor } = await getActorContext(PERMISSIONS.SETTINGS_MANAGE);
    const data = parseOrThrow(settingsSchema, input);
    await organizationService.updateSettings(actor, data);
    revalidatePath('/configuracion');
    return ok();
  } catch (error) {
    logError('admin.updateSettings', error);
    return fail(error);
  }
}

export async function updateOrganizationAction(input: unknown): Promise<ActionResult<undefined>> {
  try {
    const { actor } = await getActorContext(PERMISSIONS.SETTINGS_MANAGE);
    const data = parseOrThrow(organizationSchema, input);
    await organizationService.updateOrganization(actor, data);
    revalidatePath('/configuracion');
    return ok();
  } catch (error) {
    logError('admin.updateOrganization', error);
    return fail(error);
  }
}
