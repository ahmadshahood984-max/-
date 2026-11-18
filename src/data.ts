/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Teacher, Student, Parent, Class, Attendance, Grade, Announcement, Message, AbsenceExcuse } from './types';

export const INITIAL_ATTENDANCE: Attendance[] = [];
export const DEFAULT_EVALUATION_MONTH: string = 'التاسع';
export const INITIAL_ANNOUNCEMENTS: Announcement[] = [];
export const INITIAL_MESSAGES: Message[] = [];
export const INITIAL_EXCUSES: AbsenceExcuse[] = [];

export interface SeedBundle {
  classes: Class[];
  teachers: Teacher[];
  parents: Parent[];
  students: Student[];
}

export interface BackupSeedBundle {
  grades: Grade[];
  sentGradeSheets: any[];
  monthlyEvaluations: Record<string, any>;
  currentMonth: string;
}

let seedBundlePromise: Promise<SeedBundle> | null = null;
let backupBundlePromise: Promise<BackupSeedBundle> | null = null;

/**
 * Dynamically loads static school seed data (~228KB) only when needed (first visit / reset / fallback lookup)
 * so returning visits and initial render do not parse it synchronously.
 */
export function loadInitialSeedBundle(): Promise<SeedBundle> {
  if (!seedBundlePromise) {
    seedBundlePromise = import('./seedData.json').then((mod) => {
      const seedData = (mod as any).default || mod;
      return {
        classes: (seedData.classes || []) as Class[],
        teachers: (seedData.teachers || []) as Teacher[],
        parents: (seedData.parents || []) as Parent[],
        students: (seedData.students || []) as Student[],
      };
    });
  }
  return seedBundlePromise;
}

/**
 * Dynamically loads fallback Firestore backup JSON (~636KB) only when local/cloud grade records are empty.
 */
export function loadFirestoreBackupBundle(): Promise<BackupSeedBundle> {
  if (!backupBundlePromise) {
    backupBundlePromise = import('./firestoreBackup.json').then((mod) => {
      const firestoreBackup = (mod as any).default || mod;
      return {
        grades: (firestoreBackup.grades || []) as Grade[],
        sentGradeSheets: (firestoreBackup.sentGradeSheets || []) as any[],
        monthlyEvaluations: (firestoreBackup.monthlyEvaluations || {}) as Record<string, any>,
        currentMonth: firestoreBackup.currentMonth || 'التاسع',
      };
    });
  }
  return backupBundlePromise;
}
