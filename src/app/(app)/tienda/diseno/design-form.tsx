'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  Activity,
  AlignLeft,
  Banknote,
  CircleDot,
  Coins,
  CreditCard,
  Globe,
  Images,
  LayoutGrid,
  MapPin,
  Palette,
  Plus,
  Trash2,
  Type,
  Wallet,
  Warehouse,
} from 'lucide-react';

import { saveStoreSettingsAction } from '@/app/actions/store';
import { Button, Card, CardHeader, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { toMajorUnits } from '@/lib/money';
import type { HeroSlide, StoreSettings } from '@/types/store';
import { ImageUploader, uploadImage } from '../image-uploader';

/**
 * Configuración de la tienda: marca, módulos, envíos y datos de pago.
 *
 * Todo lo que define la identidad de la tienda vive aquí y no en el código,
 * que es lo que permite que la misma base sirva para una tienda de ropa y para
 * una ferretería sin tocar un archivo.
 */

interface ZoneRow {
  id: string | null;
  label: string;
  cost: number;
}

interface PaymentRow {
  id: string | null;
  label: string;
  detail: string;
  notes: string;
}

export function StoreDesignForm({
  settings,
  warehouses,
  accounts,
}: {
  settings: StoreSettings;
  warehouses: { id: string; name: string }[];
  accounts: { id: string; name: string }[];
}) {
  const router = useRouter();
  const toast = useToast();

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [logoUrl, setLogoUrl] = useState(settings.branding.logoUrl ?? '');
  const [status, setStatus] = useState(settings.status);
  const [heroSlides, setHeroSlides] = useState<HeroSlide[]>(settings.heroSlides);

  const [zones, setZones] = useState<ZoneRow[]>(
    settings.shippingZones.map((zone) => ({
      id: zone.id,
      label: zone.label,
      cost: toMajorUnits(zone.cost),
    })),
  );

  const [payments, setPayments] = useState<PaymentRow[]>(
    settings.paymentInstructions.map((item) => ({
      id: item.id,
      label: item.label,
      detail: item.detail,
      notes: item.notes ?? '',
    })),
  );

  async function onHeroImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const url = await uploadImage(file);
      setHeroSlides((current) => [
        ...current,
        { imageUrl: url, title: null, subtitle: null, ctaLabel: null, ctaHref: null },
      ]);
    } catch (cause) {
      toast.error(
        'No se pudo subir la portada',
        cause instanceof Error ? cause.message : undefined,
      );
    } finally {
      event.target.value = '';
    }
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    const form = new FormData(event.currentTarget);

    const payload = {
      slug: String(form.get('slug') ?? ''),
      status,
      branding: {
        name: String(form.get('name') ?? ''),
        logoUrl,
        accentColor: String(form.get('accentColor') ?? '#111111'),
        marqueeText: String(form.get('marqueeText') ?? ''),
        whatsapp: String(form.get('whatsapp') ?? ''),
        currencySymbol: String(form.get('currencySymbol') ?? 'C$'),
        variantLabel: String(form.get('variantLabel') ?? 'PRESENTACIÓN'),
        cartTitle: String(form.get('cartTitle') ?? 'TU CARRITO'),
      },
      features: {
        hero: form.get('feature_hero') === 'on',
        discounts: form.get('feature_discounts') === 'on',
        popups: form.get('feature_popups') === 'on',
        whatsappButton: form.get('feature_whatsapp') === 'on',
        showStock: form.get('feature_stock') === 'on',
      },
      heroSlides,
      shippingZones: zones.filter((zone) => zone.label.trim()),
      paymentInstructions: payments
        .filter((item) => item.label.trim() && item.detail.trim())
        .map((item) => ({ ...item, notes: item.notes || null })),
      seoDescription: String(form.get('seoDescription') ?? ''),
      warehouseId: String(form.get('warehouseId') ?? ''),
      defaultAccountId: String(form.get('defaultAccountId') ?? ''),
    };

    setLoading(true);
    setErrors({});

    const result = await saveStoreSettingsAction(payload);
    setLoading(false);

    if (!result.ok) {
      setErrors(result.error.fieldErrors ?? {});
      toast.error('No se pudo guardar', result.error.message);
      return;
    }

    toast.success('Tienda actualizada');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Card>
        <CardHeader
          title="Marca" icon={<Palette />}
          description="Lo que ve el comprador: nombre, logo y color. Se aplica al instante en la tienda."
        />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Nombre de la tienda" icon={<Type />} htmlFor="name" required error={errors['branding.name']}>
            <Input id="name" name="name" defaultValue={settings.branding.name} maxLength={80} required />
          </Field>

          <Field
            label="Dirección pública" icon={<MapPin />}
            htmlFor="slug"
            required
            error={errors.slug}
            hint={`La tienda vive en /t/${settings.slug}`}
          >
            <Input
              id="slug"
              name="slug"
              defaultValue={settings.slug}
              maxLength={40}
              pattern="[a-z0-9-]+"
              required
            />
          </Field>

          <Field label="Color de acento" icon={<Palette />} htmlFor="accentColor" error={errors['branding.accentColor']}>
            <Input
              id="accentColor"
              name="accentColor"
              type="color"
              defaultValue={settings.branding.accentColor}
              className="h-10 p-1"
            />
          </Field>

          <Field
            label="WhatsApp"
            htmlFor="whatsapp"
            error={errors['branding.whatsapp']}
            hint="Formato internacional sin +. Vacío oculta el botón."
          >
            <Input
              id="whatsapp"
              name="whatsapp"
              defaultValue={settings.branding.whatsapp ?? ''}
              maxLength={30}
            />
          </Field>

          <Field
            label="Cinta superior"
            htmlFor="marqueeText"
            error={errors['branding.marqueeText']}
            hint="Texto animado del borde superior. Vacío la oculta."
          >
            <Input
              id="marqueeText"
              name="marqueeText"
              defaultValue={settings.branding.marqueeText ?? ''}
              maxLength={200}
            />
          </Field>

          <Field
            label="Símbolo de moneda" icon={<Coins />}
            htmlFor="currencySymbol"
            required
            error={errors['branding.currencySymbol']}
          >
            <Input
              id="currencySymbol"
              name="currencySymbol"
              defaultValue={settings.branding.currencySymbol}
              maxLength={6}
              required
            />
          </Field>

          <Field
            label="Etiqueta de variante"
            htmlFor="variantLabel"
            required
            error={errors['branding.variantLabel']}
            hint="TALLA para ropa, MEDIDA para ferretería, PRESENTACIÓN…"
          >
            <Input
              id="variantLabel"
              name="variantLabel"
              defaultValue={settings.branding.variantLabel}
              maxLength={24}
              required
            />
          </Field>

          <Field
            label="Título del carrito" icon={<Type />}
            htmlFor="cartTitle"
            required
            error={errors['branding.cartTitle']}
          >
            <Input
              id="cartTitle"
              name="cartTitle"
              defaultValue={settings.branding.cartTitle}
              maxLength={40}
              required
            />
          </Field>

          <div className="sm:col-span-2">
            <ImageUploader
              images={logoUrl ? [logoUrl] : []}
              onChange={(images) => setLogoUrl(images[0] ?? '')}
              max={1}
              label="Logo"
              hint="Sin logo se muestra el nombre de la tienda como texto."
            />
          </div>

          <Field
            label="Descripción para buscadores" icon={<AlignLeft />}
            htmlFor="seoDescription"
            className="sm:col-span-2"
            error={errors.seoDescription}
          >
            <Textarea
              id="seoDescription"
              name="seoDescription"
              rows={2}
              defaultValue={settings.seoDescription ?? ''}
              maxLength={300}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Módulos" icon={<LayoutGrid />}
          description="Lo que apagues desaparece de la tienda pública."
        />
        <div className="grid gap-3 p-5 sm:grid-cols-2">
          <Toggle name="feature_hero" label="Portada (hero)" defaultChecked={settings.features.hero} />
          <Toggle
            name="feature_discounts"
            label="Cupones de descuento"
            defaultChecked={settings.features.discounts}
          />
          <Toggle name="feature_popups" label="Pop-ups" defaultChecked={settings.features.popups} />
          <Toggle
            name="feature_whatsapp"
            label="Botón de WhatsApp"
            defaultChecked={settings.features.whatsappButton}
          />
          <Toggle
            name="feature_stock"
            label="Mostrar existencias en la ficha"
            defaultChecked={settings.features.showStock}
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Portadas" icon={<Images />}
          description="Imágenes grandes del inicio. Se muestra la primera."
          actions={
            <label className="cursor-pointer">
              <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--color-border-strong)] bg-white px-3 text-sm shadow-sm">
                <Plus className="h-3.5 w-3.5" /> Subir portada
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={onHeroImage}
              />
            </label>
          }
        />
        <div className="space-y-3 p-5">
          {heroSlides.length === 0 && (
            <p className="text-sm text-[var(--color-ink-muted)]">
              Sin portadas, la tienda arranca directo con la vitrina de productos.
            </p>
          )}
          {heroSlides.map((slide, index) => (
            <div
              key={slide.imageUrl}
              className="flex flex-wrap items-start gap-3 rounded-lg border border-[var(--color-border)] p-3"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={slide.imageUrl}
                alt={`Portada ${index + 1}`}
                className="h-20 w-32 rounded object-cover"
              />
              <div className="grid min-w-[240px] flex-1 gap-2 sm:grid-cols-2">
                <Input
                  placeholder="Título"
                  value={slide.title ?? ''}
                  maxLength={80}
                  onChange={(event) =>
                    setHeroSlides((current) =>
                      current.map((item, i) =>
                        i === index ? { ...item, title: event.target.value } : item,
                      ),
                    )
                  }
                />
                <Input
                  placeholder="Subtítulo"
                  value={slide.subtitle ?? ''}
                  maxLength={160}
                  onChange={(event) =>
                    setHeroSlides((current) =>
                      current.map((item, i) =>
                        i === index ? { ...item, subtitle: event.target.value } : item,
                      ),
                    )
                  }
                />
                <Input
                  placeholder="Texto del botón"
                  value={slide.ctaLabel ?? ''}
                  maxLength={40}
                  onChange={(event) =>
                    setHeroSlides((current) =>
                      current.map((item, i) =>
                        i === index ? { ...item, ctaLabel: event.target.value } : item,
                      ),
                    )
                  }
                />
                <Input
                  placeholder="Enlace del botón"
                  value={slide.ctaHref ?? ''}
                  maxLength={300}
                  onChange={(event) =>
                    setHeroSlides((current) =>
                      current.map((item, i) =>
                        i === index ? { ...item, ctaHref: event.target.value } : item,
                      ),
                    )
                  }
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setHeroSlides((current) => current.filter((_, i) => i !== index))}
                aria-label={`Quitar portada ${index + 1}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Zonas de envío" icon={<MapPin />}
          description="El costo se agrega al pedido y se factura como una línea de servicio en la venta."
          actions={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setZones((current) => [...current, { id: null, label: '', cost: 0 }])}
            >
              <Plus className="h-3.5 w-3.5" /> Agregar zona
            </Button>
          }
        />
        <div className="space-y-2 p-5">
          {zones.length === 0 && (
            <p className="text-sm text-[var(--color-ink-muted)]">
              Sin zonas, el pedido no lleva costo de envío.
            </p>
          )}
          {zones.map((zone, index) => (
            <div key={index} className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="Managua / Departamentos"
                value={zone.label}
                maxLength={60}
                className="min-w-[200px] flex-1"
                onChange={(event) =>
                  setZones((current) =>
                    current.map((item, i) =>
                      i === index ? { ...item, label: event.target.value } : item,
                    ),
                  )
                }
              />
              <Input
                type="number"
                step="0.01"
                min="0"
                value={zone.cost}
                className="w-32"
                onChange={(event) =>
                  setZones((current) =>
                    current.map((item, i) =>
                      i === index ? { ...item, cost: Number(event.target.value) } : item,
                    ),
                  )
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setZones((current) => current.filter((_, i) => i !== index))}
                aria-label={`Quitar zona ${index + 1}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Datos de pago" icon={<CreditCard />}
          description="Se muestran al comprador después de confirmar el pedido, para que pague y suba su comprobante."
          actions={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                setPayments((current) => [
                  ...current,
                  { id: null, label: '', detail: '', notes: '' },
                ])
              }
            >
              <Plus className="h-3.5 w-3.5" /> Agregar
            </Button>
          }
        />
        <div className="space-y-3 p-5">
          {payments.length === 0 && (
            <p className="text-sm text-[var(--color-ink-muted)]">
              Necesitás al menos un dato de pago para publicar la tienda.
            </p>
          )}
          {payments.map((item, index) => (
            <div
              key={index}
              className="grid gap-2 rounded-lg border border-[var(--color-border)] p-3 sm:grid-cols-[1fr_1fr_auto]"
            >
              <Input
                placeholder="BAC — Córdobas"
                value={item.label}
                maxLength={60}
                onChange={(event) =>
                  setPayments((current) =>
                    current.map((row, i) =>
                      i === index ? { ...row, label: event.target.value } : row,
                    ),
                  )
                }
              />
              <Input
                placeholder="N.º de cuenta o teléfono"
                value={item.detail}
                maxLength={200}
                onChange={(event) =>
                  setPayments((current) =>
                    current.map((row, i) =>
                      i === index ? { ...row, detail: event.target.value } : row,
                    ),
                  )
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPayments((current) => current.filter((_, i) => i !== index))}
                aria-label={`Quitar dato de pago ${index + 1}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
              <Input
                placeholder="Nota (a nombre de…, horario…)"
                value={item.notes}
                maxLength={300}
                className="sm:col-span-3"
                onChange={(event) =>
                  setPayments((current) =>
                    current.map((row, i) =>
                      i === index ? { ...row, notes: event.target.value } : row,
                    ),
                  )
                }
              />
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Operación" icon={<Activity />}
          description="De dónde sale el inventario y a qué cuenta entra el dinero de los pedidos web."
        />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Bodega de despacho" icon={<Warehouse />} htmlFor="warehouseId" error={errors.warehouseId}>
            <Select id="warehouseId" name="warehouseId" defaultValue={settings.warehouseId ?? ''}>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Cuenta sugerida al cobrar" icon={<Wallet />}
            htmlFor="defaultAccountId"
            error={errors.defaultAccountId}
            hint="Se preselecciona al aprobar un pedido; siempre se puede cambiar."
          >
            <Select
              id="defaultAccountId"
              name="defaultAccountId"
              defaultValue={settings.defaultAccountId ?? ''}
            >
              <option value="">Sin cuenta preferida</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Publicación" icon={<Globe />}
          description="En borrador, la tienda no es accesible para nadie."
        />
        <div className="flex flex-wrap items-end justify-between gap-4 p-5">
          <Field label="Estado" icon={<CircleDot />} htmlFor="status" className="min-w-[220px]" error={errors.status}>
            <Select
              id="status"
              value={status}
              onChange={(event) => setStatus(event.target.value as StoreSettings['status'])}
            >
              <option value="DRAFT">Borrador (cerrada)</option>
              <option value="PUBLISHED">Publicada (recibe pedidos)</option>
            </Select>
          </Field>

          <Button type="submit" loading={loading}>
            Guardar cambios
          </Button>
        </div>
      </Card>
    </form>
  );
}

function Toggle({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="h-4 w-4" />
      {label}
    </label>
  );
}
