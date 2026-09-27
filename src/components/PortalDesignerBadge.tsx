import React from 'react';
import { Sparkles } from 'lucide-react';

interface PortalDesignerBadgeProps {
  variant?: 'light' | 'dark' | 'card' | 'subtle';
  align?: 'left' | 'center' | 'right';
  className?: string;
}

export const PortalDesignerBadge: React.FC<PortalDesignerBadgeProps> = ({
  variant = 'light',
  align = 'left',
  className = ''
}) => {
  const justifyClass = align === 'left' ? 'justify-start' : align === 'right' ? 'justify-end' : 'justify-center';

  if (variant === 'dark') {
    return (
      <div className={`w-full flex items-center ${justifyClass} py-2.5 select-none ${className}`} style={{ direction: 'ltr' }}>
        <div 
          style={{ direction: 'rtl' }}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-slate-800 text-slate-300 text-[11px] font-bold shadow-xs hover:border-amber-400/40 hover:text-amber-300 transition-all duration-200"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0 animate-pulse" />
          <span>تصميم أ.أحمد شحود</span>
        </div>
      </div>
    );
  }

  if (variant === 'card') {
    return (
      <div className={`w-full flex items-center ${justifyClass} py-4 select-none ${className}`} style={{ direction: 'ltr' }}>
        <div 
          style={{ direction: 'rtl' }}
          className="inline-flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-gradient-to-r from-amber-500/10 via-indigo-500/10 to-amber-500/10 border border-slate-200/90 shadow-2xs text-xs font-black text-slate-800 backdrop-blur-xs"
        >
          <div className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-600 flex items-center justify-center shadow-2xs">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <span className="tracking-wide">تصميم أ.أحمد شحود</span>
        </div>
      </div>
    );
  }

  if (variant === 'subtle') {
    return (
      <div className={`w-full flex items-center ${justifyClass} select-none ${className}`} style={{ direction: 'ltr' }}>
        <div 
          style={{ direction: 'rtl' }}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-50 border border-slate-200/80 text-[11px] font-bold text-slate-600 shadow-2xs select-none hover:text-slate-900 transition-colors"
        >
          <Sparkles className="w-3 h-3 text-amber-500 shrink-0" />
          <span>تصميم أ.أحمد شحود</span>
        </div>
      </div>
    );
  }

  // Default 'light' variant: aligned to left by default
  return (
    <div className={`w-full flex items-center ${justifyClass} py-3 select-none ${className}`} style={{ direction: 'ltr' }}>
      <div 
        style={{ direction: 'rtl' }}
        className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/95 border border-slate-200/90 shadow-2xs text-[11px] font-black text-slate-700 hover:border-amber-300 hover:text-amber-800 transition-all duration-200"
      >
        <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0 animate-pulse" />
        <span className="tracking-wide">تصميم أ.أحمد شحود</span>
      </div>
    </div>
  );
};

export default PortalDesignerBadge;
