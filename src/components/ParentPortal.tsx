/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Heart, 
  Award, 
  Calendar, 
  Megaphone, 
  MessageSquare, 
  Send, 
  Clock, 
  CheckCircle, 
  XCircle, 
  User, 
  Plus, 
  AlertCircle,
  FileText,
  FileCheck,
  ShieldAlert,
  HelpCircle,
  UserCheck,
  Coins,
  Trash2,
  Menu,
  X,
  Camera,
  Video,
  Bell,
  BellRing,
  Smartphone,
  Download,
  ExternalLink,
  Sparkles,
  Building2,
  ArrowLeftRight,
  Hash,
  Printer,
  FileSpreadsheet,
  Copy,
  Check,
  CheckCheck,
  AlertTriangle,
  Link,
  QrCode,
  Share2,
  RefreshCw
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Parent, Student, Attendance, Grade, Announcement, Message, AbsenceExcuse, Teacher, Class, SentGradeSheet } from '../types';
import { PortalDesignerBadge } from './PortalDesignerBadge';
import { GradeSheetSignatures } from './GradeSheetSignatures';
import { printElementById, downloadElementAsImage, exportElementAsPdf } from '../lib/printUtils';
import { safeShowNotification, dismissNotification, dismissAllNotifications } from '../lib/notificationHelper';
import { sendParentPushNotification } from '../lib/pushDispatcher';
import { getStoredWelcomeMessages, WelcomeMessagesConfig } from '../lib/welcomeMessages';
import { motion, AnimatePresence } from 'motion/react';
import { trackActivityOperation } from '../lib/firestoreTracker';
import { forceRefreshDataFromFirestore, fetchStudentsOnlyDirectly } from '../lib/firebaseSync';

interface ParentPortalProps {
  parents: Parent[];
  students: Student[];
  classes: Class[];
  teachers: Teacher[];
  attendance: Attendance[];
  grades: Grade[];
  announcements: Announcement[];
  messages: Message[];
  excuses: AbsenceExcuse[];
  submitExcuse: (excuse: Omit<AbsenceExcuse, 'id' | 'status' | 'parentName'>) => void;
  sendMessageFromParent: (message: Omit<Message, 'id' | 'date' | 'read'>) => void;
  setMessages?: React.Dispatch<React.SetStateAction<Message[]>>;
}

// Helper to normalize arabic and latin digits and extract numbers
export const normalizeNumberDigits = (str: string): string => {
  return str
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString())
    .replace(/[^\d]/g, '')
    .trim();
};

// Helper to find student strictly by Unified Number (or rollNo/ID/Name)
export const findStudentByUnifiedInput = (input: string | undefined | null, list: Student[]): Student | undefined => {
  if (!input || !Array.isArray(list) || list.length === 0) return undefined;
  const rawClean = String(input).trim();
  if (!rawClean) return undefined;

  const normalizedDigits = normalizeNumberDigits(rawClean);
  const numValue = normalizedDigits ? parseInt(normalizedDigits, 10) : NaN;

  // 1. Direct match with student ID (exact match)
  let match = list.find(s => s.id && s.id.toLowerCase() === rawClean.toLowerCase());
  if (match) return match;

  // 2. Match by unifiedNo (exact string, normalized digits, or integer value)
  match = list.find(s => {
    if (s.unifiedNo === undefined || s.unifiedNo === null) return false;
    const sStr = String(s.unifiedNo).trim();
    if (sStr === rawClean) return true;
    const sDigits = normalizeNumberDigits(sStr);
    if (normalizedDigits && sDigits === normalizedDigits) return true;
    const sNum = parseInt(sDigits, 10);
    if (!isNaN(numValue) && !isNaN(sNum) && sNum === numValue) return true;
    return false;
  });
  if (match) return match;

  // 3. Match by rollNo
  match = list.find(s => {
    if (s.rollNo === undefined || s.rollNo === null) return false;
    const sStr = String(s.rollNo).trim();
    if (sStr === rawClean) return true;
    const sDigits = normalizeNumberDigits(sStr);
    if (normalizedDigits && sDigits === normalizedDigits) return true;
    const sNum = parseInt(sDigits, 10);
    if (!isNaN(numValue) && !isNaN(sNum) && sNum === numValue) return true;
    return false;
  });
  if (match) return match;

  // 4. Match by nationalId
  match = list.find(s => s.nationalId && String(s.nationalId).trim() === rawClean);
  if (match) return match;

  // 5. Match by exact student name (case-insensitive & trimmed)
  match = list.find(s => s.name && s.name.trim().toLowerCase() === rawClean.toLowerCase());
  if (match) return match;

  return undefined;
};

