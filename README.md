# VettaFinder – demo

App mobile (React Native + Expo) in stile PeakFinder per **Piemonte e Alpi francesi**.

## Funzioni

| Scheda | Cosa fa |
|---|---|
| **Mappa** | Mappa topografica OpenTopoMap o satellite (Leaflet, nessuna chiave API) con le cime. Tocca una cima per la scheda, **tieni premuto** su un punto per vedere il panorama da lì, ☁️ scarica altre cime da OpenStreetMap per la zona inquadrata. |
| **Cerca** | Ricerca per nome (anche senza accenti), filtri per regione e 4000+, ordinamento per distanza, quota o nome. |
| **AR** | Fotocamera con i nomi delle cime sovrapposti (GPS + bussola + inclinometro) e la linea dell'orizzonte calcolata dal terreno. **Trascina di lato** per correggere la bussola, +/- per adattare il campo visivo al tuo telefono. |
| **Panorama** | Panorama a 360° disegnato dal modello del terreno (DEM Copernicus via Open-Meteo), con creste a piani e nomi delle cime visibili. Funziona dalla tua posizione, da Torino (predefinito senza GPS), da qualsiasi vetta ("Panorama dalla vetta") o da un punto della mappa. |

La scheda della cima mostra quota, distanza, direzione, angolo di elevazione e se è **visibile o nascosta dal terreno** dal punto di vista corrente.

## Installare l'APK su Android

L'APK viene compilato gratis da **GitHub Actions** (file `.github/workflows/build-apk.yml`).

1. Crea un repository su GitHub e carica il contenuto di questa cartella (inclusa la cartella nascosta `.github`).
2. Ad ogni push su `main` parte la compilazione (tab **Actions**, ~15-20 minuti).
3. A fine build trovi `VettaFinder.apk` nella pagina **Releases** del repository.
4. Dal telefono apri quella pagina, scarica l'APK e toccalo. Android chiederà di consentire l'installazione da "origini sconosciute" per il browser: consenti e installa.

> Se il repository è privato, per scaricare l'APK dal telefono devi essere loggato su GitHub.

L'APK è firmato con la chiave di debug: va benissimo per installarlo sui tuoi telefoni, non per il Play Store.

## Sviluppo con Expo Go (opzionale)

```bash
npm install
npx expo install --fix
npx expo start
```

## Struttura

```
App.tsx                    barra a schede
.github/workflows/         compilazione automatica dell'APK
src/data/peaks.ts          ~110 cime (Piemonte, VdA, Francia, confine CH)
src/lib/geo.ts             distanza, azimut, angolo con curvatura e rifrazione
src/lib/terrain.ts         profilo dell'orizzonte da DEM + test di visibilità
src/lib/osm.ts             cime aggiuntive da OpenStreetMap (Overpass)
src/lib/sensors.ts         bussola e inclinazione
src/state/AppState.tsx     stato condiviso (GPS, punto di vista, cime, orizzonte)
src/screens/*              Mappa, Cerca, AR, Panorama
src/components/PeakSheet   scheda della cima
```

## Limiti della demo

- **Coordinate delle cime** inserite a mano: precisione ±300 m. Per dati migliori usa il pulsante OSM sulla mappa.
- **Terreno**: 180 raggi (ogni 2°) × 40 campioni fino a 160 km, ~73 richieste all'API gratuita Open-Meteo (limite ~10.000/giorno). Serve internet; il risultato resta in cache per la sessione. In GPS viene ricalcolato solo dopo 1 km di spostamento.
- **Bussola in AR**: la precisione dipende dal telefono; su alcuni Android con il telefono verticale la direzione può essere sfalsata. Trascina di lato per correggere (↻ azzera). Rollio (telefono storto) non compensato.
- **Campo visivo**: 60° verticali di default; regolalo con +/- finché i nomi combaciano con le cime.
- Nessuna modalità offline, nessun salvataggio tra una sessione e l'altra.

## Crediti dati

© OpenStreetMap contributors · OpenTopoMap (CC-BY-SA) · Copernicus DEM tramite Open-Meteo.
