/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Award, CheckCircle2 } from 'lucide-react';
import { getSealAndSignaturesConfig, SealAndSignaturesConfig, DEFAULT_SEAL_SIGNATURES_CONFIG } from '../lib/sealSignaturesConfig';

interface OfficialSchoolStampProps {
  size?: 'sm' | 'md' | 'lg';
  rotation?: number;
  className?: string;
  sealColor?: string;
  config?: SealAndSignaturesConfig;
  target?: 'primary' | 'director' | 'general';
}

/**
 * Authentic Circular Rubber School Stamp (ختم المدرسة الرسمي المعتمد)
 * Supports generated SVG circular seal with customizable texts/colors,
 * or displaying an uploaded custom school stamp image (separate for Primary & School Director).
 */
export const OfficialSchoolStamp: React.FC<OfficialSchoolStampProps> = ({
  size = 'md',
  rotation,
  className = '',
  sealColor,
  config: propConfig,
  target = 'general',
}) => {
  const [activeConfig, setActiveConfig] = useState<SealAndSignaturesConfig>(() => propConfig || getSealAndSignaturesConfig());

  useEffect(() => {
    if (propConfig) {
      setActiveConfig(propConfig);
      return;
    }
    const handleStorageUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<{ key: string; value: string }>;
      if (customEvent.detail?.key === 'school_seal_and_signatures_config') {
        try {
          setActiveConfig({ ...DEFAULT_SEAL_SIGNATURES_CONFIG, ...JSON.parse(customEvent.detail.value) });
        } catch (err) {
          // ignore
        }
      }
    };
    window.addEventListener('school_storage_update', handleStorageUpdate);
    return () => window.removeEventListener('school_storage_update', handleStorageUpdate);
  }, [propConfig]);

  const dimension = size === 'sm' ? 82 : size === 'lg' ? 120 : 98;
  const effectiveRotation = rotation !== undefined ? rotation : (activeConfig.stampRotation ?? -7);
  const effectiveColor = sealColor || activeConfig.stampColor || '#1e40af';

  // Determine which stamp to use depending on target
  const isPrimary = target === 'primary';
  const isDirector = target === 'director';

  const stampType = isPrimary
    ? (activeConfig.primaryManagerStampType || activeConfig.stampType)
    : isDirector
    ? (activeConfig.schoolDirectorStampType || activeConfig.stampType)
    : activeConfig.stampType;

  const stampImage = isPrimary
    ? (activeConfig.primaryManagerCustomStamp || activeConfig.customStampImage)
    : isDirector
    ? (activeConfig.schoolDirectorCustomStamp || activeConfig.customStampImage)
    : activeConfig.customStampImage;

  // If uploaded stamp image is selected for this target
  if (stampType === 'uploaded_image' && stampImage) {
    return (
      <div
        className={`inline-block pointer-events-none select-none transition-transform ${className}`}
        style={{
          width: dimension,
          height: dimension,
          transform: `rotate(${effectiveRotation}deg)`,
        }}
        title="ختم المدرسة الرسمي المعتمد"
      >
        <img
          src={stampImage}
          alt="ختم المدرسة الرسمي"
          className="w-full h-full object-contain filter drop-shadow-xs"
        />
      </div>
    );
  }

  // Otherwise, render the prestigious SVG circular seal with dynamic Arabic texts
  const schoolName = activeConfig.stampSchoolName || 'المدرسة الدولية الخاصة';
  const location = activeConfig.stampLocation || 'حلب - مدينة مارع';
  const centerText = activeConfig.stampCenterText || 'الختم الرسمي';
  const subText = activeConfig.stampSubText || 'معتمد وموثّق ✓';

  return (
    <div
      className={`inline-block pointer-events-none select-none transition-transform ${className}`}
      style={{
        width: dimension,
        height: dimension,
        transform: `rotate(${effectiveRotation}deg)`,
      }}
      title="الختم الرسمي للمدرسة الدولية الخاصة"
    >
      <svg
        viewBox="0 0 160 160"
        className="w-full h-full drop-shadow-xs"
        style={{ color: effectiveColor }}
      >
        {/* Outer dashed/toothed ring */}
        <circle
          cx="80"
          cy="80"
          r="76"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeDasharray="4 2.5"
          opacity="0.85"
        />

        {/* Outer solid ring */}
        <circle
          cx="80"
          cy="80"
          r="71"
          fill="rgba(30, 58, 138, 0.03)"
          stroke="currentColor"
          strokeWidth="3.5"
          opacity="0.95"
        />

        {/* Inner thin ring */}
        <circle
          cx="80"
          cy="80"
          r="48"
          fill="rgba(37, 99, 235, 0.02)"
          stroke="currentColor"
          strokeWidth="2"
          opacity="0.85"
        />

        {/* Circular text paths */}
        <defs>
          <path id="stampTopCurve" d="M 22,80 A 58,58 0 1,1 138,80" fill="none" />
          <path id="stampBottomCurve" d="M 136,82 A 56,56 0 0,1 24,82" fill="none" />
        </defs>

        {/* Upper Curved Text: اسم المدرسة */}
        <text
          fill="currentColor"
          fontSize="11"
          fontWeight="900"
          letterSpacing="0.6"
          style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
        >
          <textPath href="#stampTopCurve" startOffset="50%" textAnchor="middle">
            ★ {schoolName} ★
          </textPath>
        </text>

        {/* Lower Curved Text: المحافظة / المدينة */}
        <text
          fill="currentColor"
          fontSize="9.5"
          fontWeight="800"
          letterSpacing="0.4"
          style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
        >
          <textPath href="#stampBottomCurve" startOffset="50%" textAnchor="middle">
            {location}
          </textPath>
        </text>

        {/* Center Emblem & Texts */}
        <g transform="translate(80, 80) scale(0.95)">
          {/* Small star above center */}
          <polygon
            points="0,-30 4,-20 14,-20 6,-14 9,-4 0,-10 -9,-4 -6,-14 -14,-20 -4,-20"
            fill="currentColor"
            opacity="0.9"
            transform="scale(0.55) translate(0, -28)"
          />

          {/* Center Box / Ribbon */}
          <rect
            x="-36"
            y="-15"
            width="72"
            height="22"
            rx="4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="2 1"
          />

          <text
            x="0"
            y="-1"
            fill="currentColor"
            fontSize="10"
            fontWeight="900"
            textAnchor="middle"
            style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
          >
            {centerText}
          </text>

          <text
            x="0"
            y="17"
            fill="currentColor"
            fontSize="8"
            fontWeight="800"
            textAnchor="middle"
            letterSpacing="0.3"
          >
            {subText}
          </text>

          {/* Bottom small decorative stars */}
          <circle cx="-16" cy="27" r="1.5" fill="currentColor" />
          <circle cx="0" cy="28.5" r="2" fill="currentColor" />
          <circle cx="16" cy="27" r="1.5" fill="currentColor" />
        </g>
      </svg>
    </div>
  );
};

