/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Grade } from '../types';

export type GradePartKey = 'oralScore' | 'homeworkScore' | 'quizScore' | 'total';

function isValidNumber(val: unknown): val is number {
  return typeof val === 'number' && !Number.isNaN(val);
}

export function hasSubGradeParts(g?: Partial<Grade> | null): boolean {
  if (!g) return false;
  return (
    isValidNumber(g.oralScore) ||
    isValidNumber(g.homeworkScore) ||
    isValidNumber(g.quizScore)
  );
}

export function computeGradeTotal(g?: Partial<Grade> | null): number | null {
  if (!g) return null;
  if (hasSubGradeParts(g)) {
    const sum =
      (isValidNumber(g.oralScore) ? g.oralScore : 0) +
      (isValidNumber(g.homeworkScore) ? g.homeworkScore : 0) +
      (isValidNumber(g.quizScore) ? g.quizScore : 0);
    return Math.round(sum * 100) / 100;
  }
  if (isValidNumber(g.score)) {
    return g.score;
  }
  return null;
}

export function applyGradePartUpdate(
  prev: Grade[],
  params: {
    studentId: string;
    subject: string;
    month: string;
    part: GradePartKey;
    value: number | null;
    maxScore: number;
    teacherId: string;
    idPrefix: string;
    matchEmptyMonth?: boolean;
  }
): Grade[] {
  const {
    studentId,
    subject,
    month,
    part,
    value,
    maxScore,
    teacherId,
    idPrefix,
    matchEmptyMonth = false
  } = params;

  const copy = [...prev];
  const existingIdx = copy.findIndex(
    (g) =>
      g.studentId === studentId &&
      g.subject === subject &&
      (g.examName === month || (matchEmptyMonth && !g.examName))
  );

  if (part === 'total') {
    if (value === null) {
      if (existingIdx !== -1) {
        copy.splice(existingIdx, 1);
      }
      return copy;
    }

    if (existingIdx !== -1) {
      copy[existingIdx] = {
        ...copy[existingIdx],
        examName: copy[existingIdx].examName || month,
        score: value,
        updatedAt: Date.now()
      };
    } else {
      copy.push({
        id: `${idPrefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        studentId,
        subject,
        examName: month,
        score: value,
        maxScore,
        date: new Date().toISOString().split('T')[0],
        teacherId,
        updatedAt: Date.now()
      });
    }
    return copy;
  }

  const base: Grade =
    existingIdx !== -1
      ? { ...copy[existingIdx], examName: copy[existingIdx].examName || month, updatedAt: Date.now() }
      : {
          id: `${idPrefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          studentId,
          subject,
          examName: month,
          score: 0,
          maxScore,
          date: new Date().toISOString().split('T')[0],
          teacherId,
          oralScore: null,
          homeworkScore: null,
          quizScore: null,
          updatedAt: Date.now()
        };

  base[part] = value;

  if (!hasSubGradeParts(base)) {
    if (existingIdx !== -1) {
      copy.splice(existingIdx, 1);
    }
    return copy;
  }

  const total = computeGradeTotal(base) ?? 0;
  base.score = total;
  base.updatedAt = Date.now();

  if (existingIdx !== -1) {
    copy[existingIdx] = base;
  } else {
    copy.push(base);
  }

  return copy;
}

const isEnglishSubjectName = (s: string): boolean => {
  const norm = (s || '').trim().toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة$/, 'ه');
  return (
    norm.includes('انكليز') ||
    norm.includes('انجليز') ||
    norm.includes('اجنبي') ||
    norm.includes('english') ||
    norm === 'لغه' ||
    norm === 'اللغه' ||
    norm === 'لغة' ||
    norm === 'اللغة'
  );
};

const isArabicSubjectName = (s: string): boolean => {
  const norm = (s || '').trim().toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة$/, 'ه');
  return norm.includes('عرب') || norm === 'لغه عربيه' || norm === 'اللغه العربيه';
};

const isMathSubjectName = (s: string): boolean => {
  const norm = (s || '').trim().toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة$/, 'ه');
  return norm.includes('رياض') || norm.includes('حساب');
};

const isScienceSubjectName = (s: string): boolean => {
  const norm = (s || '').trim().toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة$/, 'ه');
  return norm.includes('علوم') || norm.includes('فيزيا') || norm.includes('كيميا') || norm.includes('احيا');
};

const isReligionSubjectName = (s: string): boolean => {
  const norm = (s || '').trim().toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة$/, 'ه');
  return (
    norm.includes('اسلام') ||
    norm.includes('ديان') ||
    norm.includes('دين') ||
    norm.includes('فقه') ||
    norm.includes('توحيد') ||
    norm.includes('قران')
  );
};

const isSocialSubjectName = (s: string): boolean => {
  const norm = (s || '').trim().toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة$/, 'ه');
  return norm.includes('اجتماع') || norm.includes('تاريخ') || norm.includes('جغرافي') || norm.includes('وطني');
};

export const normalizeSubjectName = (str: string): string => {
  return (str || '')
    .trim()
    .toLowerCase()
    .replace(/^ال/, '')
    .replace(/^تربية\s+/, '')
    .replace(/^لغة\s+/, '')
    .replace(/ة$/, 'ه')
    .replace(/[أإآ]/g, 'ا')
    .replace(/\s+/g, '');
};

/**
 * Unified canonical subject matcher shared by DirectorPortal and ParentPortal.
 */
export const matchSubjectName = (a: string, b: string): boolean => {
  if (!a || !b) return false;
  if (a.trim() === b.trim()) return true;

  if (isEnglishSubjectName(a) && isEnglishSubjectName(b)) return true;
  if ((isArabicSubjectName(a) && isEnglishSubjectName(b)) || (isEnglishSubjectName(a) && isArabicSubjectName(b))) {
    return false;
  }
  if (isArabicSubjectName(a) && isArabicSubjectName(b)) return true;
  if (isMathSubjectName(a) && isMathSubjectName(b)) return true;
  if (isScienceSubjectName(a) && isScienceSubjectName(b)) return true;
  if (isReligionSubjectName(a) && isReligionSubjectName(b)) return true;
  if (isSocialSubjectName(a) && isSocialSubjectName(b)) return true;

  const na = normalizeSubjectName(a);
  const nb = normalizeSubjectName(b);
  if (na === nb) return true;
  if (na.length >= 3 && nb.length >= 3 && (na.includes(nb) || nb.includes(na))) return true;

  return false;
};

/**
 * Official school estimation scale shared across Director table, Firestore summary, and Parent card.
 */
export function getEstimationFromAverage(avgNum: number): {
  label: string;
  emojiLabel: string;
  cardLabel: string;
} {
  if (avgNum > 90) {
    return { label: 'ممتاز', emojiLabel: 'ممتاز 🌟', cardLabel: 'ممتاز 🌟' };
  }
  if (avgNum > 80) {
    return { label: 'جيد جداً', emojiLabel: 'جيد جداً ✨', cardLabel: 'جيد جداً 🎈' };
  }
  if (avgNum > 60) {
    return { label: 'جيد', emojiLabel: 'جيد 👍', cardLabel: 'جيد 👍' };
  }
  if (avgNum > 40) {
    return { label: 'وسط', emojiLabel: 'وسط 🟢', cardLabel: 'وسط 🟢' };
  }
  return { label: 'ضعيف', emojiLabel: 'ضعيف 🔴', cardLabel: 'ضعيف 🔴' };
}

