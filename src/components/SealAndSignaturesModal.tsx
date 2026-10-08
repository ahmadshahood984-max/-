/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { X, Award, Check, RotateCcw, Upload, Image as ImageIcon, Sparkles, Palette, ShieldCheck } from 'lucide-react';
import {
  getSealAndSignaturesConfig,
  saveSealAndSignaturesConfig,
  SealAndSignaturesConfig,
  DEFAULT_SEAL_SIGNATURES_CONFIG,
} from '../lib/sealSignaturesConfig';
import { OfficialSchoolStamp } from './GradeSheetSignatures';

interface SealAndSignaturesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PRESET_STAMP_COLORS = [
  { name: 'أزرق ملكي كلاسيكي', value: '#1e40af', bg: 'bg-blue-700' },
  { name: 'كحلي دبلوماسي داكن', value: '#1e3a8a', bg: 'bg-indigo-900' },
  { name: 'أحمر رسمي ملكي', value: '#b91c1c', bg: 'bg-rose-700' },
  { name: 'أخضر زمردي معتمد', value: '#047857', bg: 'bg-emerald-700' },
  { name: 'بنفسجي ملكي فاخر', value: '#6b21a8', bg: 'bg-purple-800' },
];

export const SealAndSignaturesModal: React.FC<SealAndSignaturesModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [config, setConfig] = useState<SealAndSignaturesConfig>(getSealAndSignaturesConfig);
  const [selectedStampTarget, setSelectedStampTarget] = useState<'primary' | 'director'>('primary');
  const primaryFileInputRef = useRef<HTMLInputElement>(null);
  const directorFileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleSave = () => {
    saveSealAndSignaturesConfig(config);
    onClose();
  };

  const handleReset = () => {
    if (window.confirm('هل أنت متأكد من استعادة أسماء المدراء وبيانات الختم الافتراضية؟')) {
      setConfig({ ...DEFAULT_SEAL_SIGNATURES_CONFIG });
      saveSealAndSignaturesConfig(DEFAULT_SEAL_SIGNATURES_CONFIG);
    }
  };

  const handlePrimaryFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('يرجى اختيار ملف صورة صالح (PNG أو JPG).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      const dataUrl = evt.target?.result as string;
      setConfig(prev => ({
        ...prev,
        primaryManagerStampType: 'uploaded_image',
        primaryManagerCustomStamp: dataUrl,
        customStampImage: prev.customStampImage || dataUrl,
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleDirectorFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('يرجى اختيار ملف صورة صالح (PNG أو JPG).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      const dataUrl = evt.target?.result as string;
      setConfig(prev => ({
        ...prev,
        schoolDirectorStampType: 'uploaded_image',
        schoolDirectorCustomStamp: dataUrl,
        customStampImage: prev.customStampImage || dataUrl,
      }));
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-xs overflow-y-auto" style={{ direction: 'rtl' }}>
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 text-right">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-150 bg-gradient-to-l from-indigo-50 to-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shrink-0">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-slate-900 text-base">
                تعديل وتخصيص أسماء الإدارة والختم الرسمي 🖋️
              </h3>
              <p className="text-slate-500 text-xs mt-0.5">
                تعديل الأسماء، المناصب، وتغيير صورة أو لون ختم المدرسة في كشوفات الدرجات والشهادات
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 flex items-center justify-center transition cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {/* Live Preview Box */}
          <div className="bg-gradient-to-br from-slate-50 via-indigo-50/30 to-amber-50/20 border-2 border-dashed border-indigo-200 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 mb-1">
              <span className="flex items-center gap-1.5 text-indigo-700">
                <Sparkles className="w-3.5 h-3.5" />
                <span>المعاينة المباشرة لشكل التواقيع والختم:</span>
              </span>
              <span className="text-[10px] bg-white px-2 py-0.5 rounded-full border border-slate-200 text-slate-500">
                كما ستظهر عند ولي الأمر والكشوف
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Right Preview */}
              <div className="relative bg-white border border-indigo-200 rounded-xl p-3 shadow-2xs overflow-hidden min-h-[110px] flex flex-col justify-between">
                <div className="relative z-10 space-y-0.5">
                  <span className="text-[9px] bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded-md inline-block">
                    {config.primaryManagerRoleBadge || 'إدارة القسم الابتدائي'}
                  </span>
                  <div className="text-[11px] font-bold text-slate-600">{config.primaryManagerTitle}</div>
                  <div className="text-xs font-black text-indigo-950">{config.primaryManagerName}</div>
                </div>
                <div className="relative z-10 pt-2 border-t border-slate-100 flex items-center justify-between text-[9px] text-slate-400">
                  <span>التوقيع:</span>
                  <span className="font-black text-indigo-900 font-serif italic text-[11px]">{config.primaryManagerName}</span>
                </div>
                {config.showStamps && (
                  <div className="absolute left-2 top-1 pointer-events-none opacity-90">
                    <OfficialSchoolStamp size="sm" rotation={config.stampRotation} config={config} target="primary" />
                  </div>
                )}
              </div>

              {/* Left Preview */}
              <div className="relative bg-white border border-amber-200 rounded-xl p-3 shadow-2xs overflow-hidden min-h-[110px] flex flex-col justify-between">
                <div className="relative z-10 space-y-0.5">
                  <span className="text-[9px] bg-amber-50 text-amber-800 font-bold px-2 py-0.5 rounded-md inline-block">
                    {config.schoolDirectorRoleBadge || 'الإدارة العامة للمدرسة'}
                  </span>
                  <div className="text-[11px] font-bold text-slate-600">{config.schoolDirectorTitle}</div>
                  <div className="text-xs font-black text-amber-950">{config.schoolDirectorName}</div>
                </div>
                <div className="relative z-10 pt-2 border-t border-slate-100 flex items-center justify-between text-[9px] text-slate-400">
                  <span>التوقيع:</span>
                  <span className="font-black text-amber-900 font-serif italic text-[11px]">{config.schoolDirectorName}</span>
                </div>
                {config.showStamps && (
                  <div className="absolute left-2 top-1 pointer-events-none opacity-90">
                    <OfficialSchoolStamp size="sm" rotation={6} config={config} target="director" />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section 1: Signatures and Names */}
          <div className="space-y-4">
            <h4 className="font-black text-slate-800 text-xs flex items-center gap-1.5 border-r-2 border-indigo-600 pr-2">
              <span>١. أسماء ومناصب المسؤولين في الكشف والشهادة:</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Right Side: Primary Manager */}
              <div className="bg-indigo-50/40 border border-indigo-100 p-3.5 rounded-2xl space-y-3">
                <span className="text-[11px] font-black text-indigo-950 block">
                  الطرف الأيمن (مدير قسم الابتدائي):
                </span>
                <div>
                  <label className="block text-[11px] text-slate-600 font-bold mb-1">اسم المسؤول:</label>
                  <input
                    type="text"
                    value={config.primaryManagerName}
                    onChange={(e) => setConfig({ ...config, primaryManagerName: e.target.value })}
                    className="w-full text-xs border border-indigo-200 bg-white rounded-xl px-3 py-2 font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="مثال: أ. أحمد شحود"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-600 font-bold mb-1">المسمى الوظيفي:</label>
                  <input
                    type="text"
                    value={config.primaryManagerTitle}
                    onChange={(e) => setConfig({ ...config, primaryManagerTitle: e.target.value })}
                    className="w-full text-xs border border-indigo-200 bg-white rounded-xl px-3 py-2 font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="مثال: مدير قسم الابتدائي"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-600 font-bold mb-1">شارة القسم:</label>
                  <input
                    type="text"
                    value={config.primaryManagerRoleBadge}
                    onChange={(e) => setConfig({ ...config, primaryManagerRoleBadge: e.target.value })}
                    className="w-full text-xs border border-indigo-200 bg-white rounded-xl px-3 py-2 font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="مثال: إدارة القسم الابتدائي"
                  />
                </div>
              </div>

              {/* Left Side: School Director */}
              <div className="bg-amber-50/40 border border-amber-100 p-3.5 rounded-2xl space-y-3">
                <span className="text-[11px] font-black text-amber-950 block">
                  الطرف الأيسر (مدير المدرسة العامة):
                </span>
                <div>
                  <label className="block text-[11px] text-slate-600 font-bold mb-1">اسم المسؤول:</label>
                  <input
                    type="text"
                    value={config.schoolDirectorName}
                    onChange={(e) => setConfig({ ...config, schoolDirectorName: e.target.value })}
                    className="w-full text-xs border border-amber-200 bg-white rounded-xl px-3 py-2 font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    placeholder="مثال: أ. عبداللطيف النجار"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-600 font-bold mb-1">المسمى الوظيفي:</label>
                  <input
                    type="text"
                    value={config.schoolDirectorTitle}
                    onChange={(e) => setConfig({ ...config, schoolDirectorTitle: e.target.value })}
                    className="w-full text-xs border border-amber-200 bg-white rounded-xl px-3 py-2 font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    placeholder="مثال: مدير المدرسة الدولية الخاصة"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-600 font-bold mb-1">شارة الإدارة:</label>
                  <input
                    type="text"
                    value={config.schoolDirectorRoleBadge}
                    onChange={(e) => setConfig({ ...config, schoolDirectorRoleBadge: e.target.value })}
                    className="w-full text-xs border border-amber-200 bg-white rounded-xl px-3 py-2 font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    placeholder="مثال: الإدارة العامة للمدرسة"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Stamp Customization with Dual Choices */}
          <div className="space-y-4 pt-2 border-t border-slate-150">
            <div className="border-r-2 border-indigo-600 pr-2">
              <h4 className="font-black text-slate-800 text-xs flex items-center gap-1.5">
                <span>٢. تخصيص ورفع الأختام الرسمية (خيارين منفصلين للمديرين):</span>
              </h4>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                اختر المدير المراد رفع أو تخصيص الختم له (مدير قسم الابتدائي أو مدير المدرسة الدولية الخاصة):
              </p>
            </div>

            {/* Hidden File Inputs for Each Director */}
            <input
              ref={primaryFileInputRef}
              type="file"
              accept="image/png, image/jpeg, image/webp"
              onChange={handlePrimaryFileUpload}
              className="hidden"
            />
            <input
              ref={directorFileInputRef}
              type="file"
              accept="image/png, image/jpeg, image/webp"
              onChange={handleDirectorFileUpload}
              className="hidden"
            />

            {/* Two Choices Selector: Primary vs School Director */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Option 1: ختم مدير قسم الابتدائي */}
              <button
                type="button"
                onClick={() => setSelectedStampTarget('primary')}
                className={`p-3.5 rounded-2xl border-2 text-right transition cursor-pointer relative overflow-hidden flex flex-col justify-between min-h-[90px] ${
                  selectedStampTarget === 'primary'
                    ? 'border-indigo-600 bg-indigo-50/70 shadow-sm ring-2 ring-indigo-500/20'
                    : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50/50'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🏢</span>
                    <span className="font-black text-indigo-950 text-xs">
                      الخيار الأول: ختم مدير قسم الابتدائي
                    </span>
                  </div>
                  <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full border ${
                    config.primaryManagerStampType === 'uploaded_image' && config.primaryManagerCustomStamp
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                      : 'bg-indigo-100 text-indigo-800 border-indigo-200'
                  }`}>
                    {config.primaryManagerStampType === 'uploaded_image' && config.primaryManagerCustomStamp
                      ? 'صورة مخصصة 🖼️'
                      : 'ختم رقمي 🛡️'}
                  </span>
                </div>

                <div className="mt-2 pt-2 border-t border-indigo-100/60 flex items-center justify-between text-[11px]">
                  <span className="font-bold text-slate-600">{config.primaryManagerName || 'أ. أحمد شحود'}</span>
                  <span className={`text-[10px] font-bold ${selectedStampTarget === 'primary' ? 'text-indigo-700 underline font-black' : 'text-slate-400'}`}>
                    {selectedStampTarget === 'primary' ? '✓ الخيار النشط حالياً' : 'انقر للضبط والتخصيص'}
                  </span>
                </div>
              </button>

              {/* Option 2: ختم مدير المدرسة الدولية الخاصة */}
              <button
                type="button"
                onClick={() => setSelectedStampTarget('director')}
                className={`p-3.5 rounded-2xl border-2 text-right transition cursor-pointer relative overflow-hidden flex flex-col justify-between min-h-[90px] ${
                  selectedStampTarget === 'director'
                    ? 'border-amber-500 bg-amber-50/70 shadow-sm ring-2 ring-amber-500/20'
                    : 'border-slate-200 bg-white hover:border-amber-300 hover:bg-slate-50/50'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🏫</span>
                    <span className="font-black text-amber-950 text-xs">
                      الخيار الثاني: ختم مدير المدرسة الدولية الخاصة
                    </span>
                  </div>
                  <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full border ${
                    config.schoolDirectorStampType === 'uploaded_image' && config.schoolDirectorCustomStamp
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                      : 'bg-amber-100 text-amber-800 border-amber-200'
                  }`}>
                    {config.schoolDirectorStampType === 'uploaded_image' && config.schoolDirectorCustomStamp
                      ? 'صورة مخصصة 🖼️'
                      : 'ختم رقمي 🛡️'}
                  </span>
                </div>

                <div className="mt-2 pt-2 border-t border-amber-100/60 flex items-center justify-between text-[11px]">
                  <span className="font-bold text-slate-600">{config.schoolDirectorName || 'أ. عبداللطيف النجار'}</span>
                  <span className={`text-[10px] font-bold ${selectedStampTarget === 'director' ? 'text-amber-800 underline font-black' : 'text-slate-400'}`}>
                    {selectedStampTarget === 'director' ? '✓ الخيار النشط حالياً' : 'انقر للضبط والتخصيص'}
                  </span>
                </div>
              </button>
            </div>

            {/* Active Target Banner */}
            <div className={`p-3 rounded-2xl border flex items-center justify-between ${
              selectedStampTarget === 'primary'
                ? 'bg-indigo-50/60 border-indigo-200 text-indigo-950'
                : 'bg-amber-50/60 border-amber-200 text-amber-950'
            }`}>
              <div className="flex items-center gap-2">
                <span className="text-sm">{selectedStampTarget === 'primary' ? '🏢' : '🏫'}</span>
                <div>
                  <span className="font-black text-xs block">
                    {selectedStampTarget === 'primary'
                      ? `أنت الآن تخصص ختم: ${config.primaryManagerTitle} (${config.primaryManagerName})`
                      : `أنت الآن تخصص ختم: ${config.schoolDirectorTitle} (${config.schoolDirectorName})`}
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium">
                    يمكنك رفع صورة ختم خاصة بهذا المدير أو استخدام الختم الرقمي
                  </span>
                </div>
              </div>

              {/* Mode switch for active target */}
              <div className="flex bg-white rounded-xl p-1 border border-slate-200 shadow-2xs">
                <button
                  type="button"
                  onClick={() => {
                    if (selectedStampTarget === 'primary') {
                      setConfig(prev => ({ ...prev, primaryManagerStampType: 'custom_svg' }));
                    } else {
                      setConfig(prev => ({ ...prev, schoolDirectorStampType: 'custom_svg' }));
                    }
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                    (selectedStampTarget === 'primary' ? config.primaryManagerStampType : config.schoolDirectorStampType) === 'custom_svg'
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  الختم الرقمي
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedStampTarget === 'primary') {
                      setConfig(prev => ({ ...prev, primaryManagerStampType: 'uploaded_image' }));
                    } else {
                      setConfig(prev => ({ ...prev, schoolDirectorStampType: 'uploaded_image' }));
                    }
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                    (selectedStampTarget === 'primary' ? config.primaryManagerStampType : config.schoolDirectorStampType) === 'uploaded_image'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  رفع صورة 🖼️
                </button>
              </div>
            </div>

            {/* Target 1 (Primary Section Director) Upload or Customizer */}
            {selectedStampTarget === 'primary' && (
              <>
                {config.primaryManagerStampType === 'uploaded_image' ? (
                  <div className="bg-indigo-50/30 border-2 border-indigo-200 rounded-2xl p-4 text-center space-y-3">
                    {config.primaryManagerCustomStamp ? (
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-28 h-28 p-2 bg-white rounded-2xl border-2 border-indigo-200 shadow-xs flex items-center justify-center">
                          <img
                            src={config.primaryManagerCustomStamp}
                            alt="ختم مدير قسم الابتدائي"
                            className="w-full h-full object-contain"
                          />
                        </div>
                        <div className="text-[11px] font-black text-indigo-950">
                          ختم مدير قسم الابتدائي ({config.primaryManagerName}) المعتمد حالياً
                        </div>
                        <div className="flex flex-wrap justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => primaryFileInputRef.current?.click()}
                            className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 py-1.5 rounded-xl transition cursor-pointer shadow-2xs flex items-center gap-1"
                          >
                            <span>تغيير صورة الختم 🔄</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              // Copy to School Director as well
                              setConfig(prev => ({
                                ...prev,
                                schoolDirectorStampType: 'uploaded_image',
                                schoolDirectorCustomStamp: prev.primaryManagerCustomStamp,
                              }));
                            }}
                            className="text-xs bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold px-3 py-1.5 rounded-xl border border-amber-200 transition cursor-pointer flex items-center gap-1"
                            title="تطبيق نفس صورة الختم هذه على مدير المدرسة الدولية الخاصة أيضاً"
                          >
                            <span>🔗 نسخ وتطبيق أيضاً على مدير المدرسة العامة</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfig(prev => ({ ...prev, primaryManagerCustomStamp: '', primaryManagerStampType: 'custom_svg' }))}
                            className="text-xs bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold px-3 py-1.5 rounded-xl border border-rose-200 transition cursor-pointer"
                          >
                            <span>حذف والعودة للختم الرقمي 🗑️</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3 py-4">
                        <div className="w-12 h-12 bg-indigo-100 text-indigo-700 rounded-2xl flex items-center justify-center mx-auto shadow-2xs">
                          <Upload className="w-6 h-6" />
                        </div>
                        <div>
                          <p className="font-black text-slate-800 text-xs">
                            ارفع صورة ختم مدير قسم الابتدائي ({config.primaryManagerName})
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            يفضل صورة بصيغة PNG مفرغة وشفافة الخلفية
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => primaryFileInputRef.current?.click()}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs px-5 py-2.5 rounded-xl transition shadow-sm cursor-pointer inline-flex items-center gap-1.5"
                        >
                          <Upload className="w-4 h-4" />
                          <span>اختيار صورة ختم مدير قسم الابتدائي من جهازك</span>
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3 bg-slate-50 border border-slate-200 rounded-2xl p-4">
                    <div className="text-[11px] text-slate-600 font-bold flex items-center justify-between">
                      <span>يستخدم مدير قسم الابتدائي حالياً: <strong>الختم الرقمي الدائري المعتمد</strong></span>
                      <button
                        type="button"
                        onClick={() => setConfig(prev => ({ ...prev, primaryManagerStampType: 'uploaded_image' }))}
                        className="text-indigo-600 hover:underline text-xs font-black cursor-pointer"
                      >
                        التبديل إلى رفع صورة ختم 🖼️
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Target 2 (School Director) Upload or Customizer */}
            {selectedStampTarget === 'director' && (
              <>
                {config.schoolDirectorStampType === 'uploaded_image' ? (
                  <div className="bg-amber-50/30 border-2 border-amber-200 rounded-2xl p-4 text-center space-y-3">
                    {config.schoolDirectorCustomStamp ? (
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-28 h-28 p-2 bg-white rounded-2xl border-2 border-amber-200 shadow-xs flex items-center justify-center">
                          <img
                            src={config.schoolDirectorCustomStamp}
                            alt="ختم مدير المدرسة الدولية الخاصة"
                            className="w-full h-full object-contain"
                          />
                        </div>
                        <div className="text-[11px] font-black text-amber-950">
                          ختم مدير المدرسة الدولية الخاصة ({config.schoolDirectorName}) المعتمد حالياً
                        </div>
                        <div className="flex flex-wrap justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => directorFileInputRef.current?.click()}
                            className="text-xs bg-amber-600 hover:bg-amber-700 text-white font-bold px-3 py-1.5 rounded-xl transition cursor-pointer shadow-2xs flex items-center gap-1"
                          >
                            <span>تغيير صورة الختم 🔄</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              // Copy to Primary Director as well
                              setConfig(prev => ({
                                ...prev,
                                primaryManagerStampType: 'uploaded_image',
                                primaryManagerCustomStamp: prev.schoolDirectorCustomStamp,
                              }));
                            }}
                            className="text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-900 font-bold px-3 py-1.5 rounded-xl border border-indigo-200 transition cursor-pointer flex items-center gap-1"
                            title="تطبيق نفس صورة الختم هذه على مدير قسم الابتدائي أيضاً"
                          >
                            <span>🔗 نسخ وتطبيق أيضاً على مدير قسم الابتدائي</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfig(prev => ({ ...prev, schoolDirectorCustomStamp: '', schoolDirectorStampType: 'custom_svg' }))}
                            className="text-xs bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold px-3 py-1.5 rounded-xl border border-rose-200 transition cursor-pointer"
                          >
                            <span>حذف والعودة للختم الرقمي 🗑️</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3 py-4">
                        <div className="w-12 h-12 bg-amber-100 text-amber-800 rounded-2xl flex items-center justify-center mx-auto shadow-2xs">
                          <Upload className="w-6 h-6" />
                        </div>
                        <div>
                          <p className="font-black text-slate-800 text-xs">
                            ارفع صورة ختم مدير المدرسة الدولية الخاصة ({config.schoolDirectorName})
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            يفضل صورة بصيغة PNG مفرغة وشفافة الخلفية
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => directorFileInputRef.current?.click()}
                          className="bg-amber-600 hover:bg-amber-700 text-white font-black text-xs px-5 py-2.5 rounded-xl transition shadow-sm cursor-pointer inline-flex items-center gap-1.5"
                        >
                          <Upload className="w-4 h-4" />
                          <span>اختيار صورة ختم مدير المدرسة الدولية من جهازك</span>
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3 bg-slate-50 border border-slate-200 rounded-2xl p-4">
                    <div className="text-[11px] text-slate-600 font-bold flex items-center justify-between">
                      <span>يستخدم مدير المدرسة الدولية الخاصة حالياً: <strong>الختم الرقمي الدائري المعتمد</strong></span>
                      <button
                        type="button"
                        onClick={() => setConfig(prev => ({ ...prev, schoolDirectorStampType: 'uploaded_image' }))}
                        className="text-amber-700 hover:underline text-xs font-black cursor-pointer"
                      >
                        التبديل إلى رفع صورة ختم 🖼️
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* General Circular Digital Stamp Details & Color Options (if either uses digital) */}
            <div className="bg-slate-50 border border-slate-200/80 p-4 rounded-2xl space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-[11px] text-slate-800 font-black flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-indigo-600" />
                  <span>تخصيص ألوان ونصوص الختم الرقمي المعتمد:</span>
                </label>
                <span className="text-[10px] text-slate-400 font-medium">يطبق على الأختام الرقمية</span>
              </div>

              {/* Stamp Color Selector */}
              <div>
                <span className="block text-[10px] text-slate-500 font-bold mb-1.5">لون الحبر الرسمي للختم:</span>
                <div className="flex flex-wrap gap-2">
                  {PRESET_STAMP_COLORS.map(c => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setConfig({ ...config, stampColor: c.value })}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 border cursor-pointer ${
                        config.stampColor === c.value
                          ? 'border-slate-800 bg-white text-slate-900 shadow-xs ring-2 ring-indigo-500/30'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <span className={`w-3.5 h-3.5 rounded-full ${c.bg} shrink-0`} />
                      <span>{c.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] text-slate-600 font-bold mb-1">اسم المدرسة بالختم:</label>
                  <input
                    type="text"
                    value={config.stampSchoolName}
                    onChange={(e) => setConfig({ ...config, stampSchoolName: e.target.value })}
                    className="w-full text-xs border border-slate-200 bg-white rounded-xl px-3 py-2 font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-600 font-bold mb-1">المدينة / المحافظة:</label>
                  <input
                    type="text"
                    value={config.stampLocation}
                    onChange={(e) => setConfig({ ...config, stampLocation: e.target.value })}
                    className="w-full text-xs border border-slate-200 bg-white rounded-xl px-3 py-2 font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-600 font-bold mb-1">نص وسط الختم:</label>
                  <input
                    type="text"
                    value={config.stampCenterText}
                    onChange={(e) => setConfig({ ...config, stampCenterText: e.target.value })}
                    className="w-full text-xs border border-slate-200 bg-white rounded-xl px-3 py-2 font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-600 font-bold mb-1">نص التوثيق السفلي:</label>
                  <input
                    type="text"
                    value={config.stampSubText}
                    onChange={(e) => setConfig({ ...config, stampSubText: e.target.value })}
                    className="w-full text-xs border border-slate-200 bg-white rounded-xl px-3 py-2 font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Action Buttons */}
        <div className="p-4 sm:p-5 border-t border-slate-150 bg-slate-50 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleReset}
            className="w-full sm:w-auto text-xs text-slate-600 hover:text-slate-900 border border-slate-200 bg-white hover:bg-slate-100 font-bold py-2.5 px-4 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>استعادة الإعدادات الأصلية</span>
          </button>

          <div className="flex gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none text-xs text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 font-bold py-2.5 px-4 rounded-xl transition cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex-1 sm:flex-none text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-black py-2.5 px-6 rounded-xl transition shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>حفظ وتطبيق التعديلات فوراً ✅</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SealAndSignaturesModal;