interface GradeSheetSignaturesProps {
  className?: string;
  variant?: 'card' | 'print' | 'subtle';
  subtitle?: string;
  config?: SealAndSignaturesConfig;
  onOpenEditModal?: () => void;
}

/**
 * Official dual-signature & dual-stamp certification block for grade sheets and report cards:
 * - Right (على اليمين): مدير قسم الابتدائي (قابل للتعديل) + ختم المدرسة
 * - Left (على اليسار): مدير المدرسة الدولية الخاصة (قابل للتعديل) + ختم المدرسة
 */
export const GradeSheetSignatures: React.FC<GradeSheetSignaturesProps> = ({
  className = '',
  variant = 'card',
  subtitle = 'الاعتماد الرسمي لكشف الدرجات والتقارير الشهرية',
  config: propConfig,
  onOpenEditModal,
}) => {
  const [activeConfig, setActiveConfig] = useState<SealAndSignaturesConfig>(() => propConfig || getSealAndSignaturesConfig());

  useEffect(() => {
    if (propConfig) {
      setActiveConfig(propConfig);
      return;
    }
    const handleStorageUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<{ key: string; value: string }>;
      if (customEvent.detail?.key === 'school_seal_and_signatures_config') {
        try {
          setActiveConfig({ ...DEFAULT_SEAL_SIGNATURES_CONFIG, ...JSON.parse(customEvent.detail.value) });
        } catch (err) {
          // ignore
        }
      }
    };
    window.addEventListener('school_storage_update', handleStorageUpdate);
    return () => window.removeEventListener('school_storage_update', handleStorageUpdate);
  }, [propConfig]);

  const isPrint = variant === 'print';
  const primaryName = activeConfig.primaryManagerName || 'أ. أحمد شحود';
  const primaryTitle = activeConfig.primaryManagerTitle || 'مدير قسم الابتدائي';
  const primaryBadge = activeConfig.primaryManagerRoleBadge || 'إدارة القسم الابتدائي';

  const directorName = activeConfig.schoolDirectorName || 'أ. عبداللطيف النجار';
  const directorTitle = activeConfig.schoolDirectorTitle || 'مدير المدرسة الدولية الخاصة';
  const directorBadge = activeConfig.schoolDirectorRoleBadge || 'الإدارة العامة للمدرسة';

  return (
    <div
      className={`relative rounded-2xl overflow-hidden ${
        isPrint
          ? 'border-2 border-slate-300 bg-white p-4'
          : variant === 'subtle'
          ? 'border border-indigo-100 bg-slate-50/70 p-4'
          : 'border-2 border-indigo-200/90 bg-gradient-to-br from-indigo-50/60 via-white to-amber-50/50 p-5 shadow-xs'
      } ${className}`}
      style={{ direction: 'rtl' }}
    >
      {/* Top Banner / Verification Title */}
      <div className="flex flex-col sm:flex-row items-center justify-between pb-3 mb-4 border-b border-indigo-100/70 gap-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-2xs shrink-0">
            <Award className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-black text-indigo-950">
              التصديق والاعتماد الإداري لكشف الدرجات والشهادة
            </h4>
            <p className="text-[10px] text-slate-500 font-medium">
              {subtitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onOpenEditModal && (
            <button
              type="button"
              onClick={onOpenEditModal}
              className="text-[10px] bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-lg font-bold transition flex items-center gap-1 shadow-2xs cursor-pointer"
              title="تعديل الأسماء والمناصب وصورة أو لون الختم"
            >
              <span>✏️ تعديل التواقيع والختم</span>
            </button>
          )}
          <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200/80 px-2.5 py-1 rounded-full text-[10px] font-extrabold shadow-2xs shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>موثّق ومختوم إلكترونياً بالختم الرسمي 🏛️</span>
          </div>
        </div>
      </div>

      {/* Dual Signature and Stamp Row: Right = مدير قسم الابتدائي | Left = مدير المدرسة الدولية الخاصة */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 items-stretch pt-1">
        {/* Right Signature: مدير قسم الابتدائي */}
        <div className="relative bg-white/95 border border-indigo-200 rounded-2xl p-4 shadow-2xs flex flex-col justify-between overflow-hidden group hover:border-indigo-400 transition min-h-[145px]">
          <div className="relative z-10 text-right space-y-1">
            <span className="text-[10px] font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 rounded-full inline-block">
              {primaryBadge}
            </span>
            <div className="text-xs font-black text-slate-700 pt-1">
              {primaryTitle}
            </div>
            <div className="text-sm font-black text-indigo-950 tracking-wide">
              {primaryName}
            </div>
          </div>

          {/* Signature Line & Status */}
          <div className="relative z-10 pt-4 mt-2 border-t border-slate-150 flex items-center justify-between text-[10px]">
            <span className="font-mono text-slate-400 font-bold">التوقيع والاعتماد:</span>
            <span className="font-extrabold text-indigo-850 font-serif italic text-xs tracking-wider">
              {primaryName}
            </span>
          </div>

          {/* School Rubber Stamp overlapping the right signature */}
          {activeConfig.showStamps && (
            <div className="absolute left-3 top-2 pointer-events-none opacity-90 group-hover:scale-105 transition-transform duration-300">
              <OfficialSchoolStamp
                size="md"
                rotation={activeConfig.stampRotation ?? -7}
                sealColor={activeConfig.stampColor}
                config={activeConfig}
                target="primary"
              />
            </div>
          )}
        </div>

        {/* Left Signature: مدير المدرسة الدولية الخاصة */}
        <div className="relative bg-white/95 border border-amber-200 rounded-2xl p-4 shadow-2xs flex flex-col justify-between overflow-hidden group hover:border-amber-400 transition min-h-[145px]">
          <div className="relative z-10 text-right space-y-1">
            <span className="text-[10px] font-extrabold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full inline-block">
              {directorBadge}
            </span>
            <div className="text-xs font-black text-slate-700 pt-1">
              {directorTitle}
            </div>
            <div className="text-sm font-black text-amber-950 tracking-wide">
              {directorName}
            </div>
          </div>

          {/* Signature Line & Status */}
          <div className="relative z-10 pt-4 mt-2 border-t border-slate-150 flex items-center justify-between text-[10px]">
            <span className="font-mono text-slate-400 font-bold">التوقيع والاعتماد:</span>
            <span className="font-extrabold text-amber-900 font-serif italic text-xs tracking-wider">
              {directorName}
            </span>
          </div>

          {/* School Rubber Stamp overlapping the left signature */}
          {activeConfig.showStamps && (
            <div className="absolute left-3 top-2 pointer-events-none opacity-90 group-hover:scale-105 transition-transform duration-300">
              <OfficialSchoolStamp
                size="md"
                rotation={6}
                sealColor={activeConfig.stampColor}
                config={activeConfig}
                target="director"
              />
            </div>
          )}
        </div>
      </div>

      {/* Verification footer note */}
      <div className="mt-4 pt-2.5 border-t border-slate-200/70 flex flex-col sm:flex-row items-center justify-between text-[10px] text-slate-500 font-medium gap-1">
        <span>{activeConfig.stampSchoolName || 'المدرسة الدولية الخاصة'} • {activeConfig.stampLocation || 'حلب - مدينة مارع'}</span>
        <span className="font-mono text-slate-400">كشف رسمي معتمد صادر عن إدارة المدرسة</span>
      </div>
    </div>
  );
};

export default GradeSheetSignatures;
