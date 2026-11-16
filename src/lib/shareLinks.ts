/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Returns the currently active, live origin of the applet.
 * This URL is always live and guaranteed not to return 404 "Page not found".
 */
export const getLiveOrigin = (): string => {
  if (typeof window === 'undefined') return '';
  return window.location.origin;
};

/**
 * Returns the public shared origin (ais-pre-...) which becomes active
 * after clicking "Share" or "Publish" in the AI Studio header.
 */
export const getPublicShareableOrigin = (preferPublished = false): string => {
  if (typeof window === 'undefined') return '';
  const origin = window.location.origin;
  if (preferPublished && origin.includes('ais-dev-')) {
    return origin.replace('ais-dev-', 'ais-pre-');
  }
  return origin;
};

/**
 * Generates the direct URL for a specific portal
 */
export const getPortalDirectUrl = (
  portal: 'director' | 'teacher' | 'parent',
  extraParams?: Record<string, string>,
  preferPublished = false
): string => {
  const origin = getPublicShareableOrigin(preferPublished);
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '/';
  const searchParams = new URLSearchParams();
  searchParams.set('portal', portal);
  if (extraParams) {
    Object.entries(extraParams).forEach(([k, v]) => {
      if (v) searchParams.set(k, v);
    });
  }
  return `${origin}${pathname}?${searchParams.toString()}`;
};

/**
 * Robust copy-to-clipboard with multiple fallback layers.
 * Synchronous execCommand runs FIRST to preserve the mobile user gesture token,
 * followed by modern navigator.clipboard.writeText.
 */
export const copyTextSafely = async (text: string): Promise<boolean> => {
  if (typeof window === 'undefined' || !text) return false;

  // Layer 1: Synchronous execCommand inside current user gesture
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '-9999px';
    textArea.style.width = '2em';
    textArea.style.height = '2em';
    textArea.style.padding = '0';
    textArea.style.border = 'none';
    textArea.style.outline = 'none';
    textArea.style.boxShadow = 'none';
    textArea.style.background = 'transparent';
    textArea.style.fontSize = '16px'; // Prevent auto-zoom on iOS
    textArea.setAttribute('readonly', '');
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    textArea.setSelectionRange(0, text.length);

    const execSuccess = document.execCommand('copy');
    document.body.removeChild(textArea);
    if (execSuccess) {
      return true;
    }
  } catch (err) {
    console.warn('execCommand copy failed, proceeding to clipboard API:', err);
  }

  // Layer 2: Modern Clipboard API
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn('navigator.clipboard.writeText failed:', err);
    }
  }

  return false;
};

/**
 * Direct WhatsApp sharing with formatted invitation text
 */
export const shareTeacherPortalViaWhatsApp = (schoolName = 'المدرسة الدولية - حلب مدينة مارع'): string => {
  const url = getPortalDirectUrl('teacher');
  const message = `السلام عليكم ورحمة الله وبركاته 🌹\n\nالزملاء المعلمون والمعلمات الأفاضل (${schoolName}):\n\n📌 رابط الدخول المباشر لبوابة المعلمين:\n${url}\n\n✅ من خلال هذا الرابط يمكنكم مباشرة:\n• رصد درجات وتقييمات الطلاب الشهرية\n• متابعة الحضور والغياب وجداول الحصص\n\n💡 ملاحظة: الرابط يعمل على الهواتف والمتصفحات مباشرة دون الحاجة لتسجيل دخول مسبق.`;
  const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
  if (typeof window !== 'undefined') {
    window.open(whatsappUrl, '_blank');
  }
  return whatsappUrl;
};

export const shareParentPortalViaWhatsApp = (schoolName = 'المدرسة الدولية - حلب مدينة مارع'): string => {
  const url = getPortalDirectUrl('parent');
  const message = `السلام عليكم ورحمة الله وبركاته 🌹\n\nأولياء الأمور الكرام في (${schoolName}):\n\n📌 رابط متابعة نتائج وأداء الطلاب (بوابة أولياء الأمور):\n${url}\n\n✅ من خلال هذا الرابط يمكنكم مباشرة:\n• الاطلاع على كشوف الدرجات والشهادات الشهرية\n• متابعة سجلات الحضور والغياب اليومي\n• إرسال تبريرات الغياب والتواصل مع إدارة المدرسة\n\n💡 ملاحظة: الرابط مخصص للهواتف الذكية ويعمل مباشرة.`;
  const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
  if (typeof window !== 'undefined') {
    window.open(whatsappUrl, '_blank');
  }
  return whatsappUrl;
};

/**
 * Mobile Native Share Drawer (WhatsApp, Telegram, Notes, etc.)
 */
export const shareViaNativeDrawer = async (title: string, text: string, url: string): Promise<boolean> => {
  if (typeof navigator !== 'undefined' && (navigator as any).share) {
    try {
      await (navigator as any).share({
        title,
        text,
        url
      });
      return true;
    } catch (err) {
      // User dismissed or share not supported
      return false;
    }
  }
  return false;
};
