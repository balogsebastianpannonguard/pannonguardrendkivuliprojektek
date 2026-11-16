# Biztonság – PannonGuard Rendkívüli projekt

- **Hozzáférés:** adminisztrátori fiókot csak az Elosztóból küldött, `Rendkívüli projekt` munkakörű, érvényes és vissza nem vont meghívóval lehet nyitni (egyszeri beváltás). Közreműködői fiókot csak projektmeghívóval (7 nap, egyszeri; a token hash-e tárolt).
- **Hitelesítés:** scrypt jelszó-hash, nincs második faktor (tudatos döntés): hosszú, egyedi jelszó kötelező (legalább 12 karakter). 8 hibás próbálkozás után 15 perc zárolás.
- **Munkamenet:** 12 órás élettartam, 2 óra tétlenség után lejár; élesben `__Host-` süti; kijelentkezés minden eszközről, jelszócserénél minden munkamenet megszűnik.
- **Jogosultság:** minden oldal és szerverművelet a projekt-szerepet (projektvezető / közreműködő / megtekintő) ellenőrzi a szerveren; a tag csak a saját projektjeit látja. Pajzsi ugyanezen a jogosultságon belül olvas, és semmit nem módosít jóváhagyás nélkül.
- **Pajzsi:** a felhasználói tartalom (feladatcím, megjegyzés) az AI számára adat, nem utasítás; minden módosítás emberi jóváhagyáshoz kötött, a végrehajtás újra ellenőrzi a jogosultságot és az adatokat; óránként 40 kérdés felhasználónként.
- **Visszavonás:** az Elosztóban visszavont admin-hozzáférést, illetve a letiltott tagot minden kérés ellenőrzi.
- **Naplózás:** regisztráció, csatlakozás, belépés, hibás jelszó, zárolás és kijelentkezés IP-vel és eszközzel; projektszintű tevékenységnapló.
- **Webes védelem:** CSP, HSTS, clickjacking- és MIME-védelem, noindex.

Teendő élesítés előtt: a projektadatok (feladatok, megjegyzések) kezelésének célját és megőrzési idejét rögzíteni (GDPR 30. cikk).
