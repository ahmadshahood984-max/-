/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { db } from './firebase';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  setDoc, 
  getDoc,
  orderBy
} from 'firebase/firestore';
import { Grade } from '../types';
import { trackFirestoreRead, trackFirestoreWrite } from './firestoreTracker';
import { isFirestoreQuotaExceeded, markFirestoreQuotaExceeded, isQuotaError } from './quotaManager';

/**
 * Normalizes identifier string for reliable comparison
 */
function normalizeId(id: string | number | undefined | null): string {
  if (id === undefined || id === null) return '';
  return String(id).trim();
}

/**
 * Generates a consistent, deterministic Firestore document ID for a single student grade
 */
export function getStudentGradeDocId(grade: Partial<Grade>): string {
  const sId = normalizeId(grade.studentId);
  const subj = (grade.subject || 'subject').trim().replace(/[\/\s]+/g, '_');
  const exam = (grade.examName || 'exam').trim().replace(/[\/\s]+/g, '_');
  return `${sId}_${subj}_${exam}`;
}

/**
 * On-demand retrieval of grades for a SPECIFIC student ONLY.
 * Uses query scoping: where("studentId", "==", currentUserId).
 * This completely avoids fetching the entire grades collection or whole class,
 * preserving Firestore read quota and eliminating timeout freezes.
 */
export async function fetchStudentGradesOnDemand(
  currentUserId: string,
  term?: string,
  fallbackUnifiedNo?: string
): Promise<Grade[]> {
  const cleanUserId = normalizeId(currentUserId);
  if (!cleanUserId) return [];

  // Check if quota is exceeded
  if (isFirestoreQuotaExceeded()) {
    console.warn('[StudentGrades] Quota exceeded; retrieving from local cache.');
    return getLocalStudentGrades(cleanUserId, fallbackUnifiedNo);
  }

  if (!db) {
    return getLocalStudentGrades(cleanUserId, fallbackUnifiedNo);
  }

  try {
    const gradesRef = collection(db, 'student_grades');

    // Build scoped query: where("studentId", "==", currentUserId)
    let q = term
      ? query(
          gradesRef, 
          where('studentId', '==', cleanUserId), 
          where('term', '==', term)
        )
      : query(
          gradesRef, 
          where('studentId', '==', cleanUserId)
        );

    // Run getDocs with strict 3-second timeout protection
    const snap = await Promise.race([
      getDocs(q),
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
    ]);

    if (snap && !snap.empty) {
      trackFirestoreRead(snap.docs.length);
      const studentGrades: Grade[] = [];
      snap.forEach(docSnap => {
        const d = docSnap.data();
        studentGrades.push({
          id: docSnap.id,
          studentId: d.studentId,
          subject: d.subject,
          examName: d.examName || '',
          score: d.score !== undefined ? d.score : null,
          maxScore: d.maxScore !== undefined ? d.maxScore : 100,
          date: d.date || new Date().toISOString().split('T')[0],
          term: d.term,
          teacherId: d.teacherId,
          classId: d.classId
        });
      });

      console.log(`[StudentGrades] Successfully fetched ${studentGrades.length} grades on-demand for student ${cleanUserId}`);
      
      // Update local storage for this student
      mergeStudentGradesIntoLocalStorage(studentGrades);
      return studentGrades;
    }

    // If query by studentId returned empty and a unifiedNo is provided, query by unifiedNo as well
    if (fallbackUnifiedNo && fallbackUnifiedNo !== cleanUserId) {
      const cleanUnified = normalizeId(fallbackUnifiedNo);
      const qAlt = query(gradesRef, where('studentId', '==', cleanUnified));
      const altSnap = await Promise.race([
        getDocs(qAlt),
        new Promise<null>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500))
      ]);

      if (altSnap && !altSnap.empty) {
        trackFirestoreRead(altSnap.docs.length);
        const altGrades: Grade[] = [];
        altSnap.forEach(docSnap => {
          const d = docSnap.data();
          altGrades.push({
            id: docSnap.id,
            studentId: d.studentId,
            subject: d.subject,
            examName: d.examName || '',
            score: d.score !== undefined ? d.score : null,
            maxScore: d.maxScore !== undefined ? d.maxScore : 100,
            date: d.date || new Date().toISOString().split('T')[0],
            term: d.term,
            teacherId: d.teacherId,
            classId: d.classId
          });
        });
        mergeStudentGradesIntoLocalStorage(altGrades);
        return altGrades;
      }
    }

    // Fallback migration: If student_grades collection does not have records yet for this student,
    // read from local storage or single school_grades doc and seed to student_grades.
    const localGrades = getLocalStudentGrades(cleanUserId, fallbackUnifiedNo);
    if (localGrades.length > 0) {
      // Background seed so future on-demand calls hit student_grades directly
      seedGradesToStudentCollection(localGrades).catch(() => {});
      return localGrades;
    }

  } catch (err: any) {
    if (isQuotaError(err)) {
      markFirestoreQuotaExceeded(err);
    } else {
      console.warn('[StudentGrades] Notice querying on-demand student grades:', err?.message || err);
    }
  }

  // Graceful fallback to local cache
  return getLocalStudentGrades(cleanUserId, fallbackUnifiedNo);
}

