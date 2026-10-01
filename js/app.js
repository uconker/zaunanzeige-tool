import { CONFIG } from "./config.js";
import { findLandkreis, checkProtectedAreas } from "./geo.js";
import { buildBayernAtlasUrl, buildBayernAtlasPlusUrl } from "./bayernatlas.js";
import { initMap, setPoint } from "./map.js";
import { generateLetter, buildLetterData } from "./letter.js";

let landkreisContacts = {};
let lastCheck = null;

const $ = (id) => document.getElementById(id);

// Contacts are matched by a forgiving key: no spaces/dots/case, and "Stadt "/
// "Landeshauptstadt " prefixes are ignored. "Landkreis X" and "X" (the city) stay
// distinct, so Landkreis Passau and Stadt Passau don't collide.
function normKey(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/^(kreisfreie stadt|landeshauptstadt|stadt)\s+/, "")
    .replace(/[^a-zäöüß]/g, "");
}

function findContact(landkreisResult) {
  const raw = landkreisResult?.raw || {};
  const candidates = [raw.county, raw.city, raw.town, raw.municipality, landkreisResult?.landkreis, raw.state_district]
    .filter(Boolean);
  const index = new Map();
  for (const [key, entry] of Object.entries(landkreisContacts)) {
    if (key.startsWith("_")) continue;
    index.set(normKey(key), { key, entry });
  }
  for (const c of candidates) {
    const hit = index.get(normKey(c));
    if (hit) return hit;
  }
  return null;
}

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
  const found = findContact(landkreisResult);
  const contact = found ? found.entry : null;

  const parts = [];

  parts.push(`<h3>Zuständigkeit</h3>`);
  if (landkreisResult.error) {
    parts.push(`<p class="warn">Reverse-Geocoding fehlgeschlagen: ${landkreisResult.error}</p>`);
  } else if (!landkreisName) {
    parts.push(`<p class="warn">Konnte keinen Landkreis bestimmen. Bitte manuell prüfen.</p>`);
  } else if (contact && contact.pruefen) {
    parts.push(`<p><strong>${found.key}</strong> — <span class="warn">Adresse noch nicht bestätigt.</span> Mögliche Adressen:<br>
      ${(contact.alternativen || []).join("<br>")}<br>
      <span class="hint">Im Brief steht dafür ein Platzhalter. Richtige Adresse einmal in data/landkreis-contacts.json eintragen.</span></p>`);
  } else if (contact) {
    parts.push(`<p><strong>${found.key}</strong> — Kontakt hinterlegt:<br>
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
  $("copyBtn").disabled = false;
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
  const found = findContact(lastCheck.landkreisResult);
  let contact = found ? found.entry : null;
  if (contact && contact.pruefen) {
    // Unconfirmed address: never print a guess into an official letter.
    contact = {
      name: contact.name,
      department: contact.department,
      street: `{BITTE PRÜFEN: ${(contact.alternativen || []).join(" ODER ")}}`,
      plzOrt: "{BITTE PLZ ORT EINTRAGEN}",
    };
  }

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
    biotopCheck: { isAlpine: lastCheck.isAlpine }
  });

  // Removed the photo upload logic, back to simple text generation!
  await generateLetter(data);
}

// One tab-separated line for the shared tracker: paste it on the tracker page (Strg+V).
function areaSummary(spaCheck) {
  if (!spaCheck || spaCheck.error) return "";
  const parts = [];
  let anyChecked = false;
  for (const key of ["ffh", "spa", "nsg"]) {
    const r = spaCheck[key];
    if (!r || !r.checked) continue;
    anyChecked = true;
    if (r.inside || r.near) {
      parts.push(`${r.label} ${r.inside ? "innerhalb" : "im Umkreis"}${r.areaNames.length ? ": " + r.areaNames.join(", ") : ""}`);
    }
  }
  return parts.length ? parts.join("; ") : (anyChecked ? "kein Treffer" : "");
}

async function handleCopyForTracker() {
  if (!lastCheck) return;
  const found = findContact(lastCheck.landkreisResult);
  const landkreisName = lastCheck.landkreisResult.landkreis;
  const authority = found ? found.entry.name : (landkreisName ? `Landratsamt ${landkreisName}` : "");
  const flur = $("flurnummer").value;
  const clean = (v) => String(v || "").replace(/[\t\r\n]+/g, " ").trim();
  const row = [
    "ZA1",
    new Date().toLocaleDateString("sv"),
    $("preparerName").value,
    $("locationDescription").value,
    `${lastCheck.lat}, ${lastCheck.lon}${flur ? `, Flurnr. ${flur}` : ""}`,
    authority,
    areaSummary(lastCheck.spaCheck),
  ].map(clean).join("\t");

  let ok = false;
  try {
    await navigator.clipboard.writeText(row);
    ok = true;
  } catch (e) {
    const ta = document.createElement("textarea");
    ta.value = row;
    document.body.appendChild(ta);
    ta.select();
    try { ok = document.execCommand("copy"); } catch (e2) { ok = false; }
    document.body.removeChild(ta);
  }
  const btn = $("copyBtn");
  const old = btn.textContent;
  btn.textContent = ok ? "Kopiert ✓" : "Kopieren fehlgeschlagen";
  setTimeout(() => { btn.textContent = old; }, 2000);
}

async function init() {
  // 1. Connect the buttons FIRST so the page never resets, even if something else fails!
  const checkForm = $("checkForm");
  if (checkForm) {
    checkForm.addEventListener("submit", handleCheckSubmit);
  }
  
  const genBtn = $("generateBtn");
  if (genBtn) {
    genBtn.addEventListener("click", handleGenerate);
  }

  const copyBtn = $("copyBtn");
  if (copyBtn) {
    copyBtn.addEventListener("click", handleCopyForTracker);
  }

  const trackerLink = $("trackerLink");
  if (trackerLink && CONFIG.TRACKER_URL) {
    trackerLink.href = CONFIG.TRACKER_URL;
    trackerLink.hidden = false;
  }

  // 2. Load the map safely
  try {
    initMap("map");
  } catch (error) {
    console.error("Fehler beim Laden der Karte:", error);
  }

  // 3. Load the contacts safely
  try {
    await loadContacts();
  } catch (error) {
    console.error("Fehler beim Laden der Kontakte (landkreis-contacts.json):", error);
  }
}

init();
