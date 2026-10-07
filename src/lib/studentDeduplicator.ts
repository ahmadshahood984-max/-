import { Student } from '../types';

/**
 * Sanitizes and deduplicates an array of students.
 * - Filters out invalid items.
 * - Merges/removes exact duplicate records (same student registered more than once).
 * - Enforces strict uniqueness of `id` for every student in the array.
 * - Guarantees `unifiedNo` is set consistently from `unifiedNo` or `rollNo`.
 */
export const sanitizeAndDeduplicateStudents = (rawList: Student[]): Student[] => {
  if (!Array.isArray(rawList)) return [];

  const seenIds = new Set<string>();
  const seenEntities = new Set<string>();
  const cleaned: Student[] = [];

  for (let i = 0; i < rawList.length; i++) {
    const s = rawList[i];
    if (!s || typeof s !== 'object') continue;

    const trimmedName = (s.name || '').trim();
    if (!trimmedName) continue;

    const normName = trimmedName.toLowerCase().replace(/\s+/g, ' ');
    const normClass = (s.classId || '').trim();
    const normRoll = String(s.unifiedNo || s.rollNo || '').trim();

    // Check for exact duplicate student records in the same class
    const entitySignature = `${normName}__${normClass}__${normRoll}`;
    if (seenEntities.has(entitySignature)) {
      continue;
    }
    seenEntities.add(entitySignature);

    let finalId = s.id ? String(s.id).trim() : '';

    // If ID is missing or has already been used by another student, assign a new unique ID
    if (!finalId || seenIds.has(finalId)) {
      finalId = `s_${i + 1}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
    }
    seenIds.add(finalId);

    cleaned.push({
      ...s,
      id: finalId,
      name: trimmedName,
      unifiedNo: s.unifiedNo || s.rollNo || '',
      rollNo: s.rollNo || s.unifiedNo || ''
    });
  }

  return cleaned;
};

/**
 * Generates a collision-free React element key for mapped student lists
 */
export const getSafeStudentKey = (student: { id?: string } | null | undefined, index: number, prefix: string = 'st'): string => {
  const sid = student?.id ? String(student.id).trim() : 'item';
  return `${prefix}_${sid}_${index}`;
};
