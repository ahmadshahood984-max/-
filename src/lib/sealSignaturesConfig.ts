/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface SealAndSignaturesConfig {
  // Right side: Primary Section Director
  primaryManagerTitle: string;
  primaryManagerName: string;
  primaryManagerRoleBadge: string;
  primaryManagerStampType?: 'custom_svg' | 'uploaded_image';
  primaryManagerCustomStamp?: string; // Data URL for Primary Manager stamp

  // Left side: School Director / Principal
  schoolDirectorTitle: string;
  schoolDirectorName: string;
  schoolDirectorRoleBadge: string;
  schoolDirectorStampType?: 'custom_svg' | 'uploaded_image';
  schoolDirectorCustomStamp?: string; // Data URL for School Director stamp

  // Universal / Fallback Stamp settings
  stampType: 'custom_svg' | 'uploaded_image';
  customStampImage?: string; // Data URL or URL of uploaded stamp image
  stampSchoolName: string;
  stampLocation: string;
  stampCenterText: string;
  stampSubText: string;
  stampColor: string;
  stampRotation: number;
  showSignatures: boolean;
  showStamps: boolean;
}

export const DEFAULT_SEAL_SIGNATURES_CONFIG: SealAndSignaturesConfig = {
  primaryManagerTitle: 'مدير قسم الابتدائي',
  primaryManagerName: 'أ. أحمد شحود',
  primaryManagerRoleBadge: 'إدارة القسم الابتدائي',
  primaryManagerStampType: 'custom_svg',
  primaryManagerCustomStamp: '',

  schoolDirectorTitle: 'مدير المدرسة الدولية الخاصة',
  schoolDirectorName: 'أ. عبداللطيف النجار',
  schoolDirectorRoleBadge: 'الإدارة العامة للمدرسة',
  schoolDirectorStampType: 'custom_svg',
  schoolDirectorCustomStamp: '',

  stampType: 'custom_svg',
  customStampImage: '',
  stampSchoolName: 'المدرسة الدولية الخاصة',
  stampLocation: 'حلب - مدينة مارع',
  stampCenterText: 'الختم الرسمي',
  stampSubText: 'معتمد وموثّق ✓',
  stampColor: '#1e40af', // Royal Blue
  stampRotation: -7,
  showSignatures: true,
  showStamps: true,
};

const STORAGE_KEY = 'school_seal_and_signatures_config';

export const getSealAndSignaturesConfig = (): SealAndSignaturesConfig => {
  if (typeof window === 'undefined') return DEFAULT_SEAL_SIGNATURES_CONFIG;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...DEFAULT_SEAL_SIGNATURES_CONFIG, ...parsed };
    }
  } catch (err) {
    console.warn('Error reading seal and signatures config:', err);
  }
  return DEFAULT_SEAL_SIGNATURES_CONFIG;
};

export const saveSealAndSignaturesConfig = (config: Partial<SealAndSignaturesConfig>): SealAndSignaturesConfig => {
  const current = getSealAndSignaturesConfig();
  const updated: SealAndSignaturesConfig = { ...current, ...config };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(
      new CustomEvent('school_storage_update', {
        detail: { key: STORAGE_KEY, value: JSON.stringify(updated) },
      })
    );
  } catch (err) {
    console.warn('Error saving seal and signatures config:', err);
  }
  return updated;
};
