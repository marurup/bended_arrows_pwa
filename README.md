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
| Mellem | 8×11 | 4 | op til 6 prikker | 2 | ja |
| Svær | 10×14 | 3 | op til 9 prikker, mange knæk | 1 | nej |
| Ekspert | 12×17 | 2 | op til 14 prikker, snoede | 0 | nej |

Sværhedsgraden styrer også, hvor tæt pilene er flettet ind i hinanden: på de svære baner er der færre frie pile ad gangen og længere kæder af pile, der venter på hinanden.

Typiske tal (fra `npm run stats`):

| | Pile | Frie pile ad gangen (gns.) | "Runder" før banen er tom |
|---|---|---|---|
| Let | ~15 | ~5,5 | ~2 |
| Mellem | ~18 | ~3,9 | ~6 |
| Svær | ~21 | ~3,2 | ~8 |
| Ekspert | ~25 | ~3,2 | ~10 |

Hver sværhedsgrad har uendeligt mange baner (Bane 1, 2, 3, …). En bane er altid den samme, så "Prøv igen" giver præcis samme opstilling. Fremskridt og en igangværende bane gemmes på telefonen.

## Sådan laves banerne

Banerne genereres i `js/generator.js` – baglæns:

1. Pilene lægges ud én ad gangen. En ny pil skal altid have fri bane ud til kanten forbi de pile, der allerede ligger.
2. Derfor kan banen altid løses: fjern pilene i omvendt rækkefølge.
3. Senere pile må gerne lægge sig i vejen for tidligere pile – det er det, der skaber puslespillet. På de svære niveauer foretrækker generatoren pile, der spærrer for en pil, som ellers ville være fri.
4. Til sidst fyldes småhuller ud ved at forlænge naboer, og korte pile flettes sammen med nabopile, så banen bliver tæt og "labyrint-agtig".

Hver bane laves i nogle få forsøg, og det forsøg der passer bedst til sværhedsgraden vælges. Det tager få millisekunder.

## Kør lokalt

Der er ingen build-trin – det er ren HTML, CSS og JavaScript (ES-moduler).

```sh
npm start        # serverer mappen på http://localhost:8080
npm test         # tester spilregler og at alle genererede baner kan løses
npm run stats    # statistik over banerne for hver sværhedsgrad
```

Service workeren (offline) virker kun over `https` eller på `localhost`.

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
| `js/board.js` | Spillereglerne: hvornår en pil kan komme ud |
| `js/generator.js` | Banegenerator og sværhedsgrader |
| `js/view.js` | Tegning på canvas, animationer, tryk og zoom |
| `js/audio.js` | Små lydeffekter (syntetiseret, ingen lydfiler) |
| `js/rng.js` | Seedet tilfældighedsgenerator |
| `sw.js`, `manifest.webmanifest` | PWA: offline-cache og app-info |
| `scripts/make-icons.mjs` | Tegner app-ikonerne i `icons/` |

Ved ændringer:

- Tilføjes eller fjernes filer, så opdatér listen og `VERSION` i `sw.js`.
- Ændres generatoren, så hæv `GENERATOR_VERSION` i `js/generator.js` (alle baner bliver nye, og en gemt igangværende bane kasseres).
