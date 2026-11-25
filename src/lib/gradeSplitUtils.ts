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
