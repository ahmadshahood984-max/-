/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface WelcomeMessagesConfig {
  directorTitle: string;
  directorSubtitle: string;
  directorBody: string;
  teacherTitle: string;
  teacherSubtitle: string;
  teacherBody: string;
  parentTitle: string;
  parentSubtitle: string;
  parentBody: string;
}

export const DEFAULT_WELCOME_MESSAGES: WelcomeMessagesConfig = {
  directorTitle: 'أهلاً وسهلاً بكم في المنصة المدرسية',
  directorSubtitle: 'مرحباً بكم حضرتكم في لوحة التحكم الإدارية المركزية ✨',
  directorBody: 'نتمنى لكم يوماً حافلاً بالإنجاز والنجاح في إشراف وتوجيه مسيرة المدرسة، متابعة التقارير الأكاديمية والتواصل مع الكادر التعليمي وأولياء الأمور بكل سهولة وسرعة.',
  teacherTitle: 'أهلاً بك أستاذنا الفاضل ✨',
  teacherSubtitle: 'نثمن عالياً جهودكم الجبارة في تنشئة ورعاية أجيال المستقبل 🌟',
  teacherBody: 'يسعدنا تقديم كافة التسهيلات لكم لرصد درجات الطلاب، تسجيل الحضور والغياب اليومي، وإرسال الملاحظات والتنبيهات التعليمية بكل سلاسة.',
  parentTitle: 'أهلاً وسهلاً بكم في تطبيق المدرسة',
  parentSubtitle: 'مرحباً بكم في البوابة الإلكترونية المخصصة لمتابعة أبنائكم 🌟',
  parentBody: 'نسعد بتواصلكم المستمر ومتابعتكم الحثيثة لمسيرة أبنائكم التعليمية، الاطلاع على علامات الاختبارات، سجلات الحضور والغياب، وتلقي التنبيهات المدرسية مباشرة.'
};

export function getStoredWelcomeMessages(): WelcomeMessagesConfig {
  try {
    const raw = localStorage.getItem('school_welcome_messages');
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_WELCOME_MESSAGES,
        ...parsed
      };
    }
  } catch (err) {
    console.error('Error loading custom welcome messages:', err);
  }
  return DEFAULT_WELCOME_MESSAGES;
}

export function saveWelcomeMessages(messages: WelcomeMessagesConfig): void {
  try {
    const serialized = JSON.stringify(messages);
    localStorage.setItem('school_welcome_messages', serialized);
    window.dispatchEvent(new CustomEvent('school_storage_update', {
      detail: { key: 'school_welcome_messages', value: serialized }
    }));
    window.dispatchEvent(new Event('storage'));
  } catch (err) {
    console.error('Error saving custom welcome messages:', err);
  }
}
