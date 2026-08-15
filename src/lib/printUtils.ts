import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

// Browser-based 2D canvas context for accurate parsing and conversion of modern CSS colors (oklab, oklch, color(), lab, etc.) to standard rgb/rgba
let helperCanvas: HTMLCanvasElement | null = null;
let helperCtx: CanvasRenderingContext2D | null = null;
const colorCache = new Map<string, string>();

const getHelperCtx = (): CanvasRenderingContext2D | null => {
  if (typeof document === 'undefined') return null;
  if (!helperCanvas) {
    helperCanvas = document.createElement('canvas');
    helperCanvas.width = 1;
    helperCanvas.height = 1;
  }
  if (!helperCtx && helperCanvas) {
    helperCtx = helperCanvas.getContext('2d', { willReadFrequently: true });
  }
  return helperCtx;
};

/**
 * Checks if a string contains modern CSS color functions unsupported by legacy canvas parsers (oklab, oklch, lab, lch, color, hwb, light-dark).
 */
export const containsModernColor = (str: string): boolean => {
  if (!str || typeof str !== 'string') return false;
  return /oklab|oklch|lab|lch|color\(|hwb|light-dark/i.test(str);
};

/**
 * Converts any modern CSS color format (such as oklab, oklch, lab, lch, color(srgb ...)) into standard rgb() or rgba()
 * that html2canvas and standard canvas engines support without throwing parsing errors.
 */
export const parseColorToRgba = (colorStr: string): string => {
  if (!colorStr || typeof colorStr !== 'string') return colorStr;
  
  // Fast path: if no modern color function is present, return as is
  if (!containsModernColor(colorStr)) {
    return colorStr;
  }

  const trimmed = colorStr.trim();
  if (colorCache.has(trimmed)) {
    return colorCache.get(trimmed)!;
  }

  const ctx = getHelperCtx();
  if (ctx) {
    try {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#000000';
      ctx.fillStyle = trimmed;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      const result = a === 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
      colorCache.set(trimmed, result);
      return result;
    } catch {
      // ignore
    }
  }

  // Safe fallback if canvas evaluation fails
  return 'rgba(0, 0, 0, 0.8)';
};

/**
 * Sanitizes any CSS text by replacing oklab(...), oklch(...), lab(...), lch(...), color(...) occurrences with safe rgb/rgba strings.
 */
export const sanitizeOklchInString = (cssText: string): string => {
  if (!cssText || typeof cssText !== 'string' || !containsModernColor(cssText)) {
    return cssText;
  }
  return cssText
    .replace(/(?:oklab|oklch|lab|lch|hwb|light-dark)\([^)]+\)/gi, (match) => parseColorToRgba(match))
    .replace(/color\([^)]+\)/gi, (match) => parseColorToRgba(match));
};

/**
 * Sanitizes a cloned DOM tree before html2canvas parses its styles:
 * 1. Converts all modern CSS color formats (oklab/oklch/lab/lch/hwb) to standard RGB/RGBA.
 * 2. Normalizes Arabic font styling, removing any letter-spacing (which breaks Arabic cursive ligatures).
 * 3. Enforces fixed A4 portrait width (794px) on the captured element to prevent responsive mobile squishing.
 */
const sanitizeClonedTreeForHtml2Canvas = (clonedDoc: Document, clonedElement: HTMLElement) => {
  try {
    // 1. Inject global reset stylesheet for html2canvas capture ensuring Arabic ligatures & crisp fonts
    const injectionStyle = clonedDoc.createElement('style');
    injectionStyle.textContent = `
      * {
        letter-spacing: 0px !important;
        word-spacing: normal !important;
        font-variant-ligatures: normal !important;
        font-feature-settings: "liga" 1, "calt" 1 !important;
        text-rendering: geometricPrecision !important;
        -webkit-font-smoothing: antialiased !important;
        -moz-osx-font-smoothing: grayscale !important;
        font-family: 'Cairo', 'Tajawal', 'Almarai', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif !important;
      }
      .dir-ltr, [dir="ltr"] {
        direction: ltr !important;
        text-align: left !important;
        unicode-bidi: embed !important;
      }
      .dir-rtl, [dir="rtl"] {
        direction: rtl !important;
        text-align: right !important;
        unicode-bidi: embed !important;
      }
    `;
    clonedDoc.head?.appendChild(injectionStyle);

    // 2. Ensure cloned element is fixed to standard A4 Portrait width and height (794px x 1120px ~ 210mm x 297mm @ 96dpi)
    if (clonedElement) {
      clonedElement.style.width = '794px';
      clonedElement.style.maxWidth = '794px';
      clonedElement.style.minWidth = '794px';
      clonedElement.style.minHeight = '1120px';
      clonedElement.style.boxSizing = 'border-box';
      clonedElement.style.backgroundColor = '#ffffff';
      clonedElement.style.color = '#0f172a';
      clonedElement.style.margin = '0 auto';
      clonedElement.style.display = 'flex';
      clonedElement.style.flexDirection = 'column';
      clonedElement.style.justifyContent = 'space-between';
    }

    // 3. Sanitize all stylesheet rules and style tags for oklch colors
    const styleTags = clonedDoc.querySelectorAll('style');
    styleTags.forEach((tag) => {
      try {
        if (tag.textContent && containsModernColor(tag.textContent)) {
          tag.textContent = sanitizeOklchInString(tag.textContent);
        }
      } catch {
        // ignore
      }
    });

    // 4. Sanitize inline styles and critical color properties across the cloned subtree
    const propsToConvert = [
      'color',
      'backgroundColor',
      'borderColor',
      'borderTopColor',
      'borderRightColor',
      'borderBottomColor',
      'borderLeftColor',
      'outlineColor',
      'textDecorationColor',
      'boxShadow',
      'fill',
      'stroke',
      'caretColor',
      'accentColor',
      'columnRuleColor'
    ] as const;

    const sanitizeElement = (el: Element) => {
      if (!(el instanceof HTMLElement || el instanceof SVGElement)) return;

      // Reset any letter-spacing that could split Arabic words
      if (el instanceof HTMLElement) {
        el.style.letterSpacing = '0px';
      }

      // Check inline style attribute
      const styleAttr = el.getAttribute('style');
      if (styleAttr && containsModernColor(styleAttr)) {
        el.setAttribute('style', sanitizeOklchInString(styleAttr));
      }

      // Check computed styles and enforce RGB equivalents
      try {
        const computed = window.getComputedStyle(el);
        for (const prop of propsToConvert) {
          const val = (computed as any)[prop];
          if (val && typeof val === 'string' && containsModernColor(val)) {
            const safeVal = sanitizeOklchInString(val);
            if (el instanceof HTMLElement) {
              (el.style as any)[prop] = safeVal;
            }
          }
        }
      } catch {
        // ignore
      }
    };

    sanitizeElement(clonedElement);
    const allDescendants = clonedElement.querySelectorAll('*');
    allDescendants.forEach(sanitizeElement);
  } catch (err) {
    console.warn('DOM sanitization warning for html2canvas:', err);
  }
};

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
 * Generates an image data URL from a DOM element using html2canvas with full OKLCH color compatibility.
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
      windowWidth: Math.max(element.scrollWidth || 0, 800),
      onclone: (clonedDoc, clonedElement) => {
        sanitizeClonedTreeForHtml2Canvas(clonedDoc, clonedElement);
      }
    });

    return canvas.toDataURL('image/png');
  } catch (err) {
    console.warn('Html2canvas capture encountered an issue, attempting safe fallback:', err);
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

    // Capture element with html2canvas at 2x scale with oklch sanitizer
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      allowTaint: true,
      foreignObjectRendering: false,
      windowWidth: Math.max(element.scrollWidth || 0, 800),
      onclone: (clonedDoc, clonedElement) => {
        sanitizeClonedTreeForHtml2Canvas(clonedDoc, clonedElement);
      }
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
    console.warn('Failed to generate image from element with html2canvas:', error);
    return { success: false };
  }
};

