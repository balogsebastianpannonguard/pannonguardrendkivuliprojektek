import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session-cookie";

// Belépés nélkül is elérhető oldalak; a jogosultságot maguk ellenőrzik.
const PUBLIC_PATHS = ["/login", "/regisztracio", "/meghivo", "/jelszo-visszaallitas"];

/**
 * Gyors, adatbázis nélküli előszűrő: süti nélkül a belépőoldalra küld. A munkamenet tényleges érvényességét
 * (lejárat, visszavonás, jogosultság) minden védett oldal és szerverművelet maga ellenőrzi a `requireUser`-rel.
 */
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (PUBLIC_PATHS.includes(path)) return NextResponse.next();
  if (!request.cookies.get(SESSION_COOKIE)?.value) {
    const url = new URL("/login", request.url);
    if (path !== "/") url.searchParams.set("next", path + request.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.png|logo.png).*)"],
};
