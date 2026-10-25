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
 * Merges a list of students with the base seed list so official students are never lost.
 */
export const mergeStudentsWithSeed = (list: Student[], seed: Student[]): Student[] => {
  const safeList = Array.isArray(list) ? list : [];
  const safeSeed = Array.isArray(seed) ? seed : [];
  if (safeList.length === 0) return safeSeed;

  const existingIds = new Set(safeList.map(s => String(s.id).trim().toLowerCase()));
  const existingUnified = new Set(safeList.map(s => String(s.unifiedNo || s.rollNo || '').trim()).filter(Boolean));
  const merged = [...safeList];

  for (const item of safeSeed) {
    const sId = String(item.id).trim().toLowerCase();
    const sUnif = String(item.unifiedNo || item.rollNo || '').trim();
    if (!existingIds.has(sId) && (!sUnif || !existingUnified.has(sUnif))) {
      merged.push(item);
    }
  }
  return merged;
};

/**
 * Merges classes with base seed classes so official classes are never wiped out.
 */
export const mergeClassesWithSeed = (list: any[], seed: any[]): any[] => {
  const safeList = Array.isArray(list) ? list : [];
  const safeSeed = Array.isArray(seed) ? seed : [];
  if (safeList.length === 0) return safeSeed;

  const existingIds = new Set(safeList.map(c => String(c.id).trim().toLowerCase()));
  const existingNames = new Set(safeList.map(c => (c.name || '').trim().toLowerCase()));
  const merged = [...safeList];

  for (const item of safeSeed) {
    const cId = String(item.id).trim().toLowerCase();
    const cName = (item.name || '').trim().toLowerCase();
    if (!existingIds.has(cId) && !existingNames.has(cName)) {
      merged.push(item);
    }
  }
  return merged;
};

/**
 * Merges teachers with base seed teachers so official teachers are never wiped out.
 */
export const mergeTeachersWithSeed = (list: any[], seed: any[]): any[] => {
  const safeList = Array.isArray(list) ? list : [];
  const safeSeed = Array.isArray(seed) ? seed : [];
  if (safeList.length === 0) return safeSeed;

  const existingIds = new Set(safeList.map(t => String(t.id).trim().toLowerCase()));
  const existingNames = new Set(safeList.map(t => (t.name || '').trim().toLowerCase()));
  const merged = [...safeList];

  for (const item of safeSeed) {
    const tId = String(item.id).trim().toLowerCase();
    const tName = (item.name || '').trim().toLowerCase();
    if (!existingIds.has(tId) && !existingNames.has(tName)) {
      merged.push(item);
    }
  }
  return merged;
};

/**
 * Merges parents with base seed parents.
 */
export const mergeParentsWithSeed = (list: any[], seed: any[]): any[] => {
  const safeList = Array.isArray(list) ? list : [];
  const safeSeed = Array.isArray(seed) ? seed : [];
  if (safeList.length === 0) return safeSeed;

  const existingIds = new Set(safeList.map(p => String(p.id).trim().toLowerCase()));
  const merged = [...safeList];

  for (const item of safeSeed) {
    const pId = String(item.id).trim().toLowerCase();
    if (!existingIds.has(pId)) {
      merged.push(item);
    }
  }
  return merged;
};

/**
 * Generates a collision-free React element key for mapped student lists
 */
export const getSafeStudentKey = (student: { id?: string } | null | undefined, index: number, prefix: string = 'st'): string => {
  const sid = student?.id ? String(student.id).trim() : 'item';
  return `${prefix}_${sid}_${index}`;
};

