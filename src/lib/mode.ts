import "server-only";

/**
 * Ugyanaz a kód két külön telepítésként fut:
 * - `admin` (alapértelmezett): a projektadminisztrátor felülete; csak a `ADMIN_EMAILS`-ben felsorolt cím léphet be ide.
 * - `portal`: a meghívott munkatársak külön portálja, saját címmel; ide csak a projektmeghívóval létrehozott fiókok lépnek be.
 */
export const APP_MODE: "admin" | "portal" = process.env.APP_MODE === "portal" ? "portal" : "admin";
export const isPortal = APP_MODE === "portal";

/** Az adminisztrátori felületre jogosult e-mail-címek (vesszővel elválasztva). Ha nincs megadva, nincs korlátozás (csak fejlesztéshez). */
export function adminAllowed(email: string) {
  const list = (process.env.ADMIN_EMAILS ?? "").split(/[\s,;]+/).map((item) => item.trim().toLowerCase()).filter(Boolean);
  return list.length === 0 || list.includes(email.toLowerCase());
}

/** A munkatársi portál címe (az admin felület ide irányítja a meghívó-linkeket). */
export const PORTAL_URL = process.env.PORTAL_URL?.replace(/\/$/, "");
/** Az admin felület címe (a portál ide hivatkozik, ha egy admin tévedésből odamegy). */
export const ADMIN_URL = process.env.ADMIN_URL?.replace(/\/$/, "");
