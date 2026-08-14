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

    // 1. Prepare clean standalone HTML content with embedded styles for perfect print fidelity
    const contentHtml = element.innerHTML;
    
    // Create an isolated hidden iframe for printing
    const printIframe = document.createElement('iframe');
    printIframe.setAttribute('style', 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;z-index:-1000;');
    printIframe.setAttribute('id', 'universal-print-iframe-' + Date.now());
    document.body.appendChild(printIframe);

    const iframeDoc = printIframe.contentWindow?.document || printIframe.contentDocument;
    if (!iframeDoc) {
      // Fallback to window.print if iframe document is not accessible
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
              padding: 15px;
            }
            @page {
              size: A4 portrait;
              margin: 8mm 8mm 8mm 8mm;
            }
            @media print {
              body {
                padding: 0 !important;
              }
              .no-print {
                display: none !important;
              }
            }
            .border-slate-150 {
              border-color: #e2e8f0;
            }
            .dir-ltr {
              direction: ltr;
            }
          </style>
        </head>
        <body class="bg-white text-slate-900">
          <div class="max-w-4xl mx-auto p-2 bg-white">
            ${contentHtml}
          </div>
        </body>
      </html>
    `;

    iframeDoc.open();
    iframeDoc.write(fullHtml);
    iframeDoc.close();

    // Allow resources & fonts to render before printing
    setTimeout(() => {
      try {
        printIframe.contentWindow?.focus();
        printIframe.contentWindow?.print();
      } catch (err) {
        console.error('Error invoking iframe print:', err);
        // Fallback to window.print
        window.print();
      }

      // Cleanup iframe after a delay
      setTimeout(() => {
        try {
          document.body.removeChild(printIframe);
        } catch {
          // ignore
        }
      }, 5000);
    }, 400);

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
 * Downloads a DOM element as a high-resolution crisp PNG image.
 * Especially helpful for mobile users and offline archiving.
 */
export const downloadElementAsImage = async (
  elementId: string,
  fileName: string = 'وثيقة-المدرسة-الدولية-الخاصة.png'
): Promise<boolean> => {
  try {
    const element = document.getElementById(elementId);
    if (!element) {
      console.warn(`Element with id "${elementId}" not found for image generation.`);
      return false;
    }

    // Capture element with html2canvas at 2x scale for crystal clear text
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      allowTaint: true,
      windowWidth: element.scrollWidth || 1000
    });

    const dataUrl = canvas.toDataURL('image/png');

    // Trigger download
    const link = document.createElement('a');
    link.download = fileName.endsWith('.png') ? fileName : `${fileName}.png`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    return true;
  } catch (error) {
    console.error('Failed to generate image from element:', error);
    return false;
  }
};