/**
 * Exports a DOM element as a high-fidelity, printable A4 PDF file using jsPDF and html2canvas.
 */
export const exportElementAsPdf = async (
  elementId: string,
  fileName: string = 'استمارة-المدرسة-الدولية-الخاصة.pdf'
): Promise<{ success: boolean; dataUrl?: string; pdfUrl?: string; pdfBlob?: Blob; error?: string }> => {
  try {
    const element = document.getElementById(elementId);
    if (!element) {
      console.warn(`Element with id "${elementId}" not found for PDF export.`);
      return { success: false, error: 'العنصر المراد تصديره غير موجود' };
    }

    // Capture element with html2canvas at high resolution (scale 2.5)
    const canvas = await html2canvas(element, {
      scale: 2.5,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      allowTaint: true,
      foreignObjectRendering: false,
      windowWidth: Math.max(element.scrollWidth || 0, 800),
      onclone: (clonedDoc, clonedElement) => {
        sanitizeClonedTreeForHtml2Canvas(clonedDoc, clonedElement);
      }
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.98);
    const imgPngData = canvas.toDataURL('image/png');

    // Create A4 portrait PDF document (210 x 297 mm)
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true
    });

    const pdfWidth = 210;
    const pdfHeight = 297;
    const margin = 5; // 5mm margin on all sides
    const availWidth = pdfWidth - (margin * 2);
    const availHeight = pdfHeight - (margin * 2);

    const imgRatio = canvas.width / canvas.height;
    let renderWidth = availWidth;
    let renderHeight = availWidth / imgRatio;

    if (renderHeight > availHeight) {
      renderHeight = availHeight;
      renderWidth = availHeight * imgRatio;
    }

    const posX = margin + (availWidth - renderWidth) / 2;
    const posY = margin + (availHeight - renderHeight) / 2;

    pdf.addImage(imgData, 'JPEG', posX, posY, renderWidth, renderHeight, undefined, 'FAST');

    const safeFileName = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;

    // Attempt direct PDF save
    try {
      pdf.save(safeFileName);
    } catch (saveErr) {
      console.warn('pdf.save encountered sandbox constraint, proceeding to blob/dataUrl handlers:', saveErr);
    }

    // Generate Blob and Data URI for universal preview and sharing
    const pdfBlob = pdf.output('blob');
    let pdfUrl: string | undefined = undefined;
    try {
      pdfUrl = URL.createObjectURL(pdfBlob);
    } catch {
      // ignore
    }

    // Attempt mobile file share for PDF if supported
    try {
      if (typeof navigator !== 'undefined' && (navigator as any).canShare) {
        const pdfFile = new File([pdfBlob], safeFileName, { type: 'application/pdf' });
        if ((navigator as any).canShare({ files: [pdfFile] })) {
          await (navigator as any).share({
            title: safeFileName,
            text: 'استمارة رسمية صادرة عن المدرسة الدولية الخاصة',
            files: [pdfFile]
          });
        }
      }
    } catch (shareErr) {
      // ignore share failure / cancellation
    }

    return {
      success: true,
      dataUrl: imgPngData,
      pdfUrl,
      pdfBlob
    };
  } catch (err: any) {
    console.error('Failed to export PDF:', err);
    return {
      success: false,
      error: err?.message || 'حدث خطأ أثناء تصدير ملف الـ PDF'
    };
  }
};

