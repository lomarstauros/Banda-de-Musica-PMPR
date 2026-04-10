import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  // Configuração inicial do middleware (pass-through)
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  return response;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
