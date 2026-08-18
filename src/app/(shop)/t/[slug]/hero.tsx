'use client';

import { useEffect, useState } from 'react';

import type { HeroSlide } from '@/types/store';
import { ShopImage } from './chrome';

/** Cada cuánto pasa a la portada siguiente. Igual que la plantilla. */
const ROTATION_MS = 5000;

/**
 * Portada de la tienda: varias fotos a sangre que se cruzan con un fundido.
 *
 * Es lo primero que ve quien llega desde Instagram, así que ocupa media
 * pantalla en el teléfono y siete décimos en escritorio: suficiente para
 * imponer la marca sin esconder el catálogo, que es lo que hace vender.
 */
export function HeroSlider({ slides, brandName }: { slides: HeroSlide[]; brandName: string }) {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    // Con una sola portada no hay nada que rotar, y con movimiento reducido la
    // rotación automática se cancela: el CSS no puede frenar un `setInterval`.
    if (slides.length <= 1) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const timer = window.setInterval(() => {
      setCurrent((previous) => (previous + 1) % slides.length);
    }, ROTATION_MS);

    return () => window.clearInterval(timer);
  }, [slides.length]);

  return (
    <section
      className="relative h-[50vh] w-full overflow-hidden border-b-2 md:h-[70vh]"
      style={{ borderColor: 'var(--shop-line-soft)', background: 'var(--shop-surface)' }}
      aria-label="Portada"
    >
      {slides.map((slide, index) => {
        const active = index === current;
        // Un solo `h1` por página: la primera portada es el titular real y las
        // demás son variaciones de la misma pieza.
        const Heading = index === 0 ? 'h1' : 'h2';

        return (
          <div
            key={`${index}-${slide.imageUrl}`}
            className={`absolute inset-0 transition-opacity duration-1000 motion-reduce:transition-none ${
              active ? 'z-10 opacity-100' : 'z-0 opacity-0'
            }`}
            // `inert` saca la portada oculta del orden de tabulación y del
            // árbol de accesibilidad sin ocultarla con `visibility`, que
            // cortaría el fundido de salida.
            inert={!active}
          >
            <ShopImage
              src={slide.imageUrl}
              alt={slide.title ? `${brandName} — ${slide.title}` : brandName}
              width={1600}
              eager={index === 0}
              className="h-full w-full scale-105 object-cover"
            />

            {/* Degradado de abajo hacia arriba: sostiene el texto sobre
                cualquier foto, incluidas las claras o muy cargadas. */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(to top, rgb(0 0 0 / 0.95) 0%, rgb(0 0 0 / 0.55) 45%, transparent 100%)',
              }}
            />

            <div className="absolute bottom-10 left-4 right-4 md:bottom-14 md:left-12 md:right-12">
              {slide.subtitle && <p className="shop-eyebrow mb-2">{slide.subtitle}</p>}
              {slide.title && (
                <Heading className="shop-display mb-6 text-5xl leading-none md:text-8xl">
                  {slide.title}
                </Heading>
              )}
              {slide.ctaLabel && (
                // Sin destino configurado el botón baja al catálogo, que es lo
                // que la portada está prometiendo.
                <a href={slide.ctaHref || '#catalogo'} className="shop-btn">
                  {slide.ctaLabel}
                </a>
              )}
            </div>
          </div>
        );
      })}

      {slides.length > 1 && (
        <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 gap-2">
          {slides.map((slide, index) => (
            <button
              key={`dot-${index}-${slide.imageUrl}`}
              type="button"
              onClick={() => setCurrent(index)}
              aria-label={`Ver portada ${index + 1} de ${slides.length}`}
              aria-current={index === current ? 'true' : undefined}
              className="h-1.5 transition-all duration-300"
              style={{
                width: index === current ? 28 : 12,
                background: index === current ? 'var(--accent)' : 'rgb(255 255 255 / 0.4)',
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}
