/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExamQuestionPaper } from '../types';

export interface WordExportSettings {
  fontFamily: string;
  fontSize: string;
  headerFontSize: string;
  lineSpacing: number; // 1.0, 1.15, 1.25, 1.5, 1.8, 2.0
  questionSpacing: number; // pt: 8, 12, 16, 22, 30, 40
  hideExampleBorders: boolean; // Hide boxes and borders around exercises and sub-examples (أ، ب، ج)
  pageMargin: 'compact' | 'normal' | 'moderate' | 'wide';
  headerColor: string;
  headerBorderWidth: number; // 1, 2, 3 pt
  showHeader: boolean;
  showFooter: boolean;
  showStudentInfoLine: boolean;
  showInstructions: boolean;
  answerLinesCount: number; // 0, 2, 3, 4
  paperOrientation: 'portrait' | 'landscape';
  format: 'doc' | 'docx';
}

export const DEFAULT_WORD_EXPORT_SETTINGS: WordExportSettings = {
  fontFamily: 'Traditional Arabic',
  fontSize: '12pt',
  headerFontSize: '14pt',
  lineSpacing: 1.5,
  questionSpacing: 4,
  hideExampleBorders: true, // Default to true per user request: hide boxes around examples
  pageMargin: 'normal',
  headerColor: '#0f172a',
  headerBorderWidth: 2,
  showHeader: true,
  showFooter: true,
  showStudentInfoLine: true,
  showInstructions: true,
  answerLinesCount: 0,
  paperOrientation: 'portrait',
  format: 'doc'
};

export const WORD_FONTS_LIST = [
  { id: 'Traditional Arabic', name: 'Traditional Arabic (المعتمد في الامتحانات)', family: "'Traditional Arabic', 'Amiri', 'Arial', sans-serif" },
  { id: 'Amiri', name: 'Amiri (الخط الأميري العربي الفاخر)', family: "'Amiri', 'Traditional Arabic', serif" },
  { id: 'Cairo', name: 'Cairo (خط كايرو العصري الواضح)', family: "'Cairo', 'Segoe UI', sans-serif" },
  { id: 'Arial', name: 'Arial (آريال القياسي للطباعة)', family: "Arial, 'Traditional Arabic', sans-serif" },
  { id: 'Calibri', name: 'Calibri (كاليبري الافتراضي في Word)', family: "Calibri, 'Traditional Arabic', sans-serif" },
  { id: 'Tahoma', name: 'Tahoma (تاهوما المتقارب والواضح)', family: "Tahoma, Arial, sans-serif" },
  { id: 'Times New Roman', name: 'Times New Roman (الخط الأكاديمي الكلاسيكي)', family: "'Times New Roman', 'Traditional Arabic', serif" },
  { id: 'Sakkal Majalla', name: 'Sakkal Majalla (خط مجلة صقال المكتبي)', family: "'Sakkal Majalla', 'Traditional Arabic', sans-serif" }
];

export const LINE_SPACING_OPTIONS = [
  { value: 1.0, label: 'مفرد (1.0) - فائق الضغط' },
  { value: 1.15, label: 'مضغوط (1.15) - توفير ورق' },
  { value: 1.3, label: 'متوسط (1.3) - متوازن' },
  { value: 1.5, label: 'سطر ونصف (1.5) - القياسي في Word ⭐' },
  { value: 1.8, label: 'مريح جداً (1.8) - قراءة واضحة' },
  { value: 2.0, label: 'مزدوج (2.0) - فراغ واسع للكتابة' }
];

export const QUESTION_SPACING_OPTIONS = [
  { value: 0, label: '0pt - ملتصق تماماً (أقرب مسافة ممكنة)' },
  { value: 4, label: '4pt - فائق التقارب (تقريب المسافة لأقصى حد ⭐)' },
  { value: 8, label: '8pt - مضغوط ومتقارب (توفير ورق)' },
  { value: 12, label: '12pt - مسافة خفيفة' },
  { value: 16, label: '16pt - مسافة قياسية متناسقة' },
  { value: 22, label: '22pt - مسافة مريحة بين الأسئلة' },
  { value: 30, label: '30pt - فسيح ومتباعد' },
  { value: 42, label: '42pt - فراغ واسع لإجابة الطالب' }
];

