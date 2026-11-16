/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  X, 
  FileDown, 
  Printer, 
  Share2, 
  Copy, 
  Check, 
  ExternalLink, 
  Sliders, 
  Type, 
  Maximize2, 
  Eye, 
  Settings2, 
  Sparkles, 
  Layers, 
  LayoutTemplate, 
  RotateCcw,
  BookOpen,
  CheckCircle,
  HelpCircle,
  AlignJustify
} from 'lucide-react';
import { ExamQuestionPaper } from '../types';
import { 
  WordExportSettings, 
  DEFAULT_WORD_EXPORT_SETTINGS, 
  WORD_FONTS_LIST, 
  LINE_SPACING_OPTIONS, 
  QUESTION_SPACING_OPTIONS, 
  PAGE_MARGINS_OPTIONS, 
  COLOR_THEMES,
  buildWordDocumentHtml,
  exportExamPaperToWord, 
  copyExamPaperToClipboard, 
  generateWhatsAppShareUrl, 
  printExamPaperDirectly 
} from '../lib/wordExport';

interface ExamExportModalProps {
  paper: ExamQuestionPaper;
  isOpen: boolean;
  onClose: () => void;
  initialQuestionSpacing?: number;
  initialHideExampleBorders?: boolean;
}

export const ExamExportModal: React.FC<ExamExportModalProps> = ({
  paper,
  isOpen,
  onClose,
  initialQuestionSpacing,
  initialHideExampleBorders
}) => {
  // Settings state
  const [settings, setSettings] = useState<WordExportSettings>({
    ...DEFAULT_WORD_EXPORT_SETTINGS,
    questionSpacing: initialQuestionSpacing !== undefined ? initialQuestionSpacing : (DEFAULT_WORD_EXPORT_SETTINGS.questionSpacing || 4),
    hideExampleBorders: initialHideExampleBorders !== undefined ? initialHideExampleBorders : (DEFAULT_WORD_EXPORT_SETTINGS.hideExampleBorders ?? true),
    showHeader: paper.showHeader !== undefined ? paper.showHeader : DEFAULT_WORD_EXPORT_SETTINGS.showHeader,
    showFooter: paper.showFooter !== undefined ? paper.showFooter : DEFAULT_WORD_EXPORT_SETTINGS.showFooter
  });

  const [activeTab, setActiveTab] = useState<'settings' | 'preview'>('settings');
  const [downloading, setDownloading] = useState<boolean>(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [previewZoom, setPreviewZoom] = useState<number>(100);

  // Generate preview HTML dynamically based on current settings
  const { html: renderedHtml, fullFileName } = useMemo(() => {
    return buildWordDocumentHtml(paper, undefined, settings);
  }, [paper, settings]);

  if (!isOpen) return null;

  // Apply Quick Preset
  const handleApplyPreset = (presetName: 'compact' | 'standard' | 'large' | 'worksheet') => {
    if (presetName === 'compact') {
      setSettings(prev => ({
        ...prev,
        fontSize: '11pt',
        headerFontSize: '13pt',
        lineSpacing: 1.15,
        questionSpacing: 4,
        pageMargin: 'compact',
        answerLinesCount: 0,
        headerBorderWidth: 1.5
      }));
    } else if (presetName === 'standard') {
      setSettings(prev => ({
        ...prev,
        fontFamily: 'Traditional Arabic',
        fontSize: '12pt',
        headerFontSize: '14pt',
        lineSpacing: 1.6,
        questionSpacing: 16,
        pageMargin: 'normal',
        answerLinesCount: 0,
        headerBorderWidth: 2
      }));
    } else if (presetName === 'large') {
      setSettings(prev => ({
        ...prev,
        fontFamily: 'Amiri',
        fontSize: '14pt',
        headerFontSize: '16pt',
        lineSpacing: 1.8,
        questionSpacing: 22,
        pageMargin: 'normal',
        answerLinesCount: 2,
        headerBorderWidth: 2
      }));
    } else if (presetName === 'worksheet') {
      setSettings(prev => ({
        ...prev,
        fontFamily: 'Cairo',
        fontSize: '13pt',
        headerFontSize: '15pt',
        lineSpacing: 1.5,
        questionSpacing: 22,
        pageMargin: 'normal',
        showHeader: false,
        answerLinesCount: 3,
        headerBorderWidth: 2
      }));
    }
  };

  const handleDownloadDoc = async (formatOverride?: 'doc' | 'docx') => {
    setDownloading(true);
    const targetFormat = formatOverride || settings.format;
    try {
      const res = await exportExamPaperToWord(paper, undefined, { ...settings, format: targetFormat });
      if (res.url) {
        setDownloadUrl(res.url);
      }
    } finally {
      setTimeout(() => setDownloading(false), 900);
    }
  };

  const handleCopyClipboard = async () => {
    const success = await copyExamPaperToClipboard(paper, settings);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  const handlePrintPdf = () => {
    printExamPaperDirectly(paper, settings);
  };

  const handleWhatsApp = () => {
    const url = generateWhatsAppShareUrl(paper);
    window.open(url, '_blank');
  };

  // Open in external Chrome browser (helps bypass AppsGeyser in-app restrictions)
  const handleOpenInChrome = () => {
    const currentUrl = window.location.href;
    const chromeIntent = `intent://${window.location.host}${window.location.pathname}${window.location.search}#Intent;scheme=https;package=com.android.chrome;end`;
    try {
      window.location.href = chromeIntent;
    } catch {
      window.open(currentUrl, '_blank');
    }
  };

  return (
    <div className="fixed inset-0 z-[999999] flex items-center justify-center p-2 sm:p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-200" dir="rtl">
      <div 
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden flex flex-col max-h-[95vh] animate-in zoom-in-95 duration-200 text-right"
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Top Header */}
        <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-indigo-900 text-white p-4 sm:p-5 flex items-center justify-between relative shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center text-white shadow-inner">
              <Sliders className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-black text-base sm:text-lg flex items-center gap-2">
                <span>تخصيص وتصدير ورقة الأسئلة إلى Word</span>
                <span className="text-[10px] bg-amber-400 text-slate-950 font-black px-2 py-0.5 rounded-full">تحكم كامل ⭐</span>
              </h3>
              <p className="text-xs text-blue-100 font-medium">تحكم بحجم الخطوط، التباعد بين السطور والأسئلة، الهوامش، وقوالب Word المعتمدة</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Tab switch between Settings & Live Preview */}
            <div className="bg-white/10 p-1 rounded-xl flex items-center gap-1">
              <button
                type="button"
                onClick={() => setActiveTab('settings')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition flex items-center gap-1 cursor-pointer ${
                  activeTab === 'settings' ? 'bg-white text-indigo-900 shadow-xs' : 'text-white hover:bg-white/10'
                }`}
              >
                <Settings2 className="w-3.5 h-3.5" />
                <span>إعدادات التنسيق</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition flex items-center gap-1 cursor-pointer ${
                  activeTab === 'preview' ? 'bg-white text-indigo-900 shadow-xs' : 'text-white hover:bg-white/10'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>المعاينة الحية 📄</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
              title="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Paper details ribbon */}
        <div className="bg-slate-50 border-b border-slate-200 px-5 py-2.5 flex items-center justify-between gap-3 text-xs flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-black text-slate-900">{paper.title}</span>
            <span className="text-slate-300">•</span>
            <span className="text-indigo-700 font-bold bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">{paper.subject}</span>
            <span className="text-slate-300">•</span>
            <span className="text-slate-700">{paper.className}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500 font-medium">الخط الحالي:</span>
            <span className="text-[11px] font-bold text-slate-800 bg-white border border-slate-200 px-2 py-0.5 rounded-md">
              {settings.fontFamily} ({settings.fontSize})
            </span>
            <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md">
              تباعد {settings.lineSpacing}
            </span>
          </div>
        </div>

        {/* Modal Main Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {activeTab === 'settings' ? (
            <div className="space-y-5">
              {/* 1. Quick Presets Bar */}
              <div className="bg-gradient-to-r from-amber-50/70 via-indigo-50/40 to-slate-50 border border-indigo-100 rounded-2xl p-3.5">
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <span className="text-xs font-black text-indigo-950 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <span>نماذج وقوالب تنسيق جاهزة بنقرة واحدة:</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setSettings(DEFAULT_WORD_EXPORT_SETTINGS)}
                    className="text-[11px] text-slate-500 hover:text-slate-800 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>استعادة الضبط القياسي</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => handleApplyPreset('compact')}
                    className="p-2.5 bg-white hover:bg-amber-50 border border-slate-200 hover:border-amber-400 rounded-xl text-right transition cursor-pointer shadow-2xs group"
                  >
                    <div className="font-black text-xs text-slate-900 group-hover:text-amber-800">⚡ مضغوط (توفير ورق)</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">خط 11pt • تباعد 1.15 • هوامش 1سم</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleApplyPreset('standard')}
                    className="p-2.5 bg-white hover:bg-indigo-50 border-2 border-indigo-200 hover:border-indigo-400 rounded-xl text-right transition cursor-pointer shadow-2xs group"
                  >
                    <div className="font-black text-xs text-indigo-900 flex items-center justify-between">
                      <span>📄 امتحاني قياسي ⭐</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">خط 12pt • تباعد 1.6 • هوامش 1.5سم</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleApplyPreset('large')}
                    className="p-2.5 bg-white hover:bg-emerald-50 border border-slate-200 hover:border-emerald-400 rounded-xl text-right transition cursor-pointer shadow-2xs group"
                  >
                    <div className="font-black text-xs text-slate-900 group-hover:text-emerald-800">🌟 خط كبير ومريح</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">خط 14pt • تباعد 1.8 • أسطر إجابة</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleApplyPreset('worksheet')}
                    className="p-2.5 bg-white hover:bg-purple-50 border border-slate-200 hover:border-purple-400 rounded-xl text-right transition cursor-pointer shadow-2xs group"
                  >
                    <div className="font-black text-xs text-slate-900 group-hover:text-purple-800">📝 ورقة تدريب ومذاكرة</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">خط 13pt • بدون ترويسة • 3 أسطر حل</div>
                  </button>
                </div>
              </div>

              {/* 2. Grid of Detailed Settings Controls */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Right Column: Typography & Fonts */}
                <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3.5 shadow-2xs">
                  <div className="flex items-center gap-2 border-b border-slate-100 pb-2 text-indigo-900 font-extrabold text-xs sm:text-sm">
                    <Type className="w-4 h-4 text-indigo-600" />
                    <span>نوع الخط العربي وحجمه (Typography)</span>
                  </div>

                  {/* Font Family */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      نوع الخط العربي المعتمد في Word:
                    </label>
                    <select
                      value={settings.fontFamily}
                      onChange={(e) => setSettings({ ...settings, fontFamily: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      {WORD_FONTS_LIST.map((f) => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Question Body Font Size */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-slate-700">
                        حجم خط نص الأسئلة والتمارين:
                      </label>
                      <span className="text-xs font-black text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                        {settings.fontSize}
                      </span>
                    </div>
                    <div className="grid grid-cols-6 gap-1.5">
                      {['10pt', '11pt', '12pt', '13pt', '14pt', '16pt'].map((sz) => (
                        <button
                          key={sz}
                          type="button"
                          onClick={() => setSettings({ ...settings, fontSize: sz })}
                          className={`py-1.5 rounded-lg text-xs font-black transition cursor-pointer border ${
                            settings.fontSize === sz
                              ? 'bg-indigo-600 text-white border-indigo-700 shadow-2xs'
                              : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                        >
                          {sz}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Header & Title Font Size */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-slate-700">
                        حجم عناوين الأسئلة (السؤال الأول / المسألة):
                      </label>
                      <span className="text-xs font-black text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                        {settings.headerFontSize}
                      </span>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5">
                      {['12pt', '13pt', '14pt', '16pt', '18pt'].map((sz) => (
                        <button
                          key={sz}
                          type="button"
                          onClick={() => setSettings({ ...settings, headerFontSize: sz })}
                          className={`py-1.5 rounded-lg text-xs font-black transition cursor-pointer border ${
                            settings.headerFontSize === sz
                              ? 'bg-indigo-600 text-white border-indigo-700 shadow-2xs'
                              : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                        >
                          {sz}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Accent Color for Headers and Lines */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      لون خطوط وعناوين الأسئلة:
                    </label>
                    <div className="flex items-center gap-2 flex-wrap">
                      {COLOR_THEMES.map((theme) => (
                        <button
                          key={theme.id}
                          type="button"
                          onClick={() => setSettings({ ...settings, headerColor: theme.hex })}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-bold transition cursor-pointer ${
                            settings.headerColor === theme.hex
                              ? 'border-slate-800 bg-slate-100 ring-2 ring-indigo-500 font-black'
                              : 'border-slate-200 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <span className="w-3.5 h-3.5 rounded-full shrink-0 shadow-2xs" style={{ backgroundColor: theme.hex }}></span>
                          <span>{theme.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Left Column: Spacing, Margins & Answers */}
                <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3.5 shadow-2xs">
                  <div className="flex items-center gap-2 border-b border-slate-100 pb-2 text-indigo-900 font-extrabold text-xs sm:text-sm">
                    <AlignJustify className="w-4 h-4 text-indigo-600" />
                    <span>المسافات وتباعد السطور والأسئلة (Spacing)</span>
                  </div>

                  {/* Line Spacing */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      تباعد الأسطر (المسافة بين السطور):
                    </label>
                    <select
                      value={settings.lineSpacing}
                      onChange={(e) => setSettings({ ...settings, lineSpacing: parseFloat(e.target.value) })}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      {LINE_SPACING_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Distance between questions - Complete Control with Quick Buttons & Slider */}
                  <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-2.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-black text-slate-800 flex items-center gap-1">
                        <span>المسافة والفاصل بين كل سؤال والآخر:</span>
                      </label>
                      <span className="text-xs font-black text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md">
                        {settings.questionSpacing} pt {settings.questionSpacing === 0 ? '(ملتصق تماماً)' : settings.questionSpacing <= 4 ? '(فائق التقارب ⭐)' : settings.questionSpacing <= 8 ? '(متقارب)' : ''}
                      </span>
                    </div>

                    {/* Quick Preset Buttons */}
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-1">
                      {[
                        { val: 0, label: '0pt (ملتصق)' },
                        { val: 4, label: '⭐ 4pt (فائق)' },
                        { val: 8, label: '8pt (متقارب)' },
                        { val: 12, label: '12pt (خفيف)' },
                        { val: 16, label: '16pt (عادي)' },
                        { val: 22, label: '22pt (متباعد)' }
                      ].map((item) => (
                        <button
                          key={item.val}
                          type="button"
                          onClick={() => setSettings({ ...settings, questionSpacing: item.val })}
                          className={`py-1.5 px-1 rounded-lg text-[10.5px] font-black transition cursor-pointer border text-center ${
                            settings.questionSpacing === item.val
                              ? 'bg-indigo-600 text-white border-indigo-700 shadow-2xs'
                              : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>

                    {/* Fine-Tuning Slider + Stepper */}
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setSettings({ ...settings, questionSpacing: Math.max(0, settings.questionSpacing - 2) })}
                        className="w-7 h-7 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 font-black text-slate-700 flex items-center justify-center cursor-pointer text-xs"
                        title="تقليل المسافة بمقدار 2pt"
                      >
                        -
                      </button>
                      <input
                        type="range"
                        min="0"
                        max="40"
                        step="2"
                        value={settings.questionSpacing}
                        onChange={(e) => setSettings({ ...settings, questionSpacing: parseInt(e.target.value) })}
                        className="w-full accent-indigo-600 cursor-pointer h-1.5 bg-slate-200 rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={() => setSettings({ ...settings, questionSpacing: Math.min(60, settings.questionSpacing + 2) })}
                        className="w-7 h-7 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 font-black text-slate-700 flex items-center justify-center cursor-pointer text-xs"
                        title="زيادة المسافة بمقدار 2pt"
                      >
                        +
                      </button>
                    </div>

                    <div className="text-[10.5px] text-emerald-800 bg-emerald-50/80 border border-emerald-200 rounded-lg p-1.5 flex items-center gap-1 font-medium">
                      <span>✓</span>
                      <span>تم إلغاء كافة الفواصل الفارغة التلقائية لضمان تطبيق المسافة المحددة في Word بدقة.</span>
                    </div>
                  </div>

                  {/* Hide Example Boxes Toggle - User requested control */}
                  <div className="bg-gradient-to-r from-emerald-50/70 to-indigo-50/60 border border-emerald-200 rounded-xl p-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                        <span>إخفاء المربعات والإطارات حول الأمثلة (أ، ب، ج):</span>
                        <span className={`text-[10.5px] font-black px-2 py-0.5 rounded-md ${
                          settings.hideExampleBorders
                            ? 'bg-emerald-600 text-white shadow-2xs'
                            : 'bg-slate-200 text-slate-700'
                        }`}>
                          {settings.hideExampleBorders ? 'مخفية (بدون مربعات ⭐)' : 'ظاهرة (بمربعات)'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-600 font-medium mt-0.5">
                        يلغي الخطوط والمربعات المحيطة بالأمثلة لتظهر في ملف Word مرتبة بأعمدة حرة وناصعة بدون حواف رمادية.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSettings(prev => ({ ...prev, hideExampleBorders: !prev.hideExampleBorders }))}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        settings.hideExampleBorders ? 'bg-emerald-600' : 'bg-slate-300'
                      }`}
                      title={settings.hideExampleBorders ? 'المربعات مخفية (انقر للإظهار)' : 'انقر لإخفاء المربعات'}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                          settings.hideExampleBorders ? 'translate-x-0' : 'translate-x-5'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Page Margins */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      هوامش الصفحة (A4 Margins):
                    </label>
                    <select
                      value={settings.pageMargin}
                      onChange={(e) => setSettings({ ...settings, pageMargin: e.target.value as any })}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      {Object.entries(PAGE_MARGINS_OPTIONS).map(([k, v]) => (
                        <option key={k} value={k}>{v.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Student Answer Writing Space */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      إضافة أسطر منقطة لكتابة إجابة التلميذ:
                    </label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[
                        { val: 0, label: 'بدون أسطر' },
                        { val: 2, label: 'سطرين (..) ' },
                        { val: 3, label: '3 أسطر' },
                        { val: 4, label: '4 أسطر' }
                      ].map((item) => (
                        <button
                          key={item.val}
                          type="button"
                          onClick={() => setSettings({ ...settings, answerLinesCount: item.val })}
                          className={`py-1.5 rounded-lg text-xs font-bold transition cursor-pointer border ${
                            settings.answerLinesCount === item.val
                              ? 'bg-indigo-600 text-white border-indigo-700 font-black shadow-2xs'
                              : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. Header, Footer & Output Details Toggles */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                <div className="text-xs font-black text-slate-800 mb-3 flex items-center gap-1.5">
                  <LayoutTemplate className="w-4 h-4 text-slate-600" />
                  <span>تضمين أجزاء ورقة الامتحان في مستند Word:</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <label className="flex items-center gap-2.5 p-2 bg-white rounded-xl border border-slate-200 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={settings.showHeader}
                      onChange={(e) => setSettings({ ...settings, showHeader: e.target.checked })}
                      className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                    />
                    <span className="font-bold text-slate-800">ترويسة الامتحان المدرسية</span>
                  </label>

                  <label className="flex items-center gap-2.5 p-2 bg-white rounded-xl border border-slate-200 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={settings.showStudentInfoLine}
                      disabled={!settings.showHeader}
                      onChange={(e) => setSettings({ ...settings, showStudentInfoLine: e.target.checked })}
                      className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 disabled:opacity-40"
                    />
                    <span className="font-bold text-slate-800">سطر اسم الطالب والشعبة</span>
                  </label>

                  <label className="flex items-center gap-2.5 p-2 bg-white rounded-xl border border-slate-200 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={settings.showFooter}
                      onChange={(e) => setSettings({ ...settings, showFooter: e.target.checked })}
                      className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                    />
                    <span className="font-bold text-slate-800">خاتمة الأسئلة وتوقيع المعلم</span>
                  </label>
                </div>
              </div>
            </div>
          ) : (
            /* Tab 2: Interactive Live Preview */
            <div className="space-y-3">
              <div className="flex items-center justify-between bg-slate-100 p-2.5 rounded-xl border border-slate-200 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-700">معاينة مباشرة لشكل ورقة الوورد:</span>
                  <span className="bg-indigo-100 text-indigo-900 font-bold px-2 py-0.5 rounded">
                    {settings.fontFamily} • {settings.fontSize} • تباعد {settings.lineSpacing}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPreviewZoom(Math.max(70, previewZoom - 10))}
                    className="w-7 h-7 bg-white hover:bg-slate-200 rounded-lg font-bold border border-slate-300 flex items-center justify-center cursor-pointer"
                    title="تصغير"
                  >
                    -
                  </button>
                  <span className="font-mono text-xs font-bold px-1">{previewZoom}%</span>
                  <button
                    type="button"
                    onClick={() => setPreviewZoom(Math.min(130, previewZoom + 10))}
                    className="w-7 h-7 bg-white hover:bg-slate-200 rounded-lg font-bold border border-slate-300 flex items-center justify-center cursor-pointer"
                    title="تكبير"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewZoom(100)}
                    className="px-2 py-1 bg-white hover:bg-slate-200 rounded-lg text-[10px] font-bold border border-slate-300 cursor-pointer"
                  >
                    100%
                  </button>
                </div>
              </div>

              {/* Document Simulator Container */}
              <div className="border border-slate-300 rounded-2xl bg-slate-200/60 p-4 sm:p-6 overflow-x-auto flex justify-center min-h-[420px]">
                <div 
                  className="bg-white rounded-xl shadow-xl border border-slate-300 p-6 sm:p-10 transition-all origin-top text-right"
                  style={{
                    width: '100%',
                    maxWidth: '780px',
                    transform: `scale(${previewZoom / 100})`,
                    transformOrigin: 'top center',
                    direction: 'rtl'
                  }}
                  dangerouslySetInnerHTML={{ __html: renderedHtml }}
                />
              </div>
            </div>
          )}

          {/* Quick Actions & Mobile Troubleshooting */}
          <div className="border-t border-slate-200 pt-4 space-y-3">
            <h4 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
              <span>اختر صيغة التنزيل والحفظ المناسبة لهاتفك:</span>
            </h4>

            {/* Main Action Buttons Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* Option 1: Native .doc Word Download */}
              <button
                type="button"
                onClick={() => handleDownloadDoc('doc')}
                disabled={downloading}
                className="py-3 px-4 bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-800 hover:to-indigo-800 text-white rounded-xl text-xs sm:text-sm font-black transition flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-95 disabled:opacity-50"
              >
                <FileDown className="w-4 h-4" />
                <span>{downloading ? 'جاري تجهيز المستند...' : '📥 تنزيل Word (.doc) للهاتف'}</span>
              </button>

              {/* Option 2: Print or Save as PDF */}
              <button
                type="button"
                onClick={handlePrintPdf}
                className="py-3 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs sm:text-sm font-black transition flex items-center justify-center gap-2 cursor-pointer shadow-sm"
              >
                <Printer className="w-4 h-4" />
                <span>🖨️ حفظ كـ PDF على الهاتف</span>
              </button>

              {/* Option 3: Copy formatted HTML */}
              <button
                type="button"
                onClick={handleCopyClipboard}
                className={`py-3 px-4 rounded-xl text-xs sm:text-sm font-black transition flex items-center justify-center gap-2 cursor-pointer border ${
                  copied
                    ? 'bg-emerald-600 text-white border-emerald-700'
                    : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-300'
                }`}
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'تم النسخ بنجاح ✅' : '📋 نسخ التنسيق للوورد'}</span>
              </button>
            </div>

            {/* Secondary actions: Share WhatsApp & Open in Chrome */}
            <div className="flex items-center justify-between gap-2 flex-wrap pt-1 text-xs">
              <button
                type="button"
                onClick={handleWhatsApp}
                className="px-3 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 rounded-xl font-bold transition flex items-center gap-1.5 cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>إرسال ومشاركة عبر واتساب</span>
              </button>

              <button
                type="button"
                onClick={handleOpenInChrome}
                className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-xl font-bold transition flex items-center gap-1.5 cursor-pointer"
                title="يفتح الصفحة في متصفح Google Chrome الرسمي بالهاتف لتنزيل الملف بدون قيود"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>فتح الرابط في متصفح Chrome للتنزيل المباشر</span>
              </button>
            </div>
          </div>
        </div>

        {/* Modal Bottom Bar */}
        <div className="bg-slate-50 border-t border-slate-200 px-5 py-3 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-slate-500">
            <span>الملف المولد:</span>
            <span className="font-mono font-bold text-slate-800">{fullFileName}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