/**
 * Reads grades for a specific student from local storage
 */
export function getLocalStudentGrades(studentId: string, unifiedNo?: string): Grade[] {
  try {
    const raw = localStorage.getItem('school_grades');
    if (!raw) return [];
    const all: Grade[] = JSON.parse(raw);
    if (!Array.isArray(all)) return [];

    const targetId = normalizeId(studentId);
    const targetUnified = normalizeId(unifiedNo);

    return all.filter(g => {
      const gStudent = normalizeId(g.studentId);
      if (gStudent === targetId) return true;
      if (targetUnified && gStudent === targetUnified) return true;
      return false;
    });
  } catch {
    return [];
  }
}

/**
 * Merges freshly fetched student grades into localStorage.school_grades safely
 */
function mergeStudentGradesIntoLocalStorage(freshGrades: Grade[]) {
  try {
    const raw = localStorage.getItem('school_grades');
    const existing: Grade[] = raw ? JSON.parse(raw) : [];
    const map = new Map<string, Grade>();

    if (Array.isArray(existing)) {
      existing.forEach(g => {
        const key = `${g.studentId}_${g.subject}_${g.examName || ''}`;
        map.set(key, g);
      });
    }

    freshGrades.forEach(g => {
      const key = `${g.studentId}_${g.subject}_${g.examName || ''}`;
      map.set(key, g);
    });

    const merged = Array.from(map.values());
    localStorage.setItem('school_grades', JSON.stringify(merged));
  } catch (err) {
    console.warn('[StudentGrades] Error merging to local storage:', err);
  }
}

/**
 * Persists a single grade directly to the scoped student_grades collection in Firestore
 */
export async function syncSingleGradeToFirestore(grade: Grade): Promise<boolean> {
  if (!db || isFirestoreQuotaExceeded() || !grade || !grade.studentId) return false;

  try {
    const docId = getStudentGradeDocId(grade);
    const docRef = doc(db, 'student_grades', docId);

    const payload = {
      studentId: normalizeId(grade.studentId),
      subject: grade.subject || '',
      examName: grade.examName || '',
      score: grade.score !== undefined ? grade.score : null,
      maxScore: grade.maxScore !== undefined ? grade.maxScore : 100,
      term: grade.term || (grade.examName ? String(grade.examName) : 'general'),
      date: grade.date || new Date().toISOString().split('T')[0],
      teacherId: grade.teacherId || '',
      classId: grade.classId || '',
      updatedAt: Date.now()
    };

    await setDoc(docRef, payload, { merge: true });
    trackFirestoreWrite(1);
    return true;
  } catch (err: any) {
    if (isQuotaError(err)) {
      markFirestoreQuotaExceeded(err);
    } else {
      console.warn('[StudentGrades] Error syncing single grade:', err?.message || err);
    }
    return false;
  }
}

/**
 * Batch seeds grades to the scoped student_grades collection in Firestore
 */
export async function seedGradesToStudentCollection(grades: Grade[]): Promise<void> {
  if (!db || isFirestoreQuotaExceeded() || !Array.isArray(grades) || grades.length === 0) return;

  try {
    const syncTasks = grades.slice(0, 50).map(g => syncSingleGradeToFirestore(g));
    await Promise.all(syncTasks);
  } catch (err) {
    console.warn('[StudentGrades] Notice during batch seed:', err);
  }
}
