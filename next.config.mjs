/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // El linting se ejecuta aparte con `npm run lint`; Next 16 ya no lo corre
  // durante el build, por lo que no hay configuración que declarar aquí.
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com' },
      { protocol: 'https', hostname: 'storage.googleapis.com' },
    ],
  },
  // firebase-admin usa binarios/paquetes de Node que no deben ser empaquetados
  // por el bundler del servidor.
  serverExternalPackages: ['firebase-admin', 'google-auth-library', 'farmhash-modern'],
};

export default nextConfig;
