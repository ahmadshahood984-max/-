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
  Sliders,
  X,
  Calculator,
  RotateCcw
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

const QUESTION_NUMBERS = [
  'السؤال الأول',
  'السؤال الثاني',
  'السؤال الثالث',
  'السؤال الرابع',
  'السؤال الخامس',
  'السؤال السادس',
  'السؤال السابع',
  'السؤال الثامن',
  'السؤال التاسع',
  'السؤال العاشر',
  'السؤال الحادي عشر',
  'السؤال الثاني عشر',
];

export const ExamQuestionPaperEditor: React.FC<ExamQuestionPaperEditorProps> = ({
  paper,
  currentUserRole,
  currentTeacherName = 'المعلم',
  currentTeacherId = 't1',
  defaultSubject = 'الرياضيات',
  defaultClassName = 'الصف الخامس',
  defaultClassId = 'c1',
  onSave,
  onClose,
  availableClasses = [],
  availableSubjects = ['الرياضيات', 'اللغة العربية', 'العلوم', 'التربية الإسلامية', 'اللغة الإنجليزية', 'الاجتماعيات']
}) => {
  // Document state
  const [paperId] = useState<string>(paper?.id || `exam_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
  const [docTitle, setDocTitle] = useState<string>(paper?.title || 'أسئلة المذاكرة والاختبار');
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
    instructions: 'أجب عن جميع الأسئلة الآتية بدقة وخط واضح. بيّن خطوات العمليات الحسابية بالتفصيل.',
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
  const [activeFontSize, setActiveFontSize] = useState<string>('12pt');
  const [insertCount, setInsertCount] = useState<number>(5);
  const [textColor, setTextColor] = useState<string>('#0f172a');
  const [highlightColor, setHighlightColor] = useState<string>('#ffffff');
  const [savedSuccessMessage, setSavedSuccessMessage] = useState<string>('');

  // Math & Templates Navigation State
  const isMathSubject = headerConfig.subject.includes('رياضيات') || headerConfig.subject.includes('حساب');
  const [activeTabType, setActiveTabType] = useState<'math' | 'general'>(
    isMathSubject ? 'math' : 'general'
  );
  const [activeMathCategory, setActiveMathCategory] = useState<
    'all' | 'division' | 'addition' | 'subtraction' | 'fractions' | 'multiplication' | 'word_problems' | 'geometry' | 'missing_compare'
  >('division');

  // Open & Customizable Question Title State
  const [openQuestionTitle, setOpenQuestionTitle] = useState<string>('');
  const [customQuestionMarks, setCustomQuestionMarks] = useState<string>('20 درجة');

  // Two-step clear page confirmation state (no window.confirm needed)
  const [confirmClearActive, setConfirmClearActive] = useState<boolean>(false);
  const [undoBufferHtml, setUndoBufferHtml] = useState<string | null>(null);

  // Empty document tracking
  const [isDocEmpty, setIsDocEmpty] = useState<boolean>(!paper?.contentHtml || paper.contentHtml.trim() === '');

  // Editor ref
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync tab with subject change
  useEffect(() => {
    if (headerConfig.subject.includes('رياضيات') || headerConfig.subject.includes('حساب')) {
      setActiveTabType('math');
    }
  }, [headerConfig.subject]);

  // Initialize editor content - COMPLETELY BLANK if no existing content
  useEffect(() => {
    if (editorRef.current) {
      if (paper?.contentHtml && paper.contentHtml.trim().length > 0) {
        editorRef.current.innerHTML = paper.contentHtml;
        setIsDocEmpty(false);
      } else {
        editorRef.current.innerHTML = '';
        setIsDocEmpty(true);
      }
    }
  }, [paper]);

  // Check if editor is currently empty
  const checkDocEmpty = () => {
    if (!editorRef.current) return true;
    const text = editorRef.current.innerText || '';
    const html = editorRef.current.innerHTML || '';
    const hasBlocks = editorRef.current.querySelectorAll('.question-block').length > 0;
    const empty = !hasBlocks && (text.trim() === '' || html === '<p><br></p>' || html === '<br>');
    setIsDocEmpty(empty);
    return empty;
  };

  // Next auto question number based on existing questions
  const getNextAutoQuestionNumber = (): string => {
    const currentCount = editorRef.current?.querySelectorAll('.question-block').length || 0;
    return QUESTION_NUMBERS[currentCount] || `السؤال رقم (${currentCount + 1})`;
  };

  // Helper to determine the effective question title and label
  const getNextQuestionLabel = (): string => {
    if (openQuestionTitle && openQuestionTitle.trim()) {
      return openQuestionTitle.trim();
    }
    return getNextAutoQuestionNumber();
  };

  // Helper to build a question header with integrated delete button
  const buildQuestionHeader = (qLabel: string, subTitle: string, qMarks: string) => `
    <div class="question-header-row" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; border-bottom: 1.5px solid #0f172a; padding-bottom: 3px; gap: 8px;">
      <div style="font-weight: bold; font-size: 12pt; color: #0f172a; flex: 1;">
        <span>${qLabel}: ${subTitle}</span>
      </div>
      <div style="display: flex; align-items: center; gap: 6px;" contenteditable="false" class="no-print">
        <span style="color: #4338ca; font-size: 10.5pt; background: #e0e7ff; padding: 1px 6px; border-radius: 4px; font-weight: bold; white-space: nowrap;">[ ${qMarks} ]</span>
        <button type="button" class="btn-delete-question" style="background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; border-radius: 4px; padding: 1px 6px; font-size: 10pt; font-weight: bold; cursor: pointer; display: inline-flex; align-items: center; gap: 2px;" title="حذف هذا السؤال من الورقة">
          <span>🗑️ حذف</span>
        </button>
      </div>
    </div>
  `;

  // Handle click delegation inside editor for question deletion
  const handleEditorClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const deleteBtn = target.closest('.btn-delete-question');
    if (deleteBtn) {
      e.preventDefault();
      e.stopPropagation();
      const questionBlock = deleteBtn.closest('.question-block');
      if (questionBlock && editorRef.current) {
        setUndoBufferHtml(editorRef.current.innerHTML);
        questionBlock.remove();
        checkDocEmpty();
        setSavedSuccessMessage('تم حذف السؤال بنجاح 🗑️ (يمكنك التراجع من زر تراجع)');
        setTimeout(() => setSavedSuccessMessage(''), 3500);
      }
    }
  };

  // Delete the last question in document
  const handleDeleteLastQuestion = () => {
    if (!editorRef.current) return;
    const blocks = editorRef.current.querySelectorAll('.question-block');
    if (blocks.length === 0) {
      setSavedSuccessMessage('⚠️ لا توجد أسئلة لحذفها في الصفحة.');
      setTimeout(() => setSavedSuccessMessage(''), 2500);
      return;
    }
    const lastBlock = blocks[blocks.length - 1];
    setUndoBufferHtml(editorRef.current.innerHTML);
    lastBlock.remove();
    checkDocEmpty();
    setSavedSuccessMessage(`تم حذف آخر سؤال (${blocks.length}) بنجاح 🗑️`);
    setTimeout(() => setSavedSuccessMessage(''), 3500);
  };

  // Restore undo backup
  const handleRestoreUndo = () => {
    if (undoBufferHtml !== null && editorRef.current) {
      editorRef.current.innerHTML = undoBufferHtml;
      checkDocEmpty();
      setUndoBufferHtml(null);
      setSavedSuccessMessage('تم استرجاع المحتوى والتراجع بنجاح ↩️');
      setTimeout(() => setSavedSuccessMessage(''), 3000);
    }
  };

  // Clear document with reliable 2-step confirmation (no blocked window.confirm)
  const handleClearDocument = () => {
    if (!confirmClearActive) {
      setConfirmClearActive(true);
      setTimeout(() => {
        setConfirmClearActive(false);
      }, 5000);
      return;
    }

    // Confirmed second click
    if (editorRef.current) {
      setUndoBufferHtml(editorRef.current.innerHTML);
      editorRef.current.innerHTML = '';
      setIsDocEmpty(true);
      setConfirmClearActive(false);
      setSavedSuccessMessage('تم تفريغ ورقة الأسئلة بالكامل للبدء بصفحة بيضاء 📄 (يمكنك التراجع)');
      setTimeout(() => setSavedSuccessMessage(''), 4000);
    }
  };

  // Execute formatting command on contentEditable
  const formatDoc = (cmd: string, val: string | undefined = undefined) => {
    document.execCommand(cmd, false, val);
    if (editorRef.current) {
      editorRef.current.focus();
      checkDocEmpty();
    }
  };

  // Insert HTML into editor sheet (at caret or appended)
  const insertHtmlSnippet = (snippetHtml: string) => {
    if (!editorRef.current) return;

    // Save for undo
    setUndoBufferHtml(editorRef.current.innerHTML);

    // Clean up empty placeholder remnants
    const currentHtml = editorRef.current.innerHTML.trim();
    if (currentHtml === '<p><br></p>' || currentHtml === '<br>') {
      editorRef.current.innerHTML = '';
    }

    editorRef.current.focus();
    const selection = window.getSelection();
    let insertedAtCaret = false;

    if (selection && selection.rangeCount > 0 && editorRef.current.contains(selection.anchorNode)) {
      try {
        document.execCommand('insertHTML', false, snippetHtml + '<p><br></p>');
        insertedAtCaret = true;
      } catch (err) {
        console.warn('execCommand failed, appending to sheet:', err);
      }
    }

    if (!insertedAtCaret) {
      editorRef.current.innerHTML += snippetHtml + '<p><br></p>';
    }

    setIsDocEmpty(false);
    editorRef.current.focus();

    // If an open custom title was used, we can keep or reset it
    setSavedSuccessMessage('تم إدراج السؤال في الورقة بنجاح ✨');
    setTimeout(() => setSavedSuccessMessage(''), 2500);
  };

  // Font family change
  const handleFontChange = (font: string) => {
    setActiveFont(font);
    formatDoc('fontName', font);
  };

  // Font size change
  const handleFontSizeChange = (size: string) => {
    setActiveFontSize(size);
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
          insertHtmlSnippet(imgHtml);
        }
      };
      reader.readAsDataURL(file);
    }
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
    insertHtmlSnippet(tableHtml);
    setShowTableModal(false);
  };

  // ==========================================
  // MATHEMATICS QUESTION TEMPLATES SUITE
  // ==========================================
  // Arabic alphabet labels for multiple examples
  const SUB_EXAMPLE_LABELS = ['(أ)', '(ب)', '(ج)', '(د)', '(هـ)', '(و)', '(ز)', '(ح)', '(ط)', '(ي)', '(ك)', '(ل)', '(م)', '(ن)', '(س)', '(ع)'];

  // ==========================================
  // MATHEMATICS QUESTION TEMPLATES SUITE (DYNAMIC COUNT & 12pt COMPACT)
  // ==========================================
  const insertMathSnippet = (type: string, overrideCount?: number) => {
    const qLabel = getNextQuestionLabel();
    const qMarks = customQuestionMarks || '20 درجة';
    const count = overrideCount || insertCount || 5;
    let snippet = '';

    // Quick inline fraction at cursor
    if (type === 'inline_fraction') {
      const inlineSnippet = `<span style="display: inline-flex; flex-direction: column; align-items: center; vertical-align: middle; margin: 0 3px; font-size: 12pt;"><span contenteditable="true" style="min-width: 22px; height: 22px; border: 1.5px dashed #475569; border-radius: 4px; display: inline-flex; align-items: center; justify-content: center; font-weight: bold; font-size: 12pt; padding: 0 4px; background: #f8fafc; text-align: center; color: #0f172a;"></span><span style="width: 100%; min-width: 24px; height: 1.5px; background: #0f172a; margin: 1.5px 0;"></span><span contenteditable="true" style="min-width: 22px; height: 22px; border: 1.5px dashed #475569; border-radius: 4px; display: inline-flex; align-items: center; justify-content: center; font-weight: bold; font-size: 12pt; padding: 0 4px; background: #f8fafc; text-align: center; color: #0f172a;"></span></span>&nbsp;`;
      insertHtmlSnippet(inlineSnippet);
      return;
    }

    // 1. EQUATION TEMPLATE: إدراج معادلة مثل هذه (كسر بمربعات منقطة مثل الوورد)
    if (type === 'equation_fraction') {
      let itemsHtml = '';
      for (let i = 0; i < count; i++) {
        const lbl = SUB_EXAMPLE_LABELS[i] || `(${i + 1})`;
        itemsHtml += `
          <div style="flex: 1 1 180px; max-width: 240px; padding: 5px 8px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; display: inline-flex; align-items: center; justify-content: space-between; gap: 4px; font-size: 12pt;">
            <span style="font-weight: bold; color: #4338ca; font-size: 11pt;">${lbl}</span>
            <div style="display: inline-flex; flex-direction: column; align-items: center; vertical-align: middle;">
              <div contenteditable="true" style="min-width: 24px; height: 22px; border: 1.5px dashed #475569; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 12pt; padding: 0 3px; background: #f8fafc; text-align: center; color: #0f172a;"></div>
              <div style="width: 100%; min-width: 28px; height: 1.5px; background-color: #0f172a; margin: 2px 0;"></div>
              <div contenteditable="true" style="min-width: 24px; height: 22px; border: 1.5px dashed #475569; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 12pt; padding: 0 3px; background: #f8fafc; text-align: center; color: #0f172a;"></div>
            </div>
            <span style="font-size: 12pt; font-weight: bold; color: #334155;">=</span>
            <span style="border-bottom: 1.5px dotted #475569; min-width: 45px; display: inline-block; text-align: center; color: #94a3b8; font-size: 11pt;">.......</span>
          </div>
        `;
      }
      snippet = `
        <div class="question-block" style="margin-bottom: 12px; page-break-inside: avoid; font-size: 12pt;">
          ${buildQuestionHeader(qLabel, openQuestionTitle || 'احسب ناتج المعادلات والكسور الآتية:', qMarks)}
          <div style="display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-start; margin: 8px 0; font-size: 12pt;" dir="rtl">
            ${itemsHtml}
          </div>
        </div>
      `;
    }

    // 2. HORIZONTAL ADDITION: إدراج جمع أفقي مثل هذه (٧ + ٨ =)
    else if (type === 'addition_horizontal') {
      const additionPairs = [
        { a: '٧', b: '٨' },
        { a: '٢٥', b: '٣٤' },
        { a: '١٤٠', b: '٢٥٠' },
        { a: '٤٥٢', b: '١٣٨' },
        { a: '٦٥', b: '٢٨' },
        { a: '٣١٤', b: '٥٢٣' },
        { a: '٨٩', b: '١٧' },
        { a: '٧٥٠', b: '٤٢٠' },
        { a: '٥٦', b: '٣٩' },
        { a: '٤٢٥', b: '١٦٠' },
        { a: '٩٤', b: '٤٨' },
        { a: '٣٨٠', b: '٢٩٠' }
      ];
      let itemsHtml = '';
      for (let i = 0; i < count; i++) {
        const pair = additionPairs[i % additionPairs.length];
        const lbl = SUB_EXAMPLE_LABELS[i] || `(${i + 1})`;
        itemsHtml += `
          <div style="padding: 4px 10px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; display: inline-flex; align-items: center; gap: 4px; font-size: 12pt; min-width: 130px;">
            <span style="font-weight: bold; color: #047857; font-size: 11pt;">${lbl}</span>
            <span contenteditable="true" style="font-weight: bold; font-size: 12pt; padding: 1px 3px; min-width: 16px; text-align: center;">${pair.a}</span>
            <span style="font-weight: bold; color: #047857; font-size: 13pt;">+</span>
            <span contenteditable="true" style="font-weight: bold; font-size: 12pt; padding: 1px 3px; min-width: 16px; text-align: center;">${pair.b}</span>
            <span style="font-weight: bold; font-size: 12pt;">=</span>
            <span style="border-bottom: 1.5px dotted #475569; min-width: 45px; display: inline-block; text-align: center; color: #94a3b8; font-size: 11pt;">........</span>
          </div>
        `;
      }
      snippet = `
        <div class="question-block" style="margin-bottom: 12px; page-break-inside: avoid; font-size: 12pt;">
          ${buildQuestionHeader(qLabel, openQuestionTitle || 'احسب ناتج الجمع الأفقي في كل مما يأتي:', qMarks)}
          <div style="display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-start; margin: 8px 0; font-size: 12pt;" dir="rtl">
            ${itemsHtml}
          </div>
        </div>
      `;
    }

    // 3. VERTICAL ADDITION: إدراج جمع عمودي مثل هذه (٨ وتحتها ٧ مع +)
    else if (type === 'addition_vertical') {
      const verticalAddPairs = [
        { a: '٨', b: '٧' },
        { a: '٥٦', b: '٢٩' },
        { a: '٣٤٥', b: '١٢٤' },
        { a: '٦٧٢', b: '٥١٩' },
        { a: '٤٨', b: '٣٥' },
        { a: '٨٢٠', b: '١٤٥' },
        { a: '٧٤', b: '١٩' },
        { a: '٤٣١', b: '٢٨٦' },
        { a: '٩٣', b: '٥٤' },
        { a: '٦١٥', b: '٢٧٠' }
      ];
      let itemsHtml = '';
      for (let i = 0; i < count; i++) {
        const pair = verticalAddPairs[i % verticalAddPairs.length];
        const lbl = SUB_EXAMPLE_LABELS[i] || `(${i + 1})`;
        itemsHtml += `
          <div style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; padding: 5px 8px; flex: 1 1 80px; max-width: 130px; min-width: 75px; text-align: center; font-size: 12pt;">
            <div style="font-weight: bold; font-size: 10pt; color: #047857; margin-bottom: 2px; text-align: right;">${lbl}</div>
            <table style="border-collapse: collapse; margin: 0 auto; font-size: 13pt; font-weight: bold; text-align: center;" dir="rtl">
              <tr>
                <td style="width: 18px;"></td>
                <td contenteditable="true" style="padding: 1px 4px; text-align: center; min-width: 32px; font-size: 13pt;">${pair.a}</td>
              </tr>
              <tr>
                <td style="color: #047857; padding: 1px 3px; font-weight: bold; font-size: 13pt;">+</td>
                <td contenteditable="true" style="padding: 1px 4px; text-align: center; min-width: 32px; font-size: 13pt;">${pair.b}</td>
              </tr>
              <tr>
                <td colspan="2" style="border-top: 2px solid #0f172a; padding-top: 3px;">
                  <div style="border-bottom: 1.5px dotted #64748b; height: 16px; min-width: 42px; margin: 0 auto;"></div>
                </td>
              </tr>
            </table>
          </div>
        `;
      }
      snippet = `
        <div class="question-block" style="margin-bottom: 12px; page-break-inside: avoid; font-size: 12pt;">
          ${buildQuestionHeader(qLabel, openQuestionTitle || 'أوجد ناتج الجمع العمودي في كل مما يأتي:', qMarks)}
          <div style="display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px; margin: 8px 0; font-size: 12pt;" dir="rtl">
            ${itemsHtml}
          </div>
        </div>
      `;
    }

    // 4. HORIZONTAL SUBTRACTION: إدراج طرح أفقي مثل هذه (٨ - ٧ =)
    else if (type === 'subtraction_horizontal') {
      const subPairs = [
        { a: '٨', b: '٧' },
        { a: '٩٥', b: '٤٢' },
        { a: '٥٠٠', b: '١٧٥' },
        { a: '٨٤', b: '٣٧' },
        { a: '٧٦', b: '٢٩' },
        { a: '٦٣', b: '١٨' },
        { a: '٤١٥', b: '٢١٠' },
        { a: '٨٩', b: '٤٥' },
        { a: '٣٠٠', b: '١٢٥' },
        { a: '٩٢', b: '٤٨' }
      ];
      let itemsHtml = '';
      for (let i = 0; i < count; i++) {
        const pair = subPairs[i % subPairs.length];
        const lbl = SUB_EXAMPLE_LABELS[i] || `(${i + 1})`;
        itemsHtml += `
          <div style="padding: 4px 10px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; display: inline-flex; align-items: center; gap: 4px; font-size: 12pt; min-width: 130px;">
            <span style="font-weight: bold; color: #b91c1c; font-size: 11pt;">${lbl}</span>
            <span contenteditable="true" style="font-weight: bold; font-size: 12pt; padding: 1px 3px; min-width: 16px; text-align: center;">${pair.a}</span>
            <span style="font-weight: bold; color: #b91c1c; font-size: 13pt;">-</span>
            <span contenteditable="true" style="font-weight: bold; font-size: 12pt; padding: 1px 3px; min-width: 16px; text-align: center;">${pair.b}</span>
            <span style="font-weight: bold; font-size: 12pt;">=</span>
            <span style="border-bottom: 1.5px dotted #475569; min-width: 45px; display: inline-block; text-align: center; color: #94a3b8; font-size: 11pt;">........</span>
          </div>
        `;
      }
      snippet = `
        <div class="question-block" style="margin-bottom: 12px; page-break-inside: avoid; font-size: 12pt;">
          ${buildQuestionHeader(qLabel, openQuestionTitle || 'احسب ناتج الطرح الأفقي في كل مما يأتي:', qMarks)}
          <div style="display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-start; margin: 8px 0; font-size: 12pt;" dir="rtl">
            ${itemsHtml}
          </div>
        </div>
      `;
    }

    // 5. VERTICAL SUBTRACTION: إدراج طرح عمودي مثل هذه (٨ وتحتها ٧ مع -)
    else if (type === 'subtraction_vertical') {
      const verticalSubPairs = [
        { a: '٨', b: '٧' },
        { a: '٨٤', b: '٣٧' },
        { a: '٩٥', b: '٤٢' },
        { a: '٥٦٢', b: '٢٣٨' },
        { a: '٧٥', b: '٢٩' },
        { a: '٤٠٠', b: '١٥٦' },
        { a: '٦٣', b: '٢٨' },
        { a: '٨١٩', b: '٣٤٥' },
        { a: '٩٠', b: '٤٣' },
        { a: '٧٢٥', b: '٣٦٨' }
      ];
      let itemsHtml = '';
      for (let i = 0; i < count; i++) {
        const pair = verticalSubPairs[i % verticalSubPairs.length];
        const lbl = SUB_EXAMPLE_LABELS[i] || `(${i + 1})`;
        itemsHtml += `
          <div style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; padding: 5px 8px; flex: 1 1 80px; max-width: 130px; min-width: 75px; text-align: center; font-size: 12pt;">
            <div style="font-weight: bold; font-size: 10pt; color: #b91c1c; margin-bottom: 2px; text-align: right;">${lbl}</div>
            <table style="border-collapse: collapse; margin: 0 auto; font-size: 13pt; font-weight: bold; text-align: center;" dir="rtl">
              <tr>
                <td style="width: 18px;"></td>
                <td contenteditable="true" style="padding: 1px 4px; text-align: center; min-width: 32px; font-size: 13pt;">${pair.a}</td>
              </tr>
              <tr>
                <td style="color: #b91c1c; padding: 1px 3px; font-weight: bold; font-size: 13pt;">-</td>
                <td contenteditable="true" style="padding: 1px 4px; text-align: center; min-width: 32px; font-size: 13pt;">${pair.b}</td>
              </tr>
              <tr>
                <td colspan="2" style="border-top: 2px solid #0f172a; padding-top: 3px;">
                  <div style="border-bottom: 1.5px dotted #64748b; height: 16px; min-width: 42px; margin: 0 auto;"></div>
                </td>
              </tr>
            </table>
          </div>
        `;
      }
      snippet = `
        <div class="question-block" style="margin-bottom: 12px; page-break-inside: avoid; font-size: 12pt;">
          ${buildQuestionHeader(qLabel, openQuestionTitle || 'أوجد ناتج الطرح العمودي في كل مما يأتي:', qMarks)}
          <div style="display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px; margin: 8px 0; font-size: 12pt;" dir="rtl">
            ${itemsHtml}
          </div>
        </div>
      `;
    }

    // 6. HORIZONTAL DIVISION: إدراج قسمة أفقي مثل هذه (٧ ÷ ٨ =)
    else if (type === 'division_horizontal') {
      const divPairs = [
        { a: '٧', b: '٨' },
        { a: '٥٦', b: '٧' },
        { a: '٤٥', b: '٩' },
        { a: '٧٢', b: '٨' },
        { a: '٦٣', b: '٧' },
        { a: '٨١', b: '٩' },
        { a: '٣٦', b: '٦' },
        { a: '٤٨', b: '٦' },
        { a: '٩٠', b: '٩' },
        { a: '٦٤', b: '٨' }
      ];
      let itemsHtml = '';
      for (let i = 0; i < count; i++) {
        const pair = divPairs[i % divPairs.length];
        const lbl = SUB_EXAMPLE_LABELS[i] || `(${i + 1})`;
        itemsHtml += `
          <div style="padding: 4px 10px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; display: inline-flex; align-items: center; gap: 4px; font-size: 12pt; min-width: 130px;">
            <span style="font-weight: bold; color: #0284c7; font-size: 11pt;">${lbl}</span>
            <span contenteditable="true" style="font-weight: bold; font-size: 12pt; padding: 1px 3px; min-width: 16px; text-align: center;">${pair.a}</span>
            <span style="font-weight: bold; color: #0284c7; font-size: 13pt;">÷</span>
            <span contenteditable="true" style="font-weight: bold; font-size: 12pt; padding: 1px 3px; min-width: 16px; text-align: center;">${pair.b}</span>
            <span style="font-weight: bold; font-size: 12pt;">=</span>
            <span style="border-bottom: 1.5px dotted #475569; min-width: 45px; display: inline-block; text-align: center; color: #94a3b8; font-size: 11pt;">........</span>
          </div>
        `;
      }
      snippet = `
        <div class="question-block" style="margin-bottom: 12px; page-break-inside: avoid; font-size: 12pt;">
          ${buildQuestionHeader(qLabel, openQuestionTitle || 'احسب ناتج عمليات القسمة الأفقية الآتية:', qMarks)}
          <div style="display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-start; margin: 8px 0; font-size: 12pt;" dir="rtl">
            ${itemsHtml}
          </div>
        </div>
      `;
    }

    // 7. LONG DIVISION (BRACKET): إدراج قسمة مثل هذه (كرسي القسمة المطولة)
    else if (type === 'division_long' || type === 'division_bracket') {
      const longDivPairs = [
        { dividend: '٥ ٦', divisor: '٧' },
        { dividend: '٩ ٦', divisor: '٨' },
        { dividend: '٨ ٤', divisor: '٤' },
        { dividend: '٧ ٥', divisor: '٥' },
        { dividend: '١ ٢ ٥', divisor: '٥' },
        { dividend: '٩ ٠', divisor: '٦' },
        { dividend: '٦ ٤', divisor: '٤' },
        { dividend: '٨ ٥', divisor: '٥' }
      ];
      let itemsHtml = '';
      for (let i = 0; i < count; i++) {
        const pair = longDivPairs[i % longDivPairs.length];
        const lbl = SUB_EXAMPLE_LABELS[i] || `(${i + 1})`;
        itemsHtml += `
          <div style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 10px; flex: 1 1 130px; max-width: 175px; min-width: 120px; font-size: 12pt;">
            <div style="font-weight: bold; font-size: 10pt; color: #0284c7; margin-bottom: 3px; text-align: right;">${lbl}</div>
            <table style="border-collapse: collapse; margin: 0 auto; font-size: 12pt;" dir="rtl">
              <tr>
                <td style="width: 35px; font-size: 9.5pt; color: #64748b; font-weight: bold; text-align: center;">الناتج:</td>
                <td style="border-bottom: 2px solid #0f172a; padding: 1px 6px; text-align: center; min-width: 65px;">
                  <span contenteditable="true" style="color: #1e3a8a; font-weight: bold;">[ &nbsp; &nbsp; ]</span>
                </td>
              </tr>
              <tr>
                <td contenteditable="true" style="border-left: 2px solid #0f172a; padding: 3px 6px; font-weight: bold; font-size: 13pt; text-align: center; background: #f8fafc;">${pair.divisor}</td>
                <td contenteditable="true" style="padding: 3px 6px; font-weight: bold; font-size: 13pt; letter-spacing: 3px; text-align: center;">${pair.dividend}</td>
              </tr>
              <tr>
                <td style="border-left: 2px solid #0f172a; height: 30px;"></td>
                <td style="color: #94a3b8; font-size: 9.5pt; padding-top: 4px; border-bottom: 1px dotted #cbd5e1; text-align: center;">(خطوات الحل)</td>
              </tr>
              <tr>
                <td style="border-left: 2px solid #0f172a;"></td>
                <td style="padding: 3px 2px; font-size: 9.5pt; font-weight: bold; color: #16a34a; text-align: center;">الباقي = [ &nbsp; ]</td>
              </tr>
            </table>
          </div>
        `;
      }
      snippet = `
        <div class="question-block" style="margin-bottom: 12px; page-break-inside: avoid; font-size: 12pt;">
          ${buildQuestionHeader(qLabel, openQuestionTitle || 'أوجد ناتج وباقي القسمة المطولة موضحاً خطوات الحل:', qMarks)}
          <div style="display: flex; flex-wrap: wrap; justify-content: flex-start; gap: 6px; margin: 8px 0; font-size: 12pt;" dir="rtl">
            ${itemsHtml}
          </div>
        </div>
      `;
    }

    // 8. FRACTIONS OPERATION: إدراج كسور مثل هذه (جمع وطرح كسور)
    else if (type === 'fractions_operation') {
      const fractionPairs = [
        { n1: '٣', d1: '٧', op: '+', n2: '٢', d2: '٧' },
        { n1: '٥', d1: '٨', op: '-', n2: '٢', d2: '٨' },
        { n1: '٤', d1: '٩', op: '+', n2: '٣', d2: '٩' },
        { n1: '٧', d1: '١٠', op: '-', n2: '٣', d2: '١٠' },
        { n1: '١', d1: '٥', op: '+', n2: '٢', d2: '٥' },
        { n1: '٦', d1: '١١', op: '-', n2: '٤', d2: '١١' },
        { n1: '٥', d1: '١٢', op: '+', n2: '٤', d2: '١٢' },
        { n1: '٨', d1: '٩', op: '-', n2: '٥', d2: '٩' }
      ];
      let itemsHtml = '';
      for (let i = 0; i < count; i++) {
        const item = fractionPairs[i % fractionPairs.length];
        const lbl = SUB_EXAMPLE_LABELS[i] || `(${i + 1})`;
        itemsHtml += `
          <div style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 12pt; min-width: 130px;">
            <span style="font-weight: bold; color: #7c3aed; font-size: 11pt;">${lbl}</span>
            <div style="display: inline-flex; flex-direction: column; align-items: center;">
              <span contenteditable="true" style="font-weight: bold; font-size: 12pt; padding: 0 2px; min-width: 14px; text-align: center;">${item.n1}</span>
              <span style="width: 100%; min-width: 18px; height: 1.5px; background: #0f172a;"></span>
              <span contenteditable="true" style="font-weight: bold; font-size: 12pt; padding: 0 2px; min-width: 14px; text-align: center;">${item.d1}</span>
            </div>
            <span style="font-size: 13pt; font-weight: bold; color: ${item.op === '+' ? '#047857' : '#b91c1c'};">${item.op}</span>
            <div style="display: inline-flex; flex-direction: column; align-items: center;">
              <span contenteditable="true" style="font-weight: bold; font-size: 12pt; padding: 0 2px; min-width: 14px; text-align: center;">${item.n2}</span>
              <span style="width: 100%; min-width: 18px; height: 1.5px; background: #0f172a;"></span>
              <span contenteditable="true" style="font-weight: bold; font-size: 12pt; padding: 0 2px; min-width: 14px; text-align: center;">${item.d2}</span>
            </div>
            <span style="font-size: 12pt; font-weight: bold;">=</span>
            <div style="display: inline-flex; flex-direction: column; align-items: center;">
              <span style="border-bottom: 1.5px dotted #64748b; min-width: 20px; display: inline-block; height: 12px;"></span>
              <span style="width: 100%; min-width: 20px; height: 1.5px; background: #0f172a;"></span>
              <span style="border-bottom: 1.5px dotted #64748b; min-width: 20px; display: inline-block; height: 12px;"></span>
            </div>
          </div>
        `;
      }
      snippet = `
        <div class="question-block" style="margin-bottom: 12px; page-break-inside: avoid; font-size: 12pt;">
          ${buildQuestionHeader(qLabel, openQuestionTitle || 'احسب ناتج جمع وطرح الكسور الآتية:', qMarks)}
          <div style="display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-start; margin: 8px 0; font-size: 12pt;" dir="rtl">
            ${itemsHtml}
          </div>
        </div>
      `;
    }

    // 4. FRACTIONS TEMPLATES
    else if (type === 'fractions_same_denom') {
      snippet = `
        <div class="question-block" style="margin-bottom: 26px; page-break-inside: avoid;">
          ${buildQuestionHeader(qLabel, 'احسب ناتج جمع وطرح الكسور موحدة المقامات الآتية (واكتب الناتج بأبسط صورة)', qMarks)}
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; font-size: 16px; margin: 12px 6px;">
            <div style="display: flex; align-items: center; gap: 8px; background: #f8fafc; padding: 10px; border-radius: 8px; border: 1px solid #e2e8f0;">
              <span>١) </span>
              <span style="display: inline-flex; flex-direction: column; vertical-align: middle; text-align: center; font-weight: bold;">
                <span style="border-bottom: 2px solid #0f172a; padding: 0 6px;">٣</span>
                <span>٨</span>
              </span>
              <span style="font-size: 18px; font-weight: bold; color: #b91c1c;">+</span>
              <span style="display: inline-flex; flex-direction: column; vertical-align: middle; text-align: center; font-weight: bold;">
                <span style="border-bottom: 2px solid #0f172a; padding: 0 6px;">٢</span>
                <span>٨</span>
              </span>
              <span style="font-size: 18px; font-weight: bold;">=</span>
              <span style="display: inline-flex; flex-direction: column; vertical-align: middle; text-align: center; font-weight: bold;">
                <span style="border-bottom: 2px solid #0f172a; padding: 0 10px;">[ ..... ]</span>
                <span>[ ..... ]</span>
              </span>
            </div>

            <div style="display: flex; align-items: center; gap: 8px; background: #f8fafc; padding: 10px; border-radius: 8px; border: 1px solid #e2e8f0;">
              <span>٢) </span>
              <span style="display: inline-flex; flex-direction: column; vertical-align: middle; text-align: center; font-weight: bold;">
                <span style="border-bottom: 2px solid #0f172a; padding: 0 6px;">٧</span>
                <span>١٠</span>
              </span>
              <span style="font-size: 18px; font-weight: bold; color: #b91c1c;">-</span>
              <span style="display: inline-flex; flex-direction: column; vertical-align: middle; text-align: center; font-weight: bold;">
                <span style="border-bottom: 2px solid #0f172a; padding: 0 6px;">٣</span>
                <span>١٠</span>
              </span>
              <span style="font-size: 18px; font-weight: bold;">=</span>
              <span style="display: inline-flex; flex-direction: column; vertical-align: middle; text-align: center; font-weight: bold;">
                <span style="border-bottom: 2px solid #0f172a; padding: 0 10px;">[ ..... ]</span>
                <span>[ ..... ]</span>
              </span>
            </div>

            <div style="display: flex; align-items: center; gap: 8px; background: #f8fafc; padding: 10px; border-radius: 8px; border: 1px solid #e2e8f0;">
              <span>٣) </span>
              <span style="display: inline-flex; flex-direction: column; vertical-align: middle; text-align: center; font-weight: bold;">
                <span style="border-bottom: 2px solid #0f172a; padding: 0 6px;">٤</span>
                <span>١٥</span>
              </span>
              <span style="font-size: 18px; font-weight: bold; color: #b91c1c;">+</span>
              <span style="display: inline-flex; flex-direction: column; vertical-align: middle; text-align: center; font-weight: bold;">
                <span style="border-bottom: 2px solid #0f172a; padding: 0 6px;">٧</span>
                <span>١٥</span>
              </span>
              <span style="font-size: 18px; font-weight: bold;">=</span>
              <span style="display: inline-flex; flex-direction: column; vertical-align: middle; text-align: center; font-weight: bold;">
                <span style="border-bottom: 2px solid #0f172a; padding: 0 10px;">[ ..... ]</span>
                <span>[ ..... ]</span>
              </span>
            </div>

            <div style="display: flex; align-items: center; gap: 8px; background: #f8fafc; padding: 10px; border-radius: 8px; border: 1px solid #e2e8f0;">
              <span>٤) </span>
              <span style="display: inline-flex; flex-direction: column; vertical-align: middle; text-align: center; font-weight: bold;">
                <span style="border-bottom: 2px solid #0f172a; padding: 0 6px;">٩</span>
                <span>١٢</span>
              </span>
              <span style="font-size: 18px; font-weight: bold; color: #b91c1c;">-</span>
              <span style="display: inline-flex; flex-direction: column; vertical-align: middle; text-align: center; font-weight: bold;">
                <span style="border-bottom: 2px solid #0f172a; padding: 0 6px;">٣</span>
                <span>١٢</span>
              </span>
              <span style="font-size: 18px; font-weight: bold;">=</span>
              <span style="display: inline-flex; flex-direction: column; vertical-align: middle; text-align: center; font-weight: bold;">
                <span style="border-bottom: 2px solid #0f172a; padding: 0 10px;">[ ..... ]</span>
                <span>[ ..... ]</span>
              </span>
            </div>
          </div>
        </div>
      `;
    } else if (type === 'fractions_diff_denom') {
      snippet = `
        <div class="question-block" style="margin-bottom: 26px; page-break-inside: avoid;">
          ${buildQuestionHeader(qLabel, 'وحّد المقامات ثم احسب ناتج جمع وطرح الكسور الآتية', qMarks)}
          <div style="display: flex; flex-direction: column; gap: 14px; font-size: 16px; margin: 10px 4px;">
            <div style="background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0; display: flex; align-items: center; flex-wrap: wrap; gap: 8px;">
              <span>١) </span>
              <span style="display: inline-flex; flex-direction: column; vertical-align: middle; text-align: center; font-weight: bold;">
                <span style="border-bottom: 2px solid #0f172a; padding: 0 6px;">٢</span>
                <span>٣</span>
              </span>
              <span style="font-size: 18px; font-weight: bold; color: #b91c1c;">+</span>
              <span style="display: inline-flex; flex-direction: column; vertical-align: middle; text-align: center; font-weight: bold;">
                <span style="border-bottom: 2px solid #0f172a; padding: 0 6px;">١</span>
                <span>٤</span>
              </span>
              <span style="font-size: 18px; font-weight: bold;">=</span>
              <span style="color: #64748b; font-size: 14px;">(توحيد المقامات على ١٢):</span>
              <span style="display: inline-flex; flex-direction: column; vertical-align: middle; text-align: center; font-weight: bold;">
                <span style="border-bottom: 2px solid #0f172a; padding: 0 8px;">[ ..... ]</span>
                <span>١٢</span>
              </span>
              <span style="font-size: 18px; font-weight: bold; color: #b91c1c;">+</span>
              <span style="display: inline-flex; flex-direction: column; vertical-align: middle; text-align: center; font-weight: bold;">
                <span style="border-bottom: 2px solid #0f172a; padding: 0 8px;">[ ..... ]</span>
                <span>١٢</span>
              </span>
              <span style="font-size: 18px; font-weight: bold;">=</span>
              <span style="display: inline-flex; flex-direction: column; vertical-align: middle; text-align: center; font-weight: bold; color: #4338ca;">
                <span style="border-bottom: 2px solid #4338ca; padding: 0 10px;">[ ..... ]</span>
                <span>[ ..... ]</span>
              </span>
            </div>

            <div style="background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0; display: flex; align-items: center; flex-wrap: wrap; gap: 8px;">
              <span>٢) </span>
              <span style="display: inline-flex; flex-direction: column; vertical-align: middle; text-align: center; font-weight: bold;">
                <span style="border-bottom: 2px solid #0f172a; padding: 0 6px;">٥</span>
                <span>٦</span>
              </span>
              <span style="font-size: 18px; font-weight: bold; color: #b91c1c;">-</span>
              <span style="display: inline-flex; flex-direction: column; vertical-align: middle; text-align: center; font-weight: bold;">
                <span style="border-bottom: 2px solid #0f172a; padding: 0 6px;">١</span>
                <span>٢</span>
              </span>
              <span style="font-size: 18px; font-weight: bold;">=</span>
              <span style="display: inline-flex; flex-direction: column; vertical-align: middle; text-align: center; font-weight: bold;">
                <span style="border-bottom: 2px solid #0f172a; padding: 0 8px;">[ ..... ]</span>
                <span>٦</span>
              </span>
              <span style="font-size: 18px; font-weight: bold; color: #b91c1c;">-</span>
              <span style="display: inline-flex; flex-direction: column; vertical-align: middle; text-align: center; font-weight: bold;">
                <span style="border-bottom: 2px solid #0f172a; padding: 0 8px;">[ ..... ]</span>
                <span>٦</span>
              </span>
              <span style="font-size: 18px; font-weight: bold;">=</span>
              <span style="display: inline-flex; flex-direction: column; vertical-align: middle; text-align: center; font-weight: bold; color: #4338ca;">
                <span style="border-bottom: 2px solid #4338ca; padding: 0 10px;">[ ..... ]</span>
                <span>[ ..... ]</span>
              </span>
            </div>
          </div>
        </div>
      `;
    } else if (type === 'fractions_equivalent') {
      snippet = `
        <div class="question-block" style="margin-bottom: 26px; page-break-inside: avoid;">
          ${buildQuestionHeader(qLabel, 'أ) أكمل الفراغات لتصبح الكسور متكافئة، ب) بسّط الكسور لأبسط صورة', qMarks)}
          <div style="font-weight: bold; margin-bottom: 6px; color: #1e293b; font-size: 14px;">أ) أوجد العدد المفقود في كل مما يأتي لتكوين كسور متكافئة:</div>
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 14px;">
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px; border-radius: 6px; display: flex; align-items: center; justify-content: center; gap: 6px;">
              <span style="display: inline-flex; flex-direction: column; text-align: center; font-weight: bold;">
                <span style="border-bottom: 2px solid #000; padding: 0 4px;">٣</span>
                <span>٥</span>
              </span>
              <span>=</span>
              <span style="display: inline-flex; flex-direction: column; text-align: center; font-weight: bold;">
                <span style="border-bottom: 2px solid #000; padding: 0 4px;">[ ..... ]</span>
                <span>٢٠</span>
              </span>
            </div>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px; border-radius: 6px; display: flex; align-items: center; justify-content: center; gap: 6px;">
              <span style="display: inline-flex; flex-direction: column; text-align: center; font-weight: bold;">
                <span style="border-bottom: 2px solid #000; padding: 0 4px;">١٢</span>
                <span>١٨</span>
              </span>
              <span>=</span>
              <span style="display: inline-flex; flex-direction: column; text-align: center; font-weight: bold;">
                <span style="border-bottom: 2px solid #000; padding: 0 4px;">٢</span>
                <span>[ ..... ]</span>
              </span>
            </div>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px; border-radius: 6px; display: flex; align-items: center; justify-content: center; gap: 6px;">
              <span style="display: inline-flex; flex-direction: column; text-align: center; font-weight: bold;">
                <span style="border-bottom: 2px solid #000; padding: 0 4px;">٤</span>
                <span>٧</span>
              </span>
              <span>=</span>
              <span style="display: inline-flex; flex-direction: column; text-align: center; font-weight: bold;">
                <span style="border-bottom: 2px solid #000; padding: 0 4px;">١٦</span>
                <span>[ ..... ]</span>
              </span>
            </div>
          </div>

          <div style="font-weight: bold; margin-bottom: 6px; color: #1e293b; font-size: 14px;">ب) بسّط الكسور الآتية إلى أبسط صورة ممكنة:</div>
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px; border-radius: 6px; display: flex; align-items: center; gap: 8px;">
              <span>١) الكسر: ( ١٥ / ٢٥ ) = بأبسط صورة: </span>
              <span style="display: inline-flex; flex-direction: column; text-align: center; font-weight: bold; color: #4338ca;">
                <span style="border-bottom: 2px solid #4338ca; padding: 0 6px;">[ ..... ]</span>
                <span>[ ..... ]</span>
              </span>
            </div>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px; border-radius: 6px; display: flex; align-items: center; gap: 8px;">
              <span>٢) الكسر: ( ٢٤ / ٣٦ ) = بأبسط صورة: </span>
              <span style="display: inline-flex; flex-direction: column; text-align: center; font-weight: bold; color: #4338ca;">
                <span style="border-bottom: 2px solid #4338ca; padding: 0 6px;">[ ..... ]</span>
                <span>[ ..... ]</span>
              </span>
            </div>
          </div>
        </div>
      `;
    } else if (type === 'fractions_compare') {
      snippet = `
        <div class="question-block" style="margin-bottom: 26px; page-break-inside: avoid;">
          ${buildQuestionHeader(qLabel, 'قارن بين الكسور الآتية بوضع إشارة ( > ) أو ( < ) أو ( = ) في الفراغ', qMarks)}
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; font-size: 16px; margin: 10px 4px;">
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px; border-radius: 8px; display: flex; align-items: center; justify-content: center; gap: 12px;">
              <span style="display: inline-flex; flex-direction: column; text-align: center; font-weight: bold;">
                <span style="border-bottom: 2px solid #000; padding: 0 4px;">٤</span>
                <span>٩</span>
              </span>
              <span style="border: 2px dashed #4338ca; background: #fff; padding: 2px 12px; border-radius: 6px; font-weight: bold;">( &nbsp;&nbsp;&nbsp;&nbsp; )</span>
              <span style="display: inline-flex; flex-direction: column; text-align: center; font-weight: bold;">
                <span style="border-bottom: 2px solid #000; padding: 0 4px;">٧</span>
                <span>٩</span>
              </span>
            </div>

            <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px; border-radius: 8px; display: flex; align-items: center; justify-content: center; gap: 12px;">
              <span style="display: inline-flex; flex-direction: column; text-align: center; font-weight: bold;">
                <span style="border-bottom: 2px solid #000; padding: 0 4px;">١</span>
                <span>٢</span>
              </span>
              <span style="border: 2px dashed #4338ca; background: #fff; padding: 2px 12px; border-radius: 6px; font-weight: bold;">( &nbsp;&nbsp;&nbsp;&nbsp; )</span>
              <span style="display: inline-flex; flex-direction: column; text-align: center; font-weight: bold;">
                <span style="border-bottom: 2px solid #000; padding: 0 4px;">٣</span>
                <span>٦</span>
              </span>
            </div>

            <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px; border-radius: 8px; display: flex; align-items: center; justify-content: center; gap: 12px;">
              <span style="display: inline-flex; flex-direction: column; text-align: center; font-weight: bold;">
                <span style="border-bottom: 2px solid #000; padding: 0 4px;">٣</span>
                <span>٥</span>
              </span>
              <span style="border: 2px dashed #4338ca; background: #fff; padding: 2px 12px; border-radius: 6px; font-weight: bold;">( &nbsp;&nbsp;&nbsp;&nbsp; )</span>
              <span style="display: inline-flex; flex-direction: column; text-align: center; font-weight: bold;">
                <span style="border-bottom: 2px solid #000; padding: 0 4px;">٢</span>
                <span>٣</span>
              </span>
            </div>

            <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px; border-radius: 8px; display: flex; align-items: center; justify-content: center; gap: 12px;">
              <span style="display: inline-flex; flex-direction: column; text-align: center; font-weight: bold;">
                <span style="border-bottom: 2px solid #000; padding: 0 4px;">٧</span>
                <span>٨</span>
              </span>
              <span style="border: 2px dashed #4338ca; background: #fff; padding: 2px 12px; border-radius: 6px; font-weight: bold;">( &nbsp;&nbsp;&nbsp;&nbsp; )</span>
              <span style="display: inline-flex; flex-direction: column; text-align: center; font-weight: bold;">
                <span style="border-bottom: 2px solid #000; padding: 0 4px;">٥</span>
                <span>٦</span>
              </span>
            </div>
          </div>
        </div>
      `;
    } else if (type === 'fractions_multiply_divide') {
      snippet = `
        <div class="question-block" style="margin-bottom: 26px; page-break-inside: avoid;">
          ${buildQuestionHeader(qLabel, 'أوجد ناتج ضرب وقسمة الكسور الآتية موضحاً خطوات الاختصار', qMarks)}
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; font-size: 16px; margin: 12px 6px;">
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px; border-radius: 8px; display: flex; align-items: center; gap: 8px;">
              <span>١) </span>
              <span style="display: inline-flex; flex-direction: column; text-align: center; font-weight: bold;">
                <span style="border-bottom: 2px solid #000; padding: 0 4px;">٣</span>
                <span>٥</span>
              </span>
              <span style="font-size: 18px; font-weight: bold; color: #b91c1c;">×</span>
              <span style="display: inline-flex; flex-direction: column; text-align: center; font-weight: bold;">
                <span style="border-bottom: 2px solid #000; padding: 0 4px;">١٠</span>
                <span>٩</span>
              </span>
              <span style="font-size: 18px; font-weight: bold;">=</span>
              <span style="display: inline-flex; flex-direction: column; text-align: center; font-weight: bold; color: #4338ca;">
                <span style="border-bottom: 2px solid #4338ca; padding: 0 8px;">[ ..... ]</span>
                <span>[ ..... ]</span>
              </span>
            </div>

            <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px; border-radius: 8px; display: flex; align-items: center; gap: 8px;">
              <span>٢) </span>
              <span style="display: inline-flex; flex-direction: column; text-align: center; font-weight: bold;">
                <span style="border-bottom: 2px solid #000; padding: 0 4px;">٤</span>
                <span>٧</span>
              </span>
              <span style="font-size: 18px; font-weight: bold; color: #b91c1c;">÷</span>
              <span style="display: inline-flex; flex-direction: column; text-align: center; font-weight: bold;">
                <span style="border-bottom: 2px solid #000; padding: 0 4px;">٢</span>
                <span>٢١</span>
              </span>
              <span style="font-size: 18px; font-weight: bold;">=</span>
              <span style="display: inline-flex; flex-direction: column; text-align: center; font-weight: bold; color: #4338ca;">
                <span style="border-bottom: 2px solid #4338ca; padding: 0 8px;">[ ..... ]</span>
                <span>[ ..... ]</span>
              </span>
            </div>
          </div>
        </div>
      `;
    }

    // 5. MULTIPLICATION TEMPLATES
    else if (type === 'multiplication_vertical') {
      snippet = `
        <div class="question-block" style="margin-bottom: 26px; page-break-inside: avoid;">
          ${buildQuestionHeader(qLabel, 'أوجد ناتج الضرب العمودي موضحاً خطوات ضرب الآحاد والعشرات', qMarks)}
          <div style="display: flex; justify-content: space-around; flex-wrap: wrap; gap: 20px; margin: 14px 0;">
            <div style="border: 1px solid #94a3b8; border-radius: 8px; padding: 12px; background: #fafafa; min-width: 250px;">
              <div style="font-weight: bold; margin-bottom: 6px; color: #1e293b; font-size: 13px;">أ) احسب: ( ٣٤٥ × ٢٤ )</div>
              <table style="border-collapse: collapse; margin: 6px auto; font-size: 16px; text-align: center; min-width: 180px;" dir="rtl">
                <tr style="font-weight: bold; font-size: 18px;">
                  <td style="padding: 4px;"></td>
                  <td style="padding: 4px;">٣</td>
                  <td style="padding: 4px;">٤</td>
                  <td style="padding: 4px;">٥</td>
                </tr>
                <tr style="font-weight: bold; font-size: 18px;">
                  <td style="padding: 4px; color: #b91c1c;">×</td>
                  <td style="padding: 4px;"></td>
                  <td style="padding: 4px;">٢</td>
                  <td style="padding: 4px;">٤</td>
                </tr>
                <tr style="border-top: 2px solid #0f172a;">
                  <td colspan="4" style="padding: 4px; font-size: 13px; color: #64748b; text-align: right;">(ضرب الآحاد: ٤ × ٣٤٥) = ١ ٣ ٨ ٠</td>
                </tr>
                <tr>
                  <td colspan="4" style="padding: 4px; font-size: 13px; color: #64748b; text-align: right;">+ (ضرب العشرات: ٢٠ × ٣٤٥) = ٦ ٩ ٠ ٠</td>
                </tr>
                <tr style="border-top: 2px solid #0f172a; font-weight: bold; font-size: 17px; background: #eff6ff;">
                  <td colspan="4" style="padding: 6px; color: #1e40af;">الناتج النهائي = [ ٨ ٢ ٨ ٠ ]</td>
                </tr>
              </table>
            </div>

            <div style="border: 1px solid #94a3b8; border-radius: 8px; padding: 12px; background: #fafafa; min-width: 250px;">
              <div style="font-weight: bold; margin-bottom: 6px; color: #1e293b; font-size: 13px;">ب) احسب: ( ٥٦٢ × ١٨ )</div>
              <table style="border-collapse: collapse; margin: 6px auto; font-size: 16px; text-align: center; min-width: 180px;" dir="rtl">
                <tr style="font-weight: bold; font-size: 18px;">
                  <td style="padding: 4px;"></td>
                  <td style="padding: 4px;">٥</td>
                  <td style="padding: 4px;">٦</td>
                  <td style="padding: 4px;">٢</td>
                </tr>
                <tr style="font-weight: bold; font-size: 18px;">
                  <td style="padding: 4px; color: #b91c1c;">×</td>
                  <td style="padding: 4px;"></td>
                  <td style="padding: 4px;">١</td>
                  <td style="padding: 4px;">٨</td>
                </tr>
                <tr style="border-top: 2px solid #0f172a;">
                  <td colspan="4" style="padding: 4px; font-size: 13px; color: #94a3b8;">............................................................</td>
                </tr>
                <tr>
                  <td colspan="4" style="padding: 4px; font-size: 13px; color: #94a3b8;">+ ............................................................</td>
                </tr>
                <tr style="border-top: 2px solid #0f172a; font-weight: bold; font-size: 17px; background: #eff6ff;">
                  <td colspan="4" style="padding: 6px; color: #1e40af;">الناتج النهائي = [ .................... ]</td>
                </tr>
              </table>
            </div>
          </div>
        </div>
      `;
    } else if (type === 'multiplication_horizontal') {
      snippet = `
        <div class="question-block" style="margin-bottom: 24px; page-break-inside: avoid;">
          ${buildQuestionHeader(qLabel, 'احسب ناتج العمليات الآتية ذهنياً', qMarks)}
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; font-size: 15px; margin: 10px 4px;">
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 12px; border-radius: 6px;">
              ١) ٦٠ × ٨ = <strong>[ .......................... ]</strong>
            </div>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 12px; border-radius: 6px;">
              ٢) ٤٠ × ٥٠ = <strong>[ .......................... ]</strong>
            </div>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 12px; border-radius: 6px;">
              ٣) ٣٥ × ١٠٠ = <strong>[ .......................... ]</strong>
            </div>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 12px; border-radius: 6px;">
              ٤) ٩ × ٧ = <strong>[ .......................... ]</strong>
            </div>
          </div>
        </div>
      `;
    }

    // 6. WORD PROBLEMS TEMPLATES
    else if (type === 'math_word_problem') {
      snippet = `
        <div class="question-block" style="margin-bottom: 26px; page-break-inside: avoid;">
          ${buildQuestionHeader(qLabel, 'اقرأ المسألة الآتية جيداً ثم املأ جدول الحل بالخطوات الصحيحة والناتج', qMarks)}
          <div style="background: #f1f5f9; border-right: 4px solid #4338ca; padding: 10px 14px; margin-bottom: 12px; font-size: 15px; line-height: 1.8;">
            <strong>نص المسألة:</strong> اشترى تاجر ٢٥ حقيبة مدرسية بسعر ٦,٠٠٠ ل.س للحقيبة الواحدة، فإذا باعها جميعاً بربح إجمالي قدره ٥٠,٠٠٠ ل.س، فما ثمن بيع الحقيبة الواحدة؟
          </div>
          <table style="width: 100%; border-collapse: collapse; border: 1px solid #0f172a; font-size: 14px;" dir="rtl">
            <tr style="background: #f8fafc;">
              <th style="border: 1px solid #0f172a; padding: 8px; width: 25%; font-weight: bold;">عناصر الحل</th>
              <th style="border: 1px solid #0f172a; padding: 8px; width: 75%; font-weight: bold;">تفريغ خطوات التلميذ والحل الحسابي</th>
            </tr>
            <tr>
              <td style="border: 1px solid #0f172a; padding: 8px; font-weight: bold; background: #f8fafc;">١. المعطيات:</td>
              <td style="border: 1px solid #0f172a; padding: 8px; color: #64748b;">...........................................................................................................................</td>
            </tr>
            <tr>
              <td style="border: 1px solid #0f172a; padding: 8px; font-weight: bold; background: #f8fafc;">٢. المطلوب إيجاده:</td>
              <td style="border: 1px solid #0f172a; padding: 8px; color: #64748b;">...........................................................................................................................</td>
            </tr>
            <tr>
              <td style="border: 1px solid #0f172a; padding: 8px; font-weight: bold; background: #f8fafc;">٣. طريقة الحل والعمليات:</td>
              <td style="border: 1px solid #0f172a; padding: 8px; color: #64748b; line-height: 2;">
                العملية الأولى: ...........................................................................................................<br>
                العملية الثانية: ...........................................................................................................
              </td>
            </tr>
            <tr style="background: #eff6ff;">
              <td style="border: 1px solid #0f172a; padding: 8px; font-weight: bold; color: #1e40af;">٤. الناتج النهائي والواحدة:</td>
              <td style="border: 1px solid #0f172a; padding: 8px; font-weight: bold; color: #1e40af;">الناتج = [ .......................... ] ليرة سورية</td>
            </tr>
          </table>
        </div>
      `;
    }

    // 7. GEOMETRY & MEASUREMENT TEMPLATES
    else if (type === 'geometry_perimeter_area') {
      snippet = `
        <div class="question-block" style="margin-bottom: 26px; page-break-inside: avoid;">
          ${buildQuestionHeader(qLabel, 'مسألة هندسية في المحيط والمساحة', qMarks)}
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px 14px; border-radius: 8px; margin-bottom: 12px; font-size: 15px;">
            حديقة مستطيلة الشكل طولها <strong>( ١٢ متراً )</strong> وعرضها <strong>( ٨ أمتار )</strong>. احسب:
          </div>
          <div style="font-size: 15px; line-height: 2.2; margin-right: 10px;">
            <div>١) <strong>محيط الحديقة المستطيلة:</strong></div>
            <div style="margin-right: 20px;">
              القانون: [ ................................... ] = التعويض: [ ................................... ] = الناتج: <strong>[ .......... م ]</strong>
            </div>
            <div>٢) <strong>مساحة الحديقة المستطيلة:</strong></div>
            <div style="margin-right: 20px;">
              القانون: [ ................................... ] = التعويض: [ ................................... ] = الناتج: <strong>[ .......... م² ]</strong>
            </div>
            <div>٣) إذا كانت هناك بركة مربعة الشكل طول ضلعها <strong>( ٤ أمتار )</strong>، فما مساحتها؟</div>
            <div style="margin-right: 20px;">
              مساحة المربع = [ ................................... ] = الناتج: <strong>[ .......... م² ]</strong>
            </div>
          </div>
        </div>
      `;
    } else if (type === 'geometry_angles') {
      snippet = `
        <div class="question-block" style="margin-bottom: 24px; page-break-inside: avoid;">
          ${buildQuestionHeader(qLabel, 'حدد نوع كل زاوية من الزوايا الآتية (حادة - قائمة - منفرجة - مستقيمة)', qMarks)}
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; font-size: 15px; margin: 10px 4px;">
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 12px; border-radius: 6px;">
              ١) زاوية قياسها ٩٠° : نوعها <strong>[ ................................ ]</strong>
            </div>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 12px; border-radius: 6px;">
              ٢) زاوية قياسها ٤٥° : نوعها <strong>[ ................................ ]</strong>
            </div>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 12px; border-radius: 6px;">
              ٣) زاوية قياسها ١٣٥° : نوعها <strong>[ ................................ ]</strong>
            </div>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 12px; border-radius: 6px;">
              ٤) زاوية قياسها ١٨٠° : نوعها <strong>[ ................................ ]</strong>
            </div>
          </div>
        </div>
      `;
    } else if (type === 'geometry_units') {
      snippet = `
        <div class="question-block" style="margin-bottom: 24px; page-break-inside: avoid;">
          ${buildQuestionHeader(qLabel, 'حوّل إلى وحدة القياس المطلوبة في كل مما يأتي', qMarks)}
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; font-size: 15px; margin: 10px 4px;">
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 12px; border-radius: 6px;">
              ١) ٧ كم = <strong>[ .......................... ]</strong> متر
            </div>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 12px; border-radius: 6px;">
              ٢) ٥,٠٠٠ غرام = <strong>[ .......................... ]</strong> كغ
            </div>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 12px; border-radius: 6px;">
              ٣) ٤ لتر = <strong>[ .......................... ]</strong> مليلتر
            </div>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 12px; border-radius: 6px;">
              ٤) ساعتان ونصف = <strong>[ .......................... ]</strong> دقيقة
            </div>
          </div>
        </div>
      `;
    }

    // 8. MISSING NUMBERS & COMPARISON TEMPLATES
    else if (type === 'missing_number') {
      snippet = `
        <div class="question-block" style="margin-bottom: 24px; page-break-inside: avoid;">
          ${buildQuestionHeader(qLabel, 'اكتب العدد المناسب في الفراغ لتصبح الجملة العددية صحيحة', qMarks)}
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; font-size: 15px; margin: 10px 4px;">
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 12px; border-radius: 6px;">
              ١) <strong>[ .......... ]</strong> + ٤٥٠ = ١,٢٠٠
            </div>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 12px; border-radius: 6px;">
              ٢) ٨٥٠ - <strong>[ .......... ]</strong> = ٣٢٠
            </div>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 12px; border-radius: 6px;">
              ٣) <strong>[ .......... ]</strong> × ٨ = ٥٦
            </div>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 12px; border-radius: 6px;">
              ٤) ٧٢ ÷ <strong>[ .......... ]</strong> = ٩
            </div>
          </div>
        </div>
      `;
    } else if (type === 'compare_numbers') {
      snippet = `
        <div class="question-block" style="margin-bottom: 24px; page-break-inside: avoid;">
          ${buildQuestionHeader(qLabel, 'ضع إشارة ( > ) أو ( < ) أو ( = ) في الفراغ لتصبح المقارنة صحيحة', qMarks)}
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; font-size: 15px; margin: 10px 4px;">
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 12px; border-radius: 6px;">
              ١) ٧٥,٨٤٠ <strong>&nbsp;&nbsp;( &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; )&nbsp;&nbsp;</strong> ٧٥,٤٨٠
            </div>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 12px; border-radius: 6px;">
              ٢) ٣٠٠,٥٠٠ <strong>&nbsp;&nbsp;( &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; )&nbsp;&nbsp;</strong> ٣٠٥,٠٠٠
            </div>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 12px; border-radius: 6px;">
              ٣) ٩٩,٩٩٩ <strong>&nbsp;&nbsp;( &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; )&nbsp;&nbsp;</strong> ١٠٠,٠٠١
            </div>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 12px; border-radius: 6px;">
              ٤) ٤٥٠ ÷ ١٠ <strong>&nbsp;&nbsp;( &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; )&nbsp;&nbsp;</strong> ٤٥ × ١
            </div>
          </div>
        </div>
      `;
    } else if (type === 'ordering_numbers') {
      snippet = `
        <div class="question-block" style="margin-bottom: 24px; page-break-inside: avoid;">
          ${buildQuestionHeader(qLabel, 'رتّب الأعداد الآتية ترتيباً تصاعدياً من الأصغر إلى الأكبر', qMarks)}
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px 14px; border-radius: 8px; margin: 8px 0; font-size: 15px;">
            الأعداد: <strong>( ٦,٢٣٠ &nbsp;،&nbsp; ٦,٣٢٠ &nbsp;،&nbsp; ٢,٦٣٠ &nbsp;،&nbsp; ٣,٢٦٠ )</strong>
          </div>
          <div style="font-size: 15px; margin-top: 8px;">
            الترتيب التصاعدي: <strong>[ .......................................................................................................... ]</strong>
          </div>
        </div>
      `;
    }

    // 9. MATH MULTIPLE CHOICE
    else if (type === 'math_mcq') {
      snippet = `
        <div class="question-block" style="margin-bottom: 26px; page-break-inside: avoid;">
          ${buildQuestionHeader(qLabel, 'اختر الإجابة الصحيحة من بين الخيارات المعطاة لكل مما يأتي', qMarks)}
          <div style="font-size: 15px; line-height: 2; margin-right: 8px;">
            <p style="margin-bottom: 6px;">
              ١) ناتج العملية ( ٤٠ × ٣٠ ) هو:<br>
              &nbsp;&nbsp;&nbsp;&nbsp;[ أ) ٧٠ &nbsp;&nbsp;&nbsp;&nbsp; ب) ١٢٠ &nbsp;&nbsp;&nbsp;&nbsp; ج) ١٢٠٠ &nbsp;&nbsp;&nbsp;&nbsp; د) ٧٠٠ ]
            </p>
            <p style="margin-bottom: 6px;">
              ٢) الكسر المكافئ للكسر ( ٣ / ٤ ) هو:<br>
              &nbsp;&nbsp;&nbsp;&nbsp;[ أ) ٦ / ٨ &nbsp;&nbsp;&nbsp;&nbsp; ب) ٤ / ٥ &nbsp;&nbsp;&nbsp;&nbsp; ج) ٥ / ٨ &nbsp;&nbsp;&nbsp;&nbsp; د) ٩ / ١٦ ]
            </p>
            <p style="margin-bottom: 6px;">
              ٣) ناتج قسمة ( ٥٦ ÷ ٨ ) يساوي:<br>
              &nbsp;&nbsp;&nbsp;&nbsp;[ أ) ٦ &nbsp;&nbsp;&nbsp;&nbsp; ب) ٧ &nbsp;&nbsp;&nbsp;&nbsp; ج) ٨ &nbsp;&nbsp;&nbsp;&nbsp; د) ٩ ]
            </p>
            <p style="margin-bottom: 6px;">
              ٤) محيط مستطيل بعداه ٥ سم و ٣ سم يساوي:<br>
              &nbsp;&nbsp;&nbsp;&nbsp;[ أ) ٨ سم &nbsp;&nbsp;&nbsp;&nbsp; ب) ١٥ سم &nbsp;&nbsp;&nbsp;&nbsp; ج) ١٦ سم &nbsp;&nbsp;&nbsp;&nbsp; د) ٣٠ سم ]
            </p>
          </div>
        </div>
      `;
    }

    insertHtmlSnippet(snippet);
  };

  // ==========================================
  // GENERAL QUESTION TEMPLATES (NON-MATH)
  // ==========================================
  const insertGeneralQuestionSnippet = (type: string) => {
    const qLabel = getNextQuestionLabel();
    const qMarks = customQuestionMarks || '20 درجة';
    let snippet = '';

    if (type === 'multiple_choice') {
      snippet = `
        <div class="question-block" style="margin-bottom: 24px; page-break-inside: avoid;">
          ${buildQuestionHeader(qLabel, 'اختر الإجابة الصحيحة مما بين القوسين', qMarks)}
          <p style="font-size: 15px; margin-right: 14px; line-height: 2;">
            1. نص السؤال الأول هنا ............................................................................ [ خيار 1 / خيار 2 / خيار 3 / خيار 4 ]<br>
            2. نص السؤال الثاني هنا ............................................................................ [ خيار 1 / خيار 2 / خيار 3 / خيار 4 ]
          </p>
        </div>
      `;
    } else if (type === 'true_false') {
      snippet = `
        <div class="question-block" style="margin-bottom: 24px; page-break-inside: avoid;">
          ${buildQuestionHeader(qLabel, 'ضع إشارة ( ✓ ) أو ( ✗ ) أمام العبارات الآتية', qMarks)}
          <ol style="font-size: 15px; margin-right: 14px; line-height: 2.2;">
            <li>نص العبارة الأولى هنا .................................................................... ( &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; )</li>
            <li>نص العبارة الثانية هنا .................................................................... ( &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; )</li>
          </ol>
        </div>
      `;
    } else if (type === 'fill_blanks') {
      snippet = `
        <div class="question-block" style="margin-bottom: 24px; page-break-inside: avoid;">
          ${buildQuestionHeader(qLabel, 'أكمل الفراغات في الجمل الآتية بما يناسبها علمياً', qMarks)}
          <ol style="font-size: 15px; margin-right: 14px; line-height: 2.2;">
            <li>يعتبر ........................................... من أهم العوامل التي تؤدي إلى ........................................... .</li>
            <li>يقاس ........................................... بواسطة وحدة ........................................... .</li>
          </ol>
        </div>
      `;
    } else if (type === 'essay') {
      snippet = `
        <div class="question-block" style="margin-bottom: 24px; page-break-inside: avoid;">
          ${buildQuestionHeader(qLabel, 'أجب عما يأتي بالتفصيل مع التعليل', qMarks)}
          <p style="font-size: 15px; margin-right: 14px; line-height: 1.9;">
            اكتب نص السؤال المقالي أو الموضوع هنا بالتفصيل:<br>
            ...........................................................................................................................................................<br>
            ...........................................................................................................................................................
          </p>
        </div>
      `;
    } else if (type === 'matching') {
      snippet = `
        <div class="question-block" style="margin-bottom: 24px; page-break-inside: avoid;">
          ${buildQuestionHeader(qLabel, 'صِلْ بين عناصر القائمة (أ) وما يناسبها من القائمة (ب)', qMarks)}
          <table style="width: 100%; border-collapse: collapse; border: 1px solid #1e293b; font-size: 14px;" dir="rtl">
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

    insertHtmlSnippet(snippet);
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

  // Quick subject selector handler
  const handleQuickSelectSubject = (subj: string) => {
    setHeaderConfig(prev => ({ ...prev, subject: subj }));
    if (subj.includes('رياضيات') || subj.includes('حساب')) {
      setActiveTabType('math');
    }
  };

  return (
    <div className="bg-slate-100 min-h-screen text-slate-800 p-2 sm:p-4 md:p-6 flex flex-col items-center print:bg-white print:p-0" dir="rtl">
      {/* Print styles to hide delete buttons */}
      <style>{`
        @media print {
          .btn-delete-question, .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Top Application Bar */}
      <div className="w-full max-w-5xl bg-white border border-slate-200 rounded-2xl shadow-sm p-4 mb-3 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-800 text-white flex items-center justify-center font-black shadow-xs">
            <Calculator className="w-5 h-5" />
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
        <div className="flex items-center flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setShowHeaderSettings(!showHeaderSettings)}
            className={`px-3 py-2 border rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs ${
              showHeaderSettings ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
            }`}
            title="تعديل ترويسة الامتحان المدرسية والحقول المفتوحة"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>ترويسة الاختبار</span>
          </button>

          {/* CLEAR PAGE BUTTON WITH 2-STEP CONFIRMATION (RELIABLE ON ALL BROWSERS) */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleClearDocument}
              className={`px-3 py-2 border rounded-xl text-xs font-black transition flex items-center gap-1.5 cursor-pointer shadow-2xs ${
                confirmClearActive
                  ? 'bg-rose-600 hover:bg-rose-700 text-white border-rose-700 animate-pulse'
                  : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
              }`}
              title="تفريغ ورقة الأسئلة بالكامل للبدء من جديد"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{confirmClearActive ? 'تأكيد تفريغ الورقة الآن؟ ⚠️' : 'تفريغ الصفحة 🗑️'}</span>
            </button>
            {confirmClearActive && (
              <button
                type="button"
                onClick={() => setConfirmClearActive(false)}
                className="px-2 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
                title="إلغاء التفريغ"
              >
                إلغاء
              </button>
            )}
          </div>

          {/* UNDO BUTTON IF AVAILABLE */}
          {undoBufferHtml !== null && (
            <button
              type="button"
              onClick={handleRestoreUndo}
              className="px-2.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer shadow-2xs"
              title="تراجع عن الحذف أو التفريغ الأخير"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>تراجع ↩️</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleExportWord}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
            title="تصدير بصيغة Microsoft Word (.doc) مطابقة للأصل"
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>تصدير Word 📥</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
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
              <span>إرسال للمدير 🚀</span>
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
        <div className="w-full max-w-5xl mb-3 bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-2.5 rounded-xl text-xs font-black shadow-xs flex items-center justify-between gap-2 print:hidden animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{savedSuccessMessage}</span>
          </div>
          {undoBufferHtml !== null && (
            <button
              type="button"
              onClick={handleRestoreUndo}
              className="px-2.5 py-1 bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-lg text-[11px] font-bold transition cursor-pointer"
            >
              تراجع ↩️
            </button>
          )}
        </div>
      )}

      {/* Header Fields Drawer */}
      {showHeaderSettings && (
        <div className="w-full max-w-5xl bg-white border-2 border-indigo-200 rounded-2xl shadow-md p-4 mb-3 text-right print:hidden">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-indigo-600" />
              <h3 className="font-extrabold text-sm text-slate-800">
                إعدادات ترويسة الاختبار والحقول المفتوحة
              </h3>
            </div>
            <button
              type="button"
              onClick={handleAddCustomField}
              className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>+ إضافة حقل مخصص</span>
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
              <label className="block font-bold text-slate-600 mb-1">المادة الدراسية:</label>
              <select
                value={headerConfig.subject}
                onChange={(e) => handleQuickSelectSubject(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-2 py-1.5 text-xs font-bold focus:border-indigo-500 focus:outline-none bg-white"
              >
                {availableSubjects.map(sub => (
                  <option key={sub} value={sub}>{sub}</option>
                ))}
              </select>
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
              <label className="block font-bold text-slate-600 mb-1">العام الدراسي:</label>
              <input
                type="text"
                value={headerConfig.academicYear || ''}
                onChange={(e) => setHeaderConfig({ ...headerConfig, academicYear: e.target.value })}
                className="w-full border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-medium focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-600 mb-1">زمن الامتحان:</label>
              <input
                type="text"
                value={headerConfig.duration || ''}
                onChange={(e) => setHeaderConfig({ ...headerConfig, duration: e.target.value })}
                className="w-full border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-medium focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-600 mb-1">الدرجة الكلية:</label>
              <input
                type="text"
                value={headerConfig.totalMarks || ''}
                onChange={(e) => setHeaderConfig({ ...headerConfig, totalMarks: e.target.value })}
                className="w-full border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-medium focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-600 mb-1">اسم المعلم:</label>
              <input
                type="text"
                value={headerConfig.teacherName}
                onChange={(e) => setHeaderConfig({ ...headerConfig, teacherName: e.target.value })}
                className="w-full border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-medium focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2 md:col-span-4">
              <label className="block font-bold text-slate-600 mb-1">تعليمات للطلبة:</label>
              <input
                type="text"
                value={headerConfig.instructions || ''}
                onChange={(e) => setHeaderConfig({ ...headerConfig, instructions: e.target.value })}
                className="w-full border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-medium focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          {headerConfig.customFields && headerConfig.customFields.length > 0 && (
            <div className="mt-3 pt-2 border-t border-slate-100 flex flex-wrap gap-2">
              {headerConfig.customFields.map((field, idx) => (
                <div key={idx} className="bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-xl text-xs flex items-center gap-1.5">
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
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* QUICK SUBJECT BAR */}
      <div className="w-full max-w-5xl bg-white border border-slate-200 rounded-2xl shadow-xs p-2 mb-2 flex items-center justify-between flex-wrap gap-2 print:hidden">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-black text-slate-600 px-1">المادة الحالية:</span>
          {availableSubjects.map((sub) => {
            const isCurrent = headerConfig.subject === sub;
            return (
              <button
                key={sub}
                type="button"
                onClick={() => handleQuickSelectSubject(sub)}
                className={`px-2.5 py-1 rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-1 border ${
                  isCurrent 
                    ? sub.includes('رياضيات') || sub.includes('حساب')
                      ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                      : 'bg-indigo-600 text-white border-indigo-700 shadow-xs'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                {sub.includes('رياضيات') || sub.includes('حساب') ? '📐 ' : ''}
                {sub}
              </button>
            );
          })}
        </div>

        {/* OPEN QUESTION TITLE & MARKS & DELETE LAST QUESTION */}
        <div className="flex items-center flex-wrap gap-2 bg-gradient-to-l from-indigo-50/70 to-slate-50 border border-indigo-200 p-1.5 rounded-xl">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-black text-indigo-900">تحديد السؤال (مفتوح):</span>
            <div className="relative">
              <input
                type="text"
                value={openQuestionTitle}
                onChange={(e) => setOpenQuestionTitle(e.target.value)}
                placeholder={`تلقائي (${getNextAutoQuestionNumber()}) أو اكتب أي عنوان...`}
                className="w-44 sm:w-60 border border-indigo-300 bg-white text-indigo-950 font-bold px-2 py-1 text-xs rounded-lg focus:border-indigo-600 focus:outline-none"
              />
              {openQuestionTitle && (
                <button
                  type="button"
                  onClick={() => setOpenQuestionTitle('')}
                  className="absolute left-1.5 top-1.5 text-slate-400 hover:text-slate-600 text-xs px-1"
                  title="العودة للترقيم التلقائي"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Quick Preset Title Dropdown */}
          <select
            value=""
            onChange={(e) => {
              if (e.target.value === 'auto') {
                setOpenQuestionTitle('');
              } else if (e.target.value) {
                setOpenQuestionTitle(e.target.value);
              }
            }}
            className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold text-slate-700 focus:outline-none cursor-pointer"
            title="نماذج عناوين جاهزة للاختيار السريع"
          >
            <option value="">-- عناوين سريعة --</option>
            <option value="auto">🔄 تلقائي (حسب الترتيب الحالي)</option>
            {QUESTION_NUMBERS.map((q) => (
              <option key={q} value={q}>{q}</option>
            ))}
            <option value="المسألة الأولى">المسألة الأولى</option>
            <option value="المسألة الثانية">المسألة الثانية</option>
            <option value="التمرين الأول">التمرين الأول</option>
            <option value="التمرين الثاني">التمرين الثاني</option>
            <option value="سؤال للمتفوقين ⭐">سؤال للمتفوقين ⭐</option>
            <option value="أولاً: العمليات الحسابية">أولاً: العمليات الحسابية</option>
            <option value="ثانياً: الهندسة والقياس">ثانياً: الهندسة والقياس</option>
            <option value="ثالثاً: حل المسائل">ثالثاً: حل المسائل</option>
          </select>

          {/* Marks Input */}
          <div className="flex items-center gap-1">
            <span className="text-[11px] font-bold text-slate-700">الدرجة:</span>
            <input
              type="text"
              value={customQuestionMarks}
              onChange={(e) => setCustomQuestionMarks(e.target.value)}
              placeholder="مثال: 20 درجة"
              className="w-16 bg-white border border-slate-300 rounded-lg px-1.5 py-1 text-xs font-bold text-center text-indigo-700"
            />
          </div>

          {/* Delete Last Question Button */}
          <button
            type="button"
            onClick={handleDeleteLastQuestion}
            className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 shadow-2xs"
            title="حذف آخر سؤال تم إدراجه في الورقة"
          >
            <Trash2 className="w-3 h-3" />
            <span>حذف آخر سؤال ↩️</span>
          </button>
        </div>
      </div>

      {/* DEDICATED MATHEMATICS QUESTION TEMPLATES BAR */}
      <div className="w-full max-w-5xl bg-gradient-to-r from-amber-50 via-white to-amber-50/60 border-2 border-amber-300 rounded-2xl shadow-sm p-3 mb-3 print:hidden">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-2 pb-2 border-b border-amber-200">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-500 text-white flex items-center justify-center font-black shadow-xs">
              <Calculator className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-black text-xs sm:text-sm text-amber-950 flex items-center gap-1.5">
                <span>قوالب مادة الرياضيات والعمليات الحسابية الجاهزة للتعبئة</span>
                <span className="text-[10px] bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full font-bold">
                  انقر لإدراج السؤال في الورقة الفارغة مباشرة
                </span>
              </h3>
            </div>
          </div>

          {/* Toggle between Math Suite and General Templates */}
          <div className="flex items-center gap-1 bg-amber-100/70 p-0.5 rounded-xl border border-amber-300">
            <button
              type="button"
              onClick={() => setActiveTabType('math')}
              className={`px-3 py-1 rounded-lg text-xs font-black transition cursor-pointer ${
                activeTabType === 'math' ? 'bg-amber-600 text-white shadow-xs' : 'text-amber-900 hover:bg-amber-200/50'
              }`}
            >
              📐 قوالب الرياضيات المتكاملة
            </button>
            <button
              type="button"
              onClick={() => setActiveTabType('general')}
              className={`px-3 py-1 rounded-lg text-xs font-black transition cursor-pointer ${
                activeTabType === 'general' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-700 hover:bg-slate-200/50'
              }`}
            >
              📝 قوالب عامة (اختيارات، صح وخطأ..)
            </button>
          </div>
        </div>

        {/* MATH TEMPLATES - CLEAN DIRECT BUTTONS AS IN USER PHOTO */}
        {activeTabType === 'math' ? (
          <div className="space-y-2.5">
            {/* Top row: Approved note and inline fraction */}
            <div className="flex items-center justify-between text-xs text-amber-900 font-bold bg-amber-100/60 px-3 py-1.5 rounded-lg border border-amber-200">
              <span className="flex items-center gap-1.5">
                <span>📐</span>
                <span>قوالب الرياضيات المعتمدة (تدرج بحجم خط 12pt القياسي لاحتواء أكبر قدر من التمارين في الصفحة):</span>
              </span>
              <button
                type="button"
                onClick={() => insertMathSnippet('inline_fraction')}
                title="إدراج كسر فوري عند موضع مؤشر الفأرة الحالي"
                className="px-2.5 py-1 bg-amber-700 hover:bg-amber-800 text-white rounded-lg text-xs font-black transition cursor-pointer flex items-center gap-1 shadow-2xs"
              >
                <span>⚡ إدراج كسر في السطر (⚏)</span>
              </button>
            </div>

            {/* Template Count Control: Teachers requested multiple examples like 5 or more */}
            <div className="flex items-center justify-between flex-wrap gap-2 bg-white border border-amber-300 px-3 py-2 rounded-xl shadow-2xs">
              <div className="flex items-center gap-1.5 text-xs font-black text-amber-950">
                <span className="w-5 h-5 bg-amber-600 text-white rounded-md flex items-center justify-center text-[10px]">🔢</span>
                <span>تحديد عدد التمارين / الأمثلة المطلوب إدراجها لكل سؤال:</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {[1, 2, 3, 4, 5, 6, 8, 10].map(cnt => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() => setInsertCount(cnt)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-black transition cursor-pointer border ${
                      insertCount === cnt
                        ? 'bg-amber-700 text-white border-amber-800 shadow-2xs scale-105'
                        : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-200'
                    }`}
                  >
                    {cnt === 5 ? '5 أمثلة ⭐ (موصى به)' : `${cnt}`}
                  </button>
                ))}
                <div className="flex items-center gap-1 border-r border-amber-300 pr-2 mr-1">
                  <span className="text-[11px] font-bold text-slate-600">أو عدد آخر:</span>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={insertCount}
                    onChange={(e) => setInsertCount(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                    className="w-12 bg-white border border-amber-400 rounded-lg text-center font-black text-xs text-amber-950 py-0.5 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    title="اكتب أي عدد من التمارين تريده (مثلاً 5 أو 7 أو 10)"
                  />
                  <span className="text-[11px] text-amber-900 font-bold">مسألة</span>
                </div>
              </div>
            </div>

            {/* Direct template action buttons matching photo */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-0.5">
              {/* 1. إدراج معادلة */}
              <button
                type="button"
                onClick={() => insertMathSnippet('equation_fraction')}
                className="px-3 py-2.5 bg-white hover:bg-amber-50 text-amber-950 border-2 border-amber-400 hover:border-amber-500 rounded-xl text-xs font-black transition cursor-pointer flex flex-col items-center gap-1.5 shadow-2xs group text-center"
              >
                <div className="flex items-center gap-1 text-amber-800 font-black">
                  <span>📐</span>
                  <span>إدراج معادلة مثل هذه ({insertCount} معادلات)</span>
                </div>
                <div className="text-[11px] font-bold text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-200 flex items-center gap-1">
                  <span>[ ▢ / ▢ ] = ....</span>
                </div>
              </button>

              {/* 2. إدراج جمع أفقي */}
              <button
                type="button"
                onClick={() => insertMathSnippet('addition_horizontal')}
                className="px-3 py-2.5 bg-white hover:bg-emerald-50 text-emerald-950 border-2 border-emerald-400 hover:border-emerald-500 rounded-xl text-xs font-black transition cursor-pointer flex flex-col items-center gap-1.5 shadow-2xs text-center"
              >
                <div className="flex items-center gap-1 text-emerald-800 font-black">
                  <span>➕</span>
                  <span>إدراج جمع أفقي ({insertCount} مسائل)</span>
                </div>
                <div className="text-[11px] font-bold text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-200" dir="rtl">
                  <span>٧ + ٨ = ......</span>
                </div>
              </button>

              {/* 3. إدراج جمع عمودي */}
              <button
                type="button"
                onClick={() => insertMathSnippet('addition_vertical')}
                className="px-3 py-2.5 bg-white hover:bg-emerald-50 text-emerald-950 border-2 border-emerald-400 hover:border-emerald-500 rounded-xl text-xs font-black transition cursor-pointer flex flex-col items-center gap-1.5 shadow-2xs text-center"
              >
                <div className="flex items-center gap-1 text-emerald-800 font-black">
                  <span>➕</span>
                  <span>إدراج جمع عمودي ({insertCount} مسائل)</span>
                </div>
                <div className="text-[11px] font-bold text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-200 flex items-center gap-1">
                  <span>٨ وتحتها ٧ مع +</span>
                </div>
              </button>

              {/* 4. إدراج طرح أفقي */}
              <button
                type="button"
                onClick={() => insertMathSnippet('subtraction_horizontal')}
                className="px-3 py-2.5 bg-white hover:bg-rose-50 text-rose-950 border-2 border-rose-400 hover:border-rose-500 rounded-xl text-xs font-black transition cursor-pointer flex flex-col items-center gap-1.5 shadow-2xs text-center"
              >
                <div className="flex items-center gap-1 text-rose-800 font-black">
                  <span>➖</span>
                  <span>إدراج طرح أفقي ({insertCount} مسائل)</span>
                </div>
                <div className="text-[11px] font-bold text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-200" dir="rtl">
                  <span>٨ - ٧ = ......</span>
                </div>
              </button>

              {/* 5. إدراج طرح عمودي */}
              <button
                type="button"
                onClick={() => insertMathSnippet('subtraction_vertical')}
                className="px-3 py-2.5 bg-white hover:bg-rose-50 text-rose-950 border-2 border-rose-400 hover:border-rose-500 rounded-xl text-xs font-black transition cursor-pointer flex flex-col items-center gap-1.5 shadow-2xs text-center"
              >
                <div className="flex items-center gap-1 text-rose-800 font-black">
                  <span>➖</span>
                  <span>إدراج طرح عمودي ({insertCount} مسائل)</span>
                </div>
                <div className="text-[11px] font-bold text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-200 flex items-center gap-1">
                  <span>٨ وتحتها ٧ مع -</span>
                </div>
              </button>

              {/* 6. إدراج قسمة أفقي */}
              <button
                type="button"
                onClick={() => insertMathSnippet('division_horizontal')}
                className="px-3 py-2.5 bg-white hover:bg-sky-50 text-sky-950 border-2 border-sky-400 hover:border-sky-500 rounded-xl text-xs font-black transition cursor-pointer flex flex-col items-center gap-1.5 shadow-2xs text-center"
              >
                <div className="flex items-center gap-1 text-sky-800 font-black">
                  <span>➗</span>
                  <span>إدراج قسمة أفقي ({insertCount} مسائل)</span>
                </div>
                <div className="text-[11px] font-bold text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-200" dir="rtl">
                  <span>٧ ÷ ٨ = ......</span>
                </div>
              </button>

              {/* 7. إدراج قسمة مطولة كرسي */}
              <button
                type="button"
                onClick={() => insertMathSnippet('division_long')}
                className="px-3 py-2.5 bg-white hover:bg-sky-50 text-sky-950 border-2 border-sky-400 hover:border-sky-500 rounded-xl text-xs font-black transition cursor-pointer flex flex-col items-center gap-1.5 shadow-2xs text-center"
              >
                <div className="flex items-center gap-1 text-sky-800 font-black">
                  <span>➗</span>
                  <span>إدراج قسمة مثل هذه ({insertCount} مسائل)</span>
                </div>
                <div className="text-[11px] font-bold text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                  <span>كرسي القسمة والخطوات ⟌</span>
                </div>
              </button>

              {/* 8. إدراج كسور */}
              <button
                type="button"
                onClick={() => insertMathSnippet('fractions_operation')}
                className="px-3 py-2.5 bg-white hover:bg-purple-50 text-purple-950 border-2 border-purple-400 hover:border-purple-500 rounded-xl text-xs font-black transition cursor-pointer flex flex-col items-center gap-1.5 shadow-2xs text-center"
              >
                <div className="flex items-center gap-1 text-purple-800 font-black">
                  <span>🥧</span>
                  <span>إدراج كسور مثل هذه ({insertCount} مسائل)</span>
                </div>
                <div className="text-[11px] font-bold text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                  <span>جمع وطرح الكسور العادية</span>
                </div>
              </button>
            </div>
          </div>
        ) : (
          /* GENERAL QUESTION TEMPLATES */
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={() => insertGeneralQuestionSnippet('multiple_choice')}
              className="px-3 py-1.5 bg-white hover:bg-indigo-50 text-indigo-950 border border-indigo-200 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              سؤال اختيارات من متعدد
            </button>
            <button
              type="button"
              onClick={() => insertGeneralQuestionSnippet('true_false')}
              className="px-3 py-1.5 bg-white hover:bg-indigo-50 text-indigo-950 border border-indigo-200 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              صح وخطأ ( ✓ / ✗ )
            </button>
            <button
              type="button"
              onClick={() => insertGeneralQuestionSnippet('fill_blanks')}
              className="px-3 py-1.5 bg-white hover:bg-indigo-50 text-indigo-950 border border-indigo-200 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              أكمل الفراغات
            </button>
            <button
              type="button"
              onClick={() => insertGeneralQuestionSnippet('matching')}
              className="px-3 py-1.5 bg-white hover:bg-indigo-50 text-indigo-950 border border-indigo-200 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              توصيل / مطابقة قائمتين (أ) و (ب)
            </button>
            <button
              type="button"
              onClick={() => insertGeneralQuestionSnippet('essay')}
              className="px-3 py-1.5 bg-white hover:bg-indigo-50 text-indigo-950 border border-indigo-200 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              سؤال مقالي / شرح
            </button>
          </div>
        )}
      </div>

      {/* WORD PROCESSOR TOOLBAR */}
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
            <option value="10pt">10 pt</option>
            <option value="11pt">11 pt</option>
            <option value="12pt">12 pt (افتراضي للاختبار)</option>
            <option value="14pt">14 pt</option>
            <option value="16pt">16 pt</option>
            <option value="18pt">18 pt</option>
            <option value="20pt">20 pt</option>
            <option value="24pt">24 pt (عريض)</option>
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
          <label className="flex items-center gap-1 p-1 hover:bg-slate-100 rounded-lg cursor-pointer" title="لون تمييز النص">
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
            <span>صورة 🖼️</span>
          </button>

          <button
            type="button"
            onClick={() => setShowTableModal(true)}
            className="px-2 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg font-bold transition flex items-center gap-1 cursor-pointer"
            title="إدراج جدول منسق للأسئلة"
          >
            <TableIcon className="w-3.5 h-3.5" />
            <span>جدول ▦</span>
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

        {/* EMPTY STATE HELPER GUIDE (Shown only when editor is completely blank) */}
        {isDocEmpty && (
          <div className="my-8 p-6 border-2 border-dashed border-amber-300 rounded-2xl bg-amber-50/50 text-center space-y-4 print:hidden animate-fade-in">
            <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-2xl mx-auto flex items-center justify-center font-black">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-black text-slate-900 text-base">ورقة الأسئلة فارغة وجاهزة للبدء</h3>
              <p className="text-xs text-slate-600 mt-1 max-w-lg mx-auto">
                اختر القالب المطلوب لإدراج السؤال الأول مع {insertCount} أمثلة/تمارين فوراً بحجم خط 12pt القياسي:
              </p>
              <div className="flex items-center justify-center gap-1.5 mt-2">
                <span className="text-[11px] font-bold text-slate-600">عدد التمارين لكل سؤال:</span>
                {[3, 4, 5, 6, 8].map(cnt => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() => setInsertCount(cnt)}
                    className={`px-2 py-0.5 rounded-lg text-xs font-black transition cursor-pointer border ${
                      insertCount === cnt
                        ? 'bg-amber-700 text-white border-amber-800'
                        : 'bg-white hover:bg-amber-100 text-amber-900 border-amber-300'
                    }`}
                  >
                    {cnt === 5 ? '5 أمثلة ⭐' : cnt}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-center flex-wrap gap-2 pt-2">
              <button
                type="button"
                onClick={() => insertMathSnippet('equation_fraction')}
                className="px-3.5 py-2 bg-white hover:bg-amber-100 text-amber-900 border-2 border-amber-400 rounded-xl text-xs font-black transition cursor-pointer shadow-2xs"
              >
                📐 إدراج معادلة ({insertCount} معادلات)
              </button>
              <button
                type="button"
                onClick={() => insertMathSnippet('addition_horizontal')}
                className="px-3.5 py-2 bg-white hover:bg-emerald-100 text-emerald-900 border-2 border-emerald-400 rounded-xl text-xs font-black transition cursor-pointer shadow-2xs"
              >
                ➕ إدراج جمع أفقي ({insertCount} مسائل)
              </button>
              <button
                type="button"
                onClick={() => insertMathSnippet('addition_vertical')}
                className="px-3.5 py-2 bg-white hover:bg-emerald-100 text-emerald-900 border-2 border-emerald-400 rounded-xl text-xs font-black transition cursor-pointer shadow-2xs"
              >
                ➕ إدراج جمع عمودي ({insertCount} مسائل)
              </button>
              <button
                type="button"
                onClick={() => insertMathSnippet('subtraction_horizontal')}
                className="px-3.5 py-2 bg-white hover:bg-rose-100 text-rose-900 border-2 border-rose-400 rounded-xl text-xs font-black transition cursor-pointer shadow-2xs"
              >
                ➖ إدراج طرح أفقي ({insertCount} مسائل)
              </button>
              <button
                type="button"
                onClick={() => insertMathSnippet('subtraction_vertical')}
                className="px-3.5 py-2 bg-white hover:bg-rose-100 text-rose-900 border-2 border-rose-400 rounded-xl text-xs font-black transition cursor-pointer shadow-2xs"
              >
                ➖ إدراج طرح عمودي ({insertCount} مسائل)
              </button>
              <button
                type="button"
                onClick={() => insertMathSnippet('division_horizontal')}
                className="px-3.5 py-2 bg-white hover:bg-sky-100 text-sky-900 border-2 border-sky-400 rounded-xl text-xs font-black transition cursor-pointer shadow-2xs"
              >
                ➗ إدراج قسمة أفقي ({insertCount} مسائل)
              </button>
              <button
                type="button"
                onClick={() => insertMathSnippet('division_long')}
                className="px-3.5 py-2 bg-white hover:bg-sky-100 text-sky-900 border-2 border-sky-400 rounded-xl text-xs font-black transition cursor-pointer shadow-2xs"
              >
                ➗ إدراج قسمة مطولة (كرسي ⟌ - {insertCount} مسائل)
              </button>
              <button
                type="button"
                onClick={() => insertMathSnippet('fractions_operation')}
                className="px-3.5 py-2 bg-white hover:bg-purple-100 text-purple-900 border-2 border-purple-400 rounded-xl text-xs font-black transition cursor-pointer shadow-2xs"
              >
                🥧 إدراج كسور ({insertCount} مسائل)
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              أو انقر بالماوس في الورقة أدناه واكتب الأسئلة بحرية تامة بصيغة الوورد.
            </p>
          </div>
        )}

        {/* ContentEditable Sheet Body */}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onClick={handleEditorClick}
          onInput={checkDocEmpty}
          className="min-h-[600px] outline-none text-slate-900 leading-relaxed text-base focus:ring-1 focus:ring-indigo-100 p-2 rounded-lg transition"
          style={{
            lineHeight: 1.8,
            fontFamily: activeFont,
            fontSize: activeFontSize
          }}
          placeholder="انقر هنا لبدء كتابة الأسئلة أو اختر القوالب من الأعلى..."
        />

        {/* Bottom Exam Conclusion */}
        <div className="mt-12 pt-4 border-t-2 border-slate-800 text-center text-xs font-bold text-slate-600 flex items-center justify-between">
          <span>المدرسة الدولية الخاصة - نموذج معتمد</span>
          <span className="font-black text-slate-900">✨ انتهت الأسئلة - مع تمنياتنا لجميع الطلبة بالنجاح والتفوق ✨</span>
          <span>توقيع المعلم: ........................</span>
        </div>
      </div>

      {/* Director Notes Panel */}
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
