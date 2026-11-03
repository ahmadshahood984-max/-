/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExamQuestionPaper } from '../types';

/**
 * Exports an exam question paper as a rich Microsoft Word document (.doc)
 * with complete RTL support, embedded images, tables, header borders, and styling
 * that matches the screen display 100% without distortion.
 */
export function exportExamPaperToWord(paper: ExamQuestionPaper, filename?: string) {
  const header = paper.headerConfig;
  const docTitle = filename || `${paper.title || 'أسئلة_امتحان'}_${paper.subject}_${paper.className}`.replace(/\s+/g, '_');

  // Build custom header fields if present
  const customFieldsHtml = header.customFields && header.customFields.length > 0 
    ? header.customFields.map(f => `
        <td style="padding: 6px 10px; border: 1px solid #1e293b; font-size: 11pt; text-align: center;">
          <strong>${f.label}:</strong> ${f.value}
        </td>
      `).join('')
    : '';

  // Official Exam Header Box for Word
  const headerHtml = `
    <div style="border: 2pt solid #0f172a; padding: 12px; margin-bottom: 20px; background-color: #f8fafc; direction: rtl; text-align: right;">
      <table style="width: 100%; border-collapse: collapse; border: none; margin-bottom: 8px;" dir="rtl">
        <tr style="border: none;">
          <td style="width: 33%; border: none; text-align: right; vertical-align: top; font-size: 11pt;">
            <p style="margin: 0; font-weight: bold;">${header.ministryText || 'وزارة التربية والتعليم'}</p>
            <p style="margin: 2px 0 0 0; font-weight: bold; color: #4338ca;">${header.schoolName || 'المدرسة الدولية الخاصة'}</p>
            <p style="margin: 2px 0 0 0; font-size: 10pt;">العام الدراسي: ${header.academicYear || '2025 - 2026 م'}</p>
          </td>
          <td style="width: 34%; border: none; text-align: center; vertical-align: top;">
            <h2 style="margin: 0; font-size: 16pt; color: #0f172a; font-weight: 900; text-decoration: underline;">${header.examTitle || 'أسئلة المذاكرة والاختبار'}</h2>
            <p style="margin: 4px 0 0 0; font-size: 12pt; font-weight: bold; color: #1e293b;">مادة: ${header.subject || paper.subject}</p>
            <p style="margin: 2px 0 0 0; font-size: 11pt; font-weight: bold;">${header.className || paper.className}</p>
          </td>
          <td style="width: 33%; border: none; text-align: left; vertical-align: top; font-size: 11pt; direction: rtl;">
            <p style="margin: 0;"><strong>زمن الامتحان:</strong> ${header.duration || 'ساعة ونصف'}</p>
            <p style="margin: 2px 0 0 0;"><strong>الدرجة الكلية:</strong> ${header.totalMarks || '100 درجة'}</p>
            <p style="margin: 2px 0 0 0;"><strong>تاريخ الاختبار:</strong> ${header.examDate || new Date().toISOString().split('T')[0]}</p>
            <p style="margin: 2px 0 0 0;"><strong>معلم المادة:</strong> ${header.teacherName || paper.teacherName}</p>
          </td>
        </tr>
      </table>

      <!-- Student Name & Seat line -->
      <table style="width: 100%; border-collapse: collapse; border-top: 1pt solid #94a3b8; margin-top: 8px; padding-top: 6px;" dir="rtl">
        <tr style="border: none;">
          <td style="width: 60%; border: none; text-align: right; font-size: 11pt;">
            <strong>اسم الطالب/ـة:</strong> ..........................................................................
          </td>
          <td style="width: 25%; border: none; text-align: right; font-size: 11pt;">
            <strong>الرقم الموحد / القيد:</strong> .....................
          </td>
          <td style="width: 15%; border: none; text-align: left; font-size: 11pt;">
            <strong>الشعبة:</strong> [ ...... ]
          </td>
        </tr>
      </table>

      ${customFieldsHtml ? `
        <table style="width: 100%; border-collapse: collapse; margin-top: 6px;" dir="rtl">
          <tr>${customFieldsHtml}</tr>
        </table>
      ` : ''}

      ${header.instructions ? `
        <div style="margin-top: 8px; padding: 6px 10px; background-color: #fff; border: 1pt dashed #cbd5e1; font-size: 10.5pt; color: #334155; text-align: right;">
          <strong>📌 تعليمات هامة:</strong> ${header.instructions}
        </div>
      ` : ''}
    </div>
  `;

  // Clean exam content to be 100% native Word compatible
  let cleanContent = (paper.contentHtml || '<p>لا توجد أسئلة مسجلة حتى الآن.</p>')
    // Strip interactive delete buttons
    .replace(/<button[^>]*class="[^"]*btn-delete-question[^"]*"[^>]*>[\s\S]*?<\/button>/gi, '')
    .replace(/<button[^>]*>[\s\S]*?<\/button>/gi, '')
    // Strip contenteditable attributes
    .replace(/\s+contenteditable="[^"]*"/gi, '')
    .replace(/\s+suppresscontenteditablewarning="[^"]*"/gi, '');

  // Complete Word Document HTML with MSO namespaces
  const wordDocumentContent = `
    <html xmlns:v="urn:schemas-microsoft-com:vml"
          xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:w="urn:schemas-microsoft-com:office:word"
          xmlns:m="http://schemas.microsoft.com/office/2004/12/omml"
          xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
      <title>${paper.title}</title>
      <!--[if gte mso 9]>
      <xml>
        <w:WordDocument>
          <w:View>Print</w:View>
          <w:Zoom>100</w:Zoom>
          <w:DoNotOptimizeForBrowser/>
          <w:AllowPNG/>
        </w:WordDocument>
      </xml>
      <![endif]-->
      <style>
        @page {
          size: A4 portrait;
          margin: 1.5cm 1.5cm 1.5cm 1.5cm;
          mso-header-margin: 1cm;
          mso-footer-margin: 1cm;
          mso-page-orientation: portrait;
        }
        body {
          font-family: 'Traditional Arabic', 'Amiri', 'Arial', 'Tahoma', sans-serif;
          direction: rtl;
          text-align: right;
          font-size: 12pt;
          line-height: 1.8;
          color: #0f172a;
          background-color: #ffffff;
        }
        h1, h2, h3, h4 {
          font-family: 'Traditional Arabic', 'Amiri', 'Arial', sans-serif;
          margin-top: 10pt;
          margin-bottom: 6pt;
          color: #0f172a;
        }
        p {
          margin: 4pt 0;
        }
        table {
          border-collapse: collapse;
          direction: rtl;
          text-align: right;
          mso-table-lspace: 0pt;
          mso-table-rspace: 0pt;
        }
        .question-block {
          margin-top: 12pt;
          margin-bottom: 16pt;
          page-break-inside: avoid;
          mso-pagination: widow-orphan;
          clear: both;
          width: 100%;
        }
        .question-header-table {
          width: 100%;
          border-collapse: collapse;
          border: none;
          border-bottom: 2pt solid #0f172a;
          margin-bottom: 8pt;
          padding-bottom: 3pt;
        }
        .exam-items-table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 6pt;
          margin-top: 6pt;
          margin-bottom: 8pt;
        }
        .marks-badge {
          float: left;
          font-weight: bold;
          color: #4338ca;
          font-size: 11pt;
        }
        .footer-note {
          margin-top: 24pt;
          text-align: center;
          font-weight: bold;
          font-size: 12pt;
          border-top: 1.5pt solid #0f172a;
          padding-top: 10pt;
          color: #334155;
          clear: both;
        }
        .btn-delete-question, .no-print, button {
          display: none !important;
          mso-hide: all;
        }
        img {
          max-width: 100%;
          height: auto;
          display: inline-block;
          margin: 6pt 0;
        }
      </style>
    </head>
    <body dir="rtl">
      ${paper.showHeader === true ? headerHtml : ''}
      <div class="exam-body-content" dir="rtl">
        ${cleanContent}
      </div>
      ${paper.showFooter === true ? `
        <div class="footer-note" dir="rtl">
          <table style="width: 100%; border: none; border-collapse: collapse;">
            <tr style="border: none;">
              <td style="width: 30%; border: none; text-align: right; font-size: 11pt;">المدرسة الدولية الخاصة - نموذج معتمد</td>
              <td style="width: 40%; border: none; text-align: center; font-weight: bold; font-size: 12pt;">✨ انتهت الأسئلة - مع تمنياتنا لجميع الطلبة بالنجاح والتفوق ✨</td>
              <td style="width: 30%; border: none; text-align: left; font-size: 11pt;">توقيع المعلم: ........................</td>
            </tr>
          </table>
        </div>
      ` : ''}
    </body>
    </html>
  `;

  // Build safe filename
  const cleanTitle = (docTitle || 'أسئلة_المذاكرة')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .trim();
  const fullFileName = `${cleanTitle}.doc`;

  // Helper to show floating confirmation toast
  const showExportToast = (message: string) => {
    if (typeof document === 'undefined') return;
    try {
      const existingToast = document.getElementById('word-export-floating-toast');
      if (existingToast) existingToast.remove();

      const toast = document.createElement('div');
      toast.id = 'word-export-floating-toast';
      toast.setAttribute('dir', 'rtl');
      toast.className = 'fixed top-4 left-1/2 -translate-x-1/2 z-[999999] bg-gradient-to-r from-blue-700 to-indigo-700 text-white font-bold text-xs sm:text-sm px-5 py-3.5 rounded-2xl shadow-2xl border border-white/20 flex items-center gap-3 animate-bounce';
      toast.innerHTML = `
        <span class="text-xl">📄</span>
        <div class="text-right">
          <p class="font-black text-sm">${message}</p>
          <p class="text-[10px] text-blue-100 font-normal mt-0.5">صيغة Microsoft Word (.doc) متوافقة 100% مع الهاتف والكمبيوتر</p>
        </div>
      `;
      document.body.appendChild(toast);
      setTimeout(() => {
        if (toast && toast.parentNode) {
          toast.style.transition = 'opacity 0.5s ease';
          toast.style.opacity = '0';
          setTimeout(() => toast.remove(), 500);
        }
      }, 4500);
    } catch {}
  };

  // Create Blob and UTF-8 BOM
  const blob = new Blob(['\ufeff', wordDocumentContent], {
    type: 'application/msword;charset=utf-8'
  });

  // Mobile Web Share API: Allows saving directly to Android/iOS storage or opening in Word app
  const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  if (isMobile && typeof navigator !== 'undefined' && typeof (navigator as any).share === 'function') {
    try {
      const file = new File([blob], fullFileName, { type: 'application/msword' });
      if (typeof (navigator as any).canShare === 'function' && (navigator as any).canShare({ files: [file] })) {
        (navigator as any).share({
          files: [file],
          title: paper.title || 'أسئلة المذاكرة',
          text: `ملف وورد (.doc) لأسئلة ${paper.subject || ''} - ${paper.className || ''}`
        }).then(() => {
          showExportToast('تم فتح خيارات الحفظ بالهاتف والمشاركة بنجاح 📄');
        }).catch((shareErr: any) => {
          // If aborted by user, don't crash
          if (shareErr?.name !== 'AbortError') {
            triggerDirectDownload();
          }
        });
        return;
      }
    } catch {
      // Fallback to direct anchor download
    }
  }

  // Direct download routine with delayed revoke
  function triggerDirectDownload() {
    try {
      const url = URL.createObjectURL(blob);
      const downloadLink = document.createElement('a');
      downloadLink.href = url;
      downloadLink.download = fullFileName;
      downloadLink.target = '_self';
      downloadLink.rel = 'noopener';
      downloadLink.style.display = 'none';
      document.body.appendChild(downloadLink);
      downloadLink.click();

      setTimeout(() => {
        if (document.body.contains(downloadLink)) {
          document.body.removeChild(downloadLink);
        }
      }, 2000);

      // Keep blob alive for 2 minutes so mobile Download Manager does not abort!
      setTimeout(() => {
        try {
          URL.revokeObjectURL(url);
        } catch {}
      }, 120000);

      showExportToast(`تم تنزيل وحفظ ملف الوورد (${fullFileName}) بهاتفك 📥`);
    } catch (err) {
      // Data URI fallback for restricted iframes
      try {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64data = reader.result as string;
          const fallbackLink = document.createElement('a');
          fallbackLink.href = base64data;
          fallbackLink.download = fullFileName;
          fallbackLink.target = '_self';
          fallbackLink.style.display = 'none';
          document.body.appendChild(fallbackLink);
          fallbackLink.click();
          setTimeout(() => fallbackLink.remove(), 2000);
          showExportToast(`تم تنزيل وحفظ ملف الوورد (${fullFileName}) بهاتفك 📥`);
        };
        reader.readAsDataURL(blob);
      } catch {
        alert('تعذر تنزيل الملف، يرجى إعادة المحاولة.');
      }
    }
  }

  triggerDirectDownload();
}

