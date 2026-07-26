import React, { useState, useEffect } from 'react';
import { MessageSquare, Send, X, RotateCcw, Save, Trash2, Plus, Phone, Check, Eye, Edit3, Copy, Monitor, Smartphone } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { isMobileDevice } from '../lib/whatsapp';

export interface WhatsAppMessageCustomizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  studentName: string;
  studentId?: string;
  recipientPhone: string;
  initialMessage: string;
  defaultTemplateText?: string;
  templateStorageKey?: string;
  onConfirmSend: (finalPhone: string, finalMessage: string, targetType?: 'auto' | 'web' | 'app') => void;
  quickTags?: { label: string; textToInsert: string }[];
}

export const WhatsAppMessageCustomizerModal: React.FC<WhatsAppMessageCustomizerModalProps> = ({
  isOpen,
  onClose,
  title = 'تعديل وصياغة رسالة الواتساب لولي الأمر',
  studentName,
  recipientPhone,
  initialMessage,
  defaultTemplateText,
  templateStorageKey,
  onConfirmSend,
  quickTags = []
}) => {
  const [phone, setPhone] = useState(recipientPhone);
  const [message, setMessage] = useState(initialMessage);
  const [savedSuccessAlert, setSavedSuccessAlert] = useState(false);
  const [copiedAlert, setCopiedAlert] = useState(false);
  const [toastNotice, setToastNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  const [isMobile, setIsMobile] = useState(() => isMobileDevice());

  const showToast = (msg: string) => {
    setToastNotice(msg);
    setTimeout(() => {
      setToastNotice(null);
    }, 4000);
  };

  useEffect(() => {
    if (isOpen) {
      setPhone(recipientPhone);
      setMessage(initialMessage);
      setSavedSuccessAlert(false);
      setCopiedAlert(false);
      setToastNotice(null);
      setActiveTab('edit');
      setIsMobile(isMobileDevice());
    }
  }, [isOpen, recipientPhone, initialMessage]);

  if (!isOpen) return null;

  const handleInsertTag = (textToInsert: string) => {
    setMessage(prev => prev + textToInsert);
  };

  const handleResetToDefault = () => {
    if (templateStorageKey) {
      try {
        localStorage.removeItem(templateStorageKey);
      } catch (e) {}
    }
    setMessage(defaultTemplateText || initialMessage);
    showToast('🔄 تم إرجاع النص إلى الصيغة التلقائية الأصلية وإلغاء القالب المحفوظ.');
  };

  const handleSaveAsDefaultTemplate = () => {
    if (!templateStorageKey) {
      showToast('⚠️ تعذر تحديد مفتاح حفظ القالب الافتراضي!');
      return;
    }
    if (!message || !message.trim()) {
      showToast('⚠️ النص فارغ، لا يمكن حفظ قالب فارغ!');
      return;
    }

    let templateToSave = message;
    if (studentName && studentName.trim()) {
      templateToSave = templateToSave.replaceAll(studentName.trim(), '{اسم_الطالب}');
    }

    if (templateStorageKey === 'school_whatsapp_monthly_template') {
      // Replace rendered grade list with {كشف_الدرجات} placeholder ONLY if grade list is present literally and no placeholder exists yet
      if (!templateToSave.includes('{كشف_الدرجات}') && !templateToSave.includes('{الدرجات}') && !templateToSave.includes('{نتائج_المواد}')) {
        templateToSave = templateToSave.replace(
          /(?:•\s*(?:📘|📗|📙|📕|📚|\*)*[\s\S]*?(?:العلامة|الدرجة|\/100|\/ 100)[\s\S]*?\n?)+/gi,
          '{كشف_الدرجات}\n'
        );
      }
    }

    try {
      localStorage.setItem(templateStorageKey, templateToSave);
      setSavedSuccessAlert(true);
      showToast('✅ تم حفظ صيغة القالب والتنسيقات المعدلة كما هي دون أي إضافة!');
      setTimeout(() => setSavedSuccessAlert(false), 5000);
    } catch (e) {
      showToast('❌ حدث خطأ أثناء محاولة حفظ القالب في الذاكرة المحلية.');
    }
  };

  const handleClearText = () => {
    if (templateStorageKey) {
      try {
        localStorage.removeItem(templateStorageKey);
      } catch (e) {}
    }
    setMessage('');
    showToast('🗑️ تم تفريغ النص وحذف القالب المحفوظ بنجاح.');
  };

  const handleCopyOnly = () => {
    if (!message.trim()) return;
    try {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(message.trim());
      }
    } catch (e) {}
    setCopiedAlert(true);
    setTimeout(() => setCopiedAlert(false), 3000);
  };

  const handleSend = (targetType: 'auto' | 'web' | 'app' = 'auto') => {
    if (!phone.trim()) {
      showToast('⚠️ الرجاء إدخال رقم هاتف ولي الأمر!');
      return;
    }
    if (!message.trim()) {
      showToast('⚠️ الرسالة فارغة! الرجاء كتابة نص الرسالة أولاً.');
      return;
    }
    try {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(message.trim());
      }
    } catch (e) {}
    onConfirmSend(phone.trim(), message.trim(), targetType);
    onClose();
  };

  // Format helper to wrap selected text in textarea
  const applyTextFormatting = (prefix: string, suffix: string = prefix, defaultPlaceholder: string = 'نص') => {
    const textarea = document.getElementById('whatsapp-message-textarea') as HTMLTextAreaElement | null;
    if (!textarea) {
      setMessage(prev => prev + `${prefix}${defaultPlaceholder}${suffix}`);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = message.substring(start, end);

    if (selectedText) {
      const replacement = `${prefix}${selectedText}${suffix}`;
      const newMsg = message.substring(0, start) + replacement + message.substring(end);
      setMessage(newMsg);
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + prefix.length, start + prefix.length + selectedText.length);
      }, 50);
    } else {
      const replacement = `${prefix}${defaultPlaceholder}${suffix}`;
      const newMsg = message.substring(0, start) + replacement + message.substring(end);
      setMessage(newMsg);
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + prefix.length, start + prefix.length + defaultPlaceholder.length);
      }, 50);
    }
  };

  // Preset Template generators with color styles
  const applyColorTemplate = (theme: 'emerald' | 'gold' | 'blue' | 'purple') => {
    let t = '';
    if (theme === 'gold') {
      t = `👑 *المدرسة الدولية الخاصة* 👑
📜 *كشف الدرجات والتقرير الشامل*
─────────────────────────
🌹 *السلام عليكم ورحمة الله وبركاته*
إلى ولي أمر الطالب/ة المحترم:

👤 *الطالب:* *{اسم_الطالب}* | 🏫 *الصف:* *{الصف}* | 📅 *شهر:* *[{الشهر}]*

📚 *نتائج ودرجات المواد الدراسية:*
{كشف_الدرجات}

📊 *المعدل العام:* ❪ {المعدل} ❫ | 🏆 *التقدير النهائي:* *{التقدير}*

📌 *سجل الحضور والمواظبة:*
• 🟢 *حضور:* ❪ {أيام_الحضور} ❫ | 🔴 *غياب:* ❪ {أيام_الغياب} ❫ | 📊 *إجمالي:* ❪ {إجمالي_الأيام} ❫

📝 *توجيهات وتقارير المتابعة:*
{التقييم}
─────────────────────────
✨ *شاكرين لكم حسن المتابعة لتعزيز تميز ابنكم* | 🏫 *إدارة المدرسة*`;
    } else if (theme === 'blue') {
      t = `🔹 *المدرسة الدولية الخاصة* 🔹
📋 *كشف الدرجات الشهري المعتمد*
─────────────────────────
🌹 *تحية طيبة وبعد*
إلى ولي أمر الطالب المحترم:

👤 *الطالب:* *{اسم_الطالب}* | 🏫 *الصف:* *{الصف}* | 📅 *شهر:* *[{الشهر}]*

📈 *سجل النتائج والأداء الأكاديمي:*
{كشف_الدرجات}

📊 *المعدل:* ❪ {المعدل} ❫ | 🏅 *التقدير:* *{التقدير}*

📌 *تقرير الحضور والمواظبة:*
• 🟢 *حضور:* ❪ {أيام_الحضور} ❫ | 🔴 *غياب:* ❪ {أيام_الغياب} ❫ | 📊 *إجمالي:* ❪ {إجمالي_الأيام} ❫

📝 *توجيهات وتقارير المتابعة:*
{التقييم}
─────────────────────────
🏫 *إدارة المدرسة الدولية الخاصة*`;
    } else if (theme === 'purple') {
      t = `💜 *المدرسة الدولية الخاصة* 💜
🌟 *التقرير الأكاديمي المتميز*
─────────────────────────
🌹 *السلام عليكم ورحمة الله وبركاته*
إلى ولي أمر الطالب/ة المحترم/ة:

👤 *الطالب:* *{اسم_الطالب}* | 🏫 *الصف:* *{الصف}* | 📅 *شهر:* *[{الشهر}]*

🎓 *كشف درجات التقييم:*
{كشف_الدرجات}

📊 *المعدل:* ❪ {المعدل} ❫ | ⭐ *التقدير:* *{التقدير}*

📌 *المواظبة والحضور:*
• 🟢 *حضور:* ❪ {أيام_الحضور} ❫ | 🔴 *غياب:* ❪ {أيام_الغياب} ❫ | 📊 *إجمالي:* ❪ {إجمالي_الأيام} ❫

📝 *توجيهات وتقارير المتابعة:*
{التقييم}
─────────────────────────
✨ *مع تحيات كادر وإدارة المدرسة الدولية*`;
    } else {
      t = `💚 *المدرسة الدولية الخاصة* 💚
📢 *إشعار رسمي: كشف درجات الطالب*
─────────────────────────
🌹 *السلام عليكم ورحمة الله وبركاته*
إلى ولي أمر الطالب المحترم:

👤 *الطالب:* *{اسم_الطالب}* | 🏫 *الصف:* *{الصف}* | 📅 *شهر:* *[{الشهر}]*

📚 *نتائج ودرجات المواد الدراسية:*
{كشف_الدرجات}

📊 *المعدل العام:* ❪ {المعدل} ❫ | 🌟 *التقدير:* *{التقدير}*

📌 *سجل الحضور والغياب:*
• 🟢 *حضور:* ❪ {أيام_الحضور} ❫ | 🔴 *غياب:* ❪ {أيام_الغياب} ❫ | 📊 *إجمالي:* ❪ {إجمالي_الأيام} ❫

📝 *توجيهات وتقارير المتابعة:*
{التقييم}
─────────────────────────
🏫 *إدارة المدرسة الدولية الخاصة*`;
    }
    setMessage(t);
  };

  // Convert WhatsApp markdown syntax (*bold*, _italic_, ~strike~) to HTML
  const formatWhatsAppTextToHTML = (text: string) => {
    if (!text) return '';
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const formattedLines = escaped.split('\n').map((line, idx) => {
      let l = line
        .replace(/\*(.*?)\*/g, '<strong class="font-extrabold text-slate-950 px-0.5">$1</strong>')
        .replace(/_(.*?)_/g, '<em class="italic text-slate-800">$1</em>')
        .replace(/~(.*?)~/g, '<del class="line-through text-slate-500">$1</del>')
        .replace(/```(.*?)```/g, '<code class="bg-slate-200 text-slate-800 font-mono text-[11px] px-1 py-0.5 rounded">$1</code>');

      // Highlight headers like 💚 المدرسة الدولية الخاصة 💚 or 📜 التقييم الشهري
      if (line.includes('المدرسة الدولية الخاصة')) {
        l = `<div class="bg-gradient-to-r from-emerald-800 via-teal-800 to-emerald-900 text-amber-300 font-extrabold text-xs py-1 px-2.5 rounded-lg text-center my-1 shadow-2xs border border-emerald-600/40">${l}</div>`;
      } else if (line.includes('التقييم') && (line.includes('التقرير الشهري') || line.includes('كشف الدرجات') || line.includes('إشعار رسمي') || line.includes('التقرير الأكاديمي'))) {
        l = `<div class="bg-indigo-50/90 text-indigo-950 font-black text-xs text-center border-b border-indigo-200 py-0.5 mb-1 rounded-t-md">${l}</div>`;
      } else if (line.includes('════') || line.includes('────')) {
        l = `<div class="text-emerald-600/40 font-mono text-[9px] text-center my-0.5 select-none overflow-hidden text-ellipsis whitespace-nowrap">${l}</div>`;
      } else if (line.includes('📚 *نتائج') || line.includes('📈 *سجل النتائج') || line.includes('🎓 *كشف درجات') || line.includes('📚 *نتائج ودرجات')) {
        l = `<div class="bg-indigo-50/80 border-r-3 border-indigo-600 text-indigo-950 font-extrabold px-2 py-0.5 rounded-l-md text-xs my-0.5 flex items-center gap-1">${l}</div>`;
      } else if (line.includes('📌 *سجل') || line.includes('📌 *تقرير الحضور') || line.includes('📌 *المواظبة')) {
        l = `<div class="bg-teal-50/80 border-r-3 border-teal-600 text-teal-950 font-extrabold px-2 py-0.5 rounded-l-md text-xs my-0.5 flex items-center gap-1">${l}</div>`;
      } else if (line.includes('📝 *توجيهات وتقارير')) {
        l = `<div class="bg-purple-50/80 border-r-3 border-purple-600 text-purple-950 font-extrabold px-2 py-0.5 rounded-l-md text-xs my-0.5 flex items-center gap-1">${l}</div>`;
      } else if (line.includes('توجيهات المعلم')) {
        l = `<div class="bg-indigo-50/90 border-r-3 border-indigo-600 text-indigo-950 font-extrabold px-2 py-0.5 rounded-l-md text-xs my-0.5 flex items-center gap-1">
              <span>👨‍🏫</span>
              <span>${l.replace('👨‍🏫', '')}</span>
            </div>`;
      } else if (line.includes('توجيهات الإدارة') || line.includes('توجيهات الادارة')) {
        l = `<div class="bg-purple-50/90 border-r-3 border-purple-600 text-purple-950 font-extrabold px-2 py-0.5 rounded-l-md text-xs my-0.5 flex items-center gap-1">
              <span>🏫</span>
              <span>${l.replace('🏫', '')}</span>
            </div>`;
      } else if (line.includes('أيام الحضور') || line.includes('أيام الغياب') || line.includes('أيام التأخر') || line.includes('إجمالي أيام الدوام') || line.includes('إجمالي الأيام') || line.includes('حضور:') || line.includes('غياب:')) {
        l = l
          .replace(/🟢/g, '<span class="text-emerald-600 font-bold">🟢</span>')
          .replace(/🔴/g, '<span class="text-rose-600 font-bold">🔴</span>')
          .replace(/🟡/g, '<span class="text-amber-600 font-bold">🟡</span>')
          .replace(/❪(.*?)❫/g, '<span class="bg-slate-800 text-white font-black px-1.5 py-0.5 rounded font-mono text-[11px] shadow-2xs">$1</span>');
      } else if (line.includes('•') && (line.includes('المادة') || line.includes('الرياضيات') || line.includes('العلوم') || line.includes('اللغة') || line.includes('100') || line.includes('📘') || line.includes('📗') || line.includes('📙') || line.includes('📕'))) {
        l = l
          .replace(/📘/g, '<span class="text-indigo-600 font-bold">📘</span>')
          .replace(/📗/g, '<span class="text-emerald-600 font-bold">📗</span>')
          .replace(/📙/g, '<span class="text-amber-600 font-bold">📙</span>')
          .replace(/📕/g, '<span class="text-rose-600 font-bold">📕</span>')
          .replace(/❪(.*?)❫/g, '<span class="bg-emerald-600 text-white font-black px-1.5 py-0.5 rounded font-mono text-[11px] shadow-2xs">$1</span>');
      } else if (line.trim().startsWith('❪') && line.trim().endsWith('❫')) {
        const innerText = line.trim().substring(1, line.trim().length - 1);
        l = `<div class="bg-amber-50/90 border border-amber-200/80 text-amber-950 px-2.5 py-1 rounded-lg my-0.5 text-xs font-bold leading-snug shadow-2xs">
              <span class="text-amber-700 font-black">💬 </span>${innerText}
            </div>`;
      } else if (line.includes('المعدل العام') || line.includes('التقدير النهائي') || line.includes('التقدير العام') || line.includes('المعدل:')) {
        l = l.replace(/❪(.*?)❫/g, '<span class="bg-amber-500 text-slate-950 border border-amber-300 font-black px-1.5 py-0.5 rounded font-mono text-xs">$1</span>');
      }

      return `<div key="${idx}" class="${line.trim() === '' ? 'h-1' : 'min-h-[1.1rem]'}">${l}</div>`;
    }).join('');

    return { __html: formattedLines };
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs dir-rtl">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh]"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-800 p-4 text-white flex justify-between items-center shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-white/10 rounded-xl">
                <MessageSquare className="w-5 h-5 text-emerald-200" />
              </div>
              <div>
                <h3 className="font-bold text-sm sm:text-base leading-tight">{title}</h3>
                <p className="text-[11px] text-emerald-100 font-medium mt-0.5">
                  الطالب/ة: <span className="underline font-bold">{studentName}</span>
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-white/10 rounded-xl text-emerald-100 hover:text-white transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Sub Header - Phone Input & Tabs */}
          <div className="bg-slate-50 border-b border-slate-200 p-3 flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-mono font-bold text-slate-800 grow max-w-xs shadow-2xs">
              <Phone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="text-[11px] text-slate-500 shrink-0">رقم الواتساب:</span>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="0501234567"
                className="w-full focus:outline-none text-emerald-800 font-bold font-mono text-left dir-ltr text-xs"
              />
            </div>

            <div className="flex bg-slate-200/80 p-1 rounded-xl text-xs font-bold shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab('edit')}
                className={`px-3 py-1 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'edit' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>تحرير النص</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                className={`px-3 py-1 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'preview' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Eye className="w-3.5 h-3.5 text-emerald-600" />
                <span>معاينة المحادثة 💬</span>
              </button>
            </div>
          </div>

          {/* Modal Body */}
          <div className="p-4 overflow-y-auto space-y-4 grow">
            {toastNotice && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className="bg-slate-900 text-white p-3 rounded-xl text-xs font-bold flex items-center justify-between shadow-lg border border-slate-700"
              >
                <span>{toastNotice}</span>
                <button type="button" onClick={() => setToastNotice(null)} className="text-slate-400 hover:text-white px-1">✕</button>
              </motion.div>
            )}

            {savedSuccessAlert && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-emerald-600 text-white p-3 rounded-xl text-xs font-black flex items-center justify-between shadow-md border border-emerald-500 ring-2 ring-emerald-300/40"
              >
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-white text-emerald-700 rounded-full flex items-center justify-center font-black text-xs shrink-0">
                    ✓
                  </div>
                  <span>تم حفظ صيغة الرسالة والتصميم كقالب افتراضي بنجاح! 🎉 سيتم اعتماده لكافة المراسلات القادمة.</span>
                </div>
              </motion.div>
            )}

            {activeTab === 'edit' ? (
              <>
                {/* Preset Themes Selector */}
                <div className="bg-slate-50 border border-slate-200/80 p-2.5 rounded-xl space-y-1.5">
                  <div className="text-[11px] font-black text-slate-700 flex items-center justify-between">
                    <span>🎨 اختيار قالب لون وتصميم جاهز لكشف الدرجات والتقرير:</span>
                    <span className="text-[10px] text-slate-400 font-normal">اضغط لتطبيق التنسيق تلقائياً</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    <button
                      type="button"
                      onClick={() => applyColorTemplate('gold')}
                      className="text-[11px] bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 py-1.5 px-2 rounded-lg font-bold transition cursor-pointer flex items-center justify-center gap-1 shadow-2xs"
                    >
                      <span>👑 الذهبي الفاخر</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => applyColorTemplate('emerald')}
                      className="text-[11px] bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 py-1.5 px-2 rounded-lg font-bold transition cursor-pointer flex items-center justify-center gap-1 shadow-2xs"
                    >
                      <span>💚 الأخضر الزمردي</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => applyColorTemplate('blue')}
                      className="text-[11px] bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-300 py-1.5 px-2 rounded-lg font-bold transition cursor-pointer flex items-center justify-center gap-1 shadow-2xs"
                    >
                      <span>🔹 الأزرق الملكي</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => applyColorTemplate('purple')}
                      className="text-[11px] bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-300 py-1.5 px-2 rounded-lg font-bold transition cursor-pointer flex items-center justify-center gap-1 shadow-2xs"
                    >
                      <span>💜 البنفسجي المتميز</span>
                    </button>
                  </div>
                </div>

                {/* Quick Insert Tags */}
                {quickTags && quickTags.length > 0 && (
                  <div>
                    <div className="text-[11px] font-bold text-slate-500 mb-1.5 flex items-center gap-1">
                      <Plus className="w-3 h-3 text-emerald-600" />
                      <span>إضافات سريعة واختصارات نصوص للرسالة:</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {quickTags.map((tag, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => handleInsertTag(tag.textToInsert)}
                          className="text-[11px] bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-xl transition cursor-pointer flex items-center gap-1 font-medium shadow-2xs"
                        >
                          <Plus className="w-3 h-3 text-emerald-600" />
                          <span>{tag.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Text Formatting Toolbar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-[11px] text-slate-600 font-bold px-1">
                    <span>تنسيق الخط وتخصيص نمط الرسالة:</span>
                    <span className="font-mono dir-ltr text-slate-500">{message.length} حرف</span>
                  </div>

                  {/* Formatting Toolbar Buttons */}
                  <div className="bg-slate-100 p-1.5 rounded-t-xl border border-slate-200 flex flex-wrap items-center gap-1 text-xs">
                    <button
                      type="button"
                      onClick={() => applyTextFormatting('*', '*', 'نص عريض')}
                      className="px-2 py-1 bg-white hover:bg-slate-50 border border-slate-300 rounded font-black text-slate-900 transition cursor-pointer shadow-2xs"
                      title="خط عريض B (تغليف النص بنجمتين *نص*)"
                    >
                      <span className="font-extrabold text-sm">B</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => applyTextFormatting('_', '_', 'نص مائل')}
                      className="px-2 py-1 bg-white hover:bg-slate-50 border border-slate-300 rounded font-bold italic text-slate-900 transition cursor-pointer shadow-2xs"
                      title="خط مائل I (تغليف النص بـ _نص_)"
                    >
                      <span className="italic font-bold text-sm">I</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => applyTextFormatting('~', '~', 'نص مشطوب')}
                      className="px-2 py-1 bg-white hover:bg-slate-50 border border-slate-300 rounded font-bold line-through text-slate-900 transition cursor-pointer shadow-2xs"
                      title="خط مشطوب S (تغليف بـ ~نص~)"
                    >
                      <span className="line-through font-bold text-sm">S</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => applyTextFormatting('```', '```', 'كود/رقم')}
                      className="px-2 py-1 bg-white hover:bg-slate-50 border border-slate-300 rounded font-mono text-[11px] text-slate-800 transition cursor-pointer shadow-2xs"
                      title="خط كود ثابت Monospace (تغليف بـ ```نص```)"
                    >
                      <span>{'</>'}</span>
                    </button>

                    <div className="h-4 w-px bg-slate-300 mx-1 shrink-0" />

                    {/* Color & Highlight Badges */}
                    <button
                      type="button"
                      onClick={() => applyTextFormatting('💚 *', '* 💚', 'عنوان بارز')}
                      className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded text-[11px] font-bold text-emerald-800 transition cursor-pointer"
                      title="عنوان بارز باللون الأخضر"
                    >
                      💚 عنوان بارز
                    </button>
                    <button
                      type="button"
                      onClick={() => applyTextFormatting('⭐ *', '* ⭐', 'تقدير ممتاز')}
                      className="px-2 py-1 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded text-[11px] font-bold text-amber-900 transition cursor-pointer"
                      title="علامة تمييز ذهبية"
                    >
                      ⭐ تمييز ذهبي
                    </button>
                    <button
                      type="button"
                      onClick={() => applyTextFormatting('❪ ', ' ❫', '95%')}
                      className="px-2 py-1 bg-teal-50 hover:bg-teal-100 border border-teal-300 rounded text-[11px] font-bold text-teal-900 transition cursor-pointer"
                      title="تأطير الدرجة/النسبة داخل قوسين مميزين"
                    >
                      ❪ درجة ❫
                    </button>
                    <button
                      type="button"
                      onClick={() => applyTextFormatting('═════════════════════════\n', '\n═════════════════════════', 'عنوان القسم')}
                      className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 border border-indigo-300 rounded text-[11px] font-bold text-indigo-900 transition cursor-pointer"
                      title="إضافة خط فاصل للعنوان"
                    >
                      ══ فاصل
                    </button>
                  </div>

                  <textarea
                    id="whatsapp-message-textarea"
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    rows={10}
                    placeholder="اكتب نص رسالة الواتساب هنا..."
                    className="w-full text-xs border border-slate-300 rounded-b-xl p-3 bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none text-slate-800 font-sans leading-relaxed shadow-inner"
                  />
                </div>

                {/* Toolbar actions */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 text-xs">
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={handleResetToDefault}
                      className="text-[11px] text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-200 px-2.5 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1 font-semibold"
                      title="استعادة الصيغة التلقائية الأصلية"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                      <span>إعادة ضبط النص</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleClearText}
                      className="text-[11px] text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2.5 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1 font-semibold"
                      title="مسح النص بالكامل"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                      <span>تفريغ النص</span>
                    </button>
                  </div>

                  {templateStorageKey && (
                    <button
                      type="button"
                      onClick={handleSaveAsDefaultTemplate}
                      className="text-[11px] text-white bg-indigo-600 hover:bg-indigo-700 border border-indigo-700 px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 font-bold shadow-xs active:scale-95"
                      title="حفظ الصيغة الحالية كقالب افتراضي لجميع المراسلات القادمة"
                    >
                      <Save className="w-3.5 h-3.5 text-indigo-100" />
                      <span>حفظ كقالب افتراضي 💾</span>
                    </button>
                  )}
                </div>
              </>
            ) : (
              /* WhatsApp Realistic Chat Bubble Preview */
              <div className="space-y-3">
                <div className="text-xs font-bold text-slate-600 bg-slate-100 p-2.5 rounded-xl flex items-center justify-between">
                  <span>💬 المعاينة الحية كما ستظهر في تطبيق الواتساب لولي الأمر:</span>
                  <span className="text-[10px] text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md font-bold">
                    منسق بتنسيق الواتساب الرسمي
                  </span>
                </div>

                <div className="bg-[#e5ddd5] dark:bg-slate-800 p-4 rounded-2xl border border-slate-300 shadow-inner min-h-[300px] flex flex-col justify-end relative overflow-hidden">
                  <div className="bg-[#dcf8c6] dark:bg-emerald-950 dark:text-emerald-100 text-slate-900 p-3.5 rounded-2xl shadow-md max-w-full sm:max-w-[90%] self-start relative border border-emerald-300/60 leading-relaxed text-xs">
                    <div
                      className="font-sans whitespace-pre-wrap leading-relaxed text-slate-900 dark:text-slate-100"
                      dangerouslySetInnerHTML={formatWhatsAppTextToHTML(message)}
                    />
                    <div className="text-[10px] text-slate-500 text-left dir-ltr mt-2 flex items-center justify-end gap-1 font-mono">
                      <span>{new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}</span>
                      <span className="text-emerald-600 font-bold">✓✓</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="bg-slate-50 border-t border-slate-200 p-3.5 flex flex-col sm:flex-row items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 border border-slate-300 text-slate-600 hover:bg-slate-100 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                إلغاء
              </button>

              <button
                type="button"
                onClick={handleCopyOnly}
                className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5"
                title="نسخ نص الرسالة للحافظة لاستخدامه يدوياً"
              >
                <Copy className="w-3.5 h-3.5 text-slate-600" />
                <span>{copiedAlert ? 'تم النسخ! ✓' : 'نسخ النص'}</span>
              </button>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={() => handleSend('auto')}
                className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-6 py-2.5 rounded-xl shadow-md hover:shadow-lg transition cursor-pointer flex items-center justify-center gap-2"
                title="إرسال الرسالة وفتح صفحة الواتساب مباشرة"
              >
                <Send className="w-4 h-4" />
                <span>إرسال عبر الواتس 📲</span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