export default function ParentPortal({
  parents,
  students,
  classes,
  teachers,
  attendance,
  grades,
  announcements,
  messages,
  excuses,
  submitExcuse,
  sendMessageFromParent,
  setMessages
}: ParentPortalProps) {
  // Unified Student Login System: Strictly single student by Unified Number
  const [loggedInStudentId, setLoggedInStudentId] = useState<string>(() => {
    try {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const urlUnified = params.get('unified') || params.get('roll') || params.get('student') || params.get('studentId') || params.get('no');
        if (urlUnified) {
          return urlUnified.trim();
        }
      }
      return localStorage.getItem('parent_portal_student_id') || 
             localStorage.getItem('parent_portal_unified_no') || 
             localStorage.getItem('parent_portal_saved_login_input') || 
             '';
    } catch {
      return '';
    }
  });
  const [studentRollInput, setStudentRollInput] = useState('');
  const [loginError, setLoginError] = useState('');

  // Active student object cached directly to guarantee instant opening on any browser/phone
  const [activeDirectStudent, setActiveDirectStudent] = useState<Student | null>(() => {
    try {
      const saved = localStorage.getItem('parent_portal_active_student_obj');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Active student strictly matching the logged in student ID or unified number across all sources
  const activeStudentObj: Student | undefined = 
    activeDirectStudent || 
    findStudentByUnifiedInput(loggedInStudentId, students) ||
    (() => {
      try {
        const raw = localStorage.getItem('school_students');
        if (raw) {
          const list = JSON.parse(raw);
          if (Array.isArray(list) && list.length > 0) {
            return findStudentByUnifiedInput(loggedInStudentId, list);
          }
        }
      } catch {}
      return undefined;
    })() ||
    students.find(s => 
      s.id === loggedInStudentId || 
      (s.unifiedNo && String(s.unifiedNo).trim() === loggedInStudentId.trim()) ||
      (s.rollNo && String(s.rollNo).trim() === loggedInStudentId.trim())
    );

  const selectedParentId = activeStudentObj ? activeStudentObj.parentId : '';
  const activeParent = parents.find(p => p.id === selectedParentId) || 
    (activeStudentObj?.parentName ? {
      id: selectedParentId || 'p_auto',
      name: activeStudentObj.parentName,
      phone: activeStudentObj.parentPhone || '',
      email: '',
      childrenIds: [activeStudentObj.id]
    } : undefined);

  // Single active student (strictly one child matching the unified number)
  const activeChild = activeStudentObj;
  const selectedChildId = activeStudentObj ? activeStudentObj.id : '';
  const setSelectedChildId = (_id: string) => {
    // Child switching is disabled - strictly single student by unified number
  };

  const [schoolAppIcon, setSchoolAppIcon] = useState<string>(() => {
    return localStorage.getItem('school_app_icon') || '';
  });

  const [showWelcomeModal, setShowWelcomeModal] = useState<boolean>(() => {
    return !sessionStorage.getItem('parent_welcome_dismissed');
  });

  const [welcomeMsgs, setWelcomeMsgs] = useState<WelcomeMessagesConfig>(getStoredWelcomeMessages);

  // Grade ceiling / passing settings: '100' | 'unspecified' | '50' | '20' | 'custom'
  const [maxGradeChoice, setMaxGradeChoice] = useState<string>(() => {
    return localStorage.getItem('school_parent_max_grade_choice') || 
           localStorage.getItem('school_max_grade_setting') || 
           '100';
  });
  const [customMaxGrade, setCustomMaxGrade] = useState<string>(() => {
    return localStorage.getItem('school_parent_custom_max_grade') || 
           localStorage.getItem('school_custom_max_grade') || 
           '100';
  });
  const [passGradeChoice, setPassGradeChoice] = useState<string>(() => {
    return localStorage.getItem('school_parent_pass_grade_choice') || 
           localStorage.getItem('school_pass_grade_setting') || 
           '50';
  });
  const [customPassGrade, setCustomPassGrade] = useState<string>(() => {
    return localStorage.getItem('school_parent_custom_pass_grade') || 
           localStorage.getItem('school_custom_pass_grade') || 
           '50';
  });

  const displayMaxGrade = maxGradeChoice === 'unspecified' 
    ? 'غير محدد' 
    : maxGradeChoice === 'custom' 
      ? (customMaxGrade || 'غير محدد')
      : maxGradeChoice;

  const displayPassGrade = passGradeChoice === 'unspecified' 
    ? 'غير محدد' 
    : passGradeChoice === 'custom' 
      ? (customPassGrade || 'غير محدد')
      : passGradeChoice;

  const numericMaxGrade = maxGradeChoice === 'unspecified' 
    ? null 
    : parseFloat(displayMaxGrade) || null;

  const numericPassGrade = passGradeChoice === 'unspecified' 
    ? null 
    : parseFloat(displayPassGrade) || null;

  const handleExportStudentGradesExcel = (studentName: string, childClass: string, targetMonth: string, gradeValues: any[], avg: string | null, estimation: string) => {
    const data = gradeValues.map((gv, idx) => ({
      'م': idx + 1,
      'المادة الدراسية': gv.subject,
      'الدرجة المحرزة': gv.score !== null ? gv.score : 'قيد الرصد',
      'الدرجة العظمى': displayMaxGrade,
      'درجة النجاح': displayPassGrade,
      'التقدير والمستوى': gv.score !== null ? (gv.score > 90 ? 'ممتاز' : gv.score > 80 ? 'جيد جداً' : gv.score > 60 ? 'جيد' : gv.score > 40 ? 'وسط' : 'ضعيف') : 'قيد الرصد'
    }));

    data.push({
      'م': '' as any,
      'المادة الدراسية': 'المعدل والنتيجة الإجمالية',
      'الدرجة المحرزة': avg !== null ? `${avg}%` : '---',
      'الدرجة العظمى': displayMaxGrade,
      'درجة النجاح': displayPassGrade,
      'التقدير والمستوى': estimation
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'كشف الدرجات');
    XLSX.writeFile(workbook, `كشف_درجات_${studentName.replace(/\s+/g, '_')}_شهر_${targetMonth}.xlsx`);
  };

  const handleExportCohortStudentsExcel = (childClass: string) => {
    const targetStudents = students.filter(s => s.classId === activeChild?.classId || s.shift === activeChild?.shift);
    const listToExport = targetStudents.length > 0 ? targetStudents : students;

    const data = listToExport.map((s, idx) => ({
      'م': idx + 1,
      'الرقم الموحد': s.unifiedNo || s.rollNo || '',
      'اسم الطالب': s.name,
      'الصف والشعبة': classes.find(c => c.id === s.classId)?.name || childClass || '---',
      'الفوج': s.shift === 'evening' ? 'الفوج المسائي' : 'الفوج الصباحي'
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'حصر أسماء الفوج');
    XLSX.writeFile(workbook, `أسماء_طلاب_فوج_${(activeChild?.name || '').replace(/\s+/g, '_')}.xlsx`);
  };

  // Sent Grade Sheets Archive State (كشوف الدرجات المرسلة والمحفوظة بدون تكرار)
  const deduplicateGradeSheets = (sheets: SentGradeSheet[]): SentGradeSheet[] => {
    if (!Array.isArray(sheets)) return [];
    const map = new Map<string, SentGradeSheet>();
    for (const s of sheets) {
      const key = `${s.classId || s.className || 'all'}_${s.month}`;
      if (!map.has(key) || new Date(s.dateSent).getTime() >= new Date(map.get(key)!.dateSent).getTime()) {
        map.set(key, s);
      }
    }
    return Array.from(map.values());
  };

  const [sentGradeSheets, setSentGradeSheets] = useState<SentGradeSheet[]>(() => {
    try {
      const saved = localStorage.getItem('school_sent_grade_sheets');
      return saved ? deduplicateGradeSheets(JSON.parse(saved)) : [];
    } catch {
      return [];
    }
  });

  React.useEffect(() => {
    const handleStorageUpdate = (e?: any) => {
      const savedIcon = localStorage.getItem('school_app_icon');
      if (savedIcon !== null) {
        setSchoolAppIcon(savedIcon);
      }
      setWelcomeMsgs(getStoredWelcomeMessages());

      const savedSent = localStorage.getItem('school_sent_grade_sheets');
      if (savedSent) {
        try {
          setSentGradeSheets(deduplicateGradeSheets(JSON.parse(savedSent)));
        } catch {}
      }
    };
    window.addEventListener('school_storage_update', handleStorageUpdate);

    // Direct Firestore fetch on mount to ensure fresh certified sheets appear on any device
    (async () => {
      try {
        const { doc, getDoc } = await import('firebase/firestore');
        const { db } = await import('../lib/firebase');
        if (db) {
          const sentSnap = await getDoc(doc(db, 'school_live_data', 'school_sent_grade_sheets'));
          if (sentSnap.exists()) {
            const data = sentSnap.data()?.data;
            if (Array.isArray(data) && data.length > 0) {
              setSentGradeSheets(deduplicateGradeSheets(data));
              localStorage.setItem('school_sent_grade_sheets', JSON.stringify(data));
            }
          }
        }
      } catch (err) {
        console.warn('Error fetching sent grade sheets from Firestore on mount:', err);
      }
    })();

    return () => window.removeEventListener('school_storage_update', handleStorageUpdate);
  }, []);

  // Track read state for various categories per parent
  const [readGradeIds, setReadGradeIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(`read_grades_${selectedParentId}`);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [readAttendanceIds, setReadAttendanceIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(`read_attendance_${selectedParentId}`);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [readAnnouncementIds, setReadAnnouncementIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(`read_announcements_${selectedParentId}`);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [readMonthlyEval, setReadMonthlyEval] = useState<string>(() => {
    return localStorage.getItem(`read_monthly_eval_${selectedChildId}`) || '';
  });

  // Keep read states synced when selectedParentId or selectedChildId changes
  React.useEffect(() => {
    if (selectedParentId) {
      try {
        const savedGrades = localStorage.getItem(`read_grades_${selectedParentId}`);
        setReadGradeIds(savedGrades ? JSON.parse(savedGrades) : []);
        
        const savedAttendance = localStorage.getItem(`read_attendance_${selectedParentId}`);
        setReadAttendanceIds(savedAttendance ? JSON.parse(savedAttendance) : []);

        const savedAnnouncements = localStorage.getItem(`read_announcements_${selectedParentId}`);
        setReadAnnouncementIds(savedAnnouncements ? JSON.parse(savedAnnouncements) : []);
      } catch (e) {
        console.warn("Error reading local storage read keys:", e);
      }
    }
    if (selectedChildId) {
      setReadMonthlyEval(localStorage.getItem(`read_monthly_eval_${selectedChildId}`) || '');
    }
  }, [selectedParentId, selectedChildId]);

  const activeChildClass = classes.find(c => c.id === activeChild?.classId);
  const activeChildTeacher = 
    teachers.find(t => t.id === activeChildClass?.teacherId) ||
    teachers.find(t => activeChildClass?.id && t.classes && t.classes.includes(activeChildClass.id)) ||
    teachers[0];

  // --- Auto-Login & Save Phone Number States ---
  const [rememberMe, setRememberMe] = React.useState<boolean>(true);
  const [isLoggingIn, setIsLoggingIn] = React.useState<boolean>(false);
  const [showSmartLinkModal, setShowSmartLinkModal] = React.useState<boolean>(false);
  const [smartLinkCopied, setSmartLinkCopied] = React.useState<boolean>(false);
  const savedLoginInput = typeof window !== 'undefined' ? localStorage.getItem('parent_portal_saved_login_input') || '' : '';

  const getDirectSmartLink = (child?: Student | null): string => {
    if (typeof window === 'undefined') return '';
    const st = child || activeChild;
    if (!st) return '';
    const identifier = st.unifiedNo || st.rollNo || st.id;
    return `${window.location.origin}${window.location.pathname}?portal=parent&unified=${encodeURIComponent(identifier)}`;
  };

  const handleCopySmartLink = async (url: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = url;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setSmartLinkCopied(true);
      setTimeout(() => setSmartLinkCopied(false), 3000);
    } catch (e) {
      console.warn('Copy smart link failed', e);
    }
  };

  const handleShareSmartLinkWhatsApp = (child: Student | null, url: string) => {
    const st = child || activeChild;
    if (!st) return;
    const studentClassName = activeChildClass?.name || 'الصف الدراسي';
    const text = 
`💚 *المدرسة الدولية الخاصة* 💚
🎓 *الرابط الذكي المباشر لملف الطالب:*
═════════════════════════
👤 *اسم الطالب:* *${st.name}*
🔢 *الرقم الموحد المعتمد:* *#${st.unifiedNo || st.rollNo}*
🏫 *الصف والشعبة:* *${studentClassName}*
═════════════════════════
🔗 *رابط الدخول المباشر بنقرة واحدة:*
${url}

💡 *ملاحظة هامة لولي الأمر:*
هذا الرابط الذكي مخصص لفتح ملف الطالب مباشرة والاطلاع الفوري على كشوف الدرجات والتقارير الشهرية وسجل الحضور دون الحاجة لإدخال الرقم الموحد في كل مرة.
✨ *مع تحيات إدارة المدرسة الدولية*`;

    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(waUrl, '_blank');
  };

  // --- Live Parent Messaging States ---
  const [parentMsgTarget, setParentMsgTarget] = React.useState<'director' | 'teacher' | 'both'>('director');
  const [parentMsgCategory, setParentMsgCategory] = React.useState<string>('استفسار عام');
  const [parentMsgText, setParentMsgText] = React.useState<string>('');
  const [parentMsgImage, setParentMsgImage] = React.useState<string>('');
  const [parentMsgSuccess, setParentMsgSuccess] = React.useState<boolean>(false);
  const [activeChatSubTab, setActiveChatSubTab] = React.useState<'send' | 'direct' | 'grades'>('send');

  const handleParentImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert('حجم الصورة كبير جداً، يرجى اختيار صورة أقل من 2 ميغابايت');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setParentMsgImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleParentSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!parentMsgText.trim()) return;

    let finalContent = `[${parentMsgCategory}] ${parentMsgText.trim()}`;
    if (parentMsgImage) {
      finalContent += `\n[مرفق_صورة: ${parentMsgImage}]`;
    }

    const senderNameStr = activeChild?.name
      ? `ولي أمر الطالب: ${activeChild.name} (الرقم الموحد: #${activeChild.unifiedNo || activeChild.rollNo || ''})`
      : (activeParent?.name ? `ولي أمر (${activeParent.name})` : 'ولي أمر');

    // 1. Send to Director
    if (parentMsgTarget === 'director' || parentMsgTarget === 'both') {
      sendMessageFromParent({
        senderId: selectedParentId || 'parent',
        senderName: senderNameStr,
        senderRole: 'parent',
        receiverId: 'director',
        receiverName: 'إدارة المدرسة (المدير العام)',
        receiverRole: 'director',
        content: finalContent,
        studentId: selectedChildId
      });
    }

    // 2. Send to Teacher
    if (parentMsgTarget === 'teacher' || parentMsgTarget === 'both') {
      sendMessageFromParent({
        senderId: selectedParentId || 'parent',
        senderName: senderNameStr,
        senderRole: 'parent',
        receiverId: activeChildTeacher?.id || 'teacher',
        receiverName: activeChildTeacher?.name ? `المعلم ${activeChildTeacher.name}` : 'معلم الصف',
        receiverRole: 'teacher',
        content: finalContent,
        studentId: selectedChildId
      });
    }

    setParentMsgText('');
    setParentMsgImage('');
    setParentMsgSuccess(true);
    setActiveChatSubTab('direct');
    setTimeout(() => setParentMsgSuccess(false), 5000);
  };

  // Automatic login on mount and student ID validation for seamless direct access
  React.useEffect(() => {
    // 1. Check URL query parameters (e.g. ?portal=parent&unified=181 or ?unified=181)
    let urlParamVal: string | null = null;
    try {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        urlParamVal = params.get('unified') || params.get('roll') || params.get('student') || params.get('studentId') || params.get('no');
      }
    } catch {}

    const targetInput = urlParamVal?.trim() || loggedInStudentId?.trim() || localStorage.getItem('parent_portal_saved_login_input')?.trim() || localStorage.getItem('parent_portal_unified_no')?.trim();

    if (!targetInput) return;

    // A. Match from in-memory students prop
    let match = findStudentByUnifiedInput(targetInput, students);

    // B. Match from localStorage if available
    if (!match) {
      try {
        const raw = localStorage.getItem('school_students');
        if (raw) {
          const list = JSON.parse(raw);
          if (Array.isArray(list)) {
            match = findStudentByUnifiedInput(targetInput, list);
          }
        }
      } catch {}
    }

    // C. If found locally, immediately set active direct student and ID
    if (match) {
      setActiveDirectStudent(match);
      setLoggedInStudentId(match.id);
      localStorage.setItem('parent_portal_student_id', match.id);
      localStorage.setItem('parent_portal_unified_no', match.unifiedNo || match.rollNo || '');
      localStorage.setItem('parent_portal_active_student_obj', JSON.stringify(match));
      localStorage.setItem('parent_portal_saved_login_input', targetInput);
      localStorage.setItem('parent_portal_auto_login', 'true');
      return;
    }

    // D. If not found locally (fresh browser/phone session), immediately query Firestore cloud directly in the background
    (async () => {
      try {
        const { doc, getDoc } = await import('firebase/firestore');
        const { db } = await import('../lib/firebase');
        if (db) {
          const snap = await getDoc(doc(db, 'school_live_data', 'school_students'));
          if (snap.exists()) {
            const allSt = snap.data()?.data;
            if (Array.isArray(allSt)) {
              const remoteMatch = findStudentByUnifiedInput(targetInput, allSt);
              if (remoteMatch) {
                setActiveDirectStudent(remoteMatch);
                setLoggedInStudentId(remoteMatch.id);
                localStorage.setItem('parent_portal_student_id', remoteMatch.id);
                localStorage.setItem('parent_portal_unified_no', remoteMatch.unifiedNo || remoteMatch.rollNo || '');
                localStorage.setItem('parent_portal_active_student_obj', JSON.stringify(remoteMatch));
                localStorage.setItem('parent_portal_saved_login_input', targetInput);
                localStorage.setItem('parent_portal_auto_login', 'true');
                localStorage.setItem('school_students', JSON.stringify(allSt));
                window.dispatchEvent(new CustomEvent('school_storage_update', {
                  detail: { key: 'school_students', value: JSON.stringify(allSt) }
                }));
              }
            }
          }
        }
      } catch (err) {
        console.warn('Auto URL student resolve from Firestore error:', err);
      }
    })();
  }, [students, loggedInStudentId]);

  // --- Web Audio Synthesized Chime (Professional Smartphone Ringtone) ---
  const playCustomNotificationSound = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const now = audioCtx.currentTime;
      
      const playTone = (freq: number, startTime: number, duration: number) => {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        osc.type = 'sine';
        osc.frequency.value = freq;
        
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(0.18, startTime + 0.03);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
        
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        osc.start(startTime);
        osc.stop(startTime + duration);
      };
      
      // Gorgeous 3-note ascending mobile-style melody chime
      playTone(784.00, now, 0.4);       // G5
      playTone(1046.50, now + 0.08, 0.4); // C6
      playTone(1318.51, now + 0.16, 0.5); // E6
    } catch (e) {
      console.warn('AudioContext sound failed or was blocked by autoplay:', e);
    }
  };

  // State for foreground in-app floating toasts
  const [parentPortalToasts, setParentPortalToasts] = React.useState<Array<{
    id: string;
    title: string;
    body: string;
    type: 'grade' | 'attendance' | 'announcement' | 'message';
  }>>([]);

  const showLocalPortalToast = (title: string, body: string, type: 'grade' | 'attendance' | 'announcement' | 'message') => {
    const id = Date.now().toString() + Math.random().toString();
    setParentPortalToasts(prev => [...prev, { id, title, body, type }]);
    setTimeout(() => {
      setParentPortalToasts(prev => prev.filter(t => t.id !== id));
    }, 6000);
  };

  // Refs for tracking changes
  const prevGradesRef = React.useRef<string[]>([]);
  const prevAttendanceRef = React.useRef<string[]>([]);
  const prevAnnouncementsRef = React.useRef<string[]>([]);
  const prevMessagesRef = React.useRef<string[]>([]);
  const initialLoadCompletedRef = React.useRef<boolean>(false);

  // Monitor additions in real-time
  React.useEffect(() => {
    if (!selectedChildId || !selectedParentId) {
      initialLoadCompletedRef.current = false;
      return;
    }

    const currentGrades = grades.filter(g => g.studentId === selectedChildId);
    const currentAttendance = attendance.filter(a => a.studentId === selectedChildId);
    const currentAnnouncements = announcements;
    const currentMessages = messages.filter(m => 
      m.receiverId === selectedParentId || 
      m.receiverId === 'all' || 
      m.receiverId === 'all_cohort_parents' || 
      (m.receiverId?.startsWith('all_class_') && activeChild?.classId === m.receiverId.replace('all_class_', '')) ||
      m.receiverRole === 'parent'
    );

    const gradeIds = currentGrades.map(g => g.id);
    const attendanceIds = currentAttendance.map(a => `${a.date}_${a.status}`);
    const announcementIds = currentAnnouncements.map(an => an.id);
    const messageIds = currentMessages.map(m => m.id);

    if (!initialLoadCompletedRef.current) {
      // Establish baseline on login or child swap
      prevGradesRef.current = gradeIds;
      prevAttendanceRef.current = attendanceIds;
      prevAnnouncementsRef.current = announcementIds;
      prevMessagesRef.current = messageIds;
      initialLoadCompletedRef.current = true;
      console.log("[Notification Monitor] Baseline established for Child:", selectedChildId);
      return;
    }

    // Check for NEW Grades
    const newGrades = currentGrades.filter(g => !prevGradesRef.current.includes(g.id));
    if (newGrades.length > 0) {
      newGrades.forEach(g => {
        const title = `📈 درجة جديدة: ${g.subject}`;
        const body = `تم رصد درجة الطالب ${activeChild?.name} في تقييم (${g.examName}): ${g.score}/${g.maxScore}`;
        playCustomNotificationSound();
        showLocalPortalToast(title, body, 'grade');
        safeShowNotification(title, {
          body,
          icon: '/icon.png',
          badge: '/badge.png',
          tag: `grade_${g.id}`,
          renotify: true,
          data: { msgId: g.id, url: `/?portal=parent&tab=grades` }
        });
      });
      prevGradesRef.current = gradeIds;
    }

    // Check for NEW Attendance / Absences
    const newAttendance = currentAttendance.filter(a => !prevAttendanceRef.current.includes(`${a.date}_${a.status}`));
    if (newAttendance.length > 0) {
      newAttendance.forEach(a => {
        const statusAr = a.status === 'absent' ? 'غياب ❌' : a.status === 'late' ? 'تأخر ⚠️' : 'حضور ✅';
        const title = `📅 تحديث الحضور والغياب`;
        const body = `تم رصد حالة الطالب ${activeChild?.name} ليوم ${a.date} كـ: ${statusAr}`;
        playCustomNotificationSound();
        showLocalPortalToast(title, body, 'attendance');
        safeShowNotification(title, {
          body,
          icon: '/icon.png',
          badge: '/badge.png',
          tag: `att_${a.date}`,
          renotify: true,
          data: { url: `/?portal=parent&tab=attendance` }
        });
      });
      prevAttendanceRef.current = attendanceIds;
    }

    // Check for NEW Announcements
    const newAnnouncements = currentAnnouncements.filter(an => !prevAnnouncementsRef.current.includes(an.id));
    if (newAnnouncements.length > 0) {
      newAnnouncements.forEach(an => {
        const title = `📢 إعلان وتعميم مدرسي جديد`;
        const body = `${an.title}: ${an.content.substring(0, 80)}...`;
        playCustomNotificationSound();
        showLocalPortalToast(title, body, 'announcement');
        safeShowNotification(title, {
          body,
          icon: '/icon.png',
          badge: '/badge.png',
          tag: `ann_${an.id}`,
          renotify: true,
          data: { msgId: an.id, url: `/?portal=parent&tab=notes` }
        });
      });
      prevAnnouncementsRef.current = announcementIds;
    }

    // Check for NEW Messages
    const newMessages = currentMessages.filter(m => !prevMessagesRef.current.includes(m.id));
    if (newMessages.length > 0) {
      newMessages.forEach(m => {
        if (m.senderRole !== 'parent') {
          const title = `💬 رسالة جديدة من: ${m.senderName}`;
          const body = m.content.replace(/^📢 \[تصنيف الإشعار:[^\]]+\]\n/, '');
          playCustomNotificationSound();
          showLocalPortalToast(title, body, 'message');
          safeShowNotification(title, {
            body,
            icon: '/icon.png',
            badge: '/badge.png',
            tag: `notif_${m.id}`,
            renotify: false,
            data: { msgId: m.id, url: `/?portal=parent&tab=messages&msgId=${m.id}` }
          });
        }
      });
      prevMessagesRef.current = messageIds;
    }

    // Keep arrays in sync
    prevGradesRef.current = gradeIds;
    prevAttendanceRef.current = attendanceIds;
    prevAnnouncementsRef.current = announcementIds;
    prevMessagesRef.current = messageIds;

  }, [grades, attendance, announcements, messages, selectedChildId, selectedParentId, activeChild]);

  // Firebase Live Sync status
  const [isFirebaseLive, setIsFirebaseLive] = useState<boolean>(true);
  const [firebaseErrorMsg, setFirebaseErrorMsg] = useState<string>('');

  // FCM and Push notification states
  const [fcmToken, setFcmToken] = useState<string>('');
  const [pushPermissionStatus, setPushPermissionStatus] = useState<string>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  );
  const [isTestingPush, setIsTestingPush] = useState<boolean>(false);
  const [testPushSuccess, setTestPushSuccess] = useState<boolean>(false);
  const [showRestrictedEnvModal, setShowRestrictedEnvModal] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [openedMessageDetail, setOpenedMessageDetail] = useState<Message | null>(null);

  // PWA Install prompt state
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBtn, setShowInstallBtn] = useState<boolean>(false);
  const [showInstallGuide, setShowInstallGuide] = useState<boolean>(false);
  const [isBannerDismissed, setIsBannerDismissed] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('pwa_banner_dismissed') === 'true';
    }
    return false;
  });

  React.useEffect(() => {
    // Check if the prompt was already captured globally in main.tsx
    if (typeof window !== 'undefined') {
      const globalPrompt = (window as any).getDeferredPrompt?.();
      if (globalPrompt) {
        console.log('[PWA] Using globally captured prompt on mount.');
        setDeferredPrompt(globalPrompt);
        setShowInstallBtn(true);
      }
    }

    const handleGlobalPromptAvailable = () => {
      if (typeof window !== 'undefined') {
        const globalPrompt = (window as any).getDeferredPrompt?.();
        if (globalPrompt) {
          console.log('[PWA] Global prompt became available via custom event.');
          setDeferredPrompt(globalPrompt);
          setShowInstallBtn(true);
        }
      }
    };

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      console.log('[PWA] Local beforeinstallprompt listener triggered.');
      setDeferredPrompt(e);
      setShowInstallBtn(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('pwa-prompt-available', handleGlobalPromptAvailable);

    // Also check if app is already installed in standalone mode
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setShowInstallBtn(false);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('pwa-prompt-available', handleGlobalPromptAvailable);
    };
  }, []);

  const handleInstallClick = async () => {
    const isIframe = typeof window !== 'undefined' && window.self !== window.top;
    if (isIframe) {
      alert(
        "🔔 لتتمكن من تثبيت التطبيق بنقرة واحدة مباشرة على هاتفك، يجب فتح التطبيق خارج نافذة المعاينة المؤطرة (Iframe).\n\n" +
        "سنقوم الآن بفتح التطبيق في صفحة مستقلة كاملة، وعند فتحها ستتمكن من النقر على زر التثبيت وسيعمل مباشرة بنجاح! 🎉"
      );
      window.open(window.location.href, '_blank');
      return;
    }

    const isIOS = typeof window !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    if (isIOS) {
      alert(
        "🍎 أجهزة الآيفون (iOS) تتطلب الإضافة اليدوية لشاشة الهاتف:\n\n" +
        "1. اضغط على زر المشاركة (Share 📤) في متصفح Safari بالأسفل.\n" +
        "2. اختر 'إضافة إلى الشاشة الرئيسية' (Add to Home Screen ➕).\n\n" +
        "سنعرض لك الآن الخطوات بالتعليمات المفصلة لتسهيل الأمر!"
      );
      setShowInstallGuide(true);
      return;
    }

    if (!deferredPrompt) {
      // Chrome/Android fallback if event hasn't fired yet
      alert(
        "💡 لتثبيت التطبيق على هاتف أندرويد مباشرة:\n\n" +
        "1. تأكد من فتح التطبيق من متصفح Chrome الأصلي وليس متصفحاً فرعياً.\n" +
        "2. إذا لم يظهر خيار التثبيت المباشر، يمكنك تثبيته يدوياً بالضغط على زر خيارات المتصفح (⋮) ثم اختيار 'تثبيت التطبيق'.\n\n" +
        "سنفتح لك الآن دليل التثبيت المفصل لسهولة المتابعة!"
      );
      setShowInstallGuide(true);
      return;
    }

    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User choice outcome for install prompt: ${outcome}`);
      setDeferredPrompt(null);
      setShowInstallBtn(false);
    } catch (err) {
      console.error("Error triggering PWA prompt:", err);
      setShowInstallGuide(true);
    }
  };

  // Request Push notification permissions and save token
  const requestPushPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setShowRestrictedEnvModal(true);
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      setPushPermissionStatus(permission);

      if (permission === 'granted' && selectedParentId) {
        let registeredToken = '';

        // 1. Try FCM token retrieval
        try {
          const { getMessagingInstance } = await import('../lib/firebase');
          const messaging = await getMessagingInstance();

          if (messaging) {
            const { getToken } = await import('firebase/messaging');
            let activeRegistration: ServiceWorkerRegistration | undefined;
            if ('serviceWorker' in navigator) {
              try {
                activeRegistration = await navigator.serviceWorker.ready;
              } catch (swErr) {
                // ignore
              }
            }

            let configuredVapidKey = '';
            const savedFcmConfig = localStorage.getItem('school_fcm_config');
            if (savedFcmConfig) {
              try {
                const parsedConfig = JSON.parse(savedFcmConfig);
                if (parsedConfig?.vapidKey) configuredVapidKey = parsedConfig.vapidKey;
              } catch (e) {
                // ignore
              }
            }

            const tokenOptions: { serviceWorkerRegistration?: ServiceWorkerRegistration; vapidKey?: string } = {
              serviceWorkerRegistration: activeRegistration
            };
            if (configuredVapidKey) {
              tokenOptions.vapidKey = configuredVapidKey;
            }

            const token = await getToken(messaging, tokenOptions);

            if (token) {
              registeredToken = token;
              setFcmToken(token);
            }
          }
        } catch (fcmErr) {
          console.warn("[FCM] Token generation note (will use Web Push registration):", fcmErr);
        }

        // 2. Always persist parent's active device registration in Firestore
        try {
          const { doc, setDoc } = await import('firebase/firestore');
          const { db } = await import('../lib/firebase');
          if (db) {
            await setDoc(doc(db, 'fcm_tokens', selectedParentId), {
              parentId: selectedParentId,
              parentName: activeParent?.name || 'ولي أمر',
              token: registeredToken || `device_${Date.now()}_push_ready`,
              deviceInfo: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 140) : 'Web Device',
              platform: typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent) ? 'iOS' : 'Android/Web',
              permission: 'granted',
              updatedAt: Date.now()
            }, { merge: true });
            console.log("[Push Registration] Device successfully registered for parent:", selectedParentId);
          }
        } catch (storeErr) {
          console.warn("[Push Registration] Could not save token to Firestore:", storeErr);
        }

        alert('🎉 تم تفعيل إشعارات الهاتف بنجاح 🔔! ستصلك تنبيهات الدرجات والملاحظات فور رصدها مباشرة.');
      } else if (permission === 'denied') {
        alert('⚠️ تم حظر الإشعارات في إعدادات المتصفح. يرجى الضغط على علامة القفل بجانب شريط العنوان والسماح بالإشعارات.');
      }
    } catch (err) {
      console.warn("Could not request push notification permission:", err);
    }
  };

  // Test push notification delivery directly on parent's phone
  const handleTestParentNotification = async () => {
    setIsTestingPush(true);
    try {
      // 1. Show immediate system notification via Service Worker / Native API
      await safeShowNotification('🔔 تجربة إشعار المدرسة الدولية', {
        body: `مرحباً ${activeParent?.name || 'ولي الأمر'}! تم تفعيل الإشعارات بنجاح. ستصلك درجات وملاحظات الطالب (${activeChild?.name || ''}) فوراً حتى لو كان التطبيق مغلقاً.`,
        icon: '/icon.png',
        tag: `test_push_${Date.now()}`
      });

      // 2. Dispatch external push via Push Dispatcher
      if (selectedParentId) {
        await sendParentPushNotification(selectedParentId, {
          title: '🔔 تجربة إشعار المدرسة الدولية',
          body: `فحص وصول الإشعارات: إشعارات الهاتف لولي الأمر (${activeParent?.name || ''}) تعمل بكفاءة وبشكل مجاني 100%!`,
          category: 'general',
          studentId: activeChild?.id,
          studentName: activeChild?.name
        });
      }

      setTestPushSuccess(true);
      setTimeout(() => setTestPushSuccess(false), 5000);
    } catch (err) {
      console.warn('Error testing push notification:', err);
    } finally {
      setIsTestingPush(false);
    }
  };

  // Helper to copy website link for opening in Chrome
  const handleCopySiteLink = () => {
    if (typeof window !== 'undefined') {
      const url = window.location.href;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(() => {
          setCopiedLink(true);
          setTimeout(() => setCopiedLink(false), 2500);
        }).catch(() => {
          prompt('انسخ رابط المنصة لفتحه في متصفح Google Chrome:', url);
        });
      } else {
        prompt('انسخ رابط المنصة لفتحه في متصفح Google Chrome:', url);
      }
    }
  };

  // Helper to open link in Chrome on Android
  const handleOpenInChrome = () => {
    if (typeof window !== 'undefined') {
      const currentUrl = window.location.href;
      const cleanUrl = currentUrl.replace(/^https?:\/\//, '');
      const intentUrl = `intent://${cleanUrl}#Intent;scheme=https;package=com.android.chrome;end`;
      try {
        window.location.href = intentUrl;
      } catch {
        window.open(currentUrl, '_blank');
      }
    }
  };

  // Check initial permission status on load & auto-register if granted
  React.useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const currentPerm = Notification.permission;
      setPushPermissionStatus(currentPerm);

      // If already granted, auto-register/update device token silently in background
      if (currentPerm === 'granted' && selectedParentId) {
        (async () => {
          try {
            const { doc, setDoc } = await import('firebase/firestore');
            const { db } = await import('../lib/firebase');
            if (db) {
              await setDoc(doc(db, 'fcm_tokens', selectedParentId), {
                parentId: selectedParentId,
                parentName: activeParent?.name || 'ولي أمر',
                deviceInfo: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 140) : 'Web Device',
                platform: typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent) ? 'iOS' : 'Android/Web',
                permission: 'granted',
                updatedAt: Date.now()
              }, { merge: true });
            }
          } catch (e) {
            // silent catch
          }
        })();
      }
    }
  }, [selectedParentId, activeParent]);

  // Subscribe to real-time notifications from Firestore
  React.useEffect(() => {
    if (!setMessages) return;

    // Check offline status reactively
    const updateOnlineStatus = () => {
      setIsFirebaseLive(navigator.onLine);
      if (!navigator.onLine) {
        setFirebaseErrorMsg('⚠️ انقطع الاتصال بالإنترنت. يتم عرض الإشعارات المخزنة محلياً.');
      } else {
        setFirebaseErrorMsg('');
      }
    };

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    updateOnlineStatus(); // Check initial

    let unsubscribeFirestore: (() => void) | undefined;

    const setupSubscription = async () => {
      try {
        const { collection, onSnapshot, query, orderBy } = await import('firebase/firestore');
        const { db } = await import('../lib/firebase');

        const q = query(
          collection(db, 'notifications'),
          orderBy('date', 'asc') // Sort by date ascending to match messages flow
        );

        unsubscribeFirestore = onSnapshot(q, (snapshot) => {
          setIsFirebaseLive(true);
          setFirebaseErrorMsg('');
          
          snapshot.docChanges().forEach((change) => {
            if (change.type === "added") {
              const data = change.doc.data();
              const newMsg: Message = {
                id: data.id || change.doc.id,
                senderId: data.senderId,
                senderName: data.senderName,
                senderRole: data.senderRole,
                receiverId: data.receiverId,
                receiverName: data.receiverName,
                receiverRole: data.receiverRole,
                content: data.content,
                date: data.date || new Date().toISOString(),
                read: data.read || false,
                studentId: data.studentId
              };

              // Only show alerts and system pushes for incoming notifications targeting this parent
              const isTargetParent = newMsg.receiverId === selectedParentId || 
                newMsg.receiverId === 'all' || 
                newMsg.receiverId === 'all_cohort_parents' || 
                (newMsg.receiverId?.startsWith('all_class_') && activeChild?.classId === newMsg.receiverId.replace('all_class_', '')) ||
                newMsg.receiverRole === 'parent';
              
              setMessages(prev => {
                if (prev.some(m => m.id === newMsg.id)) {
                  return prev;
                }
                
                // Trigger native push notification
                if (isTargetParent && !newMsg.read) {
                  const notifTitle = data.title || newMsg.senderName || 'إشعار مدرسي جديد 🔔';
                  const notifBody = data.body || newMsg.content;
                  safeShowNotification(notifTitle, {
                    body: notifBody,
                    icon: '/icon.png',
                    tag: `notif_${newMsg.id}`,
                    // @ts-ignore
                    renotify: false,
                    data: {
                      msgId: newMsg.id,
                      url: `/?portal=parent&tab=messages&msgId=${newMsg.id}`
                    }
                  });
                }

                const updated = [...prev, newMsg];
                localStorage.setItem('school_messages', JSON.stringify(updated));
                return updated;
              });
            } else if (change.type === "modified") {
              const data = change.doc.data();
              if (data.read) {
                const docId = data.id || change.doc.id;
                dismissNotification(docId);
                setMessages(prev => {
                  const updated = prev.map(m => m.id === docId ? { ...m, read: true } : m);
                  localStorage.setItem('school_messages', JSON.stringify(updated));
                  return updated;
                });
              }
            }
          });
        }, (error) => {
          console.error("Firestore subscription error:", error);
          setIsFirebaseLive(false);
          setFirebaseErrorMsg('⚠️ انقطع الاتصال المباشر بقاعدة البيانات. تصفح الإشعارات محلياً.');
        });

      } catch (err) {
        console.error("Error starting Firestore subscription:", err);
        setIsFirebaseLive(false);
        setFirebaseErrorMsg('⚠️ خطأ في تهيئة الاتصال السحابي بالخادم.');
      }
    };

    setupSubscription();

    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
      if (unsubscribeFirestore) {
        unsubscribeFirestore();
      }
    };
  }, [setMessages, selectedParentId]);

  // Handle opening message from external notification click or service worker message
  React.useEffect(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const urlTab = urlParams.get('tab');
      const urlMsgId = urlParams.get('msgId');

      if (urlTab === 'messages') {
        setActiveTab('messages');
      }

      if (urlMsgId) {
        markAsRead(urlMsgId);
        const match = messages.find(m => m.id === urlMsgId);
        if (match) {
          setOpenedMessageDetail(match);
        }
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, '', cleanUrl);
      }
    } catch {
      // ignore
    }

    const handleSwMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'OPEN_MESSAGE') {
        setActiveTab('messages');
        const mId = event.data.msgId;
        if (mId) {
          markAsRead(mId);
          const match = messages.find(m => m.id === mId);
          if (match) {
            setOpenedMessageDetail(match);
          }
        }
      }
    };

    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSwMessage);
    }

    return () => {
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleSwMessage);
      }
    };
  }, [messages]);

  const executeStudentLogin = async (rawInput: string, isAuto: boolean = false) => {
    const cleanInput = rawInput.trim();
    if (!cleanInput) {
      if (!isAuto) {
        setLoginError('يرجى إدخال الرقم الموحد المخصص للطالب أولاً');
      }
      return;
    }

    setIsLoggingIn(true);
    setLoginError('');

    try {
      // 1. Look up student in in-memory students list
      let foundStudent = findStudentByUnifiedInput(cleanInput, students);

      // 2. Look up in localStorage school_students
      if (!foundStudent) {
        const latestStudentsRaw = localStorage.getItem('school_students');
        if (latestStudentsRaw) {
          try {
            const parsed = JSON.parse(latestStudentsRaw);
            if (Array.isArray(parsed) && parsed.length > 0) {
              foundStudent = findStudentByUnifiedInput(cleanInput, parsed);
            }
          } catch {}
        }
      }

      // 3. If not found locally, fast single-doc fetch for school_students directly from Firestore (takes ~150ms)
      if (!foundStudent) {
        const directList = await fetchStudentsOnlyDirectly();
        if (Array.isArray(directList) && directList.length > 0) {
          foundStudent = findStudentByUnifiedInput(cleanInput, directList);
        }
      }

      // 4. Check sent grade sheets archive for this student
      if (!foundStudent) {
        const sentSheetsRaw = localStorage.getItem('school_sent_grade_sheets');
        if (sentSheetsRaw) {
          try {
            const parsedSheets = JSON.parse(sentSheetsRaw);
            if (Array.isArray(parsedSheets)) {
              for (const sh of parsedSheets) {
                if (Array.isArray(sh.studentsSummary)) {
                  const match = sh.studentsSummary.find((sum: any) =>
                    (sum.unifiedNo && String(sum.unifiedNo).trim() === cleanInput) ||
                    (sum.rollNo && String(sum.rollNo).trim() === cleanInput) ||
                    (sum.studentName && sum.studentName.trim().toLowerCase() === cleanInput.toLowerCase())
                  );
                  if (match) {
                    foundStudent = {
                      id: match.studentId || ('s_' + (match.unifiedNo || cleanInput)),
                      name: match.studentName,
                      classId: sh.classId || 'class-auto',
                      parentId: 'p_' + (match.studentId || cleanInput),
                      rollNo: match.rollNo || match.unifiedNo || cleanInput,
                      unifiedNo: match.unifiedNo || match.rollNo || cleanInput,
                      gender: 'male',
                      dob: '2015-01-01',
                      parentName: match.parentName || `ولي أمر ${match.studentName}`,
                      parentPhone: match.parentPhone || ''
                    };
                    break;
                  }
                }
              }
            }
          } catch {}
        }
      }

      if (foundStudent) {
        setActiveDirectStudent(foundStudent);
        localStorage.setItem('parent_portal_active_student_obj', JSON.stringify(foundStudent));
        setLoggedInStudentId(foundStudent.id);
        localStorage.setItem('parent_portal_student_id', foundStudent.id);
        localStorage.setItem('parent_portal_unified_no', foundStudent.unifiedNo || foundStudent.rollNo || '');
        localStorage.setItem('parent_portal_saved_login_input', cleanInput);
        localStorage.setItem('parent_portal_auto_login', rememberMe ? 'true' : 'false');
        setLoginError('');
      } else {
        if (!isAuto) {
          setLoginError(
            `لم يتم العثور على طالب مسجل بالرقم الموحد (${cleanInput}).\n` +
            `يرجى التأكد من كتابة الرقم الموحد المخصص للطالب بشكل صحيح كما سُجل لدى إدارة المدرسة.`
          );
        }
      }
    } catch (err) {
      console.error('Error during parent login:', err);
      const fallback = findStudentByUnifiedInput(cleanInput, students);
      if (fallback) {
        setActiveDirectStudent(fallback);
        localStorage.setItem('parent_portal_active_student_obj', JSON.stringify(fallback));
        setLoggedInStudentId(fallback.id);
        localStorage.setItem('parent_portal_student_id', fallback.id);
        localStorage.setItem('parent_portal_unified_no', fallback.unifiedNo || fallback.rollNo || '');
      } else if (!isAuto) {
        setLoginError(`تعذر التحقق من الرقم الموحد (${cleanInput}). يرجى التأكد من اتصال الإنترنت والمحاولة مجدداً.`);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeStudentLogin(studentRollInput, false);
  };

  const handleLogout = () => {
    setActiveDirectStudent(null);
    localStorage.removeItem('parent_portal_active_student_obj');
    setLoggedInStudentId('');
    localStorage.removeItem('parent_portal_student_id');
    localStorage.removeItem('parent_portal_unified_no');
    localStorage.removeItem('parent_portal_saved_login_input');
    localStorage.setItem('parent_portal_auto_login', 'false'); // Disable automatic login on manual logout
    setStudentRollInput('');
    setLoginError('');
  };

  const markAsRead = async (msgId: string) => {
    if (setMessages) {
      setMessages(prev => {
        const updated = prev.map(m => m.id === msgId ? { ...m, read: true } : m);
        localStorage.setItem('school_messages', JSON.stringify(updated));
        return updated;
      });
    }

    // Dismiss external push/system notification immediately so it vanishes from status bar
    await dismissNotification(msgId);
    await dismissNotification(`notif_${msgId}`);

    // Update in Firestore notifications collection
    try {
      const { doc, updateDoc, collection, query, where, getDocs } = await import('firebase/firestore');
      const { db } = await import('../lib/firebase');
      if (db) {
        // Direct document update
        updateDoc(doc(db, 'notifications', msgId), {
          read: true,
          status: 'read'
        }).catch(() => {});

        // Query documents where id field matches
        const q = query(collection(db, 'notifications'), where('id', '==', msgId));
        getDocs(q).then(snap => {
          snap.forEach(d => {
            updateDoc(doc(db, 'notifications', d.id), {
              read: true,
              status: 'read'
            }).catch(() => {});
          });
        }).catch(() => {});
      }
    } catch {
      // ignore
    }

    // If all messages targeting this parent are read, dismiss all notifications completely
    try {
      const remainingUnread = messages.filter(m => {
        const isTarget = m.receiverId === selectedParentId || 
          m.receiverId === selectedChildId || 
          m.receiverRole === 'parent' || 
          m.receiverId === 'all' || 
          m.receiverId === 'all_cohort_parents' || 
          (m.receiverId?.startsWith('all_class_') && activeChild?.classId === m.receiverId.replace('all_class_', ''));
        return isTarget && !m.read && m.id !== msgId;
      });
      if (remainingUnread.length === 0) {
        await dismissAllNotifications();
      }
    } catch {
      // ignore
    }
  };

  const markAllAsRead = async () => {
    if (setMessages) {
      setMessages(prev => {
        const updated = prev.map(m => {
          const isTarget = m.receiverId === selectedParentId || 
            m.receiverId === selectedChildId || 
            m.receiverRole === 'parent' || 
            m.receiverId === 'all' || 
            m.receiverId === 'all_cohort_parents' || 
            (m.receiverId?.startsWith('all_class_') && activeChild?.classId === m.receiverId.replace('all_class_', ''));
          return isTarget && !m.read ? { ...m, read: true } : m;
        });
        localStorage.setItem('school_messages', JSON.stringify(updated));
        return updated;
      });
    }

    // Dismiss all system notifications
    await dismissAllNotifications();

    try {
      const { collection, getDocs, query, where, updateDoc, doc } = await import('firebase/firestore');
      const { db } = await import('../lib/firebase');
      if (db && selectedParentId) {
        const q = query(collection(db, 'notifications'), where('receiverId', '==', selectedParentId));
        const snap = await getDocs(q);
        snap.forEach(d => {
          if (!d.data().read) {
            updateDoc(doc(db, 'notifications', d.id), { read: true, status: 'read' }).catch(() => {});
          }
        });
      }
    } catch {
      // ignore
    }
  };

  const handleOpenMessage = (msg: Message) => {
    markAsRead(msg.id);
    setOpenedMessageDetail(msg);
  };

  const handleOpenAnnouncement = (ann: Announcement) => {
    if (!readAnnouncementIds.includes(ann.id)) {
      const updated = [...readAnnouncementIds, ann.id];
      setReadAnnouncementIds(updated);
      try {
        localStorage.setItem(`read_announcements_${selectedParentId}`, JSON.stringify(updated));
      } catch {
        // ignore
      }
    }
    dismissNotification(ann.id);
    dismissNotification(`ann_${ann.id}`);
  };

  const handleDeleteParentMessage = (msgId: string) => {
    if (window.confirm('هل تريد حذف هذا الإشعار/الرسالة نهائياً من عرضك؟')) {
      if (setMessages) {
        setMessages(prev => {
          const updated = prev.filter(m => m.id !== msgId);
          localStorage.setItem('school_messages', JSON.stringify(updated));
          return updated;
        });
      }
    }
  };

  // Tuition data state and seeding
  interface PaymentInstallment {
    id: string;
    amount: number;
    date: string;
    note: string;
  }

  interface TuitionInfo {
    studentId: string;
    totalAmount: number;
    installments: PaymentInstallment[];
  }

  const [tuitions, setTuitions] = useState<Record<string, TuitionInfo>>(() => {
    const saved = localStorage.getItem('school_tuitions');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const migrated: Record<string, TuitionInfo> = {};
        Object.keys(parsed).forEach(key => {
          const item = parsed[key];
          if (item && typeof item === 'object') {
            if (!item.hasOwnProperty('installments')) {
              const paid = Number(item.paidAmount) || 0;
              migrated[key] = {
                studentId: item.studentId,
                totalAmount: Number(item.totalAmount) || 0,
                installments: paid > 0 ? [
                  {
                    id: 'inst_mig_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                    amount: paid,
                    date: item.paymentDate || new Date().toISOString().split('T')[0],
                    note: 'دفعة سابقة'
                  }
                ] : []
              };
            } else {
              migrated[key] = item;
            }
          }
        });
        return migrated;
      } catch (e) {
        // ignore
      }
    }
    return {};
  });

  const isTeacherGradeMessage = (m: Message) => {
    if (m.senderRole !== 'teacher' && m.senderRole !== 'director') return false;
    const contentLower = (m.content || '').toLowerCase();
    return (
      m.category === 'grades' ||
      m.category === 'grade_report' ||
      contentLower.includes('درج') ||
      contentLower.includes('رصد') ||
      contentLower.includes('كشف') ||
      contentLower.includes('تقييم') ||
      contentLower.includes('امتحان') ||
      contentLower.includes('اختبار') ||
      contentLower.includes('أكاديمي')
    );
  };

  const childBehaviorMessages = messages.filter(m => {
    // Strictly scoped to this student: if studentId exists, must match selectedChildId
    const isForChild = m.studentId ? m.studentId === selectedChildId : true;
    const isForParent = m.receiverId === selectedParentId || m.receiverRole === 'parent' || m.receiverId === 'parent' || m.receiverId === selectedChildId;
    const isFromStaff = m.senderRole === 'teacher' || m.senderRole === 'director';
    const isBehavior = m.content.includes('سلوك') || 
                       m.content.includes('تنبيه سلوكي') || 
                       m.content.includes('تصنيف الإشعار: سلوك') ||
                       m.content.includes('ملاحظة سلوكية') ||
                       m.content.includes('تقييم سلوكي');
    return isForParent && isForChild && isFromStaff && isBehavior;
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const unreadBehaviorCount = childBehaviorMessages.filter(m => !m.read).length;

  const unreadMessagesCount = messages.filter(m => {
    const isForChild = !m.studentId || m.studentId === selectedChildId;
    const isClassCircular = m.receiverId?.startsWith('all_class_') && activeChild?.classId === m.receiverId.replace('all_class_', '');
    const isCohortCircular = m.receiverId === 'all_cohort_parents' || m.receiverId === 'all';
    const isDirectToMe = m.receiverId === selectedParentId || (m.receiverRole === 'parent' && !m.receiverId);
    const isTarget = isForChild && (isDirectToMe || isCohortCircular || isClassCircular);
    const isIncoming = m.senderRole !== 'parent' && m.senderId !== selectedParentId;
    return isTarget && isIncoming && !m.read;
  }).length;

  // Tabs inside parent portal
  const [activeTab, setActiveTab] = useState<'grades' | 'attendance' | 'announcements' | 'messages' | 'behavior' | 'excuse' | 'tuition'>('grades');

  // Grades filtering, sorting, and view sub-modes ('subjects' | 'individual')
  const [gradesViewMode, setGradesViewMode] = useState<'subjects' | 'individual'>('subjects');
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>('all');
  const [gradeTypeFilter, setGradeTypeFilter] = useState<'all' | 'monthly' | 'special' | 'general'>('all');
  const [gradeSortBy, setGradeSortBy] = useState<'date' | 'scoreDesc' | 'scoreAsc' | 'subject'>('date');

  // Messages/Behaviors filtering state
  const [messageTypeFilter, setMessageTypeFilter] = useState<'all' | 'behaviors' | 'chats'>('all');





  const [inputTotal, setInputTotal] = useState<number | ''>('');
  const [parentInstallments, setParentInstallments] = useState<PaymentInstallment[]>([]);

  React.useEffect(() => {
    const handleStorageUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<{ key: string; value: string }>;
      const { key, value } = customEvent.detail;
      
      try {
        const parsed = JSON.parse(value);
        switch (key) {
          case 'school_tuitions':
            setTuitions(parsed);
            break;
          case 'school_monthly_evaluations':
            setMonthlyEvaluations(parsed);
            break;
          case 'school_blocked_grades':
            setBlockedGrades(parsed);
            break;
          case 'school_evaluation_current_month':
            setCurrentEvaluationMonth(value.startsWith('"') ? parsed : value);
            break;
          case 'school_sent_grade_sheets':
            setSentGradeSheets(deduplicateGradeSheets(parsed));
            break;
        }
      } catch (err) {
        if (key === 'school_evaluation_current_month') {
          setCurrentEvaluationMonth(value);
        } else {
          console.warn('Error parsing storage update in ParentPortal.tsx', err);
        }
      }
    };

    window.addEventListener('school_storage_update', handleStorageUpdate);

    // Initial load check to capture early Firebase synced keys in localStorage
    const reloadFromLocalStorage = () => {
      const savedSheets = localStorage.getItem('school_sent_grade_sheets');
      if (savedSheets) {
        try { setSentGradeSheets(deduplicateGradeSheets(JSON.parse(savedSheets))); } catch (e) {}
      }
      const savedTuitions = localStorage.getItem('school_tuitions');
      if (savedTuitions) {
        try { setTuitions(JSON.parse(savedTuitions)); } catch (e) {}
      }
      const savedEval = localStorage.getItem('school_monthly_evaluations');
      if (savedEval) {
        try { setMonthlyEvaluations(JSON.parse(savedEval)); } catch (e) {}
      }
      const savedBlocked = localStorage.getItem('school_blocked_grades');
      if (savedBlocked) {
        try { setBlockedGrades(JSON.parse(savedBlocked)); } catch (e) {}
      }
      const savedMonth = localStorage.getItem('school_evaluation_current_month');
      if (savedMonth) {
        try { setCurrentEvaluationMonth(savedMonth.startsWith('"') ? JSON.parse(savedMonth) : savedMonth); } catch (e) {}
      }
    };
    reloadFromLocalStorage();

    return () => {
      window.removeEventListener('school_storage_update', handleStorageUpdate);
    };
  }, []);

  // Sync inputs with selected child reactively and reload from localStorage in case of director updates
  React.useEffect(() => {
    const saved = localStorage.getItem('school_tuitions');
    let currentTuitions = tuitions;
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const migrated: Record<string, TuitionInfo> = {};
        let needsMigration = false;
        Object.keys(parsed).forEach(key => {
          const item = parsed[key];
          if (item && typeof item === 'object') {
            if (!item.hasOwnProperty('installments')) {
              needsMigration = true;
              const paid = Number(item.paidAmount) || 0;
              migrated[key] = {
                studentId: item.studentId,
                totalAmount: Number(item.totalAmount) || 0,
                installments: paid > 0 ? [
                  {
                    id: 'inst_mig_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                    amount: paid,
                    date: item.paymentDate || new Date().toISOString().split('T')[0],
                    note: 'دفعة سابقة'
                  }
                ] : []
              };
            } else {
              migrated[key] = item;
            }
          }
        });
        currentTuitions = migrated;
        if (needsMigration) {
          setTuitions(migrated);
        }
      } catch (e) {
        // ignore
      }
    }

    const current = currentTuitions[selectedChildId] || {
      studentId: selectedChildId,
      totalAmount: 0,
      installments: []
    };
    setInputTotal(current.totalAmount || '');
    setParentInstallments(current.installments || []);
  }, [selectedChildId, activeTab, tuitions]);

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Monthly Evaluation state for ParentPortal
  const [currentEvaluationMonth, setCurrentEvaluationMonth] = useState<string>(() => {
    return localStorage.getItem('school_evaluation_current_month') || 'تشرين الأول';
  });
  const [parentSelectedMonth, setParentSelectedMonth] = useState<string>('');
  const [monthlyEvaluations, setMonthlyEvaluations] = useState<Record<string, { month?: string; text?: string; teacherText?: string; directorText?: string }>>(() => {
    const saved = localStorage.getItem('school_monthly_evaluations');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // ignore
      }
    }
    return {};
  });

  // Blocked Grades state for ParentPortal
  const [blockedGrades, setBlockedGrades] = useState<Record<string, { blocked: boolean; reason: string }>>(() => {
    const saved = localStorage.getItem('school_blocked_grades');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // ignore
      }
    }
    return {};
  });

  // Mark all grades for selected child as read when visiting 'grades' tab
  React.useEffect(() => {
    if (activeTab === 'grades' && selectedChildId && selectedParentId) {
      const currentChildGradeIds = grades.filter(g => g.studentId === selectedChildId).map(g => g.id);
      if (currentChildGradeIds.length > 0) {
        setReadGradeIds(prev => {
          const next = Array.from(new Set([...prev, ...currentChildGradeIds]));
          localStorage.setItem(`read_grades_${selectedParentId}`, JSON.stringify(next));
          return next;
        });
      }
      
      // Also mark monthly evaluation as read
      if (monthlyEvaluations[selectedChildId]) {
        const currentText = monthlyEvaluations[selectedChildId].text;
        localStorage.setItem(`read_monthly_eval_${selectedChildId}`, currentText);
        setReadMonthlyEval(currentText);
      }
    }
  }, [activeTab, selectedChildId, grades, selectedParentId, monthlyEvaluations]);

  // Mark all attendance for selected child as read when visiting 'attendance' tab
  React.useEffect(() => {
    if (activeTab === 'attendance' && selectedChildId && selectedParentId) {
      const currentChildAttendanceIds = attendance.filter(a => a.studentId === selectedChildId).map(a => a.id);
      if (currentChildAttendanceIds.length > 0) {
        setReadAttendanceIds(prev => {
          const next = Array.from(new Set([...prev, ...currentChildAttendanceIds]));
          localStorage.setItem(`read_attendance_${selectedParentId}`, JSON.stringify(next));
          return next;
        });
      }
    }
  }, [activeTab, selectedChildId, attendance, selectedParentId]);

  // Mark all announcements as read when visiting 'announcements' tab
  React.useEffect(() => {
    if (activeTab === 'announcements' && selectedParentId) {
      const parentAnnouncements = announcements.filter(a => a.target === 'parents' || a.target === 'all');
      const currentAnnouncementIds = parentAnnouncements.map(a => a.id);
      if (currentAnnouncementIds.length > 0) {
        setReadAnnouncementIds(prev => {
          const next = Array.from(new Set([...prev, ...currentAnnouncementIds]));
          localStorage.setItem(`read_announcements_${selectedParentId}`, JSON.stringify(next));
          return next;
        });
      }
    }
  }, [activeTab, announcements, selectedParentId]);

  // Auto mark all behavioral messages as read when parent views the behavior tab or when new behavior messages arrive
  React.useEffect(() => {
    if (activeTab === 'behavior' && selectedParentId && selectedChildId) {
      const hasUnread = childBehaviorMessages.some(m => !m.read);
      if (hasUnread) {
        if (setMessages) {
          setMessages(prev => {
            const updated = prev.map(m => {
              const isChildBehavior = m.receiverId === selectedParentId && 
                                      m.studentId === selectedChildId && 
                                      (m.content.includes('سلوك') || 
                                       m.content.includes('تنبيه سلوكي') || 
                                       m.content.includes('تصنيف الإشعار: سلوك') ||
                                       m.content.includes('تقييم'));
              if (isChildBehavior && !m.read) {
                return { ...m, read: true };
              }
              return m;
            });
            localStorage.setItem('school_messages', JSON.stringify(updated));
            return updated;
          });
        }
      }
      
      // Also mark monthly evaluation as read
      if (monthlyEvaluations[selectedChildId]) {
        const currentText = monthlyEvaluations[selectedChildId].text;
        localStorage.setItem(`read_monthly_eval_${selectedChildId}`, currentText);
        setReadMonthlyEval(currentText);
      }
    }
  }, [activeTab, selectedParentId, selectedChildId, childBehaviorMessages, monthlyEvaluations, setMessages]);

  React.useEffect(() => {
    const savedMonth = localStorage.getItem('school_evaluation_current_month') || 'تشرين الأول';
    setCurrentEvaluationMonth(savedMonth);
    const savedEval = localStorage.getItem('school_monthly_evaluations');
    if (savedEval) {
      try {
        setMonthlyEvaluations(JSON.parse(savedEval));
      } catch (e) {
        // ignore
      }
    }
    const savedBlocked = localStorage.getItem('school_blocked_grades');
    if (savedBlocked) {
      try {
        setBlockedGrades(JSON.parse(savedBlocked));
      } catch (e) {
        // ignore
      }
    }
  }, [selectedChildId, activeTab]);

  // Excuse form state
  const [excuseDate, setExcuseDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [excuseReason, setExcuseReason] = useState<string>('');

  // Parent Message state
  const [chatRecipient, setChatRecipient] = useState<'teacher' | 'director'>('teacher');
  const [selectedTeacherForChat, setSelectedTeacherForChat] = useState<string>('');

  const handleExcuseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChildId || !excuseReason) return;

    submitExcuse({
      studentId: selectedChildId,
      studentName: activeChild?.name || 'طالب',
      parentId: selectedParentId,
      date: excuseDate,
      reason: excuseReason
    });
    trackActivityOperation('write', 1);

    setExcuseReason('');
    alert('تم إرسال عذر الغياب بنجاح! سيظهر فوراً في شاشة المدير العام للاعتماد والموافقة.');
  };

  const handleSendParentMsg = (e: React.FormEvent) => {
    e.preventDefault();
    setParentMsgText('');
  };

  const renderChatPanel = () => {
    // 1. Grade Notifications Messages
    const teacherGradeMessages = messages.filter(m => {
      const isRelatedToChild = !m.studentId || m.studentId === selectedChildId;
      const isForParent = m.receiverId === selectedParentId || m.receiverRole === 'parent';
      return isRelatedToChild && isForParent && isTeacherGradeMessage(m);
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // 2. Direct Messages (Incoming & Outgoing between parent, director, teacher)
    const directMessages = messages.filter(m => {
      const isRelatedToChild = !m.studentId || m.studentId === selectedChildId;
      const isClassCircular = m.receiverId?.startsWith('all_class_') && activeChild?.classId === m.receiverId.replace('all_class_', '');
      const isCohortCircular = m.receiverId === 'all_cohort_parents' || m.receiverId === 'all';
      const isDirectToMe = m.senderId === selectedParentId || m.receiverId === selectedParentId;
      const isParentInvolved = isDirectToMe || isCohortCircular || isClassCircular || (m.receiverRole === 'parent' && !m.receiverId);
      return isRelatedToChild && isParentInvolved && !isTeacherGradeMessage(m);
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const unreadDirectCount = directMessages.filter(m => 
      (m.receiverId === selectedParentId || m.receiverId === 'all' || m.receiverId === 'all_cohort_parents' || (m.receiverId?.startsWith('all_class_') && activeChild?.classId === m.receiverId.replace('all_class_', ''))) && !m.read
    ).length;

    return (
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between min-h-[520px] text-right" style={{ direction: 'rtl' }}>
        <div className="space-y-4">
          {/* Sub-Tabs Header Navigation */}
          <div className="flex flex-wrap gap-2 border-b border-slate-100 pb-3">
            <button
              type="button"
              onClick={() => setActiveChatSubTab('send')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                activeChatSubTab === 'send'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>✍️ إرسال رسالة جديدة</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveChatSubTab('direct')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer relative ${
                activeChatSubTab === 'direct'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>💬 سجل المحادثات المباشرة</span>
              {unreadDirectCount > 0 && (
                <span className="bg-amber-400 text-slate-900 text-[9px] px-1.5 py-0.2 rounded-full font-black animate-pulse">
                  {unreadDirectCount} جديد
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveChatSubTab('grades')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                activeChatSubTab === 'grades'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Award className="w-3.5 h-3.5" />
              <span>📊 إشعارات رصد الدرجات</span>
              {teacherGradeMessages.filter(m => m.receiverId === selectedParentId && !m.read).length > 0 && (
                <span className="bg-emerald-500 text-white text-[9px] px-1.5 py-0.2 rounded-full font-bold">
                  {teacherGradeMessages.filter(m => m.receiverId === selectedParentId && !m.read).length}
                </span>
              )}
            </button>

            {(unreadDirectCount > 0 || teacherGradeMessages.filter(m => m.receiverId === selectedParentId && !m.read).length > 0) && (
              <button
                type="button"
                onClick={markAllAsRead}
                className="mr-auto flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-[11px] font-bold transition shadow-2xs cursor-pointer"
                title="تحديد كافة الرسائل كمقروءة وإخفاء التنبيهات من الجهاز"
              >
                <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>إخفاء التنبيهات وقراءة الكل 👁️</span>
              </button>
            )}
          </div>

          {/* SUCCESS BANNER */}
          {parentMsgSuccess && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-emerald-50 border border-emerald-200 p-3.5 rounded-xl text-emerald-800 text-xs font-bold flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>
                  ✅ تم إرسال رسالتك بنجاح! وستظهر فوراً بمركز الإشعارات لدى{' '}
                  {parentMsgTarget === 'director' ? 'إدارة المدرسة' : parentMsgTarget === 'teacher' ? 'معلم الصف' : 'الإدارة والمعلم'}.
                </span>
              </div>
            </motion.div>
          )}

          {/* TAB 1: SEND MESSAGE FORM */}
          {activeChatSubTab === 'send' && (
            <form onSubmit={handleParentSendMessage} className="space-y-4 pt-1">
              <div className="bg-indigo-50/60 p-3.5 rounded-2xl border border-indigo-100 space-y-1">
                <h4 className="font-extrabold text-slate-800 text-xs flex items-center gap-1.5">
                  <span>تواصل مباشر بخصوص الطالب:</span>
                  <strong className="text-indigo-600">{activeChild?.name || 'الطالب'}</strong>
                </h4>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  يمكنك إرسال استفسارك أو ملاحظتك للإدارة العامة أو معلم الصف، وستصل فورياً مع إشعار تنبيه خاص.
                </p>
              </div>

              {/* Recipient Target Selector */}
              <div className="space-y-1.5">
                <label className="block text-xs font-extrabold text-slate-700">جهة الاستلام (إلى من ترغب بإرسال الرسالة؟):</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setParentMsgTarget('director')}
                    className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 transition cursor-pointer ${
                      parentMsgTarget === 'director'
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm ring-2 ring-indigo-300'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <Building2 className="w-5 h-5" />
                    <span>🏫 إدارة المدرسة (المدير)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setParentMsgTarget('teacher')}
                    className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 transition cursor-pointer ${
                      parentMsgTarget === 'teacher'
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm ring-2 ring-indigo-300'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <UserCheck className="w-5 h-5" />
                    <span>👨‍🏫 معلم الصف ({activeChildTeacher?.name || 'المعلم'})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setParentMsgTarget('both')}
                    className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 transition cursor-pointer ${
                      parentMsgTarget === 'both'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm ring-2 ring-emerald-300'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <Sparkles className="w-5 h-5" />
                    <span>🏫👨‍🏫 الإدارة والمعلم معاً</span>
                  </button>
                </div>
              </div>

              {/* Message Category */}
              <div className="space-y-1.5">
                <label className="block text-xs font-extrabold text-slate-700">موضوع / تصنيف الرسالة:</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {['استفسار عام', 'متابعة دراسية', 'ملاحظة سلوكية', 'طلب أو استئذان'].map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setParentMsgCategory(cat)}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition cursor-pointer text-center ${
                        parentMsgCategory === cat
                          ? 'bg-indigo-100 border-indigo-400 text-indigo-900 font-extrabold'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Message Text Input */}
              <div className="space-y-1.5">
                <label className="block text-xs font-extrabold text-slate-700">نص الرسالة:</label>
                <textarea
                  value={parentMsgText}
                  onChange={e => setParentMsgText(e.target.value)}
                  placeholder="اكتب رسالتك أو استفسارك هنا بكل وضوح..."
                  rows={4}
                  className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 leading-relaxed font-medium text-slate-800"
                  required
                />
              </div>

              {/* Image Attachment Upload */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                <div className="flex items-center gap-2">
                  <label className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer">
                    <Camera className="w-4 h-4 text-indigo-600" />
                    <span>إرفاق صورة (اختياري)</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleParentImageUpload}
                      className="hidden"
                    />
                  </label>
                  {parentMsgImage && (
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
                      ✓ تم إرفاق صورة
                      <button
                        type="button"
                        onClick={() => setParentMsgImage('')}
                        className="text-rose-600 hover:text-rose-800 font-bold mr-1"
                      >
                        ✕
                      </button>
                    </span>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={!parentMsgText.trim()}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-extrabold text-xs px-6 py-2.5 rounded-xl transition flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>إرسال الرسالة الآن</span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: DIRECT MESSAGES CONVERSATION LOG */}
          {activeChatSubTab === 'direct' && (
            <div className="space-y-3 max-h-[440px] overflow-y-auto p-2 bg-slate-50/70 rounded-2xl border border-slate-100 flex flex-col gap-2">
              {directMessages.length === 0 ? (
                <div className="text-center py-16 px-4 text-slate-400 text-xs italic space-y-3">
                  <div className="w-12 h-12 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center mx-auto text-xl shadow-xs">
                    💬
                  </div>
                  <h5 className="font-bold text-slate-700 text-xs">لا توجد محادثات مباشرة حالياً</h5>
                  <p className="text-[11px] text-slate-400 max-w-sm mx-auto leading-relaxed">
                    يمكنك استخدام تبويب "✍️ إرسال رسالة جديدة" للبدء بالتواصل المباشر مع إدارة المدرسة أو المعلم.
                  </p>
                </div>
              ) : (
                directMessages.map(msg => {
                  const isSentByParent = msg.senderRole === 'parent' || msg.senderId === selectedParentId;
                  const isUnread = (msg.receiverId === selectedParentId || msg.receiverId === 'all' || msg.receiverId === 'all_cohort_parents' || msg.receiverId?.startsWith('all_class_')) && !msg.read;
                  const isCohortCircular = msg.receiverId === 'all_cohort_parents' || msg.receiverId === 'all';
                  const isClassCircular = msg.receiverId?.startsWith('all_class_');

                  return (
                    <div
                      key={msg.id}
                      onClick={() => handleOpenMessage(msg)}
                      className={`p-3.5 rounded-2xl border text-xs transition-all duration-200 text-right space-y-2 cursor-pointer ${
                        isSentByParent
                          ? 'bg-indigo-50/80 border-indigo-200 text-slate-800 mr-4 border-r-4 border-r-indigo-600'
                          : isCohortCircular || isClassCircular
                          ? 'bg-gradient-to-r from-amber-50/90 to-indigo-50/60 border-indigo-200/90 text-slate-800 ml-2 shadow-xs border-r-4 border-r-amber-500'
                          : isUnread
                          ? 'bg-amber-50 border-amber-300 text-slate-800 ml-4 ring-2 ring-amber-400 hover:bg-amber-100/60 animate-pulse'
                          : 'bg-white border-slate-200 text-slate-800 ml-4 shadow-3xs hover:border-indigo-200'
                      }`}
                    >
                      <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 border-b border-slate-100/60 pb-1.5">
                        <div className="flex items-center gap-1.5">
                          {isSentByParent ? (
                            <span className="bg-indigo-600 text-white px-2 py-0.5 rounded text-[9px] font-extrabold">
                              👤 أرسلتها أنت (ولي الأمر)
                            </span>
                          ) : msg.senderRole === 'director' ? (
                            <span className={`${isCohortCircular ? 'bg-indigo-600 text-white shadow-xs' : isClassCircular ? 'bg-emerald-600 text-white shadow-xs' : 'bg-amber-500 text-white'} px-2 py-0.5 rounded text-[9px] font-extrabold flex items-center gap-1`}>
                              {isCohortCircular ? '📢 تعميم إداري لكافة الصفوف والشعب' : isClassCircular ? '📢 تعميم إداري خاص بالصف' : '🏫 إدارة المدرسة'}
                            </span>
                          ) : (
                            <span className="bg-emerald-600 text-white px-2 py-0.5 rounded text-[9px] font-extrabold">
                              👨‍🏫 رد من المعلم ({msg.senderName})
                            </span>
                          )}

                          {isUnread && (
                            <span className="bg-red-500 text-white text-[8px] px-1.5 py-0.2 rounded font-extrabold animate-bounce mr-1">
                              جديد ✉️
                            </span>
                          )}
                        </div>

                        <span className="font-mono text-[9px] text-slate-400">
                          {new Date(msg.date).toLocaleDateString('ar-EG', { weekday: 'short', month: 'short', day: 'numeric' })}
                          {' - '}
                          {new Date(msg.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      <div className="leading-relaxed whitespace-pre-wrap text-slate-800 font-medium pt-1">
                        {renderMessageContent(msg.content)}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 3: GRADE NOTIFICATIONS */}
          {activeChatSubTab === 'grades' && (
            <div className="space-y-3.5 max-h-[420px] overflow-y-auto p-3 bg-slate-50/60 rounded-2xl border border-slate-100 flex flex-col gap-2">
              {teacherGradeMessages.length === 0 ? (
                <div className="text-center py-16 px-4 text-slate-400 text-xs italic space-y-3">
                  <div className="w-12 h-12 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center mx-auto text-xl shadow-xs">
                    📊
                  </div>
                  <h5 className="font-bold text-slate-700 text-xs">لا توجد إشعارات درجات مرصودة حالياً</h5>
                  <p className="text-[11px] text-slate-400 max-w-sm mx-auto leading-relaxed">
                    عندما تقوم الإدارة المدرسية أو المعلم برصد درجات جديدة أو إرسال كشف تقييم للطالب {activeChild?.name || 'الطالب'}، ستظهر هنا فورياً وموثقة.
                  </p>
                </div>
              ) : (
                teacherGradeMessages.map(msg => {
                  const isIncomingUnread = msg.receiverId === selectedParentId && !msg.read;
                  
                  return (
                    <div
                      key={msg.id}
                      onClick={() => handleOpenMessage(msg)}
                      className={`p-4 rounded-2xl border text-xs transition-all duration-200 text-right space-y-2 cursor-pointer ${
                        isIncomingUnread
                          ? 'bg-amber-50/90 border-amber-300 text-slate-800 ring-1 ring-amber-400 hover:bg-amber-100/60 animate-pulse shadow-sm'
                          : 'bg-white border-slate-200/80 text-slate-800 shadow-3xs hover:border-indigo-200'
                      }`}
                    >
                      <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 border-b border-slate-100 pb-2">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                          <span className="text-slate-800 font-extrabold text-[11px]">
                            {msg.senderRole === 'director' ? 'إدارة المدرسة: ' : 'المعلم: '}{msg.senderName}
                          </span>
                          {isIncomingUnread && (
                            <span className="bg-amber-500 text-white text-[8px] px-1.5 py-0.2 rounded font-extrabold animate-bounce mr-1">
                              إشعار جديد ✉️
                            </span>
                          )}
                        </div>
                        <span className="font-mono text-[9px] text-slate-400">
                          {new Date(msg.date).toLocaleDateString('ar-EG', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                          {' - '}
                          {new Date(msg.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </span>
                      </div>
                      <div className="leading-relaxed whitespace-pre-wrap text-slate-700 font-medium pt-1">
                        {renderMessageContent(msg.content)}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        <div className="pt-3 border-t border-slate-100 text-[10px] text-slate-400 text-center font-bold">
          🔒 القناة الرسمية المعتمدة للتواصل المباشر مع إدارة المدرسة والمعلمين
        </div>
      </div>
    );
  };

  // Helper to get or infer grade type
  const getGradeType = (grade: Grade): 'special' | 'monthly' | 'general' => {
    if (grade.examType) return grade.examType;
    // Fallbacks based on exam name keywords
    const name = grade.examName.toLowerCase();
    if (name.includes('خاص') || name.includes('ذكاء') || name.includes('تحدي') || name.includes('موهبة')) {
      return 'special';
    }
    if (name.includes('شهري') || name.includes('الشهري') || name.includes('مستمر') || name.includes('تقييم')) {
      return 'monthly';
    }
    return 'general';
  };

  // Filter and sort child-specific grades
  const childGrades = React.useMemo(() => {
    let list = grades.filter(g => g.studentId === selectedChildId);

    // Filter by type
    if (gradeTypeFilter !== 'all') {
      list = list.filter(g => getGradeType(g) === gradeTypeFilter);
    }

    // Sort by selected criteria
    return [...list].sort((a, b) => {
      if (gradeSortBy === 'date') {
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      }
      if (gradeSortBy === 'scoreDesc') {
        const pctA = a.score / a.maxScore;
        const pctB = b.score / b.maxScore;
        return pctB - pctA;
      }
      if (gradeSortBy === 'scoreAsc') {
        const pctA = a.score / a.maxScore;
        const pctB = b.score / b.maxScore;
        return pctA - pctB;
      }
      if (gradeSortBy === 'subject') {
        return a.subject.localeCompare(b.subject, 'ar');
      }
      return 0;
    });
  }, [grades, selectedChildId, gradeTypeFilter, gradeSortBy]);

  // Filter child-specific attendance
  const childAttendance = attendance.filter(a => a.studentId === selectedChildId);

  // Filter announcements for parents or all
  const filteredAnnouncements = announcements.filter(a => a.target === 'parents' || a.target === 'all');

  // Track unread counts for grades, attendance, announcements
  const unreadGradesCount = grades.filter(g => g.studentId === selectedChildId && !readGradeIds.includes(g.id)).length;
  const isEvalUnread = !!(monthlyEvaluations[selectedChildId] && monthlyEvaluations[selectedChildId].text.trim() && monthlyEvaluations[selectedChildId].text !== readMonthlyEval);
  const totalUnreadGrades = unreadGradesCount + (isEvalUnread ? 1 : 0);

  const unreadAttendanceCount = attendance.filter(a => a.studentId === selectedChildId && !readAttendanceIds.includes(a.id)).length;
  const unreadAnnouncementsCount = filteredAnnouncements.filter(a => !readAnnouncementIds.includes(a.id)).length;

  // Grade badge helper
  const getGradeEvaluation = (score: number, max: number) => {
    const percentage = (score / max) * 100;
    if (percentage > 90) return { label: 'ممتاز', color: 'bg-emerald-50 text-emerald-700 border border-emerald-100' };
    if (percentage > 80) return { label: 'جيد جداً', color: 'bg-teal-50 text-teal-700 border border-teal-100' };
    if (percentage > 60) return { label: 'جيد', color: 'bg-blue-50 text-blue-700 border border-blue-100' };
    if (percentage > 40) return { label: 'وسط', color: 'bg-amber-50 text-amber-700 border border-amber-100' };
    return { label: 'ضعيف', color: 'bg-rose-50 text-rose-700 border border-rose-100' };
  };

  // Format notification type and custom text
  const renderMessageContent = (content: string) => {
    // Check if there is an image attachment
    const imgMatch = content.match(/\[مرفق_صورة:\s*([^\]]+)\]/);
    // Check if there is a video attachment
    const videoMatch = content.match(/\[مرفق_فيديو:\s*([^\]]+)\]/);

    // Clean content of attachment strings for text display
    const cleanedContent = content
      .replace(/\[مرفق_صورة:\s*([^\]]+)\]/g, '')
      .replace(/\[مرفق_فيديو:\s*([^\]]+)\]/g, '')
      .trim();

    // Check if this is a official grade report notification
    if (cleanedContent.includes('📢 [إشعار رسمي: كشف درجات الطالب]') || cleanedContent.includes('كشف درجات الطالب')) {
      let parsedGrades: { subject: string; score: number }[] = [];
      let avgValue = '';
      let estimationValue = '';
      let monthValue = '';

      // Match month: "لشهر (شهر)" or "لشهر شهر"
      const monthMatch = cleanedContent.match(/لشهر\s*(?:\(([^)]+)\)|([^\s\n\(\)]+))/);
      if (monthMatch) {
        monthValue = monthMatch[1] || monthMatch[2];
      }

      const lines = cleanedContent.split('\n');
      lines.forEach(line => {
        const matchGrade = line.match(/^\s*-\s*([^:]+):\s*(\d+)/);
        if (matchGrade) {
          parsedGrades.push({
            subject: matchGrade[1].trim(),
            score: parseInt(matchGrade[2], 10)
          });
        }
        const matchAvg = line.match(/المعدل العام:\s*([\d.]+%?)/);
        if (matchAvg) {
          avgValue = matchAvg[1].trim();
        }
        const matchEst = line.match(/التقدير العام:\s*(.*)$/);
        if (matchEst) {
          estimationValue = matchEst[1].trim();
        }
      });

      // Get badge colors based on estimation
      let badgeColor = 'bg-slate-100 text-slate-700 border-slate-200';
      if (estimationValue.includes('ممتاز')) {
        badgeColor = 'bg-emerald-50 text-emerald-700 border-emerald-100';
      } else if (estimationValue.includes('جيد جداً') || estimationValue.includes('جيد جدا')) {
        badgeColor = 'bg-teal-50 text-teal-700 border-teal-100';
      } else if (estimationValue.includes('جيد')) {
        badgeColor = 'bg-blue-50 text-blue-700 border-blue-100';
      } else if (estimationValue.includes('وسط') || estimationValue.includes('مقبول')) {
        badgeColor = 'bg-amber-50 text-amber-700 border-amber-100';
      } else if (estimationValue.includes('ضعيف')) {
        badgeColor = 'bg-rose-50 text-rose-700 border-rose-100';
      }

      return (
        <div className="space-y-4 text-right" style={{ direction: 'rtl' }}>
          <div className="inline-flex items-center gap-1.5 text-[9px] font-black px-2.5 py-0.5 rounded-full border bg-indigo-50 text-indigo-700 border-indigo-100/60">
            <span>📢 إشعار رسمي: كشف الدرجات</span>
          </div>
          
          <p className="text-slate-700 text-xs leading-relaxed font-bold">
            إلى ولي أمر الطالب المحترم، تم إصدار كشف الدرجات الرسمي من إدارة المدرسة لشهر <span className="text-indigo-600 font-extrabold">{monthValue || currentEvaluationMonth}</span>.
          </p>

          {/* Horizontal Report Card Model */}
          {parsedGrades.length > 0 ? (
            <div className="bg-gradient-to-b from-white via-slate-50/50 to-white rounded-2xl border-2 border-indigo-500/30 shadow-lg p-4 space-y-4 overflow-hidden relative">
              {/* Top Banner Ribbon */}
              <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-teal-900 text-white p-3 rounded-xl shadow-xs flex flex-col sm:flex-row items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-amber-400 text-slate-950 font-black rounded-lg flex items-center justify-center text-sm shadow-2xs">
                    📜
                  </div>
                  <div>
                    <h4 className="text-xs font-black tracking-wide text-amber-300">
                      كشف الدرجات والتقرير الشهري المعتمد
                    </h4>
                    <p className="text-[10px] text-indigo-100 font-medium">
                      المدرسة الدولية الخاصة • لشهر <span className="text-amber-300 font-bold">{monthValue || currentEvaluationMonth}</span>
                    </p>
                  </div>
                </div>
                <div className="bg-emerald-500/20 border border-emerald-400/40 px-2.5 py-1 rounded-lg flex items-center gap-1.5 shrink-0">
                  <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
                  <span className="text-[10px] text-emerald-200 font-black">موثّق ومكتمل ✅</span>
                </div>
              </div>

              {/* Subject Grade Chips Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {parsedGrades.map(gv => {
                  let chipStyle = 'bg-slate-50 text-slate-800 border-slate-200';
                  let scoreBadge = 'bg-slate-200 text-slate-800';
                  let statusEmoji = '👍';

                  if (gv.score > 90) {
                    chipStyle = 'bg-emerald-50/80 text-emerald-950 border-emerald-200';
                    scoreBadge = 'bg-emerald-600 text-white';
                    statusEmoji = '🌟 ممتاز';
                  } else if (gv.score > 80) {
                    chipStyle = 'bg-teal-50/80 text-teal-950 border-teal-200';
                    scoreBadge = 'bg-teal-600 text-white';
                    statusEmoji = '🏅 جيد جداً';
                  } else if (gv.score > 60) {
                    chipStyle = 'bg-blue-50/80 text-blue-950 border-blue-200';
                    scoreBadge = 'bg-blue-600 text-white';
                    statusEmoji = '👍 جيد';
                  } else if (gv.score > 40) {
                    chipStyle = 'bg-amber-50/80 text-amber-950 border-amber-200';
                    scoreBadge = 'bg-amber-600 text-white';
                    statusEmoji = '🟢 وسط';
                  } else {
                    chipStyle = 'bg-rose-50/80 text-rose-950 border-rose-200';
                    scoreBadge = 'bg-rose-600 text-white';
                    statusEmoji = '❗ ضعيف';
                  }

                  return (
                    <div key={gv.subject} className={`p-2.5 rounded-xl border ${chipStyle} flex flex-col justify-between space-y-1 shadow-2xs`}>
                      <span className="text-[11px] font-black truncate">{gv.subject}</span>
                      <div className="flex items-center justify-between pt-1 border-t border-black/5">
                        <span className="text-[9px] font-bold opacity-80">{statusEmoji}</span>
                        <span className={`text-xs font-black font-mono px-2 py-0.5 rounded-md ${scoreBadge}`}>
                          {gv.score}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Stats & Progress Bar */}
              <div className="bg-indigo-50/80 border border-indigo-100 p-3 rounded-xl space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-indigo-950">
                  <div className="flex items-center gap-1.5">
                    <span>📈</span>
                    <span>المعدل العام للشهر:</span>
                    <span className="text-sm font-black text-indigo-700 font-mono underline">{avgValue || '---'}</span>
                  </div>
                  <div className={`px-3 py-1 rounded-lg border font-black text-xs flex items-center gap-1 ${badgeColor}`}>
                    <span>🎯 التقدير العام:</span>
                    <span>{estimationValue || '---'}</span>
                  </div>
                </div>

                {/* Progress bar visual */}
                {avgValue && (
                  <div className="space-y-1">
                    <div className="w-full bg-indigo-200/60 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-indigo-600 to-emerald-500 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, parseFloat(avgValue.replace('%', '')) || 0)}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer action button */}
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 font-bold px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
                >
                  <span>🖨️ طباعة التقرير أو حفظه PDF</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-slate-600 text-xs whitespace-pre-line">
              {cleanedContent}
            </div>
          )}

          <p className="text-slate-500 text-[10px] leading-relaxed font-bold">
            نسأل الله له دوام التوفيق والنجاح المستمر. 🌟
            <br />
            إدارة المدرسة
          </p>
        </div>
      );
    }

    const match = cleanedContent.match(/^📢 \[تصنيف الإشعار:\s*([^\]]+)\]\n([\s\S]*)$/);
    
    let badge = null;
    let actualText = cleanedContent;

    if (match) {
      const category = match[1];
      actualText = match[2];
      
      let badgeColor = 'bg-indigo-50 text-indigo-700 border-indigo-100';
      if (category.includes('شكر') || category.includes('تقدير')) badgeColor = 'bg-amber-50 text-amber-700 border-amber-100';
      else if (category.includes('تفوق') || category.includes('أكاديمي')) badgeColor = 'bg-emerald-50 text-emerald-700 border-emerald-100';
      else if (category.includes('سلوك') || category.includes('تنبيه')) badgeColor = 'bg-rose-50 text-rose-700 border-rose-100';
      else if (category.includes('واجب')) badgeColor = 'bg-sky-50 text-sky-700 border-sky-100';
      else if (category.includes('غياب') || category.includes('تأخر')) badgeColor = 'bg-orange-50 text-orange-700 border-orange-100';
      else badgeColor = 'bg-purple-50 text-purple-700 border-purple-100';

      badge = (
        <div className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full border ${badgeColor}`}>
          <span>🔔 {category}</span>
        </div>
      );
    }

    return (
      <div className="space-y-2 text-right">
        {badge}
        <p className="text-slate-700 leading-relaxed text-xs whitespace-pre-line">{actualText}</p>
        
        {/* Render Image Attachment */}
        {imgMatch && (
          <div className="mt-2 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 max-w-xs inline-block">
            <img 
              src={imgMatch[1]} 
              alt="مرفق سلوك" 
              className="max-h-48 object-cover w-full cursor-pointer hover:opacity-95" 
              referrerPolicy="no-referrer"
              onClick={() => {
                const newTab = window.open();
                if (newTab) {
                  newTab.document.write(`<img src="${imgMatch[1]}" style="max-width:100%; height:auto;" />`);
                } else {
                  alert("تم فتح المرفق بنجاح!");
                }
              }}
            />
            <div className="p-1.5 bg-slate-50 text-[10px] text-slate-500 font-bold flex items-center gap-1 justify-center border-t border-slate-100">
              <Camera className="w-3.5 h-3.5 text-indigo-500" />
              <span>مرفق صورة سلوك/تقييم</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (!loggedInStudentId || !activeStudentObj) {
    return (
      <div id="parent-login-screen" className="bg-slate-50 min-h-screen flex flex-col items-center justify-center p-4 space-y-4 text-right" style={{ direction: 'rtl' }}>
        <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-xl p-6 sm:p-7 space-y-6">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 bg-gradient-to-tr from-indigo-600 to-indigo-700 rounded-2xl text-white shadow-md flex items-center justify-center mx-auto mb-3 overflow-hidden">
              {schoolAppIcon ? (
                <img src={schoolAppIcon} alt="الشعار" className="w-full h-full object-cover" />
              ) : (
                <User className="w-8 h-8" />
              )}
            </div>
            <span className="inline-block bg-indigo-50 text-indigo-700 text-[10px] font-bold px-3 py-1 rounded-full border border-indigo-100 mb-1">
              🎓 بوابة ولي الأمر الرسمية
            </span>
            <h2 className="text-xl font-black text-slate-800">الدخول بالرقم الموحد للطالب</h2>
            <p className="text-slate-500 text-xs leading-relaxed max-w-xs mx-auto">
              أدخل الرقم الموحد المخصص للطالب لفتح ملفه الأكاديمي والمالي بمفرده دون أي تداخل مع طلاب آخرين.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2 flex items-center justify-between">
                <span>الرقم الموحد المخصص للطالب:</span>
                <span className="text-[10px] font-normal text-indigo-600">مثال: 181 أو 15</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  enterKeyHint="go"
                  value={studentRollInput}
                  onChange={e => {
                    setLoginError('');
                    setStudentRollInput(e.target.value);
                  }}
                  placeholder="أدخل الرقم الموحد للطالب هنا..."
                  className="w-full text-base sm:text-sm border-2 border-indigo-100 focus:border-indigo-600 px-4 py-3.5 rounded-xl focus:outline-none font-mono text-center font-black bg-slate-50/80 transition shadow-inner"
                  autoFocus
                />
              </div>
            </div>

            {/* Remember Me Checkbox */}
            <div className="flex items-center justify-start gap-2.5 px-1 py-1">
              <input
                type="checkbox"
                id="remember-me-checkbox"
                checked={rememberMe}
                onChange={e => setRememberMe(e.target.checked)}
                className="w-4.5 h-4.5 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
              />
              <label htmlFor="remember-me-checkbox" className="text-xs font-bold text-slate-600 cursor-pointer select-none text-right">
                حفظ الرقم الموحد للدخول التلقائي لهذا الطالب لاحقاً 🔐
              </label>
            </div>

            {loginError && (
              <p className="text-rose-600 text-xs font-bold text-center bg-rose-50 p-3 rounded-xl border border-rose-200 leading-relaxed whitespace-pre-line">
                ⚠️ {loginError}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 disabled:opacity-85 text-white font-black py-3.5 rounded-xl transition cursor-pointer text-base shadow-md shadow-indigo-100 flex items-center justify-center gap-2 active:scale-[0.99]"
            >
              {isLoggingIn ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-indigo-200" />
                  <span>جارٍ الفتح...</span>
                </>
              ) : (
                <>
                  <span className="text-base font-black tracking-wide">فــتــح</span>
                  <UserCheck className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

          <div className="border-t border-slate-100 pt-3 text-center space-y-2">
            <p className="text-[10px] text-slate-400">المدرسة الدولية الخاصة - مدينة مارع</p>
            <PortalDesignerBadge variant="subtle" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id="parent-portal-root" className="bg-slate-50 min-h-full rounded-2xl border border-slate-200 overflow-hidden shadow-md flex flex-col md:flex-row">
      {/* Parent App Sidebar */}
      <div id="parent-sidebar" className="w-full md:w-64 bg-slate-950 text-white p-4 md:p-6 flex flex-col justify-between">
        <div>
          {/* Sidebar Header with Mobile Hamburger menu on Mobile */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4 md:mb-6 md:pb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-indigo-600 rounded-xl text-white shadow-sm overflow-hidden flex items-center justify-center shrink-0">
                {schoolAppIcon ? (
                  <img src={schoolAppIcon} alt="الشعار" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-5 h-5" />
                )}
              </div>
              <div className="text-right">
                <div className="flex items-center gap-1.5">
                  <h3 className="font-black text-sm text-slate-100">{activeChild?.name || 'ملف الطالب'}</h3>
                  <button
                    type="button"
                    onClick={() => setShowWelcomeModal(true)}
                    className="p-1 text-amber-300 hover:text-amber-200 hover:bg-slate-900 rounded-md transition cursor-pointer"
                    title="رسالة الترحيب"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                  </button>
                </div>
                <span className="text-[10px] text-indigo-400 font-extrabold block">
                  الرقم الموحد: #{activeChild?.unifiedNo || activeChild?.rollNo || '---'}
                </span>
              </div>
            </div>

            {/* Hamburger Button and Unread Notification Button for Mobile */}
            <div className="flex items-center gap-2 md:hidden">
              {unreadMessagesCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const unreadList = messages.filter(m => {
                      const isForChild = !m.studentId || m.studentId === selectedChildId;
                      const isClassCircular = m.receiverId?.startsWith('all_class_') && activeChild?.classId === m.receiverId.replace('all_class_', '');
                      const isCohortCircular = m.receiverId === 'all_cohort_parents' || m.receiverId === 'all';
                      const isDirectToMe = m.receiverId === selectedParentId || (m.receiverRole === 'parent' && !m.receiverId);
                      const isTarget = isForChild && (isDirectToMe || isCohortCircular || isClassCircular);
                      return isTarget && !m.read;
                    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                    if (unreadList.length > 0) {
                      handleOpenMessage(unreadList[0]);
                    }
                    markAllAsRead();
                  }}
                  className="relative p-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl transition cursor-pointer shadow-sm animate-pulse flex items-center justify-center"
                  title="رسالة وإشعار جديد - اضغط لفتح الرسالة فوراً وإخفاء العداد"
                >
                  <Bell className="w-4 h-4" />
                  <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[9px] font-black rounded-full w-4 h-4 flex items-center justify-center">
                    {unreadMessagesCount}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="p-2 text-slate-300 hover:text-white hover:bg-slate-900 rounded-lg transition cursor-pointer"
                aria-label="القائمة"
              >
                {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Collapsible Content Area on Mobile */}
          <div className={`${isMobileMenuOpen ? 'block' : 'hidden md:block'} space-y-4`}>
            {/* Single Student Card with Unified Number and Switch Student Button */}
            <div className="bg-slate-900/80 p-4 rounded-2xl border border-slate-800 space-y-3 text-right">
              <div>
                <span className="inline-flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 mb-1.5">
                  <Hash className="w-3 h-3 text-indigo-400" />
                  <span>الرقم الموحد: #{activeChild?.unifiedNo || activeChild?.rollNo || '---'}</span>
                </span>
                <h4 className="text-sm font-black text-white">{activeChild?.name || 'الطالب'}</h4>
                <div className="text-[11px] text-slate-300 font-medium mt-1 flex flex-wrap items-center gap-1.5 justify-start">
                  <span className="text-indigo-400 font-bold">{activeChildClass?.name || 'الصف'}</span>
                  <span>•</span>
                  <span className={activeChild?.shift === 'evening' ? 'text-purple-300 font-bold' : 'text-amber-300 font-bold'}>
                    {activeChild?.shift === 'evening' ? 'فوج مسائي 🌙' : 'فوج صباحي ☀️'}
                  </span>
                </div>
                {activeChild?.parentName && (
                  <p className="text-[10px] text-slate-400 mt-1">ولي الأمر: {activeChild.parentName}</p>
                )}
              </div>

              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowSmartLinkModal(true)}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[11px] py-2 px-3 rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                  title="إنشاء ومشاركة الرابط الذكي المباشر لملف هذا الطالب"
                >
                  <Link className="w-3.5 h-3.5 text-emerald-100" />
                  <span>الرابط الذكي لملف الطالب 🔗</span>
                </button>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full bg-slate-800 hover:bg-rose-900/80 hover:border-rose-700/80 border border-slate-700 text-slate-200 hover:text-white font-bold text-[10px] py-2 px-3 rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
                  title="الخروج وإدخال رقم موحد لطالب آخر"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5 text-indigo-400" />
                  <span>تغيير الطالب (رقم موحد آخر)</span>
                </button>
              </div>
            </div>

            <nav className="space-y-1">
              <button
                onClick={() => {
                  setActiveTab('grades');
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-right text-xs font-semibold transition-all duration-200 ${
                  activeTab === 'grades' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-300 hover:bg-slate-900 hover:text-slate-100'
                }`}
              >
                <Award className="w-4.5 h-4.5 shrink-0 text-amber-400" />
                <span>رصد الدرجات والشهادات 📊</span>
                {totalUnreadGrades > 0 && (
                  <span className="mr-auto bg-red-500 text-white px-1.5 py-0.5 rounded-full text-[9px] font-bold animate-pulse">
                    {totalUnreadGrades} جديد
                  </span>
                )}
              </button>

              <button
                onClick={() => {
                  setActiveTab('attendance');
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-right text-xs font-semibold transition-all duration-200 ${
                  activeTab === 'attendance' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-300 hover:bg-slate-900 hover:text-slate-100'
                }`}
              >
                <Calendar className="w-4.5 h-4.5 shrink-0" />
                <span>التحضير والغياب اليومي</span>
                {unreadAttendanceCount > 0 ? (
                  <span className="mr-auto bg-red-500 text-white px-1.5 py-0.5 rounded-full text-[9px] font-bold animate-pulse">
                    {unreadAttendanceCount} جديد
                  </span>
                ) : (
                  childAttendance.filter(a => a.status === 'absent').length > 0 && (
                    <span className="mr-auto bg-amber-500 text-white px-1.5 py-0.5 rounded text-[9px] font-bold">
                      {childAttendance.filter(a => a.status === 'absent').length} غياب
                    </span>
                  )
                )}
              </button>

              <button
                onClick={() => {
                  setActiveTab('announcements');
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-right text-xs font-semibold transition-all duration-200 ${
                  activeTab === 'announcements' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-300 hover:bg-slate-900 hover:text-slate-100'
                }`}
              >
                <Megaphone className="w-4.5 h-4.5 shrink-0" />
                <span>التعاميم والإعلانات</span>
                {unreadAnnouncementsCount > 0 ? (
                  <span className="mr-auto bg-red-500 text-white px-1.5 py-0.5 rounded-full text-[9px] font-bold animate-pulse">
                    {unreadAnnouncementsCount} جديد
                  </span>
                ) : (
                  <span className="mr-auto bg-slate-900 px-1.5 py-0.5 rounded text-[9px] text-slate-300 font-bold">
                    {filteredAnnouncements.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => {
                  setActiveTab('messages');
                  setIsMobileMenuOpen(false);
                  if (unreadMessagesCount > 0) {
                    const unreadList = messages.filter(m => {
                      const isForChild = !m.studentId || m.studentId === selectedChildId;
                      const isClassCircular = m.receiverId?.startsWith('all_class_') && activeChild?.classId === m.receiverId.replace('all_class_', '');
                      const isCohortCircular = m.receiverId === 'all_cohort_parents' || m.receiverId === 'all';
                      const isDirectToMe = m.receiverId === selectedParentId || (m.receiverRole === 'parent' && !m.receiverId);
                      const isTarget = isForChild && (isDirectToMe || isCohortCircular || isClassCircular);
                      return isTarget && !m.read;
                    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                    if (unreadList.length > 0) {
                      handleOpenMessage(unreadList[0]);
                    }
                    markAllAsRead();
                  }
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-right text-xs font-semibold transition-all duration-200 cursor-pointer ${
                  activeTab === 'messages' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-300 hover:bg-slate-900 hover:text-slate-100'
                }`}
              >
                <MessageSquare className="w-4.5 h-4.5 shrink-0 text-emerald-400" />
                <span>تواصل مباشر + إشعارات الدرجات 💬</span>
                {unreadMessagesCount > 0 && (
                  <span 
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveTab('messages');
                      setIsMobileMenuOpen(false);
                      const unreadList = messages.filter(m => {
                        const isForChild = !m.studentId || m.studentId === selectedChildId;
                        const isClassCircular = m.receiverId?.startsWith('all_class_') && activeChild?.classId === m.receiverId.replace('all_class_', '');
                        const isCohortCircular = m.receiverId === 'all_cohort_parents' || m.receiverId === 'all';
                        const isDirectToMe = m.receiverId === selectedParentId || (m.receiverRole === 'parent' && !m.receiverId);
                        const isTarget = isForChild && (isDirectToMe || isCohortCircular || isClassCircular);
                        return isTarget && !m.read;
                      }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                      if (unreadList.length > 0) {
                        handleOpenMessage(unreadList[0]);
                      }
                      markAllAsRead();
                    }}
                    className="mr-auto bg-emerald-500 hover:bg-emerald-600 text-white px-2 py-0.5 rounded-full text-[9px] font-black animate-pulse shadow-xs cursor-pointer"
                    title="اضغط لفتح الرسالة مباشرة وإخفاء العداد"
                  >
                    {unreadMessagesCount} جديد
                  </span>
                )}
              </button>

              <button
                onClick={() => {
                  setActiveTab('behavior');
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-right text-xs font-semibold transition-all duration-200 ${
                  activeTab === 'behavior' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-300 hover:bg-slate-900 hover:text-slate-100'
                }`}
              >
                <Heart className="w-4.5 h-4.5 shrink-0 text-rose-400 fill-rose-400/20 animate-pulse" />
                <span>سلوك الطالب</span>
                {unreadBehaviorCount > 0 && (
                  <span className="mr-auto bg-red-500 text-white px-1.5 py-0.5 rounded-full text-[9px] font-bold animate-pulse">
                    {unreadBehaviorCount} جديد
                  </span>
                )}
              </button>

              <button
                onClick={() => {
                  setActiveTab('tuition');
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-right text-xs font-semibold transition-all duration-200 ${
                  activeTab === 'tuition' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-300 hover:bg-slate-900 hover:text-slate-100'
                }`}
              >
                <Coins className="w-4.5 h-4.5 shrink-0 text-amber-400" />
                <span>القسط المالي الدراسي</span>
                {((Number(inputTotal) || 0) - parentInstallments.reduce((sum, inst) => sum + inst.amount, 0)) > 0 ? (
                  <span className="mr-auto bg-amber-600/90 text-white px-2 py-0.5 rounded-full text-[9px] font-bold font-mono">
                    {((Number(inputTotal) || 0) - parentInstallments.reduce((sum, inst) => sum + inst.amount, 0)).toLocaleString('en-US')} $
                  </span>
                ) : (
                  <span className="mr-auto bg-emerald-600 text-white px-2 py-0.5 rounded-full text-[9px] font-bold font-mono">
                    مكتمل 🇺🇸
                  </span>
                )}
              </button>
            </nav>


          </div>
        </div>

        {/* Portal Info - Collapsible on Mobile */}
        <div className={`${isMobileMenuOpen ? 'block mt-6' : 'hidden md:block'} mt-8 border-t border-slate-800 pt-4 text-[10px] text-slate-400 text-right space-y-2`}>
          <p>تطبيق ولي الأمر المعتمد - نظام المدرسة الدولية</p>
          <PortalDesignerBadge variant="dark" />
        </div>
      </div>

      {/* Main content body */}
      <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto min-h-screen w-full">
        {/* Active Child Summary Header - Dedicated to Single Student with Unified Number */}
        {activeChild ? (
          <div className="mb-6 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col xl:flex-row items-stretch xl:items-center gap-4 justify-between">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-800 text-white flex items-center justify-center font-black text-xl shadow-sm shrink-0">
                {activeChild?.name?.charAt(0) || 'ط'}
              </div>
              <div className="text-right">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-extrabold text-slate-900 text-lg">{activeChild?.name || 'الطالب'}</h2>
                  <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                    activeChild?.shift === 'evening'
                      ? 'bg-purple-50 text-purple-700 border-purple-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}>
                    {activeChild?.shift === 'evening' ? 'الفوج المسائي 🌙' : 'الفوج الصباحي ☀️'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 mt-1">
                  <span>الصف: <strong className="text-indigo-700 font-bold">{activeChildClass?.name || 'عام'}</strong></span>
                  <span className="text-slate-300">•</span>
                  <span>الرقم الموحد: <strong className="font-mono text-indigo-700 font-bold">#{activeChild?.unifiedNo || activeChild?.rollNo || '---'}</strong></span>
                  {activeChild?.parentName && (
                    <>
                      <span className="text-slate-300">•</span>
                      <span>ولي الأمر: <strong className="text-slate-800 font-medium">{activeChild.parentName}</strong></span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Dedicated Unified Number Badge & Switch Button & Compact Notification Button */}
            <div className="flex flex-wrap items-center gap-2.5 self-stretch xl:self-auto">
              <div className="bg-gradient-to-br from-indigo-50 to-slate-50 border-2 border-indigo-500/30 p-2.5 px-3 rounded-2xl flex items-center justify-between sm:justify-start gap-3 shadow-2xs">
                <div className="text-right">
                  <span className="text-[10px] text-indigo-600 font-extrabold block">الرقم الموحد:</span>
                  <span className="text-sm font-black text-indigo-950 font-mono tracking-wider">
                    #{activeChild?.unifiedNo || activeChild?.rollNo || '---'}
                  </span>
                </div>
                <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-mono font-bold text-xs shadow-2xs shrink-0">
                  #{activeChild?.unifiedNo || activeChild?.rollNo}
                </div>
              </div>

              {/* زر الرابط الذكي المباشر لولي الأمر */}
              <button
                type="button"
                onClick={() => setShowSmartLinkModal(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-500 p-2.5 px-3.5 rounded-2xl text-xs font-black transition flex items-center gap-2 cursor-pointer shadow-sm shrink-0"
                title="إنشاء ومشاركة الرابط الذكي المباشر لملف هذا الطالب"
              >
                <Link className="w-4 h-4 text-emerald-100" />
                <span>الرابط الذكي 🔗</span>
              </button>

              {activeChildTeacher && (
                <div className="p-2.5 px-3 bg-slate-50 rounded-2xl border border-slate-200/80 text-xs shrink-0 text-right">
                  <span className="text-indigo-600 block text-[10px] font-bold">المعلم المشرف:</span>
                  <span className="font-bold text-slate-800">{activeChildTeacher.name}</span>
                </div>
              )}

              {/* زر الرسالة الجديدة مع العداد الذي يفتح الرسالة مباشرة ويخفي العداد */}
              {unreadMessagesCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const unreadList = messages.filter(m => {
                      const isForChild = !m.studentId || m.studentId === selectedChildId;
                      const isClassCircular = m.receiverId?.startsWith('all_class_') && activeChild?.classId === m.receiverId.replace('all_class_', '');
                      const isCohortCircular = m.receiverId === 'all_cohort_parents' || m.receiverId === 'all';
                      const isDirectToMe = m.receiverId === selectedParentId || (m.receiverRole === 'parent' && !m.receiverId);
                      const isTarget = isForChild && (isDirectToMe || isCohortCircular || isClassCircular);
                      return isTarget && !m.read;
                    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                    if (unreadList.length > 0) {
                      handleOpenMessage(unreadList[0]);
                    }
                    markAllAsRead();
                  }}
                  className="bg-amber-500 hover:bg-amber-600 text-white border border-amber-600 px-3 py-2 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer shadow-sm animate-pulse shrink-0"
                  title="لديك رسالة أو إشعار كشف درجات جديد - اضغط لفتح الرسالة مباشرة وإخفاء العداد"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-white" />
                  <span>رسالة جديدة ({unreadMessagesCount}) 📩</span>
                </button>
              )}

              {/* زر الإشعارات المصغر والأنيق */}
              {pushPermissionStatus === 'granted' ? (
                <button
                  type="button"
                  onClick={handleTestParentNotification}
                  disabled={isTestingPush}
                  className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/80 px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs shrink-0"
                  title="الإشعارات مفعلة - اضغط لإجراء تجربة"
                >
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <BellRing className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{isTestingPush ? 'فحص...' : testPushSuccess ? 'وصل بنجاح ✓' : 'الإشعارات'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={requestPushPermission}
                  className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs shrink-0"
                  title="تفعيل إشعارات الهاتف للدرجات والملاحظات"
                >
                  <Bell className="w-3.5 h-3.5 text-indigo-600" />
                  <span>تفعيل التنبيهات</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleLogout}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs shrink-0"
                title="فتح ملف طالب آخر برقم موحد مختلف"
              >
                <ArrowLeftRight className="w-3.5 h-3.5 text-indigo-600" />
                <span>تغيير الطالب</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-amber-50 p-6 rounded-2xl border border-amber-200 text-amber-800 text-sm text-center">
            يرجى إدخال الرقم الموحد للطالب للاطلاع على بياناته.
          </div>
        )}



        <AnimatePresence mode="wait">
          {activeChild && (
            <>
               {activeTab === 'grades' && (
                <motion.div
                  key="grades"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-100 shadow-2xs">
                    <div>
                      <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                        <Award className="w-5 h-5 text-indigo-600 shrink-0" />
                        <span>التقارير والشهادات الشهريّة المعتمدة</span>
                      </h3>
                      <p className="text-slate-500 text-xs mt-0.5">كشوف التقارير والتقييمات الشهريّة المعتمدة والموقعة إلكترونياً من إدارة المدرسة.</p>
                    </div>
                  </div>



                  {blockedGrades[selectedChildId]?.blocked ? (
                    <div className="bg-rose-50 border border-rose-100 p-8 rounded-3xl shadow-xs text-center space-y-4 max-w-2xl mx-auto">
                      <div className="w-16 h-16 bg-rose-500 rounded-2xl text-white shadow-md flex items-center justify-center mx-auto">
                        <ShieldAlert className="w-8 h-8" />
                      </div>
                      <h3 className="text-base font-bold text-rose-800">تنبيه من إدارة المدرسة: حجب كشف العلامات</h3>
                      <p className="text-slate-700 text-xs font-semibold leading-relaxed max-w-md mx-auto bg-white/85 p-4 rounded-xl border border-rose-100/60 shadow-2xs">
                        {blockedGrades[selectedChildId]?.reason || 'حجبت العلامات لعدم دفع القسط المالي'}
                      </p>
                      <div className="text-[10px] text-slate-400 pt-2 border-t border-rose-100/50">
                        الرجاء التواصل مع إدارة الحسابات والمالية بالمدرسة لتسوية المستحقات وتنشيط الكشف فوراً.
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Official Enhanced Monthly Grade Report Card */}
                      {(() => {
                        const savedSubjects = localStorage.getItem('school_custom_subjects');
                        const parsedSubjects = savedSubjects ? JSON.parse(savedSubjects) : [];
                        const activeSubjects = parsedSubjects.length > 0 
                          ? parsedSubjects 
                          : ['الرياضيات', 'العلوم', 'اللغة العربية', 'التربية الإسلامية', 'اللغة الإنجليزية', 'الاجتماعيات'];

                        // Get all months that have grades for this child or sent certified sheets
                        const allChildGrades = grades.filter(g => g.studentId === selectedChildId);
                        const childSentMonths = sentGradeSheets
                          .filter(sheet => sheet.studentsSummary?.some(s => 
                            s.studentId === selectedChildId || 
                            (activeChild?.unifiedNo && (s.unifiedNo === activeChild.unifiedNo || s.rollNo === activeChild.unifiedNo)) ||
                            (activeChild?.name && s.studentName === activeChild.name)
                          ))
                          .map(s => s.month);
                        const uniqueGradeMonths = Array.from(new Set([
                          ...allChildGrades.map(g => g.examName).filter(Boolean),
                          ...childSentMonths
                        ]));
                        
                        // Default month to show: prefer explicit selection, or the latest available month
                        const targetMonth = parentSelectedMonth || uniqueGradeMonths[0] || currentEvaluationMonth;
                        const studentGrades = allChildGrades.filter(g => g.examName === targetMonth);

                        // Find any certified sent grade sheet for this target month and this child
                        const sentSheetForMonth = sentGradeSheets.find(sheet => 
                          sheet.month === targetMonth && 
                          sheet.studentsSummary?.some(s => 
                            s.studentId === selectedChildId || 
                            (activeChild?.unifiedNo && (String(s.unifiedNo).trim() === String(activeChild.unifiedNo).trim() || String(s.rollNo).trim() === String(activeChild.unifiedNo).trim())) ||
                            (activeChild?.rollNo && (String(s.rollNo).trim() === String(activeChild.rollNo).trim() || String(s.unifiedNo).trim() === String(activeChild.rollNo).trim())) ||
                            (activeChild?.name && s.studentName?.trim().toLowerCase() === activeChild.name.trim().toLowerCase())
                          )
                        );
                        const sentStudentSummary = sentSheetForMonth?.studentsSummary?.find(s => 
                          s.studentId === selectedChildId || 
                          (activeChild?.unifiedNo && (String(s.unifiedNo).trim() === String(activeChild.unifiedNo).trim() || String(s.rollNo).trim() === String(activeChild.unifiedNo).trim())) ||
                          (activeChild?.rollNo && (String(s.rollNo).trim() === String(activeChild.rollNo).trim() || String(s.unifiedNo).trim() === String(activeChild.rollNo).trim())) ||
                          (activeChild?.name && s.studentName?.trim().toLowerCase() === activeChild.name.trim().toLowerCase())
                        );

                        // If sent sheet contains subjects not in activeSubjects, include them so no grades are hidden
                        const subjectsFromSent = sentStudentSummary && Array.isArray(sentStudentSummary.scores)
                          ? sentStudentSummary.scores.map(sc => sc.subject).filter(Boolean)
                          : [];
                        const combinedSubjects = Array.from(new Set([...activeSubjects, ...subjectsFromSent]));

                        let totalScore = 0;
                        let scoredCount = 0;
                        const gradeValues = combinedSubjects.map(sub => {
                          const subGrade = studentGrades.find(g => g.subject === sub);
                          let finalScore: number | null = null;
                          if (subGrade && subGrade.score !== null && subGrade.score !== undefined) {
                            finalScore = subGrade.score;
                          } else if (sentStudentSummary && Array.isArray(sentStudentSummary.scores)) {
                            const sentSub = sentStudentSummary.scores.find(sc => sc.subject === sub);
                            if (sentSub && sentSub.score !== null && sentSub.score !== undefined) {
                              finalScore = sentSub.score;
                            }
                          }

                          if (finalScore !== null) {
                            totalScore += finalScore;
                            scoredCount++;
                          }
                          return {
                            subject: sub,
                            score: finalScore
                          };
                        });

                        const calcAvg = scoredCount > 0 ? (totalScore / scoredCount).toFixed(1) : null;
                        const avg = calcAvg !== null 
                          ? calcAvg 
                          : (sentStudentSummary?.average ? String(sentStudentSummary.average).replace('%', '').trim() : null);

                        let estimation = '---';
                        let badgeColor = 'bg-slate-100 text-slate-700';
                        if (avg !== null) {
                          const avgNum = parseFloat(avg);
                          if (avgNum > 90) {
                            estimation = 'ممتاز 🌟';
                            badgeColor = 'bg-emerald-50 text-emerald-800 border-emerald-200';
                          } else if (avgNum > 80) {
                            estimation = 'جيد جداً 🎈';
                            badgeColor = 'bg-teal-50 text-teal-800 border-teal-200';
                          } else if (avgNum > 60) {
                            estimation = 'جيد 👍';
                            badgeColor = 'bg-blue-50 text-blue-800 border-blue-200';
                          } else if (avgNum > 40) {
                            estimation = 'وسط 🟢';
                            badgeColor = 'bg-amber-50 text-amber-800 border-amber-200';
                          } else {
                            estimation = 'ضعيف 🔴';
                            badgeColor = 'bg-rose-50 text-rose-800 border-rose-200';
                          }
                        } else if (sentStudentSummary?.estimation) {
                          estimation = sentStudentSummary.estimation;
                        }

                        // Evaluation for target month
                        const evalForMonth = monthlyEvaluations[`${selectedChildId}_${targetMonth}`] || 
                          monthlyEvaluations[`${activeChild?.unifiedNo}_${targetMonth}`] ||
                          monthlyEvaluations[`${activeChild?.rollNo}_${targetMonth}`] ||
                          (monthlyEvaluations[selectedChildId]?.month === targetMonth ? monthlyEvaluations[selectedChildId] : null) ||
                          monthlyEvaluations[selectedChildId] ||
                          monthlyEvaluations[activeChild?.unifiedNo || ''] ||
                          monthlyEvaluations[activeChild?.rollNo || ''];

                        const teacherMsg = evalForMonth?.teacherText !== undefined ? evalForMonth.teacherText : (evalForMonth?.text || '');
                        const directorMsg = evalForMonth?.directorText || sentStudentSummary?.directorNotes || '';

                        const schoolLogo = localStorage.getItem('school_logo_image') || schoolAppIcon;
                        const studentPhoto = localStorage.getItem(`student_photo_${selectedChildId}`) || localStorage.getItem(`student_photo_${activeChild?.name}`);

                        const getSubjectIcon = (sub: string) => {
                          if (sub.includes('عربي') || sub.includes('قرآن') || sub.includes('قراءة')) return '📖';
                          if (sub.includes('رياضيات') || sub.includes('حساب')) return '📐';
                          if (sub.includes('علوم') || sub.includes('كيمياء') || sub.includes('فيزياء') || sub.includes('أحياء')) return '🔬';
                          if (sub.includes('إسلام') || sub.includes('دين') || sub.includes('فقه') || sub.includes('توحيد')) return '🕋';
                          if (sub.includes('إنكليز') || sub.includes('انقليز') || sub.includes('English') || sub.includes('لغات')) return '🌐';
                          if (sub.includes('اجتماع') || sub.includes('تاريخ') || sub.includes('جغرافيا') || sub.includes('وطنية')) return '🌍';
                          if (sub.includes('حاسوب') || sub.includes('معلومات') || sub.includes('تكنولوجيا')) return '💻';
                          if (sub.includes('فني') || sub.includes('رسم')) return '🎨';
                          if (sub.includes('رياضة') || sub.includes('بدنية')) return '⚽';
                          return '📚';
                        };

                        const getSubjectScoreDetails = (score: number | null) => {
                          if (score === null) {
                            return {
                              text: '---',
                              appraisal: 'قيد الرصد ⏳',
                              badgeClass: 'bg-slate-100 text-slate-400 border-slate-200',
                              barColor: 'bg-slate-300',
                              percentage: 0
                            };
                          }
                          const pct = Math.min(Math.max(score, 0), 100);
                          if (score > 90) {
                            return {
                              text: `${score}`,
                              appraisal: 'ممتاز ⭐',
                              badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200 font-black',
                              barColor: 'bg-emerald-500',
                              percentage: pct
                            };
                          }
                          if (score > 80) {
                            return {
                              text: `${score}`,
                              appraisal: 'جيد جداً ✨',
                              badgeClass: 'bg-teal-50 text-teal-800 border-teal-200 font-black',
                              barColor: 'bg-teal-500',
                              percentage: pct
                            };
                          }
                          if (score > 60) {
                            return {
                              text: `${score}`,
                              appraisal: 'جيد 👍',
                              badgeClass: 'bg-blue-50 text-blue-800 border-blue-200 font-black',
                              barColor: 'bg-blue-500',
                              percentage: pct
                            };
                          }
                          if (score > 40) {
                            return {
                              text: `${score}`,
                              appraisal: 'وسط 🟢',
                              badgeClass: 'bg-amber-50 text-amber-800 border-amber-200 font-bold',
                              barColor: 'bg-amber-500',
                              percentage: pct
                            };
                          }
                          return {
                            text: `${score}`,
                            appraisal: 'ضعيف 🔴',
                            badgeClass: 'bg-rose-50 text-rose-800 border-rose-200 font-black',
                            barColor: 'bg-rose-500',
                            percentage: pct
                          };
                        };

                        return (
                          <div
                            id="parent-report-card-container"
                            className="bg-white rounded-3xl border-2 border-indigo-200 shadow-xl overflow-hidden mb-6 text-right transition-all"
                            style={{ direction: 'rtl' }}
                          >
                            {/* 1. Official School Header Banner */}
                            <div className="bg-gradient-to-l from-indigo-950 via-slate-900 to-indigo-900 text-white p-5 sm:p-6 relative overflow-hidden">
                              <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
                              <div className="absolute bottom-0 left-0 w-80 h-80 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

                              <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-4">
                                {/* School Info with Logo */}
                                <div className="flex items-center gap-3.5 w-full md:w-auto">
                                  {schoolLogo ? (
                                    <div className="w-14 h-14 rounded-2xl bg-white p-1.5 shadow-md shrink-0 flex items-center justify-center border border-white/20">
                                      <img src={schoolLogo} alt="شعار المدرسة" className="w-full h-full object-contain rounded-xl" />
                                    </div>
                                  ) : (
                                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-300 text-indigo-950 flex items-center justify-center font-black text-2xl shadow-md shrink-0">
                                      🏛️
                                    </div>
                                  )}

                                  <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-xs bg-amber-400 text-indigo-950 font-black px-2.5 py-0.5 rounded-full shadow-2xs">
                                        المدرسة الدولية الخاصة
                                      </span>
                                      <span className="text-[10px] text-indigo-200 font-bold">
                                        قسم التعليم الأساسي والابتدائي • حلب - مارع
                                      </span>
                                    </div>
                                    <h3 className="text-base sm:text-lg font-black text-white mt-1 tracking-wide">
                                      كشف درجات وتقييم المتابعة الشهرية المعتمد 📜
                                    </h3>
                                    <p className="text-[11px] text-slate-300 font-medium">
                                      وثيقة رسمية صادرة ومصدقة إلكترونياً من إدارة المدرسة لولي الأمر
                                    </p>
                                  </div>
                                </div>

                                {/* Header Actions Toolbar (No-Print) */}
                                <div className="flex items-center gap-2 flex-wrap justify-end w-full md:w-auto no-print pt-2 md:pt-0 border-t border-white/10 md:border-0">
                                  {/* Month Selector */}
                                  <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl px-2.5 py-1">
                                    <span className="text-[11px] text-amber-300 font-bold">شهر:</span>
                                    <select
                                      value={targetMonth}
                                      onChange={(e) => setParentSelectedMonth(e.target.value)}
                                      className="bg-transparent text-white text-xs font-black focus:outline-none cursor-pointer"
                                    >
                                      {Array.from(new Set([currentEvaluationMonth, ...uniqueGradeMonths])).map(m => (
                                        <option key={m} value={m} className="bg-slate-900 text-white">{m}</option>
                                      ))}
                                    </select>
                                  </div>

                                  {/* Print Button */}
                                  <button
                                    type="button"
                                    onClick={() => printElementById('parent-report-card-container', `كشف درجات الطالب ${activeChild?.name || ''} - شهر ${targetMonth}`)}
                                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 shadow-md cursor-pointer border border-indigo-400/40"
                                    title="طباعة كشف الدرجات الرسمي مع الأختام والتواقيع"
                                  >
                                    <Printer className="w-3.5 h-3.5" />
                                    <span>طباعة الشهادة</span>
                                  </button>

                                  {/* Download as Image Button */}
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      await downloadElementAsImage('parent-report-card-container', `كشف-درجات-${activeChild?.name || 'الطالب'}-${targetMonth}`);
                                    }}
                                    className="bg-white/15 hover:bg-white/25 text-white font-bold text-xs px-2.5 py-1.5 rounded-xl transition flex items-center gap-1 border border-white/20 cursor-pointer"
                                    title="حفظ الشهادة كصورة على جهازك"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                    <span>حفظ كصورة</span>
                                  </button>
                                </div>
                              </div>
                            </div>

                            {/* 2. Official Student Identity & Details Strip */}
                            <div className="bg-gradient-to-r from-indigo-50/80 via-white to-amber-50/60 p-4 border-b border-indigo-100 flex flex-wrap items-center justify-between gap-3 text-xs">
                              <div className="flex items-center gap-3">
                                {studentPhoto ? (
                                  <img
                                    src={studentPhoto}
                                    alt="صورة الطالب"
                                    className="w-12 h-12 rounded-2xl object-cover border-2 border-indigo-300 shadow-xs shrink-0"
                                  />
                                ) : (
                                  <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-700 font-black text-xl flex items-center justify-center border-2 border-indigo-200 shrink-0">
                                    👨‍🎓
                                  </div>
                                )}
                                <div>
                                  <div className="text-[10px] text-slate-500 font-bold">اسم التلميذ(ة):</div>
                                  <div className="text-sm font-black text-indigo-950">{activeChild?.name || '---'}</div>
                                  <div className="text-[10px] text-slate-500 font-medium">
                                    ولي الأمر: <span className="font-bold text-slate-700">{activeChild?.parentName || 'ولي الأمر الموقر'}</span>
                                  </div>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 text-center">
                                <div className="bg-white border border-indigo-100 px-3 py-1.5 rounded-xl shadow-2xs">
                                  <span className="text-[10px] text-slate-400 font-bold block">الصف والشعبة</span>
                                  <span className="text-xs font-black text-indigo-900 block mt-0.5">
                                    {activeChildClass?.name || 'الصف الابتدائي'}
                                  </span>
                                </div>

                                <div className="bg-white border border-indigo-100 px-3 py-1.5 rounded-xl shadow-2xs">
                                  <span className="text-[10px] text-slate-400 font-bold block">الرقم الموحد / القيد</span>
                                  <span className="text-xs font-mono font-black text-indigo-900 block mt-0.5">
                                    #{activeChild?.unifiedNo || activeChild?.rollNo || '---'}
                                  </span>
                                </div>

                                <div className="bg-white border border-indigo-100 px-3 py-1.5 rounded-xl shadow-2xs">
                                  <span className="text-[10px] text-slate-400 font-bold block">شهر التقييم</span>
                                  <span className="text-xs font-black text-indigo-900 block mt-0.5">
                                    {targetMonth}
                                  </span>
                                </div>

                                <div className="bg-white border border-indigo-100 px-3 py-1.5 rounded-xl shadow-2xs">
                                  <span className="text-[10px] text-slate-400 font-bold block">حالة التوثيق</span>
                                  <span className="text-xs font-black text-emerald-700 block mt-0.5">
                                    {scoredCount > 0 ? "معتمد وموثّق ✓" : "قيد المراجعة ⏳"}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* 3. Grades Performance Table & Layout */}
                            <div className="p-4 sm:p-6 space-y-6">
                              <div>
                                <div className="flex items-center justify-between mb-3">
                                  <h4 className="text-xs font-black text-slate-800 flex items-center gap-1.5 border-r-2 border-indigo-600 pr-2">
                                    <span>📊 جدول رصد درجات المواد والمستوى التحصيلي:</span>
                                  </h4>
                                  <span className="text-[10px] text-slate-500 font-bold bg-slate-100 px-2 py-0.5 rounded-full">
                                    الدرجة العظمى: 100 • الصغرى للنجاح: 50
                                  </span>
                                </div>

                                {/* سلم تقدير العلامة للمرحلة المعتمد */}
                                <div className="mb-3 bg-gradient-to-l from-indigo-50/70 via-slate-50 to-amber-50/70 border border-indigo-100 p-2.5 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
                                  <span className="font-black text-slate-800 text-[11px] flex items-center gap-1.5">
                                    <span>🎯</span>
                                    <span>سلم تقدير العلامة للمرحلة:</span>
                                  </span>
                                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
                                    <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
                                      🌟 من 91 إلى 100: ممتاز
                                    </span>
                                    <span className="px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 border border-teal-200">
                                      ✨ من 81 إلى 90: جيد جداً
                                    </span>
                                    <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 border border-blue-200">
                                      👍 من 61 إلى 80: جيد
                                    </span>
                                    <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                                      🟢 من 41 إلى 60: وسط
                                    </span>
                                    <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-800 border border-rose-200">
                                      🔴 من 1 إلى 40: ضعيف
                                    </span>
                                  </div>
                                </div>

                                {/* High-Fidelity Table (Desktop and Print) */}
                                <div className="overflow-x-auto rounded-2xl border border-indigo-100 shadow-2xs">
                                  <table className="w-full text-center border-collapse">
                                    <thead>
                                      <tr className="bg-gradient-to-r from-slate-100 via-indigo-50/50 to-slate-100 text-slate-700 text-xs font-black border-b border-indigo-100">
                                        <th className="p-3 text-right pr-4 font-black">المادة الدراسية</th>
                                        <th className="p-3 font-bold text-slate-600">الدرجة العظمى</th>
                                        <th className="p-3 font-bold text-slate-600">درجة النجاح</th>
                                        <th className="p-3 font-black text-indigo-950">الدرجة المحرزة</th>
                                        <th className="p-3 font-bold">التقدير والمستوى</th>
                                        <th className="p-3 font-bold min-w-[130px]">مؤشر الإتقان</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 text-xs font-bold text-slate-800 bg-white">
                                      {gradeValues.map((gv, idx) => {
                                        const details = getSubjectScoreDetails(gv.score);
                                        const icon = getSubjectIcon(gv.subject);
                                        return (
                                          <tr
                                            key={gv.subject}
                                            className={`hover:bg-indigo-50/30 transition ${idx % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'}`}
                                          >
                                            <td className="p-3 text-right pr-4 font-black text-slate-900 flex items-center gap-2">
                                              <span className="text-base">{icon}</span>
                                              <span>{gv.subject}</span>
                                            </td>
                                            <td className="p-3 font-mono text-slate-500 font-bold">100</td>
                                            <td className="p-3 font-mono text-slate-500 font-bold">50</td>
                                            <td className="p-3">
                                              {gv.score !== null ? (
                                                <span className={`inline-block px-3 py-1 rounded-xl font-mono text-sm font-black border shadow-2xs ${details.badgeClass}`}>
                                                  {gv.score}
                                                </span>
                                              ) : (
                                                <span className="text-slate-300 font-light font-mono">---</span>
                                              )}
                                            </td>
                                            <td className="p-3">
                                              <span className="text-xs font-extrabold">{details.appraisal}</span>
                                            </td>
                                            <td className="p-3 px-4">
                                              <div className="w-full bg-slate-150 rounded-full h-2.5 overflow-hidden flex items-center shadow-inner">
                                                <div
                                                  className={`h-full rounded-full transition-all duration-500 ${details.barColor}`}
                                                  style={{ width: `${details.percentage}%` }}
                                                />
                                              </div>
                                              <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">
                                                {gv.score !== null ? `${details.percentage}%` : 'قيد الرصد'}
                                              </span>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>

                              {/* 4. Overall Academic Result & GPA Dashboard */}
                              <div className="bg-gradient-to-br from-indigo-50/70 via-white to-amber-50/40 p-4 sm:p-5 rounded-2xl border-2 border-indigo-100 shadow-2xs space-y-3">
                                <div className="flex items-center justify-between border-b border-indigo-100/70 pb-2">
                                  <span className="text-xs font-black text-indigo-950 flex items-center gap-1.5">
                                    <Sparkles className="w-4 h-4 text-amber-500" />
                                    <span>النتيجة الإجمالية والتحصيل العام لشهر: {targetMonth}</span>
                                  </span>
                                  <span className="text-[10px] font-black text-indigo-700 bg-white border border-indigo-200 px-2.5 py-0.5 rounded-full shadow-2xs">
                                    الاعتماد التربوي الرسمي
                                  </span>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                                  {/* Total Score */}
                                  <div className="bg-white p-3.5 rounded-xl border border-indigo-100 text-center shadow-2xs flex flex-col justify-between">
                                    <span className="text-[10px] text-slate-500 font-bold block">مجموع الدرجات المحصلة</span>
                                    <div className="text-base sm:text-lg font-black text-indigo-950 font-mono mt-1">
                                      {scoredCount > 0 ? totalScore : '---'}
                                      <span className="text-xs text-slate-400 font-normal mr-1">/ {gradeValues.length * 100}</span>
                                    </div>
                                  </div>

                                  {/* GPA Percentage */}
                                  <div className="bg-white p-3.5 rounded-xl border border-indigo-100 text-center shadow-2xs flex flex-col justify-between">
                                    <span className="text-[10px] text-slate-500 font-bold block">المعدل العام المئوي</span>
                                    <div className="text-base sm:text-lg font-black text-indigo-700 font-mono mt-1">
                                      {avg !== null ? `${avg}%` : '---'}
                                    </div>
                                  </div>

                                  {/* Appreciation Badge */}
                                  <div className={`p-3.5 rounded-xl border text-center shadow-2xs flex flex-col justify-between ${badgeColor}`}>
                                    <span className="text-[10px] opacity-80 font-bold block">التقدير العام المعتمد</span>
                                    <div className="text-sm sm:text-base font-black mt-1">
                                      {estimation}
                                    </div>
                                  </div>

                                  {/* Final Academic Status */}
                                  <div className="bg-white p-3.5 rounded-xl border border-indigo-100 text-center shadow-2xs flex flex-col justify-between">
                                    <span className="text-[10px] text-slate-500 font-bold block">القرار التربوي</span>
                                    <div className="text-xs sm:text-sm font-black text-emerald-700 mt-1 flex items-center justify-center gap-1">
                                      {scoredCount > 0 && avg && parseFloat(avg) >= 50 ? (
                                        <span>ناجح ومجتهد بتفوق 🏆</span>
                                      ) : scoredCount > 0 ? (
                                        <span className="text-amber-700">يحتاج متابعة ⚠️</span>
                                      ) : (
                                        <span className="text-slate-400 font-normal">قيد الرصد ⏳</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* 5. Directives from Teacher & Administration (توجيهات المعلم وتوجيهات الإدارة) */}
                              <div className="space-y-3 pt-1">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-r-2 border-indigo-600 pr-2">
                                  <h4 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                                    <span>💬 التوجيهات والملاحظات التربوية المعتمدة (شهر: {evalForMonth?.month || targetMonth}):</span>
                                  </h4>
                                  <span className="text-[10px] text-slate-500 font-medium">
                                    ملاحظات الكادر التعليمي والإدارة العامة لولي الأمر
                                  </span>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  {/* Teacher Directive */}
                                  <div className="bg-gradient-to-br from-indigo-50/80 via-white to-indigo-50/40 p-4 rounded-2xl border-2 border-indigo-200/90 shadow-2xs space-y-2.5 text-right flex flex-col justify-between">
                                    <div>
                                      <div className="flex items-center justify-between border-b border-indigo-100 pb-2 mb-2">
                                        <span className="font-black text-indigo-950 text-xs flex items-center gap-1.5">
                                          <span>👨‍🏫</span>
                                          <span>توجيهات المعلم (الكادر التعليمي):</span>
                                        </span>
                                        <span className="text-[9px] bg-indigo-100 text-indigo-850 font-black px-2.5 py-0.5 rounded-full border border-indigo-200 shadow-2xs">
                                          الكادر التدريسي
                                        </span>
                                      </div>
                                      <div className="text-slate-800 text-xs font-medium leading-relaxed min-h-[50px] flex items-center">
                                        {teacherMsg && teacherMsg.trim() ? (
                                          <p className="w-full text-slate-800 font-semibold whitespace-pre-line bg-white/70 p-2.5 rounded-xl border border-indigo-100/70">
                                            {teacherMsg}
                                          </p>
                                        ) : (
                                          <p className="text-slate-500 italic text-xs bg-white/70 p-2.5 rounded-xl border border-dashed border-indigo-200 w-full">
                                            طالب مواظب ومتميز، متابع لدروسه ومشارك بإيجابية في الأنشطة والواجبات المدرسية. 🌟
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                    <div className="text-[10px] text-indigo-700/80 font-bold pt-1 border-t border-indigo-100/60 flex items-center justify-between">
                                      <span>معلم المادة والصف</span>
                                      <span className="font-mono text-[9px] text-slate-400">ملاحظة معتمدة</span>
                                    </div>
                                  </div>

                                  {/* Director Directive */}
                                  <div className="bg-gradient-to-br from-amber-50/80 via-white to-amber-50/40 p-4 rounded-2xl border-2 border-amber-200/90 shadow-2xs space-y-2.5 text-right flex flex-col justify-between">
                                    <div>
                                      <div className="flex items-center justify-between border-b border-amber-200/60 pb-2 mb-2">
                                        <span className="font-black text-amber-950 text-xs flex items-center gap-1.5">
                                          <span>🏫</span>
                                          <span>توجيهات إدارة المدرسة:</span>
                                        </span>
                                        <span className="text-[9px] bg-amber-100 text-amber-900 font-black px-2.5 py-0.5 rounded-full border border-amber-200 shadow-2xs">
                                          الإدارة العامة
                                        </span>
                                      </div>
                                      <div className="text-slate-800 text-xs font-medium leading-relaxed min-h-[50px] flex items-center">
                                        {directorMsg && directorMsg.trim() ? (
                                          <p className="w-full text-slate-800 font-semibold whitespace-pre-line bg-white/70 p-2.5 rounded-xl border border-amber-100/70">
                                            {directorMsg}
                                          </p>
                                        ) : (
                                          <p className="text-slate-500 italic text-xs bg-white/70 p-2.5 rounded-xl border border-dashed border-amber-200 w-full">
                                            تثمن إدارة المدرسة جهود ولي الأمر الموقر في المتابعة الأسرية المستمرة، ونتمنى للطالب دوام التفوق والازدهار. 🏫
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                    <div className="text-[10px] text-amber-800/80 font-bold pt-1 border-t border-amber-100/60 flex items-center justify-between">
                                      <span>إدارة المدرسة الدولية الخاصة</span>
                                      <span className="font-mono text-[9px] text-slate-400">توثيق رسمي</span>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* 6. Official Dual Signatures & School Rubber Stamps */}
                              <div className="pt-2">
                                <GradeSheetSignatures
                                  className="mt-2"
                                  subtitle={`الاعتماد الرسمي لكشف درجات الطالب: ${activeChild?.name || ''} - شهر ${targetMonth}`}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </>
                  )}
                </motion.div>
              )}

              {/* Attendance Log Tab */}
              {activeTab === 'attendance' && (
                <motion.div
                  key="attendance"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">بيان الغياب والحضور اليومي</h3>
                    <p className="text-slate-500 text-xs mt-1">متابعة دقيقة لحالة الانضباط والمواظبة اليومية.</p>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="bg-white p-4 rounded-xl border border-slate-100 text-center shadow-sm">
                      <span className="text-[10px] text-slate-400 font-medium block">أيام الحضور</span>
                      <span className="text-xl font-bold text-emerald-600 block mt-1">{childAttendance.filter(a => a.status === 'present').length} أيام</span>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-slate-100 text-center shadow-sm">
                      <span className="text-[10px] text-slate-400 font-medium block">أيام الغياب</span>
                      <span className="text-xl font-bold text-red-500 block mt-1">{childAttendance.filter(a => a.status === 'absent').length} أيام</span>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-slate-100 text-center shadow-sm">
                      <span className="text-[10px] text-slate-400 font-medium block">أيام التأخير</span>
                      <span className="text-xl font-bold text-amber-500 block mt-1">{childAttendance.filter(a => a.status === 'late').length} أيام</span>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-slate-100 text-center shadow-sm">
                      <span className="text-[10px] text-slate-400 font-medium block">غياب بعذر مقبول</span>
                      <span className="text-xl font-bold text-indigo-600 block mt-1">{childAttendance.filter(a => a.status === 'excused').length} أيام</span>
                    </div>
                  </div>

                  {/* Detailed layout combining Attendance & Absence Excuse */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left Column (Main content): Attendance register & Submission form */}
                    <div className="lg:col-span-2 space-y-6">
                      {/* Attendance table/list */}
                      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                        <div className="p-4 bg-slate-50 border-b border-slate-100 text-xs text-slate-600 font-bold flex items-center justify-between">
                          <span>سجل التحضير المفصل لآخر الأيام</span>
                          <span className="text-[10px] text-slate-400 font-normal">آخر 30 سجل تحضير</span>
                        </div>

                        <div className="divide-y divide-slate-100">
                          {childAttendance.map(record => {
                            const isAttUnread = !readAttendanceIds.includes(record.id);
                            return (
                              <div key={record.id} className={`p-4 flex items-center justify-between transition text-xs ${
                                isAttUnread 
                                  ? 'bg-rose-50 hover:bg-rose-100/70 border-r-4 border-red-500 font-medium' 
                                  : 'hover:bg-slate-50/50'
                              }`}>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-slate-500 font-medium">{record.date}</span>
                                  {record.notes && (
                                    <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-medium">
                                      ملاحظة: {record.notes}
                                    </span>
                                  )}
                                  {isAttUnread && (
                                    <span className="bg-red-500 text-white text-[9px] px-1.5 py-0.5 rounded font-bold animate-pulse">
                                      جديد 🆕
                                    </span>
                                  )}
                                </div>

                                <div>
                                  {record.status === 'present' ? (
                                    <span className="text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100 font-semibold flex items-center gap-1">
                                      <CheckCircle className="w-3.5 h-3.5" />
                                      <span>حاضر</span>
                                    </span>
                                  ) : record.status === 'absent' ? (
                                    <span className="text-red-600 bg-red-50 px-2.5 py-1 rounded-lg border border-red-100 font-semibold flex items-center gap-1">
                                      <XCircle className="w-3.5 h-3.5" />
                                      <span>غائب غير مبرر</span>
                                    </span>
                                  ) : record.status === 'late' ? (
                                    <span className="text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-100 font-semibold flex items-center gap-1">
                                      <Clock className="w-3.5 h-3.5" />
                                      <span>متأخر بالدخول</span>
                                    </span>
                                  ) : (
                                    <span className="text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100 font-semibold flex items-center gap-1">
                                      <FileText className="w-3.5 h-3.5" />
                                      <span>غياب مبرر (عذر مقبول)</span>
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}

                          {childAttendance.length === 0 && (
                            <div className="p-8 text-center text-slate-400 text-xs italic">
                              لم يتم رصد أي تحضير حتى الآن.
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Submit Absence Excuse Form */}
                      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                        <div className="mb-4">
                          <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                            <FileText className="w-4.5 h-4.5 text-indigo-600" />
                            <span>تقديم عذر غياب طبي/إداري</span>
                          </h4>
                          <p className="text-slate-500 text-[11px] mt-1">
                            عند مرافقة طفلك لمستشفى أو تغيبه لعذر قاهر، يمكنك إرسال التبرير للإدارة فوراً لتفادي احتساب غياب غير مبرر.
                          </p>
                        </div>

                        <form onSubmit={handleExcuseSubmit} className="space-y-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-semibold text-slate-600 mb-1.5">تاريخ الغياب *</label>
                              <input
                                type="date"
                                value={excuseDate}
                                onChange={e => setExcuseDate(e.target.value)}
                                className="w-full text-xs border border-slate-200 px-3.5 py-2 rounded-xl focus:outline-none focus:border-indigo-500 font-mono"
                                required
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-slate-600 mb-1.5">الطالب المعني بالغياب</label>
                              <input
                                type="text"
                                value={activeChild?.name || ''}
                                className="w-full text-xs border border-transparent bg-slate-50 text-slate-500 px-3.5 py-2 rounded-xl focus:outline-none"
                                disabled
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">مبرر الغياب بالتفصيل *</label>
                            <textarea
                              rows={3}
                              value={excuseReason}
                              onChange={e => setExcuseReason(e.target.value)}
                              placeholder="يرجى كتابة سبب غياب الطالب والظرف بوضوح..."
                              className="w-full text-xs border border-slate-200 px-3.5 py-2.5 rounded-xl focus:outline-none focus:border-indigo-500"
                              required
                            />
                          </div>

                          <div className="flex justify-end">
                            <button
                              type="submit"
                              className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-xs font-bold hover:bg-indigo-700 transition cursor-pointer flex items-center gap-1.5"
                            >
                              <FileText className="w-4.5 h-4.5" />
                              <span>تقديم وتبرير الغياب للإدارة</span>
                            </button>
                          </div>
                        </form>
                      </div>
                    </div>

                    {/* Right Column: History of excuses */}
                    <div className="space-y-4 lg:col-span-1">
                      <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100/80 space-y-4">
                        <div>
                          <h4 className="font-bold text-slate-800 text-xs flex items-center gap-2">
                            <span>طلبات الأعذار السابقة وحالتها</span>
                          </h4>
                          <p className="text-[10px] text-slate-400 mt-0.5">تتبع الردود الإدارية والاعتمادات الرسمية لعذر الغياب.</p>
                        </div>
                        
                        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                          {excuses
                            .filter(e => e.studentId === selectedChildId)
                            .map(exc => (
                              <div key={exc.id} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm text-xs space-y-2">
                                <div className="flex justify-between items-center">
                                  <span className="font-mono text-[10px] text-slate-400">{exc.date}</span>
                                  <span className={`px-2 py-0.5 rounded font-semibold text-[9px] ${
                                    exc.status === 'pending'
                                      ? 'bg-amber-50 text-amber-700 border border-amber-100'
                                      : exc.status === 'approved'
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                      : 'bg-rose-50 text-rose-700 border border-rose-100'
                                  }`}>
                                    {exc.status === 'pending' ? 'قيد الدراسة' : exc.status === 'approved' ? 'مقبول إدارياً' : 'مرفوض'}
                                  </span>
                                </div>
                                <p className="text-[11px] text-slate-600 font-medium">{exc.reason}</p>
                                {exc.notes && (
                                  <p className="text-[10px] text-slate-500 bg-slate-50 p-2 rounded border border-slate-100/30">
                                    <strong className="text-indigo-600">رد الإدارة:</strong> {exc.notes}
                                  </p>
                                )}
                              </div>
                            ))}

                          {excuses.filter(e => e.studentId === selectedChildId).length === 0 && (
                            <div className="text-center p-8 text-slate-400 text-xs italic bg-white rounded-xl border border-dashed border-slate-200">
                              لا توجد طلبات سابقة لهذا الطالب.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* School Announcements Tab */}
              {activeTab === 'announcements' && (
                <motion.div
                  key="announcements"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">التعاميم والإعلانات المدرسية</h3>
                    <p className="text-slate-500 text-xs mt-1">تنبيهات وإعلانات هامة موجهة لأولياء الأمور من إدارة المدرسة.</p>
                  </div>

                  <div className="space-y-4">
                    {filteredAnnouncements.map(ann => {
                      const isAnnUnread = !readAnnouncementIds.includes(ann.id);
                      return (
                        <div 
                          key={ann.id} 
                          onClick={() => handleOpenAnnouncement(ann)}
                          className={`p-5 rounded-2xl border-y border-l shadow-sm flex flex-col justify-between hover:shadow-md transition cursor-pointer ${
                            isAnnUnread 
                              ? 'bg-rose-50 border-r-4 border-red-500 border-red-200 shadow-xs ring-1 ring-red-200/50' 
                              : 'bg-white border-r-4 border-indigo-600 border-slate-100'
                          }`}
                        >
                          <div>
                            <div className="flex justify-between items-start gap-4">
                              <div className="flex items-center gap-2">
                                <h4 className="font-bold text-slate-800 text-sm">{ann.title}</h4>
                                {isAnnUnread && (
                                  <span className="bg-red-500 hover:bg-red-600 text-white text-[9px] px-2 py-0.5 rounded font-bold animate-pulse transition">
                                    جديد 🆕 (انقر للمعاينة والإخفاء)
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-400 font-mono shrink-0">{ann.date}</span>
                            </div>
                            <p className="text-xs text-slate-600 mt-2.5 leading-relaxed">{ann.content}</p>
                          </div>
                          <div className="mt-4 pt-2.5 border-t border-slate-50 flex justify-between items-center text-[10px]">
                            <span className="text-slate-500">الجهة الناشرة: <strong className="text-slate-800">{ann.authorName}</strong></span>
                            <div>
                              {ann.authorRole === 'director' || ann.authorName.includes('المدير') ? (
                                <span className="bg-rose-50 text-rose-700 border border-rose-100 px-2 py-0.5 rounded font-bold">
                                  👑 إدارة المدرسة (المدير)
                                </span>
                              ) : (
                                <span className="bg-teal-50 text-teal-700 border border-teal-100 px-2 py-0.5 rounded font-bold">
                                  🏫 كادر التدريس (المعلم)
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {filteredAnnouncements.length === 0 && (
                      <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm text-center text-slate-400 text-xs">
                        لا توجد أي تعاميم منشورة حالياً.
                      </div>
                    )}
                  </div>
                </motion.div>
              )}





              {/* Student Behavior Tab */}
              {activeTab === 'behavior' && (
                <motion.div
                  key="behavior"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6 text-right"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 justify-end">
                        <span>سلوك وملاحظات الطالب</span>
                        <ShieldAlert className="w-5.5 h-5.5 text-rose-500 animate-pulse" />
                      </h3>
                      <p className="text-slate-500 text-xs mt-1">
                        تابع السلوكيات الموثقة، التقييمات الشهرية، والتوجيهات المرسلة من المعلمين وإدارة المدرسة للابن/الابنة <strong className="text-indigo-600">{activeChild?.name || ''}</strong>.
                      </p>
                    </div>
                    <span className="text-[10px] bg-slate-100 text-slate-600 border border-slate-200 font-bold px-2.5 py-1 rounded-lg shrink-0 self-start sm:self-center">
                      📋 سجل السلوك الموحد
                    </span>
                  </div>

                  {/* Dedicated Student Behavior View */}
                  <div className="space-y-6">
                    {/* A. Monthly Evaluation/Behavior Card (set by Director) */}
                    {(() => {
                      const evalObj = monthlyEvaluations[`${selectedChildId}_${currentEvaluationMonth}`] || 
                        monthlyEvaluations[`${activeChild?.unifiedNo}_${currentEvaluationMonth}`] ||
                        monthlyEvaluations[selectedChildId] ||
                        monthlyEvaluations[activeChild?.unifiedNo || ''];

                      const tText = evalObj?.teacherText !== undefined ? evalObj.teacherText : (evalObj?.text || '');
                      const dText = evalObj?.directorText || '';

                      if (!tText.trim() && !dText.trim()) return null;

                      return (
                        <div className="bg-gradient-to-br from-indigo-50/50 to-white border border-indigo-100 p-5 rounded-2xl shadow-xs space-y-3">
                          <div className="flex justify-between items-center border-b border-indigo-50 pb-3">
                            <div className="flex items-center gap-2">
                              <span className="bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-lg text-[10px] font-bold">
                                👑 التقرير والتوجيهات المعتمدة
                              </span>
                            </div>
                            <span className="text-[11px] font-black text-slate-600">
                              توجيهات شهر {evalObj?.month || currentEvaluationMonth}
                            </span>
                          </div>
                          <div className="space-y-2.5 text-right">
                            {tText.trim() && (
                              <div className="bg-white p-3.5 rounded-xl border border-indigo-100 text-xs">
                                <span className="font-bold text-indigo-900 block text-[11px] mb-1">👨‍🏫 توجيهات المعلم:</span>
                                <p className="text-slate-700 font-medium whitespace-pre-line leading-relaxed">{tText}</p>
                              </div>
                            )}
                            {dText.trim() && (
                              <div className="bg-amber-50/70 p-3.5 rounded-xl border border-amber-200 text-xs">
                                <span className="font-bold text-amber-900 block text-[11px] mb-1">🏫 توجيهات الإدارة:</span>
                                <p className="text-slate-800 font-medium whitespace-pre-line leading-relaxed">{dText}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* B. Behavioral Notices & Messages (from Teacher or Director) */}
                    <div className="space-y-4">
                      <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5 justify-start border-r-2 border-indigo-500 pr-2">
                        <span>سجل الملاحظات والإشعارات السلوكية المرصودة ({childBehaviorMessages.length})</span>
                      </h4>

                      {childBehaviorMessages.map(msg => {
                        const isPositive = msg.content.includes('إيجابي') || msg.content.includes('🌟');
                        const isNegative = msg.content.includes('سلبي') || msg.content.includes('⚠️');
                        
                        let cardBorder = 'border-slate-100 bg-white';
                        let tagBg = 'bg-slate-50 text-slate-600 border-slate-100';
                        let tagText = 'ملاحظة سلوكية';

                        if (isPositive) {
                          cardBorder = 'border-emerald-100 bg-emerald-50/20';
                          tagBg = 'bg-emerald-50 text-emerald-700 border-emerald-100';
                          tagText = 'سلوك إيجابي متميز 🌟';
                        } else if (isNegative) {
                          cardBorder = 'border-rose-100 bg-rose-50/20';
                          tagBg = 'bg-rose-50 text-rose-700 border-rose-100';
                          tagText = 'تنبيه سلوكي هام ⚠️';
                        }

                        const isUnread = !msg.read;

                        return (
                          <div
                            key={msg.id}
                            onClick={() => handleOpenMessage(msg)}
                            className={`p-5 rounded-2xl border ${cardBorder} shadow-2xs space-y-3 transition duration-200 hover:shadow-xs cursor-pointer ${
                              isUnread ? 'ring-2 ring-rose-400 bg-rose-50/30' : ''
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100/80 pb-2.5">
                              <div className="flex items-center gap-2">
                                <span className={`px-2.5 py-0.5 rounded-full border text-[10px] font-bold ${tagBg}`}>
                                  {tagText}
                                </span>
                                {isUnread && (
                                  <span className="bg-rose-500 text-white text-[8px] px-2 py-0.5 rounded-full font-bold animate-bounce">
                                    جديد ✉️
                                  </span>
                                )}
                                <span className="text-[10px] text-slate-400 font-mono">
                                  {new Date(msg.date).toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                                  {' - '}
                                  {new Date(msg.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                </span>
                              </div>
                              
                              <div className="text-[11px] text-slate-600 font-bold">
                                المرسل: <strong className="text-slate-900">{msg.senderName}</strong> ({msg.senderRole === 'teacher' ? 'المعلم المشرف' : 'إدارة المدرسة'})
                              </div>
                            </div>

                            <div className="bg-white/90 p-4 rounded-xl border border-slate-100 text-xs leading-relaxed text-slate-800 font-medium">
                              {renderMessageContent(msg.content)}
                            </div>
                          </div>
                        );
                      })}

                      {childBehaviorMessages.length === 0 && !monthlyEvaluations[selectedChildId] && (
                        <div className="bg-white p-12 rounded-2xl border border-slate-100 shadow-2xs text-center space-y-3">
                          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-lg">
                            🎉
                          </div>
                          <h5 className="font-bold text-slate-800 text-xs">سجل السلوك ممتاز ومكتمل!</h5>
                          <p className="text-slate-400 text-[11px] max-w-md mx-auto leading-relaxed">
                            لا توجد أي ملاحظات أو تنبيهات سلوكية مسجلة على الطالب {activeChild?.name || ''} حتى الآن. السلوك ممتاز ومستمرون في التفوق!
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Standalone Live Messaging Tab */}
              {activeTab === 'messages' && (
                <motion.div
                  key="messages"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6 text-right"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 justify-end">
                        <span>مركز المراسلات والتواصل المباشر مع المدرسة والمعلم</span>
                        <MessageSquare className="w-5.5 h-5.5 text-indigo-600 animate-bounce" />
                      </h3>
                      <p className="text-slate-500 text-xs mt-1">
                        تواصل مباشر وسريع مع إدارة المدرسة ومعلم الصف، ومتابعة كافة الإشعارات والتقارير الأكاديمية للطالب <strong className="text-indigo-600">{activeChild?.name}</strong>.
                      </p>
                    </div>
                    <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold px-2.5 py-1 rounded-lg shrink-0 self-start sm:self-center">
                      💬 قناة المراسلات الرسمية المعتمدة
                    </span>
                  </div>

                  <div className="max-w-3xl mx-auto">
                    {renderChatPanel()}
                  </div>
                </motion.div>
              )}



              {/* Tuition & Fee Payment Tab */}
              {activeTab === 'tuition' && (
                <motion.div
                  key="tuition"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6 text-right"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 justify-end">
                        <span>متابعة كشف حساب الأقساط والرسوم الدراسية</span>
                        <Coins className="w-5.5 h-5.5 text-amber-500 animate-pulse" />
                      </h3>
                      <p className="text-slate-500 text-xs mt-1">
                        لوحة المتابعة والتحصيل المالي التفصيلية بالدولار ($) الخاصة بالطالب <strong className="text-indigo-600">{activeChild?.name || ''}</strong>.
                      </p>
                    </div>
                    <span className="text-[10px] bg-slate-200 text-slate-700 border border-slate-300 font-bold px-2.5 py-1 rounded-lg shrink-0 self-start sm:self-center">
                      🔒 وصول آمن وموثق لولي الأمر
                    </span>
                  </div>

                  {/* 3 Stats Bento Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    {/* Total Fee Card */}
                    <div className="bg-gradient-to-br from-indigo-50/70 to-slate-50 border border-indigo-100 p-5 rounded-2xl shadow-xs space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-[11px] font-bold text-indigo-950 uppercase tracking-wider">المبلغ الإجمالي المطلوب</span>
                        <div className="p-2 bg-indigo-100 rounded-lg text-indigo-700">
                          <Coins className="w-4 h-4" />
                        </div>
                      </div>
                      <div>
                        <span className="text-2xl font-black text-indigo-950 font-mono">
                          {inputTotal !== '' ? Number(inputTotal).toLocaleString('en-US') : '0'}
                        </span>
                        <span className="text-xs font-bold text-indigo-800 mr-1">$</span>
                      </div>
                      <p className="text-[10px] text-slate-500">
                        الرسوم الدراسية السنوية الإجمالية المعتمدة.
                      </p>
                    </div>

                    {/* Paid Fee Card */}
                    <div className="bg-gradient-to-br from-emerald-50/70 to-teal-50/40 border border-emerald-100 p-5 rounded-2xl shadow-xs space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-[11px] font-bold text-emerald-950 uppercase tracking-wider">المبلغ المدفوع (مجموع الدفعات)</span>
                        <div className="p-2 bg-emerald-100 rounded-lg text-emerald-700">
                          <CheckCircle className="w-4 h-4" />
                        </div>
                      </div>
                      <div>
                        <span className="text-2xl font-black text-emerald-950 font-mono">
                          {parentInstallments.reduce((sum, inst) => sum + inst.amount, 0).toLocaleString('en-US')}
                        </span>
                        <span className="text-xs font-bold text-emerald-800 mr-1">$</span>
                      </div>
                      <p className="text-[10px] text-emerald-700/80">
                        عدد الدفعات المسددة والمسجلة: <strong className="font-mono">{parentInstallments.length}</strong> دفعات.
                      </p>
                    </div>

                    {/* Remaining Fee Card */}
                    <div className={`p-5 rounded-2xl shadow-xs space-y-3 border ${
                      (Number(inputTotal) || 0) - parentInstallments.reduce((sum, inst) => sum + inst.amount, 0) <= 0 && (Number(inputTotal) || 0) > 0
                        ? 'bg-gradient-to-br from-emerald-50 to-green-100/50 border-emerald-200 text-emerald-950'
                        : 'bg-gradient-to-br from-amber-50 to-orange-50/60 border-amber-200 text-amber-950'
                    }`}>
                      <div className="flex justify-between items-center">
                        <span className="text-[11px] font-bold uppercase tracking-wider">الباقي المستحق للسداد</span>
                        <div className={`p-2 rounded-lg ${
                          (Number(inputTotal) || 0) - parentInstallments.reduce((sum, inst) => sum + inst.amount, 0) <= 0 && (Number(inputTotal) || 0) > 0 ? 'bg-emerald-200 text-emerald-800' : 'bg-amber-200 text-amber-800'
                        }`}>
                          <Coins className="w-4 h-4" />
                        </div>
                      </div>
                      <div>
                        <span className="text-2xl font-black font-mono">
                          {Math.max(0, (Number(inputTotal) || 0) - parentInstallments.reduce((sum, inst) => sum + inst.amount, 0)).toLocaleString('en-US')}
                        </span>
                        <span className="text-xs font-bold mr-1">$</span>
                      </div>
                      <p className="text-[10px]">
                        {(Number(inputTotal) || 0) - parentInstallments.reduce((sum, inst) => sum + inst.amount, 0) <= 0 && (Number(inputTotal) || 0) > 0 ? (
                          <span className="text-emerald-700 font-bold">🎉 شكراً لكم! تم سداد القسط بالكامل.</span>
                        ) : (
                          <span className="text-amber-700 font-bold">⚠️ يرجى سداد الأقساط المتبقية في مواعيدها.</span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Payment Progress Bar */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs space-y-3">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-700">نسبة تقدم سداد الرسوم الدراسية</span>
                      <span className="font-mono font-bold text-indigo-600">
                        {Math.min(100, Math.round((parentInstallments.reduce((sum, inst) => sum + inst.amount, 0) / (Number(inputTotal) || 1)) * 100))}%
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${
                          parentInstallments.reduce((sum, inst) => sum + inst.amount, 0) >= (Number(inputTotal) || 0) && (Number(inputTotal) || 0) > 0 ? 'bg-emerald-500' : 'bg-indigo-600'
                        }`}
                        style={{ width: `${Math.min(100, (parentInstallments.reduce((sum, inst) => sum + inst.amount, 0) / (Number(inputTotal) || 1)) * 100)}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Read-Only Fee & Payment Display */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm lg:col-span-2 space-y-5">
                      <div className="border-b border-slate-100 pb-3">
                        <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5 justify-end">
                          <span>📋 كشف الدفعات والأقساط المسددة المعتمدة</span>
                        </h4>
                        <p className="text-[10px] text-slate-400 mt-1">
                          يتم رصد وتحديث كافة المبالغ والأقساط مباشرة من قبل المسؤول المالي بالمدرسة.
                        </p>
                      </div>

                      {/* List of parent payments (Read Only) */}
                      <div className="space-y-3 text-right">
                        <span className="text-xs font-bold text-slate-700 block">سجل الدفعات المالية الموثقة:</span>
                        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                          {parentInstallments.length === 0 ? (
                            <div className="text-center p-8 bg-slate-50 rounded-xl text-xs text-slate-400 italic border border-dashed">
                              لا توجد دفعات أو أقساط مسجلة حالياً في حساب الطالب. يرجى مراجعة الإدارة عند السداد لتسجيل دفعتكم فوراً.
                            </div>
                          ) : (
                            parentInstallments.map((inst, index) => (
                              <div key={inst.id} className="flex items-center justify-between bg-indigo-50/50 border border-indigo-100/30 p-3.5 rounded-xl text-xs">
                                <div className="text-left font-mono font-bold text-slate-400 text-[10px]">
                                  {inst.date}
                                </div>
                                <div className="text-right flex-1 px-4">
                                  <div className="font-bold text-slate-700 text-[11px]">{inst.note}</div>
                                </div>
                                <div className="font-mono font-bold text-indigo-700 bg-white border border-indigo-100 px-3 py-1 rounded-md shadow-xs">
                                  {inst.amount.toLocaleString('en-US')} $
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Automatic deduction preview bar */}
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center justify-between text-xs">
                        <div>
                          <span className="text-slate-500 block text-[10px]">المتبقي الإجمالي المستحق:</span>
                          <strong className="text-amber-600 font-mono text-sm">
                            {Math.max(0, (Number(inputTotal) || 0) - parentInstallments.reduce((sum, inst) => sum + inst.amount, 0)).toLocaleString('en-US')} $
                          </strong>
                        </div>
                        <span className="text-[10px] text-slate-400">
                          (إجمالي الرسوم المطلوب - مجموع الدفعات المسددة)
                        </span>
                      </div>
                    </div>

                    {/* Left help card */}
                    <div className="bg-slate-900 text-white p-6 rounded-2xl flex flex-col justify-between space-y-4 text-right">
                      <div className="space-y-2">
                        <span className="text-amber-400 text-xs font-bold block">💡 إرشادات الدفع المدرسي بالدولار ($)</span>
                        <h4 className="font-bold text-sm">كيفية تسديد الأقساط والرسوم</h4>
                        <ul className="text-[11px] text-slate-300 space-y-2.5 list-disc list-inside leading-relaxed text-right">
                          <li>يمكن سداد الأقساط والرسوم عبر الحساب المصرفي المعتمد للمدرسة بالدولار الأمريكي.</li>
                          <li>يرجى إرفاق رقم قيد الطالب <strong className="text-amber-300 font-mono">#{activeChild?.rollNo || '---'}</strong> كمرجع للتحويل لضمان سرعة تسجيلها.</li>
                          <li>يتم رصد وتسجيل كافة الأقساط والدفعات المسددة بشكل رسمي ومباشر من قبل الإدارة والمسؤول المالي.</li>
                          <li>لأي استفسار مالي، يرجى مراسلة المسؤول المالي للإدارة عبر بوابة التواصل.</li>
                        </ul>
                      </div>
                      <div className="pt-4 border-t border-slate-800 text-[10px] text-slate-400 text-center">
                        منصة السداد الموحدة والآمنة بالدولار © 2026
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </>
          )}
        </AnimatePresence>

        {/* Portal Bottom Designer Signature - Aligned completely to the left */}
        <div className="mt-8 pt-4 border-t border-slate-200/60 no-print flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5" style={{ direction: 'rtl' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            <span>بوابة ولي الأمر • نظام المتابعة الشاملة &copy; {new Date().getFullYear()}</span>
          </div>
          <div className="w-full sm:w-auto flex justify-start" style={{ direction: 'ltr' }}>
            <PortalDesignerBadge variant="light" align="left" />
          </div>
        </div>
      </div>

      {/* PWA Install Guide Modal */}
      <AnimatePresence>
        {showInstallGuide && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs" style={{ direction: 'rtl' }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl max-w-md w-full border border-slate-100 overflow-hidden text-right"
            >
              {/* Modal Header */}
              <div className="bg-gradient-to-l from-indigo-600 to-indigo-700 text-white p-5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-indigo-200" />
                  <h3 className="font-bold text-sm">تثبيت التطبيق على الهاتف</h3>
                </div>
                <button 
                  type="button"
                  onClick={() => setShowInstallGuide(false)}
                  className="p-1.5 hover:bg-white/10 rounded-lg transition text-white/90 hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-6">
                <div className="text-center space-y-2">
                  <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto text-indigo-600">
                    <Download className="w-7 h-7" />
                  </div>
                  <p className="text-slate-600 text-xs font-semibold leading-relaxed">
                    يدعم تطبيق ولي الأمر ميزة **PWA (تطبيقات الويب التقدمية)**، مما يسمح لك بتثبيته على شاشات الهواتف كأيقونة رئيسية دون الحاجة لمتجر تطبيقات وبمساحة صغيرة جداً!
                  </p>
                </div>

                {/* Direct button if prompt is available */}
                {showInstallBtn && deferredPrompt && (
                  <button
                    type="button"
                    onClick={() => {
                      handleInstallClick();
                      setShowInstallGuide(false);
                    }}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-4 rounded-xl text-xs transition cursor-pointer shadow-sm flex items-center justify-center gap-2 animate-pulse"
                  >
                    <Download className="w-4 h-4" />
                    <span>تثبيت مباشر الآن بنقرة واحدة</span>
                  </button>
                )}

                {/* Step-by-Step guides */}
                <div className="space-y-4 pt-4 border-t border-slate-100">
                  <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5 justify-start">
                    <span>خطوات التثبيت اليدوي حسب نوع جهازك:</span>
                    <span className="text-indigo-600">💡</span>
                  </h4>

                  {/* Android */}
                  <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 space-y-1.5 text-right">
                    <div className="font-bold text-indigo-600 text-[11px] flex items-center gap-1.5 justify-start">
                      <span>🤖</span>
                      <span>أجهزة أندرويد (Android / Chrome)</span>
                    </div>
                    <ol className="text-[10px] text-slate-500 space-y-1 pr-4 list-decimal list-inside leading-relaxed text-right">
                      <li>افتح هذا الرابط في متصفح **Chrome**.</li>
                      <li>اضغط على زر النقاط الثلاث <strong className="text-slate-700">⋮</strong> في أعلى يسار المتصفح.</li>
                      <li>اختر <strong className="text-slate-700">"تثبيت التطبيق" (Install App)</strong> أو <strong className="text-slate-700">"إضافة للشاشة الرئيسية"</strong>.</li>
                    </ol>
                  </div>

                  {/* iOS */}
                  <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 space-y-1.5 text-right">
                    <div className="font-bold text-rose-600 text-[11px] flex items-center gap-1.5 justify-start">
                      <span>🍎</span>
                      <span>أجهزة آيفون (iOS / Safari)</span>
                    </div>
                    <ol className="text-[10px] text-slate-500 space-y-1 pr-4 list-decimal list-inside leading-relaxed text-right">
                      <li>افتح الرابط في متصفح **Safari** الافتراضي للآيفون.</li>
                      <li>اضغط على زر المشاركة <strong className="text-slate-700">"Share" 📤</strong> في الشريط السفلي.</li>
                      <li>مرر للأسفل قليلاً واضغط على <strong className="text-slate-700">"إضافة إلى الشاشة الرئيسية" (Add to Home Screen) ➕</strong>.</li>
                    </ol>
                  </div>

                  {/* Desktop */}
                  <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 space-y-1.5 text-right">
                    <div className="font-bold text-amber-600 text-[11px] flex items-center gap-1.5 justify-start">
                      <span>💻</span>
                      <span>أجهزة الكمبيوتر واللابتوب</span>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-relaxed pr-2 text-right">
                      اضغط على أيقونة التثبيت (أيقونة الشاشة مع سهم لأسفل) التي تظهر في شريط العنوان بالمتصفح بجوار الرابط مباشرة، ثم اضغط تثبيت.
                    </p>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 text-center">
                <button
                  type="button"
                  onClick={() => setShowInstallGuide(false)}
                  className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold px-5 py-2 rounded-xl text-xs transition cursor-pointer"
                >
                  حسناً، فهمت ذلك
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Dynamic Floating Toast Notifications Stack */}
      <div className="fixed top-4 left-4 z-50 space-y-3 max-w-sm w-full pointer-events-none">
        <AnimatePresence>
          {parentPortalToasts.map(toast => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.2 } }}
              className="bg-white/95 backdrop-blur-md rounded-2xl border border-indigo-100 shadow-xl p-4 pointer-events-auto flex gap-3.5 items-start text-right border-r-4 border-r-indigo-600"
              style={{ direction: 'rtl' }}
            >
              <div className="p-2 bg-indigo-50 rounded-xl text-indigo-600 shrink-0">
                {toast.type === 'grade' ? <Award className="w-5 h-5" /> :
                 toast.type === 'attendance' ? <Calendar className="w-5 h-5" /> :
                 toast.type === 'announcement' ? <Megaphone className="w-5 h-5" /> :
                 <MessageSquare className="w-5 h-5" />}
              </div>
              <div className="space-y-1 grow">
                <h4 className="font-extrabold text-xs text-slate-800">{toast.title}</h4>
                <p className="text-[11px] text-slate-500 leading-relaxed font-semibold">{toast.body}</p>
              </div>
              <button
                onClick={() => setParentPortalToasts(prev => prev.filter(t => t.id !== toast.id))}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Welcome Greeting Modal for Parent */}
      <AnimatePresence>
        {showWelcomeModal && (
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-[10010] pointer-events-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 15 }}
              className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-indigo-100 overflow-hidden text-right relative"
            >
              {/* Header Banner */}
              <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 text-white p-6 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-amber-400/20 via-transparent to-transparent pointer-events-none"></div>
                <button
                  type="button"
                  onClick={() => {
                    sessionStorage.setItem('parent_welcome_dismissed', 'true');
                    setShowWelcomeModal(false);
                  }}
                  className="absolute top-4 left-4 text-slate-300 hover:text-white p-1.5 hover:bg-white/10 rounded-full transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
                <div className="flex items-center gap-3.5">
                  <div className="w-14 h-14 bg-amber-400/20 border border-amber-300/40 rounded-2xl flex items-center justify-center shrink-0 shadow-inner overflow-hidden">
                    {schoolAppIcon ? (
                      <img src={schoolAppIcon} alt="الشعار" className="w-full h-full object-cover" />
                    ) : (
                      <Heart className="w-7 h-7 text-amber-300" />
                    )}
                  </div>
                  <div>
                    <span className="inline-block bg-amber-400/20 border border-amber-300/30 text-amber-300 text-[10px] font-bold px-2.5 py-0.5 rounded-full mb-1">
                      بوابة ولي الأمر - متابعة الطالب 🎓
                    </span>
                    <h3 className="font-extrabold text-lg text-white">{welcomeMsgs.parentTitle}</h3>
                    <p className="text-xs text-indigo-200 mt-0.5">
                      {activeChild?.name 
                        ? `الطالب: ${activeChild.name} • الرقم الموحد: #${activeChild.unifiedNo || activeChild.rollNo}` 
                        : (activeParent?.name || 'ولي الأمر الفاضل')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Body Content */}
              <div className="p-6 space-y-4">
                <div className="bg-indigo-50/70 border border-indigo-100 rounded-2xl p-4 text-xs text-indigo-950 leading-relaxed space-y-2">
                  <p className="font-extrabold text-sm text-indigo-900">
                    {welcomeMsgs.parentSubtitle}
                  </p>
                  <p className="text-slate-700 whitespace-pre-line">
                    {welcomeMsgs.parentBody}
                  </p>
                </div>

                {/* Action Button */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      sessionStorage.setItem('parent_welcome_dismissed', 'true');
                      setShowWelcomeModal(false);
                    }}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-md shadow-indigo-100 flex items-center justify-center gap-2"
                  >
                    <span>متابعة بيانات الطالب 🎓</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Restricted Environment / AppsGeyser Modal Guide */}
      <AnimatePresence>
        {showRestrictedEnvModal && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-[10020] pointer-events-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-amber-200 overflow-hidden text-right relative"
              style={{ direction: 'rtl' }}
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-amber-600 via-amber-700 to-slate-900 text-white p-5 relative overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowRestrictedEnvModal(false)}
                  className="absolute top-4 left-4 text-amber-200 hover:text-white p-1.5 hover:bg-white/10 rounded-full transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white/15 border border-white/20 rounded-2xl flex items-center justify-center shrink-0 shadow-inner">
                    <AlertTriangle className="w-6 h-6 text-amber-200" />
                  </div>
                  <div>
                    <span className="inline-block bg-amber-400/20 text-amber-200 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full mb-1 border border-amber-300/30">
                      تشخيص المشكلة وحلها المجاني 100%
                    </span>
                    <h3 className="font-extrabold text-base text-white">تفعيل الإشعارات خارج بيئة AppsGeyser</h3>
                  </div>
                </div>
              </div>

              {/* Body */}
              <div className="p-5 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto">
                {/* Explanation */}
                <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-4 text-xs text-amber-950 leading-relaxed space-y-2">
                  <h4 className="font-extrabold text-sm text-amber-900 flex items-center gap-1.5">
                    <span>🔍 أين تكمن المشكلة بالضبط؟</span>
                  </h4>
                  <p className="text-slate-700">
                    أنت تتصفح حالياً من خلال تطبيق تم إنشاؤه عبر أداة <strong>AppsGeyser</strong> (وهي التي تعرض شريط الإعلانات وزر <span className="text-amber-800 font-bold">Buy Premium</span> في أسفل شاشتك).
                  </p>
                  <p className="text-slate-700">
                    تطبيقات الـ WebView المجانية هذه <strong>تمنع وصول إشعارات المتصفح القياسية عمداً</strong> لإجبارك على شراء باقة مدفوعة أو إدخال بطاقة بنكية!
                  </p>
                </div>

                {/* Solution */}
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-xs text-emerald-950 leading-relaxed space-y-2.5">
                  <h4 className="font-extrabold text-sm text-emerald-800 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-emerald-600" />
                    <span>الحل الرسمي المجاني 100% (خلال 30 ثانية):</span>
                  </h4>
                  <p className="text-slate-700 font-medium">
                    لا تحتاج لدفع أي مبالغ ولا لاستخدام برامج وسيطة بها إعلانات! نظام المدرسة يدعم تقنية <strong>PWA</strong> المعتمدة من Google:
                  </p>
                  <ol className="list-decimal list-inside space-y-2 text-slate-800 pr-1">
                    <li className="font-bold text-slate-900">
                      اضغط زر <strong>«نسخ رابط المنصة»</strong> بالأسفل.
                    </li>
                    <li>
                      افتح متصفح <strong>Google Chrome</strong> على هاتفك وألصق الرابط.
                    </li>
                    <li>
                      اضغط زر <strong>«تفعيل إشعارات الهاتف 🔔»</strong> واختر <strong>سماح (Allow)</strong>.
                    </li>
                    <li className="font-bold text-emerald-900">
                      اضغط خيارات كروم (الثلاث نقاط ⋮) واختر <strong>«تثبيت التطبيق»</strong> أو <strong>«إضافة إلى الشاشة الرئيسية»</strong>.
                    </li>
                  </ol>
                  <p className="text-[11px] text-emerald-700 font-bold bg-emerald-100/60 p-2 rounded-lg mt-1">
                    ✓ سيعمل كتطبيق رسمي نظيف تماماً بدون إعلانات AppsGeyser، وستصلك إشعارات الدرجات والملاحظات فوراً حتى لو كان هاتفك مقفلاً مجاناً مدى الحياة!
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="pt-2 space-y-2.5">
                  <button
                    type="button"
                    onClick={handleCopySiteLink}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold rounded-xl transition cursor-pointer shadow-md flex items-center justify-center gap-2"
                  >
                    {copiedLink ? <Check className="w-4 h-4 text-emerald-200" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedLink ? 'تم نسخ الرابط بنجاح! الصقه في Chrome ✓' : 'نسخ رابط المنصة لفتحه في Google Chrome 📋'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleOpenInChrome}
                    className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-2"
                  >
                    <ExternalLink className="w-4 h-4 text-amber-300" />
                    <span>محاولة الفتح المباشر في متصفح Chrome 🌐</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowRestrictedEnvModal(false)}
                    className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
                  >
                    فهمت، حسناً
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* Opened Message Detail Modal */}
        {openedMessageDetail && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden text-right"
              style={{ direction: 'rtl' }}
            >
              {/* Header */}
              <div className="bg-gradient-to-l from-indigo-900 via-slate-900 to-indigo-950 p-5 text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
                    <MessageSquare className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-indigo-300 block">
                      {openedMessageDetail.senderRole === 'teacher' ? '👨‍🏫 رسالة من معلم الصف' : openedMessageDetail.senderRole === 'director' ? '🏫 رسالة من إدارة المدرسة' : '📩 تفاصيل الإشعار المدرسي'}
                    </span>
                    <h3 className="font-extrabold text-sm text-white">
                      {openedMessageDetail.senderName || 'المدرسة'}
                    </h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpenedMessageDetail(null)}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Status bar */}
              <div className="bg-emerald-50 border-b border-emerald-100 px-5 py-2.5 flex items-center justify-between text-xs text-emerald-800 font-bold">
                <span className="flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  <span>تمت القراءة واختفى إشعار التنبيه من جهازك ✓</span>
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {new Date(openedMessageDetail.date).toLocaleDateString('ar-EG', { weekday: 'short', month: 'short', day: 'numeric' })} - {new Date(openedMessageDetail.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              {/* Message Body */}
              <div className="p-5 sm:p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 text-xs sm:text-sm text-slate-800 leading-relaxed font-medium whitespace-pre-line">
                  {renderMessageContent(openedMessageDetail.content)}
                </div>
              </div>

              {/* Actions Footer */}
              <div className="p-4 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setOpenedMessageDetail(null)}
                  className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  إغلاق الرسالة
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const senderRole = openedMessageDetail.senderRole;
                    setOpenedMessageDetail(null);
                    setActiveTab('messages');
                    setActiveChatSubTab('send');
                    if (senderRole === 'teacher') {
                      setParentMsgTarget('teacher');
                    } else {
                      setParentMsgTarget('director');
                    }
                  }}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-xs"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>الرد على هذه الرسالة</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Smart Link Direct Access Modal */}
        {showSmartLinkModal && activeChild && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden text-right max-h-[92vh] flex flex-col"
              style={{ direction: 'rtl' }}
            >
              {/* Header */}
              <div className="bg-gradient-to-l from-emerald-800 via-teal-900 to-indigo-950 p-5 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300">
                    <Link className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-emerald-300 block">
                      🔗 خاصية الدخول المباشر الفوري
                    </span>
                    <h3 className="font-extrabold text-base text-white">
                      الرابط الذكي لملف الطالب
                    </h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSmartLinkModal(false)}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="p-5 sm:p-6 space-y-4 overflow-y-auto">
                {/* Student Info Card */}
                <div className="bg-gradient-to-br from-emerald-50 via-teal-50/50 to-indigo-50 border border-emerald-200/80 rounded-2xl p-4 flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-emerald-700 block">الطالب المستهدف:</span>
                    <h4 className="text-base font-black text-slate-900">{activeChild.name}</h4>
                    <p className="text-xs text-slate-600 font-medium">
                      الصف: <strong className="text-indigo-700">{activeChildClass?.name || 'الصف الدراسي'}</strong>
                    </p>
                  </div>
                  <div className="text-center bg-white px-3 py-2 rounded-xl border border-emerald-200 shadow-2xs">
                    <span className="text-[9px] font-bold text-slate-400 block">الرقم الموحد</span>
                    <span className="text-base font-black font-mono text-emerald-700">
                      #{activeChild.unifiedNo || activeChild.rollNo}
                    </span>
                  </div>
                </div>

                {/* Direct URL Input & Copy Button */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-700">
                    رابط الدخول المباشر (جاهز للنقر والفتح فوراً):
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={getDirectSmartLink(activeChild)}
                      className="w-full text-xs font-mono bg-slate-50 border border-slate-300 px-3 py-2.5 rounded-xl text-slate-700 select-all focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleCopySmartLink(getDirectSmartLink(activeChild))}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 shrink-0 cursor-pointer shadow-xs"
                    >
                      {smartLinkCopied ? (
                        <>
                          <Check className="w-4 h-4 text-emerald-300" />
                          <span>تم النسخ! ✓</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          <span>نسخ</span>
                        </>
                      )}
                    </button>
                  </div>
                  {smartLinkCopied && (
                    <p className="text-[11px] text-emerald-600 font-bold">
                      ✓ تم نسخ الرابط الذكي بنجاح إلى الحافظة! يمكنك الآن لصقه ومشاركته.
                    </p>
                  )}
                </div>

                {/* WhatsApp Direct Share Button */}
                <div>
                  <button
                    type="button"
                    onClick={() => handleShareSmartLinkWhatsApp(activeChild, getDirectSmartLink(activeChild))}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 px-4 rounded-xl text-xs font-extrabold transition flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                  >
                    <Share2 className="w-4 h-4" />
                    <span>مشاركة الرابط الذكي مباشرة عبر واتساب 📲</span>
                  </button>
                </div>

                {/* QR Code Section */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center space-y-3">
                  <div className="flex items-center justify-center gap-1.5 text-xs font-extrabold text-slate-700">
                    <QrCode className="w-4 h-4 text-indigo-600" />
                    <span>رمز الاستجابة السريعة (QR Code) للمسح بكاميرا الهاتف</span>
                  </div>
                  <div className="inline-block p-3 bg-white rounded-2xl border border-slate-200 shadow-xs">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(getDirectSmartLink(activeChild))}`}
                      alt="QR Code"
                      className="w-40 h-40 mx-auto"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium">
                    امسح هذا الرمز بكاميرا أي هاتف محمول لفتح ملف الطالب فورياً دون كتابة الرقم الموحد.
                  </p>
                </div>

                {/* Explanatory Info Card */}
                <div className="bg-indigo-50/70 border border-indigo-100 rounded-2xl p-3.5 space-y-1.5 text-xs text-indigo-950 font-medium leading-relaxed">
                  <div className="font-extrabold text-indigo-900 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <span>كيفية استخدام الرابط الذكي:</span>
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-700">
                    <li>يحتوي الرابط الذكي على الرقم الموحد للطالب تلقائياً، فلا يطلب المتصفح إدخال أي رقم.</li>
                    <li>يمكن لولي الأمر حفظ الصفحة في المفضلة (Bookmarks) للرجوع إليها بلمسة واحدة.</li>
                    <li>يمكن تثبيته كأيقونة على شاشة الهاتف الرئيسية عبر خيار "إضافة إلى الشاشة الرئيسية".</li>
                  </ul>
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between shrink-0">
                <span className="text-[10px] text-slate-400">المدرسة الدولية الخاصة - مدينة مارع</span>
                <button
                  type="button"
                  onClick={() => setShowSmartLinkModal(false)}
                  className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  إغلاق
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
