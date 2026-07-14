# Zaunanzeige-Tool

Internes Werkzeug für die Arbeitsgruppe: Koordinaten eingeben → Zuständigkeit
(Landratsamt) und Nähe zu FFH-/SPA-Schutzgebieten automatisch ermitteln →
ausgefülltes Anzeige-Dokument (.docx) auf Basis von `Musterbrief_Zaunanzeige.docx`
herunterladen.

Reine statische Seite, kein Build-Schritt, läuft direkt über GitHub Pages.

## Setup

1. Repo auf GitHub anlegen, diesen Ordner hochladen.
2. Unter **Settings → Pages** die Quelle auf den Branch (z.B. `main`, Root)
   stellen. Fertig — keine Installation, kein `npm install` nötig.
3. Zum lokalen Testen reicht ein einfacher Server (z.B. `python3 -m http.server`
   in diesem Ordner), da `fetch()` für das Template über `file://` nicht
   funktioniert.

## Was schon steht

- **Formular + Karte** (`index.html`, `js/app.js`, `js/map.js`) — Koordinaten
  eingeben, Punkt wird auf der Karte markiert, 5-km-Radius eingezeichnet.
- **Zuständigkeits-Ermittlung** (`js/geo.js: findLandkreis`) — Reverse-Geocoding
  über Nominatim (OpenStreetMap), liefert den Landkreisnamen.
- **FFH/SPA/NSG-Prüfung** (`js/geo.js: checkProtectedAreas`) — fragt den offenen
  WFS-Dienst des LfU Bayern ab (Schutzgebiete, CC BY 4.0), einmal auf "liegt
  direkt darin" und einmal auf "liegt im 5-km-Umkreis". Deckt ab:
  FFH-Gebiete (Flora-Fauna-Habitat-Gebiete), SPA-Gebiete (Vogelschutzgebiete)
  und Naturschutzgebiete.
- **Biotopkartierung** (`js/geo.js: checkBiotopkartierung`) — prüft, ob der
  Punkt in der Biotopkartierung Stadt, Flachland oder Alpen liegt. Bei
  „Alpen" ergänzt die generierte Anzeige automatisch alpine Arten
  (Raufußhühner, Gamswild) im Schutzgebiets-Absatz.
- **BayernAtlas-Direktlinks** (`js/bayernatlas.js`) — sobald ihr Koordinaten
  prüft, erscheinen zwei Links, die BayernAtlas bzw. BayernAtlas Plus in
  einem neuen Tab direkt an der Fundstelle öffnen (kein manuelles Suchen
  mehr nötig). Rechnet WGS84 → UTM32N (EPSG:25832) über proj4js um, da
  BayernAtlas-URLs dieses Koordinatensystem erwarten.
- **Brief-Generierung** (`js/letter.js`, `templates/zaunanzeige_template.docx`)
  — füllt euren echten Musterbrief (Briefkopf, Logo, Formatierung bleiben
  erhalten) mit den ermittelten Daten und fügt bei FFH/SPA-Treffer automatisch
  einen zusätzlichen Absatz ein.
- **Kontakt-Datenbank** (`data/landkreis-contacts.json`) — mit drei Beispielen
  aus euren Mustern vorbefüllt (Freising, Kelheim, München). Wächst mit jedem
  neuen Fall, den ihr bearbeitet.

## Was vor dem ersten echten Einsatz noch zu verifizieren ist

Ich konnte diese externen Dienste in meiner Umgebung nicht live testen
(kein Internetzugriff beim Bauen). Bitte einmal mit einem echten Fall
durchklicken und ggf. in `js/config.js` nachjustieren:

- **`SCHUTZGEBIETE_WFS_BASE`** — die URL sollte stimmen, aber die genauen
  Layer-Namen (FFH/SPA/NSG) werden zur Laufzeit automatisch aus den
  WFS-Capabilities erraten (`geo.js: discoverSchutzgebieteLayers`). Falls das
  im Ergebnis-Panel als "Layer nicht gefunden" auftaucht: die Konsole zeigt
  euch alle verfügbaren Layer-Namen, einen davon als `*_TYPENAME_HINT`
  in `config.js` eintragen.
