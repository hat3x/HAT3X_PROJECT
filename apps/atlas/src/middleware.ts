import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { decidirRuta, type Aal } from "@/lib/auth/guardia";

export async function middleware(peticion: NextRequest) {
  let respuesta = NextResponse.next({ request: peticion });

  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => peticion.cookies.getAll(),
        setAll: (galletas) => {
          galletas.forEach(({ name, value }) => peticion.cookies.set(name, value));
          respuesta = NextResponse.next({ request: peticion });
          galletas.forEach(({ name, value, options }) =>
            respuesta.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await sb.auth.getUser();
  const { data: niveles } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();

  const destino = decidirRuta(
    {
      haySesion: user !== null,
      nivelActual: (niveles?.currentLevel ?? null) as Aal | null,
      nivelExigido: (niveles?.nextLevel ?? null) as Aal | null,
    },
    peticion.nextUrl.pathname
  );

  if (destino) {
    const url = peticion.nextUrl.clone();
    url.pathname = destino;
    return NextResponse.redirect(url);
  }

  // La barra lateral necesita la ruta para marcar la entrada activa, y los
  // componentes de servidor no tienen acceso a la URL.
  respuesta.headers.set("x-pathname", peticion.nextUrl.pathname);
  return respuesta;
}

// Next exige que esto sea un literal: lo analiza en el build, así que no puede
// venir de una variable ni de otro módulo. Lo vigila src/tests/pwa/instalable.test.ts.
//
// El manifiesto y el service worker tienen que quedar FUERA. Con sesión el
// guardia los dejaría pasar, pero sin ella los redirige a /login: el navegador
// recibe un 307 donde esperaba JSON o JavaScript, y Atlas no se instala.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|manifest\\.webmanifest|sw\\.js|.*\\.png$).*)",
  ],
};
