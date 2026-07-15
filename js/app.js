import { CONFIG } from "./config.js";
import { findLandkreis, checkProtectedAreas } from "./geo.js";
import { buildBayernAtlasUrl, buildBayernAtlasPlusUrl } from "./bayernatlas.js";
import { initMap, setPoint } from "./map.js";
import { generateLetter, buildLetterData } from "./letter.js";

let landkreisContacts = {};
let lastCheck = null; 

const $ = (id) => document.getElementById(id);

async function loadContacts() {
  const res = await fetch("data/landkreis-contacts.json");
  landkreisContacts = await res.json();
}

function renderResult(html) {
  $("result").innerHTML = html;
}

async function runCheck(lat, lon, isAlpine) {
  renderResult("<p>Prüfe Zuständigkeit und lokale Schutzgebiete …</p>");
  setPoint(lat, lon, { radiusM: CONFIG.NEAR_RADIUS_M });

  $("atlasLinks").innerHTML = `
    <a href="${buildBayernAtlasUrl(lat, lon)}" target="_blank" rel="noopener">BayernAtlas öffnen ↗</a>
    <a href="${buildBayernAtlasPlusUrl(lat, lon)}" target="_blank" rel="noopener">BayernAtlas Plus öffnen ↗</a>
    <span class="hint">(Plus erfordert Login — bei aktiver Sitzung im selben Browser bereits angemeldet)</span>
  `;

  const [landkreisResult, spaCheck] = await Promise.all([
    findLandkreis(lat, lon).catch((e) => ({ error: e.message })),
    checkProtectedAreas(lat, lon).catch((e) => ({ error: e.message }))
  ]);

  lastCheck = { lat, lon, landkreisResult, spaCheck, isAlpine };

  const landkreisName = landkreisResult.landkreis;
  const contact = landkreisName ? landkreisContacts[landkreisName] : null;

  const parts = [];

  parts.push(`<h3>Zuständigkeit</h3>`);
  if (landkreisResult.error) {
    parts.push(`<p class="warn">Reverse-Geocoding fehlgeschlagen: ${landkreisResult.error}</p>`);
  } else if (!landkreisName) {
    parts.push(`<p class="warn">Konnte keinen Landkreis bestimmen. Bitte manuell prüfen.</p>`);
  } else if (contact) {
    parts.push(`<p><strong>${landkreisName}</strong> — Kontakt hinterlegt:<br>
      ${contact.department || ""}<br>${contact.street || ""}<br>${contact.plzOrt || ""}</p>`);
  } else {
    parts.push(`<p><strong>${landkreisName}</strong> — <span class="warn">kein Kontakt in data/landkreis-contacts.json hinterlegt. Bitte einmalig ergänzen.</span></p>`);
  }

  parts.push(`<h3>Schutzgebiete (Umkreis ${CONFIG.NEAR_RADIUS_M / 1000} km)</h3>`);
  if (spaCheck.error) {
    parts.push(`<p class="warn">Schutzgebiets-Abfrage fehlgeschlagen: ${spaCheck.error}</p>`);
  } else {
    for (const key of ["ffh", "spa", "nsg"]) {
      const r = spaCheck[key];
      if (!r.checked) {
        // Updated text helper to explicitly guide towards the .json extension format
        parts.push(`<p class="warn">${r.label}: Lokale Datei nicht gefunden (data/schutzgebiete/${key}.json prüfen).</p>`);
      } else if (r.inside) {
        parts.push(`<p class="hit">⚠ Liegt INNERHALB eines ${r.label}: ${r.areaNames.join(", ") || "(Name unbekannt)"}</p>`);
      } else if (r.near) {
        parts.push(`<p class="hit">⚠ Liegt IM UMKREIS eines ${r.label}: ${r.areaNames.join(", ") || "(Name unbekannt)"}</p>`);
      } else {
        parts.push(`<p>Kein ${r.label} in der Nähe.</p>`);
      }
    }
  }

  parts.push(`<h3>Alpenraum</h3>`);
  if (isAlpine) {
    parts.push(`<p>Einordnung: <strong>Alpen</strong> — alpine Arten (z.B. Gamswild, Raufußhühner) werden in der Anzeige berücksichtigt.</p>`);
  } else {
    parts.push(`<p>Fundstelle liegt im Flachland/Stadtgebiet (keine alpinen Arten eingefügt).</p>`);
  }

  renderResult(parts.join("\n"));
  $("generateBtn").disabled = false;
}

async function handleCheckSubmit(e) {
  e.preventDefault();
  const lat = parseFloat($("lat").value);
  const lon = parseFloat($("lon").value);
  const isAlpine = $("isAlpine").checked; 
  
  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    renderResult('<p class="warn">Bitte gültige Koordinaten eingeben.</p>');
    return;
  }
  await runCheck(lat, lon, isAlpine);
}

async function handleGenerate(e) {
  e.preventDefault();
  if (!lastCheck) return;

  const landkreisName = lastCheck.landkreisResult.landkreis;
  const contact = landkreisName ? landkreisContacts[landkreisName] : null;

  const data = buildLetterData({
    authority: contact || {
      name: landkreisName ? `Landratsamt ${landkreisName}` : "{BITTE BEHÖRDE EINTRAGEN}",
      department: "Untere Naturschutzbehörde",
      street: "{BITTE STRASSE EINTRAGEN}",
      plzOrt: "{BITTE PLZ ORT EINTRAGEN}",
    },
    ortDatum: $("ortDatum").value || `München, ${new Date().toLocaleDateString("de-DE")}`,
    locationDescription: $("locationDescription").value,
    coordinatesLine: `(Koordinaten: ${lastCheck.lat}, ${lastCheck.lon}${$("flurnummer").value ? `, Flurnummer: ${$("flurnummer").value}` : ""})`,
    preparerName: $("preparerName").value,
    spaCheck: lastCheck.spaCheck,
    biotopCheck: { isAlpine: lastCheck.isAlpine }, 
  });

  await generateLetter(data);
}

async function init() {
  initMap("map");
  await loadContacts();
  $("checkForm").addEventListener("submit", handleCheckSubmit);
  $("generateBtn").addEventListener("click", handleGenerate);
}

init();