- **`BIOTOPKARTIERUNG_WFS_BASE`** — anders als die Schutzgebiete-URL ist
  das hier eine **geratene** Adresse (nach dem Namensmuster der
  Schutzgebiete-URL gebaut), ich konnte sie nicht live prüfen. Bitte als
  Erstes testen; falls sie nicht erreichbar ist, in Bayern Atlas selbst
  über die Ebenen-Info von „Biotopkartierung Stadt/Flachland/Alpen" die
  echte WFS-Adresse nachschlagen (oder unter
  `https://www.lfu.bayern.de/gdi/wfs/natur/` nach dem passenden Dienst
  suchen) und hier eintragen.
- **`BAYERNATLAS_BASE_URL` / `BAYERNATLAS_PLUS_BASE_URL`** — nach
  öffentlicher Dokumentation gebaut, aber nicht live getestet. Falls der
  Link nicht an der richtigen Stelle landet: in BayernAtlas manuell über
  „Teilen" einen echten Link erzeugen und die dortigen Parameternamen/
  -werte mit denen in `js/bayernatlas.js` abgleichen.

### Warum kein automatischer Login für BayernAtlas Plus

Technisch nicht machbar von einer statischen Seite aus: Same-Origin-Policy
verhindert, dass JavaScript von eurer GitHub-Pages-Domain auf das Login-
Formular einer fremden Domain (geoportal.bayern.de) zugreift — das ist eine
Browser-Sicherheitsgrenze, kein Bayern-spezifisches Hindernis. Ein
Workaround (Browser-Extension, Server mit gespeicherten Zugangsdaten) würde
bedeuten, Zugangsdaten irgendwo im Tool zu hinterlegen, was ich für ein auf
GitHub geteiltes Projekt nicht bauen möchte. In der Praxis meist ohnehin
unnötig: Ist im selben Browser noch eine BayernAtlas-Plus-Sitzung aktiv,
öffnet der Direktlink automatisch im eingeloggten Zustand (normales
Cookie-Verhalten).
- **`GEOMETRY_PROPERTY`** — der Name der Geometriespalte im WFS
  (Standard-Vermutung: `"geom"`). Falls Abfragen leer bleiben oder Fehler
  werfen, per `DescribeFeatureType`-Aufruf den echten Namen prüfen (Anleitung
  steht als Kommentar in `config.js`).
- **`DOP_WMS_URL` / `DOP_WMS_LAYER`** — Bayerns Luftbild-WMS. Falls die
  Ebene "Luftbild" in der Karte leer bleibt, Endpoint über
  geoservices.bayern.de neu heraussuchen; OpenStreetMap als Basiskarte
  funktioniert davon unabhängig immer.
- **Kartenscreenshot ins Dokument einbetten** — `map.js: exportMapImage()`
  ist vorbereitet, aber noch nicht ins Anschreiben eingebunden (das würde
  bedeuten, das Bild als Anlage in die .docx einzufügen — machbar, aber ich
  hab's rausgelassen, bis der Rest läuft. Sag Bescheid, wenn das als
  nächstes dran soll).

## Bewusst nicht automatisiert: Flurnummer / Grundstückseigentümer

Bayern Atlas Plus zeigt Flurstücks- und ggf. Eigentümerdaten nur angemeldeten,
autorisierten Stellen — das ist kein offener Datensatz, sondern bewusst
zugangsbeschränkt (personenbezogene/kartografische Daten). Ich habe hier
bewusst keinen automatisierten Zugriff/Scraping dagegen gebaut, das wäre ein
Umgehen einer Zugriffskontrolle, unabhängig vom Zweck.

Praktisch heißt das: Wer will, trägt die Flurnummer nach manueller Suche in
Bayern Atlas Plus optional ins Feld im Formular ein (dauert pro Fall wenige
Sekunden) — sie landet dann automatisch in der Koordinatenzeile des Briefs.
Das entspricht ohnehin dem, was eure eigenen Musterbriefe machen: Ihr gebt
Koordinaten/GPS an und bittet die Behörde, den Eigentümer selbst zu ermitteln
— genau die Stelle, die dazu befugt ist.

## Nächste mögliche Schritte

- Kartenscreenshot als Anlage in die .docx einbetten.
- Zweites Template für den Fall "Bayerische Staatsforsten als Grundeigentümer"
  (angelehnt an `Musteranzeige_Zaun_SPA_Gebiet.docx`), falls das ein
  wiederkehrender Fall ist.
- Optionale KI-Textglättung, sobald gewünscht (bewusst erstmal ausgelassen).
