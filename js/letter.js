// Uses PizZip + docxtemplater (loaded as globals from CDN in index.html)
// to fill templates/zaunanzeige_template.docx and trigger a download.
// The template's tags: {authority_name} {authority_department}
// {authority_street} {authority_plz_ort} {ort_datum} {location_description}
// {coordinates_line} {preparer_name}, plus an optional {#spa_hit}...{/spa_hit}
// section with {spa_lage_phrase} {spa_gebiet_name} {spa_arten}.

const TEMPLATE_PATH = "templates/zaunanzeige_template.docx";

export async function generateLetter(data) {
  const res = await fetch(TEMPLATE_PATH);
  if (!res.ok) throw new Error(`Could not load letter template (${res.status})`);
  const arrayBuffer = await res.arrayBuffer();

  const zip = new PizZip(arrayBuffer);
  const doc = new window.docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });

  doc.render(data);

  const out = doc.getZip().generate({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });

  const filename = `Zaunanzeige_${(data.location_description || "Anzeige").replace(/[^\w-]+/g, "_").slice(0, 40)}.docx`;
  saveAs(out, filename);
}

/**
 * Builds the data object for generateLetter() from the form + geo-check
 * results. Kept separate from the UI so the mapping logic is easy to test
 * and adjust.
 */
export function buildLetterData({ authority, ortDatum, locationDescription, coordinatesLine, preparerName, spaCheck, biotopCheck }) {
  const data = {
    authority_name: authority?.name || "",
    authority_department: authority?.department || "",
    authority_street: authority?.street || "",
    authority_plz_ort: authority?.plzOrt || "",
    ort_datum: ortDatum,
    location_description: locationDescription,
    coordinates_line: coordinatesLine,
    preparer_name: preparerName,
    spa_hit: false,
  };

  const anyHit = spaCheck && (spaCheck.ffh?.near || spaCheck.spa?.near || spaCheck.nsg?.near);
  if (anyHit) {
    const hitFfh = spaCheck.ffh?.near;
    const hitSpa = spaCheck.spa?.near;
    const hitNsg = spaCheck.nsg?.near;
    const inside = spaCheck.ffh?.inside || spaCheck.spa?.inside || spaCheck.nsg?.inside;

    const names = [...new Set([
      ...(spaCheck.ffh?.areaNames || []),
      ...(spaCheck.spa?.areaNames || []),
      ...(spaCheck.nsg?.areaNames || []),
    ])];
    const kinds = [
      hitFfh && "FFH-Gebiet (Flora-Fauna-Habitat-Gebiet)",
      hitSpa && "SPA-Gebiet (Vogelschutzgebiet)",
      hitNsg && "Naturschutzgebiet",
    ].filter(Boolean).join(" / ");

    let arten = "bodenbrütenden und störungsempfindlichen Vogelarten sowie weiteren besonders geschützten Arten";
    if (biotopCheck?.isAlpine) {
      arten += ", im Alpenraum insbesondere auch Raufußhühnern (z.B. Auerwild, Birkwild, Haselwild) und Gamswild";
    }

    data.spa_hit = [{
      spa_lage_phrase: inside ? "innerhalb" : "im Umkreis von 5 km",
      spa_gebiet_name: names.length ? `${names.join(", ")} (${kinds})` : kinds,
      spa_arten: arten,
    }];
  }

  return data;
}
