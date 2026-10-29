/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExamQuestionPaper, ExamHeaderConfig } from '../types';

/**
 * Exports an exam question paper as a rich Microsoft Word document (.doc)
 * with complete RTL support, embedded images, tables, header borders, and styling.
 */
export function exportExamPaperToWord(paper: ExamQuestionPaper, filename?: string) {
  const header = paper.headerConfig;
  const docTitle = filename || `${paper.title || 'أسئلة_امتحان'}_${paper.subject}_${paper.className}`.replace(/\s+/g, '_');

  // Build the official exam top table/header
  const customFieldsHtml = header.customFields && header.customFields.length > 0 
    ? header.customFields.map(f => `
        <td style="padding: 6px 10px; border: 1px solid #1e293b; font-size: 11pt;">
          <strong>${f.label}:</strong> ${f.value}
        </td>
      `).join('')
    : '';

  const isEnglish = (header.subject || paper.subject || '').includes('إنكليز') || 
                    (header.subject || paper.subject || '').includes('انجليز') || 
                    (header.subject || paper.subject || '').toLowerCase().includes('english') ||
                    (header.instructions || '').toLowerCase().includes('answer all');

  const headerHtml = `
    <div style="border: 2px solid #0f172a; padding: 12px; margin-bottom: 20px; background-color: #f8fafc; direction: ${isEnglish ? 'ltr' : 'rtl'}; text-align: ${isEnglish ? 'left' : 'right'};">
      <table style="width: 100%; border-collapse: collapse; border: none; margin-bottom: 8px;" dir="${isEnglish ? 'ltr' : 'rtl'}">
        <tr style="border: none;">
          <td style="width: 33%; border: none; text-align: ${isEnglish ? 'left' : 'right'}; vertical-align: top; font-size: 11pt;">
            <p style="margin: 0; font-weight: bold;">${header.ministryText || (isEnglish ? 'Ministry of Education' : 'وزارة التربية والتعليم')}</p>
            <p style="margin: 2px 0 0 0; font-weight: bold; color: #4338ca;">${header.schoolName || (isEnglish ? 'International Private School' : 'المدرسة الدولية الخاصة')}</p>
            <p style="margin: 2px 0 0 0; font-size: 10pt;">${isEnglish ? 'Academic Year' : 'العام الدراسي'}: ${header.academicYear || '2025 - 2026'}</p>
          </td>
          <td style="width: 34%; border: none; text-align: center; vertical-align: top;">
            <h2 style="margin: 0; font-size: 16pt; color: #0f172a; font-weight: 900;">${header.examTitle || (isEnglish ? 'Examination Paper' : 'أسئلة المذاكرة والاختبار')}</h2>
            <p style="margin: 4px 0 0 0; font-size: 12pt; font-weight: bold; color: #1e293b;">${isEnglish ? 'Subject' : 'مادة'}: ${header.subject || paper.subject}</p>
            <p style="margin: 2px 0 0 0; font-size: 11pt; font-weight: bold;">${header.className || paper.className}</p>
          </td>
          <td style="width: 33%; border: none; text-align: ${isEnglish ? 'right' : 'left'}; vertical-align: top; font-size: 11pt; direction: ${isEnglish ? 'ltr' : 'rtl'};">
            <p style="margin: 0;"><strong>${isEnglish ? 'Time' : 'زمن الامتحان'}:</strong> ${header.duration || (isEnglish ? '90 mins' : 'ساعة ونصف')}</p>
            <p style="margin: 2px 0 0 0;"><strong>${isEnglish ? 'Marks' : 'الدرجة الكلية'}:</strong> ${header.totalMarks || (isEnglish ? '100 Marks' : '100 درجة')}</p>
            <p style="margin: 2px 0 0 0;"><strong>${isEnglish ? 'Date' : 'تاريخ الاختبار'}:</strong> ${header.examDate || new Date().toISOString().split('T')[0]}</p>
            <p style="margin: 2px 0 0 0;"><strong>${isEnglish ? 'Teacher' : 'معلم المادة'}:</strong> ${header.teacherName || paper.teacherName}</p>
          </td>
        </tr>
      </table>

      <!-- Student Name & Roll line -->
      <table style="width: 100%; border-collapse: collapse; border-top: 1px solid #94a3b8; margin-top: 8px; padding-top: 6px;" dir="${isEnglish ? 'ltr' : 'rtl'}">
        <tr style="border: none;">
          <td style="width: 60%; border: none; text-align: ${isEnglish ? 'left' : 'right'}; font-size: 11pt;">
            <strong>${isEnglish ? 'Student Name' : 'اسم الطالب/ـة'}:</strong> ..........................................................................
          </td>
          <td style="width: 25%; border: none; text-align: ${isEnglish ? 'left' : 'right'}; font-size: 11pt;">
            <strong>${isEnglish ? 'ID / Seat No' : 'الرقم الموحد / القيد'}:</strong> .....................
          </td>
          <td style="width: 15%; border: none; text-align: ${isEnglish ? 'right' : 'left'}; font-size: 11pt;">
            <strong>${isEnglish ? 'Section' : 'الشعبة'}:</strong> [ ...... ]
          </td>
        </tr>
      </table>

      ${customFieldsHtml ? `
        <table style="width: 100%; border-collapse: collapse; margin-top: 6px;" dir="${isEnglish ? 'ltr' : 'rtl'}">
          <tr>${customFieldsHtml}</tr>
        </table>
      ` : ''}

      ${header.instructions ? `
        <div style="margin-top: 8px; padding: 6px 10px; background-color: #fff; border: 1px dashed #cbd5e1; font-size: 10pt; color: #334155; text-align: ${isEnglish ? 'left' : 'right'};">
          <strong>📌 ${isEnglish ? 'Instructions' : 'ملاحظات وتعليمات هامة'}:</strong> ${header.instructions}
        </div>
      ` : ''}
    </div>
  `;

  // HTML content for Word document
  const wordDocumentContent = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset='utf-8'>
      <title>${paper.title}</title>
      <!--[if gte mso 9]>
      <xml>
        <w:WordDocument>
          <w:View>Print</w:View>
          <w:Zoom>100</w:Zoom>
          <w:DoNotOptimizeForBrowser/>
        </w:WordDocument>
      </xml>
      <![endif]-->
      <style>
        @page {
          size: A4 portrait;
          margin: 1.5cm 1.5cm 1.5cm 1.5cm;
          mso-header-margin: 1cm;
          mso-footer-margin: 1cm;
        }
        body {
          font-family: ${isEnglish ? "'Calibri', 'Arial', 'Times New Roman', sans-serif" : "'Traditional Arabic', 'Amiri', 'Arial', 'Tahoma', 'Times New Roman', sans-serif"};
          direction: ${isEnglish ? 'ltr' : 'rtl'};
          text-align: ${isEnglish ? 'left' : 'right'};
          font-size: 12pt;
          line-height: 1.8;
          color: #0f172a;
          background-color: #ffffff;
        }
        h1, h2, h3, h4 {
          font-family: ${isEnglish ? "'Calibri', 'Arial', sans-serif" : "'Traditional Arabic', 'Amiri', 'Arial', sans-serif"};
          margin-top: 14px;
          margin-bottom: 8px;
          color: #0f172a;
        }
        p {
          margin: 6px 0;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 12px 0;
          direction: ${isEnglish ? 'ltr' : 'rtl'};
        }
        table, th, td {
          border: 1px solid #1e293b;
        }
        th, td {
          padding: 8px 12px;
          text-align: ${isEnglish ? 'left' : 'right'};
        }
        th {
          background-color: #f1f5f9;
          font-weight: bold;
        }
        img {
          max-width: 100%;
          height: auto;
          display: inline-block;
          margin: 8px 0;
        }
        .question-block {
          margin-bottom: 18px;
          page-break-inside: avoid;
        }
        .marks-badge {
          float: ${isEnglish ? 'right' : 'left'};
          font-weight: bold;
          color: #4338ca;
          font-size: 11pt;
        }
        .footer-note {
          margin-top: 30px;
          text-align: center;
          font-weight: bold;
          font-size: 12pt;
          border-top: 1px solid #cbd5e1;
          padding-top: 12px;
          color: #475569;
        }
        .btn-delete-question, .no-print {
          display: none !important;
          mso-hide: all;
        }
      </style>
    </head>
    <body dir="${isEnglish ? 'ltr' : 'rtl'}">
      ${paper.showHeader !== false ? headerHtml : ''}
      <div class="exam-body-content">
        ${(paper.contentHtml || '<p>لا توجد أسئلة مسجلة حتى الآن.</p>')
          .replace(/<button[^>]*class="[^"]*btn-delete-question[^"]*"[^>]*>[\s\S]*?<\/button>/gi, '')
          .replace(/<button[^>]*>[\s\S]*?<\/button>/gi, '')}
      </div>
      ${paper.showFooter !== false ? `
        <div class="footer-note">
          ${isEnglish ? '✨ End of Questions - Best of Luck to All Students ✨' : '✨ انتهت الأسئلة - مع تمنياتنا لجميع الطلبة بدوام التوفيق والنجاح ✨'}
        </div>
      ` : ''}
    </body>
    </html>
  `;

  // Create Blob and trigger direct download
  const blob = new Blob(['\ufeff', wordDocumentContent], {
    type: 'application/msword;charset=utf-8'
  });

  const url = URL.createObjectURL(blob);
  const downloadLink = document.createElement('a');
  downloadLink.href = url;
  downloadLink.download = `${docTitle}.doc`;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
  URL.revokeObjectURL(url);
}
