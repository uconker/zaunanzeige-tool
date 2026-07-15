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
    const templateRes = await fetch("zaunanzeige_template.docx");
    if (!templateRes.ok) throw new Error("Template konnte nicht geladen werden.");
    const templateBuffer = await templateRes.arrayBuffer();
    const zip = new PizZip(templateBuffer);

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
    const url = URL.createObjectURL(out);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Zaunanzeige_${new Date().toISOString().slice(0, 10)}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
  } catch (error) {
    console.error("Fehler bei der Dokumentengenerierung:", error);
    alert("Das Dokument konnte nicht generiert werden. Bitte prüfen Sie die Entwicklerkonsole.");
  }
}
