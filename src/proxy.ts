import { NextResponse, type NextRequest } from 'next/server';

/**
 * Proxy de enrutamiento (antes «middleware»).
 *
 * IMPORTANTE: aquí SOLO se comprueba la presencia de la cookie de sesión.
 * La verificación criptográfica del token ocurre en el servidor (Node.js) al
 * renderizar cada página protegida y en cada Server Action, porque el Admin
 * SDK de Firebase no puede ejecutarse en este runtime.
 * De este modo el proxy solo evita viajes innecesarios, nunca sustituye a la
 * autorización real.
 */
const SESSION_COOKIE = '__erp_session';

const PUBLIC_PATHS = ['/login', '/registro', '/recuperar'];

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  const isPublic = PUBLIC_PATHS.some((path) => pathname.startsWith(path));

  if (!hasSession && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  if (hasSession && isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Se excluyen los recursos estáticos, los endpoints de API (que aplican su
     * propia autorización) y los archivos con extensión.
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.[^/]+$).*)',
  ],
};
