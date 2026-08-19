'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { updateOrganizationAction, updateSettingsAction } from '@/app/actions/admin';
import { Button, Card, CardHeader, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { basisPointsToPercent, percentToBasisPoints } from '@/lib/money';
import type { Organization, Settings } from '@/types/organization';
import {
  Building2,
  CalendarClock,
  Clock,
  Coins,
  IdCard,
  Languages,
  Link2,
  Mail,
  MapPin,
  Percent,
  Phone,
  Settings2,
  StickyNote,
  Type,
} from 'lucide-react';

export function SettingsForm({
  organization,
  settings,
  canEdit,
}: {
  organization: Organization;
  settings: Settings;
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [loadingOrg, setLoadingOrg] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function saveOrganization(formData: FormData) {
    setLoadingOrg(true);
    setErrors({});
    const result = await updateOrganizationAction({
      name: String(formData.get('name') ?? ''),
      legalName: String(formData.get('legalName') ?? ''),
      taxId: String(formData.get('taxId') ?? ''),
      email: String(formData.get('email') ?? ''),
      phone: String(formData.get('phone') ?? ''),
      address: String(formData.get('address') ?? ''),
      logoUrl: String(formData.get('logoUrl') ?? ''),
    });
    setLoadingOrg(false);

    if (!result.ok) {
      setErrors(result.error.fieldErrors ?? {});
      toast.error('No se pudo guardar', result.error.message);
      return;
    }
    toast.success('Datos de la organización actualizados');
    router.refresh();
  }

  async function saveSettings(formData: FormData) {
    setLoadingSettings(true);
    setErrors({});
    const result = await updateSettingsAction({
      currency: String(formData.get('currency') ?? 'NIO').toUpperCase(),
      locale: String(formData.get('locale') ?? 'es-NI'),
      timezone: String(formData.get('timezone') ?? 'America/Managua'),
      taxMode: String(formData.get('taxMode') ?? 'EXCLUSIVE'),
      defaultTaxRate: percentToBasisPoints(Number(formData.get('defaultTaxRatePercent') ?? 0)),
      defaultCreditDays: Number(formData.get('defaultCreditDays') ?? 30),
      allowNegativeStock: formData.get('allowNegativeStock') === 'on',
      invoiceFooter: String(formData.get('invoiceFooter') ?? ''),
    });
    setLoadingSettings(false);

    if (!result.ok) {
      setErrors(result.error.fieldErrors ?? {});
      toast.error('No se pudo guardar la configuración', result.error.message);
      return;
    }
    toast.success('Configuración actualizada');
    router.refresh();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Datos de la organización" icon={<Building2 />} description="Aparecen en los documentos exportados." />
        <form action={saveOrganization} className="space-y-4 p-5">
          <Field label="Nombre comercial" icon={<Type />} required error={errors.name}>
            <Input name="name" defaultValue={organization.name} disabled={!canEdit} required />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Razón social" icon={<Type />} error={errors.legalName}>
              <Input name="legalName" defaultValue={organization.legalName ?? ''} disabled={!canEdit} />
            </Field>
            <Field label="RUC / Identificación fiscal" icon={<IdCard />} error={errors.taxId}>
              <Input name="taxId" defaultValue={organization.taxId ?? ''} disabled={!canEdit} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Correo" icon={<Mail />} error={errors.email}>
              <Input
                name="email"
                type="email"
                defaultValue={organization.email ?? ''}
                disabled={!canEdit}
              />
            </Field>
            <Field label="Teléfono" icon={<Phone />} error={errors.phone}>
              <Input name="phone" defaultValue={organization.phone ?? ''} disabled={!canEdit} />
            </Field>
          </div>
          <Field label="Dirección" icon={<MapPin />} error={errors.address}>
            <Input name="address" defaultValue={organization.address ?? ''} disabled={!canEdit} />
          </Field>
          <Field label="URL del logo" icon={<Link2 />} error={errors.logoUrl}>
            <Input name="logoUrl" defaultValue={organization.logoUrl ?? ''} disabled={!canEdit} />
          </Field>

          {canEdit && (
            <Button type="submit" loading={loadingOrg}>
              Guardar datos
            </Button>
          )}
        </form>
      </Card>

      <Card>
        <CardHeader
          title="Parámetros de operación" icon={<Settings2 />}
          description="Afectan a los documentos nuevos; los ya emitidos conservan sus valores históricos."
        />
        <form action={saveSettings} className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Moneda" icon={<Coins />} required error={errors.currency} hint="Código ISO, p. ej. NIO.">
              <Input
                name="currency"
                defaultValue={settings.currency}
                maxLength={3}
                disabled={!canEdit}
                required
              />
            </Field>
            <Field label="Idioma" icon={<Languages />} required error={errors.locale}>
              <Input name="locale" defaultValue={settings.locale} disabled={!canEdit} required />
            </Field>
            <Field label="Zona horaria" icon={<Clock />} required error={errors.timezone}>
              <Input name="timezone" defaultValue={settings.timezone} disabled={!canEdit} required />
            </Field>
          </div>

          <Field
            label="Tratamiento del impuesto" icon={<Percent />}
            required
            hint="Exclusivo: el impuesto se suma al precio. Inclusivo: ya está contenido en el precio."
          >
            <Select name="taxMode" defaultValue={settings.taxMode} disabled={!canEdit}>
              <option value="EXCLUSIVE">Exclusivo (se suma)</option>
              <option value="INCLUSIVE">Inclusivo (ya incluido)</option>
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Impuesto por defecto (%)" icon={<Percent />} error={errors.defaultTaxRate}>
              <Input
                name="defaultTaxRatePercent"
                type="number"
                step="0.01"
                min="0"
                max="100"
                defaultValue={basisPointsToPercent(settings.defaultTaxRate)}
                disabled={!canEdit}
              />
            </Field>
            <Field label="Días de crédito por defecto" icon={<CalendarClock />} error={errors.defaultCreditDays}>
              <Input
                name="defaultCreditDays"
                type="number"
                min="0"
                max="365"
                defaultValue={settings.defaultCreditDays}
                disabled={!canEdit}
              />
            </Field>
          </div>

          <label className="flex items-start gap-2.5 rounded-lg bg-[var(--color-surface-muted)] p-3">
            <input
              type="checkbox"
              name="allowNegativeStock"
              defaultChecked={settings.allowNegativeStock}
              disabled={!canEdit}
              className="mt-0.5 h-4 w-4"
            />
            <span className="text-sm">
              <span className="font-medium">Permitir stock negativo</span>
              <span className="block text-xs text-[var(--color-ink-subtle)]">
                Si se activa, será posible vender más unidades de las que hay en existencias. Se
                recomienda mantenerlo desactivado.
              </span>
            </span>
          </label>

          <Field label="Pie de página de documentos" icon={<StickyNote />} error={errors.invoiceFooter}>
            <Textarea
              name="invoiceFooter"
              defaultValue={settings.invoiceFooter ?? ''}
              disabled={!canEdit}
              placeholder="Gracias por su compra. No se aceptan devoluciones después de 30 días."
            />
          </Field>

          {canEdit && (
            <Button type="submit" loading={loadingSettings}>
              Guardar configuración
            </Button>
          )}
        </form>
      </Card>
    </div>
  );
}