export const PAGE_MARGINS_OPTIONS: Record<string, { cm: string; label: string }> = {
  compact: { cm: '1cm 1cm 1cm 1cm', label: 'ضيقة (1.0 سم) - توفير الورق واحتواء أسئلة أكثر' },
  normal: { cm: '1.5cm 1.5cm 1.5cm 1.5cm', label: 'عادية (1.5 سم) - القياسية المعتمدة ⭐' },
  moderate: { cm: '2cm 2cm 2cm 2cm', label: 'متوسطة (2.0 سم)' },
  wide: { cm: '2.5cm 2.5cm 2.5cm 2.5cm', label: 'عريضة (2.5 سم)' }
};

export const COLOR_THEMES = [
  { id: '#0f172a', name: 'أسود كلاسيكي رسمي', hex: '#0f172a' },
  { id: '#1e3a8a', name: 'كحلي أزرق ملكي', hex: '#1e3a8a' },
  { id: '#047857', name: 'أخضر زمردي هادئ', hex: '#047857' },
  { id: '#991b1b', name: 'عنابي وقور', hex: '#991b1b' },
  { id: '#4338ca', name: 'نيلي بنفسجي أكاديمي', hex: '#4338ca' }
];

/**
 * Builds the complete, MSO-compliant HTML for Microsoft Word (.doc / .docx)
 * with 100% Arabic RTL layout, full user-controlled typography, spacing, and math notation.
 */
