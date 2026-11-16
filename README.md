# PannonGuard Rendkívüli projekt

Projektmenedzsment-alrendszer a PannonGuard Komplexben. Egy adminisztrátor projekteket hoz létre, és meghívja beléjük azokat, akikkel együtt dolgozik; a projekteken belül feladatok, felelősök, határidők és megjegyzések vannak. **Kétlépcsős azonosítás nincs**, a belépés e-mail-cím + jelszó.

## Működés

- **Adminisztrátor:** az Elosztóban a `Rendkívüli projekt` munkakörre küldött meghívó regisztrációs linkje ide mutat (`/regisztracio?token=…`). Az admin minden projektet lát és kezel, és csak ő hozhat létre vagy törölhet projektet. Jelszavát az Elosztóból lehet visszaállítani.
- **Közreműködők:** a projekten belül a projektvezető vagy az admin e-mail-címmel hív meg embereket (`/meghivo?token=…`, 7 napig érvényes, egyszer használható). Új ember a linken fiókot hoz létre; akinek már van fiókja, belépve elfogadja (Meghívásaim). A tag csak azokat a projekteket látja, amelyekbe meghívták. A jelszó-visszaállító linket az admin állítja ki a Tagok fülön (24 óra, egyszer használható).
- **Szerepek projektenként:** projektvezető (kezel, meghív, minden feladatot szerkeszt), közreműködő (feladatot hoz létre/szerkeszt, kommentel), megtekintő (csak olvas). A jogosultság központi szabálya a `src/lib/projects.ts` `can` objektuma; minden oldal és szerverművelet ezen át dönt.
- **Projektek:** tábla (Teendő / Folyamatban / Ellenőrzésre vár / Kész), lista, tagok, tevékenységnapló, beállítások. Feladatoldal szerkesztéssel és megjegyzésekkel; „Feladataim” és „Meghívásaim” oldal.
- **Pajzsi (okos asszisztens):** Gemini eszközhívással. A felhasználó jogosultságán belül lekérdezi a projekteket, feladatokat, terhelést, és állapotjelentést, tervet, szöveget ad. Módosítani csak **javaslattal** tud (új feladat, módosítás, megjegyzés, meghívó): ezeket a felhasználó a csevegőablakban jóváhagyja, és csak ekkor hajtódnak végre – ugyanazokkal a jogosultság-ellenőrzésekkel, mint az űrlapoknál (`src/lib/task-ops.ts`). A Tevékenység fül jelzi, ha Pajzsi segített. Hibabejelentés e-mailben.

## Környezeti változók

| Változó | Leírás |
| --- | --- |
| `MONGODB_URI` | MongoDB kapcsolat (közös fürt) |
| `MONGODB_DB` | Saját adatbázis (`pannonguard_rendkivuli`) |
| `INVITES_DB` | Az Elosztó adatbázisa (`pannonguard_eloszto`) |
| `GEMINI_API_KEY` | Pajzsi (Google Gemini) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `EMAIL_USER`, `EMAIL_PASS` | Meghívó levelek és hibabejelentés |
| `APP_URL` | (opcionális) az alkalmazás nyilvános címe a meghívó-linkekhez |
| `TICKET_TO` | (opcionális) a bejelentéseket fogadó cím |

## Fejlesztés

```bash
npm install
npm run dev   # http://localhost:3009
```
