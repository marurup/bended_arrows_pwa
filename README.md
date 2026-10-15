# Bended Arrows

Et puslespil til mobilen, lavet som PWA (installérbar web-app, virker offline).

Spillepladen ligner et stykke ternet papir. Mellem prikkerne er der tegnet pile – nogle lige, andre med et eller flere knæk – så det hele ligner en labyrint. Målet er at få alle pilene af papiret.

## Sådan spiller du

- Tryk på en pil. Den glider ud af banen i den retning, den peger: hovedet først, og resten følger efter som en slange.
- Står en anden pil i vejen på den lige linje foran hovedet, støder de sammen. Du mister et liv, og pilen glider tilbage.
- Når en pil er væk, kan de pile, den spærrede for, komme fri. Fjern alle pile for at klare banen.
- **Tip** markerer en pil, der kan fjernes. På de store baner kan du zoome med to fingre.

At fjerne en pil gør aldrig en anden pil fanget, så man kan ikke "låse sig fast". Udfordringen er at se, hvilke pile der er fri – og liv er hvor mange fejl du har råd til.

## Sværhedsgrader

| | Bane | Liv | Pile | Tip | Farver |
|---|---|---|---|---|---|
| Let | 6×8 | 5 | korte (2–4 prikker), få knæk | 3 | ja |
| Mellem | 9×12 | 4 | op til 6 prikker | 2 | ja |
| Svær | 11×16 | 3 | op til 8 prikker, mange knæk | 1 | nej |
| Ekspert | 14×20 | 2 | op til 8 prikker, snoede | 0 | nej |

Sværhedsgraden styrer også, hvor tæt pilene er flettet ind i hinanden: på de svære baner er der færre frie pile ad gangen (færre gyldige træk at vælge imellem) og længere kæder af pile, der venter på hinanden.

Typiske tal (fra `npm run stats`):

| | Pile | Frie pile ad gangen (gns.) | "Runder" før banen er tom |
|---|---|---|---|
| Let | ~15 | ~4,9 | ~3 |
| Mellem | ~21 | ~3,0 | ~8 |
| Svær | ~28 | ~2,2 | ~14 |
| Ekspert | ~45 | ~1,3 | ~35 |

På Ekspert er der altså som regel kun én pil, der kan fjernes – den skal findes blandt op til 45.

Tryk, der lander omtrent midt mellem to pile, ignoreres, så et upræcist tryk ikke koster et liv.

Hver sværhedsgrad har uendeligt mange baner (Bane 1, 2, 3, …). En bane er altid den samme, så "Prøv igen" giver præcis samme opstilling. Fremskridt og en igangværende bane gemmes på telefonen.

## Sådan laves banerne

Banerne genereres i `js/generator.js` – baglæns:

1. Pilene lægges ud én ad gangen. En ny pil skal altid have fri bane ud til kanten forbi de pile, der allerede ligger.
2. Derfor kan banen altid løses: fjern pilene i omvendt rækkefølge.
3. Senere pile må gerne lægge sig i vejen for tidligere pile – det er det, der skaber puslespillet. På de svære niveauer foretrækker generatoren pile, der spærrer for en pil, som ellers ville være fri.
4. Småhuller fyldes ud ved at forlænge naboer, og korte pile flettes sammen med nabopile, så banen bliver tæt og "labyrint-agtig".
5. Til sidst finjusteres den færdige bane (undtagen på Let): tusindvis af små ændringer – vend en pil, eller giv en endeprik videre til en nabopil – prøves af, og en ændring beholdes kun, hvis banen stadig kan løses og kommer tættere på sværhedsgradens mål for, hvor mange pile der er frie ad gangen.

En Ekspert-bane tager omkring 50 ms at lave på en computer og et par tiendedele sekund på en langsom telefon; imens står der "Bygger banen …".

## Kør lokalt

Der er ingen build-trin – det er ren HTML, CSS og JavaScript (ES-moduler).

```sh
npm start        # serverer mappen på http://localhost:8080
npm test         # tester spilregler og at alle genererede baner kan løses
npm run stats    # statistik over banerne for hver sværhedsgrad
```

Service workeren (offline) virker kun over `https` eller på `localhost`. Lokalt henter den altid filerne fra serveren først, så ændringer ses med det samme.

## Version og opdateringer

Nederst på forsiden står hvilken version der kører – commit-hash og dato, som link til commit'en på GitHub. Lokalt står der "Udviklingsversion".

Ved udgivelse stempler `scripts/stamp-version.mjs` versionen ind i de udgivne filer: scripts og stylesheets indlæses som `fil.js?v=<hash>`, og service workeren får sin egen cache pr. udgivelse. En ny udgivelse kan derfor aldrig blandes med gamle filer i browseren. Browseren henter den nye udgivelse i baggrunden, og næste gang spillet åbnes, kører den nye version.

Er der kommet en nyere udgivelse end den der kører, viser forsiden **Ny version klar – opdatér**, som henter den nye version med det samme. **Installér som app** vises kun, når spillet ikke allerede er installeret; på iPhone forklarer den, hvordan man føjer spillet til hjemmeskærmen.

## Udgiv og installér

Workflowet `.github/workflows/pages.yml` udgiver spillet på GitHub Pages ved hvert push til `main`. Det skal slås til én gang: **Settings → Pages → Build and deployment → Source: GitHub Actions**. Spillet ligger så på `https://<bruger>.github.io/bended_arrows_pwa/`.

Installér på telefonen:

- **iPhone (Safari):** Del-knappen → *Føj til hjemmeskærm*.
- **Android (Chrome):** menuen → *Installer app* (eller *Føj til startskærm*).

## Filer

| Fil | Indhold |
|---|---|
| `index.html`, `css/style.css` | Menu, spilskærm og dialoger |
| `js/main.js` | Spillets gang: liv, tip, gemt fremskridt, skærme |
| `js/app-info.js`, `js/version.js` | Version, "ny version"-knap og installér-knap på forsiden |
| `js/board.js` | Spillereglerne: hvornår en pil kan komme ud |
| `js/generator.js` | Banegenerator og sværhedsgrader |
| `js/view.js` | Tegning på canvas, animationer, tryk og zoom |
| `js/audio.js` | Små lydeffekter (syntetiseret, ingen lydfiler) |
| `js/rng.js` | Seedet tilfældighedsgenerator |
| `sw.js`, `manifest.webmanifest` | PWA: offline-cache og app-info |
| `scripts/make-icons.mjs` | Tegner app-ikonerne i `icons/` |
| `scripts/stamp-version.mjs` | Stempler versionen ind ved udgivelse |

Ved ændringer:

- Tilføjes eller fjernes filer, så opdatér listen `FILES` i `sw.js`.
- Ændres generatoren, så hæv `GENERATOR_VERSION` i `js/generator.js` (alle baner bliver nye, og en gemt igangværende bane kasseres).
