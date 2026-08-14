import type { Metadata, Viewport } from 'next';

import { ToastProvider } from '@/components/ui/toast';
import { RegisterServiceWorker } from '@/components/pwa/register-sw';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Kodialabs ERP',
    template: '%s · Kodialabs',
  },
  description:
    'Sistema ERP para gestión de inventario, ventas, compras, gastos, finanzas y reportes.',
  applicationName: 'Kodialabs',
  robots: { index: false, follow: false },
  icons: {
    icon: '/icon-192.png',
    apple: '/apple-icon.png',
  },
  appleWebApp: {
    capable: true,
    title: 'Kodialabs',
    statusBarStyle: 'default',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f4f1ea',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <ToastProvider>{children}</ToastProvider>
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
