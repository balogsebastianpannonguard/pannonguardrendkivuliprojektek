import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, validateSessionToken } from "@/lib/session";

// Belépés nélkül is elérhető oldalak; a jogosultságot maguk ellenőrzik.
const PUBLIC_PATHS = ["/login", "/regisztracio"];
// A meghívó- és jelszó-visszaállító link belépve és kilépve is megnyitható (az e-mailből érkezik).
const OPEN_PATHS = ["/meghivo", "/jelszo-visszaallitas"];

export async function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  // Adatbázishiba esetén a kérés nem kap hozzáférést.
  const session = await validateSessionToken(token).catch(() => null);
  const signedIn = Boolean(session);
  const path = request.nextUrl.pathname;
  if (OPEN_PATHS.includes(path)) return NextResponse.next();
  const isPublic = PUBLIC_PATHS.includes(path);

  if (!signedIn && !isPublic) {
    const url = new URL("/login", request.url);
    if (path !== "/") url.searchParams.set("next", path + request.nextUrl.search);
    return NextResponse.redirect(url);
  }
  if (signedIn && isPublic) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.png|logo.png).*)"],
};
