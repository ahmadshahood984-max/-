/**
 * WhatsApp Helper Functions for Student Evaluations & Behavior
 */

export interface WhatsAppSentRecord {
  sentAt: string; // ISO string
  timeLabel: string; // e.g. "10:15 ص"
  dateLabel: string; // e.g. "2026/07/22"
  studentName: string;
  type: 'monthly_eval' | 'behavior' | 'grade' | 'general';
  contextKey: string;
}

export function cleanPhoneNumber(phone: string): string {
  if (!phone) return '';
  // Convert Arabic-Indic numerals (٠١٢٣٤٥٦٧٨٩) to standard numerals
  let cleaned = phone.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString());
  cleaned = cleaned.replace(/\D/g, '');
  if (cleaned.startsWith('00')) {
    cleaned = cleaned.substring(2);
  }
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1);
    // Regional heuristics if 9 digits missing country code
    if (cleaned.length === 9 && cleaned.startsWith('5')) {
      cleaned = '966' + cleaned; // Saudi Arabia
    } else if (cleaned.length === 9 && cleaned.startsWith('9')) {
      cleaned = '963' + cleaned; // Syria
    }
  } else if (cleaned.length === 9 && cleaned.startsWith('5')) {
    cleaned = '966' + cleaned;
  }
  return cleaned;
}

export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera || '';
  return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent) || window.innerWidth <= 768;
}

export function buildWhatsAppUrl(phone: string, text: string, targetType: 'auto' | 'web' | 'app' = 'auto'): string {
  const cleaned = cleanPhoneNumber(phone);
  const encodedText = encodeURIComponent(text);

  if (targetType === 'web') {
    return cleaned
      ? `https://web.whatsapp.com/send?phone=${cleaned}&text=${encodedText}`
      : `https://web.whatsapp.com/send?text=${encodedText}`;
  }

  // Universal WhatsApp API link - works seamlessly on both mobile (opens native app) and desktop (opens WhatsApp Web/Desktop)
  return cleaned
    ? `https://api.whatsapp.com/send?phone=${cleaned}&text=${encodedText}`
    : `https://api.whatsapp.com/send?text=${encodedText}`;
}

export function openWhatsAppDirectly(phone: string, text: string, targetType: 'auto' | 'web' | 'app' = 'auto'): void {
  // Always copy text to clipboard as a universal fail-safe
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text);
    }
  } catch (e) {
    console.warn('Clipboard write warning:', e);
  }

  const url = buildWhatsAppUrl(phone, text, targetType);

  // Create temporary link with target="_blank" so the main app tab never leaves the grades table
  try {
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      if (document.body.contains(link)) {
        document.body.removeChild(link);
      }
    }, 100);
  } catch (e) {
    // Fallback if anchor click fails
    try {
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error('Error opening WhatsApp:', err);
    }
  }
}

export function getWhatsAppSentRecords(): Record<string, WhatsAppSentRecord> {
  try {
    const saved = localStorage.getItem('school_whatsapp_sent_records');
    return saved ? JSON.parse(saved) : {};
  } catch (e) {
    return {};
  }
}

export function recordWhatsAppSent(
  key: string,
  studentName: string,
  type: 'monthly_eval' | 'behavior' | 'grade' | 'general'
): WhatsAppSentRecord {
  const now = new Date();
  const timeLabel = now.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
  const dateLabel = now.toLocaleDateString('ar-SA');
  
  const record: WhatsAppSentRecord = {
    sentAt: now.toISOString(),
    timeLabel,
    dateLabel,
    studentName,
    type,
    contextKey: key
  };

  try {
    const records = getWhatsAppSentRecords();
    records[key] = record;
    localStorage.setItem('school_whatsapp_sent_records', JSON.stringify(records));
  } catch (e) {
    console.error('Failed to save whatsapp record', e);
  }

  return record;
}
