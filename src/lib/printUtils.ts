import html2canvas from 'html2canvas';

/**
 * Universal print helper designed to work seamlessly in iframes, desktop, and mobile browsers.
 */
export const printElementById = (elementId: string, docTitle: string = 'وثيقة رسمية'): boolean => {
  try {
    const element = document.getElementById(elementId);
    if (!element) {
      console.warn(`Element with id "${elementId}" not found for printing.`);
      window.print();
      return true;
    }

    // Direct invocation with standard browser print dialog
    // Modern CSS media rules ensure print-card-box prints cleanly
    try {
      window.print();
      return true;
    } catch (directPrintErr) {
      console.warn('Standard window.print failed, attempting iframe print isolation:', directPrintErr);
    }

    // Fallback: Standalone iframe print
    const contentHtml = element.outerHTML;
    const printIframe = document.createElement('iframe');
    printIframe.setAttribute('style', 'position:fixed;right:0;bottom:0;width:10px;height:10px;border:0;opacity:0;z-index:-1000;');
    printIframe.setAttribute('id', 'universal-print-iframe-' + Date.now());
    document.body.appendChild(printIframe);

    const iframeDoc = printIframe.contentWindow?.document || printIframe.contentDocument;
    if (!iframeDoc) {
      window.print();
      return true;
    }

    const fullHtml = `
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>${docTitle}</title>
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Tajawal:wght@400;500;700;800;900&display=swap" rel="stylesheet">
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            * {
              box-sizing: border-box;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              color-adjust: exact !important;
            }
            body {
              font-family: 'Tajawal', 'Cairo', system-ui, -apple-system, sans-serif;
              direction: rtl;
              text-align: right;
              background-color: #ffffff !important;
              color: #0f172a !important;
              margin: 0;
              padding: 10px;
            }
            @page {
              size: A4 portrait;
              margin: 5mm 6mm 5mm 6mm;
            }
            @media print {
              html, body {
                padding: 0 !important;
                margin: 0 !important;
                height: auto !important;
              }
              .no-print {
                display: none !important;
              }
              .a4-single-page {
                page-break-inside: avoid !important;
                break-inside: avoid !important;
                page-break-before: avoid !important;
                break-before: avoid !important;
                page-break-after: avoid !important;
                break-after: avoid !important;
                max-height: 284mm !important;
                box-sizing: border-box !important;
                overflow: hidden !important;
              }
            }
            .dir-ltr {
              direction: ltr;
            }
          </style>
        </head>
        <body class="bg-white text-slate-900">
          <div class="w-full max-w-[210mm] mx-auto p-0 bg-white">
            ${contentHtml}
          </div>
        </body>
      </html>
    `;

    iframeDoc.open();
    iframeDoc.write(fullHtml);
    iframeDoc.close();

    setTimeout(() => {
      try {
        printIframe.contentWindow?.focus();
        printIframe.contentWindow?.print();
      } catch {
        window.print();
      }

      setTimeout(() => {
        try {
          document.body.removeChild(printIframe);
        } catch {
          // ignore
        }
      }, 4000);
    }, 300);

    return true;
  } catch (error) {
    console.error('Failed to execute print:', error);
    try {
      window.print();
    } catch {
      // ignore
    }
    return false;
  }
};

/**
 * Generates an image data URL from a DOM element using html2canvas.
 */
export const captureElementToDataUrl = async (elementId: string): Promise<string | null> => {
  try {
    const element = document.getElementById(elementId);
    if (!element) {
      console.warn(`Element with id "${elementId}" not found for capture.`);
      return null;
    }

    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      allowTaint: true,
      foreignObjectRendering: false,
      windowWidth: Math.max(element.scrollWidth || 0, 800)
    });

    return canvas.toDataURL('image/png');
  } catch (err) {
    console.error('Failed to capture element to data URL:', err);
    return null;
  }
};

/**
 * Downloads or shares a DOM element as a high-resolution crisp PNG image.
 * Uses Web Share API on mobile devices and Blob download link as standard fallback.
 */
export const downloadElementAsImage = async (
  elementId: string,
  fileName: string = 'وثيقة-المدرسة-الدولية-الخاصة.png'
): Promise<{ success: boolean; dataUrl?: string; mode?: 'share' | 'download' | 'preview' }> => {
  try {
    const element = document.getElementById(elementId);
    if (!element) {
      console.warn(`Element with id "${elementId}" not found for image generation.`);
      return { success: false };
    }

    // Capture element with html2canvas at 2x scale for crystal clear text
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      allowTaint: true,
      foreignObjectRendering: false,
      windowWidth: Math.max(element.scrollWidth || 0, 800)
    });

    const dataUrl = canvas.toDataURL('image/png');
    const safeFileName = fileName.endsWith('.png') ? fileName : `${fileName}.png`;

    // Try Web Share API (native on Android/iOS Chrome and Safari)
    try {
      if (typeof canvas.toBlob === 'function') {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (blob) {
          const file = new File([blob], safeFileName, { type: 'image/png' });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
              await navigator.share({
                title: 'وثيقة رسمية - المدرسة الدولية الخاصة',
                text: `استمارة رسمية صادرة من المدرسة الدولية الخاصة`,
                files: [file]
              });
              return { success: true, dataUrl, mode: 'share' };
            } catch (shareErr: any) {
              if (shareErr.name !== 'AbortError') {
                console.warn('Web Share cancelled or failed, falling back to direct download:', shareErr);
              }
            }
          }

          // Fallback: Blob URL download
          const blobUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.download = safeFileName;
          link.href = blobUrl;
          link.target = '_blank';
          document.body.appendChild(link);
          link.click();
          setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(blobUrl);
          }, 2000);

          return { success: true, dataUrl, mode: 'download' };
        }
      }
    } catch (blobErr) {
      console.warn('Blob generation error, falling back to direct dataUrl link:', blobErr);
    }

    // Direct dataUrl download fallback
    const link = document.createElement('a');
    link.download = safeFileName;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
    }, 1000);

    return { success: true, dataUrl, mode: 'download' };
  } catch (error) {
    console.error('Failed to generate image from element:', error);
    return { success: false };
  }
};
