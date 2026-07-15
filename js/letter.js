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
 * Uses PizZip + docxtemplater to fill the template and append images.
 */
export async function generateLetter(data, photoFiles = []) {
  try {
    // 1. Process images and calculate dimensions so they fit on A4
    const processedPhotos = [];
    const imageDimensions = new Map();

    for (const file of photoFiles) {
      const { buffer, w, h } = await new Promise((resolve) => {
        const img = new Image();
        img.onload = async () => {
          const maxWidth = 550; // Fits nicely within standard A4 margins
          let finalW = img.width;
          let finalH = img.height;
          
          // Scale down if the image is too wide
          if (finalW > maxWidth) {
            finalH = Math.round(finalH * (maxWidth / finalW));
            finalW = maxWidth;
          }
          
          const buffer = await file.arrayBuffer();
          resolve({ buffer, w: finalW, h: finalH });
        };
        img.src = URL.createObjectURL(file);
      });
      
      imageDimensions.set(buffer, [w, h]);
      processedPhotos.push({ img: buffer });
    }

    // Attach the processed photos to the data going into the Word document
    data.photos = processedPhotos;

    // 2. Fetch the Word template
    const res = await fetch(TEMPLATE_PATH);
    if (!res.ok) throw new Error(`Could not load letter template (${res.status})`);
    const arrayBuffer = await res.arrayBuffer();
    const zip = new window.PizZip(arrayBuffer);

    // 3. Configure the Image Module
    const imageOptions = {
      centered: false,
      getImage(tagValue) {
        return tagValue; // Returns the raw ArrayBuffer of the image
      },
      getSize(imgBuffer) {
        return imageDimensions.get(imgBuffer) || [500, 500]; // Uses our calculated dimensions
      }
    };
    const imageModule = new window.ImageModule(imageOptions);

    // 4. Initialize docxtemplater with the module attached
    const doc = new window.docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      modules: [imageModule]
    });

    // 5. Render the document with text and photos
    doc.render(data);
    const out = doc.getZip().generate({
      type: "blob",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    // 6. Trigger the download automatically
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
