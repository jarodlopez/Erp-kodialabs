import type { Metadata, Viewport } from 'next';

import { ToastProvider } from '@/components/ui/toast';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'ERP HomeMart',
    template: '%s · ERP HomeMart',
  },
  description:
    'Sistema ERP para gestión de inventario, ventas, compras, gastos, finanzas y reportes.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#4f46e5',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
