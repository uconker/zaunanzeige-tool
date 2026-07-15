const TEMPLATE_PATH = "templates/zaunanzeige_template.docx";

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

/**
 * Uses PizZip + docxtemplater to fill the template with text and trigger the download.
 */
export async function generateLetter(data) {
  try {
    // 1. Fetch the Word template
    const res = await fetch(TEMPLATE_PATH);
    if (!res.ok) throw new Error(`Could not load letter template (${res.status})`);
    const arrayBuffer = await res.arrayBuffer();
    const zip = new window.PizZip(arrayBuffer);

    // 2. Initialize docxtemplater (No image modules needed!)
    const doc = new window.docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true
    });

    // 3. Render the document with text
    doc.render(data);
    const out = doc.getZip().generate({
      type: "blob",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    // 4. Trigger the download automatically
    const filename = `Zaunanzeige_${(data.location_description || "Anzeige").replace(/[^\w-]+/g, "_").slice(0, 40)}.docx`;
    const url = URL.createObjectURL(out);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
  } catch (error) {
    console.error("Fehler bei der Dokumentengenerierung:", error);
    alert("Das Dokument konnte nicht generiert werden. Bitte prüfen Sie die Entwicklerkonsole.");
  }
}