export function buildWordDocumentHtml(
  paper: ExamQuestionPaper, 
  filename?: string,
  customSettings?: Partial<WordExportSettings>
): {
  html: string;
  fullFileName: string;
  cleanTitle: string;
  settings: WordExportSettings;
} {
  const settings: WordExportSettings = {
    ...DEFAULT_WORD_EXPORT_SETTINGS,
    showHeader: paper.showHeader !== undefined ? paper.showHeader : DEFAULT_WORD_EXPORT_SETTINGS.showHeader,
    showFooter: paper.showFooter !== undefined ? paper.showFooter : DEFAULT_WORD_EXPORT_SETTINGS.showFooter,
    ...customSettings
  };

  const header = paper.headerConfig;
  const docTitle = filename || `${paper.title || 'أسئلة_امتحان'}_${paper.subject}_${paper.className}`.replace(/\s+/g, '_');

  const marginDef = PAGE_MARGINS_OPTIONS[settings.pageMargin]?.cm || '1.5cm 1.5cm 1.5cm 1.5cm';

  // Build custom header fields if present
  const customFieldsHtml = header.customFields && header.customFields.length > 0 
    ? header.customFields.map(f => `
        <td style="padding: 5px 8px; border: 1px solid #1e293b; font-size: ${settings.fontSize}; text-align: center;">
          <strong>${f.label}:</strong> ${f.value}
        </td>
      `).join('')
    : '';

  // Official Exam Header Box for Word
  const headerHtml = `
    <div style="border: ${settings.headerBorderWidth}pt solid ${settings.headerColor}; padding: 10px 12px; margin-bottom: ${Math.round(settings.questionSpacing * 0.9)}pt; background-color: #f8fafc; direction: rtl; text-align: right; page-break-inside: avoid;">
      <table style="width: 100%; border-collapse: collapse; border: none; margin-bottom: 6px;" dir="rtl">
        <tr style="border: none;">
          <td style="width: 33%; border: none; text-align: right; vertical-align: top; font-size: ${settings.fontSize}; line-height: 1.4;">
            <p style="margin: 0; font-weight: bold; color: ${settings.headerColor};">${header.ministryText || 'الجمهورية العربية السورية - وزارة التربية'}</p>
            <p style="margin: 2px 0 0 0; font-weight: bold; color: ${settings.headerColor};">${header.schoolName || 'المدرسة الدولية الخاصة'}</p>
            <p style="margin: 2px 0 0 0; font-size: 10pt; color: #475569;">العام الدراسي: ${header.academicYear || '2025 - 2026 م'}</p>
          </td>
          <td style="width: 34%; border: none; text-align: center; vertical-align: top;">
            <h2 style="margin: 0; font-size: ${settings.headerFontSize}; color: ${settings.headerColor}; font-weight: 900; text-decoration: underline;">${header.examTitle || 'أسئلة المذاكرة والاختبار'}</h2>
            <p style="margin: 4px 0 0 0; font-size: ${settings.fontSize}; font-weight: bold; color: #1e293b;">مادة: ${header.subject || paper.subject}</p>
            <p style="margin: 2px 0 0 0; font-size: 10.5pt; font-weight: bold; color: #475569;">${header.className || paper.className}</p>
          </td>
          <td style="width: 33%; border: none; text-align: left; vertical-align: top; font-size: ${settings.fontSize}; line-height: 1.4; direction: rtl;">
            <p style="margin: 0;"><strong>زمن الامتحان:</strong> ${header.duration || 'ساعة ونصف'}</p>
            <p style="margin: 2px 0 0 0;"><strong>الدرجة الكلية:</strong> <span style="font-weight: bold; color: ${settings.headerColor};">${header.totalMarks || '100 درجة'}</span></p>
            <p style="margin: 2px 0 0 0; font-size: 10pt; color: #475569;"><strong>تاريخ الاختبار:</strong> ${header.examDate || new Date().toISOString().split('T')[0]}</p>
            <p style="margin: 2px 0 0 0; font-size: 10pt;"><strong>معلم المادة:</strong> ${header.teacherName || paper.teacherName}</p>
          </td>
        </tr>
      </table>

      ${settings.showStudentInfoLine ? `
        <!-- Student Name & Seat line -->
        <table style="width: 100%; border-collapse: collapse; border-top: 1pt solid #cbd5e1; margin-top: 6px; padding-top: 5px;" dir="rtl">
          <tr style="border: none;">
            <td style="width: 60%; border: none; text-align: right; font-size: ${settings.fontSize};">
              <strong>اسم الطالب/ـة:</strong> ..........................................................................
            </td>
            <td style="width: 25%; border: none; text-align: right; font-size: ${settings.fontSize};">
              <strong>الرقم الموحد / القيد:</strong> .....................
            </td>
            <td style="width: 15%; border: none; text-align: left; font-size: ${settings.fontSize};">
              <strong>الشعبة:</strong> [ ...... ]
            </td>
          </tr>
        </table>
      ` : ''}

      ${customFieldsHtml ? `
        <table style="width: 100%; border-collapse: collapse; margin-top: 6px;" dir="rtl">
          <tr>${customFieldsHtml}</tr>
        </table>
      ` : ''}

      ${settings.showInstructions && header.instructions ? `
        <div style="margin-top: 6px; padding: 5px 8px; background-color: #ffffff; border: 1pt dashed #cbd5e1; font-size: 10pt; color: #334155; text-align: right;">
          <strong>📌 تعليمات هامة:</strong> ${header.instructions}
        </div>
      ` : ''}
    </div>
  `;

  // Answer lines generator if teacher selected student writing space
  let answerLinesHtml = '';
  if (settings.answerLinesCount > 0) {
    let lines = '';
    for (let l = 0; l < settings.answerLinesCount; l++) {
      lines += `<p style="border-bottom: 1pt dotted #94a3b8; height: 18pt; margin: 6pt 0; padding: 0;"></p>`;
    }
    answerLinesHtml = `
      <div class="student-answer-lines" style="margin-top: 6pt; margin-bottom: 8pt;" dir="rtl">
        <span style="font-size: 9.5pt; color: #64748b; font-weight: bold;">مكان كتابة إجابة الطالب / خطوات الحل:</span>
        ${lines}
      </div>
    `;
  }

  // Clean exam content to be 100% native Word compatible
  let cleanContent = (paper.contentHtml || '<p>لا توجد أسئلة مسجلة حتى الآن.</p>')
    .replace(/<button[^>]*class="[^"]*btn-delete-question[^"]*"[^>]*>[\s\S]*?<\/button>/gi, '')
    .replace(/<button[^>]*>[\s\S]*?<\/button>/gi, '')
    .replace(/\s+contenteditable="[^"]*"/gi, '')
    .replace(/\s+suppresscontenteditablewarning="[^"]*"/gi, '')
    .replace(/<p[^>]*class="[^"]*question-spacer[^"]*"[^>]*>[\s\S]*?<\/p>/gi, '')
    .replace(/<p[^>]*class="[^"]*spacer[^"]*"[^>]*>[\s\S]*?<\/p>/gi, '')
    .replace(/<p[^>]*>\s*(<br\s*\/?>|&nbsp;|\s)*<\/p>/gi, ''); // remove empty paragraphs that bloat vertical space in Word

  // CRITICAL: Overwrite hardcoded inline margins on every question-block div with the exact user selected questionSpacing
  const targetTopMargin = Math.max(0, Math.round(settings.questionSpacing * 0.3));
  const targetBottomMargin = settings.questionSpacing;

  cleanContent = cleanContent.replace(
    /<div([^>]*class="[^"]*question-block[^"]*"[^>]*)>/gi,
    (match) => {
      // Remove any previously hardcoded margin styles
      let cleaned = match
        .replace(/margin-bottom:\s*[^;"]+;?/gi, '')
        .replace(/margin-top:\s*[^;"]+;?/gi, '')
        .replace(/page-break-inside:\s*[^;"]+;?/gi, '');

      const inlineStyle = `margin-top: ${targetTopMargin}pt !important; margin-bottom: ${targetBottomMargin}pt !important; mso-para-margin-top: ${targetTopMargin}pt !important; mso-para-margin-bottom: ${targetBottomMargin}pt !important; mso-margin-top-alt: ${targetTopMargin}pt !important; mso-margin-bottom-alt: ${targetBottomMargin}pt !important; clear: both;`;

      if (cleaned.includes('style="')) {
        return cleaned.replace('style="', `style="${inlineStyle} `);
      } else {
        return cleaned.replace('>', ` style="${inlineStyle}">`);
      }
    }
  );

  // CRITICAL: If hideExampleBorders is enabled (default true per user request), remove all boxes/borders around examples (أ، ب، ج)
  if (settings.hideExampleBorders) {
    cleanContent = cleanContent
      // Remove inline borders from td elements in item tables
      .replace(
        /(<td[^>]*style="[^"]*)/gi,
        (match) => {
          if (/border:\s*[^;"]*(#cbd5e1|#e2e8f0|#94a3b8|1px\s+solid|1\.5px\s+solid)/i.test(match)) {
            return match
              .replace(/border:\s*[^;"]+;?/gi, 'border: none !important; mso-border-alt: none !important;')
              .replace(/border-radius:\s*[^;"]+;?/gi, '')
              .replace(/background(-color)?:\s*[^;"]+;?/gi, 'background: transparent !important;');
          }
          return match;
        }
      )
      // Remove borders from div cards that surround examples/exercises
      .replace(
        /(<div[^>]*style="[^"]*)/gi,
        (match) => {
          if (/border:\s*[^;"]*(#cbd5e1|#e2e8f0|#94a3b8|1px\s+solid)/i.test(match) && !match.includes('question-block')) {
            return match
              .replace(/border:\s*[^;"]+;?/gi, 'border: none !important; mso-border-alt: none !important;')
              .replace(/border-radius:\s*[^;"]+;?/gi, '')
              .replace(/background(-color)?:\s*[^;"]+;?/gi, 'background: transparent !important;');
          }
          return match;
        }
      )
      // Ensure exam-items-table has border: none and clean margins
      .replace(
        /<table([^>]*class="[^"]*exam-items-table[^"]*"[^>]*)>/gi,
        '<table$1 style="border: none !important; mso-border-alt: none !important; border-collapse: collapse !important; width: 100%; margin: 3pt 0;">'
      );
  }

  // If answer lines requested, inject after each question block
  if (settings.answerLinesCount > 0 && answerLinesHtml) {
    cleanContent = cleanContent.replace(/<\/div>(\s*<div class="question-block")/gi, `${answerLinesHtml}</div>$1`);
    cleanContent += answerLinesHtml;
  }

  // Complete Word Document HTML with MSO namespaces
  const wordDocumentContent = `
    <html xmlns:v="urn:schemas-microsoft-com:vml"
          xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:w="urn:schemas-microsoft-com:office:word"
          xmlns:m="http://schemas.microsoft.com/office/2004/12/omml"
          xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
      <title>${paper.title || 'أسئلة المذاكرة والاختبار'}</title>
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
          size: A4 ${settings.paperOrientation};
          margin: ${marginDef};
          mso-header-margin: 1cm;
          mso-footer-margin: 1cm;
          mso-page-orientation: ${settings.paperOrientation};
        }
        body {
          font-family: '${settings.fontFamily}', 'Traditional Arabic', 'Amiri', 'Arial', 'Tahoma', sans-serif;
          direction: rtl;
          text-align: right;
          font-size: ${settings.fontSize};
          line-height: ${settings.lineSpacing};
          color: #0f172a;
          background-color: #ffffff;
          margin: 0;
          padding: 0;
        }
        h1, h2, h3, h4 {
          font-family: '${settings.fontFamily}', 'Traditional Arabic', 'Amiri', 'Arial', sans-serif;
          margin-top: 6pt;
          margin-bottom: 3pt;
          color: ${settings.headerColor};
        }
        p {
          margin-top: 0pt;
          margin-bottom: 2pt;
          mso-para-margin-top: 0pt;
          mso-para-margin-bottom: 2pt;
          line-height: ${settings.lineSpacing};
        }
        table {
          border-collapse: collapse;
          direction: rtl;
          text-align: right;
          mso-table-lspace: 0pt;
          mso-table-rspace: 0pt;
          font-family: '${settings.fontFamily}', 'Traditional Arabic', sans-serif;
        }
        td, th {
          font-size: ${settings.fontSize};
          line-height: ${settings.lineSpacing};
        }
        .question-block {
          margin-top: ${targetTopMargin}pt !important;
          margin-bottom: ${targetBottomMargin}pt !important;
          mso-para-margin-top: ${targetTopMargin}pt !important;
          mso-para-margin-bottom: ${targetBottomMargin}pt !important;
          mso-margin-top-alt: ${targetTopMargin}pt !important;
          mso-margin-bottom-alt: ${targetBottomMargin}pt !important;
          clear: both;
          width: 100%;
        }
        .question-spacer, p.question-spacer {
          display: none !important;
          mso-hide: all !important;
          height: 0pt !important;
          margin: 0pt !important;
          padding: 0pt !important;
        }
        .question-header-table {
          width: 100%;
          border-collapse: collapse;
          border: none;
          border-bottom: ${settings.headerBorderWidth}pt solid ${settings.headerColor};
          margin-bottom: 6pt;
          padding-bottom: 3pt;
        }
        .exam-items-table {
          width: 100%;
          border-collapse: ${settings.hideExampleBorders ? 'collapse' : 'separate'} !important;
          border-spacing: ${settings.hideExampleBorders ? '0pt' : '5pt'};
          border: none !important;
          mso-border-alt: none !important;
          margin-top: 3pt;
          margin-bottom: 5pt;
        }
        .exam-items-table td, td.exam-item-cell, .exam-item-cell {
          font-size: ${settings.fontSize};
          line-height: ${settings.lineSpacing};
          ${settings.hideExampleBorders ? `
          border: none !important;
          mso-border-alt: none !important;
          background: transparent !important;
          background-color: transparent !important;
          padding: 3pt 6pt !important;
          ` : `
          border: 1pt solid #cbd5e1;
          background-color: #ffffff;
          padding: 4pt 6pt;
          `}
        }
        .marks-badge {
          float: left;
          font-weight: bold;
          color: ${settings.headerColor};
          font-size: 10.5pt;
        }
        /* Mathematical powers and exponents styling in Word */
        sup {
          font-size: 0.78em;
          vertical-align: super;
          line-height: 0;
          font-weight: bold;
          color: ${settings.headerColor};
        }
        sub {
          font-size: 0.78em;
          vertical-align: sub;
          line-height: 0;
        }
        .power-exp-badge {
          display: inline-block;
          direction: ltr;
          font-family: 'Cambria Math', 'Times New Roman', serif;
          font-weight: bold;
          color: ${settings.headerColor};
        }
        .footer-note {
          margin-top: ${Math.round(settings.questionSpacing * 1.5)}pt;
          text-align: center;
          font-weight: bold;
          font-size: ${settings.fontSize};
          border-top: ${settings.headerBorderWidth}pt solid ${settings.headerColor};
          padding-top: 8pt;
          color: #334155;
          clear: both;
          page-break-inside: avoid;
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
      ${settings.showHeader === true ? headerHtml : ''}
      <div class="exam-body-content" dir="rtl">
        ${cleanContent}
      </div>
      ${settings.showFooter === true ? `
        <div class="footer-note" dir="rtl">
          <table style="width: 100%; border: none; border-collapse: collapse;">
            <tr style="border: none;">
              <td style="width: 30%; border: none; text-align: right; font-size: 10pt; color: #475569;">المدرسة الدولية الخاصة - نموذج معتمد</td>
              <td style="width: 40%; border: none; text-align: center; font-weight: bold; font-size: ${settings.fontSize}; color: ${settings.headerColor};">✨ انتهت الأسئلة - مع تمنياتنا لجميع الطلبة بالتفوق والنجاح ✨</td>
              <td style="width: 30%; border: none; text-align: left; font-size: 10pt; color: #475569;">توقيع المعلم: ........................</td>
            </tr>
          </table>
        </div>
      ` : ''}
    </body>
    </html>
  `;

  const cleanTitle = (docTitle || 'أسئلة_المذاكرة')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .trim();
  const fileExt = settings.format === 'docx' ? 'docx' : 'doc';
  const fullFileName = `${cleanTitle}.${fileExt}`;

  return {
    html: wordDocumentContent,
    fullFileName,
    cleanTitle,
    settings
  };
}

/**
 * Shows a friendly floating toast notification in the UI.
 */
export function showExportToast(message: string, subtitle = 'صيغة Microsoft Word متوافقة 100% مع الهاتف والكمبيوتر') {
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
        <p class="text-[10px] text-blue-100 font-normal mt-0.5">${subtitle}</p>
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
}

/**
 * Downloads the Word document with full custom styling.
 */
export async function exportExamPaperToWord(
  paper: ExamQuestionPaper, 
  filename?: string,
  customSettings?: Partial<WordExportSettings>
): Promise<{ success: boolean; url?: string }> {
  const { html, fullFileName, settings } = buildWordDocumentHtml(paper, filename, customSettings);

  // 1. Try server-backed real HTTP download if backend exists
  try {
    const response = await fetch('/api/store-paper-for-download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: paper.id || `paper_${Date.now()}`,
        html,
        filename: fullFileName
      })
    });

    if (response.ok) {
      const data = await response.json();
      if (data?.downloadUrl) {
        const fullHttpUrl = `${window.location.origin}${data.downloadUrl}`;
        const link = document.createElement('a');
        link.href = fullHttpUrl;
        link.download = fullFileName;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        document.body.appendChild(link);
        link.click();
        setTimeout(() => link.remove(), 2000);

        showExportToast(`جاري تنزيل ملف الوورد (${fullFileName}) بهاتفك 📥`);
        return { success: true, url: fullHttpUrl };
      }
    }
  } catch {
    // Proceed to client fallbacks
  }

  // 2. Client-side Blob & Web Share API
  const mimeType = settings.format === 'docx' 
    ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
    : 'application/msword;charset=utf-8';

  const blob = new Blob(['\ufeff', html], {
    type: mimeType
  });

  const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  if (isMobile && typeof navigator !== 'undefined' && typeof (navigator as any).share === 'function') {
    try {
      const file = new File([blob], fullFileName, { type: mimeType });
      if (typeof (navigator as any).canShare === 'function' && (navigator as any).canShare({ files: [file] })) {
        await (navigator as any).share({
          files: [file],
          title: paper.title || 'أسئلة المذاكرة',
          text: `ملف وورد (${settings.fontFamily} - خط ${settings.fontSize}) لأسئلة ${paper.subject || ''} - ${paper.className || ''}`
        });
        showExportToast('تم فتح خيارات الحفظ والمشاركة بهاتفك 📄');
        return { success: true };
      }
    } catch {
      // Continue to direct download
    }
  }

  // 3. Fallback: Data URI download with Base64 encoding
  try {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64data = reader.result as string;
      const fallbackLink = document.createElement('a');
      fallbackLink.href = base64data;
      fallbackLink.download = fullFileName;
      fallbackLink.target = '_self';
      document.body.appendChild(fallbackLink);
      fallbackLink.click();
      setTimeout(() => fallbackLink.remove(), 2000);
      showExportToast(`تم بدء تنزيل وحفظ ملف الوورد (${fullFileName}) 📥`);
    };
    reader.readAsDataURL(blob);
    return { success: true };
  } catch {
    // Object URL fallback
    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = fullFileName;
    downloadLink.target = '_self';
    document.body.appendChild(downloadLink);
    downloadLink.click();
    setTimeout(() => {
      downloadLink.remove();
      URL.revokeObjectURL(url);
    }, 60000);
    return { success: true };
  }
}

/**
 * Copies the entire exam paper to the system clipboard
 * with custom font, line spacing, and question margins applied.
 */
export async function copyExamPaperToClipboard(
  paper: ExamQuestionPaper,
  customSettings?: Partial<WordExportSettings>
): Promise<boolean> {
  const { html } = buildWordDocumentHtml(paper, undefined, customSettings);
  
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  const plainText = tempDiv.innerText || tempDiv.textContent || '';

  try {
    if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
      const htmlBlob = new Blob([html], { type: 'text/html' });
      const textBlob = new Blob([plainText], { type: 'text/plain' });
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': htmlBlob,
          'text/plain': textBlob
        })
      ]);
      showExportToast('تم نسخ ورقة الأسئلة بتنسيقها الكامل 📋', 'يمكنك الآن لصقها مباشرة في برنامج Word أو المستندات');
      return true;
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(plainText);
      showExportToast('تم نسخ نص الأسئلة بنجاح 📋', 'يمكنك لصقها في أي تطبيق أو محرر نصوص');
      return true;
    }
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = plainText;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const successful = document.execCommand('copy');
    textarea.remove();
    if (successful) {
      showExportToast('تم نسخ الأسئلة إلى الحافظة بنجاح 📋');
      return true;
    }
  }
  return false;
}

/**
 * Generates an instant WhatsApp share link with the exam paper summary.
 */
export function generateWhatsAppShareUrl(paper: ExamQuestionPaper): string {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = paper.contentHtml || '';
  const textSummary = (tempDiv.innerText || tempDiv.textContent || '').substring(0, 800);

  const message = `📋 *نموذج أسئلة مذاكرة / اختبار مادة ${paper.subject}*
🏫 المدرسة: ${paper.headerConfig?.schoolName || 'المدرسة الدولية'}
👨‍🏫 إعداد المعلم: ${paper.teacherName}
📚 الصف: ${paper.className}
🎯 الدرجة: ${paper.headerConfig?.totalMarks || '100'}
⏱️ المدة: ${paper.headerConfig?.duration || 'ساعة ونصف'}

📌 *مقتطف من الأسئلة:*
${textSummary}...

✨ نظام الإدارة والمتابعة المدرسية 2026`;

  return `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
}

/**
 * Opens a pristine document with custom styling in an iframe and triggers native print.
 */
export function printExamPaperDirectly(
  paper: ExamQuestionPaper,
  customSettings?: Partial<WordExportSettings>
) {
  const { html } = buildWordDocumentHtml(paper, undefined, customSettings);

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentWindow?.document;
  if (!iframeDoc) {
    window.print();
    return;
  }

  iframeDoc.open();
  iframeDoc.write(html);
  iframeDoc.close();

  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      window.print();
    } finally {
      setTimeout(() => iframe.remove(), 10000);
    }
  }, 500);
}
