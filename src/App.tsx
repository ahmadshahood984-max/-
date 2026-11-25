/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, Suspense } from 'react';
import { 
  Teacher, 
  Student, 
  Parent, 
  Class, 
  Attendance, 
  Grade, 
  Announcement, 
  Message, 
  AbsenceExcuse,
  ExamQuestionPaper
} from './types';
import { 
  INITIAL_ATTENDANCE, 
  INITIAL_ANNOUNCEMENTS, 
  INITIAL_MESSAGES, 
  INITIAL_EXCUSES,
  loadInitialSeedBundle,
  loadFirestoreBackupBundle
} from './data';
const DirectorPortal = React.lazy(() => import('./components/DirectorPortal'));
const TeacherPortal = React.lazy(() => import('./components/TeacherPortal'));
const ParentPortal = React.lazy(() => import('./components/ParentPortal'));
import PortalDesignerBadge from './components/PortalDesignerBadge';
import { 
  sanitizeAndDeduplicateStudents, 
  mergeStudentsWithSeed, 
  mergeClassesWithSeed, 
  mergeTeachersWithSeed, 
  mergeParentsWithSeed 
} from './lib/studentDeduplicator';
import { safeShowNotification } from './lib/notificationHelper';
import { sendParentPushNotification, sendBroadcastPushNotification } from './lib/pushDispatcher';
import { 
  persistDirectToFirestore, 
  safeDispatchStorageUpdate,
  saveSyncedLocalOnly,
  hydrateFromOfflineVault,
  saveLocalSeedWithoutCloudWrite,
  ensureAllRealtimeListeners,
  ensureParentRealtimeListeners,
  deduplicateGradeSheetsPreservingTeachers,
  syncLivePortalDataFromServer,
  syncEvaluationMonthConfigFromServer,
  filterOutDeletedEntities,
  filterOutDeletedMonthsFromSheets,
  getDeletedRecordsMap,
  getGradeTimestampMs,
  unmarkDeletedEvaluationMonth,
  hasPortalBaselineCache,
  FAST_LIVE_SYNC_KEYS,
  PARENT_FAST_LIVE_KEYS
} from './lib/firebaseSync';
import { fetchGradeReportsFromFirestore } from './lib/gradeReportsFirestore';
import { syncStudentsDirectoryToFirestore } from './lib/parentStudentQuery';
import { isFirestoreQuotaExceeded, resetFirestoreQuotaBreaker } from './lib/quotaManager';
import { 
  Building, 
  Users, 
  GraduationCap, 
  ArrowLeftRight, 
  Activity,
  Sparkles,
  Info,
  Lock,
  Bell,
  Smartphone,
  X,
  ExternalLink,
  Copy,
  Share2,
  Menu,
  Laptop,
  Monitor,
  Download,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Live Event log interface
interface SchoolEvent {
  id: string;
  text: string;
  time: string;
  type: 'success' | 'info' | 'warning' | 'primary';
}

function safeParseStorageArray<T>(key: string, fallback: T[] = []): T[] {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return fallback;
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export default function App() {
  // --- Persistent State Hooks (instant read from localStorage; seed/cloud merged asynchronously after first paint) ---
  const [teachers, setTeachers] = useState<Teacher[]>(() => filterOutDeletedEntities('teachers', safeParseStorageArray<Teacher>('school_teachers')));
  const [classes, setClasses] = useState<Class[]>(() => filterOutDeletedEntities('classes', safeParseStorageArray<Class>('school_classes')));
  const [parents, setParents] = useState<Parent[]>(() => filterOutDeletedEntities('parents', safeParseStorageArray<Parent>('school_parents')));
  const [students, setStudents] = useState<Student[]>(() => filterOutDeletedEntities('students', safeParseStorageArray<Student>('school_students')));

  const studentsRef = React.useRef<Student[]>(students);
  studentsRef.current = students;
  const parentsRef = React.useRef<Parent[]>(parents);
  parentsRef.current = parents;
  const classesRef = React.useRef<Class[]>(classes);
  classesRef.current = classes;

  // Safe wrapper that enforces deduplication and unique keys across all portals
  const safeSetStudents: React.Dispatch<React.SetStateAction<Student[]>> = (action) => {
    const prev = studentsRef.current;
    const nextRaw = typeof action === 'function' ? action(prev) : action;
    const cleanList = sanitizeAndDeduplicateStudents(Array.isArray(nextRaw) ? nextRaw : []);
    const sorted = cleanList.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
    studentsRef.current = sorted;
    setStudents(sorted);
    try {
      localStorage.setItem('school_students', JSON.stringify(sorted));
    } catch (err) {
      console.warn('Failed to persist students to localStorage', err);
    }
  };

  const [attendance, setAttendance] = useState<Attendance[]>(() => safeParseStorageArray<Attendance>('school_attendance', INITIAL_ATTENDANCE));
  const [grades, setGrades] = useState<Grade[]>(() => safeParseStorageArray<Grade>('school_grades'));
  const [announcements, setAnnouncements] = useState<Announcement[]>(() => safeParseStorageArray<Announcement>('school_announcements', INITIAL_ANNOUNCEMENTS));
  const announcementsRef = React.useRef<Announcement[]>(announcements);
  announcementsRef.current = announcements;
  const [messages, setMessages] = useState<Message[]>(() => safeParseStorageArray<Message>('school_messages', INITIAL_MESSAGES));
  const [excuses, setExcuses] = useState<AbsenceExcuse[]>(() => safeParseStorageArray<AbsenceExcuse>('school_excuses', INITIAL_EXCUSES));

  const [directorPassword, setDirectorPassword] = useState<string>(() => {
    const saved = localStorage.getItem('school_director_password');
    return saved || '123';
  });

  const [appIcon, setAppIcon] = useState<string>(() => {
    return localStorage.getItem('school_app_icon') || '';
  });

  const [examQuestions, setExamQuestions] = useState<ExamQuestionPaper[]>(() =>
    safeParseStorageArray<ExamQuestionPaper>('school_exam_questions')
  );

  const saveExamQuestionPaper = async (paper: ExamQuestionPaper) => {
    const currentPapers = examQuestions.length > 0 ? examQuestions : safeParseStorageArray<ExamQuestionPaper>('school_exam_questions');
    const idx = currentPapers.findIndex(p => p.id === paper.id);
    const updatedPapers = idx >= 0
      ? currentPapers.map((p, i) => i === idx ? paper : p)
      : [paper, ...currentPapers];

    setExamQuestions(updatedPapers);
    saveSyncedLocalOnly('school_exam_questions', JSON.stringify(updatedPapers));
    safeDispatchStorageUpdate('school_exam_questions', JSON.stringify(updatedPapers));

    // Cloud and cross-browser synchronization
    await persistDirectToFirestore('school_exam_questions', updatedPapers);

    // If submitted by teacher, immediately notify the Director across all devices/browsers
    if (paper.status === 'submitted') {
      const notifMsg: Message = {
        id: `m_exam_${paper.id}_${Date.now()}`,
        senderId: paper.teacherId || 'teacher',
        senderName: paper.teacherName ? `المعلم ${paper.teacherName}` : 'معلم المادة',
        senderRole: 'teacher',
        receiverId: 'director',
        receiverName: 'المدير العام (إدارة المدرسة)',
        receiverRole: 'director',
        content: `📝 [إشعار أسئلة مذاكرة جديدة]\nقام المعلم (${paper.teacherName || 'المعلم'}) بإرسال ورقة أسئلة مذاكرة (${paper.subject}) للصف (${paper.className}) بعنوان: "${paper.title}".\n📄 جاهزة الآن بملف الأسئلة والمذاكرات للاعتماد الرسمي أو التصدير لوورد.`,
        date: new Date().toISOString(),
        read: false
      };

      setMessages(prev => {
        const filtered = prev.filter(m => !m.id.startsWith(`m_exam_${paper.id}`));
        const updatedMsgs = [notifMsg, ...filtered];
        try {
          localStorage.setItem('school_messages', JSON.stringify(updatedMsgs));
        } catch {}
        persistDirectToFirestore('school_messages', updatedMsgs);
        safeDispatchStorageUpdate('school_messages', JSON.stringify(updatedMsgs));
        return updatedMsgs;
      });

      logEvent(`قام المعلم ${paper.teacherName || 'المعلم'} بإرسال ورقة أسئلة (${paper.subject}) للإدارة للاعتماد`, 'primary');
    } else if (paper.status === 'approved' && paper.teacherId) {
      // If director approved the paper, notify the teacher
      const approvalMsg: Message = {
        id: `m_apprv_${paper.id}_${Date.now()}`,
        senderId: 'director',
        senderName: 'المدير العام (إدارة المدرسة)',
        senderRole: 'director',
        receiverId: paper.teacherId,
        receiverName: paper.teacherName,
        receiverRole: 'teacher',
        content: `✅ [اعتماد ورقة الأسئلة]\nتم اعتماد نموذج أسئلة (${paper.subject}) للصف (${paper.className}) بعنوان: "${paper.title}" رسمياً من قبل الإدارة. يمكنك الآن طباعتها وتوزيعها على الطلاب.`,
        date: new Date().toISOString(),
        read: false
      };

      setMessages(prev => {
        const filtered = prev.filter(m => !m.id.startsWith(`m_apprv_${paper.id}`));
        const updatedMsgs = [approvalMsg, ...filtered];
        try {
          localStorage.setItem('school_messages', JSON.stringify(updatedMsgs));
        } catch {}
        persistDirectToFirestore('school_messages', updatedMsgs);
        safeDispatchStorageUpdate('school_messages', JSON.stringify(updatedMsgs));
        return updatedMsgs;
      });
    }
  };

  const deleteExamQuestionPaper = async (id: string) => {
    const currentPapers = examQuestions.length > 0 ? examQuestions : safeParseStorageArray<ExamQuestionPaper>('school_exam_questions');
    const updatedPapers = currentPapers.filter(p => p.id !== id);
    setExamQuestions(updatedPapers);
    const serialized = JSON.stringify(updatedPapers);
    saveSyncedLocalOnly('school_exam_questions', serialized);
    safeDispatchStorageUpdate('school_exam_questions', serialized);
    await persistDirectToFirestore('school_exam_questions', updatedPapers);
  };

  // Simulator Active Portal: 'director' | 'teacher' | 'parent'
  const [activePortal, setActivePortal] = useState<'director' | 'teacher' | 'parent'>(() => {
    const params = new URLSearchParams(window.location.search);
    let portalParam = params.get('portal') || params.get('role') || params.get('p');
    if (!portalParam && typeof window !== 'undefined' && window.location.hash) {
      const hash = window.location.hash;
      if (hash.includes('portal=teacher') || hash.includes('role=teacher') || hash.includes('teacher')) {
        portalParam = 'teacher';
      } else if (hash.includes('portal=parent') || hash.includes('role=parent') || hash.includes('parent')) {
        portalParam = 'parent';
      } else if (hash.includes('portal=director') || hash.includes('role=director') || hash.includes('director')) {
        portalParam = 'director';
      }
    }
    if (portalParam === 'teacher' || portalParam === 'parent' || portalParam === 'director') {
      try {
        localStorage.setItem('school_active_portal', portalParam);
      } catch {}
      return portalParam as 'director' | 'teacher' | 'parent';
    }
    // If URL has unified, roll, or student, automatically open Parent Portal directly
    if (params.get('unified') || params.get('roll') || params.get('student') || params.get('studentId')) {
      try {
        localStorage.setItem('school_active_portal', 'parent');
      } catch {}
      return 'parent';
    }
    return 'director';
  });

  // Check if portal is locked based on URL parameter
  const [isPortalLocked] = useState<boolean>(() => {
    const params = new URLSearchParams(window.location.search);
    let portalParam = params.get('portal') || params.get('role') || params.get('p');
    if (!portalParam && typeof window !== 'undefined' && window.location.hash) {
      const hash = window.location.hash;
      if (hash.includes('portal=teacher') || hash.includes('role=teacher') || hash.includes('teacher')) {
        portalParam = 'teacher';
      } else if (hash.includes('portal=parent') || hash.includes('role=parent') || hash.includes('parent')) {
        portalParam = 'parent';
      } else if (hash.includes('portal=director') || hash.includes('role=director') || hash.includes('director')) {
        portalParam = 'director';
      }
    }
    return portalParam === 'teacher' || portalParam === 'parent' || portalParam === 'director' || !!(params.get('unified') || params.get('roll') || params.get('student') || params.get('studentId'));
  });

  const [isPortalSelectorOpen, setIsPortalSelectorOpen] = useState(false);

  // Live System Events state
  const [events, setEvents] = useState<SchoolEvent[]>([
    { id: '1', text: 'تم تشغيل المنصة المدرسية الموحدة وتوصيل التطبيقات الثلاثة', time: 'الآن', type: 'success' },
    { id: '2', text: 'مزامنة وتوصيل قاعدة البيانات المحلية بنجاح', time: 'قبل دقيقة', type: 'info' }
  ]);

  // Help modal for configuring and testing notifications
  const [showNotificationHelper, setShowNotificationHelper] = useState<boolean>(false);

  const [isManualSyncing, setIsManualSyncing] = useState(false);

  const handleManualCrossDeviceSync = async () => {
    if (isManualSyncing) return;
    setIsManualSyncing(true);
    try {
      if (isFirestoreQuotaExceeded()) {
        resetFirestoreQuotaBreaker();
      }
      const targetKeys = activePortal === 'parent' ? PARENT_FAST_LIVE_KEYS : FAST_LIVE_SYNC_KEYS;
      const syncTasks: Promise<any>[] = [
        syncEvaluationMonthConfigFromServer({ force: true }),
        syncLivePortalDataFromServer({ keys: targetKeys, bypassCache: true, forceServer: true })
      ];
      if (activePortal !== 'parent') {
        syncTasks.push(fetchGradeReportsFromFirestore({ force: true }));
      }
      await Promise.all(syncTasks);
      if (activePortal === 'parent') {
        window.dispatchEvent(new CustomEvent('school_force_parent_refresh'));
      }
      reloadFromLocalStorageRef.current?.();
    } catch (err) {
      console.warn('Manual cross-device sync notice:', err);
    } finally {
      setIsManualSyncing(false);
    }
  };

  const reloadFromLocalStorageRef = React.useRef<((allowSeedFallback?: boolean) => void) | null>(null);
  const isFirstPortalEffectRef = React.useRef(true);
  useEffect(() => {
    saveLocalSeedWithoutCloudWrite('school_active_portal', activePortal);
    if (isFirstPortalEffectRef.current) {
      isFirstPortalEffectRef.current = false;
      return;
    }
    if (activePortal === 'director' || activePortal === 'teacher') {
      ensureAllRealtimeListeners();
      if (!hasPortalBaselineCache(false)) {
        syncLivePortalDataFromServer({ keys: FAST_LIVE_SYNC_KEYS }).catch(() => {});
      }
    } else if (activePortal === 'parent') {
      ensureParentRealtimeListeners();
    }
    reloadFromLocalStorageRef.current?.(false);
  }, [activePortal]);

  // Listen to remote changes via Firebase Sync and update React states in real-time
  useEffect(() => {
    const handleStorageUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<{ key: string; value: string }>;
      const { key, value } = customEvent.detail;
      
      try {
        const parsed = JSON.parse(value);
        switch (key) {
          case 'school_teachers':
            setTeachers(filterOutDeletedEntities('teachers', Array.isArray(parsed) ? parsed : []));
            break;
          case 'school_classes':
            setClasses(filterOutDeletedEntities('classes', Array.isArray(parsed) ? parsed : []));
            break;
          case 'school_parents':
            setParents(filterOutDeletedEntities('parents', Array.isArray(parsed) ? parsed : []));
            break;
          case 'school_students': {
            const cleanList = sanitizeAndDeduplicateStudents(
              filterOutDeletedEntities('students', Array.isArray(parsed) ? parsed : [])
            );
            setStudents(cleanList.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar')));
            break;
          }
          case 'school_deleted_records': {
            const delMap = getDeletedRecordsMap();
            setTeachers(prev => filterOutDeletedEntities('teachers', prev, delMap));
            setClasses(prev => filterOutDeletedEntities('classes', prev, delMap));
            setParents(prev => filterOutDeletedEntities('parents', prev, delMap));
            setStudents(prev => filterOutDeletedEntities('students', prev, delMap));
            const delGrades = delMap.grades || {};
            if (Object.keys(delGrades).length > 0) {
              setGrades(prev => prev.filter(g => {
                const gid = g?.id ? String(g.id).trim() : '';
                if (!gid || !delGrades[gid]) return true;
                return getGradeTimestampMs(g) > delGrades[gid];
              }));
            }
            break;
          }
          case 'school_attendance':
            setAttendance(parsed);
            break;
          case 'school_grades':
            setGrades(parsed);
            break;
          case 'school_announcements':
            setAnnouncements(parsed);
            break;
          case 'school_messages':
            setMessages(parsed);
            break;
          case 'school_excuses':
            setExcuses(parsed);
            break;
          case 'school_director_password':
            setDirectorPassword(value);
            break;
          case 'school_app_icon':
            setAppIcon(value || '');
            break;
          case 'school_exam_questions':
            setExamQuestions(parsed);
            break;
        }
      } catch (err) {
        if (key === 'school_director_password') {
          setDirectorPassword(value);
        } else if (key === 'school_app_icon') {
          setAppIcon(value || '');
        } else {
          console.warn('Error parsing storage update in App.tsx', err);
        }
      }
    };

    window.addEventListener('school_storage_update', handleStorageUpdate);

    // Reload from localStorage helper (used after async hydration/cache sync finishes)
    const reloadFromLocalStorage = async (allowSeedFallback: boolean = false) => {
      const savedTeachers = filterOutDeletedEntities('teachers', safeParseStorageArray<Teacher>('school_teachers'));
      const savedClasses = filterOutDeletedEntities('classes', safeParseStorageArray<Class>('school_classes'));
      const savedParents = filterOutDeletedEntities('parents', safeParseStorageArray<Parent>('school_parents'));
      const savedStudents = filterOutDeletedEntities('students', safeParseStorageArray<Student>('school_students'));
      const savedGrades = safeParseStorageArray<Grade>('school_grades');
      const savedAtt = safeParseStorageArray<Attendance>('school_attendance');
      const savedAnn = safeParseStorageArray<Announcement>('school_announcements');
      const savedMsgs = safeParseStorageArray<Message>('school_messages');
      const savedExc = safeParseStorageArray<AbsenceExcuse>('school_excuses');
      const savedExams = safeParseStorageArray<ExamQuestionPaper>('school_exam_questions');

      if (savedTeachers.length > 0 || localStorage.getItem('school_teachers') === '[]') setTeachers(savedTeachers);
      if (savedClasses.length > 0 || localStorage.getItem('school_classes') === '[]') setClasses(savedClasses);
      if (savedParents.length > 0 || localStorage.getItem('school_parents') === '[]') setParents(savedParents);
      if (savedStudents.length > 0) {
        const cleanList = sanitizeAndDeduplicateStudents(savedStudents);
        setStudents(cleanList.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar')));
      } else if (localStorage.getItem('school_students') === '[]') {
        setStudents([]);
      }
      if (savedAtt.length > 0 || (!allowSeedFallback && localStorage.getItem('school_attendance') === '[]')) setAttendance(savedAtt);
      if (savedGrades.length > 0 || (!allowSeedFallback && localStorage.getItem('school_grades') === '[]')) setGrades(savedGrades);
      if (savedAnn.length > 0 || (!allowSeedFallback && localStorage.getItem('school_announcements') === '[]')) setAnnouncements(savedAnn);
      if (savedMsgs.length > 0 || (!allowSeedFallback && localStorage.getItem('school_messages') === '[]')) setMessages(savedMsgs);
      if (savedExc.length > 0 || (!allowSeedFallback && localStorage.getItem('school_excuses') === '[]')) setExcuses(savedExc);
      if (savedExams.length > 0 || (!allowSeedFallback && localStorage.getItem('school_exam_questions') === '[]')) setExamQuestions(savedExams);

      const savedPwd = localStorage.getItem('school_director_password');
      if (savedPwd) {
        try {
          setDirectorPassword(savedPwd.startsWith('"') ? JSON.parse(savedPwd) : savedPwd);
        } catch {
          setDirectorPassword(savedPwd);
        }
      }

      const savedIcon = localStorage.getItem('school_app_icon');
      if (savedIcon !== null) setAppIcon(savedIcon);

      // Deduplicate sent grade sheets cleanly locally without triggering spurious cloud writes on passive reads
      const savedSheetsRaw = localStorage.getItem('school_sent_grade_sheets');
      if (savedSheetsRaw) {
        try {
          const parsedSheets = JSON.parse(savedSheetsRaw);
          if (Array.isArray(parsedSheets) && parsedSheets.length > 0) {
            const deduped = deduplicateGradeSheetsPreservingTeachers(parsedSheets);
            if (deduped.length !== parsedSheets.length) {
              saveLocalSeedWithoutCloudWrite('school_sent_grade_sheets', JSON.stringify(deduped));
            }
          }
        } catch {}
      }

      // Lazy-load default exam samples ONLY if none exist locally after cloud sync
      if (allowSeedFallback && savedExams.length === 0 && localStorage.getItem('school_exam_questions') === null) {
        import('./lib/defaultExamSamples')
          .then(({ getDefaultExamSamples }) => {
            const samples = getDefaultExamSamples();
            saveLocalSeedWithoutCloudWrite('school_exam_questions', JSON.stringify(samples));
            setExamQuestions((prev) => (prev.length === 0 ? samples : prev));
          })
          .catch(() => {});
      }

      // NEVER re-inject static seed data once seed has been applied OR once any core storage key exists (including intentional '[]' deletes!)
      const seedAlreadyApplied = localStorage.getItem('school_seed_applied_v1') === '1';
      const hasAnyCoreStorageKey =
        localStorage.getItem('school_teachers') !== null ||
        localStorage.getItem('school_classes') !== null ||
        localStorage.getItem('school_students') !== null ||
        localStorage.getItem('school_parents') !== null ||
        localStorage.getItem('school_deleted_records') !== null;

      if (seedAlreadyApplied || hasAnyCoreStorageKey) {
        try {
          localStorage.setItem('school_seed_applied_v1', '1');
        } catch {}
      } else if (allowSeedFallback) {
        try {
          const seed = await loadInitialSeedBundle();
          if (savedTeachers.length === 0 && seed.teachers.length > 0) {
            const merged = filterOutDeletedEntities('teachers', mergeTeachersWithSeed(savedTeachers, seed.teachers));
            saveLocalSeedWithoutCloudWrite('school_teachers', JSON.stringify(merged));
            setTeachers(merged);
          }
          if (savedClasses.length === 0 && seed.classes.length > 0) {
            const merged = filterOutDeletedEntities('classes', mergeClassesWithSeed(savedClasses, seed.classes));
            saveLocalSeedWithoutCloudWrite('school_classes', JSON.stringify(merged));
            setClasses(merged);
          }
          if (savedParents.length === 0 && seed.parents.length > 0) {
            const merged = filterOutDeletedEntities('parents', mergeParentsWithSeed(savedParents, seed.parents));
            saveLocalSeedWithoutCloudWrite('school_parents', JSON.stringify(merged));
            setParents(merged);
          }
          if (savedStudents.length === 0 && seed.students.length > 0) {
            const merged = filterOutDeletedEntities('students', mergeStudentsWithSeed(savedStudents, seed.students));
            const cleaned = sanitizeAndDeduplicateStudents(merged).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
            saveLocalSeedWithoutCloudWrite('school_students', JSON.stringify(cleaned));
            setStudents(cleaned);
          }
          try {
            localStorage.setItem('school_seed_applied_v1', '1');
          } catch {}
        } catch {}
      }

      if (allowSeedFallback && savedGrades.length === 0) {
        // First try reconstructing from saved sent sheets, else lazy-load backup JSON strictly locally
        let reconstructed = false;
        if (savedSheetsRaw) {
          try {
            const parsedSheets = JSON.parse(savedSheetsRaw);
            const aliveSheets = Array.isArray(parsedSheets) ? filterOutDeletedMonthsFromSheets(parsedSheets) : [];
            if (aliveSheets.length > 0) {
              const reconstructedGrades: Grade[] = [];
              for (const sheet of aliveSheets) {
                const month = sheet.month || 'التاسع';
                const summaryList = sheet.studentsSummary || (sheet as any).studentResults || [];
                for (const res of summaryList) {
                  if (res.studentId && Array.isArray(res.scores)) {
                    for (const sc of res.scores) {
                      if (sc.subject && sc.score !== null && sc.score !== undefined) {
                        reconstructedGrades.push({
                          id: `g_rec_${res.studentId}_${sc.subject}_${month}`.replace(/\s+/g, '_'),
                          studentId: res.studentId,
                          subject: sc.subject,
                          examName: month,
                          score: Number(sc.score) || 0,
                          maxScore: Number(sc.maxScore) || 100,
                          date: sheet.dateSent ? sheet.dateSent.slice(0, 10) : new Date().toISOString().slice(0, 10),
                          teacherId: 'director',
                          examType: 'monthly'
                        });
                      }
                    }
                  }
                }
              }
              if (reconstructedGrades.length > 0) {
                saveLocalSeedWithoutCloudWrite('school_grades', JSON.stringify(reconstructedGrades));
                setGrades(reconstructedGrades);
                reconstructed = true;
              }
            }
          } catch {}
        }
        if (!reconstructed) {
          loadFirestoreBackupBundle()
            .then((backup) => {
              if (Array.isArray(backup.grades) && backup.grades.length > 0) {
                saveLocalSeedWithoutCloudWrite('school_grades', JSON.stringify(backup.grades));
                setGrades((prev) => (prev.length === 0 ? backup.grades : prev));
              }
            })
            .catch(() => {});
        }
      }
    };

    reloadFromLocalStorageRef.current = (allowSeedFallback: boolean = false) => {
      reloadFromLocalStorage(allowSeedFallback).catch(() => {});
    };

    const handleLiveSyncCompleted = () => {
      reloadFromLocalStorage(false).catch(() => {});
    };
    window.addEventListener('school_live_sync_completed', handleLiveSyncCompleted);

    // Immediately hydrate offline vault for instant first paint; only fetch full baseline if device cache is empty,
    // otherwise rely on delta-only listeners (`updatedAt > since` / `_parent_pulse`) to fetch only new/changed items.
    const startupKeys = activePortal === 'parent' ? PARENT_FAST_LIVE_KEYS : FAST_LIVE_SYNC_KEYS;
    hydrateFromOfflineVault()
      .then(async (restored) => {
        if (restored) reloadFromLocalStorage(false);
        const isParent = activePortal === 'parent';
        if (hasPortalBaselineCache(isParent)) {
          if (isParent) {
            ensureParentRealtimeListeners();
          } else {
            ensureAllRealtimeListeners();
          }
          reloadFromLocalStorage(false);
          return;
        }
        const syncOk = await syncLivePortalDataFromServer({ keys: startupKeys, bypassCache: true, forceServer: true });
        reloadFromLocalStorage(Boolean(syncOk));
      })
      .catch((err) => {
        console.warn('Startup Firestore live sync notice:', err);
        reloadFromLocalStorage(false);
      });

    return () => {
      window.removeEventListener('school_storage_update', handleStorageUpdate);
      window.removeEventListener('school_live_sync_completed', handleLiveSyncCompleted);
    };
  }, []);

  // Save to localStorage whenever state changes with anti-wipe protection
  // If `saved === null` on a fresh browser, seed locally WITHOUT triggering a cloud write before real remote data arrives.
  const prevStateNonEmptyRef = React.useRef<Record<string, boolean>>({});

  useEffect(() => {
    const saved = localStorage.getItem('school_teachers');
    const currentStr = JSON.stringify(teachers);
    const hadItems = !!prevStateNonEmptyRef.current['school_teachers'];
    prevStateNonEmptyRef.current['school_teachers'] = teachers.length > 0;
    if (teachers.length === 0 && saved && saved !== '[]' && !hadItems) return;
    if (saved === null) {
      saveLocalSeedWithoutCloudWrite('school_teachers', currentStr);
      return;
    }
    if (saved !== currentStr) {
      localStorage.setItem('school_teachers', currentStr);
    }
  }, [teachers]);

  useEffect(() => {
    const saved = localStorage.getItem('school_classes');
    const currentStr = JSON.stringify(classes);
    const hadItems = !!prevStateNonEmptyRef.current['school_classes'];
    prevStateNonEmptyRef.current['school_classes'] = classes.length > 0;
    if (classes.length === 0 && saved && saved !== '[]' && !hadItems) return;
    if (saved === null) {
      saveLocalSeedWithoutCloudWrite('school_classes', currentStr);
      return;
    }
    if (saved !== currentStr) {
      localStorage.setItem('school_classes', currentStr);
    }
  }, [classes]);

  useEffect(() => {
    const saved = localStorage.getItem('school_parents');
    const currentStr = JSON.stringify(parents);
    const hadItems = !!prevStateNonEmptyRef.current['school_parents'];
    prevStateNonEmptyRef.current['school_parents'] = parents.length > 0;
    if (parents.length === 0 && saved && saved !== '[]' && !hadItems) return;
    if (saved === null) {
      saveLocalSeedWithoutCloudWrite('school_parents', currentStr);
      return;
    }
    if (saved !== currentStr) {
      localStorage.setItem('school_parents', currentStr);
    }
  }, [parents]);

  useEffect(() => {
    const saved = localStorage.getItem('school_students');
    const currentStr = JSON.stringify(students);
    const hadItems = !!prevStateNonEmptyRef.current['school_students'];
    prevStateNonEmptyRef.current['school_students'] = students.length > 0;
    if (students.length === 0 && saved && saved !== '[]' && !hadItems) return;
    if (saved === null) {
      saveLocalSeedWithoutCloudWrite('school_students', currentStr);
      return;
    }
    if (saved !== currentStr) {
      localStorage.setItem('school_students', currentStr);
    }
  }, [students]);

  useEffect(() => {
    const saved = localStorage.getItem('school_attendance');
    const currentStr = JSON.stringify(attendance);
    const hadItems = !!prevStateNonEmptyRef.current['school_attendance'];
    prevStateNonEmptyRef.current['school_attendance'] = attendance.length > 0;
    if (attendance.length === 0 && saved && saved !== '[]' && !hadItems) return;
    if (saved === null) {
      saveLocalSeedWithoutCloudWrite('school_attendance', currentStr);
      return;
    }
    if (saved !== currentStr) {
      localStorage.setItem('school_attendance', currentStr);
    }
  }, [attendance]);

  useEffect(() => {
    const saved = localStorage.getItem('school_grades');
    const currentStr = JSON.stringify(grades);
    const hadItems = !!prevStateNonEmptyRef.current['school_grades'];
    prevStateNonEmptyRef.current['school_grades'] = grades.length > 0;
    if (grades.length === 0 && saved && saved !== '[]' && !hadItems) return;
    if (saved === null) {
      saveLocalSeedWithoutCloudWrite('school_grades', currentStr);
      return;
    }
    if (saved !== currentStr) {
      localStorage.setItem('school_grades', currentStr);
    }
  }, [grades]);

  useEffect(() => {
    const saved = localStorage.getItem('school_announcements');
    const currentStr = JSON.stringify(announcements);
    const hadItems = !!prevStateNonEmptyRef.current['school_announcements'];
    prevStateNonEmptyRef.current['school_announcements'] = announcements.length > 0;
    if (announcements.length === 0 && saved && saved !== '[]' && !hadItems) return;
    if (saved === null) {
      saveLocalSeedWithoutCloudWrite('school_announcements', currentStr);
      return;
    }
    if (saved !== currentStr) {
      localStorage.setItem('school_announcements', currentStr);
    }
  }, [announcements]);

  useEffect(() => {
    const saved = localStorage.getItem('school_messages');
    const currentStr = JSON.stringify(messages);
    const hadItems = !!prevStateNonEmptyRef.current['school_messages'];
    prevStateNonEmptyRef.current['school_messages'] = messages.length > 0;
    if (messages.length === 0 && saved && saved !== '[]' && !hadItems) return;
    if (saved === null) {
      saveLocalSeedWithoutCloudWrite('school_messages', currentStr);
      return;
    }
    if (saved !== currentStr) {
      localStorage.setItem('school_messages', currentStr);
    }
  }, [messages]);

  useEffect(() => {
    const saved = localStorage.getItem('school_excuses');
    const currentStr = JSON.stringify(excuses);
    const hadItems = !!prevStateNonEmptyRef.current['school_excuses'];
    prevStateNonEmptyRef.current['school_excuses'] = excuses.length > 0;
    if (excuses.length === 0 && saved && saved !== '[]' && !hadItems) return;
    if (saved === null) {
      saveLocalSeedWithoutCloudWrite('school_excuses', currentStr);
      return;
    }
    if (saved !== currentStr) {
      localStorage.setItem('school_excuses', currentStr);
    }
  }, [excuses]);

  useEffect(() => {
    const saved = localStorage.getItem('school_director_password');
    if (saved === null) {
      saveLocalSeedWithoutCloudWrite('school_director_password', directorPassword);
      return;
    }
    if (saved !== directorPassword && directorPassword === '123') {
      return;
    }
    if (saved !== directorPassword) {
      localStorage.setItem('school_director_password', directorPassword);
    }
  }, [directorPassword]);

  // --- Web Audio sound player for WhatsApp feel ---
  const playPingSound = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc1 = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      // WhatsApp dual-tone frequency pair
      osc1.frequency.value = 1000;
      osc2.frequency.value = 1200;

      osc1.type = 'sine';
      osc2.type = 'sine';

      const now = audioCtx.currentTime;
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(0.12, now + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.35);
      osc2.stop(now + 0.35);
    } catch (e) {
      console.warn('AudioContext sound failed or blocked:', e);
    }
  };

  // --- Browser Notification Request ---
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(() => {
    if ('Notification' in window) {
      return Notification.permission;
    }
    return 'default';
  });

  // --- PWA Installation states & hooks ---
  const [pwaPrompt, setPwaPrompt] = useState<any>(() => {
    if (typeof window !== 'undefined') {
      return (window as any).getDeferredPrompt?.() || null;
    }
    return null;
  });
  const [showPwaBanner, setShowPwaBanner] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('school_pwa_banner_dismissed') !== 'true';
    }
    return true;
  });

  useEffect(() => {
    const handlePwaPrompt = () => {
      const prompt = (window as any).getDeferredPrompt?.();
      if (prompt) {
        console.log('[PWA App.tsx] Prompt loaded from custom event');
        setPwaPrompt(prompt);
      }
    };

    window.addEventListener('pwa-prompt-available', handlePwaPrompt);
    // Periodically check if global prompt is populated
    const interval = setInterval(() => {
      const prompt = (window as any).getDeferredPrompt?.();
      if (prompt && !pwaPrompt) {
        setPwaPrompt(prompt);
      }
    }, 1500);

    return () => {
      window.removeEventListener('pwa-prompt-available', handlePwaPrompt);
      clearInterval(interval);
    };
  }, [pwaPrompt]);

  const handleInstallApp = async () => {
    const isIframe = typeof window !== 'undefined' && window.self !== window.top;
    if (isIframe) {
      alert(
        "🔔 لتتمكن من تثبيت التطبيق بنقرة واحدة مباشرة على جهازك، يجب فتح التطبيق خارج نافذة المعاينة المؤطرة (Iframe).\n\n" +
        "سنقوم الآن بفتح التطبيق في صفحة مستقلة كاملة، وعند فتحها ستتمكن من النقر على زر التثبيت وسيعمل مباشرة بنجاح! 🎉"
      );
      window.open(window.location.href, '_blank');
      return;
    }

    if (pwaPrompt) {
      pwaPrompt.prompt();
      const { outcome } = await pwaPrompt.userChoice;
      console.log(`[PWA] Install prompt outcome: ${outcome}`);
      if (outcome === 'accepted') {
        (window as any).clearDeferredPrompt?.();
        setPwaPrompt(null);
        alert('🎉 تهانينا! تم تثبيت تطبيق المدرسة الدولية بنجاح على الشاشة الرئيسية لجهازك.');
      }
    } else {
      setShowNotificationHelper(true);
    }
  };

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      alert('عذراً، متصفحك أو هذا الجهاز لا يدعم الإشعارات الخارجية حالياً.');
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission === 'granted') {
        alert('🔔 تم تفعيل إشعارات الهاتف الخارجية بنجاح! ستصلك التنبيهات والرسائل الفعلية فور إرسالها.');
      } else if (permission === 'denied') {
        alert('⚠️ تم رفض أو حظر إذن الإشعارات من المتصفح.\n\nلتفعيلها يدوياً:\n1. اضغط على رمز القفل أو علامة التعجب بجوار عنوان الموقع في شريط المتصفح.\n2. ابحث عن خيار "الإشعارات" (Notifications) وقم بتغييره إلى "السماح" (Allow).\n3. أعد تحميل الصفحة وجرب مجدداً!');
      }
    } catch (e) {
      console.error('Error requesting permission', e);
      alert('⚠️ لم نتمكن من فتح نافذة السماح بالإشعارات بسبب قيود الأمان داخل إطار المعاينة (IFrame).\n\n💡 الحل السريع والفعال:\n1. اضغط على زر "فتح في تبويب جديد" أعلى يسار الشاشة لتشغيل التطبيق بشكل مباشر بمتصفحك.\n2. انقر على زر "تفعيل الإشعارات" هناك وستظهر لك نافذة السماح فوراً كالهاتف!');
    }
  };

  // --- Active Teacher and Parent tracking for accurate recipient counters ---
  const [activeTeacherId, setActiveTeacherId] = useState<string>(() => localStorage.getItem('school_active_teacher_id') || '');
  const [activeParentId, setActiveParentId] = useState<string>('');
  const [activeParentStudentId, setActiveParentStudentId] = useState<string>(() => localStorage.getItem('parent_portal_student_id') || '');

  useEffect(() => {
    const updateActiveIds = () => {
      const tId = localStorage.getItem('school_active_teacher_id') || '';
      setActiveTeacherId(prev => (prev !== tId ? tId : prev));

      const sId = localStorage.getItem('parent_portal_student_id') || '';
      setActiveParentStudentId(prev => (prev !== sId ? sId : prev));
      if (sId) {
        let student = students.find(s => s.id === sId || s.unifiedNo === sId || s.rollNo === sId);
        if (!student) {
          try {
            const rawObj = localStorage.getItem('parent_portal_active_student_obj');
            if (rawObj) {
              const parsed = JSON.parse(rawObj);
              if (parsed && (parsed.id === sId || parsed.unifiedNo === sId || parsed.rollNo === sId)) {
                student = parsed;
              }
            }
          } catch {}
        }
        const newParentId = student?.parentId || '';
        setActiveParentId(prev => (prev !== newParentId ? newParentId : prev));
      } else {
        setActiveParentId(prev => (prev !== '' ? '' : prev));
      }
    };

    updateActiveIds();

    const handleStorage = () => {
      updateActiveIds();
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('school_storage_update', handleStorage);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('school_storage_update', handleStorage);
    };
  }, [students]);

  const getTeacherUnreadCount = () => {
    if (!activeTeacherId) return 0;
    return messages.filter(m =>
      !m.read && (
        m.receiverId === activeTeacherId ||
        m.receiverId === 'all_teachers' ||
        m.receiverId === 'teacher' ||
        (m.receiverRole === 'teacher' && !m.receiverId)
      )
    ).length;
  };

  const getParentUnreadCount = () => {
    if (!activeParentId && !activeParentStudentId) return 0;
    return messages.filter(
      m => ((activeParentId && m.receiverId === activeParentId) ||
            (activeParentStudentId && (m.receiverId === activeParentStudentId || m.studentId === activeParentStudentId)) ||
            m.receiverId === 'all' ||
            m.receiverId === 'all_cohort_parents' ||
            m.receiverId === 'all_everyone') &&
           !m.read &&
           !m.content.includes('سلوك') &&
           !m.content.includes('تنبيه سلوكي') &&
           !m.content.includes('تصنيف الإشعار: سلوك') &&
           !m.content.includes('تقييم')
    ).length;
  };

  // --- Floating WhatsApp style toast state ---
  const [activeToast, setActiveToast] = useState<{
    id: string;
    senderName: string;
    content: string;
    msgNumber: string;
    studentName?: string;
  } | null>(null);

  const seenMessageIdsRef = React.useRef<Set<string>>(new Set(messages.map(m => m.id)));

  useEffect(() => {
    const seen = seenMessageIdsRef.current;
    const newlyArrived = messages.filter(m => m && m.id && !seen.has(m.id));
    messages.forEach(m => {
      if (m && m.id) seen.add(m.id);
    });

    if (newlyArrived.length > 0) {
      const nowMs = Date.now();
      const RECENT_MSG_WINDOW_MS = 3 * 60 * 1000;
      // Find the newest unread recent message intended for the active portal recipient (never replay historical/test messages)
      const sortedIncoming = [...newlyArrived].sort(
        (a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
      );
      const latest = sortedIncoming.find(m => {
        if (m.read || m.receiverRole === 'parent') return false;
        const msgId = String(m.id || '');
        const msgContent = String(m.content || '');
        if (
          m.category === 'grade_report' ||
          msgId.startsWith('m_grades_') ||
          msgId.startsWith('m_t_appr_') ||
          msgId.startsWith('m_ack_') ||
          msgContent.includes('[إشعار كشف درجات]') ||
          msgContent.includes('[اعتماد كشف الدرجات')
        ) {
          return false;
        }
        const msgTime = new Date(m.date || 0).getTime();
        if (!msgTime || Math.abs(nowMs - msgTime) > RECENT_MSG_WINDOW_MS) return false;
        if (msgContent.includes('تجربة إشعار') || msgContent.includes('تجربة تفعيل النظام')) return false;
        if (activePortal === 'director') return m.receiverRole === 'director' || m.receiverId === 'director';
        if (activePortal === 'teacher') {
          return (
            m.receiverId === activeTeacherId ||
            m.receiverId === 'all_teachers' ||
            m.receiverId === 'teacher' ||
            (m.receiverRole === 'teacher' && (!m.receiverId || !activeTeacherId))
          );
        }
        return false;
      });

      if (latest) {
        const numericId = parseInt(latest.id.replace(/\D/g, ''), 10) || (messages.length + 100);
        const msgNumStr = `${numericId}`;

        const student = students.find(s => s.id === latest.studentId);
        const studentName = student ? student.name : undefined;

        playPingSound();

        setActiveToast({
          id: latest.id,
          senderName: latest.senderName,
          content: latest.content,
          msgNumber: msgNumStr,
          studentName
        });

        const cleanBody = latest.content.replace(/^📢 \[تصنيف الإشعار:[^\]]+\]\n/, '');
        const matchCategory = latest.content.match(/^📢 \[تصنيف الإشعار:\s*([^\]]+)\]/);
        const prefix = matchCategory ? `[${matchCategory[1]}] ` : '';

        safeShowNotification(`💬 رسالة جديدة رقم #${msgNumStr}`, {
          body: `من: ${latest.senderName}\nالموضوع: ${prefix}${cleanBody}`,
          icon: 'https://cdn-icons-png.flaticon.com/512/124/124034.png',
          tag: 'msg-' + latest.id,
          dir: 'rtl'
        });
      }
    }
  }, [messages, students, activePortal, activeTeacherId]);

  // --- Boot Saved System Patches on Startup ---
  useEffect(() => {
    try {
      const stored = localStorage.getItem('system_patches');
      if (stored) {
        const patches: string[] = JSON.parse(stored);
        patches.forEach((codeStr, idx) => {
          try {
            const runner = new Function(codeStr);
            runner();
          } catch (err) {
            console.error(`Error loading stored patch #${idx + 1}:`, err);
          }
        });
      }
    } catch (e) {
      console.warn('Could not read or boot stored system patches:', e);
    }
  }, []);

  // --- Helpers to append live events ---
  const logEvent = (text: string, type: SchoolEvent['type'] = 'info') => {
    const newEvent: SchoolEvent = {
      id: String(Date.now()),
      text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      type
    };
    setEvents(prev => [newEvent, ...prev.slice(0, 8)]);
  };

  // --- Dynamic State Modifiers (Interconnected Actions) ---

  // 1. Director adds a Teacher
  const addTeacher = (teacherData: Omit<Teacher, 'id' | 'joinDate'>) => {
    const id = `t-${Date.now()}`;
    const joinDate = new Date().toISOString().split('T')[0];
    const newTeacher: Teacher = { ...teacherData, id, joinDate };
    
    setTeachers(prev => {
      const updated = [...prev, newTeacher];
      persistDirectToFirestore('school_teachers', updated);
      return updated;
    });
    logEvent(`المدير أضاف المعلم الجديد: ${newTeacher.name} وتخصيص المواد: ${newTeacher.subjects.join(', ')}`, 'success');
  };

  const updateTeacherPassword = (teacherId: string, newPass: string) => {
    setTeachers(prev => {
      const updated = prev.map(t => t.id === teacherId ? { ...t, password: newPass } : t);
      persistDirectToFirestore('school_teachers', updated);
      return updated;
    });
    const teacherName = teachers.find(t => t.id === teacherId)?.name || '';
    logEvent(`المدير قام بتعديل كلمة مرور المعلم: ${teacherName}`, 'success');
  };

  const changeDirectorPassword = (newPass: string) => {
    setDirectorPassword(newPass);
    persistDirectToFirestore('school_director_password', newPass);
    logEvent(`تم تعديل كلمة مرور المدير العام بنجاح`, 'success');
  };

  // 2. Director registers or updates a Student (unified across Manual Add and Student Registration)
  const addStudent = (studentData: Omit<Student, 'id'>, parentData: Omit<Parent, 'id' | 'childrenIds'>) => {
    const currentStudents = studentsRef.current;
    const currentParents = parentsRef.current;
    const currentClasses = classesRef.current;
    const now = Date.now();

    const candidateUnified = String(studentData.unifiedNo || studentData.rollNo || '').trim() || String(currentStudents.length + 1).padStart(3, '0');
    const selectedClass = currentClasses.find(c => c.id === studentData.classId);
    const canonicalShift = selectedClass?.shift || studentData.shift || 'morning';

    // Check if student with same unifiedNo already exists so updating in-place preserves student.id and all linked grades
    const existingByUnified = candidateUnified
      ? currentStudents.find(s => String(s.unifiedNo || s.rollNo || '').trim() === candidateUnified)
      : undefined;

    let studentId = existingByUnified?.id || '';
    if (!studentId) {
      studentId = `s_${now.toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
      while (currentStudents.some(s => s.id === studentId)) {
        studentId = `s_${now.toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
      }
    }

    // Link or create parent cleanly
    const cleanParentPhone = String(parentData.phone || studentData.parentPhone || '').trim();
    const cleanParentName = String(parentData.name || studentData.parentName || '').trim() || `ولي أمر ${studentData.name}`;
    let parentId = existingByUnified?.parentId || '';
    const existingParent = currentParents.find(
      p => (parentId && p.id === parentId) || (cleanParentPhone && p.phone === cleanParentPhone)
    );
    let updatedParentsList: Parent[];

    if (existingParent) {
      parentId = existingParent.id;
      updatedParentsList = currentParents.map(p =>
        p.id === parentId
          ? {
              ...p,
              name: cleanParentName || p.name,
              phone: cleanParentPhone || p.phone,
              childrenIds: [...p.childrenIds.filter(id => id !== studentId), studentId]
            }
          : p
      );
    } else {
      let pId = `p_${now.toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
      while (currentParents.some(p => p.id === pId)) {
        pId = `p_${now.toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
      }
      parentId = pId;
      const newParent: Parent = {
        id: parentId,
        name: cleanParentName,
        email: parentData.email || `${cleanParentName.replace(/\s+/g, '') || 'parent'}@school.edu`,
        phone: cleanParentPhone,
        childrenIds: [studentId]
      };
      updatedParentsList = [...currentParents, newParent];
    }

    parentsRef.current = updatedParentsList;
    setParents(updatedParentsList);
    persistDirectToFirestore('school_parents', updatedParentsList);

    const gender = studentData.gender || existingByUnified?.gender || 'male';
    const canonicalStudent: Student = {
      ...(existingByUnified || {}),
      ...studentData,
      id: studentId,
      name: (studentData.name || existingByUnified?.name || '').trim(),
      classId: studentData.classId || existingByUnified?.classId || '',
      parentId,
      unifiedNo: candidateUnified,
      rollNo: candidateUnified,
      nationalId: studentData.nationalId || existingByUnified?.nationalId || '',
      serialNo: studentData.serialNo || existingByUnified?.serialNo || String(currentStudents.length + 1),
      gender,
      dob: studentData.dob || existingByUnified?.dob || '2015-01-01',
      parentName: cleanParentName,
      parentPhone: cleanParentPhone,
      shift: canonicalShift,
      healthStatus: studentData.healthStatus || existingByUnified?.healthStatus || 'سليم / ممتاز',
      bloodTypeOrHealth: studentData.bloodTypeOrHealth || studentData.healthStatus || existingByUnified?.bloodTypeOrHealth || 'سليم / ممتاز',
      transportation: studentData.transportation || existingByUnified?.transportation || 'حافلة المدرسة',
      booksStatus: studentData.booksStatus || existingByUnified?.booksStatus || 'تم التسليم',
      uniformStatus: studentData.uniformStatus || existingByUnified?.uniformStatus || 'تم التسليم',
      guardianRelation: studentData.guardianRelation || existingByUnified?.guardianRelation || 'أب',
      avatar: studentData.avatar || existingByUnified?.avatar || (gender === 'female' ? '👧' : '👦'),
      photo: studentData.photo || existingByUnified?.photo || '',
      createdAt: existingByUnified?.createdAt || now
    };

    const nextBase = existingByUnified
      ? currentStudents.map(s => (s.id === studentId ? canonicalStudent : s))
      : [...currentStudents, canonicalStudent];
    const sanitized = sanitizeAndDeduplicateStudents(nextBase);
    const sorted = sanitized.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
    studentsRef.current = sorted;
    setStudents(sorted);
    persistDirectToFirestore('school_students', sorted);
    syncStudentsDirectoryToFirestore(sorted).catch(() => {});
    logEvent(`${existingByUnified ? 'تم تحديث بيانات الطالب' : 'تم تسجيل الطالب'}: ${canonicalStudent.name} (الرقم الموحد: ${candidateUnified}) وربطه بولي الأمر: ${cleanParentName}`, 'success');
  };

  // 3. Director or Teacher publishes Announcement
  const addAnnouncement = (announceData: Omit<Announcement, 'id' | 'date'> & { authorName?: string; authorRole?: 'director' | 'teacher'; shift?: 'morning' | 'evening'; skipPushNotification?: boolean }) => {
    const id = `a_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const date = new Date().toISOString().split('T')[0];
    const newAnn: Announcement = {
      target: announceData.target,
      title: announceData.title,
      content: announceData.content,
      id,
      date,
      authorName: announceData.authorName || 'المدير العام',
      authorRole: announceData.authorRole || 'director',
      shift: announceData.shift || 'morning'
    };

    const updated = [newAnn, ...(Array.isArray(announcementsRef.current) ? announcementsRef.current : announcements)];
    announcementsRef.current = updated;
    setAnnouncements(updated);
    persistDirectToFirestore('school_announcements', updated).catch(() => {});
    logEvent(`${newAnn.authorName} نشر تعميماً جديداً: "${newAnn.title}" المستهدف: ${
      newAnn.target === 'all' ? 'الجميع' : newAnn.target === 'teachers' ? 'المعلمون' : 'أولياء الأمور'
    }`, 'primary');

    // Send broadcast push notification to parents only if not already dispatched
    if (!announceData.skipPushNotification && (newAnn.target === 'all' || newAnn.target === 'parents')) {
      const allParentIds = parents.map(p => p.id);
      sendBroadcastPushNotification(allParentIds, {
        title: `📢 تعميم مدرسي: ${newAnn.title}`,
        body: newAnn.content.slice(0, 150),
        category: 'announcement'
      });
    }
  };

  // 4. Director approves/rejects Absence Excuse (INTERCONNECTED LOGIC)
  const updateExcuseStatus = (id: string, status: 'approved' | 'rejected', notes?: string) => {
    setExcuses(prev => {
      const updatedExcuses = prev.map(exc => {
        if (exc.id === id) {
          const updated = { ...exc, status, notes };

          // If approved, dynamically update attendance records to 'excused'
          if (status === 'approved') {
            setAttendance(prevAtt => {
              const date = exc.date;
              const studentId = exc.studentId;
              const existingRecord = prevAtt.find(a => a.studentId === studentId && a.date === date);

              let updatedAtt: Attendance[];
              if (existingRecord) {
                updatedAtt = prevAtt.map(a => 
                  (a.studentId === studentId && a.date === date) 
                    ? { ...a, status: 'excused', notes: `عذر مقبول معتمد: ${exc.reason}` } 
                    : a
                );
              } else {
                updatedAtt = [...prevAtt, {
                  id: 'att' + (prevAtt.length + 1),
                  studentId,
                  date,
                  status: 'excused',
                  notes: `عذر مقبول معتمد: ${exc.reason}`
                }];
              }
              persistDirectToFirestore('school_attendance', updatedAtt);
              return updatedAtt;
            });
            logEvent(`تم اعتماد عذر غياب الطالب: ${exc.studentName} للتاريخ ${exc.date} وتعديل الغياب لعذر مقبول تلقائياً.`, 'success');
          } else {
            logEvent(`تم رفض عذر غياب الطالب: ${exc.studentName} للتاريخ ${exc.date}`, 'warning');
          }

          // Send push notification to parent with decision
          const parent = parents.find(p => p.id === exc.parentId);
          if (parent) {
            sendParentPushNotification(parent.id, {
              title: status === 'approved' ? '✅ تم قبول عذر الغياب' : '❌ تم رفض عذر الغياب',
              body: `عذر غياب الطالب (${exc.studentName}) لتاريخ ${exc.date}: ${status === 'approved' ? 'تم اعتماده وتوثيقه كعذر مقبول رسمياً' : 'تم رفضه من إدارة المدرسة'}${notes ? ` - ملاحظة: ${notes}` : ''}`,
              studentId: exc.studentId,
              category: 'attendance'
            });
          }

          return updated;
        }
        return exc;
      });
      persistDirectToFirestore('school_excuses', updatedExcuses);
      return updatedExcuses;
    });
  };

  // 5. Teacher saves Attendance sheet
  const saveAttendance = (newAttendance: Omit<Attendance, 'id'>[]) => {
    setAttendance(prev => {
      const copy = [...prev];
      newAttendance.forEach(item => {
        const index = copy.findIndex(a => a.studentId === item.studentId && a.date === item.date);
        if (index !== -1) {
          copy[index] = { ...copy[index], status: item.status, notes: item.notes };
        } else {
          copy.push({
            id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            studentId: item.studentId,
            date: item.date,
            status: item.status,
            notes: item.notes
          });
        }
      });
      persistDirectToFirestore('school_attendance', copy);
      return copy;
    });

    const presentCount = newAttendance.filter(a => a.status === 'present').length;
    const absentCount = newAttendance.filter(a => a.status === 'absent').length;
    logEvent(`المعلم قام بتحضير الطلاب وتوثيق: ${presentCount} حضور، ${absentCount} غياب.`, 'info');
  };

  // 6. Teacher records a Grade (kept internal until Director approves and sends to parents)
  const saveGrade = (gradeData: Omit<Grade, 'id' | 'date'>) => {
    const id = 'g_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    const date = new Date().toISOString().split('T')[0];
    const nowTs = Date.now();
    const newGrade: Grade = { ...gradeData, id, date, updatedAt: nowTs };
    if (gradeData.examName) {
      unmarkDeletedEvaluationMonth(gradeData.examName);
    }

    setGrades(prev => {
      const updated = [newGrade, ...prev];
      persistDirectToFirestore('school_grades', updated);
      return updated;
    });
    const student = students.find(s => s.id === gradeData.studentId);
    logEvent(`المعلم رصد درجة الطالب ${student?.name || ''} بمادة ${gradeData.subject}: ${gradeData.score}/${gradeData.maxScore} (بانتظار اعتماد المدير العام)`, 'success');
  };

  // 7. Messaging
  const sendMessage = (msgData: Omit<Message, 'id' | 'date' | 'read'>) => {
    const id = 'm_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    const date = new Date().toISOString();
    const relatedStudent = msgData.studentId ? students.find(s => s.id === msgData.studentId) : undefined;
    const relatedTeacher = msgData.senderRole === 'teacher' ? teachers.find(t => t.id === msgData.senderId) : undefined;
    const inferredShift = msgData.shift || relatedStudent?.shift || relatedTeacher?.shift;
    const newMsg: Message = { ...msgData, ...(inferredShift ? { shift: inferredShift } : {}), id, date, read: false };

    setMessages(prev => {
      const updated = [...prev, newMsg];
      persistDirectToFirestore('school_messages', updated);
      return updated;
    });
    logEvent(`رسالة جديدة من ${msgData.senderName} إلى ${msgData.receiverName}`, 'primary');

    // Dispatch external push if recipient is a parent
    if (msgData.receiverRole === 'parent' && msgData.receiverId) {
      const student = students.find(s => s.id === msgData.studentId);
      let notifTitle = `📩 رسالة جديدة من: ${msgData.senderName}`;
      let notifCategory: 'direct' | 'grades' | 'behavior' | 'finance' | 'attendance' = 'direct';

      if (msgData.content.includes('كشف درجات') || msgData.content.includes('كشف الدرجات') || msgData.content.includes('الدرجات والأداء')) {
        notifTitle = `📊 كشف درجات: ${student?.name || 'الطالب'}`;
        notifCategory = 'grades';
      } else if (msgData.content.includes('سلوك') || msgData.content.includes('تنبيه سلوكي') || msgData.content.includes('التقرير السلوكي')) {
        const isPos = msgData.content.includes('إيجابي') || msgData.content.includes('متميز') || msgData.content.includes('شكر');
        notifTitle = isPos 
          ? `🌟 سلوك إيجابي متميز: ${student?.name || 'الطالب'}` 
          : `⚠️ تنبيه ومتابعة سلوكية: ${student?.name || 'الطالب'}`;
        notifCategory = 'behavior';
      } else if (msgData.content.includes('إشعار مالي') || msgData.content.includes('الأقساط') || msgData.content.includes('الرسوم الدراسية')) {
        notifTitle = `💳 كشف حساب ورسوم: ${student?.name || 'الطالب'}`;
        notifCategory = 'finance';
      } else if (msgData.content.includes('حضور') || msgData.content.includes('غياب') || msgData.content.includes('تأخر')) {
        notifTitle = `🚨 تنبيه حضور وغياب: ${student?.name || 'الطالب'}`;
        notifCategory = 'attendance';
      }

      const cleanContent = msgData.content
        .replace(/^📢 \[تصنيف الإشعار:[^\]]+\]\n/, '')
        .replace(/^📢 \[إشعار رسمي:[^\]]+\]\n/, '')
        .trim();

      sendParentPushNotification(msgData.receiverId, {
        title: notifTitle,
        body: cleanContent.slice(0, 160),
        fullContent: msgData.content,
        senderName: msgData.senderName,
        senderRole: (msgData.senderRole as any) || 'teacher',
        senderId: msgData.senderId,
        msgId: id,
        studentId: msgData.studentId,
        studentName: student?.name,
        category: notifCategory
      });
    }
  };

  // 8. Parent submits Excuse
  const submitExcuse = (excuseData: Omit<AbsenceExcuse, 'id' | 'status' | 'parentName'>) => {
    const id = `e_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const parent = parents.find(p => p.id === excuseData.parentId);
    const newExc: AbsenceExcuse = {
      ...excuseData,
      id,
      status: 'pending',
      parentName: parent?.name || 'ولي أمر'
    };

    setExcuses(prev => {
      const updated = [...prev, newExc];
      persistDirectToFirestore('school_excuses', updated);
      return updated;
    });
    logEvent(`ولي الأمر ${newExc.parentName} أرسل طلب غياب بعذر للطالب ${newExc.studentName} للتاريخ ${newExc.date}`, 'warning');
  };

  // 9. Parent sends message
  const sendMessageFromParent = (msgData: Omit<Message, 'id' | 'date' | 'read'>) => {
    const id = `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const date = new Date().toISOString();
    const newMsg: Message = { ...msgData, id, date, read: false };

    setMessages(prev => {
      const updated = [...prev, newMsg];
      persistDirectToFirestore('school_messages', updated);
      return updated;
    });
    logEvent(`رسالة من ولي الأمر ${msgData.senderName} إلى المعلم ${msgData.receiverName}`, 'primary');
  };

  // 10. System reset simulator data helper
  const handleResetData = async () => {
    if (window.confirm('هل تريد بالتأكيد إعادة النظام للحالة الافتراضية وحذف التعديلات؟')) {
      localStorage.clear();
      const [seed, backup] = await Promise.all([loadInitialSeedBundle(), loadFirestoreBackupBundle()]);
      setTeachers(seed.teachers);
      setClasses(seed.classes);
      setParents(seed.parents);
      setStudents(seed.students);
      setAttendance(INITIAL_ATTENDANCE);
      setGrades(backup.grades);
      setAnnouncements(INITIAL_ANNOUNCEMENTS);
      setMessages(INITIAL_MESSAGES);
      setExcuses(INITIAL_EXCUSES);
      logEvent('تمت إعادة ضبط كافة التطبيقات والبيانات بنجاح للحالة المصنعية.', 'success');
    }
  };

  return (
    <div id="main-app-container" className="min-h-screen bg-slate-100 flex flex-col font-sans selection:bg-sky-500 selection:text-white antialiased text-slate-800">
      
      {/* Central Platform Hub Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm py-3 px-6 md:py-4 md:px-12">
        <div className="flex justify-between items-center w-full">
          {/* Logo & Platform Info */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-xl shadow-sm overflow-hidden shrink-0 border border-indigo-500/20">
              {appIcon ? (
                <img src={appIcon} alt="شعار المدرسة" className="w-full h-full object-cover" />
              ) : (
                <div className="w-5 h-5 border-2 border-white rounded-sm"></div>
              )}
            </div>
            <div className="text-right">
              <h1 className="text-sm md:text-lg font-bold tracking-tight text-slate-800 leading-tight">المدرسة الدولية</h1>
              <p className="text-[10px] md:text-[11px] text-slate-500 font-medium leading-none mt-0.5">حلب - مدينة مارع</p>
            </div>
          </div>

          {/* Desktop Big Switcher to toggle between independent apps */}
          {!isPortalLocked ? (
            <div className="hidden md:flex items-center bg-slate-100/80 p-1 rounded-xl border border-slate-200/80">
              <button
                id="app-switcher-director"
                onClick={() => setActivePortal('director')}
                className={`flex items-center justify-center gap-2 px-5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activePortal === 'director'
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <Building className="w-4 h-4" />
                <span>تطبيق المدير</span>
              </button>

              <button
                id="app-switcher-teacher"
                onClick={() => setActivePortal('teacher')}
                className={`flex items-center justify-center gap-2 px-5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer relative ${
                  activePortal === 'teacher'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <div className="relative">
                  <Users className="w-4 h-4" />
                  {getTeacherUnreadCount() > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-2 w-2 rounded-full bg-rose-500 ring-1 ring-white"></span>
                  )}
                </div>
                <span>تطبيق المعلم</span>
                {getTeacherUnreadCount() > 0 && (
                  <span className="bg-rose-500 text-white text-[9px] px-1.5 py-0.5 rounded-full font-extrabold animate-pulse">
                    {getTeacherUnreadCount()}
                  </span>
                )}
              </button>

              <button
                id="app-switcher-parent"
                onClick={() => setActivePortal('parent')}
                className={`flex items-center justify-center gap-2 px-5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer relative ${
                  activePortal === 'parent'
                    ? 'bg-sky-500 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <div className="relative">
                  <GraduationCap className="w-4 h-4" />
                  {getParentUnreadCount() > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-2 w-2 rounded-full bg-rose-500 ring-1 ring-white"></span>
                  )}
                </div>
                <span>تطبيق ولي الأمر</span>
                {getParentUnreadCount() > 0 && (
                  <span className="bg-rose-500 text-white text-[9px] px-1.5 py-0.5 rounded-full font-extrabold animate-pulse">
                    {getParentUnreadCount()}
                  </span>
                )}
              </button>
            </div>
          ) : activePortal === 'director' ? (
            <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-xl border border-indigo-100 shadow-sm shrink-0">
              <Lock className="w-4 h-4 text-indigo-500 animate-pulse" />
              <span className="text-[11px] font-bold">
                بوابة مخصصة وآمنة: تطبيق المدير العام
              </span>
            </div>
          ) : null}

          {/* Cross-Device Instant Sync & Notification Actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleManualCrossDeviceSync}
              disabled={isManualSyncing}
              className="text-[11px] px-3 py-1.5 rounded-full font-bold transition flex items-center gap-1.5 cursor-pointer border bg-sky-50 text-sky-700 hover:bg-sky-100 border-sky-200 disabled:opacity-60"
              title="مزامنة وتحديث البيانات فوراً بين الكمبيوتر والهاتف وأجهزة أولياء الأمور"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isManualSyncing ? 'animate-spin' : ''}`} />
              <span>{isManualSyncing ? 'جاري المزامنة...' : 'مزامنة الآن'}</span>
            </button>

            {activePortal === 'director' && (
              <div className="hidden md:flex items-center gap-3">
                <button
                  type="button"
                  onClick={requestNotificationPermission}
                  className={`text-[11px] px-3 py-1.5 rounded-full font-bold transition flex items-center gap-1.5 cursor-pointer border ${
                    notificationPermission === 'granted'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 shadow-xs'
                      : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border-indigo-200'
                  }`}
                >
                  <span>🔔</span>
                  <span>{notificationPermission === 'granted' ? 'إشعارات الهاتف مفعّلة' : 'تفعيل إشعارات الهاتف'}</span>
                </button>
              </div>
            )}

            {/* Hamburger Menu Toggle Button - Mobile ONLY */}
            <button
              type="button"
              onClick={() => setIsPortalSelectorOpen(!isPortalSelectorOpen)}
              className="md:hidden p-2 text-slate-600 hover:text-slate-950 hover:bg-slate-100 rounded-lg transition cursor-pointer"
              aria-label="القائمة الرئيسية"
            >
              {isPortalSelectorOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Expandable Hamburger Menu Dropdown */}
        {isPortalSelectorOpen && (
          <div className="md:hidden mt-3 p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-4 animate-fadeIn">
            {/* Portals List with Icons */}
            {!isPortalLocked ? (
              <div className="space-y-2">
                <span className="block text-[10px] text-slate-400 font-bold text-right px-1">تبديل بوابات النظام المترابطة:</span>
                
                <button
                  id="app-switcher-director-mobile"
                  onClick={() => {
                    setActivePortal('director');
                    setIsPortalSelectorOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                    activePortal === 'director'
                      ? 'bg-slate-950 text-white border-transparent shadow-sm'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span className="text-[10px] text-slate-400">بوابة الإدارة والموظفين</span>
                  <span className="flex items-center gap-2">
                    <span>تطبيق المدير</span>
                    <Building className="w-4.5 h-4.5 text-indigo-500" />
                  </span>
                </button>

                <button
                  id="app-switcher-teacher-mobile"
                  onClick={() => {
                    setActivePortal('teacher');
                    setIsPortalSelectorOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                    activePortal === 'teacher'
                      ? 'bg-indigo-600 text-white border-transparent shadow-sm'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span className="text-[10px] text-indigo-100">رصد الدرجات والتواصل</span>
                  <span className="flex items-center gap-2">
                    {getTeacherUnreadCount() > 0 && (
                      <span className="bg-rose-500 text-white text-[9px] px-1.5 py-0.5 rounded-full font-extrabold animate-pulse">
                        {getTeacherUnreadCount()}
                      </span>
                    )}
                    <span>تطبيق المعلم</span>
                    <Users className="w-4.5 h-4.5 text-indigo-500" />
                  </span>
                </button>

                <button
                  id="app-switcher-parent-mobile"
                  onClick={() => {
                    setActivePortal('parent');
                    setIsPortalSelectorOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                    activePortal === 'parent'
                      ? 'bg-sky-500 text-white border-transparent shadow-sm'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span className="text-[10px] text-sky-100">متابعة الأقساط والغياب والشهادات</span>
                  <span className="flex items-center gap-2">
                    {getParentUnreadCount() > 0 && (
                      <span className="bg-rose-500 text-white text-[9px] px-1.5 py-0.5 rounded-full font-extrabold animate-pulse">
                        {getParentUnreadCount()}
                      </span>
                    )}
                    <span>تطبيق ولي الأمر</span>
                    <GraduationCap className="w-4.5 h-4.5 text-indigo-500" />
                  </span>
                </button>
              </div>
            ) : activePortal === 'director' ? (
              <div className="flex items-center gap-2 px-4 py-3 bg-indigo-50 text-indigo-700 rounded-xl border border-indigo-100 shadow-sm justify-end">
                <span className="text-xs font-bold">
                  بوابة مخصصة ومقفلة: تطبيق المدير
                </span>
                <Lock className="w-4 h-4 text-indigo-500 animate-pulse" />
              </div>
            ) : null}

            {/* Utility Actions Stack */}
            {activePortal === 'director' && (
              <div className="border-t border-slate-200 pt-3 space-y-2.5">
                <div className="flex flex-col gap-2">
                  <div className="flex justify-end items-center gap-2">
                    <button
                      onClick={() => {
                        requestNotificationPermission();
                        setIsPortalSelectorOpen(false);
                      }}
                      className={`text-[10px] px-2.5 py-1.5 rounded-full font-bold transition flex items-center gap-1 cursor-pointer border ${
                        notificationPermission === 'granted'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                      }`}
                    >
                      <span>🔔</span>
                      <span>{notificationPermission === 'granted' ? 'الإشعارات نشطة' : 'تفعيل إشعارات الهاتف'}</span>
                    </button>
                  </div>
                </div>

                {activePortal === 'director' && (
                  <button
                    id="btn-reset-simulator-mobile"
                    onClick={() => {
                      handleResetData();
                      setIsPortalSelectorOpen(false);
                    }}
                    className="w-full text-center text-xs text-rose-600 bg-rose-50/50 hover:bg-rose-50 border border-rose-100 py-2.5 rounded-xl font-bold transition cursor-pointer"
                  >
                    إعادة ضبط قاعدة بيانات المنصة (تصفير البيانات)
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </header>

      {/* Main App Simulator Frame - Full Width Desktop View */}
      <main className="flex-1 w-full p-2 sm:p-4 md:p-6 lg:p-8">
        
        {/* Dynamic Display Area of selected application */}
        <div className="w-full">
          <motion.div
            key={activePortal}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="w-full min-h-[640px]"
          >
            <Suspense
              fallback={
                <div className="w-full min-h-[420px] flex flex-col items-center justify-center gap-3 bg-white rounded-2xl border border-slate-200 shadow-2xs p-8 text-center">
                  <div className="w-10 h-10 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
                  <p className="text-sm font-bold text-slate-700">جاري تجهيز البوابة...</p>
                </div>
              }
            >
              {activePortal === 'director' && (
                <DirectorPortal
                  teachers={teachers}
                  students={students}
                  classes={classes}
                  excuses={excuses}
                  announcements={announcements}
                  grades={grades}
                  parents={parents}
                  attendance={attendance}
                  messages={messages}
                  setStudents={safeSetStudents}
                  setTeachers={setTeachers}
                  setParents={setParents}
                  setGrades={setGrades}
                  setClasses={setClasses}
                  setAttendance={setAttendance}
                  setAnnouncements={setAnnouncements}
                  setMessages={setMessages}
                  setExcuses={setExcuses}
                  addTeacher={addTeacher}
                  addStudent={addStudent}
                  addAnnouncement={addAnnouncement}
                  updateExcuseStatus={updateExcuseStatus}
                  directorPassword={directorPassword}
                  changeDirectorPassword={changeDirectorPassword}
                  updateTeacherPassword={updateTeacherPassword}
                  examQuestions={examQuestions}
                  saveExamQuestionPaper={saveExamQuestionPaper}
                  deleteExamQuestionPaper={deleteExamQuestionPaper}
                />
              )}

              {activePortal === 'teacher' && (
                <TeacherPortal
                  teachers={teachers}
                  students={students}
                  classes={classes}
                  attendance={attendance}
                  grades={grades}
                  parents={parents}
                  messages={messages}
                  announcements={announcements}
                  saveAttendance={saveAttendance}
                  saveGrade={saveGrade}
                  sendMessage={sendMessage}
                  setMessages={setMessages}
                  setGrades={setGrades}
                  addAnnouncement={addAnnouncement}
                  examQuestions={examQuestions}
                  saveExamQuestionPaper={saveExamQuestionPaper}
                  deleteExamQuestionPaper={deleteExamQuestionPaper}
                />
              )}

              {activePortal === 'parent' && (
                <ParentPortal
                  parents={parents}
                  students={students}
                  classes={classes}
                  teachers={teachers}
                  attendance={attendance}
                  grades={grades}
                  announcements={announcements}
                  messages={messages}
                  excuses={excuses}
                  submitExcuse={submitExcuse}
                  sendMessageFromParent={sendMessageFromParent}
                  setMessages={setMessages}
                />
              )}
            </Suspense>
          </motion.div>
        </div>
      </main>

      {/* Unified Platform Footer */}
      <footer className="bg-white border-t border-slate-200 py-5 px-6 md:px-12 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-slate-400 mt-12" style={{ direction: 'rtl' }}>
        <div className="flex flex-wrap gap-4 sm:gap-6 items-center">
          <p className="text-slate-500 font-medium">المدرسة الدولية - حلب مدينة مارع &copy; {new Date().getFullYear()}</p>
          <div className="hidden sm:flex items-center gap-1">
            <span className="text-slate-400 font-medium">تحديث البيانات:</span>
            <span className="text-slate-600 font-mono font-semibold">Real-time</span>
          </div>
          <div className="hidden sm:flex items-center gap-1">
            <span className="text-slate-400 font-medium">قاعدة البيانات:</span>
            <span className="text-slate-600 font-mono font-semibold">Cloud-Sync-v4</span>
          </div>
        </div>
        <div className="w-full md:w-auto flex justify-start" style={{ direction: 'ltr' }}>
          <PortalDesignerBadge variant="subtle" align="left" />
        </div>
      </footer>

      {/* WhatsApp style floating toast notification */}
      <AnimatePresence>
        {activeToast && (
          <motion.div
            initial={{ opacity: 0, y: -100, x: "-50%", scale: 0.9 }}
            animate={{ opacity: 1, y: 16, x: "-50%", scale: 1 }}
            exit={{ opacity: 0, y: -50, x: "-50%", scale: 0.9 }}
            className="fixed top-0 left-1/2 z-[9999] w-[92%] max-w-md bg-slate-900 text-white rounded-2xl shadow-2xl border border-slate-700/80 overflow-hidden"
            style={{ direction: 'rtl' }}
          >
            {/* Upper green whatsapp-styled thin header */}
            <div className="bg-emerald-600 px-4 py-2 flex items-center justify-between text-[11px] font-bold tracking-tight text-white/95">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                <span>📩 إشعار رسالة جديدة واردة</span>
              </div>
              <div className="bg-emerald-700/80 px-2 py-0.5 rounded text-[10px] font-mono">
                رسالة رقم #{activeToast.msgNumber}
              </div>
            </div>

            <div className="p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-emerald-100 border border-emerald-500 flex-shrink-0 flex items-center justify-center font-bold text-sm text-emerald-800">
                  {activeToast.senderName.charAt(0)}
                </div>
                <div className="space-y-1 text-right flex-1 min-w-0">
                  <h4 className="font-bold text-xs text-slate-100 flex items-center justify-between gap-2">
                    <span>المرسل: {activeToast.senderName}</span>
                    <span className="text-[9px] text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded font-mono font-medium">نشط الآن</span>
                  </h4>
                  {activeToast.studentName && (
                    <p className="text-[10px] text-slate-400 font-semibold">بخصوص الطالب: <span className="text-amber-400 font-bold">{activeToast.studentName}</span></p>
                  )}
                  <p className="text-slate-200 text-xs leading-relaxed font-medium line-clamp-3 mt-1 break-words whitespace-pre-line">
                    {activeToast.content.replace(/^📢 \[تصنيف الإشعار:[^\]]+\]\n/, '')}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-2 border-t border-slate-800 text-[11px]">
                <button
                  onClick={() => {
                    setActivePortal('parent');
                    setActiveToast(null);
                  }}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-3 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer shadow-sm text-center"
                >
                  <span>📲 فتح في تطبيق ولي الأمر</span>
                </button>
                <button
                  onClick={() => setActiveToast(null)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold py-2 px-3.5 rounded-xl transition cursor-pointer text-center"
                >
                  إغلاق
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {showNotificationHelper && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[10000]">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden text-right"
              style={{ direction: 'rtl' }}
            >
              {/* Header */}
              <div className="bg-indigo-600 text-white p-5 flex justify-between items-center">
                <div className="flex items-center gap-2.5">
                  <div className="bg-white/10 p-2 rounded-xl">
                    <Bell className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base">⚙️ إعداد وتفعيل إشعارات الهاتف</h3>
                    <p className="text-[10px] text-indigo-100 font-medium">لتلقي تنبيهات ومراسلات المدرسة كـ WhatsApp فوراً</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowNotificationHelper(false)}
                  className="text-white/80 hover:text-white p-1 hover:bg-white/10 rounded-lg transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body Content */}
              <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
                
                {/* Current Status Badge */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center justify-between gap-4">
                  <div>
                    <span className="text-xs text-slate-500 block font-medium">حالة إذن التنبيهات بالمتصفح الحالي:</span>
                    <span className="text-xs font-bold mt-1 inline-flex items-center gap-1.5">
                      {notificationPermission === 'granted' ? (
                        <>
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                          <span className="text-emerald-700">مفعّلة ونشطة بنجاح (Allowed)</span>
                        </>
                      ) : notificationPermission === 'denied' ? (
                        <>
                          <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                          <span className="text-rose-600">محظورة حالياً (Blocked)</span>
                        </>
                      ) : (
                        <>
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                          <span className="text-amber-600">لم يطلب الإذن بعد (Default)</span>
                        </>
                      )}
                    </span>
                  </div>
                  
                  <div className="flex flex-col gap-1.5">
                    <button
                      onClick={requestNotificationPermission}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2 px-4 rounded-xl transition shadow-md shadow-indigo-100 cursor-pointer flex items-center gap-1.5 shrink-0"
                    >
                      <Bell className="w-4 h-4" />
                      <span>طلب الإذن الآن</span>
                    </button>
                  </div>
                </div>

                {/* Step-by-Step Device Instruction Guides */}
                <div className="space-y-3.5 pt-4 border-t border-slate-100">
                  <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-indigo-600" />
                    <span>📱 دليل تفعيل إشعارات الهواتف الذكية خطوة بخطوة</span>
                  </h4>

                  <div className="space-y-3">
                    {/* Platform Check 1: Inside Iframe / Preview */}
                    <div className="bg-amber-50/50 p-3.5 rounded-xl border border-amber-100/60 text-xs text-amber-900 leading-relaxed space-y-1.5">
                      <div className="flex items-center gap-1.5 font-bold">
                        <ExternalLink className="w-4 h-4 text-amber-600" />
                        <span>أولاً: إذا كنت تتصفح داخل إطار المعاينة الحالي:</span>
                      </div>
                      <p className="text-[11px] text-amber-800/90 leading-relaxed">
                        يمنع المتصفح طلب أذونات الهاتف داخل إطار المعاينة (IFrame) لأسباب أمنية.
                        لذلك <strong>يجب عليك فتح التطبيق بتبويب جديد ومستقل</strong> بالضغط على السهم الصغير في الزاوية العلوية (زر فتح في نافذة مستقلة) لتتمكن من تفعيلها بنجاح.
                      </p>
                    </div>

                    {/* Platform Check 2: Android Phones */}
                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 text-xs text-slate-800 space-y-1.5">
                      <span className="font-bold text-slate-900 block">🤖 لهواتف أندرويد (جوجل كروم / سامسونج):</span>
                      <ol className="list-decimal list-inside text-[11px] text-slate-600 space-y-1 pr-1 leading-relaxed">
                        <li>افتح التطبيق من المتصفح في نافذة مستقلة خارج IFrame.</li>
                        <li>اضغط على زر "طلب الإذن الآن" بالأعلى.</li>
                        <li>عند ظهور نافذة المتصفح، اختر <strong>"سماح" (Allow)</strong> لتفعيل الصوت والرسائل فورياً.</li>
                        <li>إذا كانت محظورة مسبقاً، اضغط على رمز 🔐 (القفل) بجانب عنوان الموقع لتعديل الإذن يدويًا لـ "مسموح".</li>
                      </ol>
                    </div>

                    {/* Platform Check 3: iOS iPhone */}
                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 text-xs text-slate-800 space-y-1.5">
                      <span className="font-bold text-slate-900 block">🍏 لهواتف آيفون (Safari - نظام iOS 16.4 فما فوق):</span>
                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        شركة Apple تفرض شروطاً معينة على الإشعارات، لتفعيلها كـ WhatsApp تماماً:
                      </p>
                      <ol className="list-decimal list-inside text-[11px] text-slate-600 space-y-1 pr-1 leading-relaxed">
                        <li>افتح التطبيق بمتصفح Safari في نافذة مستقلة أولاً.</li>
                        <li>اضغط على زر <strong>"مشاركة" (Share)</strong> أسفل المتصفح (مربع يخرج منه سهم).</li>
                        <li>اختر <strong>"إضافة إلى الشاشة الرئيسية" (Add to Home Screen)</strong>.</li>
                        <li>اخرج وافتح التطبيق من الأيقونة الجديدة التي ظهرت على شاشة هاتفك الرئيسية.</li>
                        <li>انقر على تفعيل الإشعارات واضغط <strong>"سماح"</strong> وستعمل الإشعارات الخارجية فوراً حتى لو كان الهاتف مقفلاً!</li>
                      </ol>
                    </div>
                  </div>
                </div>

              </div>

              {/* Footer */}
              <div className="bg-slate-50 p-4 border-t border-slate-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowNotificationHelper(false)}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  حسناً، فهمت
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

