/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Bold, 
  Italic, 
  Underline, 
  Strikethrough, 
  AlignRight, 
  AlignCenter, 
  AlignLeft, 
  AlignJustify, 
  List, 
  ListOrdered, 
  Image as ImageIcon, 
  Table as TableIcon, 
  Minus, 
  Undo, 
  Redo, 
  FileDown, 
  Printer, 
  Save, 
  Send, 
  Sparkles, 
  Type, 
  CheckCircle, 
  AlertCircle, 
  Plus, 
  Trash2, 
  HelpCircle,
  Eye,
  Edit3,
  Sliders,
  X
} from 'lucide-react';
import { ExamQuestionPaper, ExamHeaderConfig } from '../types';
import { exportExamPaperToWord } from '../lib/wordExport';

interface ExamQuestionPaperEditorProps {
  paper?: ExamQuestionPaper | null;
  currentUserRole: 'teacher' | 'director';
  currentTeacherName?: string;
  currentTeacherId?: string;
  defaultSubject?: string;
  defaultClassName?: string;
  defaultClassId?: string;
  onSave: (paper: ExamQuestionPaper) => void;
  onClose?: () => void;
  availableClasses?: { id: string; name: string }[];
  availableSubjects?: string[];
}

export const ExamQuestionPaperEditor: React.FC<ExamQuestionPaperEditorProps> = ({
  paper,
  currentUserRole,
  currentTeacherName = 'المعلم',
  currentTeacherId = 't1',
  defaultSubject = 'اللغة العربية',
  defaultClassName = 'الصف الأول',
  defaultClassId = 'c1',
  onSave,
  onClose,
  availableClasses = [],
  availableSubjects = []
}) => {
  // Document state
  const [paperId] = useState<string>(paper?.id || `exam_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
  const [docTitle, setDocTitle] = useState<string>(paper?.title || 'أسئلة المذاكرة الشهرية');
  const [status, setStatus] = useState<ExamQuestionPaper['status']>(paper?.status || 'draft');
  const [directorNotes, setDirectorNotes] = useState<string>(paper?.directorNotes || '');

  // Header configuration
  const [headerConfig, setHeaderConfig] = useState<ExamHeaderConfig>(paper?.headerConfig || {
    ministryText: 'الجمهورية العربية السورية - وزارة التربية',
    schoolName: 'المدرسة الدولية الخاصة',
    examTitle: 'أسئلة مذاكرة واختبار الفصل الدراسي',
    academicYear: '2025 - 2026 م',
    subject: paper?.subject || defaultSubject,
    className: paper?.className || defaultClassName,
    examDate: new Date().toISOString().split('T')[0],
    duration: 'ساعة ونصف (90 دقيقة)',
    totalMarks: '100 درجة',
    teacherName: paper?.teacherName || currentTeacherName,
    instructions: 'أجب عن جميع الأسئلة الآتية بدقة وخط واضح. يُمنع استخدام الحبر الأحمر أو الطامس.',
    customFields: [
      { label: 'رقم النموذج', value: 'نموذج (أ)' },
      { label: 'الفصل الدراسي', value: 'الفصل الأول' }
    ]
  });

  const [showHeaderSettings, setShowHeaderSettings] = useState<boolean>(false);
  const [showTableModal, setShowTableModal] = useState<boolean>(false);
  const [tableRows, setTableRows] = useState<number>(3);
  const [tableCols, setTableCols] = useState<number>(3);
  const [activeFont, setActiveFont] = useState<string>('Traditional Arabic');
  const [activeFontSize, setActiveFontSize] = useState<string>('16px');
  const [textColor, setTextColor] = useState<string>('#0f172a');
  const [highlightColor, setHighlightColor] = useState<string>('#ffffff');
  const [savedSuccessMessage, setSavedSuccessMessage] = useState<string>('');

  // Editor ref
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize editor content
  useEffect(() => {
    if (editorRef.current) {
      if (paper?.contentHtml) {
        editorRef.current.innerHTML = paper.contentHtml;
      } else if (!editorRef.current.innerHTML || editorRef.current.innerHTML.trim() === '') {
        // Default starter template
        editorRef.current.innerHTML = `
          <div class="question-block" style="margin-bottom: 24px;">
            <p style="font-weight: bold; font-size: 17px; color: #0f172a; margin-bottom: 8px;">
              <span>السؤال الأول: (25 درجة)</span>
              <span style="float: left; color: #4338ca; font-size: 14px;">[ 25 علامة ]</span>
            </p>
            <p style="font-size: 15px; line-height: 1.8; margin-right: 12px;">
              أ) اكتب بالتفصيل عن الموضوع الآتي مراعياً تسلسل الأفكار وصحة القواعد:<br>
              ...........................................................................................................................................................<br>
              ...........................................................................................................................................................
            </p>
          </div>

          <div class="question-block" style="margin-bottom: 24px;">
            <p style="font-weight: bold; font-size: 17px; color: #0f172a; margin-bottom: 8px;">
              <span>السؤال الثاني: ضع إشارة ( ✓ ) أمام العبارة الصحيحة وإشارة ( ✗ ) أمام العبارة الخاطئة:</span>
              <span style="float: left; color: #4338ca; font-size: 14px;">[ 25 علامة ]</span>
            </p>
            <ol style="font-size: 15px; line-height: 2; padding-right: 24px;">
              <li>العبارة الأولى هنا ................................................................................................... ( &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; )</li>
              <li>العبارة الثانية هنا ................................................................................................... ( &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; )</li>
              <li>العبارة الثالثة هنا ................................................................................................... ( &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; )</li>
              <li>العبارة الرابعة هنا ................................................................................................... ( &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; )</li>
            </ol>
          </div>

          <div class="question-block" style="margin-bottom: 24px;">
            <p style="font-weight: bold; font-size: 17px; color: #0f172a; margin-bottom: 8px;">
              <span>السؤال الثالث: اختر الإجابة الصحيحة من بين الخيارات المعطاة:</span>
              <span style="float: left; color: #4338ca; font-size: 14px;">[ 25 علامة ]</span>
            </p>
            <div style="font-size: 15px; line-height: 2; margin-right: 12px;">
              <p>1. نص السؤال الأول هنا:<br>
                &nbsp;&nbsp;&nbsp;&nbsp;أ) الخيار الأول &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ب) الخيار الثاني &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ج) الخيار الثالث &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; د) الخيار الرابع
              </p>
              <p>2. نص السؤال الثاني هنا:<br>
                &nbsp;&nbsp;&nbsp;&nbsp;أ) الخيار الأول &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ب) الخيار الثاني &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ج) الخيار الثالث &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; د) الخيار الرابع
              </p>
            </div>
          </div>

          <div class="question-block" style="margin-bottom: 24px;">
            <p style="font-weight: bold; font-size: 17px; color: #0f172a; margin-bottom: 8px;">
              <span>السؤال الرابع: أجب عما يأتي بإيجاز:</span>
              <span style="float: left; color: #4338ca; font-size: 14px;">[ 25 علامة ]</span>
            </p>
            <p style="font-size: 15px; line-height: 1.8; margin-right: 12px;">
              علل ما يأتي:<br>
              1. .........................................................................................................................................................<br>
              2. .........................................................................................................................................................
            </p>
          </div>
        `;
      }
    }
  }, [paper]);

  // Execute formatting command on contentEditable
  const formatDoc = (cmd: string, val: string | undefined = undefined) => {
    document.execCommand(cmd, false, val);
    if (editorRef.current) {
      editorRef.current.focus();
    }
  };

  // Font family change
  const handleFontChange = (font: string) => {
    setActiveFont(font);
    formatDoc('fontName', font);
  };

  // Font size change
  const handleFontSizeChange = (size: string) => {
    setActiveFontSize(size);
    // Wrap selection in span with font-size
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const span = document.createElement('span');
      span.style.fontSize = size;
      span.appendChild(range.extractContents());
      range.insertNode(span);
    }
  };

  // Color changes
  const handleTextColorChange = (color: string) => {
    setTextColor(color);
    formatDoc('foreColor', color);
  };

  const handleHighlightColorChange = (color: string) => {
    setHighlightColor(color);
    formatDoc('hiliteColor', color);
  };

  // Insert Image handler
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        if (base64) {
          const imgHtml = `
            <div style="text-align: center; margin: 16px 0;" class="exam-inserted-image-wrapper">
              <img src="${base64}" alt="رسم توضيحي للاختبار" style="max-width: 65%; height: auto; border: 1px solid #cbd5e1; border-radius: 8px; padding: 4px; background: white;" />
              <div style="font-size: 11px; color: #64748b; margin-top: 4px;">[ شكل توضيحي / مسألة ]</div>
            </div>
          `;
          formatDoc('insertHTML', imgHtml);
        }
      };
      reader.readAsDataURL(file);
    }
    // reset input
    if (e.target) e.target.value = '';
  };

  // Insert Table handler
  const handleInsertTable = () => {
    let tableHtml = `<table style="width: 100%; border-collapse: collapse; margin: 14px 0; border: 1px solid #0f172a;" dir="rtl">`;
    for (let r = 0; r < tableRows; r++) {
      tableHtml += `<tr>`;
      for (let c = 0; c < tableCols; c++) {
        if (r === 0) {
          tableHtml += `<th style="border: 1px solid #0f172a; padding: 8px 12px; background-color: #f1f5f9; font-weight: bold; text-align: center;">خانة ${c + 1}</th>`;
        } else {
          tableHtml += `<td style="border: 1px solid #0f172a; padding: 8px 12px; text-align: center;">نص ${r}-${c + 1}</td>`;
        }
      }
      tableHtml += `</tr>`;
    }
    tableHtml += `</table><p><br></p>`;
    formatDoc('insertHTML', tableHtml);
    setShowTableModal(false);
  };

  // Insert Question template snippets
  const insertQuestionSnippet = (type: string) => {
    let snippet = '';
    if (type === 'multiple_choice') {
      snippet = `
        <div class="question-block" style="margin-bottom: 20px;">
          <p style="font-weight: bold; font-size: 16px; color: #0f172a; margin-bottom: 6px;">
            <span>سؤال: اختر الإجابة الصحيحة مما بين القوسين:</span>
            <span style="float: left; color: #4338ca; font-size: 13px;">[ ..... علامات ]</span>
          </p>
          <p style="font-size: 14px; margin-right: 14px; line-height: 1.9;">
            1. نص السؤال هنا ............................................................................ [ خيار 1 / خيار 2 / خيار 3 / خيار 4 ]<br>
            2. نص السؤال هنا ............................................................................ [ خيار 1 / خيار 2 / خيار 3 / خيار 4 ]
          </p>
        </div>
      `;
    } else if (type === 'true_false') {
      snippet = `
        <div class="question-block" style="margin-bottom: 20px;">
          <p style="font-weight: bold; font-size: 16px; color: #0f172a; margin-bottom: 6px;">
            <span>سؤال: ضع إشارة ( ✓ ) أو ( ✗ ) أمام العبارات الآتية:</span>
            <span style="float: left; color: #4338ca; font-size: 13px;">[ ..... علامات ]</span>
          </p>
          <ol style="font-size: 14px; margin-right: 14px; line-height: 2;">
            <li>نص العبارة الأولى هنا .................................................................... ( &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; )</li>
            <li>نص العبارة الثانية هنا .................................................................... ( &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; )</li>
          </ol>
        </div>
      `;
    } else if (type === 'fill_blanks') {
      snippet = `
        <div class="question-block" style="margin-bottom: 20px;">
          <p style="font-weight: bold; font-size: 16px; color: #0f172a; margin-bottom: 6px;">
            <span>سؤال: أكمل الفراغات في الجمل الآتية بما يناسبها علمياً:</span>
            <span style="float: left; color: #4338ca; font-size: 13px;">[ ..... علامات ]</span>
          </p>
          <ol style="font-size: 14px; margin-right: 14px; line-height: 2;">
            <li>يعتبر ........................................... من أهم العوامل التي تؤدي إلى ........................................... .</li>
            <li>يقاس ........................................... بواسطة وحدة ........................................... .</li>
          </ol>
        </div>
      `;
    } else if (type === 'essay') {
      snippet = `
        <div class="question-block" style="margin-bottom: 20px;">
          <p style="font-weight: bold; font-size: 16px; color: #0f172a; margin-bottom: 6px;">
            <span>سؤال مقالي / مسألة:</span>
            <span style="float: left; color: #4338ca; font-size: 13px;">[ ..... علامات ]</span>
          </p>
          <p style="font-size: 14px; margin-right: 14px; line-height: 1.8;">
            اكتب نص المسألة أو السؤال المقالي هنا بالتفصيل:<br>
            ...........................................................................................................................................................<br>
            ...........................................................................................................................................................
          </p>
        </div>
      `;
    } else if (type === 'matching') {
      snippet = `
        <div class="question-block" style="margin-bottom: 20px;">
          <p style="font-weight: bold; font-size: 16px; color: #0f172a; margin-bottom: 6px;">
            <span>سؤال: صِلْ بين عناصر القائمة (أ) وما يناسبها من القائمة (ب):</span>
            <span style="float: left; color: #4338ca; font-size: 13px;">[ ..... علامات ]</span>
          </p>
          <table style="width: 100%; border-collapse: collapse; border: 1px solid #1e293b;" dir="rtl">
            <tr style="background-color: #f8fafc;">
              <th style="border: 1px solid #1e293b; padding: 6px; width: 45%;">العمود (أ)</th>
              <th style="border: 1px solid #1e293b; padding: 6px; width: 10%; text-align: center;">الرقم</th>
              <th style="border: 1px solid #1e293b; padding: 6px; width: 45%;">العمود (ب)</th>
            </tr>
            <tr>
              <td style="border: 1px solid #1e293b; padding: 6px;">1. العنصر الأول</td>
              <td style="border: 1px solid #1e293b; padding: 6px; text-align: center;">( &nbsp;&nbsp;&nbsp;&nbsp; )</td>
              <td style="border: 1px solid #1e293b; padding: 6px;">أ. التفسير أو المفهوم المقابل</td>
            </tr>
            <tr>
              <td style="border: 1px solid #1e293b; padding: 6px;">2. العنصر الثاني</td>
              <td style="border: 1px solid #1e293b; padding: 6px; text-align: center;">( &nbsp;&nbsp;&nbsp;&nbsp; )</td>
              <td style="border: 1px solid #1e293b; padding: 6px;">ب. التفسير أو المفهوم المقابل</td>
            </tr>
          </table>
        </div>
      `;
    }
    formatDoc('insertHTML', snippet);
  };

  // Add custom header field
  const handleAddCustomField = () => {
    const label = prompt('أدخل اسم الحقل المخصص (مثال: رقم الجلسة، اسم المصحح، الفصل الدراسي، الفرع):');
    if (label && label.trim()) {
      const value = prompt(`أدخل قيمة حقل "${label}":`) || '';
      setHeaderConfig(prev => ({
        ...prev,
        customFields: [...(prev.customFields || []), { label: label.trim(), value: value.trim() }]
      }));
    }
  };

  const handleRemoveCustomField = (index: number) => {
    setHeaderConfig(prev => ({
      ...prev,
      customFields: prev.customFields?.filter((_, i) => i !== index)
    }));
  };

  // Save document
  const handleSaveDocument = (submitToDirector: boolean = false) => {
    const content = editorRef.current?.innerHTML || '';
    const newStatus: ExamQuestionPaper['status'] = submitToDirector 
      ? 'submitted' 
      : (currentUserRole === 'director' ? (status === 'draft' ? 'approved' : status) : 'draft');

    const updatedPaper: ExamQuestionPaper = {
      id: paperId,
      title: docTitle.trim() || 'أسئلة المذاكرة والاختبار',
      teacherId: paper?.teacherId || currentTeacherId,
      teacherName: headerConfig.teacherName || currentTeacherName,
      subject: headerConfig.subject,
      classId: paper?.classId || defaultClassId,
      className: headerConfig.className,
      dateCreated: paper?.dateCreated || new Date().toISOString(),
      dateUpdated: new Date().toISOString(),
      headerConfig: { ...headerConfig },
      contentHtml: content,
      status: newStatus,
      directorNotes: directorNotes.trim()
    };

    onSave(updatedPaper);
    setStatus(newStatus);
    setSavedSuccessMessage(submitToDirector 
      ? '✅ تم حفظ وإرسال أسئلة الامتحان إلى إدارة المدرسة بنجاح!' 
      : '✅ تم حفظ ورقة الأسئلة بنجاح وتحديث السجلات.'
    );

    setTimeout(() => {
      setSavedSuccessMessage('');
    }, 4000);
  };

  // Export to Word
  const handleExportWord = () => {
    const content = editorRef.current?.innerHTML || '';
    const paperToExport: ExamQuestionPaper = {
      id: paperId,
      title: docTitle,
      teacherId: paper?.teacherId || currentTeacherId,
      teacherName: headerConfig.teacherName,
      subject: headerConfig.subject,
      classId: paper?.classId || defaultClassId,
      className: headerConfig.className,
      dateCreated: paper?.dateCreated || new Date().toISOString(),
      headerConfig,
      contentHtml: content,
      status
    };
    exportExamPaperToWord(paperToExport);
  };

  // Print
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="bg-slate-100 min-h-screen text-slate-800 p-2 sm:p-4 md:p-6 flex flex-col items-center print:bg-white print:p-0" dir="rtl">
      {/* Top Application Bar */}
      <div className="w-full max-w-5xl bg-white border border-slate-200 rounded-2xl shadow-sm p-4 mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-800 text-white flex items-center justify-center font-black shadow-xs">
            <Edit3 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
                placeholder="عنوان ملف الأسئلة..."
                className="font-black text-sm sm:text-base text-slate-900 bg-transparent border-b border-transparent hover:border-indigo-300 focus:border-indigo-600 focus:outline-none px-1"
              />
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                status === 'approved' 
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                  : status === 'submitted'
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : status === 'revision_requested'
                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}>
                {status === 'approved' ? 'معتمد رسمي ✅' : status === 'submitted' ? 'مرسل للمدير ⏳' : status === 'revision_requested' ? 'يحتاج تعديل ⚠️' : 'مسودة قيد الكتابة ✍️'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              المعلم: <strong className="text-indigo-700">{headerConfig.teacherName}</strong> • المادة: <strong className="text-slate-800">{headerConfig.subject}</strong> • الصف: <strong className="text-slate-800">{headerConfig.className}</strong>
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setShowHeaderSettings(!showHeaderSettings)}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border ${
              showHeaderSettings ? 'bg-indigo-600 text-white border-indigo-700' : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
            }`}
            title="تعديل ترويسة الامتحان وحقول البيانات المفتوحة"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>ترويسة الاختبار والحقول</span>
          </button>

          <button
            type="button"
            onClick={handleExportWord}
            className="px-3.5 py-2 bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-800 hover:to-indigo-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm"
            title="تصدير ملف وورد (.doc) جاهز للتعديل والطباعة في Microsoft Word"
          >
            <FileDown className="w-4 h-4" />
            <span>تصدير ملف وورد (Word) 📄</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
            title="معاينة وطباعة A4 مباشرة"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>طباعة 🖨️</span>
          </button>

          <button
            type="button"
            onClick={() => handleSaveDocument(false)}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
            title="حفظ المسودة محلياً وفي النظام"
          >
            <Save className="w-3.5 h-3.5" />
            <span>حفظ</span>
          </button>

          {currentUserRole === 'teacher' && (
            <button
              type="button"
              onClick={() => handleSaveDocument(true)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 cursor-pointer shadow-sm animate-pulse"
              title="إرسال نموذج الأسئلة المكتمل إلى إدارة المدرسة للاعتماد"
            >
              <Send className="w-3.5 h-3.5" />
              <span>إرسال للمدير للاعتماد 🚀</span>
            </button>
          )}

          {currentUserRole === 'director' && (
            <button
              type="button"
              onClick={() => {
                setStatus('approved');
                handleSaveDocument(false);
              }}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 cursor-pointer shadow-sm"
              title="اعتماد نموذج الأسئلة رسمياً"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              <span>اعتماد الأسئلة رسمي ✅</span>
            </button>
          )}

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              title="إغلاق المحرر والرجوع"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {savedSuccessMessage && (
        <div className="w-full max-w-5xl mb-4 bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl text-xs font-black shadow-xs flex items-center gap-2 print:hidden animate-fade-in">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{savedSuccessMessage}</span>
        </div>
      )}

      {/* Header Fields & Open Customizable Fields Configuration Drawer */}
      {showHeaderSettings && (
        <div className="w-full max-w-5xl bg-white border-2 border-indigo-200 rounded-2xl shadow-md p-5 mb-4 text-right print:hidden">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-indigo-600" />
              <h3 className="font-extrabold text-sm text-slate-800">
                إعدادات ترويسة الاختبار والحقول المفتوحة (يحددها المدير والمعلم)
              </h3>
            </div>
            <button
              type="button"
              onClick={handleAddCustomField}
              className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>+ إضافة حقل مخصص مفتوح</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="block font-bold text-slate-600 mb-1">اسم المدرسة / الجهة:</label>
              <input
                type="text"
                value={headerConfig.schoolName || ''}
                onChange={(e) => setHeaderConfig({ ...headerConfig, schoolName: e.target.value })}
                className="w-full border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-medium focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-600 mb-1">عنوان المذاكرة / الاختبار:</label>
              <input
                type="text"
                value={headerConfig.examTitle}
                onChange={(e) => setHeaderConfig({ ...headerConfig, examTitle: e.target.value })}
                className="w-full border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-medium focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-600 mb-1">العام الدراسي:</label>
              <input
                type="text"
                value={headerConfig.academicYear || ''}
                onChange={(e) => setHeaderConfig({ ...headerConfig, academicYear: e.target.value })}
                className="w-full border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-medium focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-600 mb-1">المادة الدراسية:</label>
              {availableSubjects.length > 0 ? (
                <div className="flex gap-1">
                  <select
                    value={headerConfig.subject}
                    onChange={(e) => setHeaderConfig({ ...headerConfig, subject: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl px-2 py-1.5 text-xs font-bold focus:border-indigo-500 focus:outline-none bg-white"
                  >
                    {availableSubjects.map(sub => (
                      <option key={sub} value={sub}>{sub}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <input
                  type="text"
                  value={headerConfig.subject}
                  onChange={(e) => setHeaderConfig({ ...headerConfig, subject: e.target.value })}
                  className="w-full border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-medium focus:border-indigo-500 focus:outline-none"
                />
              )}
            </div>

            <div>
              <label className="block font-bold text-slate-600 mb-1">الصف والشعبة:</label>
              {availableClasses.length > 0 ? (
                <select
                  value={headerConfig.className}
                  onChange={(e) => setHeaderConfig({ ...headerConfig, className: e.target.value })}
                  className="w-full border border-slate-200 rounded-xl px-2 py-1.5 text-xs font-bold focus:border-indigo-500 focus:outline-none bg-white"
                >
                  {availableClasses.map(c => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={headerConfig.className}
                  onChange={(e) => setHeaderConfig({ ...headerConfig, className: e.target.value })}
                  className="w-full border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-medium focus:border-indigo-500 focus:outline-none"
                />
              )}
            </div>

            <div>
              <label className="block font-bold text-slate-600 mb-1">زمن الامتحان:</label>
              <input
                type="text"
                value={headerConfig.duration || ''}
                onChange={(e) => setHeaderConfig({ ...headerConfig, duration: e.target.value })}
                placeholder="مثال: ساعة ونصف"
                className="w-full border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-medium focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-600 mb-1">الدرجة الكلية:</label>
              <input
                type="text"
                value={headerConfig.totalMarks || ''}
                onChange={(e) => setHeaderConfig({ ...headerConfig, totalMarks: e.target.value })}
                placeholder="مثال: 100 درجة"
                className="w-full border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-medium focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-600 mb-1">اسم المعلم / واضع الأسئلة:</label>
              <input
                type="text"
                value={headerConfig.teacherName}
                onChange={(e) => setHeaderConfig({ ...headerConfig, teacherName: e.target.value })}
                className="w-full border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-medium focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2 md:col-span-4">
              <label className="block font-bold text-slate-600 mb-1">تعليمات وتوجيهات للطلبة:</label>
              <input
                type="text"
                value={headerConfig.instructions || ''}
                onChange={(e) => setHeaderConfig({ ...headerConfig, instructions: e.target.value })}
                placeholder="أجب عن جميع الأسئلة بدقة..."
                className="w-full border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-medium focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Custom Fields list */}
          {headerConfig.customFields && headerConfig.customFields.length > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-100">
              <span className="text-[11px] font-black text-indigo-700 block mb-2">الحقول المخصصة المضافة لترويسة الاختبار:</span>
              <div className="flex flex-wrap gap-2">
                {headerConfig.customFields.map((field, idx) => (
                  <div key={idx} className="bg-slate-50 border border-slate-200 px-3 py-1 rounded-xl text-xs flex items-center gap-2">
                    <span className="font-bold text-slate-600">{field.label}:</span>
                    <input
                      type="text"
                      value={field.value}
                      onChange={(e) => {
                        const updated = [...(headerConfig.customFields || [])];
                        updated[idx].value = e.target.value;
                        setHeaderConfig({ ...headerConfig, customFields: updated });
                      }}
                      className="border-b border-indigo-200 text-xs font-bold text-slate-800 bg-transparent px-1 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveCustomField(idx)}
                      className="text-rose-500 hover:text-rose-700 transition"
                      title="حذف هذا الحقل"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Comprehensive Word Processor Toolbar */}
      <div className="w-full max-w-5xl bg-white border border-slate-200 rounded-2xl shadow-sm p-2 mb-3 sticky top-2 z-20 print:hidden flex flex-wrap items-center gap-1.5 justify-start text-xs">
        {/* Font Family Selector */}
        <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200">
          <Type className="w-3.5 h-3.5 text-slate-400 mr-1" />
          <select
            value={activeFont}
            onChange={(e) => handleFontChange(e.target.value)}
            className="bg-transparent text-xs font-bold text-slate-700 focus:outline-none cursor-pointer"
            title="تغيير نوع الخط"
          >
            <option value="Traditional Arabic">Traditional Arabic (عربي تقليدي)</option>
            <option value="Amiri">Amiri (أميري)</option>
            <option value="Cairo">Cairo (كايرو)</option>
            <option value="Tajawal">Tajawal (تجوّل)</option>
            <option value="Arial">Arial (أريال)</option>
            <option value="Tahoma">Tahoma (تاهوما)</option>
            <option value="Times New Roman">Times New Roman</option>
            <option value="Courier New">Courier New</option>
          </select>
        </div>

        {/* Font Size Selector */}
        <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200">
          <span className="text-[10px] text-slate-400 font-bold px-1">حجم:</span>
          <select
            value={activeFontSize}
            onChange={(e) => handleFontSizeChange(e.target.value)}
            className="bg-transparent text-xs font-bold text-slate-700 focus:outline-none cursor-pointer"
            title="تغيير حجم الخط"
          >
            <option value="12px">12 pt</option>
            <option value="14px">14 pt</option>
            <option value="16px">16 pt (افتراضي)</option>
            <option value="18px">18 pt</option>
            <option value="20px">20 pt</option>
            <option value="24px">24 pt (كبير)</option>
            <option value="28px">28 pt</option>
            <option value="32px">32 pt (عنوان)</option>
          </select>
        </div>

        <div className="h-5 w-[1px] bg-slate-200 mx-0.5" />

        {/* Text Styles */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => formatDoc('bold')}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-700 font-black transition cursor-pointer"
            title="غامق (Ctrl+B)"
          >
            <Bold className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => formatDoc('italic')}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-700 italic transition cursor-pointer"
            title="مائل (Ctrl+I)"
          >
            <Italic className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => formatDoc('underline')}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-700 underline transition cursor-pointer"
            title="تسطير (Ctrl+U)"
          >
            <Underline className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => formatDoc('strikeThrough')}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-700 line-through transition cursor-pointer"
            title="يتوسطه خط"
          >
            <Strikethrough className="w-4 h-4" />
          </button>
        </div>

        <div className="h-5 w-[1px] bg-slate-200 mx-0.5" />

        {/* Text & Background Colors */}
        <div className="flex items-center gap-1.5">
          <label className="flex items-center gap-1 p-1 hover:bg-slate-100 rounded-lg cursor-pointer" title="لون الخط">
            <span className="text-xs font-black" style={{ color: textColor }}>A</span>
            <input
              type="color"
              value={textColor}
              onChange={(e) => handleTextColorChange(e.target.value)}
              className="w-4 h-4 p-0 border-0 cursor-pointer rounded overflow-hidden"
            />
          </label>
          <label className="flex items-center gap-1 p-1 hover:bg-slate-100 rounded-lg cursor-pointer" title="لون تمييز النص (تظليل)">
            <span className="text-[10px] font-black px-1 rounded" style={{ backgroundColor: highlightColor === '#ffffff' ? '#fef08a' : highlightColor }}>🖍️</span>
            <input
              type="color"
              value={highlightColor === '#ffffff' ? '#fef08a' : highlightColor}
              onChange={(e) => handleHighlightColorChange(e.target.value)}
              className="w-4 h-4 p-0 border-0 cursor-pointer rounded overflow-hidden"
            />
          </label>
        </div>

        <div className="h-5 w-[1px] bg-slate-200 mx-0.5" />

        {/* Alignment */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => formatDoc('justifyRight')}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-700 transition cursor-pointer"
            title="محاذاة لليمين"
          >
            <AlignRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => formatDoc('justifyCenter')}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-700 transition cursor-pointer"
            title="توسيط"
          >
            <AlignCenter className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => formatDoc('justifyLeft')}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-700 transition cursor-pointer"
            title="محاذاة لليسار"
          >
            <AlignLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => formatDoc('justifyFull')}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-700 transition cursor-pointer"
            title="محاذاة كاملة (ضبط)"
          >
            <AlignJustify className="w-4 h-4" />
          </button>
        </div>

        <div className="h-5 w-[1px] bg-slate-200 mx-0.5" />

        {/* Lists & Dividers */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => formatDoc('insertUnorderedList')}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-700 transition cursor-pointer"
            title="قائمة نقطية"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => formatDoc('insertOrderedList')}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-700 transition cursor-pointer"
            title="قائمة رقمية (1, 2, 3..)"
          >
            <ListOrdered className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => formatDoc('insertHorizontalRule')}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-700 transition cursor-pointer"
            title="إدراج خط فاصل بين الأسئلة"
          >
            <Minus className="w-4 h-4" />
          </button>
        </div>

        <div className="h-5 w-[1px] bg-slate-200 mx-0.5" />

        {/* Insert Image & Table */}
        <div className="flex items-center gap-1">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageUpload}
            accept="image/*"
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-2 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg font-bold transition flex items-center gap-1 cursor-pointer"
            title="إدراج صورة أو رسم توضيحي من جهازك"
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>إدراج صورة 🖼️</span>
          </button>

          <button
            type="button"
            onClick={() => setShowTableModal(true)}
            className="px-2 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg font-bold transition flex items-center gap-1 cursor-pointer"
            title="إدراج جدول منسق للأسئلة"
          >
            <TableIcon className="w-3.5 h-3.5" />
            <span>إدراج جدول ▦</span>
          </button>
        </div>

        <div className="h-5 w-[1px] bg-slate-200 mx-0.5" />

        {/* Quick Question Snippet Templates */}
        <div className="flex items-center gap-1 bg-amber-50/70 p-1 rounded-xl border border-amber-200/80">
          <span className="text-[10px] text-amber-800 font-black px-1 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-600" />
            <span>قوالب أسئلة جاهزة:</span>
          </span>
          <button
            type="button"
            onClick={() => insertQuestionSnippet('multiple_choice')}
            className="px-2 py-0.5 bg-white hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-md text-[10px] font-bold transition cursor-pointer"
          >
            اختيارات
          </button>
          <button
            type="button"
            onClick={() => insertQuestionSnippet('true_false')}
            className="px-2 py-0.5 bg-white hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-md text-[10px] font-bold transition cursor-pointer"
          >
            صح وخطأ
          </button>
          <button
            type="button"
            onClick={() => insertQuestionSnippet('fill_blanks')}
            className="px-2 py-0.5 bg-white hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-md text-[10px] font-bold transition cursor-pointer"
          >
            فراغات
          </button>
          <button
            type="button"
            onClick={() => insertQuestionSnippet('matching')}
            className="px-2 py-0.5 bg-white hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-md text-[10px] font-bold transition cursor-pointer"
          >
            توصيل / مطابقة
          </button>
          <button
            type="button"
            onClick={() => insertQuestionSnippet('essay')}
            className="px-2 py-0.5 bg-white hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-md text-[10px] font-bold transition cursor-pointer"
          >
            مقالي / مسألة
          </button>
        </div>

        <div className="mr-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => formatDoc('undo')}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 transition cursor-pointer"
            title="تراجع (Ctrl+Z)"
          >
            <Undo className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => formatDoc('redo')}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 transition cursor-pointer"
            title="إعادة (Ctrl+Y)"
          >
            <Redo className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Insert Table Modal */}
      {showTableModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 max-w-sm w-full space-y-4 shadow-xl text-right">
            <h4 className="font-extrabold text-sm text-slate-800 flex items-center gap-2">
              <TableIcon className="w-4 h-4 text-indigo-600" />
              <span>إدراج جدول في ورقة الأسئلة</span>
            </h4>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-bold text-slate-600 mb-1">عدد الصفوف:</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={tableRows}
                  onChange={(e) => setTableRows(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full border border-slate-200 rounded-xl p-2 text-center font-bold"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-600 mb-1">عدد الأعمدة:</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={tableCols}
                  onChange={(e) => setTableCols(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full border border-slate-200 rounded-xl p-2 text-center font-bold"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowTableModal(false)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleInsertTable}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition"
              >
                إدراج الجدول الآن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Word Document A4 Sheet Simulation */}
      <div 
        id="exam-paper-printable-sheet"
        className="w-full max-w-4xl bg-white rounded-2xl shadow-xl border border-slate-200 p-6 sm:p-10 md:p-14 min-h-[1050px] text-right transition-all print:shadow-none print:border-none print:p-0 print:m-0"
        style={{
          fontFamily: activeFont,
          direction: 'rtl'
        }}
      >
        {/* Official Exam Header Box */}
        <div className="border-2 border-slate-900 p-4 sm:p-5 rounded-xl mb-6 bg-slate-50/60 print:bg-white print:border-slate-900">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-b border-slate-300 pb-3 mb-3">
            {/* Right side: Ministry & School */}
            <div className="text-right space-y-0.5">
              <h4 className="font-extrabold text-xs text-slate-800">{headerConfig.ministryText || 'وزارة التربية والتعليم'}</h4>
              <h3 className="font-black text-sm text-indigo-900">{headerConfig.schoolName || 'المدرسة الدولية الخاصة'}</h3>
              <p className="text-[11px] text-slate-600">العام الدراسي: <strong>{headerConfig.academicYear || '2025 - 2026 م'}</strong></p>
            </div>

            {/* Center: Title & Subject */}
            <div className="text-center space-y-1">
              <h2 className="font-black text-base sm:text-lg text-slate-950 underline decoration-2 underline-offset-4">
                {headerConfig.examTitle || 'أسئلة المذاكرة والاختبار'}
              </h2>
              <div className="flex items-center justify-center gap-2 text-xs font-black text-slate-800">
                <span className="bg-indigo-50 border border-indigo-200 text-indigo-900 px-2 py-0.5 rounded-md">مادة: {headerConfig.subject}</span>
                <span>•</span>
                <span className="bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md">{headerConfig.className}</span>
              </div>
            </div>

            {/* Left side: Duration, Marks, Teacher */}
            <div className="text-left space-y-0.5 text-xs text-slate-700 font-medium" style={{ direction: 'rtl' }}>
              <p>زمن الامتحان: <strong>{headerConfig.duration || 'ساعة ونصف'}</strong></p>
              <p>الدرجة الكلية: <strong className="text-indigo-800 font-bold">{headerConfig.totalMarks || '100 درجة'}</strong></p>
              <p>تاريخ الاختبار: <strong>{headerConfig.examDate || new Date().toISOString().split('T')[0]}</strong></p>
              <p>معلم المادة: <strong className="text-slate-900 font-bold">{headerConfig.teacherName}</strong></p>
            </div>
          </div>

          {/* Student Identification Line */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-800 pt-1 border-t border-dashed border-slate-200">
            <div className="flex-1 text-right">
              <span className="font-bold">اسم الطالب/ـة: </span>
              <span className="text-slate-400 font-light">...........................................................................................</span>
            </div>
            <div className="w-48 text-right">
              <span className="font-bold">الرقم الموحد / القيد: </span>
              <span className="text-slate-400 font-light">........................</span>
            </div>
            <div className="w-24 text-left">
              <span className="font-bold">الشعبة: </span>
              <span className="text-slate-400 font-light">[ ...... ]</span>
            </div>
          </div>

          {/* Custom Open Fields if configured */}
          {headerConfig.customFields && headerConfig.customFields.length > 0 && (
            <div className="mt-2.5 pt-2 border-t border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-slate-700 bg-white/70 p-2 rounded-lg">
              {headerConfig.customFields.map((field, idx) => (
                <div key={idx}>
                  <strong className="text-slate-900">{field.label}:</strong> {field.value || '---'}
                </div>
              ))}
            </div>
          )}

          {/* Important Instructions Box */}
          {headerConfig.instructions && (
            <div className="mt-2.5 p-2 rounded-lg bg-amber-50/80 border border-amber-200/70 text-[11px] text-amber-950 font-medium leading-relaxed">
              <strong>📌 تعليمات هامة: </strong>
              <span>{headerConfig.instructions}</span>
            </div>
          )}
        </div>

        {/* ContentEditable Sheet Body */}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          className="min-h-[600px] outline-none text-slate-900 leading-relaxed text-base focus:ring-1 focus:ring-indigo-100 p-2 rounded-lg transition"
          style={{
            lineHeight: 1.8,
            fontFamily: activeFont,
            fontSize: activeFontSize
          }}
          placeholder="ابدأ بكتابة أسئلة الامتحان والمذاكرة هنا، يمكنك التنسيق وإدراج الجداول والصور بحرية تامة..."
        />

        {/* Bottom Exam Conclusion */}
        <div className="mt-12 pt-4 border-t-2 border-slate-800 text-center text-xs font-bold text-slate-600 flex items-center justify-between">
          <span>المدرسة الدولية الخاصة - نموذج معتمد</span>
          <span className="font-black text-slate-900">✨ انتهت الأسئلة - مع تمنياتنا لجميع الطلبة بالنجاح والتفوق ✨</span>
          <span>توقيع المعلم: ........................</span>
        </div>
      </div>

      {/* Director Notes Panel (If in Director Role or if notes exist) */}
      {(currentUserRole === 'director' || directorNotes) && (
        <div className="w-full max-w-4xl mt-4 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm text-right print:hidden">
          <div className="flex items-center gap-2 mb-2 text-indigo-900 font-bold text-xs">
            <AlertCircle className="w-4 h-4 text-indigo-600" />
            <span>ملاحظات وتوجيهات إدارة المدرسة على ورقة الأسئلة:</span>
          </div>
          {currentUserRole === 'director' ? (
            <textarea
              value={directorNotes}
              onChange={(e) => setDirectorNotes(e.target.value)}
              placeholder="اكتب ملاحظات الإدارة وتوجيهات التعديل للمعلم هنا (إن وجدت)..."
              rows={2}
              className="w-full border border-slate-200 rounded-xl p-2.5 text-xs focus:border-indigo-500 focus:outline-none"
            />
          ) : (
            <p className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-xs text-amber-900 font-medium">
              {directorNotes}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
