'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Keyboard } from 'lucide-react';

import { Modal } from '@/components/ui/modal';
import { Button, Field, Input } from '@/components/ui/primitives';

/**
 * Escáner de código de barras con la cámara del dispositivo.
 *
 * Usa la API nativa `BarcodeDetector` (disponible en Chrome para Android, que
 * es el navegador móvil objetivo). Cuando no está disponible —Safari/iOS o
 * escritorio— cae de forma transparente a la captura manual del código.
 *
 * Requiere contexto seguro (HTTPS); en Vercel siempre lo es.
 */

type DetectedBarcode = { rawValue: string };
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: {
      new (opts?: { formats?: string[] }): BarcodeDetectorLike;
      getSupportedFormats?: () => Promise<string[]>;
    };
  }
}

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'codabar'];

export function BarcodeScanner({
  open,
  onClose,
  onDetect,
  title = 'Escanear código de barras',
}: {
  open: boolean;
  onClose: () => void;
  onDetect: (code: string) => void;
  title?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const detectorRef = useRef<BarcodeDetectorLike | null>(null);
  const activeRef = useRef(false);

  const [manual, setManual] = useState('');
  const [status, setStatus] = useState<'idle' | 'starting' | 'scanning' | 'unsupported' | 'denied'>(
    'idle',
  );

  const stop = useCallback(() => {
    activeRef.current = false;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const finish = useCallback(
    (code: string) => {
      const trimmed = code.trim();
      if (!trimmed) return;
      stop();
      onDetect(trimmed);
    },
    [onDetect, stop],
  );

  useEffect(() => {
    if (!open) {
      stop();
      setManual('');
      setStatus('idle');
      return;
    }

    // Sin soporte de cámara/BarcodeDetector: solo captura manual.
    const supported =
      typeof window !== 'undefined' &&
      typeof window.BarcodeDetector === 'function' &&
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices?.getUserMedia;

    if (!supported) {
      setStatus('unsupported');
      return;
    }

    let cancelled = false;
    setStatus('starting');
    activeRef.current = true;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play().catch(() => undefined);

        detectorRef.current = new window.BarcodeDetector!({ formats: FORMATS });
        setStatus('scanning');

        const tick = async () => {
          if (!activeRef.current || !videoRef.current || !detectorRef.current) return;
          if (videoRef.current.readyState >= 2) {
            try {
              const found = await detectorRef.current.detect(videoRef.current);
              if (found.length > 0 && found[0].rawValue) {
                finish(found[0].rawValue);
                return;
              }
            } catch {
              // Un frame ilegible no debe detener el bucle.
            }
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch {
        if (!cancelled) setStatus('denied');
      }
    })();

    return () => {
      cancelled = true;
      stop();
    };
  }, [open, stop, finish]);

  return (
    <Modal open={open} onClose={onClose} title={title} size="md">
      <div className="space-y-4">
        {status === 'scanning' || status === 'starting' ? (
          <div className="relative overflow-hidden rounded-xl bg-black">
            <video
              ref={videoRef}
              playsInline
              muted
              className="h-64 w-full object-cover"
              aria-label="Vista de la cámara"
            />
            {/* Guía visual */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-24 w-4/5 rounded-lg border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]" />
            </div>
            <div className="absolute bottom-2 left-0 right-0 text-center text-xs font-medium text-white/90">
              {status === 'starting' ? 'Iniciando cámara…' : 'Apunta al código de barras'}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-lg bg-[var(--color-canvas)] p-4 text-sm text-[var(--color-ink-muted)]">
            <Camera className="h-5 w-5 shrink-0 text-[var(--color-ink-subtle)]" />
            {status === 'unsupported' && (
              <span>
                Este navegador no admite escaneo con cámara. Escribe el código manualmente abajo (en
                Android usa Google Chrome para escanear con la cámara).
              </span>
            )}
            {status === 'denied' && (
              <span>
                No se pudo acceder a la cámara. Revisa los permisos del navegador o escribe el código
                manualmente.
              </span>
            )}
            {status === 'idle' && <span>Preparando…</span>}
          </div>
        )}

        {/* Captura manual, siempre disponible como respaldo */}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            finish(manual);
          }}
        >
          <Field label="O escribe el código" htmlFor="manual-barcode">
            <div className="flex gap-2">
              <Input
                id="manual-barcode"
                value={manual}
                onChange={(event) => setManual(event.target.value)}
                inputMode="numeric"
                autoComplete="off"
                placeholder="Ej. 7501234567890"
              />
              <Button type="submit" variant="secondary" disabled={!manual.trim()}>
                <Keyboard className="h-4 w-4" /> Usar
              </Button>
            </div>
          </Field>
        </form>
      </div>
    </Modal>
  );
}
