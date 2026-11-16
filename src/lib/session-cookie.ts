// A munkamenet-süti neve; külön fájlban, hogy a proxy adatbázis-függőség nélkül is használhassa.
export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-pg_rendkivuli_session" : "pg_rendkivuli_session";
