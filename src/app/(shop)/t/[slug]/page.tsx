import { notFound } from 'next/navigation';

import { storeSettingsRepository } from '@/lib/repositories/store';
import { catalogCollections, loadStorefrontCatalog } from '@/lib/services/store';
import { isSoldOut } from '@/lib/storefront';
import type { StorefrontProduct } from '@/types/store';
import { CatalogBrowser } from './catalog-browser';
import { HeroSlider } from './hero';

export const dynamic = 'force-dynamic';

/**
 * Vitrina de la tienda.
 *
 * El catálogo se resuelve en el servidor contra los productos vivos del ERP,
 * así que el precio y la disponibilidad que ve el visitante son los del
 * inventario en ese instante, sin ninguna copia intermedia que sincronizar.
 *
 * Baja entero al navegador —una tienda de este tamaño son decenas de fichas,
 * no miles— y desde ahí el filtrado, la búsqueda y la paginación son
 * instantáneos y sin más lecturas de Firestore.
 */
export default async function StoreHomePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ coleccion?: string }>;
}) {
  const { slug } = await params;
  const { coleccion } = await searchParams;

  const settings = await storeSettingsRepository.findBySlug(slug);
  if (!settings || settings.status !== 'PUBLISHED') notFound();

  const catalog = await loadStorefrontCatalog(settings.organizationId);
  const collections = catalogCollections(catalog);
  const products = orderForStorefront(catalog);

  // La colección de la URL solo se acepta si existe: `?coleccion=cualquiercosa`
  // no debe dejar la vitrina vacía.
  const initialCollection = coleccion && collections.includes(coleccion) ? coleccion : null;

  const showHero = settings.features.hero && settings.heroSlides.length > 0;

  // Gesto de la plantilla: el orden de las secciones rota con el día, así que
  // la portada no se ve idéntica cada vez que alguien vuelve. Se calcula acá y
  // baja como número para que servidor y navegador pinten lo mismo.
  const sectionOffset = collections.length > 0 ? new Date().getDay() % collections.length : 0;

  return (
    <div className="pb-10">
      {showHero && (
        <HeroSlider slides={settings.heroSlides} brandName={settings.branding.name} />
      )}

      <CatalogBrowser
        slug={settings.slug}
        symbol={settings.branding.currencySymbol}
        products={products}
        latest={latestPublished(catalog, 4)}
        collections={collections}
        initialCollection={initialCollection}
        sectionOffset={sectionOffset}
      />
    </div>
  );
}

/**
 * Orden de la vitrina, y con él el criterio de "novedades".
 *
 * `StorefrontProduct` no expone ninguna fecha: el listing tiene `createdAt`,
 * pero el catálogo público lo descarta y `services/store.ts` está fuera de mi
 * alcance en este trabajo. Tampoco sirve el id como reloj —los identificadores
 * de Firestore son aleatorios, no cronológicos—, así que inventar una recencia
 * a partir de ellos daría un orden falso y estable, que es lo peor de los dos
 * mundos.
 *
 * El criterio usado es la curaduría explícita del comercio, que es lo único
 * verdadero que hay a mano: primero lo que marcó como destacado y después el
 * orden manual (`position`) con el que el repositorio ya entrega el catálogo
 * —`sort` es estable, así que los empates lo conservan—. Sobre eso, lo agotado
 * se hunde al final: la portada no debe abrir con algo que no se puede comprar.
 *
 * Es aceptable porque el vendedor controla ambas señales desde el panel y las
 * mueve cuando entra mercadería nueva; el día que el catálogo público arrastre
 * `createdAt`, este comparador es lo único que hay que cambiar.
 */
function orderForStorefront(catalog: StorefrontProduct[]): StorefrontProduct[] {
  const rank = (product: StorefrontProduct) =>
    (isSoldOut(product) ? 2 : 0) + (product.featured ? 0 : 1);

  return [...catalog].sort((a, b) => rank(a) - rank(b));
}

/**
 * Novedades reales: lo último que el comercio publicó, no lo que destacó.
 *
 * Se excluye lo agotado a propósito — una sección de novedades que abre con
 * algo que no se puede comprar trabaja en contra de la venta.
 */
function latestPublished(catalog: StorefrontProduct[], count: number): StorefrontProduct[] {
  return catalog
    .filter((product) => !isSoldOut(product))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, count);
}
