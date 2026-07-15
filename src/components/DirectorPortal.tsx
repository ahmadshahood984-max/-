/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Users, 
  UserSquare2, 
  GraduationCap, 
  Megaphone, 
  FileCheck, 
  Plus, 
  Search, 
  Calendar, 
  Phone, 
  Mail, 
  BookOpen, 
  Check, 
  X, 
  Edit,
  UserCheck,
  Building,
  ArrowLeftRight,
  Lock,
  Unlock,
  Key,
  LogOut,
  Download,
  Upload,
  Database,
  RefreshCw,
  Trash2,
  Coins,
  Menu,
  Settings,
  AlertTriangle,
  MessageSquare,
  Send,
  Copy
} from 'lucide-react';
import { Teacher, Student, Parent, Class, AbsenceExcuse, Announcement, Grade, Attendance, Message } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import { db } from '../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { subscribeToFirestoreMetrics, FirestoreMetrics, trackFirestoreWrite, trackFirestoreRead } from '../lib/firestoreTracker';
import { Bell, Activity, Info } from 'lucide-react';

const getShareableOrigin = () => {
  if (typeof window === 'undefined') return '';
  let origin = window.location.origin;
  if (origin.includes('ais-dev-')) {
    origin = origin.replace('ais-dev-', 'ais-pre-');
  }
  return origin;
};

interface DirectorPortalProps {
  teachers: Teacher[];
  students: Student[];
  classes: Class[];
  excuses: AbsenceExcuse[];
  announcements: Announcement[];
  grades: Grade[];
  parents: Parent[];
  attendance: Attendance[];
  messages: Message[];
  setStudents: React.Dispatch<React.SetStateAction<Student[]>>;
  setTeachers: React.Dispatch<React.SetStateAction<Teacher[]>>;
  setParents: React.Dispatch<React.SetStateAction<Parent[]>>;
  setGrades: React.Dispatch<React.SetStateAction<Grade[]>>;
  setClasses: React.Dispatch<React.SetStateAction<Class[]>>;
  setAttendance: React.Dispatch<React.SetStateAction<Attendance[]>>;
  setAnnouncements: React.Dispatch<React.SetStateAction<Announcement[]>>;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setExcuses: React.Dispatch<React.SetStateAction<AbsenceExcuse[]>>;
  addTeacher: (teacher: Omit<Teacher, 'id' | 'joinDate'>) => void;
  addStudent: (student: Omit<Student, 'id'>, parent: Omit<Parent, 'id' | 'childrenIds'>) => void;
  addAnnouncement: (announcement: Omit<Announcement, 'id' | 'date' | 'authorName'>) => void;
  updateExcuseStatus: (id: string, status: 'approved' | 'rejected', notes?: string) => void;
  directorPassword?: string;
  changeDirectorPassword?: (newPass: string) => void;
  updateTeacherPassword?: (teacherId: string, newPass: string) => void;
}

export default function DirectorPortal({
  teachers,
  students,
  classes,
  excuses,
  announcements,
  grades,
  parents,
  attendance,
  messages,
  setStudents,
  setTeachers,
  setParents,
  setGrades,
  setClasses,
  setAttendance,
  setAnnouncements,
  setMessages,
  setExcuses,
  addTeacher,
  addStudent,
  addAnnouncement,
  updateExcuseStatus,
  directorPassword,
  changeDirectorPassword,
  updateTeacherPassword
}: DirectorPortalProps) {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'teachers' | 'students' | 'excuses' | 'announcements' | 'grades' | 'settings' | 'sharing-links' | 'tuition' | 'messages' | 'subjects' | 'classes'>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Firestore Daily Usage Metrics state
  const [firestoreMetrics, setFirestoreMetrics] = useState<FirestoreMetrics>({
    date: '',
    reads: 0,
    writes: 0,
    simulatedReads: 0,
    simulatedWrites: 0,
    totalReads: 0,
    totalWrites: 0
  });
  const [isMetricsModalOpen, setIsMetricsModalOpen] = useState(false);

  React.useEffect(() => {
    return subscribeToFirestoreMetrics((data) => {
      setFirestoreMetrics(data);
    });
  }, []);

  // Function to send a physical FCM Push Notification via REST API
  const sendPushNotificationViaFCM = async (parentId: string, title: string, body: string) => {
    try {
      const { doc, getDoc } = await import('firebase/firestore');
      const tokenDoc = await getDoc(doc(db, 'fcm_tokens', parentId));
      trackFirestoreRead(1);
      if (tokenDoc.exists()) {
        const fcmTokenData = tokenDoc.data();
        if (fcmTokenData && fcmTokenData.token) {
          console.log(`[FCM Push] Found registered FCM token for parent: ${parentId}. Sending push payload...`);
          
          // Load custom FCM Server Key from localStorage or use fallback placeholder
          const savedServerKey = localStorage.getItem('fcm_server_key') || 'AIzaSyDcSshIC_Rs7m8uOF9OkHIJQ--JTifVKUQ_MOCK';
          
          // Send request to FCM REST API endpoint with notification payload
          const fcmResponse = await fetch('https://fcm.googleapis.com/fcm/send', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `key=${savedServerKey}`
            },
            body: JSON.stringify({
              to: fcmTokenData.token,
              notification: {
                title: title,
                body: body,
                icon: '/icon.png',
                click_action: getShareableOrigin()
              },
              data: {
                click_action: getShareableOrigin(),
                parentId: parentId,
                sender: 'director'
              }
            })
          });
          
          console.log(`[FCM Push] FCM API response status:`, fcmResponse.status);
        }
      } else {
        console.log(`[FCM Push] Parent ${parentId} does not have a registered FCM token on this device.`);
      }
    } catch (err) {
      console.warn("[FCM Push] Could not request external FCM push:", err);
    }
  };

  // Real-time Firestore notification sender with offline error handling
  const addNotification = async (notificationData: Omit<Message, 'id' | 'date' | 'read' | 'senderId' | 'senderName' | 'senderRole'>) => {
    const newMsg: Message = {
      id: 'msg_dir_' + Date.now(),
      senderId: 'director',
      senderName: 'المدير العام',
      senderRole: 'director',
      date: new Date().toISOString(),
      read: false,
      ...notificationData
    };

    try {
      if (!navigator.onLine) {
        throw new Error('Offline');
      }

      await addDoc(collection(db, 'notifications'), {
        ...newMsg,
        timestamp: serverTimestamp(),
        status: 'unread'
      });
      trackFirestoreWrite(1);

      setMessages(prev => {
        const updated = [...prev, newMsg];
        localStorage.setItem('school_messages', JSON.stringify(updated));
        return updated;
      });

      // Trigger Web Push Notification
      if (newMsg.receiverId) {
        sendPushNotificationViaFCM(newMsg.receiverId, newMsg.senderName, newMsg.content);
      }

      return newMsg;
    } catch (error) {
      console.warn("Could not save notification to Firestore (Offline/Error):", error);
      
      setMessages(prev => {
        const updated = [...prev, newMsg];
        localStorage.setItem('school_messages', JSON.stringify(updated));
        return updated;
      });

      alert('⚠️ تعذر إرسال الإشعار سحابياً بسبب انقطاع الاتصال بالإنترنت، ولكن تم حفظه في الذاكرة المحلية للجهاز بنجاح.');
      return newMsg;
    }
  };

  // Tuition data state and seeding inside Director Portal
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
    // Starts completely empty so the user can fill all fields and amounts himself from scratch
    return {};
  });

  const [selectedClassForTuition, setSelectedClassForTuition] = useState<string>('');
  const [editingStudentTuition, setEditingStudentTuition] = useState<Student | null>(null);
  const [tuitionTotal, setTuitionTotal] = useState<number | ''>('');
  const [installments, setInstallments] = useState<PaymentInstallment[]>([]);
  const [newInstAmount, setNewInstAmount] = useState<number | ''>('');
  const [newInstDate, setNewInstDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [newInstNote, setNewInstNote] = useState<string>('');
  
  // Excel and Grade states
  const [selectedClassForGrades, setSelectedClassForGrades] = useState<string>('');
  const gradeImportInputRef = React.useRef<HTMLInputElement>(null);
  const [currentEvaluationMonth, setCurrentEvaluationMonth] = useState<string>(() => {
    return localStorage.getItem('school_evaluation_current_month') || 'تشرين الأول';
  });
  const [monthlyEvaluations, setMonthlyEvaluations] = useState<Record<string, { month: string; text: string }>>(() => {
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
  const [importTargetClassId, setImportTargetClassId] = useState<string>('');
  const [transferringStudent, setTransferringStudent] = useState<Student | null>(null);
  const [transferTargetClassId, setTransferTargetClassId] = useState<string>('');
  const [patchInput, setPatchInput] = useState<string>('');

  // APK & Mobile Compatibility states
  const [apkCompatibilityMode, setApkCompatibilityMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('school_apk_mode');
    if (saved !== null) return saved === 'true';
    const isMobileOrWebView = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|wv|webview/i.test(navigator.userAgent) || window.location.protocol === 'file:';
    return isMobileOrWebView;
  });
  const [showClipboardModal, setShowClipboardModal] = useState(false);
  const [clipboardModalTitle, setClipboardModalTitle] = useState('');
  const [clipboardModalBody, setClipboardModalBody] = useState('');
  const [clipboardModalText, setClipboardModalText] = useState('');
  const [clipboardModalSuccess, setClipboardModalSuccess] = useState(false);

  // States for text-based import pastes
  const [pastedStudentData, setPastedStudentData] = useState('');
  const [showPastedStudentInput, setShowPastedStudentInput] = useState(false);

  const [pastedGradeData, setPastedGradeData] = useState('');
  const [showPastedGradeInput, setShowPastedGradeInput] = useState(false);

  const [pastedBackupData, setPastedBackupData] = useState('');
  const [showPastedBackupInput, setShowPastedBackupInput] = useState(false);

  const toggleApkMode = (val: boolean) => {
    setApkCompatibilityMode(val);
    localStorage.setItem('school_apk_mode', String(val));
  };

  // Student deletion tool states
  const [deleteScope, setDeleteScope] = useState<'class' | 'division' | 'all'>('division');
  const [selectedGradeForDelete, setSelectedGradeForDelete] = useState<string>('');
  const [selectedClassIdForDelete, setSelectedClassIdForDelete] = useState<string>('');
  const [deleteConfirmationText, setDeleteConfirmationText] = useState<string>('');

  // Targeted entity deletion tool states
  const [targetDeleteCategory, setTargetDeleteCategory] = useState<'students' | 'teachers' | 'announcements' | 'messages' | 'excuses' | 'classes' | 'grades'>('students');
  const [deleteSearchQuery, setDeleteSearchQuery] = useState('');
  const [bulkDeleteConfirmation, setBulkDeleteConfirmation] = useState('');

  // Academic Year states
  const [academicYears, setAcademicYears] = useState<string[]>(() => {
    const saved = localStorage.getItem('school_academic_years');
    return saved ? JSON.parse(saved) : ['1447هـ - 2026م', '1448هـ - 2027م'];
  });
  const [activeAcademicYear, setActiveAcademicYear] = useState<string>(() => {
    const saved = localStorage.getItem('school_active_academic_year');
    return saved || 'غير محدد';
  });
  const [newAcademicYearInput, setNewAcademicYearInput] = useState<string>('');
  const [quickDeleteGrade, setQuickDeleteGrade] = useState('');
  const [quickDeleteClassId, setQuickDeleteClassId] = useState('');

  // Director Messages states
  const [directorChatRecipientRole, setDirectorChatRecipientRole] = useState<'teacher' | 'parent'>('teacher');
  const [directorChatRecipientId, setDirectorChatRecipientId] = useState<string>('');
  const [directorMessageText, setDirectorMessageText] = useState<string>('');
  const [directorNotificationType, setDirectorNotificationType] = useState<string>('عام');
  const [directorCustomTypeLabel, setDirectorCustomTypeLabel] = useState<string>('');

  // Custom Subjects Management State
  const [customSubjects, setCustomSubjects] = useState<string[]>(() => {
    const saved = localStorage.getItem('school_custom_subjects');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return [];
      }
    }
    return []; // Start empty so it is completely custom, undefined and open as requested
  });
  const [newSubjectName, setNewSubjectName] = useState('');

  // Class addition states in Student Affairs
  const [showClassForm, setShowClassForm] = useState(false);
  const [showSubjectModal, setShowSubjectModal] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newClassGrade, setNewClassGrade] = useState('');
  const [newClassRoom, setNewClassRoom] = useState('');
  const [newClassTeacherId, setNewClassTeacherId] = useState('');

  const markAsRead = (msgId: string) => {
    if (setMessages) {
      setMessages(prev => {
        const updated = prev.map(m => m.id === msgId ? { ...m, read: true } : m);
        localStorage.setItem('school_messages', JSON.stringify(updated));
        return updated;
      });
    }
  };
  
  // Login states
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');

  // Forms states
  const [showTeacherForm, setShowTeacherForm] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [showStudentForm, setShowStudentForm] = useState(false);
  const [showAnnounceForm, setShowAnnounceForm] = useState(false);

  // Search states
  const [teacherSearch, setTeacherSearch] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedClassForStudentAffairs, setSelectedClassForStudentAffairs] = useState<string>('all');

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
          case 'school_custom_subjects':
            setCustomSubjects(parsed);
            break;
          case 'school_academic_years':
            setAcademicYears(parsed);
            break;
          case 'school_active_academic_year':
            setActiveAcademicYear(value.startsWith('"') ? parsed : value);
            break;
          case 'school_evaluation_current_month':
            setCurrentEvaluationMonth(value.startsWith('"') ? parsed : value);
            break;
          case 'school_apk_mode':
            setApkCompatibilityMode(value === 'true' || parsed === true);
            break;
        }
      } catch (err) {
        if (key === 'school_active_academic_year') {
          setActiveAcademicYear(value);
        } else if (key === 'school_evaluation_current_month') {
          setCurrentEvaluationMonth(value);
        } else if (key === 'school_apk_mode') {
          setApkCompatibilityMode(value === 'true');
        } else {
          console.warn('Error parsing storage update in DirectorPortal.tsx', err);
        }
      }
    };

    window.addEventListener('school_storage_update', handleStorageUpdate);

    // Initial load check to capture early Firebase synced keys in localStorage
    const reloadFromLocalStorage = () => {
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
      const savedCustom = localStorage.getItem('school_custom_subjects');
      if (savedCustom) {
        try { setCustomSubjects(JSON.parse(savedCustom)); } catch (e) {}
      }
      const savedYears = localStorage.getItem('school_academic_years');
      if (savedYears) {
        try { setAcademicYears(JSON.parse(savedYears)); } catch (e) {}
      }
      const savedActiveYear = localStorage.getItem('school_active_academic_year');
      if (savedActiveYear) {
        try { setActiveAcademicYear(savedActiveYear.startsWith('"') ? JSON.parse(savedActiveYear) : savedActiveYear); } catch (e) {}
      }
      const savedApkMode = localStorage.getItem('school_apk_mode');
      if (savedApkMode) {
        setApkCompatibilityMode(savedApkMode === 'true');
      }
    };
    reloadFromLocalStorage();

    return () => {
      window.removeEventListener('school_storage_update', handleStorageUpdate);
    };
  }, []);

  React.useEffect(() => {
    if (selectedClassForStudentAffairs && selectedClassForStudentAffairs !== 'all') {
      setNewStudent(prev => ({ ...prev, classId: selectedClassForStudentAffairs }));
    } else {
      setNewStudent(prev => ({ ...prev, classId: '' }));
    }
  }, [selectedClassForStudentAffairs]);

  // New Teacher state
  const [newTeacher, setNewTeacher] = useState({
    name: '',
    email: '',
    phone: '',
    subjectsStr: '',
    classId: '',
    password: '123'
  });
  const [teacherAssignmentType, setTeacherAssignmentType] = useState<'full_class' | 'subject_multi_class'>('full_class');
  const [teacherSelectedClassId, setTeacherSelectedClassId] = useState<string>('');
  const [teacherSelectedSubject, setTeacherSelectedSubject] = useState<string>('');
  const [teacherSelectedClassIds, setTeacherSelectedClassIds] = useState<string[]>([]);
  const [teacherNewSubjectInput, setTeacherNewSubjectInput] = useState<string>('');

  // New Student & Parent state
  const [newStudent, setNewStudent] = useState({
    name: '',
    classId: '',
    rollNo: '',
    gender: 'male' as 'male' | 'female',
    dob: '',
    parentName: '',
    parentEmail: '',
    parentPhone: ''
  });

  // New Announcement state
  const [newAnnounce, setNewAnnounce] = useState({
    title: '',
    content: '',
    target: 'all' as 'all' | 'teachers' | 'parents'
  });

  const [excuseNotes, setExcuseNotes] = useState<{ [key: string]: string }>({});

  // --- EXCEL & BACKUP SERVICES & PATCHES ---
  const triggerClipboardExport = (title: string, body: string, textToCopy: string) => {
    setClipboardModalTitle(title);
    setClipboardModalBody(body);
    setClipboardModalText(textToCopy);
    setClipboardModalSuccess(false);
    setShowClipboardModal(true);
    
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(textToCopy);
        setClipboardModalSuccess(true);
      } else {
        setClipboardModalSuccess(false);
      }
    } catch (e) {
      console.warn("Auto copy failed, user can copy manually", e);
      setClipboardModalSuccess(false);
    }
  };

  const handleDownloadStudentAffairsTemplate = () => {
    if (apkCompatibilityMode) {
      const headers = ["الرقم الموحد", "اسم الطالب", "ولي الأمر"].join('\t');
      const row = ["1002030401", "محمد أحمد العتيبي", "أحمد العتيبي"].join('\t');
      const textToCopy = `${headers}\n${row}`;
      triggerClipboardExport(
        "📋 نسخ نموذج تسجيل الطلاب لـ Excel",
        "تم نسخ أعمدة النموذج وبياناته التجريبية كـ نص منسق تلقائياً للحافظة! يمكنك لصقها في برنامج Excel أو Google Sheets مباشرة للبدء بإضافة الأسماء، ثم نسخ الجدول ولصقه هنا للاستيراد السريع دون ملفات.",
        textToCopy
      );
      return;
    }

    const data = [
      {
        "الرقم الموحد": "مثال: 1002030401",
        "اسم الطالب": "مثال: محمد أحمد العتيبي",
        "ولي الأمر": "مثال: أحمد العتيبي"
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'نموذج تسجيل الطلاب');
    
    // Set widths
    worksheet['!cols'] = [
      { wch: 22 },
      { wch: 35 },
      { wch: 35 }
    ];

    XLSX.writeFile(workbook, 'نموذج_استيراد_الطلاب.xlsx');
  };

  const handleImportStudentsFromText = (pastedText: string) => {
    if (!pastedText.trim()) {
      alert('الرجاء لصق النص أولاً.');
      return;
    }
    if (!importTargetClassId) {
      alert('الرجاء اختيار الصف المستهدف للاستيراد أولاً.');
      return;
    }

    const lines = pastedText.split('\n').map(l => l.trim()).filter(Boolean);
    let importedCount = 0;
    const updatedStudents = [...students];
    const updatedParents = [...parents];

    lines.forEach(line => {
      const cols = line.split(/\t|,/);
      if (cols.length < 2) return;

      const rollNoRaw = cols[0]?.trim();
      const nameRaw = cols[1]?.trim();
      const parentNameRaw = cols[2]?.trim();

      if (!rollNoRaw || !nameRaw) return;
      if (rollNoRaw.includes('الرقم الموحد') || nameRaw.includes('اسم الطالب')) return;
      if (rollNoRaw.includes('مثال:') || nameRaw.includes('مثال:')) return;

      const rollNo = String(rollNoRaw);
      const name = String(nameRaw);
      const parentName = parentNameRaw ? String(parentNameRaw) : `ولي أمر ${name}`;

      const existingStudent = updatedStudents.find(s => s.rollNo === rollNo);
      if (existingStudent) return;

      const studentId = 's_pst_' + Date.now() + Math.random().toString(36).substring(2, 7);
      const parentId = 'p_pst_' + Date.now() + Math.random().toString(36).substring(2, 7);

      const parentPhone = '05' + rollNo.padEnd(8, '0').slice(0, 8);
      const parentEmail = `${parentName.replace(/\s+/g, '') || 'parent'}@school.edu`;

      let finalParentId = parentId;
      const existingParent = updatedParents.find(p => p.name === parentName);
      if (existingParent) {
        finalParentId = existingParent.id;
        if (!existingParent.childrenIds.includes(studentId)) {
          existingParent.childrenIds.push(studentId);
        }
      } else {
        updatedParents.push({
          id: parentId,
          name: parentName,
          phone: parentPhone,
          email: parentEmail,
          childrenIds: [studentId]
        });
      }

      updatedStudents.push({
        id: studentId,
        name: name,
        classId: importTargetClassId,
        parentId: finalParentId,
        rollNo: rollNo,
        gender: 'male',
        dob: '2018-01-01',
        parentName: parentName
      });

      importedCount++;
    });

    if (importedCount > 0) {
      setStudents(updatedStudents);
      setParents(updatedParents);
      setPastedStudentData('');
      setShowPastedStudentInput(false);
      alert(`🎉 تم استيراد عدد ${importedCount} طالب بنجاح وتوزيعهم على الصف المحدد!`);
    } else {
      alert('لم يتم العثور على أي بيانات طلاب صالحة. يرجى التأكد من أن التنسيق يحتوي على الرقم الموحد ثم اسم الطالب ثم ولي الأمر.');
    }
  };

  const handleImportStudentsExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!importTargetClassId) {
      alert('الرجاء تحديد الصف المستهدف للاستيراد أولاً.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonRows = XLSX.utils.sheet_to_json<any>(sheet);
        
        let importedCount = 0;
        const updatedStudents = [...students];
        const updatedParents = [...parents];
        
        jsonRows.forEach(row => {
          const name = row['اسم الطالب'] || row['الاسم'] || row['اسم الطالب الثلاثي'];
          if (!name) return;
          if (String(name).includes('مثال:')) return; // Skip example row
          
          const rollNo = String(row['الرقم الموحد'] || row['رقم القيد'] || row['رقم الطالب'] || Math.floor(100 + Math.random() * 900));
          if (rollNo.includes('مثال:')) return; // Skip example row
          
          const gender = (row['الجنس'] === 'أنثى' || row['الجنس'] === 'female') ? 'female' : 'male';
          const dob = row['تاريخ الميلاد'] || '2018-01-01';
          const parentName = row['ولي الأمر'] || row['اسم ولي الأمر'] || row['اسم الاب'] || `ولي أمر ${name}`;
          if (String(parentName).includes('مثال:')) return; // Skip example row
          
          const parentPhone = String(row['رقم جوال ولي الأمر'] || row['جوال ولي الأمر'] || '0500000000');
          const parentEmail = row['بريد ولي الأمر'] || `${parentName.replace(/\s+/g, '')}@school.edu`;
          
          const parentId = 'p_imp_' + Date.now() + Math.random().toString(36).substring(2, 7);
          const studentId = 's_imp_' + Date.now() + Math.random().toString(36).substring(2, 7);
          
          updatedParents.push({
            id: parentId,
            name: parentName,
            email: parentEmail,
            phone: parentPhone,
            childrenIds: [studentId]
          });
          
          updatedStudents.push({
            id: studentId,
            name: name,
            classId: importTargetClassId,
            parentId: parentId,
            rollNo: rollNo,
            gender: gender,
            dob: dob,
            parentName: parentName
          });
          
          importedCount++;
        });
        
        if (importedCount > 0) {
          setStudents(updatedStudents);
          setParents(updatedParents);
          alert(`تم استيراد عدد ${importedCount} طالب بنجاح وربطهم بأولياء أمورهم وتوزيعهم على الصف المحدد! ✅`);
        } else {
          alert('لم يتم العثور على أي بيانات طلاب صالحة في ملف Excel.');
        }
      } catch (err) {
        console.error(err);
        alert('حدث خطأ أثناء قراءة ملف Excel.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDownloadEmptyTemplate = () => {
    if (!selectedClassForGrades) {
      alert('الرجاء اختيار الصف لتنزيل النموذج الخاص به.');
      return;
    }
    const cls = classes.find(c => c.id === selectedClassForGrades);
    if (!cls) return;
    
    const classStudents = students.filter(s => s.classId === selectedClassForGrades);
    if (classStudents.length === 0) {
      alert('لا يوجد طلاب مسجلون في هذا الصف لتوليد النموذج.');
      return;
    }
    
    const uniqueSubjects = Array.from(new Set([
      'الرياضيات', 'العلوم', 'اللغة العربية', 'التربية الإسلامية', 'اللغة الإنجليزية', 'الاجتماعيات',
      ...teachers.flatMap(t => t.subjects),
      ...grades.map(g => g.subject)
    ]));

    const headers = ['رقم الطالب', 'اسم الطالب', 'الصف', ...uniqueSubjects, 'سلوك الطالب'];

    const data = classStudents.map(s => {
      const row: any = {
        'رقم الطالب': s.rollNo,
        'اسم الطالب': s.name,
        'الصف': cls.name
      };
      uniqueSubjects.forEach(sub => {
        row[sub] = '';
      });
      row['سلوك الطالب'] = monthlyEvaluations[s.id]?.text || '';
      return row;
    });

    if (apkCompatibilityMode) {
      const headerStr = headers.join('\t');
      const rowsStr = data.map(r => {
        return headers.map(h => r[h] !== undefined ? r[h] : '').join('\t');
      }).join('\n');
      const textToCopy = `${headerStr}\n${rowsStr}`;
      triggerClipboardExport(
        "📋 نسخ نموذج رصد درجات الصف",
        `تم نسخ نموذج رصد الدرجات لطلاب الصف (${cls.name}) كـ نص منسق. يمكنك لصقه في برنامج Excel لتعديل وإضافة الدرجات، ثم نسخ الجدول بأكمله بعد التعديل ولصقه في صندوق الاستيراد النصي بالأسفل لتحديث الدرجات في ثوانٍ!`,
        textToCopy
      );
      return;
    }
    
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'نموذج رصد الدرجات');
    XLSX.writeFile(workbook, `نموذج_رصد_درجات_${cls.name.replace(/\s+/g, '_')}.xlsx`);
  };

  const handleImportGradesFromText = (pastedText: string) => {
    if (!pastedText.trim()) {
      alert('الرجاء لصق النص أولاً.');
      return;
    }
    
    try {
      const lines = pastedText.split('\n').map(l => l.trim()).filter(Boolean);
      let updatedCount = 0;
      let behaviorUpdatedCount = 0;
      const newGradesList = [...grades];
      const newMonthlyEvaluations = { ...monthlyEvaluations };
      
      const uniqueSubjects = Array.from(new Set([
        'الرياضيات', 'العلوم', 'اللغة العربية', 'التربية الإسلامية', 'اللغة الإنجليزية', 'الاجتماعيات',
        ...teachers.flatMap(t => t.subjects),
        ...grades.map(g => g.subject)
      ]));

      // Parse headers from the first line
      const firstLine = lines[0];
      const headers = firstLine.split(/\t|,/).map(h => h.trim());
      
      // Determine columns mapping
      const rollNoIdx = headers.findIndex(h => h.includes('رقم الطالب') || h.includes('رقم القيد') || h.includes('الرقم'));
      
      if (rollNoIdx === -1) {
        alert('لم يتم التعرف على عمود "رقم الطالب" في السطر الأول. يرجى إدراجه في السطر الأول كـ ترويسة.');
        return;
      }

      // Rest lines are rows
      const rows = lines.slice(1);
      
      rows.forEach(rowStr => {
        const cols = rowStr.split(/\t|,/).map(c => c.trim());
        if (cols.length <= rollNoIdx) return;
        
        const rollNo = cols[rollNoIdx];
        if (!rollNo) return;
        
        const student = students.find(s => s.rollNo === rollNo || s.id === rollNo);
        if (!student) return;

        // Find and update grades for each subject found in the headers
        headers.forEach((h, hIdx) => {
          if (hIdx === rollNoIdx) return;
          const colValue = cols[hIdx];
          if (colValue === undefined || colValue === '') return;

          if (h.includes('سلوك الطالب') || h === 'السلوك' || h === 'سلوك') {
            newMonthlyEvaluations[student.id] = {
              month: currentEvaluationMonth,
              text: colValue
            };
            behaviorUpdatedCount++;
            return;
          }

          if (uniqueSubjects.includes(h)) {
            const score = parseFloat(colValue) || 0;
            const existingIdx = newGradesList.findIndex(g => 
              g.studentId === student.id && 
              g.subject === h && 
              g.examName === 'اختبار نهائي'
            );
            
            if (existingIdx !== -1) {
              newGradesList[existingIdx] = {
                ...newGradesList[existingIdx],
                score: score,
                maxScore: 100
              };
            } else {
              newGradesList.push({
                id: 'g_imp_pst_' + Date.now() + Math.random().toString(36).substring(2, 7),
                studentId: student.id,
                subject: h,
                examName: 'اختبار نهائي',
                score: score,
                maxScore: 100,
                date: new Date().toISOString().split('T')[0],
                teacherId: 'director'
              });
            }
            updatedCount++;
          }
        });
      });

      if (updatedCount > 0 || behaviorUpdatedCount > 0) {
        if (updatedCount > 0) {
          setGrades(newGradesList);
        }
        if (behaviorUpdatedCount > 0) {
          setMonthlyEvaluations(newMonthlyEvaluations);
          localStorage.setItem('school_monthly_evaluations', JSON.stringify(newMonthlyEvaluations));
        }
        setPastedGradeData('');
        setShowPastedGradeInput(false);
        alert(`تم استيراد وتحديث عدد ${updatedCount} درجات وعدد ${behaviorUpdatedCount} تقارير سلوك للطلاب بنجاح! 📊✅`);
      } else {
        alert('لم يتم العثور على درجات أو تقارير سلوك صالحة لتحديثها.');
      }
    } catch (err) {
      console.error(err);
      alert('حدث خطأ أثناء قراءة النص المنسق للدرجات. يرجى مراجعة التنسيق.');
    }
  };

  const handleImportGradesExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonRows = XLSX.utils.sheet_to_json<any>(sheet);
        
        let updatedCount = 0;
        let behaviorUpdatedCount = 0;
        const newGradesList = [...grades];
        const newMonthlyEvaluations = { ...monthlyEvaluations };
        
        const uniqueSubjects = Array.from(new Set([
          'الرياضيات', 'العلوم', 'اللغة العربية', 'التربية الإسلامية', 'اللغة الإنجليزية', 'الاجتماعيات',
          ...teachers.flatMap(t => t.subjects),
          ...grades.map(g => g.subject)
        ]));
        
        jsonRows.forEach(row => {
          const rollNo = String(row['رقم الطالب'] || row['رقم القيد'] || '');
          if (!rollNo) return;
          
          const student = students.find(s => s.rollNo === rollNo || s.id === rollNo);
          if (!student) return;
          
          // Check for student behavior columns
          const behaviorText = row['سلوك الطالب'] !== undefined ? row['سلوك الطالب'] :
                               row['السلوك'] !== undefined ? row['السلوك'] :
                               row['سلوك'] !== undefined ? row['سلوك'] :
                               row['التقييم الشهري'] !== undefined ? row['التقييم الشهري'] : undefined;
                               
          if (behaviorText !== undefined && String(behaviorText).trim() !== '') {
            newMonthlyEvaluations[student.id] = {
              month: currentEvaluationMonth,
              text: String(behaviorText).trim()
            };
            behaviorUpdatedCount++;
          }
          
          uniqueSubjects.forEach(sub => {
            if (row[sub] !== undefined && row[sub] !== '') {
              const score = parseFloat(row[sub]) || 0;
              
              const existingIdx = newGradesList.findIndex(g => 
                g.studentId === student.id && 
                g.subject === sub && 
                g.examName === 'اختبار نهائي'
              );
              
              if (existingIdx !== -1) {
                newGradesList[existingIdx] = {
                  ...newGradesList[existingIdx],
                  score: score,
                  maxScore: 100
                };
              } else {
                newGradesList.push({
                  id: 'g_imp_' + Date.now() + Math.random().toString(36).substring(2, 7),
                  studentId: student.id,
                  subject: sub,
                  examName: 'اختبار نهائي',
                  score: score,
                  maxScore: 100,
                  date: new Date().toISOString().split('T')[0],
                  teacherId: 'director'
                });
              }
              updatedCount++;
            }
          });
        });
        
        if (updatedCount > 0 || behaviorUpdatedCount > 0) {
          if (updatedCount > 0) {
            setGrades(newGradesList);
          }
          if (behaviorUpdatedCount > 0) {
            setMonthlyEvaluations(newMonthlyEvaluations);
            localStorage.setItem('school_monthly_evaluations', JSON.stringify(newMonthlyEvaluations));
          }
          alert(`تم استيراد وتحديث عدد ${updatedCount} درجات وعدد ${behaviorUpdatedCount} تقارير سلوك للطلاب بنجاح! 📊✅`);
        } else {
          alert('لم يتم العثور على درجات أو تقارير سلوك صالحة لتحديثها.');
        }
      } catch (err) {
        console.error(err);
        alert('حدث خطأ أثناء قراءة ملف الدرجات.');
      }
      
      // Reset input value to allow uploading same file again
      if (e.target) {
        e.target.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleExportGradesExcel = () => {
    if (!selectedClassForGrades) {
      alert('الرجاء اختيار الصف أولاً لتصدير درجاته.');
      return;
    }
    const cls = classes.find(c => c.id === selectedClassForGrades);
    if (!cls) return;
    
    const classStudents = students.filter(s => s.classId === selectedClassForGrades);
    const uniqueSubjects = Array.from(new Set([
      'الرياضيات', 'العلوم', 'اللغة العربية', 'التربية الإسلامية', 'اللغة الإنجليزية', 'الاجتماعيات',
      ...teachers.flatMap(t => t.subjects),
      ...grades.map(g => g.subject)
    ]));

    const headers = ['رقم الطالب', 'اسم الطالب', 'الصف', ...uniqueSubjects, 'المعدل', 'التقدير', 'سلوك الطالب'];
    
    const data = classStudents.map(s => {
      const studentGrades = grades.filter(g => g.studentId === s.id);
      const row: any = {
        'رقم الطالب': s.rollNo,
        'اسم الطالب': s.name,
        'الصف': cls.name
      };
      
      let totalScore = 0;
      let subjectCount = 0;
      
      uniqueSubjects.forEach(sub => {
        const subGrade = studentGrades.find(g => g.subject === sub);
        if (subGrade) {
          row[sub] = subGrade.score;
          totalScore += subGrade.score;
          subjectCount++;
        } else {
          row[sub] = '';
        }
      });
      
      const avg = subjectCount > 0 ? (totalScore / subjectCount).toFixed(1) : '0';
      row['المعدل'] = avg + '%';
      
      let estimation = 'ضعيف';
      const avgNum = parseFloat(avg);
      if (avgNum >= 90) estimation = 'ممتاز';
      else if (avgNum >= 80) estimation = 'جيد جداً';
      else if (avgNum >= 70) estimation = 'جيد';
      else if (avgNum >= 60) estimation = 'مقبول';
      row['التقدير'] = estimation;
      
      // Include سلوك الطالب in export
      row['سلوك الطالب'] = monthlyEvaluations[s.id]?.text || '';
      
      return row;
    });

    if (apkCompatibilityMode) {
      const headerStr = headers.join('\t');
      const rowsStr = data.map(r => {
        return headers.map(h => r[h] !== undefined ? r[h] : '').join('\t');
      }).join('\n');
      const textToCopy = `${headerStr}\n${rowsStr}`;
      triggerClipboardExport(
        "📋 نسخ تقرير درجات الصف كـ نص",
        `تم نسخ تقرير الدرجات الشامل لجميع طلاب الصف (${cls.name}) بنجاح. يمكنك لصقها مباشرة في برنامج Excel أو Google Sheets لحفظه أو طباعته أو مشاركته!`,
        textToCopy
      );
      return;
    }
    
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'تقرير الدرجات');
    XLSX.writeFile(workbook, `تقرير_الدرجات_${cls.name.replace(/\s+/g, '_')}.xlsx`);
  };

  const handleDeleteStudents = () => {
    // 1. Determine target students to delete
    let targetStudents: Student[] = [];
    let scopeLabel = '';

    if (deleteScope === 'all') {
      targetStudents = students;
      scopeLabel = 'كامل الفوج (جميع الطلاب)';
    } else if (deleteScope === 'class') {
      if (!selectedGradeForDelete) {
        alert('الرجاء اختيار الصف المراد حذف طلابه.');
        return;
      }
      const targetClassIds = classes.filter(c => c.grade === selectedGradeForDelete).map(c => c.id);
      targetStudents = students.filter(s => targetClassIds.includes(s.classId));
      scopeLabel = `الصف: ${selectedGradeForDelete}`;
    } else if (deleteScope === 'division') {
      if (!selectedClassIdForDelete) {
        alert('الرجاء اختيار الشعبة/الفصل المراد حذف طلابه.');
        return;
      }
      targetStudents = students.filter(s => s.classId === selectedClassIdForDelete);
      const cls = classes.find(c => c.id === selectedClassIdForDelete);
      scopeLabel = `الشعبة: ${cls ? cls.name : 'غير معروفة'}`;
    }

    if (targetStudents.length === 0) {
      alert('لا يوجد أي طلاب مسجلين في النطاق المحدد لحذفهم.');
      return;
    }

    // 2. Validate confirmation text
    if (deleteConfirmationText !== 'حذف') {
      alert('الرجاء كتابة كلمة "حذف" بدقة لتأكيد العملية.');
      return;
    }

    // 3. Confirm with user via window.confirm
    const isConfirmed = confirm(
      `⚠️ تنبيه هام للغاية!
أنت على وشك حذف عدد (${targetStudents.length}) طالب/طالبة نهائياً من ${scopeLabel}.
سيؤدي هذا الإجراء أيضاً إلى حذف:
- كافة درجات وعلامات هؤلاء الطلاب.
- سجلات الحضور والغياب الخاصة بهم.
- طلبات الأعذار الطبية والغياب.
- حسابات أولياء الأمور المرتبطين بهم فقط (إذا لم يتبقَ لهم أبناء آخرون).

هل أنت متأكد تماماً من رغبتك في الحذف النهائي والكامل؟ لا يمكن التراجع عن هذه الخطوة!`
    );

    if (!isConfirmed) return;

    const studentIdsToDelete = targetStudents.map(s => s.id);

    // 4. Perform filtering (deleting) on states
    // Students
    setStudents(prev => prev.filter(s => !studentIdsToDelete.includes(s.id)));

    // Grades
    setGrades(prev => prev.filter(g => !studentIdsToDelete.includes(g.studentId)));

    // Attendance
    setAttendance(prev => prev.filter(a => !studentIdsToDelete.includes(a.studentId)));

    // Excuses
    setExcuses(prev => prev.filter(e => !studentIdsToDelete.includes(e.studentId)));

    // Messages
    setMessages(prev => prev.filter(m => !m.studentId || !studentIdsToDelete.includes(m.studentId)));

    // Parents (Update childrenIds or delete if empty)
    setParents(prev => {
      return prev
        .map(parent => ({
          ...parent,
          childrenIds: parent.childrenIds.filter(cid => !studentIdsToDelete.includes(cid))
        }))
        .filter(parent => parent.childrenIds.length > 0); // Delete parent account if they have no registered children left
    });

    // 5. Success feedback and clear inputs
    alert(`🎉 تم بنجاح حذف (${targetStudents.length}) طالب وكافة بياناتهم وسجلاتهم المرتبطة نهائياً من النظام لسهولة العمل.`);
    setDeleteConfirmationText('');
    setSelectedGradeForDelete('');
    setSelectedClassIdForDelete('');
  };

  const handleDeleteSingleItem = (category: 'students' | 'teachers' | 'announcements' | 'messages' | 'excuses' | 'classes' | 'grades', itemId: string) => {
    if (category === 'students') {
      const student = students.find(s => s.id === itemId);
      if (!student) return;
      if (!confirm(`⚠️ هل أنت متأكد من حذف الطالب (${student.name}) نهائياً من النظام؟\nسيؤدي ذلك لحذف درجاته، غيابه، وأعذاره أيضاً.`)) return;

      const updatedStudents = students.filter(s => s.id !== itemId);
      setStudents(updatedStudents);
      localStorage.setItem('school_students', JSON.stringify(updatedStudents));

      const updatedGrades = grades.filter(g => g.studentId !== itemId);
      setGrades(updatedGrades);
      localStorage.setItem('school_grades', JSON.stringify(updatedGrades));

      const updatedExcuses = excuses.filter(e => e.studentId !== itemId);
      setExcuses(updatedExcuses);
      localStorage.setItem('school_excuses', JSON.stringify(updatedExcuses));

      const updatedAttendance = attendance.filter(a => a.studentId !== itemId);
      setAttendance(updatedAttendance);
      localStorage.setItem('school_attendance', JSON.stringify(updatedAttendance));

      const updatedParents = parents.map(p => ({
        ...p,
        childrenIds: p.childrenIds.filter(cid => cid !== itemId)
      })).filter(p => p.childrenIds.length > 0);
      setParents(updatedParents);
      localStorage.setItem('school_parents', JSON.stringify(updatedParents));

      alert(`✅ تم حذف الطالب (${student.name}) بنجاح.`);
    } else if (category === 'teachers') {
      const teacher = teachers.find(t => t.id === itemId);
      if (!teacher) return;
      if (!confirm(`⚠️ هل أنت متأكد من حذف المعلم (${teacher.name}) نهائياً؟`)) return;

      const updated = teachers.filter(t => t.id !== itemId);
      setTeachers(updated);
      localStorage.setItem('school_teachers', JSON.stringify(updated));
      alert(`✅ تم حذف المعلم (${teacher.name}) بنجاح.`);
    } else if (category === 'announcements') {
      const ann = announcements.find(a => a.id === itemId);
      if (!ann) return;
      if (!confirm(`⚠️ هل أنت متأكد من حذف هذا التعميم/الإعلان؟`)) return;

      const updated = announcements.filter(a => a.id !== itemId);
      setAnnouncements(updated);
      localStorage.setItem('school_announcements', JSON.stringify(updated));
      alert(`✅ تم حذف الإعلان بنجاح.`);
    } else if (category === 'messages') {
      const msg = messages.find(m => m.id === itemId);
      if (!msg) return;
      if (!confirm(`⚠️ هل أنت متأكد من حذف هذه الرسالة؟`)) return;

      const updated = messages.filter(m => m.id !== itemId);
      setMessages(updated);
      localStorage.setItem('school_messages', JSON.stringify(updated));
      alert(`✅ تم حذف الرسالة بنجاح.`);
    } else if (category === 'excuses') {
      const exc = excuses.find(e => e.id === itemId);
      if (!exc) return;
      if (!confirm(`⚠️ هل أنت متأكد من حذف هذا العذر؟`)) return;

      const updated = excuses.filter(e => e.id !== itemId);
      setExcuses(updated);
      localStorage.setItem('school_excuses', JSON.stringify(updated));
      alert(`✅ تم حذف العذر الطبي بنجاح.`);
    } else if (category === 'classes') {
      const cls = classes.find(c => c.id === itemId);
      if (!cls) return;
      if (!confirm(`⚠️ هل أنت متأكد من حذف الصف/الشعبة (${cls.name})؟ سيتم إلغاء تعيين أي طلاب أو معلمين منتسبين لها.`)) return;

      const updated = classes.filter(c => c.id !== itemId);
      setClasses(updated);
      localStorage.setItem('school_classes', JSON.stringify(updated));
      alert(`✅ تم حذف الصف/الشعبة بنجاح.`);
    } else if (category === 'grades') {
      const gd = grades.find(g => g.id === itemId);
      if (!gd) return;
      if (!confirm(`⚠️ هل أنت متأكد من حذف سجل رصد هذه الدرجة؟`)) return;

      const updated = grades.filter(g => g.id !== itemId);
      setGrades(updated);
      localStorage.setItem('school_grades', JSON.stringify(updated));
      alert(`✅ تم حذف سجل الدرجة بنجاح.`);
    }
  };

  const handleBulkDeleteCategory = (category: 'students' | 'teachers' | 'announcements' | 'messages' | 'excuses' | 'classes' | 'grades') => {
    if (bulkDeleteConfirmation !== 'تأكيد الحذف') {
      alert('الرجاء كتابة عبارة "تأكيد الحذف" بدقة لتفعيل تصفير الفئة.');
      return;
    }

    let label = '';
    if (category === 'students') label = 'كافة الطلاب وأولياء أمورهم ودرجاتهم وغيابهم';
    else if (category === 'teachers') label = 'كافة المعلمين المسجلين';
    else if (category === 'announcements') label = 'كافة الإعلانات والتعاميم المدرسية';
    else if (category === 'messages') label = 'كافة الرسائل والإشعارات';
    else if (category === 'excuses') label = 'كافة الأعذار الطبية وطلبات الغياب';
    else if (category === 'classes') label = 'كافة الصفوف والشعب المدرسية';
    else if (category === 'grades') label = 'كافة درجات وعلامات الطلاب المترصدة';

    if (!confirm(`🚨🚨🚨 تحذير أمني خطير للغاية!\nهل أنت متأكد تماماً وبشكل قاطع من رغبتك في حذف وتصفير (${label}) بالكامل؟\nلا يمكن التراجع عن هذا الإجراء الإطلاقي أبداً!`)) {
      return;
    }

    if (category === 'students') {
      setStudents([]);
      localStorage.setItem('school_students', JSON.stringify([]));
      setGrades([]);
      localStorage.setItem('school_grades', JSON.stringify([]));
      setExcuses([]);
      localStorage.setItem('school_excuses', JSON.stringify([]));
      setAttendance([]);
      localStorage.setItem('school_attendance', JSON.stringify([]));
      setParents([]);
      localStorage.setItem('school_parents', JSON.stringify([]));
    } else if (category === 'teachers') {
      setTeachers([]);
      localStorage.setItem('school_teachers', JSON.stringify([]));
    } else if (category === 'announcements') {
      setAnnouncements([]);
      localStorage.setItem('school_announcements', JSON.stringify([]));
    } else if (category === 'messages') {
      setMessages([]);
      localStorage.setItem('school_messages', JSON.stringify([]));
    } else if (category === 'excuses') {
      setExcuses([]);
      localStorage.setItem('school_excuses', JSON.stringify([]));
    } else if (category === 'classes') {
      setClasses([]);
      localStorage.setItem('school_classes', JSON.stringify([]));
    } else if (category === 'grades') {
      setGrades([]);
      localStorage.setItem('school_grades', JSON.stringify([]));
    }

    setBulkDeleteConfirmation('');
    alert(`🎉 تم بنجاح تصفير وحذف فئة (${label}) بالكامل وبدء صفحة جديدة.`);
  };

  const getFilteredPurgeItems = () => {
    const query = deleteSearchQuery.toLowerCase().trim();
    switch (targetDeleteCategory) {
      case 'students':
        return students.filter(s => 
          !query || 
          s.name.toLowerCase().includes(query) || 
          (classes.find(c => c.id === s.classId)?.name || '').toLowerCase().includes(query)
        );
      case 'teachers':
        return teachers.filter(t => 
          !query || 
          t.name.toLowerCase().includes(query) || 
          t.subjects.some(sub => sub.toLowerCase().includes(query))
        );
      case 'announcements':
        return announcements.filter(a => 
          !query || 
          a.title.toLowerCase().includes(query) || 
          a.content.toLowerCase().includes(query)
        );
      case 'messages':
        return messages.filter(m => 
          !query || 
          m.content.toLowerCase().includes(query) || 
          m.senderName.toLowerCase().includes(query)
        );
      case 'excuses':
        return excuses.filter(e => {
          const stud = students.find(s => s.id === e.studentId);
          return !query || 
            (stud?.name || '').toLowerCase().includes(query) || 
            e.reason.toLowerCase().includes(query);
        });
      case 'classes':
        return classes.filter(c => 
          !query || 
          c.name.toLowerCase().includes(query) || 
          c.grade.toLowerCase().includes(query)
        );
      case 'grades':
        return grades.filter(g => {
          const stud = students.find(s => s.id === g.studentId);
          return !query || 
            (stud?.name || '').toLowerCase().includes(query) || 
            g.subject.toLowerCase().includes(query);
        });
      default:
        return [];
    }
  };

  const handleDeleteAllAppData = () => {
    const isConfirmed = confirm(
      `⚠️ تحذير أمني خطير وعاجل جداً!
أنت تقوم الآن بـ "تصفير وحذف كامل بيانات التطبيق" بالكامل.
سيشمل هذا الإجراء حذف:
1. جميع المعلمين المسجلين وبياناتهم وكلمات مرورهم.
2. جميع الطلاب المسجلين وشعبهم ودرجاتهم.
3. جميع أولياء الأمور وحساباتهم.
4. جميع الصفوف والصفوف الدراسية بالكامل.
5. كافة سجلات الحضور والغياب، التعاميم، الرسائل، وطلبات الغياب بالكامل من المتصفح.

هل تريد بالتأكيد تصفير المنصة وحذف كل شيء نهائياً للبدء بصفحة جديدة؟`
    );
    if (!isConfirmed) return;

    localStorage.clear();
    setTeachers([]);
    setClasses([]);
    setParents([]);
    setStudents([]);
    setAttendance([]);
    setGrades([]);
    setAnnouncements([]);
    setMessages([]);
    setExcuses([]);

    alert('🎉 تم بنجاح تصفير المنصة وحذف كافة البيانات والملفات والصفوف بالكامل! التطبيق جاهز الآن للبدء من جديد.');
  };

  const handleQuickDeleteCohort = () => {
    if (students.length === 0) {
      alert('لا يوجد أي طلاب مسجلين في الفوج حالياً لحذفهم.');
      return;
    }
    const isConfirmed = confirm(
      `⚠️ هل تريد بالتأكيد حذف كامل الفوج الدراسي المتمثل في جميع الطلاب وعددهم (${students.length}) طالب وطالبة؟\nسيتم حذف جميع سجلاتهم من درجات، غياب وحضور، وأعذار تبريرية تلقائياً.`
    );
    if (!isConfirmed) return;

    const studentIds = students.map(s => s.id);
    setStudents([]);
    setGrades(prev => prev.filter(g => !studentIds.includes(g.studentId)));
    setAttendance(prev => prev.filter(a => !studentIds.includes(a.studentId)));
    setExcuses(prev => prev.filter(e => !studentIds.includes(e.studentId)));
    setMessages(prev => prev.filter(m => !m.studentId || !studentIds.includes(m.studentId)));
    setParents(prev => {
      return prev
        .map(parent => ({
          ...parent,
          childrenIds: parent.childrenIds.filter(cid => !studentIds.includes(cid))
        }))
        .filter(parent => parent.childrenIds.length > 0);
    });

    alert('🎉 تم بنجاح حذف الفوج الدراسي بالكامل وتصفير جميع سجلات الطلاب.');
  };

  const handleQuickDeleteGrade = (gradeName: string) => {
    if (!gradeName) {
      alert('الرجاء اختيار الصف الدراسي أولاً.');
      return;
    }
    const targetClasses = classes.filter(c => c.grade === gradeName);
    const targetClassIds = targetClasses.map(c => c.id);
    const targetStudents = students.filter(s => targetClassIds.includes(s.classId));

    if (targetStudents.length === 0) {
      alert(`لا يوجد أي طلاب مسجلين في الصف (${gradeName}) حالياً.`);
      return;
    }

    const isConfirmed = confirm(
      `⚠️ هل تريد بالتأكيد حذف كافة طلاب الصف (${gradeName}) وعددهم (${targetStudents.length}) طالب وطالبة؟\nسيتم تصفير وحذف جميع سجلاتهم المرتبطة (درجات، غياب وحضور، أعذار).`
    );
    if (!isConfirmed) return;

    const studentIds = targetStudents.map(s => s.id);
    setStudents(prev => prev.filter(s => !studentIds.includes(s.id)));
    setGrades(prev => prev.filter(g => !studentIds.includes(g.studentId)));
    setAttendance(prev => prev.filter(a => !studentIds.includes(a.studentId)));
    setExcuses(prev => prev.filter(e => !studentIds.includes(e.studentId)));
    setMessages(prev => prev.filter(m => !m.studentId || !studentIds.includes(m.studentId)));
    setParents(prev => {
      return prev
        .map(parent => ({
          ...parent,
          childrenIds: parent.childrenIds.filter(cid => !studentIds.includes(cid))
        }))
        .filter(parent => parent.childrenIds.length > 0);
    });

    setQuickDeleteGrade('');
    alert(`🎉 تم بنجاح حذف جميع طلاب الصف (${gradeName}) وسجلاتهم المرتبطة.`);
  };

  const handleQuickDeleteClass = (classId: string) => {
    if (!classId) {
      alert('الرجاء اختيار الشعبة المحددة أولاً.');
      return;
    }
    const cls = classes.find(c => c.id === classId);
    const targetStudents = students.filter(s => s.classId === classId);

    if (targetStudents.length === 0) {
      alert(`لا يوجد أي طلاب مسجلين في الشعبة (${cls?.name || 'المحددة'}) حالياً.`);
      return;
    }

    const isConfirmed = confirm(
      `⚠️ هل تريد بالتأكيد حذف جميع طلاب الشعبة (${cls?.name || ''}) وعددهم (${targetStudents.length}) طالب وطالبة؟\nسيتم حذف جميع علاماتهم وسجلات حضورهم وغيابهم وأعذارهم تلقائياً.`
    );
    if (!isConfirmed) return;

    const studentIds = targetStudents.map(s => s.id);
    setStudents(prev => prev.filter(s => !studentIds.includes(s.id)));
    setGrades(prev => prev.filter(g => !studentIds.includes(g.studentId)));
    setAttendance(prev => prev.filter(a => !studentIds.includes(a.studentId)));
    setExcuses(prev => prev.filter(e => !studentIds.includes(e.studentId)));
    setMessages(prev => prev.filter(m => !m.studentId || !studentIds.includes(m.studentId)));
    setParents(prev => {
      return prev
        .map(parent => ({
          ...parent,
          childrenIds: parent.childrenIds.filter(cid => !studentIds.includes(cid))
        }))
        .filter(parent => parent.childrenIds.length > 0);
    });

    setQuickDeleteClassId('');
    alert(`🎉 تم بنجاح حذف طلاب الشعبة (${cls?.name || ''}) وسجلاتهم نهائياً.`);
  };

  const handleDownloadBackup = () => {
    const backupData = {
      teachers,
      students,
      classes,
      parents,
      grades,
      attendance,
      announcements,
      messages,
      excuses,
      directorPassword,
      system_patches: JSON.parse(localStorage.getItem('system_patches') || '[]'),
      backupDate: new Date().toISOString()
    };
    const jsonStr = JSON.stringify(backupData);

    if (apkCompatibilityMode) {
      triggerClipboardExport(
        "📋 نسخ كود النسخة الاحتياطية",
        "تم نسخ كود النسخة الاحتياطية الكامل للمدرسة بنجاح إلى الحافظة! يمكنك لصقه وحفظه في تطبيق الملاحظات أو إرساله لنفسك، والرجوع لاستعادته بلصقه في أي وقت دون استخدام ملفات.",
        jsonStr
      );
      return;
    }

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(jsonStr);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `نسخة_احتياطية_المدرسة_الدولية_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleRestoreBackupFromText = (pastedJsonText: string) => {
    if (!pastedJsonText.trim()) {
      alert('الرجاء لصق الكود الاحتياطي أولاً.');
      return;
    }
    try {
      const backup = JSON.parse(pastedJsonText.trim());
      if (confirm('هل أنت متأكد من استعادة النسخة الاحتياطية؟ سيؤدي ذلك إلى استبدال كافة البيانات الحالية بالبيانات الملصقة.')) {
        if (backup.teachers) setTeachers(backup.teachers);
        if (backup.students) setStudents(backup.students);
        if (backup.classes) setClasses(backup.classes);
        if (backup.parents) setParents(backup.parents);
        if (backup.grades) setGrades(backup.grades);
        if (backup.attendance) setAttendance(backup.attendance);
        if (backup.announcements) setAnnouncements(backup.announcements);
        if (backup.messages) setMessages(backup.messages);
        if (backup.excuses) setExcuses(backup.excuses);
        if (backup.directorPassword && changeDirectorPassword) {
          changeDirectorPassword(backup.directorPassword);
        }
        if (backup.system_patches) {
          localStorage.setItem('system_patches', JSON.stringify(backup.system_patches));
        }
        setPastedBackupData('');
        setShowPastedBackupInput(false);
        alert('تم استعادة النسخة الاحتياطية بنجاح وتحديث كافة البيانات! 🔄');
      }
    } catch (err) {
      alert('فشلت قراءة كود النسخة الاحتياطية. يرجى التأكد من صحة النص البرمجي الاحتياطي ولصقه كاملاً.');
    }
  };

  const handleRestoreBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const backup = JSON.parse(evt.target?.result as string);
        if (confirm('هل أنت متأكد من استعادة النسخة الاحتياطية؟ سيؤدي ذلك إلى استبدال كافة البيانات الحالية بالبيانات المرفوعة.')) {
          if (backup.teachers) setTeachers(backup.teachers);
          if (backup.students) setStudents(backup.students);
          if (backup.classes) setClasses(backup.classes);
          if (backup.parents) setParents(backup.parents);
          if (backup.grades) setGrades(backup.grades);
          if (backup.attendance) setAttendance(backup.attendance);
          if (backup.announcements) setAnnouncements(backup.announcements);
          if (backup.messages) setMessages(backup.messages);
          if (backup.excuses) setExcuses(backup.excuses);
          if (backup.directorPassword && changeDirectorPassword) {
            changeDirectorPassword(backup.directorPassword);
          }
          if (backup.system_patches) {
            localStorage.setItem('system_patches', JSON.stringify(backup.system_patches));
          }
          alert('تم استعادة النسخة الاحتياطية بنجاح وتحديث كافة البيانات! 🔄');
        }
      } catch (err) {
        alert('فشلت قراءة الملف. يرجى التأكد من اختيار ملف نسخة احتياطية صالح بتنسيق JSON.');
      }
    };
    reader.readAsText(file);
  };

  const handleApplyPatch = () => {
    if (!patchInput.trim()) {
      alert('الرجاء لصق الكود البرمجي أولاً.');
      return;
    }
    try {
      const patches = JSON.parse(localStorage.getItem('system_patches') || '[]');
      patches.push(patchInput);
      localStorage.setItem('system_patches', JSON.stringify(patches));
      
      eval(patchInput);
      alert('تم اعتماد وتطبيق الميزة البرمجية المحدثة بنجاح! 🚀');
      setPatchInput('');
    } catch (err: any) {
      alert(`خطأ أثناء تشغيل التحديث: ${err.message}`);
    }
  };

  const handleAddClass = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassName.trim() || !newClassGrade.trim()) {
      alert('الرجاء كتابة اسم الصف والمرحلة الدراسية');
      return;
    }
    const newClassObj: Class = {
      id: `class-${Date.now()}`,
      name: newClassName.trim(),
      grade: newClassGrade.trim(),
      room: newClassRoom.trim() || 'غير محدد',
      teacherId: newClassTeacherId || ''
    };
    setClasses(prev => {
      const updated = [...prev, newClassObj];
      localStorage.setItem('school_classes', JSON.stringify(updated));
      return updated;
    });
    setNewClassName('');
    setNewClassGrade('');
    setNewClassRoom('');
    setNewClassTeacherId('');
    setShowClassForm(false);
    alert('🎉 تم إضافة الصف الدراسي والشعبة بنجاح!');
  };

  const handleEditTeacher = (teacher: Teacher) => {
    setEditingTeacher(teacher);
    setNewTeacher({
      name: teacher.name,
      email: teacher.email,
      phone: teacher.phone,
      subjectsStr: teacher.subjects.join('، '),
      classId: teacher.classes[0] || '',
      password: teacher.password || '123'
    });
    
    const isFullClass = teacher.subjects.includes('عام - جميع المواد');
    if (isFullClass) {
      setTeacherAssignmentType('full_class');
      setTeacherSelectedClassId(teacher.classes[0] || '');
      setTeacherSelectedSubject('');
      setTeacherSelectedClassIds([]);
    } else {
      setTeacherAssignmentType('subject_multi_class');
      setTeacherSelectedClassId('');
      
      const subject = teacher.subjects[0] || '';
      if (customSubjects.includes(subject)) {
        setTeacherSelectedSubject(subject);
      } else {
        setTeacherSelectedSubject('NEW_SUBJECT');
        setTeacherNewSubjectInput(subject);
      }
      setTeacherSelectedClassIds(teacher.classes);
    }
    
    setShowTeacherForm(true);
    setTimeout(() => {
      const formElement = document.getElementById('dir-btn-add-teacher');
      if (formElement) {
        formElement.scrollIntoView({ behavior: 'smooth' });
      }
    }, 100);
  };

  // Handlers
  const handleAddTeacher = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeacher.name.trim() || !newTeacher.password.trim()) {
      alert('الرجاء كتابة اسم المعلم والرمز السري الخاص به');
      return;
    }
    
    let finalSubjects: string[] = [];
    let finalClasses: string[] = [];

    if (teacherAssignmentType === 'full_class') {
      if (!teacherSelectedClassId) {
        alert('الرجاء اختيار الصف الدراسي المراد تخصيصه للمعلم');
        return;
      }
      finalClasses = [teacherSelectedClassId];
      finalSubjects = ['عام - جميع المواد'];
    } else {
      // subject_multi_class
      let subject = teacherSelectedSubject;
      if (subject === 'NEW_SUBJECT') {
        subject = teacherNewSubjectInput.trim();
      }
      if (!subject) {
        alert('الرجاء اختيار أو كتابة اسم المادة الدراسية');
        return;
      }
      if (teacherSelectedClassIds.length === 0) {
        alert('الرجاء اختيار صف واحد على الأقل للمادة الدراسية');
        return;
      }
      finalSubjects = [subject];
      finalClasses = teacherSelectedClassIds;

      // Auto-save subject if it's new
      if (subject && !customSubjects.includes(subject)) {
        const updated = [...customSubjects, subject];
        setCustomSubjects(updated);
        localStorage.setItem('school_custom_subjects', JSON.stringify(updated));
      }
    }

    const generatedEmail = `${newTeacher.name.trim().replace(/\s+/g, '')}_${Date.now()}@school.com`;
    const defaultPhone = '0500000000';

    if (editingTeacher) {
      // Edit mode
      const updatedTeachers = teachers.map(t => {
        if (t.id === editingTeacher.id) {
          return {
            ...t,
            name: newTeacher.name.trim(),
            password: newTeacher.password.trim(),
            subjects: finalSubjects,
            classes: finalClasses,
          };
        }
        return t;
      });
      setTeachers(updatedTeachers);
      localStorage.setItem('school_teachers', JSON.stringify(updatedTeachers));
    } else {
      // Add mode
      addTeacher({
        name: newTeacher.name.trim(),
        email: generatedEmail,
        phone: defaultPhone,
        subjects: finalSubjects,
        classes: finalClasses,
        password: newTeacher.password.trim()
      });
    }

    const isEdit = !!editingTeacher;

    setNewTeacher({ name: '', email: '', phone: '', subjectsStr: '', classId: '', password: '123' });
    setTeacherSelectedClassId('');
    setTeacherSelectedSubject('');
    setTeacherSelectedClassIds([]);
    setTeacherNewSubjectInput('');
    setTeacherAssignmentType('full_class');
    setShowTeacherForm(false);
    setEditingTeacher(null);
    alert(isEdit ? '🎉 تم تعديل بيانات المعلم بنجاح!' : '🎉 تم إضافة المعلم وتخصيص جدول حصصه بنجاح!');
  };

  const handleAddStudent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudent.name || !newStudent.classId || !newStudent.parentName || !newStudent.rollNo) {
      alert('الرجاء تعبئة كافة الحقول المطلوبة: اسم الطالب، الرقم الموحد، اسم ولي الأمر، والصف الدراسي.');
      return;
    }

    const finalRollNo = newStudent.rollNo;
    const finalPhone = newStudent.parentPhone || ('05' + finalRollNo.padEnd(8, '0').slice(0, 8));
    const finalEmail = newStudent.parentEmail || `${newStudent.parentName.replace(/\s+/g, '') || 'parent'}@school.edu`;

    addStudent(
      {
        name: newStudent.name,
        classId: newStudent.classId,
        parentId: '', // generated inside App.tsx
        rollNo: finalRollNo,
        gender: newStudent.gender || 'male',
        dob: newStudent.dob || '2018-01-01',
        parentName: newStudent.parentName
      },
      {
        name: newStudent.parentName,
        email: finalEmail,
        phone: finalPhone
      }
    );

    setNewStudent({
      name: '',
      classId: '',
      rollNo: '',
      gender: 'male',
      dob: '',
      parentName: '',
      parentEmail: '',
      parentPhone: ''
    });
    setShowStudentForm(false);
  };

  const handleAddAnnounce = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAnnounce.title || !newAnnounce.content) return;

    addAnnouncement({
      title: newAnnounce.title,
      content: newAnnounce.content,
      target: newAnnounce.target
    });

    setNewAnnounce({ title: '', content: '', target: 'all' });
    setShowAnnounceForm(false);
  };

  // Filter teachers & students
  const filteredTeachers = teachers.filter(t => 
    t.name.toLowerCase().includes(teacherSearch.toLowerCase()) ||
    t.email.toLowerCase().includes(teacherSearch.toLowerCase()) ||
    t.subjects.some(s => s.toLowerCase().includes(teacherSearch.toLowerCase()))
  );

  const filteredStudents = students.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
      s.rollNo.includes(studentSearch) ||
      s.parentName.toLowerCase().includes(studentSearch.toLowerCase());
    
    const matchesClass = selectedClassForStudentAffairs === 'all' || s.classId === selectedClassForStudentAffairs;
    
    return matchesSearch && matchesClass;
  });

  if (!isLoggedIn) {
    return (
      <div id="director-login-container" className="bg-white min-h-[500px] rounded-2xl border border-slate-200 shadow-md flex flex-col items-center justify-center p-8 max-w-md mx-auto my-12">
        <div className="p-4 bg-indigo-50 text-indigo-600 rounded-2xl mb-4 shadow-sm">
          <Building className="w-12 h-12" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 text-center">المدرسة الدولية</h2>
        <p className="text-xs text-slate-400 text-center mt-1">حلب - مدينة مارع (بوابة المدير العام)</p>
        
        <form onSubmit={(e) => {
          e.preventDefault();
          if (passwordInput === (directorPassword || '123')) {
            setIsLoggedIn(true);
            setLoginError('');
          } else {
            setLoginError('كلمة المرور غير صحيحة، حاول مجدداً.');
          }
        }} className="w-full mt-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 text-right">كلمة مرور المدير العام</label>
            <div className="relative">
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                <Lock className="w-4 h-4" />
              </span>
              <input
                type="password"
                value={passwordInput}
                onChange={e => setPasswordInput(e.target.value)}
                placeholder="أدخل كلمة المرور..."
                className="w-full text-xs border border-slate-200 pr-10 pl-4 py-2.5 rounded-xl focus:border-indigo-500 focus:outline-none text-center font-bold font-mono tracking-widest"
                required
              />
            </div>
            {loginError && (
              <p className="text-xs text-rose-500 mt-2 font-semibold text-center">{loginError}</p>
            )}
          </div>

          <button
            type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-3 px-4 rounded-xl transition shadow-sm cursor-pointer"
          >
            تسجيل الدخول للمتابعة
          </button>
          
          <div className="mt-4 p-3 bg-amber-50 border border-amber-100 rounded-xl">
            <p className="text-[10px] text-amber-800 text-center leading-relaxed">
              تلميح للتجربة: كلمة مرور المدير الافتراضية هي <strong className="font-mono bg-amber-100 px-1 py-0.5 rounded text-amber-950 font-bold">123</strong>
            </p>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div id="director-portal-root" className="bg-slate-50 min-h-full rounded-2xl border border-slate-200 overflow-hidden shadow-md flex flex-col md:flex-row">
      {/* Principal App Sidebar */}
      <div id="director-sidebar" className="w-full md:w-64 bg-slate-950 text-white p-4 md:p-6 flex flex-col justify-between">
        <div>
          {/* Sidebar Header - Compact with Menu toggle on Mobile */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4 md:mb-8 md:pb-5">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-indigo-600 rounded-lg text-white shadow-sm shrink-0">
                <Building className="w-4 h-4" />
              </div>
              <div className="text-right">
                <h2 className="font-bold text-xs md:text-sm text-slate-100">تطبيق المدير</h2>
                <span className="text-[9px] text-indigo-400 font-bold block">الإدارة العامة</span>
              </div>
              
              {/* Firestore Consumption Alert Indicator */}
              <button
                type="button"
                onClick={() => setIsMetricsModalOpen(true)}
                title="مراقبة استهلاك Firestore"
                className={`p-1.5 rounded-lg border transition-all duration-200 cursor-pointer relative flex items-center justify-center shrink-0 mr-1.5 ${
                  firestoreMetrics.totalReads >= 36000
                    ? 'bg-rose-950/40 text-rose-400 border-rose-500/30 hover:bg-rose-950/85 hover:border-rose-500'
                    : firestoreMetrics.totalReads >= 30000
                    ? 'bg-amber-950/40 text-amber-400 border-amber-500/30 hover:bg-amber-950/85 hover:border-amber-500'
                    : 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30 hover:bg-emerald-950/85 hover:border-emerald-500'
                }`}
              >
                <Activity className={`w-3.5 h-3.5 ${firestoreMetrics.totalReads >= 30000 ? 'animate-pulse' : ''}`} />
                <span className={`absolute -top-0.5 -left-0.5 w-2 h-2 rounded-full ${
                  firestoreMetrics.totalReads >= 36000
                    ? 'bg-rose-500 animate-ping'
                    : firestoreMetrics.totalReads >= 30000
                    ? 'bg-amber-500 animate-ping'
                    : 'bg-emerald-500'
                }`} />
              </button>
            </div>
            
            {/* Hamburger Button for Mobile on the Right */}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 text-slate-300 hover:text-white hover:bg-slate-900 rounded-lg transition cursor-pointer"
              aria-label="القائمة"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>

          {/* Navigation Links - Collapsible on Mobile */}
          <div className={`${isMobileMenuOpen ? 'block' : 'hidden md:block'} space-y-1`}>
            <nav className="space-y-1">
              <button
                id="dir-nav-dashboard"
                onClick={() => {
                  setActiveTab('dashboard');
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-right text-sm font-medium transition-all duration-200 ${
                  activeTab === 'dashboard' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                }`}
              >
                <Building className="w-5 h-5 shrink-0" />
                <span>لوحة التحكم الرئيسية</span>
              </button>

              <button
                id="dir-nav-subjects"
                onClick={() => {
                  setActiveTab('subjects');
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-right text-sm font-medium transition-all duration-200 ${
                  activeTab === 'subjects' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                }`}
              >
                <BookOpen className="w-5 h-5 shrink-0 text-emerald-400" />
                <span>إدارة المواد الدراسية 📚</span>
                <span className="mr-auto bg-slate-950/40 text-emerald-400 border border-emerald-900/30 px-2.5 py-0.5 rounded-full text-[11px] font-bold">{customSubjects.length}</span>
              </button>

              <button
                id="dir-nav-classes"
                onClick={() => {
                  setActiveTab('classes');
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-right text-sm font-medium transition-all duration-200 ${
                  activeTab === 'classes' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                }`}
              >
                <Building className="w-5 h-5 shrink-0 text-indigo-400" />
                <span>إدارة الصفوف والشعب 🏫</span>
                <span className="mr-auto bg-slate-950/40 text-indigo-400 border border-indigo-900/30 px-2.5 py-0.5 rounded-full text-[11px] font-bold">{classes.length}</span>
              </button>

              <button
                id="dir-nav-teachers"
                onClick={() => {
                  setActiveTab('teachers');
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-right text-sm font-medium transition-all duration-200 ${
                  activeTab === 'teachers' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                }`}
              >
                <Users className="w-5 h-5 shrink-0" />
                <span>شؤون المعلمين</span>
                <span className="mr-auto bg-slate-900 px-2 py-0.5 rounded-full text-xs text-slate-300">{teachers.length}</span>
              </button>

              <button
                id="dir-nav-students"
                onClick={() => {
                  setActiveTab('students');
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-right text-sm font-medium transition-all duration-200 ${
                  activeTab === 'students' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                }`}
              >
                <GraduationCap className="w-5 h-5 shrink-0" />
                <span>شؤون الطلاب وأولياء الأمور</span>
                <span className="mr-auto bg-slate-900 px-2 py-0.5 rounded-full text-xs text-slate-300">{students.length}</span>
              </button>

              <button
                id="dir-nav-excuses"
                onClick={() => {
                  setActiveTab('excuses');
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-right text-sm font-medium transition-all duration-200 ${
                  activeTab === 'excuses' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                }`}
              >
                <FileCheck className="w-5 h-5 shrink-0" />
                <span>طلبات الغياب والأعذار</span>
                {excuses.filter(e => e.status === 'pending').length > 0 && (
                  <span className="mr-auto bg-red-500 text-white px-2 py-0.5 rounded-full text-xs font-bold animate-pulse">
                    {excuses.filter(e => e.status === 'pending').length}
                  </span>
                )}
              </button>

              <button
                id="dir-nav-announcements"
                onClick={() => {
                  setActiveTab('announcements');
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-right text-sm font-medium transition-all duration-200 ${
                  activeTab === 'announcements' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                }`}
              >
                <Megaphone className="w-5 h-5 shrink-0" />
                <span>الإعلانات والتعاميم</span>
                <span className="mr-auto bg-slate-900 px-2 py-0.5 rounded-full text-xs text-slate-300">{announcements.length}</span>
              </button>

              <button
                id="dir-nav-grades"
                onClick={() => {
                  setActiveTab('grades');
                  if (classes.length > 0 && !selectedClassForGrades) {
                    setSelectedClassForGrades(classes[0].id);
                  }
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-right text-sm font-medium transition-all duration-200 ${
                  activeTab === 'grades' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                }`}
              >
                <FileCheck className="w-5 h-5 shrink-0" />
                <span>كشوفات ومعالجة الدرجات</span>
              </button>

              <button
                id="dir-nav-tuition"
                onClick={() => {
                  setActiveTab('tuition');
                  if (classes.length > 0 && !selectedClassForTuition) {
                    setSelectedClassForTuition(classes[0].id);
                  }
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-right text-sm font-medium transition-all duration-200 ${
                  activeTab === 'tuition' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                }`}
              >
                <Coins className="w-5 h-5 shrink-0 text-amber-400" />
                <span>إدارة الأقساط والرسوم 💰</span>
              </button>

              <button
                id="dir-nav-messages"
                onClick={() => {
                  setActiveTab('messages');
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-right text-sm font-medium transition-all duration-200 ${
                  activeTab === 'messages' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                }`}
              >
                <MessageSquare className="w-5 h-5 shrink-0 text-sky-400" />
                <span>المراسلات والرسائل</span>
                {messages.filter(m => m.receiverRole === 'director' && !m.read).length > 0 && (
                  <span className="mr-auto bg-rose-500 text-white px-2 py-0.5 rounded-full text-xs font-bold animate-pulse">
                    {messages.filter(m => m.receiverRole === 'director' && !m.read).length} جديدة
                  </span>
                )}
              </button>



              <button
                id="dir-nav-settings"
                onClick={() => {
                  setActiveTab('settings');
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-right text-sm font-medium transition-all duration-200 ${
                  activeTab === 'settings' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                }`}
              >
                <Settings className="w-5 h-5 shrink-0 text-indigo-400" />
                <span>الإعدادات والتحديثات الذكية</span>
              </button>
            </nav>
          </div>
        </div>

        {/* User login info & Logout - Collapsible on Mobile */}
        <div className={`${isMobileMenuOpen ? 'block mt-6' : 'hidden md:block'} mt-8 border-t border-slate-800 pt-5 text-xs text-slate-500 space-y-3`}>
          <div className="flex items-center gap-2 justify-end">
            <span>تسجيل الدخول: المدير العام</span>
            <UserCheck className="w-4 h-4 text-indigo-500" />
          </div>
          <div className={`flex items-center gap-2 justify-end px-3 py-2 rounded-xl border mt-1 ${
            activeAcademicYear === 'غير محدد' 
              ? 'bg-amber-950/20 border-amber-900/30 text-amber-400' 
              : 'bg-indigo-950/20 border-indigo-900/30 text-indigo-400'
          }`}>
            <span className="font-bold text-xs">العام الدراسي: {activeAcademicYear}</span>
            <Calendar className="w-4 h-4 shrink-0" />
          </div>

          <button
            onClick={() => {
              setIsLoggedIn(false);
              setPasswordInput('');
              setIsMobileMenuOpen(false);
            }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-rose-950/40 text-rose-300 hover:bg-rose-950/75 border border-rose-900/30 rounded-xl text-[11px] font-bold transition cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>قفل البوابة (خروج)</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-6 md:p-8 overflow-y-auto max-h-[800px]">
        <AnimatePresence mode="wait">
          {/* Dashboard Tab */}
          {activeTab === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-slate-800">مرحباً بك، سعادة المدير العام</h1>
                  <p className="text-slate-500 text-sm mt-1">نظرة عامة على حالة المدرسة ومؤشر الأداء اليومي</p>
                </div>
                <div className="flex items-center gap-3 self-end sm:self-center">
                  <div className={`text-xs px-3.5 py-1.5 rounded-xl font-bold border flex items-center gap-1.5 ${
                    activeAcademicYear === 'غير محدد'
                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                      : 'bg-indigo-50 text-indigo-800 border-indigo-200'
                  }`}>
                    <Calendar className={`w-4 h-4 ${activeAcademicYear === 'غير محدد' ? 'text-amber-600 animate-pulse' : 'text-indigo-600'}`} />
                    <span>العام الدراسي: {activeAcademicYear} {activeAcademicYear === 'غير محدد' && '⚠️'}</span>
                  </div>
                  <div className="text-xs bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg font-medium border border-indigo-100 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-indigo-600 animate-ping"></span>
                    <span>البيانات محدثة فورياً</span>
                  </div>
                </div>
              </div>

              {/* Firestore Resource Usage Safety Indicator */}
              <div className={`p-4 rounded-xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-all ${
                firestoreMetrics.totalReads >= 40000
                  ? 'bg-rose-50 border-rose-200 text-rose-900 shadow-xs'
                  : firestoreMetrics.totalReads >= 30000
                  ? 'bg-amber-50 border-amber-200 text-amber-900 shadow-xs'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-900 shadow-xs'
              }`}>
                <div className="flex items-start gap-3">
                  <div className={`p-2.5 rounded-lg shrink-0 mt-0.5 ${
                    firestoreMetrics.totalReads >= 40000
                      ? 'bg-rose-100 text-rose-600'
                      : firestoreMetrics.totalReads >= 30000
                      ? 'bg-amber-100 text-amber-600'
                      : 'bg-emerald-100 text-emerald-600'
                  }`}>
                    <Activity className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm">مؤشر أمان استهلاك السحاب (Firestore Usage Safety)</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                        firestoreMetrics.totalReads >= 40000
                          ? 'bg-rose-100 text-rose-700'
                          : firestoreMetrics.totalReads >= 30000
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {firestoreMetrics.totalReads >= 40000 ? 'تحذير حرج' : firestoreMetrics.totalReads >= 30000 ? 'تنبيه' : 'آمن ومستقر'}
                      </span>
                    </div>
                    
                    {firestoreMetrics.totalReads >= 40000 ? (
                      <p className="text-xs font-bold text-rose-600 mt-1 animate-pulse">
                        ⚠️ تحذير: اقتربت من حدود الاستهلاك المجاني (تجاوزت 40,000 عملية قراءة يومياً)
                      </p>
                    ) : (
                      <p className="text-xs text-slate-500 mt-1">
                        استهلاك عمليات قاعدة البيانات سليم وتحت السيطرة الكاملة لمعدل القراءات والكتابات اليومية.
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto justify-end">
                  <div className="text-left font-mono text-xs">
                    <span className="text-slate-400 block text-[10px] font-sans">معدل القراءة اليومية</span>
                    <strong className="text-slate-700">{firestoreMetrics.totalReads.toLocaleString()}</strong> / <span className="text-slate-400">40,000</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsMetricsModalOpen(true)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold shadow-xs cursor-pointer transition flex items-center gap-1.5 ${
                      firestoreMetrics.totalReads >= 40000
                        ? 'bg-rose-600 text-white hover:bg-rose-700'
                        : firestoreMetrics.totalReads >= 30000
                        ? 'bg-amber-600 text-white hover:bg-amber-700'
                        : 'bg-slate-950 text-white hover:bg-slate-800'
                    }`}
                  >
                    <Info className="w-3.5 h-3.5" />
                    <span>عرض التقرير الكامل</span>
                  </button>
                </div>
              </div>

              {/* Stats Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                  <div className="p-3.5 bg-indigo-50 text-indigo-600 rounded-xl">
                    <GraduationCap className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block font-medium">إجمالي الطلاب</span>
                    <span className="text-2xl font-bold text-slate-800">{students.length} طالباً</span>
                  </div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                  <div className="p-3.5 bg-emerald-50 text-emerald-600 rounded-xl">
                    <Users className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block font-medium">أعضاء هيئة التدريس</span>
                    <span className="text-2xl font-bold text-slate-800">{teachers.length} معلمين</span>
                  </div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                  <div className="p-3.5 bg-indigo-50 text-indigo-600 rounded-xl">
                    <BookOpen className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block font-medium">الصفوف الدراسية</span>
                    <span className="text-2xl font-bold text-slate-800">{classes.length} فصول</span>
                  </div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                  <div className="p-3.5 bg-amber-50 text-amber-600 rounded-xl">
                    <FileCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block font-medium">طلبات معلقة</span>
                    <span className={`text-2xl font-bold ${excuses.filter(e => e.status === 'pending').length > 0 ? 'text-amber-600' : 'text-slate-800'}`}>
                      {excuses.filter(e => e.status === 'pending').length} طلبات
                    </span>
                  </div>
                </div>
              </div>



              {/* Quick Actions Panel */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4 text-right">
                <div className="border-b border-slate-100 pb-3">
                  <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2 justify-end">
                    <span className="bg-indigo-50 text-indigo-600 px-2.5 py-1 rounded-lg text-xs font-bold">إجراءات سريعة</span>
                    <span>العمليات والوصول الإداري السريع ⚡</span>
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-1">أضف المواد الدراسية إلى المنصة مباشرة بنقرة واحدة لتسهيل العمل الإداري.</p>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  {/* Subject Addition Button */}
                  <button
                    onClick={() => setShowSubjectModal(true)}
                    className="group relative overflow-hidden bg-white hover:bg-slate-50 text-slate-850 p-5 rounded-2xl transition-all duration-300 flex items-center justify-between gap-4 cursor-pointer border border-slate-200 hover:border-indigo-200 hover:shadow-lg text-right w-full"
                  >
                    <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl group-hover:scale-110 transition-transform duration-300">
                      <BookOpen className="w-6 h-6 text-indigo-500" />
                    </div>
                    <div className="flex-1">
                      <span className="block font-black text-sm text-indigo-600">إضافة مادة دراسية جديدة 📚</span>
                      <span className="block text-[10px] text-slate-500 mt-1 font-sans">إضافة مادة دراسية جديدة وتفعيلها لتخصيصها للمعلمين والدرجات</span>
                    </div>
                  </button>
                </div>
              </div>







              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* School Classes list */}
                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm lg:col-span-2">
                  <h3 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-sky-600" />
                    <span>الصفوف الدراسية المشرف عليها</span>
                  </h3>
                  <div className="space-y-3">
                    {classes.map(cls => {
                      const teacher = teachers.find(t => t.id === cls.teacherId);
                      const classStudents = students.filter(s => s.classId === cls.id);
                      return (
                        <div key={cls.id} className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between hover:bg-slate-100/50 transition">
                          <div>
                            <span className="font-bold text-slate-800 text-sm block">{cls.name}</span>
                            <span className="text-xs text-slate-500 mt-1 block">رائد الفصل: {teacher ? teacher.name : 'غير معين'}</span>
                          </div>
                          <div className="text-left">
                            <span className="text-xs bg-sky-50 text-sky-700 px-2 py-1 rounded-md font-semibold">{classStudents.length} طلاب مسجلين</span>
                            <span className="text-xs text-slate-400 block mt-1">{cls.room}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Latest Announcements */}
                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                      <Megaphone className="w-5 h-5 text-sky-600" />
                      <span>آخر الإعلانات المدرسية</span>
                    </h3>
                  </div>
                  <div className="space-y-3 max-h-[260px] overflow-y-auto">
                    {announcements.slice(0, 3).map(announce => (
                      <div key={announce.id} className="p-3 bg-slate-50 rounded-xl border-r-4 border-sky-600 border-y border-l border-slate-100">
                        <div className="flex justify-between">
                          <span className="font-bold text-xs text-slate-800">{announce.title}</span>
                          <span className="text-[10px] text-slate-400">{announce.date}</span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{announce.content}</p>
                        <div className="mt-2 flex justify-between items-center">
                          <span className="text-[9px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-medium">
                            المستهدف: {announce.target === 'all' ? 'الجميع' : announce.target === 'teachers' ? 'المعلمون' : 'أولياء الأمور'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Director Security Settings */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                  <Key className="w-4 h-4 text-indigo-600" />
                  <span>إعدادات أمان حساب المدير العام</span>
                </h3>
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <div className="flex-1">
                    <p className="text-xs text-slate-500 leading-relaxed text-right">
                      يمكنك تعديل كلمة المرور الخاصة بحساب الإدارة العامة لحماية بيانات المنصة وتأمين البوابات. كلمة المرور الحالية هي: <strong className="font-mono bg-indigo-50 px-2 py-0.5 rounded text-indigo-700 font-bold">{directorPassword}</strong>
                    </p>
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                    <input
                      type="text"
                      placeholder="كلمة مرور جديدة..."
                      id="director-new-password-input"
                      className="text-xs border border-slate-200 px-3 py-2 rounded-lg focus:border-indigo-500 focus:outline-none font-mono text-center w-full sm:w-36"
                    />
                    <button
                      onClick={() => {
                        const input = document.getElementById('director-new-password-input') as HTMLInputElement;
                        if (input && input.value.trim()) {
                          changeDirectorPassword?.(input.value.trim());
                          alert('تم تغيير كلمة مرور المدير العام بنجاح!');
                          input.value = '';
                        } else {
                          alert('الرجاء إدخال كلمة مرور جديدة صالحة');
                        }
                      }}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition shrink-0 cursor-pointer shadow-sm"
                    >
                      تحديث كلمة المرور
                    </button>
                  </div>
                </div>
              </div>

              {/* FCM Server Key Settings */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm mt-4 text-right">
                <h3 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-2 justify-end">
                  <span>إعدادات إشعارات الدفع الخارجية (FCM Web Push)</span>
                  <Bell className="w-4 h-4 text-indigo-600" />
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed mb-4">
                  لتشغيل الإشعارات المباشرة على هواتف أولياء الأمور (خارج التطبيق) عند إضافتها للشاشة الرئيسية، يرجى لصق مفتاح خادم Firebase Cloud Messaging (FCM Server Key - Legacy) المأخوذ من وحدة تحكم Firebase (Firebase Console ← Project Settings ← Cloud Messaging):
                </p>
                <div className="flex flex-col sm:flex-row items-center gap-3">
                  <input
                    type="password"
                    placeholder="أدخل مفتاح خادم FCM المخصص (AAAABv...)"
                    id="director-fcm-server-key-input"
                    defaultValue={localStorage.getItem('fcm_server_key') || ''}
                    className="text-xs border border-slate-200 px-3 py-2.5 rounded-lg focus:border-indigo-500 focus:outline-none font-mono text-right w-full flex-1"
                  />
                  <div className="flex gap-2 w-full sm:w-auto">
                    <button
                      onClick={() => {
                        const input = document.getElementById('director-fcm-server-key-input') as HTMLInputElement;
                        if (input) {
                          const keyVal = input.value.trim();
                          if (keyVal) {
                            localStorage.setItem('fcm_server_key', keyVal);
                            alert('🎉 تم حفظ مفتاح خادم FCM بنجاح! الإشعارات الخارجية مفعلة الآن.');
                          } else {
                            localStorage.removeItem('fcm_server_key');
                            alert('🗑️ تم إزالة مفتاح خادم FCM المخصص. سيتم استخدام المفتاح الافتراضي المؤقت.');
                          }
                        }
                      }}
                      className="bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold px-4 py-2.5 rounded-lg transition shrink-0 cursor-pointer shadow-sm flex-1 sm:flex-initial"
                    >
                      حفظ المفتاح
                    </button>
                    <button
                      onClick={() => {
                        const input = document.getElementById('director-fcm-server-key-input') as HTMLInputElement;
                        if (input) {
                          input.value = '';
                          localStorage.removeItem('fcm_server_key');
                          alert('🗑️ تم مسح وإلغاء مفتاح خادم FCM.');
                        }
                      }}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold px-3 py-2.5 rounded-lg transition cursor-pointer"
                    >
                      مسح
                    </button>
                  </div>
                </div>
              </div>

              {/* Direct Access Links */}
              <div id="direct-links-sharing-panel" className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm mt-6">
                <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                  <ArrowLeftRight className="w-4 h-4 text-indigo-600" />
                  <span>روابط المشاركة والوصول المباشر للبوابات الفرعية</span>
                </h3>
                <p className="text-xs text-slate-500 mb-4 leading-relaxed text-right">
                  نعم، يمكنك إرسال رابط مخصص لكل فئة ليعملوا عليه بمفردهم. عند فتح الرابط المخصص، سيتم إخفاء شريط التنقل العلوي تلقائياً وتثبيت البوابة المختارة فقط لضمان الخصوصية وسهولة الاستخدام. انسخ الروابط أدناه أو اضغط على الزر لتجربتها مباشرة:
                </p>

                {/* Important Sandbox Notice */}
                <div className="mb-4 p-3 bg-amber-50/80 border border-amber-200 rounded-xl text-right">
                  <span className="text-xs font-bold text-amber-900 block mb-1">⚠️ تنبيه هام حول تجربة الروابط في بيئة التطوير:</span>
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    الرابط المولد أدناه يحتوي على نطاق التطوير الخاص بك (<span className="font-mono bg-amber-100 px-1 py-0.5 rounded text-amber-950">ais-dev-...</span>) وهو يعمل لديك فقط. عند قيامك بمشاركة التطبيق بشكل عام (Publish أو Share)، ستقوم بمشاركة النطاق العام للجميع (<span className="font-mono bg-amber-100 px-1 py-0.5 rounded text-amber-950">ais-pre-...</span>) وسيعمل هذا الرابط تلقائياً لدى جميع المعلمين وأولياء الأمور دون أي مشاكل.
                  </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {/* Director Direct Link Card */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col justify-between gap-3 text-right">
                    <div>
                      <div className="flex items-center gap-2 mb-1 justify-end">
                        <span className="text-xs font-bold text-slate-900">رابط لوحة المدير العام المباشر</span>
                        <Building className="w-4 h-4 text-slate-700" />
                      </div>
                      <p className="text-[10px] text-slate-500 leading-relaxed">
                        استخدم هذا الرابط للوصول كمدير مباشرة بدون شريط التنقل العلوي، لتلقي جميع الإشعارات وإدارة النظام بأمان كامل.
                      </p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <input
                        type="text"
                        readOnly
                        value={`${getShareableOrigin()}${window.location.pathname}?portal=director`}
                        className="text-[10px] font-mono bg-white border border-slate-200 px-2 py-1.5 rounded text-slate-600 w-full text-center select-all"
                      />
                      <div className="flex gap-2">
                        <a
                          href={`${getShareableOrigin()}${window.location.pathname}?portal=director`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-slate-800 hover:bg-slate-900 text-white text-[11px] font-bold px-3 py-2 rounded-lg text-center transition flex-1 cursor-pointer shadow-xs inline-flex items-center justify-center gap-1"
                        >
                          <span>فتح للتجربة ↗</span>
                        </a>
                        <button
                          onClick={async () => {
                            const url = `${getShareableOrigin()}${window.location.pathname}?portal=director`;
                            try {
                              await navigator.clipboard.writeText(url);
                              alert('تم نسخ رابط لوحة المدير المباشر بنجاح! 📋');
                            } catch (err) {
                              alert('تمنع حما�ية المتصفح النسخ التلقائي في هذا الإطار. يرجى تحديد النص في المربع ونسخه يدوياً (Ctrl+C).');
                            }
                          }}
                          className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-[11px] font-bold px-3 py-2 rounded-lg transition cursor-pointer shadow-xs"
                        >
                          نسخ الرابط
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Teacher Direct Link Card */}
                  <div className="p-4 bg-indigo-50/50 rounded-xl border border-indigo-100 flex flex-col justify-between gap-3 text-right">
                    <div>
                      <div className="flex items-center gap-2 mb-1 justify-end">
                        <span className="text-xs font-bold text-indigo-950">رابط بوابة المعلمين المباشر</span>
                        <Users className="w-4 h-4 text-indigo-600" />
                      </div>
                      <p className="text-[10px] text-slate-500 leading-relaxed">
                        أرسل هذا الرابط للمعلمين للدخول برمزهم السري ورؤية واجهة التحضير ورصد الدرجات فقط.
                      </p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <input
                        type="text"
                        readOnly
                        value={`${getShareableOrigin()}${window.location.pathname}?portal=teacher`}
                        className="text-[10px] font-mono bg-white border border-slate-200 px-2 py-1.5 rounded text-slate-600 w-full text-center select-all"
                      />
                      <div className="flex gap-2">
                        <a
                          href={`${getShareableOrigin()}${window.location.pathname}?portal=teacher`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold px-3 py-2 rounded-lg text-center transition flex-1 cursor-pointer shadow-xs inline-flex items-center justify-center gap-1"
                        >
                          <span>فتح للتجربة ↗</span>
                        </a>
                        <button
                          onClick={async () => {
                            const url = `${getShareableOrigin()}${window.location.pathname}?portal=teacher`;
                            try {
                              await navigator.clipboard.writeText(url);
                              alert('تم نسخ رابط بوابة المعلمين المباشر بنجاح!');
                            } catch (err) {
                              alert('تمنع حماية المتصفح النسخ التلقائي في هذا الإطار. يرجى تحديد النص في المربع ونسخه يدوياً (Ctrl+C).');
                            }
                          }}
                          className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-[11px] font-bold px-3 py-2 rounded-lg transition cursor-pointer shadow-xs"
                        >
                          نسخ الرابط
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Parent Direct Link Card */}
                  <div className="p-4 bg-sky-50/50 rounded-xl border border-sky-100 flex flex-col justify-between gap-3 text-right">
                    <div>
                      <div className="flex items-center gap-2 mb-1 justify-end">
                        <span className="text-xs font-bold text-sky-950">رابط بوابة أولياء الأمور المباشر</span>
                        <GraduationCap className="w-4 h-4 text-sky-600" />
                      </div>
                      <p className="text-[10px] text-slate-500 leading-relaxed">
                        أرسل هذا الرابط لأولياء الأمور لمتابعة مستويات أبنائهم وإرسال تبريرات الغياب والتواصل مباشرة.
                      </p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <input
                        type="text"
                        readOnly
                        value={`${getShareableOrigin()}${window.location.pathname}?portal=parent`}
                        className="text-[10px] font-mono bg-white border border-slate-200 px-2 py-1.5 rounded text-slate-600 w-full text-center select-all"
                      />
                      <div className="flex gap-2">
                        <a
                          href={`${getShareableOrigin()}${window.location.pathname}?portal=parent`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-bold px-3 py-2 rounded-lg text-center transition flex-1 cursor-pointer shadow-xs inline-flex items-center justify-center gap-1"
                        >
                          <span>فتح للتجربة ↗</span>
                        </a>
                        <button
                          onClick={async () => {
                            const url = `${getShareableOrigin()}${window.location.pathname}?portal=parent`;
                            try {
                              await navigator.clipboard.writeText(url);
                              alert('تم نسخ رابط بوابة أولياء الأمور المباشر بنجاح!');
                            } catch (err) {
                              alert('تمنع حماية المتصفح النسخ التلقائي في هذا الإطار. يرجى تحديد النص في المربع ونسخه يدوياً (Ctrl+C).');
                            }
                          }}
                          className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-[11px] font-bold px-3 py-2 rounded-lg transition cursor-pointer shadow-xs"
                        >
                          نسخ الرابط
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Teachers Tab */}
          {activeTab === 'teachers' && (
            <motion.div
              key="teachers"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-6"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-slate-800 text-right">شؤون المعلمين 👤</h1>
                  <p className="text-slate-500 text-sm mt-1 text-right">إضافة، تعديل ومتابعة الكادر التعليمي بالفصول</p>
                </div>
                <button
                  id="dir-btn-add-teacher"
                  onClick={() => {
                    if (showTeacherForm && editingTeacher) {
                      setEditingTeacher(null);
                      setNewTeacher({ name: '', email: '', phone: '', subjectsStr: '', classId: '', password: '123' });
                      setTeacherSelectedClassId('');
                      setTeacherSelectedSubject('');
                      setTeacherSelectedClassIds([]);
                      setTeacherNewSubjectInput('');
                    } else {
                      setShowTeacherForm(!showTeacherForm);
                      if (!showTeacherForm) {
                        setEditingTeacher(null);
                        setNewTeacher({ name: '', email: '', phone: '', subjectsStr: '', classId: '', password: '123' });
                        setTeacherSelectedClassId('');
                        setTeacherSelectedSubject('');
                        setTeacherSelectedClassIds([]);
                        setTeacherNewSubjectInput('');
                      }
                    }
                  }}
                  className="bg-sky-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 hover:bg-sky-700 shadow-md shadow-sky-100 transition cursor-pointer self-start sm:self-auto"
                >
                  <Plus className="w-5 h-5" />
                  <span>{editingTeacher ? 'إلغاء التعديل والعودة للإضافة' : 'إضافة معلم جديد'}</span>
                </button>
              </div>

              {/* Add Teacher Form Toggle */}
              {showTeacherForm && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="bg-white p-6 rounded-2xl border border-sky-100 shadow-sm text-right"
                >
                  <div className="border-b border-slate-100 pb-3 mb-4">
                    <h3 className="font-bold text-slate-800 text-base">
                      {editingTeacher ? `تعديل بيانات المعلم: ${editingTeacher.name} 👤` : 'نموذج إضافة معلم جديد 👤'}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      {editingTeacher ? 'قم بتعديل بيانات المعلم وتحديث مسؤولياته وجدول حصصه.' : 'أدخل بيانات الحساب الأساسية وحدد جدول الفصول والمسؤوليات مباشرة.'}
                    </p>
                  </div>

                  <form onSubmit={handleAddTeacher} className="space-y-6">
                    {/* Part 1: Credentials */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">اسم المعلم الثلاثي *</label>
                        <input
                          type="text"
                          value={newTeacher.name}
                          onChange={e => setNewTeacher({ ...newTeacher, name: e.target.value })}
                          placeholder="مثال: أ. فيصل السديري"
                          className="w-full text-sm border border-slate-200 px-3.5 py-2.5 rounded-xl focus:border-sky-500 focus:outline-none"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">الرقم السري الخاص بالمعلم (ليفتح التطبيق) *</label>
                        <input
                          type="text"
                          value={newTeacher.password}
                          onChange={e => setNewTeacher({ ...newTeacher, password: e.target.value })}
                          placeholder="أدخل الرقم السري لدخول المعلم..."
                          className="w-full text-sm border border-slate-200 px-3.5 py-2.5 rounded-xl focus:border-sky-500 focus:outline-none font-mono font-bold"
                          required
                        />
                      </div>
                    </div>

                    {/* Part 2: Assignment Mode Selection */}
                    <div className="bg-slate-50/70 p-4 rounded-2xl border border-slate-100 space-y-3">
                      <label className="block text-xs font-bold text-slate-700">تخصيص مسؤولية المعلم وجدول الفصول *</label>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setTeacherAssignmentType('full_class');
                            setTeacherSelectedClassIds([]);
                          }}
                          className={`p-4 rounded-xl border text-right transition-all cursor-pointer flex flex-col justify-between h-24 ${
                            teacherAssignmentType === 'full_class'
                              ? 'bg-sky-50 border-sky-400 text-sky-950 shadow-sm'
                              : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-600'
                          }`}
                        >
                          <span className="font-bold text-xs block">🏫 تعيين كـ رائد فصل / صف كامل</span>
                          <span className="text-[10px] text-slate-400 mt-1 block">يكون المعلم مسؤولاً بشكل أساسي عن صف وشعبة دراسية كاملة بكل موادها.</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setTeacherAssignmentType('subject_multi_class');
                            setTeacherSelectedClassId('');
                          }}
                          className={`p-4 rounded-xl border text-right transition-all cursor-pointer flex flex-col justify-between h-24 ${
                            teacherAssignmentType === 'subject_multi_class'
                              ? 'bg-indigo-50 border-indigo-400 text-indigo-950 shadow-sm'
                              : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-600'
                          }`}
                        >
                          <span className="font-bold text-xs block">📚 مادة محددة لأكثر من صف / شعبة</span>
                          <span className="text-[10px] text-slate-400 mt-1 block">يدرّس المعلم مادة معينة (مثل الرياضيات) في عدة شعب دراسية مختلفة.</span>
                        </button>
                      </div>
                    </div>

                    {/* Part 3: Class/Subject Selection Dropdowns */}
                    <div className="border border-slate-100 p-4 rounded-2xl bg-white space-y-4">
                      {teacherAssignmentType === 'full_class' ? (
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1.5">اختر الصف والشعبة الدراسية (قائمة منسدلة) *</label>
                          <select
                            value={teacherSelectedClassId}
                            onChange={e => setTeacherSelectedClassId(e.target.value)}
                            className="w-full text-sm border border-slate-200 px-3.5 py-2.5 rounded-xl bg-white focus:border-sky-500 focus:outline-none"
                            required={teacherAssignmentType === 'full_class'}
                          >
                            <option value="">-- اختر الصف الدراسي للمعلم --</option>
                            {classes.map(c => (
                              <option key={c.id} value={c.id}>{c.name} ({c.grade})</option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1.5">المادة الدراسية (قائمة منسدلة) *</label>
                              <select
                                value={teacherSelectedSubject}
                                onChange={e => setTeacherSelectedSubject(e.target.value)}
                                className="w-full text-sm border border-slate-200 px-3.5 py-2.5 rounded-xl bg-white focus:border-indigo-500 focus:outline-none font-semibold"
                                required={teacherAssignmentType === 'subject_multi_class'}
                              >
                                <option value="">-- اختر المادة الدراسية --</option>
                                {customSubjects.map(sub => (
                                  <option key={sub} value={sub}>{sub}</option>
                                ))}
                                <option value="NEW_SUBJECT" className="text-indigo-600 font-bold">+ إضافة مادة جديدة غير مسجلة...</option>
                              </select>
                            </div>

                            {teacherSelectedSubject === 'NEW_SUBJECT' && (
                              <div className="animate-fade-in">
                                <label className="block text-xs font-bold text-indigo-700 mb-1.5">اسم المادة الجديدة المراد إضافتها وحفظها *</label>
                                <input
                                  type="text"
                                  value={teacherNewSubjectInput}
                                  onChange={e => setTeacherNewSubjectInput(e.target.value)}
                                  placeholder="اكتب مادة جديدة مثلاً: التربية الأسرية"
                                  className="w-full text-sm border border-indigo-200 px-3.5 py-2.5 rounded-xl focus:border-indigo-500 focus:outline-none bg-indigo-50/10"
                                  required={teacherSelectedSubject === 'NEW_SUBJECT'}
                                />
                              </div>
                            )}
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">اختر الفصول والشعب التي يدرسها المعلم (أكثر من صف) *</label>
                            <p className="text-[10px] text-slate-400 mb-2 font-sans">بإمكانك تحديد صف واحد أو عدة صفوف تدرس بها هذه المادة:</p>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-40 overflow-y-auto p-2 border border-slate-100 rounded-xl bg-slate-50/50">
                              {classes.map(c => {
                                const isSelected = teacherSelectedClassIds.includes(c.id);
                                return (
                                  <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => {
                                      if (isSelected) {
                                        setTeacherSelectedClassIds(prev => prev.filter(id => id !== c.id));
                                      } else {
                                        setTeacherSelectedClassIds(prev => [...prev, c.id]);
                                      }
                                    }}
                                    className={`p-2 rounded-lg border text-right transition text-xs font-semibold flex items-center justify-between gap-2 cursor-pointer ${
                                      isSelected
                                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                                    }`}
                                  >
                                    <span className="truncate">{c.name}</span>
                                    <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center border text-[9px] font-bold ${
                                      isSelected ? 'bg-white text-indigo-600 border-white' : 'border-slate-300 bg-slate-50'
                                    }`}>
                                      {isSelected ? '✓' : ''}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Part 4: Form Actions */}
                    <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => {
                          setShowTeacherForm(false);
                          setTeacherSelectedClassId('');
                          setTeacherSelectedSubject('');
                          setTeacherSelectedClassIds([]);
                          setTeacherNewSubjectInput('');
                        }}
                        className="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 rounded-xl transition cursor-pointer"
                      >
                        إلغاء
                      </button>
                      <button
                        type="submit"
                        className={`px-6 py-2.5 text-xs font-bold text-white rounded-xl shadow-md transition cursor-pointer ${
                          teacherAssignmentType === 'full_class' ? 'bg-sky-600 hover:bg-sky-700 shadow-sky-100' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-100'
                        }`}
                      >
                        {editingTeacher ? 'تعديل بيانات المعلم وحفظ التغييرات 💾' : 'إضافة المعلم وحفظ البيانات ✨'}
                      </button>
                    </div>
                  </form>
                </motion.div>
              )}

              {/* Teachers List Box */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-slate-100 flex items-center justify-between gap-4">
                  <div className="relative flex-1 max-w-md">
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                      <Search className="w-4 h-4" />
                    </span>
                    <input
                      type="text"
                      placeholder="البحث عن معلم بالاسم أو المادة..."
                      value={teacherSearch}
                      onChange={e => setTeacherSearch(e.target.value)}
                      className="w-full text-xs border border-slate-200 pr-10 pl-4 py-2 rounded-xl focus:border-sky-500 focus:outline-none"
                    />
                  </div>
                  <span className="text-xs text-slate-400 font-medium">عدد النتائج: {filteredTeachers.length}</span>
                </div>

                <div className="divide-y divide-slate-100">
                  {filteredTeachers.map(teacher => (
                    <div key={teacher.id} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-full bg-sky-50 text-sky-600 flex items-center justify-center font-bold text-sm">
                          {teacher.name.replace('أ.', '').trim().charAt(0)}
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-800 text-sm">{teacher.name}</h4>
                          <span className="text-[11px] text-slate-400 mt-0.5 block">تاريخ الانضمام: {teacher.joinDate}</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1.5 sm:max-w-xs">
                        {teacher.subjects.map((sub, i) => (
                          <span key={i} className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                            {sub}
                          </span>
                        ))}
                      </div>

                      <div className="space-y-1 text-slate-500 text-xs">
                        <div className="flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5 text-slate-400" />
                          <span>{teacher.email}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-slate-400" />
                          <span>{teacher.phone}</span>
                        </div>
                      </div>

                      <div className="flex flex-col sm:items-end gap-2.5">
                        {teacher.classes.length > 0 ? (
                          <span className="text-xs bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-lg font-semibold border border-emerald-100 self-start sm:self-auto">
                            مشرف على {classes.find(c => c.id === teacher.classes[0])?.name || 'فصل مجهول'}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 font-medium italic bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100 self-start sm:self-auto">بدون إشراف صف</span>
                        )}

                        <div className="flex flex-col gap-1 bg-slate-50 border border-slate-100 p-2 rounded-xl w-full sm:w-auto">
                          <div className="flex items-center gap-1 justify-end">
                            <Lock className="w-3 h-3 text-indigo-500" />
                            <span className="text-[10px] font-bold text-slate-700">كلمة المرور: <span className="font-mono bg-indigo-50 text-indigo-700 px-1 py-0.5 rounded">{teacher.password || '123'}</span></span>
                          </div>
                          <div className="flex gap-1.5 mt-1 justify-between">
                            <input
                              type="text"
                              placeholder="تغيير كلمة المرور..."
                              id={`teacher-pass-input-${teacher.id}`}
                              className="text-[9px] w-24 border border-slate-200 px-1.5 py-1 rounded bg-white focus:outline-none focus:border-indigo-500 font-mono text-center font-bold"
                            />
                            <button
                              onClick={() => {
                                const input = document.getElementById(`teacher-pass-input-${teacher.id}`) as HTMLInputElement;
                                if (input && input.value.trim()) {
                                  updateTeacherPassword?.(teacher.id, input.value.trim());
                                  alert(`تم تحديث كلمة مرور المعلم ${teacher.name} إلى: ${input.value.trim()}`);
                                  input.value = '';
                                } else {
                                  alert('الرجاء إدخال كلمة مرور جديدة');
                                }
                              }}
                              className="bg-indigo-600 hover:bg-indigo-700 text-white text-[9px] font-bold px-2 py-1 rounded transition cursor-pointer shrink-0 shadow-xs"
                            >
                              حفظ
                            </button>
                          </div>
                        </div>

                        {/* Edit and Delete Action Buttons */}
                        <div className="flex gap-2 w-full sm:w-auto justify-end mt-1">
                          <button
                            onClick={() => handleEditTeacher(teacher)}
                            className="bg-sky-50 hover:bg-sky-100 text-sky-700 text-xs font-bold px-3 py-1.5 rounded-lg border border-sky-200 transition cursor-pointer flex items-center gap-1 shadow-xs"
                          >
                            <Edit className="w-3.5 h-3.5" />
                            <span>تعديل</span>
                          </button>
                          <button
                            onClick={() => handleDeleteSingleItem('teachers', teacher.id)}
                            className="bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold px-3 py-1.5 rounded-lg border border-rose-200 transition cursor-pointer flex items-center gap-1 shadow-xs"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>حذف</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}

                  {filteredTeachers.length === 0 && (
                    <div className="p-8 text-center text-slate-400 text-sm">
                      لم يتم العثور على أي معلم تطابق معايير البحث.
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* Students Tab */}
          {activeTab === 'students' && (
            <motion.div
              key="students"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-6"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-slate-800">شؤون الطلاب وأولياء الأمور</h1>
                  <p className="text-slate-500 text-sm mt-1">تسجيل الطلاب الجدد وتوثيق ارتباطهم بأولياء أمورهم فورياً</p>
                </div>
                <button
                  id="dir-btn-add-student"
                  onClick={() => setShowStudentForm(!showStudentForm)}
                  className="bg-sky-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 hover:bg-sky-700 shadow-md shadow-sky-100 transition cursor-pointer self-start sm:self-auto"
                >
                  <Plus className="w-5 h-5" />
                  <span>تسجيل طالب جديد (يدوي)</span>
                </button>
              </div>

              {/* Class & Section Selection for viewing and registration */}
              <div className="bg-sky-50/40 border border-sky-100/60 p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <span className="text-xs font-bold text-sky-950 flex items-center gap-1.5 justify-end sm:justify-start">
                    <span className="w-2.5 h-2.5 rounded-full bg-sky-500"></span>
                    <span>حدد الصف والشعبة المطلوب رصد/عرض طلابها:</span>
                  </span>
                  <div className="relative">
                    <select
                      value={selectedClassForStudentAffairs}
                      onChange={(e) => setSelectedClassForStudentAffairs(e.target.value)}
                      className="w-full sm:w-64 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-800 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer text-right appearance-none pl-8 pr-3 shadow-xs"
                      style={{ direction: 'rtl' }}
                    >
                      <option value="all">كل الصفوف والشعب (الكل)</option>
                      {classes.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                      <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                        <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
                      </svg>
                    </div>
                  </div>
                </div>

                {selectedClassForStudentAffairs !== 'all' ? (
                  <div className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100/50 self-start md:self-auto flex items-center gap-1">
                    <span>✅ تم التحديد:</span>
                    <span className="font-bold">"{classes.find(c => c.id === selectedClassForStudentAffairs)?.name}"</span>
                    <span>- أي طالب جديد ستتم إضافته لهذا الصف تلقائياً.</span>
                  </div>
                ) : (
                  <div className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-100/50 self-start md:self-auto">
                    💡 حدد صفاً وشعبةً من القائمة المنسدلة للفلترة التلقائية وتسهيل الإضافة اليدوية.
                  </div>
                )}
              </div>

              {/* Excel Bulk Student Import Card */}
              <div className="bg-slate-50 border border-slate-100 p-5 rounded-2xl text-right space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/60 pb-4">
                  <button
                    type="button"
                    onClick={handleDownloadStudentAffairsTemplate}
                    className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 justify-center shadow-md shadow-emerald-100 transition cursor-pointer self-start"
                  >
                    <Download className="w-4 h-4" />
                    <span>تنزيل نموذج Excel الفارغ 📄</span>
                  </button>
                  <div className="flex-1 text-right">
                    <h3 className="font-bold text-slate-800 text-sm mb-1 flex items-center gap-2 justify-end">
                      <Upload className="w-4 h-4 text-sky-600" />
                      <span>الربط واستيراد الطلاب الجماعي بملف Excel</span>
                    </h3>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      قم بتحميل النموذج الفارغ وإضافة بيانات <strong className="text-emerald-700 font-bold">(الرقم الموحد، اسم الطالب، ولي الأمر)</strong>، ثم حدد الصف المخصص وقم برفع الملف لتوزيعهم مباشرة.
                    </p>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-xs space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5">1. حدد الصف المستهدف للاستيراد أولاً:</label>
                      <select
                        value={importTargetClassId}
                        onChange={e => setImportTargetClassId(e.target.value)}
                        className="w-full text-xs border border-slate-200 px-3.5 py-2.5 rounded-xl bg-white focus:border-sky-500 focus:outline-none"
                      >
                        <option value="">-- اختر صف الاستيراد --</option>
                        {classes.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    
                    {!apkCompatibilityMode ? (
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1.5">2. اختر ملف Excel وقم بالرفع:</label>
                        <div className="relative">
                          <input
                            type="file"
                            accept=".xlsx, .xls"
                            onChange={handleImportStudentsExcel}
                            disabled={!importTargetClassId}
                            className="opacity-0 absolute inset-0 w-full h-full cursor-pointer disabled:cursor-not-allowed"
                          />
                          <div className={`w-full text-xs font-semibold text-center border-2 border-dashed rounded-xl py-2.5 px-4 transition ${
                            importTargetClassId 
                              ? 'border-sky-300 hover:bg-sky-50/50 text-sky-700' 
                              : 'border-slate-200 bg-slate-50 text-slate-400'
                          }`}>
                            {importTargetClassId ? '📤 انقر هنا لاختيار ورفع كشف الأسماء' : '⚠️ يرجى تحديد الصف أولاً لتفعيل الرفع'}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <button
                          type="button"
                          onClick={() => setShowPastedStudentInput(!showPastedStudentInput)}
                          disabled={!importTargetClassId}
                          className={`w-full text-xs font-bold py-3 px-4 rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 ${
                            importTargetClassId
                              ? 'bg-sky-600 hover:bg-sky-700 text-white shadow-sm'
                              : 'bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed'
                          }`}
                        >
                          <span>📥 لصق كشف أسماء الطلاب من الحافظة</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {apkCompatibilityMode && showPastedStudentInput && importTargetClassId && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="p-3.5 bg-sky-50/50 border border-sky-100 rounded-xl space-y-2.5 text-right"
                    >
                      <div className="text-right">
                        <span className="block text-xs font-bold text-sky-950">📋 لصق جدول الطلاب من إكسل / شيتس</span>
                        <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                          قم بنسخ الجدول المكون من الأعمدة (الرقم الموحد، اسم الطالب، ولي الأمر) من تطبيق Excel أو Google Sheets بالهاتف، ثم الصقه بالأسفل للاستيراد الفوري:
                        </p>
                      </div>
                      <textarea
                        rows={4}
                        value={pastedStudentData}
                        onChange={e => setPastedStudentData(e.target.value)}
                        placeholder="الصق الخلايا المنسوخة هنا...&#10;مثال:&#10;1002030401	محمد أحمد	أحمد العتيبي"
                        className="w-full text-[11px] border border-slate-200 p-2.5 rounded-lg bg-white focus:outline-none focus:border-sky-500 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => handleImportStudentsFromText(pastedStudentData)}
                        className="w-full py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-lg transition cursor-pointer"
                      >
                        بدء الاستيراد الفوري وتسكين الطلاب بالصف 🚀
                      </button>
                    </motion.div>
                  )}
                </div>
              </div>

              {/* Add Student & Parent Form Toggle */}
              {showStudentForm && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="bg-white p-6 rounded-2xl border border-sky-100 shadow-sm"
                >
                  <form onSubmit={handleAddStudent} className="space-y-5">
                    {/* Student Section */}
                    <div>
                      <h3 className="font-bold text-slate-800 text-base mb-3 pb-1 border-b border-slate-100">بيانات الطالب وولي الأمر</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1.5">اسم الطالب الثلاثي *</label>
                          <input
                            type="text"
                            value={newStudent.name}
                            onChange={e => setNewStudent({ ...newStudent, name: e.target.value })}
                            placeholder="مثال: سلمان عبد العزيز الشمري"
                            className="w-full text-sm border border-slate-200 px-3.5 py-2 rounded-xl focus:border-sky-500 focus:outline-none text-right"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1.5">الرقم الموحد / السجل المدني *</label>
                          <input
                            type="text"
                            value={newStudent.rollNo}
                            onChange={e => setNewStudent({ ...newStudent, rollNo: e.target.value })}
                            placeholder="اكتب الرقم الموحد المخصص للطالب"
                            className="w-full text-sm border border-slate-200 px-3.5 py-2 rounded-xl focus:border-sky-500 focus:outline-none text-right"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1.5">اسم ولي الأمر بالكامل *</label>
                          <input
                            type="text"
                            value={newStudent.parentName}
                            onChange={e => setNewStudent({ ...newStudent, parentName: e.target.value })}
                            placeholder="مثال: عبد العزيز الشمري"
                            className="w-full text-sm border border-slate-200 px-3.5 py-2 rounded-xl focus:border-sky-500 focus:outline-none text-right"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1.5">الصف والشعبة (الفصل الدراسي) *</label>
                          <select
                            value={newStudent.classId}
                            onChange={e => setNewStudent({ ...newStudent, classId: e.target.value })}
                            className="w-full text-sm border border-slate-200 px-3.5 py-2 rounded-xl bg-white focus:border-sky-500 focus:outline-none text-right"
                            required
                          >
                            <option value="">اختر الفصل الدراسي المخصص للطالب...</option>
                            {classes.map(c => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setShowStudentForm(false)}
                        className="px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50 rounded-xl transition cursor-pointer"
                      >
                        إلغاء
                      </button>
                      <button
                        type="submit"
                        className="px-5 py-2 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-xl shadow-sm transition cursor-pointer"
                      >
                        تسجيل الطالب وربطه بولي أمره
                      </button>
                    </div>
                  </form>
                </motion.div>
              )}

              {/* Students Table */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-slate-100 flex items-center justify-between gap-4">
                  <div className="relative flex-1 max-w-md">
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                      <Search className="w-4 h-4" />
                    </span>
                    <input
                      type="text"
                      placeholder="ابحث باسم الطالب أو رقم القيد أو ولي الأمر..."
                      value={studentSearch}
                      onChange={e => setStudentSearch(e.target.value)}
                      className="w-full text-xs border border-slate-200 pr-10 pl-4 py-2 rounded-xl focus:border-sky-500 focus:outline-none"
                    />
                  </div>
                  <span className="text-xs text-slate-400 font-medium">إجمالي المقيدين: {filteredStudents.length}</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-right border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-600 text-xs font-semibold border-b border-slate-100">
                        <th className="p-4">رقم القيد</th>
                        <th className="p-4">اسم الطالب</th>
                        <th className="p-4">الصف</th>
                        <th className="p-4">الجنس</th>
                        <th className="p-4">تاريخ الميلاد</th>
                        <th className="p-4">ولي الأمر المرتبط</th>
                        <th className="p-4 text-left">الإجراءات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700 text-xs">
                      {filteredStudents.map(student => (
                        <tr key={student.id} className="hover:bg-slate-50/40 transition">
                          <td className="p-4 font-mono text-slate-500 font-medium">#{student.rollNo}</td>
                          <td className="p-4 font-bold text-slate-800">{student.name}</td>
                          <td className="p-4">
                            <span className="bg-sky-50 text-sky-700 px-2 py-0.5 rounded font-medium border border-sky-100/30">
                              {classes.find(c => c.id === student.classId)?.name || 'غير معروف'}
                            </span>
                          </td>
                          <td className="p-4">{student.gender === 'male' ? 'ذكر' : 'أنثى'}</td>
                          <td className="p-4 font-mono">{student.dob}</td>
                          <td className="p-4 font-medium text-slate-600">
                            {student.parentName}
                          </td>
                          <td className="p-4">
                            <div className="flex gap-2 justify-end">
                              <button
                                onClick={() => {
                                  setTransferringStudent(student);
                                  setTransferTargetClassId(student.classId);
                                }}
                                className="text-[10px] bg-amber-50 hover:bg-amber-100 text-amber-700 px-2 py-1 rounded border border-amber-100 transition cursor-pointer flex items-center gap-1 font-semibold"
                              >
                                <span>⚙️ نقل الشعبة</span>
                              </button>
                              <button
                                onClick={() => {
                                  if (confirm(`هل تريد بالتأكيد حذف الطالب ${student.name}؟`)) {
                                    setStudents(prev => prev.filter(s => s.id !== student.id));
                                  }
                                }}
                                className="text-[10px] bg-rose-50 hover:bg-rose-100 text-rose-600 px-2 py-1 rounded border border-rose-100 transition cursor-pointer flex items-center gap-1 font-semibold"
                              >
                                <span>🗑️ حذف</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}

                      {filteredStudents.length === 0 && (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-slate-400 text-sm">
                            لم يتم العثور على أي طالب تطابق معايير البحث.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Transfer Student Modal */}
              <AnimatePresence>
                {transferringStudent && (
                  <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 text-right"
                      style={{ direction: 'rtl' }}
                    >
                      <h3 className="font-bold text-slate-800 text-base mb-2">⚙️ نقل الطالب(ة) لشعبة أخرى</h3>
                      <p className="text-xs text-slate-500 mb-4">
                        أنت تقوم بنقل الطالب: <strong className="text-slate-800">{transferringStudent.name}</strong>
                      </p>
                      
                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1.5">اختر الصف/الشعبة المستهدفة:</label>
                          <select
                            value={transferTargetClassId}
                            onChange={e => setTransferTargetClassId(e.target.value)}
                            className="w-full text-xs border border-slate-200 px-3.5 py-2.5 rounded-xl bg-white focus:border-sky-500 focus:outline-none"
                          >
                            {classes.map(c => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      
                      <div className="flex gap-2 mt-6 justify-end">
                        <button
                          type="button"
                          onClick={() => setTransferringStudent(null)}
                          className="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 rounded-xl transition cursor-pointer"
                        >
                          إلغاء
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setStudents(prev => prev.map(s => s.id === transferringStudent.id ? { ...s, classId: transferTargetClassId } : s));
                            alert(`تم نقل الطالب ${transferringStudent.name} بنجاح!`);
                            setTransferringStudent(null);
                          }}
                          className="px-4 py-2 text-xs font-semibold text-white bg-amber-500 hover:bg-amber-600 rounded-xl transition shadow-sm cursor-pointer"
                        >
                          تأكيد النقل المباشر
                        </button>
                      </div>
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* Absence Excuses Tab */}
          {activeTab === 'excuses' && (
            <motion.div
              key="excuses"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-6"
            >
              <div>
                <h1 className="text-2xl font-bold text-slate-800">طلبات الغياب والاعتذارات</h1>
                <p className="text-slate-500 text-sm mt-1">
                  طلبات مرسلة مباشرة من أولياء الأمور لتبرير غياب أبنائهم. الموافقة عليها تعدل حالة التحضير فوراً في السجلات.
                </p>
              </div>

              <div className="space-y-4">
                {excuses.map(excuse => (
                  <div
                    key={excuse.id}
                    className={`p-5 rounded-2xl border bg-white shadow-sm transition duration-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 ${
                      excuse.status === 'pending'
                        ? 'border-amber-100 hover:border-amber-200'
                        : excuse.status === 'approved'
                        ? 'border-emerald-100'
                        : 'border-red-100'
                    }`}
                  >
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-bold text-slate-800 text-sm">{excuse.studentName}</span>
                        <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-medium">
                          الصف: {classes.find(c => c.id === students.find(s => s.id === excuse.studentId)?.classId)?.name || 'مجهول'}
                        </span>
                        <span className="text-[10px] bg-sky-50 text-sky-700 px-2 py-0.5 rounded font-medium">
                          تاريخ الغياب: {excuse.date}
                        </span>
                        <span className="text-[10px] text-slate-400">مقدم من: {excuse.parentName} (ولي الأمر)</span>
                      </div>
                      
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-600 leading-relaxed">
                        <strong>السبب للتغيب:</strong> {excuse.reason}
                      </div>

                      {excuse.notes && (
                        <div className="text-[11px] text-slate-400">
                          <strong>ملاحظات الإدارة:</strong> {excuse.notes}
                        </div>
                      )}
                    </div>

                    <div className="shrink-0 flex flex-col items-end gap-2.5">
                      {excuse.status === 'pending' ? (
                        <div className="flex flex-col gap-2 w-full min-w-[180px]">
                          <input
                            type="text"
                            placeholder="اكتب ملاحظة أو رد إداري..."
                            value={excuseNotes[excuse.id] || ''}
                            onChange={e => setExcuseNotes({ ...excuseNotes, [excuse.id]: e.target.value })}
                            className="text-xs border border-slate-200 px-3 py-1.5 rounded-lg focus:outline-none focus:border-sky-500 bg-slate-50"
                          />
                          <div className="flex gap-2 justify-end">
                            <button
                              id={`excuse-reject-${excuse.id}`}
                              onClick={() => updateExcuseStatus(excuse.id, 'rejected', excuseNotes[excuse.id])}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 flex items-center gap-1 cursor-pointer"
                            >
                              <X className="w-4.5 h-4.5" />
                              <span>رفض العذر</span>
                            </button>
                            <button
                              id={`excuse-approve-${excuse.id}`}
                              onClick={() => updateExcuseStatus(excuse.id, 'approved', excuseNotes[excuse.id])}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 flex items-center gap-1 shadow-sm cursor-pointer"
                            >
                              <Check className="w-4.5 h-4.5" />
                              <span>موافقة واعتماد</span>
                            </button>
                          </div>
                        </div>
                      ) : excuse.status === 'approved' ? (
                        <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100 flex items-center gap-1">
                          <Check className="w-4.5 h-4.5" />
                          <span>تمت الموافقة والمزامنة</span>
                        </span>
                      ) : (
                        <span className="text-xs font-bold text-red-500 bg-red-50 px-3 py-1.5 rounded-lg border border-red-100 flex items-center gap-1">
                          <X className="w-4.5 h-4.5" />
                          <span>العذر مرفوض</span>
                        </span>
                      )}
                    </div>
                  </div>
                ))}

                {excuses.length === 0 && (
                  <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm text-center text-slate-400 text-sm">
                    لا توجد أي طلبات غياب مقدمة حالياً.
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* Announcements Tab */}
          {activeTab === 'announcements' && (
            <motion.div
              key="announcements"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-6"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-slate-800">التعاميم والإعلانات المدرسية</h1>
                  <p className="text-slate-500 text-sm mt-1">بث الأخبار والتنبيهات المباشرة لهواتف المعلمين وأولياء الأمور</p>
                </div>
                <button
                  id="dir-btn-add-announcement"
                  onClick={() => setShowAnnounceForm(!showAnnounceForm)}
                  className="bg-sky-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 hover:bg-sky-700 shadow-md shadow-sky-100 transition cursor-pointer self-start sm:self-auto"
                >
                  <Plus className="w-5 h-5" />
                  <span>نشر إعلان جديد</span>
                </button>
              </div>

              {/* Add Announcement Form Toggle */}
              {showAnnounceForm && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="bg-white p-6 rounded-2xl border border-sky-100 shadow-sm"
                >
                  <h3 className="font-bold text-slate-800 text-base mb-4">كتابة ونشر تعميم مدرسي</h3>
                  <form onSubmit={handleAddAnnounce} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="md:col-span-2">
                        <label className="block text-xs font-semibold text-slate-600 mb-1.5">عنوان التعميم *</label>
                        <input
                          type="text"
                          value={newAnnounce.title}
                          onChange={e => setNewAnnounce({ ...newAnnounce, title: e.target.value })}
                          placeholder="مثال: تعليق الدراسة الحضورية غداً وتحويلها عن بعد"
                          className="w-full text-sm border border-slate-200 px-3.5 py-2 rounded-xl focus:border-sky-500 focus:outline-none"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1.5">الفئة المستهدفة *</label>
                        <select
                          value={newAnnounce.target}
                          onChange={e => setNewAnnounce({ ...newAnnounce, target: e.target.value as 'all' | 'teachers' | 'parents' })}
                          className="w-full text-sm border border-slate-200 px-3.5 py-2 rounded-xl bg-white focus:border-sky-500 focus:outline-none"
                        >
                          <option value="all">الجميع (معلمون وأولياء أمور)</option>
                          <option value="teachers">المعلمون فقط</option>
                          <option value="parents">أولياء الأمور فقط</option>
                        </select>
                      </div>
                      <div className="md:col-span-3">
                        <label className="block text-xs font-semibold text-slate-600 mb-1.5">محتوى التعميم بالتفصيل *</label>
                        <textarea
                          rows={4}
                          value={newAnnounce.content}
                          onChange={e => setNewAnnounce({ ...newAnnounce, content: e.target.value })}
                          placeholder="اكتب هنا التفاصيل الكاملة للإعلان الهام..."
                          className="w-full text-sm border border-slate-200 px-3.5 py-2.5 rounded-xl focus:border-sky-500 focus:outline-none"
                          required
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2.5">
                      <button
                        type="button"
                        onClick={() => setShowAnnounceForm(false)}
                        className="px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50 rounded-xl transition cursor-pointer"
                      >
                        إلغاء
                      </button>
                      <button
                        type="submit"
                        className="px-5 py-2 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-xl shadow-sm transition cursor-pointer"
                      >
                        نشر الإعلان فوراً
                      </button>
                    </div>
                  </form>
                </motion.div>
              )}

              {/* Announcements list */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {announcements.map(ann => (
                  <div key={ann.id} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between hover:shadow-md transition">
                    <div>
                      <div className="flex justify-between items-start gap-4">
                        <h4 className="font-bold text-slate-800 text-sm">{ann.title}</h4>
                        <span className="text-[10px] text-slate-400 font-mono shrink-0">{ann.date}</span>
                      </div>
                      <p className="text-xs text-slate-600 mt-2.5 leading-relaxed whitespace-pre-wrap">{ann.content}</p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-50 flex justify-between items-center text-xs">
                      <span className="text-slate-400">بواسطة: {ann.authorName}</span>
                      <span className={`px-2 py-0.5 rounded font-semibold text-[10px] ${
                        ann.target === 'all'
                          ? 'bg-sky-50 text-sky-700 border border-sky-100'
                          : ann.target === 'teachers'
                          ? 'bg-amber-50 text-amber-700 border border-amber-100'
                          : 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                      }`}>
                        المستهدف: {ann.target === 'all' ? 'الجميع' : ann.target === 'teachers' ? 'المعلمون' : 'أولياء الأمور'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Grades Tab */}
          {activeTab === 'grades' && (
            <motion.div
              key="grades"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-6 text-right"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-slate-800">كشوفات ومعالجة الدرجات</h1>
                  <p className="text-slate-500 text-sm mt-1">
                    إدارة كشوف الدرجات العامة، رصد النتائج، استيراد وتصدير التقارير بملفات Excel ذكية
                  </p>
                </div>
              </div>

              {/* Excel Controls Panel */}
              <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
                <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2 justify-end">
                  <FileCheck className="w-5 h-5 text-indigo-600" />
                  <span>معالجة الكشوفات الذكية (Excel)</span>
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">اختر الصف الدراسي للمعاينة والتحكم:</label>
                    <select
                      value={selectedClassForGrades}
                      onChange={e => setSelectedClassForGrades(e.target.value)}
                      className="w-full text-xs border border-slate-200 px-3.5 py-2.5 rounded-xl bg-white focus:border-indigo-500 focus:outline-none"
                    >
                      <option value="">-- اختر الصف الدراسي --</option>
                      {classes.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2 flex flex-col sm:flex-row gap-2">
                    <button
                      onClick={handleDownloadEmptyTemplate}
                      disabled={!selectedClassForGrades}
                      className="flex-1 text-xs font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 py-2.5 px-4 rounded-xl transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                    >
                      <Download className="w-4 h-4 text-slate-500" />
                      <span>{apkCompatibilityMode ? '📋 نسخ نموذج رصد فارغ للحافظة' : 'تنزيل نموذج رصد فارغ'}</span>
                    </button>
                    <button
                      onClick={handleExportGradesExcel}
                      disabled={!selectedClassForGrades}
                      className="flex-1 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 py-2.5 px-4 rounded-xl transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                    >
                      <Download className="w-4 h-4 text-indigo-600" />
                      <span>{apkCompatibilityMode ? '📋 نسخ كشف الدرجات للحافظة' : 'تصدير تقرير الدرجات الحالي'}</span>
                    </button>
                  </div>
                </div>

                <div className="pt-2 border-t border-dashed border-slate-100">
                  {!apkCompatibilityMode ? (
                    <div className="relative">
                      <input
                        ref={gradeImportInputRef}
                        type="file"
                        accept=".xlsx, .xls"
                        onChange={handleImportGradesExcel}
                        disabled={!selectedClassForGrades}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => gradeImportInputRef.current?.click()}
                        disabled={!selectedClassForGrades}
                        className={`w-full text-sm font-bold py-3.5 px-6 rounded-xl border transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
                          selectedClassForGrades
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100/80 shadow-xs'
                            : 'border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        <span>📥 استيراد الدرجات من ملف إكسل (توزيع تلقائي بالرقم)</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <button
                        type="button"
                        onClick={() => setShowPastedGradeInput(!showPastedGradeInput)}
                        disabled={!selectedClassForGrades}
                        className={`w-full text-sm font-bold py-3.5 px-6 rounded-xl border transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
                          selectedClassForGrades
                            ? 'border-indigo-200 bg-indigo-50 text-indigo-800 hover:bg-indigo-100/80 shadow-xs'
                            : 'border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        <span>📥 استيراد الدرجات بلصق جدول إكسل من الحافظة</span>
                      </button>

                      {showPastedGradeInput && selectedClassForGrades && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="p-4 bg-emerald-50/40 border border-emerald-100 rounded-2xl space-y-3 text-right"
                        >
                          <div>
                            <span className="block text-xs font-bold text-emerald-900">📊 استيراد كشف الدرجات من الحافظة</span>
                            <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                              انسخ جدول الدرجات المعدل من تطبيق Excel أو Google Sheets بالهاتف (بما في ذلك الترويسة العليا التي تحتوي على رقم الطالب والمواد)، ثم الصقه بالأسفل للاستيراد الفوري وتحديث كشوفات الصف تلقائياً:
                            </p>
                          </div>
                          <textarea
                            rows={4}
                            value={pastedGradeData}
                            onChange={e => setPastedGradeData(e.target.value)}
                            placeholder="الصق خلايا الدرجات المنسوخة هنا..."
                            className="w-full text-[11px] border border-slate-200 p-2.5 rounded-lg bg-white focus:outline-none focus:border-emerald-500 font-mono text-left"
                            style={{ direction: 'ltr' }}
                          />
                          <button
                            type="button"
                            onClick={() => handleImportGradesFromText(pastedGradeData)}
                            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition cursor-pointer"
                          >
                            تطبيق رصد الدرجات وحفظ التقارير 🚀
                          </button>
                        </motion.div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Grades Table */}
              {selectedClassForGrades ? (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <h3 className="font-bold text-slate-800 text-sm">
                        كشف رصد درجات الصف: <span className="text-indigo-600">{classes.find(c => c.id === selectedClassForGrades)?.name}</span>
                      </h3>
                      <p className="text-xs text-slate-400 font-medium mt-1">
                        عدد الطلاب: {students.filter(s => s.classId === selectedClassForGrades).length} طالب وطالبة
                      </p>
                    </div>

                    <div className="flex items-center gap-3 bg-indigo-50/50 border border-indigo-100/60 p-3 rounded-2xl self-start md:self-auto">
                      <span className="text-xs font-bold text-indigo-950">📋 سلوك الطلاب لشهر:</span>
                      <input
                        type="text"
                        value={currentEvaluationMonth}
                        onChange={e => {
                          setCurrentEvaluationMonth(e.target.value);
                          localStorage.setItem('school_evaluation_current_month', e.target.value);
                        }}
                        className="bg-white border border-indigo-200 rounded-xl px-4 py-1.5 text-indigo-900 text-xs font-black w-44 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-center"
                        placeholder="مثال: تشرين الأول"
                      />
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-right border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-slate-600 text-xs font-semibold border-b border-slate-100">
                          <th className="p-4">رقم القيد</th>
                          <th className="p-4">اسم الطالب</th>
                          {Array.from(new Set([
                            'الرياضيات', 'العلوم', 'اللغة العربية', 'التربية الإسلامية', 'اللغة الإنجليزية', 'الاجتماعيات',
                            ...teachers.flatMap(t => t.subjects),
                            ...grades.map(g => g.subject)
                          ])).map(sub => (
                            <th key={sub} className="p-4 text-center">{sub}</th>
                          ))}
                          <th className="p-4 text-center">المعدل</th>
                          <th className="p-4 text-center">التقدير</th>
                          <th className="p-4 text-center min-w-[220px]">
                            <span className="text-slate-600 font-bold block text-xs">
                              سلوك الطالب ({currentEvaluationMonth})
                            </span>
                          </th>
                          <th className="p-4 text-center min-w-[320px]">
                            <span className="text-slate-600 block text-xs">حجب كشف الدرجات للطلب</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700 text-xs">
                        {students.filter(s => s.classId === selectedClassForGrades).map(student => {
                          const studentGrades = grades.filter(g => g.studentId === student.id);
                          const uniqueSubjects = Array.from(new Set([
                            'الرياضيات', 'العلوم', 'اللغة العربية', 'التربية الإسلامية', 'اللغة الإنجليزية', 'الاجتماعيات',
                            ...teachers.flatMap(t => t.subjects),
                            ...grades.map(g => g.subject)
                          ]));
                          
                          let totalScore = 0;
                          let scoredCount = 0;
                          
                          return (
                            <tr key={student.id} className="hover:bg-slate-50/40 transition">
                              <td className="p-4 font-mono text-slate-500 font-medium">#{student.rollNo}</td>
                              <td className="p-4 font-bold text-slate-800">{student.name}</td>
                              {uniqueSubjects.map(sub => {
                                const subGrade = studentGrades.find(g => g.subject === sub);
                                if (subGrade) {
                                  totalScore += subGrade.score;
                                  scoredCount++;
                                }
                                return (
                                  <td key={sub} className="p-4 text-center font-semibold text-slate-700">
                                    {subGrade ? (
                                      <span className={subGrade.score < 50 ? 'text-red-600 font-bold' : 'text-slate-800'}>
                                        {subGrade.score}
                                      </span>
                                    ) : (
                                      <span className="text-slate-300 font-light">---</span>
                                    )}
                                  </td>
                                );
                              })}
                              {/* Average Column */}
                              <td className="p-4 text-center font-bold text-indigo-700 bg-indigo-50/10 font-mono">
                                {scoredCount > 0 ? (totalScore / scoredCount).toFixed(1) + '%' : '---'}
                              </td>
                              {/* Estimation Column */}
                              <td className="p-4 text-center font-semibold">
                                {scoredCount > 0 ? (() => {
                                  const avg = totalScore / scoredCount;
                                  let label = 'ضعيف';
                                  let badgeClass = 'bg-rose-50 text-rose-700 border-rose-100';
                                  if (avg >= 90) {
                                    label = 'ممتاز';
                                    badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-100';
                                  } else if (avg >= 80) {
                                    label = 'جيد جداً';
                                    badgeClass = 'bg-teal-50 text-teal-700 border-teal-100';
                                  } else if (avg >= 70) {
                                    label = 'جيد';
                                    badgeClass = 'bg-blue-50 text-blue-700 border-blue-100';
                                  } else if (avg >= 60) {
                                    label = 'مقبول';
                                    badgeClass = 'bg-amber-50 text-amber-700 border-amber-100';
                                  }
                                  return (
                                    <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${badgeClass}`}>
                                      {label}
                                    </span>
                                  );
                                })() : (
                                  <span className="text-slate-300 font-light">---</span>
                                )}
                              </td>
                              {/* Monthly Evaluation Column */}
                              <td className="p-4 text-center min-w-[240px]">
                                <input
                                  type="text"
                                  value={monthlyEvaluations[student.id]?.text || ''}
                                  onChange={e => {
                                    const updated = {
                                      ...monthlyEvaluations,
                                      [student.id]: {
                                        month: currentEvaluationMonth,
                                        text: e.target.value
                                      }
                                    };
                                    setMonthlyEvaluations(updated);
                                    localStorage.setItem('school_monthly_evaluations', JSON.stringify(updated));
                                  }}
                                  className="w-full text-xs border border-slate-200 px-3.5 py-2 rounded-xl bg-white focus:outline-none focus:border-indigo-500 text-right font-medium text-slate-800 shadow-2xs"
                                  placeholder="اكتب سلوك الطالب..."
                                />
                              </td>
                              {/* Block/Withhold Grades Column */}
                              <td className="p-4 text-center min-w-[320px]">
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const isCurrentlyBlocked = !!blockedGrades[student.id]?.blocked;
                                      const currentReason = blockedGrades[student.id]?.reason || 'حجبت العلامات لعدم دفع القسط المالي';
                                      const updated = {
                                        ...blockedGrades,
                                        [student.id]: {
                                          blocked: !isCurrentlyBlocked,
                                          reason: currentReason
                                        }
                                      };
                                      setBlockedGrades(updated);
                                      localStorage.setItem('school_blocked_grades', JSON.stringify(updated));
                                    }}
                                    className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1 shrink-0 ${
                                      blockedGrades[student.id]?.blocked
                                        ? 'bg-rose-600 text-white hover:bg-rose-700 shadow-xs'
                                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                                    }`}
                                  >
                                    {blockedGrades[student.id]?.blocked ? '🔓 إلغاء الحجب' : '🔒 حجب الدرجات'}
                                  </button>
                                  <input
                                    type="text"
                                    value={blockedGrades[student.id]?.reason || ''}
                                    onChange={e => {
                                      const isBlocked = !!blockedGrades[student.id]?.blocked;
                                      const updated = {
                                        ...blockedGrades,
                                        [student.id]: {
                                          blocked: isBlocked,
                                          reason: e.target.value
                                        }
                                      };
                                      setBlockedGrades(updated);
                                      localStorage.setItem('school_blocked_grades', JSON.stringify(updated));
                                    }}
                                    className="grow text-xs border border-slate-200 px-3 py-2 rounded-xl bg-white focus:outline-none focus:border-rose-500 text-right font-medium text-slate-800 shadow-2xs"
                                    placeholder="مثال: حجبت العلامات لعدم دفع القسط المالي"
                                  />
                                </div>
                              </td>
                            </tr>
                          );
                        })}

                        {students.filter(s => s.classId === selectedClassForGrades).length === 0 && (
                          <tr>
                            <td colSpan={13} className="p-8 text-center text-slate-400 text-sm">
                              لا يوجد طلاب مسجلون في هذا الصف حالياً.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-50 border border-slate-100 p-8 rounded-2xl text-center text-slate-500 text-sm">
                  الرجاء تحديد الصف الدراسي من القائمة أعلاه لمعاينة كشوف الدرجات.
                </div>
              )}
            </motion.div>
          )}

          {/* Sharing Links Tab */}

          {/* Tuition Management Tab */}
          {activeTab === 'tuition' && (
            <motion.div
              key="tuition-management"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-6 text-right"
            >
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2 justify-end">
                    <span>إدارة الأقساط والرسوم الدراسية</span>
                    <Coins className="w-7 h-7 text-amber-500 animate-pulse" />
                  </h1>
                  <p className="text-slate-500 text-sm mt-1">
                    توزيع الرسوم حسب الصفوف والطلاب، متابعة التحصيل المالي، وإرسال إشعارات الدفعات لأولياء الأمور بالدولار الأمريكي ($)
                  </p>
                </div>
                <div className="text-xs bg-amber-50 border border-amber-200 text-amber-800 font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 self-start">
                  <span>🔒 قسم مالي خاص بالمدير</span>
                </div>
              </div>

              {/* School-wide Finance Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {/* Total School expected fees */}
                <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-xs space-y-2">
                  <span className="text-[11px] font-bold text-slate-400 block uppercase tracking-wider">إجمالي الرسوم المستهدفة للمدرسة</span>
                  <div className="flex justify-between items-baseline">
                    <span className="text-2xl font-black text-slate-800 font-mono">
                      {students.reduce((acc, student) => {
                        const t = tuitions[student.id];
                        return acc + (t && t.totalAmount ? t.totalAmount : 0);
                      }, 0).toLocaleString('en-US')}
                    </span>
                    <span className="text-xs font-bold text-slate-500">$</span>
                  </div>
                  <p className="text-[10px] text-slate-400">محسوب بناءً على الرسوم السنوية المحددة للطلاب</p>
                </div>

                {/* Total collected fees */}
                <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-xs space-y-2">
                  <span className="text-[11px] font-bold text-emerald-600 block uppercase tracking-wider">إجمالي المبالغ المحصلة (الدفعات)</span>
                  <div className="flex justify-between items-baseline">
                    <span className="text-2xl font-black text-emerald-600 font-mono">
                      {students.reduce((acc, student) => {
                        const t = tuitions[student.id];
                        const totalPaid = t && t.installments ? t.installments.reduce((sum, inst) => sum + inst.amount, 0) : 0;
                        return acc + totalPaid;
                      }, 0).toLocaleString('en-US')}
                    </span>
                    <span className="text-xs font-bold text-emerald-600">$</span>
                  </div>
                  <p className="text-[10px] text-emerald-500 font-bold">
                    نسبة التحصيل: {(() => {
                      const total = students.reduce((acc, student) => acc + (tuitions[student.id]?.totalAmount || 0), 0);
                      const paid = students.reduce((acc, student) => {
                        const t = tuitions[student.id];
                        return acc + (t && t.installments ? t.installments.reduce((sum, inst) => sum + inst.amount, 0) : 0);
                      }, 0);
                      return total > 0 ? Math.round((paid / total) * 100) : 0;
                    })()}%
                  </p>
                </div>

                {/* Total remaining fees */}
                <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-xs space-y-2">
                  <span className="text-[11px] font-bold text-amber-600 block uppercase tracking-wider">إجمالي المبالغ المتبقية المستحقة</span>
                  <div className="flex justify-between items-baseline">
                    <span className="text-2xl font-black text-amber-600 font-mono">
                      {students.reduce((acc, student) => {
                        const t = tuitions[student.id];
                        const total = t && t.totalAmount ? t.totalAmount : 0;
                        const paid = t && t.installments ? t.installments.reduce((sum, inst) => sum + inst.amount, 0) : 0;
                        return acc + Math.max(0, total - paid);
                      }, 0).toLocaleString('en-US')}
                    </span>
                    <span className="text-xs font-bold text-amber-600">$</span>
                  </div>
                  <p className="text-[10px] text-amber-500 font-bold">مستحقة للدفع في كشوف الحسابات المفتوحة</p>
                </div>
              </div>

              {/* Class Selection Navigation */}
              <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs space-y-3">
                <span className="text-xs font-bold text-slate-700 block">اختر الصف الدراسي لعرض الطلاب وتوزيع الرسوم:</span>
                <div className="flex flex-wrap gap-2 justify-start" style={{ direction: 'rtl' }}>
                  {classes.map(cls => {
                    const studentCount = students.filter(s => s.classId === cls.id).length;
                    const isSelected = selectedClassForTuition === cls.id;
                    return (
                      <button
                        key={cls.id}
                        onClick={() => {
                          setSelectedClassForTuition(cls.id);
                          setEditingStudentTuition(null);
                        }}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <span>{cls.name}</span>
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                          isSelected ? 'bg-indigo-700 text-indigo-100' : 'bg-slate-200 text-slate-500'
                        }`}>
                          {studentCount} طالب
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Grid: Class Students List & Edit Form side-by-side */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                
                {/* Students list for selected class */}
                <div className={`bg-white p-5 rounded-2xl border border-slate-100 shadow-xs lg:col-span-7 space-y-4`}>
                  <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                    <h3 className="font-bold text-slate-800 text-sm">
                      طلاب {classes.find(c => c.id === selectedClassForTuition)?.name || 'الصف المحدد'}
                    </h3>
                    <span className="text-[10px] text-slate-400">انقر على الطالب لتعديل بياناته المالية وإرسال إشعار له</span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-xs" style={{ direction: 'rtl' }}>
                      <thead>
                        <tr className="border-b border-slate-100 text-slate-400 font-bold">
                          <th className="pb-3 pr-2">اسم الطالب</th>
                          <th className="pb-3 text-center">المبلغ الإجمالي</th>
                          <th className="pb-3 text-center">إجمالي المدفوع</th>
                          <th className="pb-3 text-center">الباقي المستحق</th>
                          <th className="pb-3 text-center">حالة السداد</th>
                          <th className="pb-3 pl-2 text-center">الخيارات</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {students
                          .filter(s => s.classId === selectedClassForTuition)
                          .map(student => {
                            const tuitionInfo = tuitions[student.id] || {
                              studentId: student.id,
                              totalAmount: 0,
                              installments: []
                            };
                            const totalPaid = tuitionInfo.installments ? tuitionInfo.installments.reduce((sum, inst) => sum + inst.amount, 0) : 0;
                            const remaining = Math.max(0, tuitionInfo.totalAmount - totalPaid);
                            const isPaidFull = tuitionInfo.totalAmount > 0 && remaining <= 0;
                            const isSelected = editingStudentTuition?.id === student.id;

                            return (
                              <tr 
                                key={student.id} 
                                onClick={() => {
                                  setEditingStudentTuition(student);
                                  const t = tuitions[student.id];
                                  setTuitionTotal(t && t.totalAmount !== undefined ? t.totalAmount : '');
                                  setInstallments(t && t.installments ? t.installments : []);
                                  setNewInstAmount('');
                                  setNewInstNote('');
                                  setNewInstDate(new Date().toISOString().split('T')[0]);
                                }}
                                className={`group hover:bg-indigo-50/30 transition cursor-pointer ${
                                  isSelected ? 'bg-indigo-50/60 font-medium' : ''
                                }`}
                              >
                                <td className="py-3.5 pr-2">
                                  <div className="font-bold text-slate-800">{student.name}</div>
                                  <div className="text-[9px] text-slate-400 mt-0.5">ولي الأمر: {student.parentName}</div>
                                </td>
                                <td className="py-3.5 text-center font-mono font-bold text-slate-700">
                                  {tuitionInfo.totalAmount > 0 ? `${tuitionInfo.totalAmount.toLocaleString('en-US')} $` : 'غير محدد'}
                                </td>
                                <td className="py-3.5 text-center font-mono font-bold text-emerald-600">
                                  {totalPaid > 0 ? `${totalPaid.toLocaleString('en-US')} $` : '0 $'}
                                </td>
                                <td className={`py-3.5 text-center font-mono font-black ${
                                  remaining > 0 ? 'text-amber-600' : 'text-emerald-600'
                                }`}>
                                  {remaining > 0 ? `${remaining.toLocaleString('en-US')} $` : '0 $'}
                                </td>
                                <td className="py-3.5 text-center">
                                  {tuitionInfo.totalAmount === 0 ? (
                                    <span className="bg-slate-100 text-slate-500 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                      لم يحدد بعد
                                    </span>
                                  ) : isPaidFull ? (
                                    <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                      مدفوع بالكامل 🎉
                                    </span>
                                  ) : (
                                    <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                      متبقي دفعات ⚠️
                                    </span>
                                  )}
                                </td>
                                <td className="py-3.5 pl-2 text-center">
                                  <button 
                                    className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition ${
                                      isSelected 
                                        ? 'bg-indigo-600 text-white' 
                                        : 'bg-slate-100 text-slate-600 group-hover:bg-indigo-100 group-hover:text-indigo-700'
                                    }`}
                                  >
                                    تحديث ⚙️
                                  </button>
                                </td>
                              </tr>
                            );
                          })}

                        {students.filter(s => s.classId === selectedClassForTuition).length === 0 && (
                          <tr>
                            <td colSpan={6} className="text-center p-8 text-slate-400 italic">
                              لا يوجد طلاب مسجلين في هذا الصف حالياً.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Edit Form side-panel */}
                <div className="lg:col-span-5 space-y-4">
                  {editingStudentTuition ? (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-white p-6 rounded-2xl border border-indigo-100 shadow-sm space-y-5 text-right"
                    >
                      <div className="border-b border-slate-100 pb-3">
                        <span className="text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded font-bold">
                          كشف الحساب والاقساط المتعددة 💳
                        </span>
                        <h4 className="font-bold text-slate-800 text-base mt-2">
                          الحساب المالي للطالب: <span className="text-indigo-600">{editingStudentTuition.name}</span>
                        </h4>
                        <p className="text-[10px] text-slate-400 mt-1">
                          ولي الأمر المستلم: <strong>{editingStudentTuition.parentName}</strong>
                        </p>
                      </div>

                      <div className="space-y-5">
                        {/* Total Input */}
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1.5">المبلغ الإجمالي السنوي المطلوب ($)</label>
                          <input
                            type="number"
                            value={tuitionTotal}
                            onChange={e => {
                              const val = e.target.value;
                              setTuitionTotal(val === '' ? '' : Math.max(0, Number(val)));
                            }}
                            className="w-full text-xs border border-slate-200 px-3.5 py-2.5 rounded-xl focus:outline-none focus:border-indigo-500 font-mono text-center font-bold text-slate-800"
                            placeholder="اكتب المبلغ هنا يدوياً ($)..."
                            min="0"
                          />
                          <span className="text-[10px] text-slate-400 mt-1 block">الحقل فارغ تماماً لتتمكن من كتابة القسط بنفسك.</span>
                        </div>

                        {/* List of current installments */}
                        <div className="border-t border-slate-100 pt-4 space-y-3">
                          <span className="text-xs font-bold text-slate-700 block">الدفعات والوصولات المسجلة حالياً:</span>
                          
                          <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                            {installments.length === 0 ? (
                              <div className="text-center p-4 bg-slate-50 rounded-xl text-[10px] text-slate-400 italic">
                                لا يوجد أي دفعات مسجلة حتى الآن. استخدم حقول الإضافة بالأسفل لتسجيل الدفعات المتعددة.
                              </div>
                            ) : (
                              installments.map((inst, index) => (
                                <div key={inst.id} className="flex items-center justify-between bg-emerald-50/50 border border-emerald-100/50 p-2.5 rounded-xl text-xs">
                                  <button
                                    onClick={() => {
                                      setInstallments(installments.filter(item => item.id !== inst.id));
                                    }}
                                    className="p-1 hover:bg-rose-100 text-rose-500 rounded transition cursor-pointer"
                                    title="حذف هذه الدفعة"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                  <div className="text-left font-mono font-bold text-slate-400 text-[10px]">
                                    {inst.date}
                                  </div>
                                  <div className="text-right flex-1 px-3">
                                    <div className="font-bold text-slate-700 text-[11px]">{inst.note}</div>
                                  </div>
                                  <div className="font-mono font-bold text-emerald-700 bg-white border border-emerald-100 px-2 py-0.5 rounded-md">
                                    {inst.amount.toLocaleString('en-US')} $
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        {/* Form to add a new installment */}
                        <div className="bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100/50 space-y-3">
                          <span className="text-[11px] font-black text-indigo-900 block">➕ إضافة دفعة مالية جديدة لسجل الطالب (دفعات متعددة)</span>
                          
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] text-slate-500 mb-1">مبلغ الدفعة ($)</label>
                              <input
                                type="number"
                                value={newInstAmount}
                                onChange={e => {
                                  const val = e.target.value;
                                  setNewInstAmount(val === '' ? '' : Math.max(0, Number(val)));
                                }}
                                className="w-full text-xs border border-slate-200 bg-white px-2.5 py-1.5 rounded-lg focus:outline-none focus:border-indigo-500 font-mono text-center font-bold"
                                placeholder="مثال: 1500"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-slate-500 mb-1">تاريخ الدفعة</label>
                              <input
                                type="date"
                                value={newInstDate}
                                onChange={e => setNewInstDate(e.target.value)}
                                className="w-full text-xs border border-slate-200 bg-white px-2.5 py-1.5 rounded-lg focus:outline-none focus:border-indigo-500 font-mono text-center"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-[10px] text-slate-500 mb-1">بيان/ملاحظة الدفعة (مثال: الدفعة الأولى، قسط النقل...)</label>
                            <input
                              type="text"
                              value={newInstNote}
                              onChange={e => setNewInstNote(e.target.value)}
                              className="w-full text-xs border border-slate-200 bg-white px-3 py-1.5 rounded-lg focus:outline-none focus:border-indigo-500"
                              placeholder="اكتب بيان هذه الدفعة..."
                            />
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              if (newInstAmount === '' || Number(newInstAmount) <= 0) {
                                alert('الرجاء إدخال مبلغ صحيح للدفعة المضافة! ⚠️');
                                return;
                              }
                              const amountNum = Number(newInstAmount);
                              const totalExpected = tuitionTotal === '' ? 0 : Number(tuitionTotal);
                              const currentPaid = installments.reduce((sum, inst) => sum + inst.amount, 0);
                              
                              if (totalExpected > 0 && currentPaid + amountNum > totalExpected) {
                                if (!confirm(`مجموع الدفعات (${(currentPaid + amountNum).toLocaleString()} $) سيتجاوز القسط السنوي الإجمالي (${totalExpected.toLocaleString()} $). هل ترغب بالاستمرار بالتسجيل؟`)) {
                                  return;
                                }
                              }

                              const newInst: PaymentInstallment = {
                                id: 'inst_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                                amount: amountNum,
                                date: newInstDate,
                                note: newInstNote.trim() || `دفعة مالية مسجلة`
                              };

                              setInstallments([...installments, newInst]);
                              // Reset installment entry fields
                              setNewInstAmount('');
                              setNewInstNote('');
                            }}
                            className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold text-[10px] py-2 rounded-lg transition cursor-pointer flex items-center justify-center gap-1"
                          >
                            <span>تسجيل وإدراج هذه الدفعة في القائمة 👇</span>
                          </button>
                        </div>

                        {/* Auto calculated remaining block */}
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-2">
                          <div className="flex justify-between items-center text-xs text-slate-500">
                            <span>الباقي المستحق الحالي:</span>
                            <span>طرح آلي (الإجمالي - مجموع الدفعات)</span>
                          </div>
                          <div className="flex justify-between items-baseline">
                            <span className={`text-xl font-black font-mono ${
                              (Number(tuitionTotal) || 0) - installments.reduce((sum, inst) => sum + inst.amount, 0) > 0 ? 'text-amber-600' : 'text-emerald-600'
                            }`}>
                              {((Number(tuitionTotal) || 0) - installments.reduce((sum, inst) => sum + inst.amount, 0)).toLocaleString('en-US')} $
                            </span>
                            {((Number(tuitionTotal) || 0) - installments.reduce((sum, inst) => sum + inst.amount, 0)) <= 0 && (Number(tuitionTotal) || 0) > 0 ? (
                              <span className="text-[10px] text-emerald-600 font-bold">🎉 مدفوع بالكامل!</span>
                            ) : (
                              <span className="text-[10px] text-amber-600 font-bold">⚠️ متبقي للسداد</span>
                            )}
                          </div>
                        </div>

                        {/* Save & Send notification button */}
                        <button
                          onClick={() => {
                            if (!editingStudentTuition) return;
                            const student = editingStudentTuition;
                            const finalTotal = tuitionTotal === '' ? 0 : Number(tuitionTotal);

                            // Update local tuitions state
                            const updatedTuitions = {
                              ...tuitions,
                              [student.id]: {
                                studentId: student.id,
                                totalAmount: finalTotal,
                                installments: installments
                              }
                            };
                            setTuitions(updatedTuitions);
                            localStorage.setItem('school_tuitions', JSON.stringify(updatedTuitions));

                            // Find parent
                            const parent = parents.find(p => p.id === student.parentId) || {
                              id: student.parentId || 'p1',
                              name: student.parentName,
                              email: '',
                              phone: ''
                            };

                            const totalPaid = installments.reduce((sum, inst) => sum + inst.amount, 0);
                            const rem = Math.max(0, finalTotal - totalPaid);
                            
                            // Generate descriptive report text
                            const installmentsText = installments.length === 0 
                              ? '- لا توجد دفعات مسجلة بعد'
                              : installments.map((inst, i) => `  ${i+1}. الدفعة: ${inst.amount} $ - بتاريخ ${inst.date} (${inst.note})`).join('\n');

                            const msgContent = `إشعار مالي رسمي وتفصيلي 💳🇺🇸: نود إحاطتكم علماً بأنه قد تم تحديث كشف سجل الأقساط والرسوم الدراسية الخاصة بابنكم/ابنتكم (${student.name}) بالدولار الأمريكي ($). التفاصيل الحالية والكاملة كما يلي:\n\n- الرسوم السنوية الإجمالية المطلوبة: ${finalTotal.toLocaleString()} $\n- إجمالي المبالغ المدفوعة والمستلمة: ${totalPaid.toLocaleString()} $\n- المبالغ المتبقية المستحقة: ${rem.toLocaleString()} $\n\n📌 كشف الدفعات المسجلة للوصول والتحصيل:\n${installmentsText}\n\nنشكر لكم تعاونكم الدائم والتزامكم بدعم المسيرة التعليمية لأبنائنا الطلاب.`;
                            
                            addNotification({
                              receiverId: parent.id,
                              receiverName: parent.name,
                              receiverRole: 'parent',
                              content: msgContent,
                              studentId: student.id
                            }).then(() => {
                              alert(`تم حفظ كشف السجل المالي للطالب (${student.name}) بنجاح بالدولار الأمريكي! 💾🇺🇸\nوتم إرسال كشف الأقساط والدفعات الكامل لولي الأمر (${parent.name}) كإشعار ورسالة فورية في حسابه الخاص بنجاح. ✉️💵`);
                            });
                          }}
                          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-3 rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 shadow-md shadow-indigo-100"
                        >
                          <Check className="w-4 h-4" />
                          <span>حفظ كشف الأقساط بالدولار وإرسال إشعار 📤</span>
                        </button>
                      </div>
                    </motion.div>
                  ) : (
                    <div className="bg-slate-100 p-8 rounded-2xl border border-dashed border-slate-300 text-center text-slate-400 text-xs italic h-[350px] flex flex-col justify-center items-center space-y-2">
                      <div className="p-3 bg-slate-200 text-slate-500 rounded-full mb-2">
                        <Coins className="w-6 h-6" />
                      </div>
                      <p>لم يتم تحديد أي طالب بعد.</p>
                      <p className="text-[10px] text-slate-400">الرجاء اختيار أحد الطلاب من الجدول على اليمين لتعديل كشوفات أقساطه بالكامل بالدولار ($) وإصدار الإشعارات.</p>
                    </div>
                  )}
                </div>

              </div>

            </motion.div>
          )}

          {/* Messages Tab */}
          {activeTab === 'messages' && (
            <motion.div
              key="messages"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-6"
            >
              <div>
                <h1 className="text-2xl font-bold text-slate-800">صندوق المراسلات والرسائل</h1>
                <p className="text-slate-500 text-sm mt-1">
                  تواصل مباشرة مع الكادر التعليمي وأولياء الأمور لتوجيه التوجيهات أو معالجة الاستفسارات.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Send Message Form */}
                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm lg:col-span-1 space-y-4">
                  <h3 className="font-bold text-slate-800 text-sm pb-2 border-b border-slate-100 flex items-center gap-2">
                    <span>📤 إرسال رسالة جديدة</span>
                  </h3>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5">جهة التواصل المستهدفة *</label>
                      <div className="grid grid-cols-2 gap-2 bg-slate-50 p-1 rounded-xl">
                        <button
                          type="button"
                          onClick={() => {
                            setDirectorChatRecipientRole('teacher');
                            setDirectorChatRecipientId('');
                          }}
                          className={`text-xs font-bold py-2 rounded-lg transition cursor-pointer ${directorChatRecipientRole === 'teacher' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                          👨‍🏫 المعلمون
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDirectorChatRecipientRole('parent');
                            setDirectorChatRecipientId('');
                          }}
                          className={`text-xs font-bold py-2 rounded-lg transition cursor-pointer ${directorChatRecipientRole === 'parent' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                          👥 أولياء الأمور
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                        {directorChatRecipientRole === 'teacher' ? 'اختر المعلم المستلم *' : 'اختر ولي الأمر المستلم *'}
                      </label>
                      <select
                        value={directorChatRecipientId}
                        onChange={e => setDirectorChatRecipientId(e.target.value)}
                        className="w-full text-xs border border-slate-200 px-3 py-2.5 rounded-xl bg-white focus:outline-none focus:border-indigo-500"
                        required
                      >
                        <option value="">-- اختر من القائمة --</option>
                        {directorChatRecipientRole === 'teacher' 
                          ? teachers.map(t => (
                              <option key={t.id} value={t.id}>{t.name} ({t.subjects.join('، ')})</option>
                            ))
                          : parents.map(p => (
                              <option key={p.id} value={p.id}>{p.name} ({p.phone})</option>
                            ))
                        }
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-2">نوع الإشعار أو الرسالة *</label>
                      <div className="grid grid-cols-2 gap-1.5">
                        {[
                          { id: 'عام', label: '💬 رسالة عامة' },
                          { id: 'توجيه إداري', label: '🏛️ توجيه إداري' },
                          { id: 'تنبيه هام', label: '⚠️ تنبيه هام' },
                          { id: 'custom', label: '⚙️ مخصص...' },
                        ].map(type => (
                          <button
                            key={type.id}
                            type="button"
                            onClick={() => {
                              setDirectorNotificationType(type.id);
                              if (type.id !== 'custom') setDirectorCustomTypeLabel('');
                            }}
                            className={`px-3 py-2 rounded-lg text-[11px] font-bold border transition text-center cursor-pointer ${
                              directorNotificationType === type.id
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'border-slate-200 text-slate-600 bg-slate-50/50 hover:bg-slate-50'
                            }`}
                          >
                            {type.label}
                          </button>
                        ))}
                      </div>

                      {directorNotificationType === 'custom' && (
                        <input
                          type="text"
                          value={directorCustomTypeLabel}
                          onChange={e => setDirectorCustomTypeLabel(e.target.value)}
                          placeholder="اكتب نوع الإجراء المخصص هنا..."
                          className="w-full text-xs border border-purple-200 bg-purple-50/10 px-3.5 py-2.5 rounded-xl mt-2 focus:outline-none focus:border-purple-500 font-semibold text-purple-950 text-right"
                          required
                        />
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5">مضمون الرسالة *</label>
                      <textarea
                        rows={4}
                        value={directorMessageText}
                        onChange={e => setDirectorMessageText(e.target.value)}
                        placeholder="اكتب نص الرسالة أو التوجيه هنا للتسليم الفوري..."
                        className="w-full text-xs border border-slate-200 px-3.5 py-2.5 rounded-xl focus:outline-none focus:border-indigo-500"
                        required
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (!directorChatRecipientId) {
                          alert('الرجاء اختيار مستلم أولاً');
                          return;
                        }
                        if (!directorMessageText.trim()) {
                          alert('الرجاء كتابة محتوى الرسالة');
                          return;
                        }

                        const recipientName = directorChatRecipientRole === 'teacher'
                          ? teachers.find(t => t.id === directorChatRecipientId)?.name || 'معلم'
                          : parents.find(p => p.id === directorChatRecipientId)?.name || 'ولي أمر';

                        const finalType = directorNotificationType === 'custom' ? directorCustomTypeLabel : directorNotificationType;
                        const finalContent = finalType !== 'عام' ? `[${finalType}] ${directorMessageText}` : directorMessageText;

                        addNotification({
                          receiverId: directorChatRecipientId,
                          receiverName: recipientName,
                          receiverRole: directorChatRecipientRole,
                          content: finalContent
                        }).then(() => {
                          setDirectorMessageText('');
                          alert('تم إرسال الرسالة وتسليمها فوراً للمستلم بنجاح! 📤');
                        });
                      }}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-3 rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 shadow-md shadow-indigo-100"
                    >
                      <Send className="w-4 h-4" />
                      <span>إرسال الرسالة الإدارية</span>
                    </button>
                  </div>
                </div>

                {/* Inbox Log */}
                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm lg:col-span-2 space-y-4">
                  <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
                    <div className="text-right">
                      <h4 className="font-bold text-slate-800 text-sm">📥 الوارد والصادر (أحدث الرسائل والإشعارات)</h4>
                      <p className="text-[10px] text-slate-400 mt-0.5">انقر على أي رسالة لتحديدها كمقروءة وإخفائها من شريط العدادات العلوي.</p>
                    </div>
                  </div>

                  <div className="space-y-3 max-h-[500px] overflow-y-auto p-1">
                    {messages
                      .filter(m => m.receiverRole === 'director' || m.senderRole === 'director')
                      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                      .map(msg => {
                        const isIncoming = msg.receiverRole === 'director';
                        const isUnread = isIncoming && !msg.read;
                        return (
                          <div
                            key={msg.id}
                            onClick={() => {
                              if (isUnread) {
                                markAsRead(msg.id);
                              }
                            }}
                            className={`p-4 rounded-2xl border text-xs transition duration-200 cursor-pointer ${
                              isUnread
                                ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-400 shadow-xs animate-pulse hover:bg-amber-100/50'
                                : isIncoming
                                ? 'bg-slate-50 border-slate-100'
                                : 'bg-indigo-50/10 border-indigo-100/30'
                            }`}
                            title={isUnread ? "انقر لتحديد هذه الرسالة كمقروءة" : undefined}
                          >
                            <div className="flex justify-between items-center mb-2">
                              <div className="flex items-center gap-2">
                                {isIncoming && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDirectorChatRecipientRole(msg.senderRole === 'parent' ? 'parent' : 'teacher');
                                      setDirectorChatRecipientId(msg.senderId);
                                      alert(`تم تحديد المستلم للرد على: ${msg.senderName}`);
                                    }}
                                    className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-2.5 py-1 rounded-lg transition text-[10px] font-bold border border-indigo-100 cursor-pointer shadow-xs"
                                  >
                                    ↩️ رد على الرسالة
                                  </button>
                                )}
                                {isUnread && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      markAsRead(msg.id);
                                    }}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded-lg text-[10px] font-bold transition flex items-center gap-1 shadow-xs cursor-pointer animate-none"
                                  >
                                    <span>تحديد كمقروءة 👁️</span>
                                  </button>
                                )}
                              </div>

                              <div className="flex items-center gap-2">
                                <span className="font-mono text-[10px] text-slate-400">
                                  {new Date(msg.date).toLocaleString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                </span>
                                {isUnread && (
                                  <span className="bg-red-500 text-white text-[9px] px-2 py-0.5 rounded-full font-bold">
                                    جديد ✉️
                                  </span>
                                )}
                                {isIncoming ? (
                                  <span className="bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-md text-[10px]">
                                    وارد من: {msg.senderName} ({msg.senderRole === 'parent' ? 'ولي أمر' : 'معلم الصف'}) 📥
                                  </span>
                                ) : (
                                  <span className="bg-indigo-100 text-indigo-800 font-bold px-2 py-0.5 rounded-md text-[10px]">
                                    صادر إلى: {msg.receiverName} ({msg.receiverRole === 'parent' ? 'ولي أمر' : 'معلم الصف'}) 📤
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="text-slate-700 leading-relaxed text-right text-xs bg-white/70 p-3 rounded-xl border border-slate-100/50">
                              {/* Clean content of attachment strings for text display */}
                              {msg.content.replace(/\[مرفق_صورة:\s*([^\]]+)\]/g, '').replace(/\[مرفق_فيديو:\s*([^\]]+)\]/g, '')}
                            </div>
                          </div>
                        );
                      })}

                    {messages.filter(m => m.receiverRole === 'director' || m.senderRole === 'director').length === 0 && (
                      <div className="text-center py-16 text-slate-400 text-xs italic">
                        لا توجد رسائل صادرة أو واردة حتى الآن.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Subjects Tab */}
          {activeTab === 'subjects' && (
            <motion.div
              key="subjects"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-6 text-right"
            >
              <div>
                <h1 className="text-2xl font-bold text-slate-800">إدارة المواد الدراسية 📚</h1>
                <p className="text-slate-500 text-sm mt-1">
                  إضافة، تعديل، وحذف المواد الدراسية المتاحة للكادر التعليمي والطلاب بالمنصة.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Add Subject Card */}
                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm lg:col-span-1 space-y-4">
                  <h3 className="font-bold text-slate-800 text-sm pb-2 border-b border-slate-100 flex items-center gap-2 justify-end">
                    <span>➕ إضافة مادة جديدة</span>
                  </h3>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5 font-sans">اسم المادة الدراسية *</label>
                      <input
                        type="text"
                        value={newSubjectName}
                        onChange={e => setNewSubjectName(e.target.value)}
                        placeholder="مثال: التربية الفنية، البرمجة"
                        className="w-full text-sm border border-slate-200 px-3.5 py-2.5 rounded-xl focus:border-indigo-500 focus:outline-none"
                        required
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const trimmed = newSubjectName.trim();
                        if (!trimmed) {
                          alert('الرجاء كتابة اسم المادة');
                          return;
                        }
                        if (customSubjects.includes(trimmed)) {
                          alert('هذه المادة موجودة بالفعل!');
                          return;
                        }
                        const updated = [...customSubjects, trimmed];
                        setCustomSubjects(updated);
                        localStorage.setItem('school_custom_subjects', JSON.stringify(updated));
                        setNewSubjectName('');
                        alert('🎉 تم إضافة المادة الدراسية بنجاح!');
                      }}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-3 rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 shadow-md shadow-indigo-100"
                    >
                      <Plus className="w-4 h-4" />
                      <span>إضافة المادة</span>
                    </button>
                  </div>
                </div>

                {/* Subjects List Grid */}
                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm lg:col-span-2 space-y-4">
                  <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
                    <span className="text-xs text-slate-400 font-semibold font-sans">إجمالي عدد المواد المعتمدة: {customSubjects.length}</span>
                    <h4 className="font-bold text-slate-800 text-sm">قائمة المواد الدراسية المفعلة 📋</h4>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[500px] overflow-y-auto p-1">
                    {customSubjects.map(sub => {
                      const teacherCount = teachers.filter(t => t.subjects.includes(sub)).length;
                      const gradeCount = grades.filter(g => g.subject === sub).length;
                      return (
                        <div key={sub} className="p-4 rounded-2xl border border-slate-100 hover:border-indigo-100 bg-slate-50/50 hover:bg-indigo-50/10 transition flex items-center justify-between gap-4">
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`هل أنت متأكد من حذف المادة "${sub}"؟`)) {
                                const updated = customSubjects.filter(s => s !== sub);
                                setCustomSubjects(updated);
                                localStorage.setItem('school_custom_subjects', JSON.stringify(updated));
                              }
                            }}
                            className="p-1.5 bg-rose-50 text-rose-500 hover:bg-rose-100 rounded-lg transition cursor-pointer"
                            title="حذف المادة"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          
                          <div className="text-right">
                            <span className="font-bold text-slate-800 text-xs">{sub}</span>
                            <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-400 font-sans">
                              <span className="flex items-center gap-1">
                                <span>المعلمون:</span>
                                <span className="font-bold text-slate-600">{teacherCount}</span>
                              </span>
                              <span className="w-1 h-1 rounded-full bg-slate-200"></span>
                              <span className="flex items-center gap-1">
                                <span>الدرجات المسجلة:</span>
                                <span className="font-bold text-slate-600">{gradeCount}</span>
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {customSubjects.length === 0 && (
                      <div className="col-span-2 text-center py-16 text-slate-400 text-xs italic">
                        لا توجد مواد مضافة حتى الآن. قم بإضافة أول مادة!
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Classes Tab */}
          {activeTab === 'classes' && (
            <motion.div
              key="classes"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-6 text-right"
            >
              <div>
                <h1 className="text-2xl font-bold text-slate-800">إدارة الصفوف والشعب الدراسية 🏫</h1>
                <p className="text-slate-500 text-sm mt-1 font-sans">
                  إضافة، تعديل، وحذف الصفوف والشعب والمراحل الدراسية بالمنصة بشكل مفتوح ومخصص بالكامل.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Add Class Card */}
                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm lg:col-span-1 space-y-4">
                  <h3 className="font-bold text-slate-800 text-sm pb-2 border-b border-slate-100 flex items-center gap-2 justify-end">
                    <span>➕ إضافة صف وشعبة جديدة</span>
                  </h3>
                  
                  <form onSubmit={handleAddClass} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5 font-sans">اسم الشعبة الدراسية *</label>
                      <input
                        type="text"
                        value={newClassName}
                        onChange={e => setNewClassName(e.target.value)}
                        placeholder="مثال: الصف الأول - أ"
                        className="w-full text-sm border border-slate-200 px-3.5 py-2.5 rounded-xl focus:border-indigo-500 focus:outline-none"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5 font-sans">الصف / المرحلة الدراسية *</label>
                      <input
                        type="text"
                        value={newClassGrade}
                        onChange={e => setNewClassGrade(e.target.value)}
                        placeholder="مثال: الأول، الثاني، الثالث"
                        className="w-full text-sm border border-slate-200 px-3.5 py-2.5 rounded-xl focus:border-indigo-500 focus:outline-none"
                        required
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-3 rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 shadow-md shadow-indigo-100"
                    >
                      <Plus className="w-4 h-4" />
                      <span>حفظ وإضافة الصف الدراسى</span>
                    </button>
                  </form>
                </div>

                {/* Classes List Grid */}
                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm lg:col-span-2 space-y-4">
                  <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
                    <span className="text-xs text-slate-400 font-semibold font-sans">إجمالي عدد الشعب المفعلة: {classes.length}</span>
                    <h4 className="font-bold text-slate-800 text-sm">قائمة الصفوف والشعب المفعلة بالمنصة 📋</h4>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[500px] overflow-y-auto p-1">
                    {classes.map(cls => {
                      const teacher = teachers.find(t => t.id === cls.teacherId);
                      const studentCount = students.filter(s => s.classId === cls.id).length;
                      return (
                        <div key={cls.id} className="p-4 rounded-2xl border border-slate-100 hover:border-indigo-100 bg-slate-50/50 hover:bg-indigo-50/10 transition flex items-center justify-between gap-4">
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`هل أنت متأكد من حذف الصف "${cls.name}"؟`)) {
                                const updated = classes.filter(c => c.id !== cls.id);
                                setClasses(updated);
                                localStorage.setItem('school_classes', JSON.stringify(updated));
                              }
                            }}
                            className="p-1.5 bg-rose-50 text-rose-500 hover:bg-rose-100 rounded-lg transition cursor-pointer"
                            title="حذف الصف"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          
                          <div className="text-right flex-1">
                            <span className="font-bold text-slate-800 text-xs block">{cls.name}</span>
                            <div className="text-[10px] text-slate-400 font-sans mt-1 space-y-0.5">
                              <div className="flex items-center gap-1 justify-end">
                                <span className="font-semibold text-slate-500">{cls.grade}</span>
                                <span>الصف / المرحلة:</span>
                              </div>
                              {cls.room && cls.room !== 'غير محدد' && (
                                <div className="flex items-center gap-1 justify-end">
                                  <span className="font-semibold text-slate-500">{cls.room}</span>
                                  <span>القاعة:</span>
                                </div>
                              )}
                              {teacher && (
                                <div className="flex items-center gap-1 justify-end text-indigo-500">
                                  <span className="font-semibold">{teacher.name}</span>
                                  <span>رائد الفصل:</span>
                                </div>
                              )}
                              <div className="flex items-center gap-1 justify-end text-emerald-600 font-semibold">
                                <span>{studentCount} طالب</span>
                                <span>القيد:</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {classes.length === 0 && (
                      <div className="col-span-2 text-center py-16 text-slate-400 text-xs italic">
                        لا توجد صفوف دراسية مضافة حتى الآن. قم بإضافة أول صف دراسي!
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-6 text-right"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-slate-800">الإعدادات والتحديثات الذكية</h1>
                  <p className="text-slate-500 text-sm mt-1">
                    إدارة النظام، كلمات المرور، النسخ الاحتياطي، وحقن الترقية البرمجية الساخنة
                  </p>
                </div>
              </div>

              {/* Direct Portal Sharing Links (Integrated) */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
                <div>
                  <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 justify-end">
                    <span>روابط المشاركة المباشرة للبوابات الفرعية 🔗</span>
                  </h2>
                  <p className="text-slate-500 text-xs mt-1">
                    انسخ وأرسل الروابط المخصصة لكل فئة (المعلمين، الطلاب وأولياء الأمور) للدخول المباشر والآمن.
                  </p>
                </div>

                {/* Informative alert about Sandbox and URL context */}
                <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <h4 className="font-bold text-indigo-900 text-xs flex items-center gap-2 justify-end">
                      <span>💡 كيف تعمل هذه الروابط المخصصة؟</span>
                      <ArrowLeftRight className="w-4 h-4 text-indigo-600" />
                    </h4>
                    <p className="text-[11px] text-indigo-800 leading-relaxed">
                      عندما يقوم ولي الأمر أو المعلم بفتح الرابط المخصص له، سيتم إخفاء شريط التنقل العلوي وتأمين البوابة وتثبيتها بشكل كامل لخصوصية تامة وسهولة تشغيل مذهلة كأنها تطبيق مستقل على هواتفهم الذكية!
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Parent Portal Direct Link */}
                  <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs hover:border-indigo-200 transition flex flex-col justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-3 justify-end">
                        <div className="p-2 bg-sky-50 text-sky-600 rounded-lg">
                          <GraduationCap className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-900 text-xs">بوابة أولياء الأمور والطلاب</h3>
                          <span className="text-[9px] text-sky-600 font-bold block">رابط الوصول العام والمباشر</span>
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        أرسل هذا الرابط لجميع أولياء أمور الطلاب لمتابعة نتائج الاختبارات، تدوين الغياب، رؤية السلوك، واستلام الإشعارات المدرسية فوراً.
                      </p>
                    </div>

                    <div className="space-y-2 pt-3 border-t border-slate-100">
                      <div className="space-y-1">
                        <label className="block text-[10px] font-bold text-slate-400">رابط البوابة لولي الأمر:</label>
                        <input
                          type="text"
                          readOnly
                          value={`${getShareableOrigin()}${window.location.pathname}?portal=parent`}
                          className="w-full text-[10px] font-mono bg-slate-50 border border-slate-200 px-2 py-1.5 rounded-lg text-slate-600 text-center select-all focus:outline-none"
                        />
                      </div>
                      <div className="flex gap-2">
                        <a
                          href={`${getShareableOrigin()}${window.location.pathname}?portal=parent`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-bold px-3 py-2 rounded-lg text-center transition flex-1 flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <span>فتح ↗</span>
                        </a>
                        <button
                          type="button"
                          onClick={async () => {
                            const url = `${getShareableOrigin()}${window.location.pathname}?portal=parent`;
                            try {
                              await navigator.clipboard.writeText(url);
                              alert('تم نسخ رابط بوابة أولياء الأمور والطلاب المباشر بنجاح! 📋');
                            } catch (err) {
                              alert('تمنع حماية المتصفح النسخ التلقائي في هذا الإطار. يرجى تحديد النص في المربع ونسخه يدوياً (Ctrl+C).');
                            }
                          }}
                          className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-[11px] font-bold px-3 py-2 rounded-lg transition cursor-pointer"
                        >
                          نسخ الرابط
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Teacher Portal Direct Link */}
                  <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs hover:border-indigo-200 transition flex flex-col justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-3 justify-end">
                        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                          <Users className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-900 text-xs">بوابة المعلمين المشرفة</h3>
                          <span className="text-[9px] text-indigo-600 font-bold block">رابط رصد الدرجات والتحضير</span>
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        رابط مخصص لأعضاء الكادر التدريسي لرصد الحضور والغياب اليومي، رصد علامات المواد والاختبارات، ومتابعة سجلات سلوك الطلاب بشكل مستقل.
                      </p>
                    </div>

                    <div className="space-y-2 pt-3 border-t border-slate-100">
                      <div className="space-y-1">
                        <label className="block text-[10px] font-bold text-slate-400">رابط بوابة المعلمين:</label>
                        <input
                          type="text"
                          readOnly
                          value={`${getShareableOrigin()}${window.location.pathname}?portal=teacher`}
                          className="w-full text-[10px] font-mono bg-slate-50 border border-slate-200 px-2 py-1.5 rounded-lg text-slate-600 text-center select-all focus:outline-none"
                        />
                      </div>
                      <div className="flex gap-2">
                        <a
                          href={`${getShareableOrigin()}${window.location.pathname}?portal=teacher`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold px-3 py-2 rounded-lg text-center transition flex-1 flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <span>فتح ↗</span>
                        </a>
                        <button
                          type="button"
                          onClick={async () => {
                            const url = `${getShareableOrigin()}${window.location.pathname}?portal=teacher`;
                            try {
                              await navigator.clipboard.writeText(url);
                              alert('تم نسخ رابط بوابة المعلمين المباشر بنجاح! 📋');
                            } catch (err) {
                              alert('تمنع حماية المتصفح النسخ التلقائي في هذا الإطار. يرجى تحديد النص في المربع ونسخه يدوياً (Ctrl+C).');
                            }
                          }}
                          className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-[11px] font-bold px-3 py-2 rounded-lg transition cursor-pointer"
                        >
                          نسخ الرابط
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Director Portal Direct Link */}
                  <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs hover:border-indigo-200 transition flex flex-col justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-3 justify-end">
                        <div className="p-2 bg-slate-100 text-slate-700 rounded-lg">
                          <Building className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-900 text-xs">لوحة الإدارة والمدير العام</h3>
                          <span className="text-[9px] text-slate-600 font-bold block">رابط الوصول الإداري الكامل</span>
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        هذا الرابط مخصص لك كـ مدير عام لفتح لوحة التحكم وهيكل الفصول والطلاب والمواد وتحديثات المنظومة مباشرة في نافذة مستقلة كاملة.
                      </p>
                    </div>

                    <div className="space-y-2 pt-3 border-t border-slate-100">
                      <div className="space-y-1">
                        <label className="block text-[10px] font-bold text-slate-400">رابط لوحة المدير الخاص بك:</label>
                        <input
                          type="text"
                          readOnly
                          value={`${getShareableOrigin()}${window.location.pathname}?portal=director`}
                          className="w-full text-[10px] font-mono bg-slate-50 border border-slate-200 px-2 py-1.5 rounded-lg text-slate-600 text-center select-all focus:outline-none"
                        />
                      </div>
                      <div className="flex gap-2">
                        <a
                          href={`${getShareableOrigin()}${window.location.pathname}?portal=director`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-slate-800 hover:bg-slate-900 text-white text-[11px] font-bold px-3 py-2 rounded-lg text-center transition flex-1 flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <span>فتح ↗</span>
                        </a>
                        <button
                          onClick={async () => {
                            const url = `${getShareableOrigin()}${window.location.pathname}?portal=director`;
                            try {
                              await navigator.clipboard.writeText(url);
                              alert('تم نسخ رابط لوحة المدير المباشر بنجاح! 📋');
                            } catch (err) {
                              alert('تمنع حماية المتصفح النسخ التلقائي في هذا الإطار. يرجى تحديد النص في المربع ونسخه يدوياً (Ctrl+C).');
                            }
                          }}
                          className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-[11px] font-bold px-3 py-2 rounded-lg transition cursor-pointer"
                        >
                          نسخ الرابط
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Sandbox notice banner inside tab */}
                <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl">
                  <span className="text-[11px] font-bold text-amber-900 block mb-0.5">⚠️ تنبيه هام حول تجربة الروابط المباشرة:</span>
                  <p className="text-[10px] text-amber-800 leading-relaxed">
                    الروابط أعلاه تحتوي على نطاق الموقع الحالي الذي تتصفحه الآن. عندما تقوم بمشاركة التطبيق بشكل عام ونشر رابط المنصة العام، ستقوم الروابط تلقائياً باستخدام النطاق الجديد المحدث والمستضيف للمدرسة وسيعمل الرابط بنجاح لدى الجميع دون أي تدخل يدوي منك!
                  </p>
                </div>
              </div>

              {/* Academic Year Management Panel */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
                <div>
                  <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 justify-end">
                    <span>إدارة وتخصيص الأعوام الدراسية 📅</span>
                  </h2>
                  <p className="text-slate-500 text-xs mt-1">
                    قم بإضافة وتحديد العام الدراسي الحالي للمنصة وإدارته وتعديله مباشرة ليكون معتمداً في جميع تقارير وشهادات وبوابات المدرسة.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-right">
                  {/* Active Academic Year Selection */}
                  <div className="space-y-3">
                    <label className="block text-xs font-bold text-slate-700">1. تحديد العام الدراسي النشط:</label>
                    <div className="space-y-2">
                      <select
                        value={activeAcademicYear}
                        onChange={e => {
                          setActiveAcademicYear(e.target.value);
                          localStorage.setItem('school_active_academic_year', e.target.value);
                        }}
                        className="w-full text-xs border border-slate-200 p-2.5 rounded-xl bg-slate-50 focus:outline-none focus:border-indigo-500 font-bold text-indigo-700"
                      >
                        <option value="غير محدد">-- غير محدد --</option>
                        {academicYears.map(year => (
                          <option key={year} value={year}>
                            {year}
                          </option>
                        ))}
                      </select>
                      <p className="text-[10px] text-slate-400">
                        العام الدراسي النشط سيظهر تلقائياً في أعلى لوحة تحكم المدير وفي كافة التقارير المطبوعة.
                      </p>
                    </div>
                  </div>

                  {/* Add New Academic Year */}
                  <div className="space-y-3">
                    <label className="block text-xs font-bold text-slate-700">2. إضافة عام دراسي جديد:</label>
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (!newAcademicYearInput.trim()) {
                              alert('الرجاء كتابة اسم أو رمز العام الدراسي أولاً.');
                              return;
                            }
                            if (academicYears.includes(newAcademicYearInput.trim())) {
                              alert('هذا العام الدراسي موجود مسبقاً.');
                              return;
                            }
                            const updated = [...academicYears, newAcademicYearInput.trim()];
                            setAcademicYears(updated);
                            localStorage.setItem('school_academic_years', JSON.stringify(updated));
                            setNewAcademicYearInput('');
                          }}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition cursor-pointer shrink-0"
                        >
                          إضافة
                        </button>
                        <input
                          type="text"
                          value={newAcademicYearInput}
                          onChange={e => setNewAcademicYearInput(e.target.value)}
                          placeholder="مثال: 2026/2027"
                          className="flex-1 text-xs border border-slate-200 p-2.5 rounded-xl bg-slate-50 focus:outline-none focus:border-indigo-500 font-bold text-center"
                          style={{ direction: 'ltr' }}
                        />
                      </div>
                      <p className="text-[10px] text-slate-400">
                        اكتب العام بالصيغة المتعارف عليها ثم انقر على إضافة.
                      </p>
                    </div>
                  </div>

                  {/* Academic Years list */}
                  <div className="space-y-3">
                    <label className="block text-xs font-bold text-slate-700">3. الأعوام الدراسية المسجلة حالياً:</label>
                    <div className="border border-slate-100 rounded-xl max-h-[140px] overflow-y-auto divide-y divide-slate-50 bg-slate-50/50">
                      {academicYears.length === 0 ? (
                        <div className="p-4 text-center text-xs text-slate-400">
                          لا توجد أعوام مضافة حالياً.
                        </div>
                      ) : (
                        academicYears.map(year => (
                          <div key={year} className="p-2.5 flex items-center justify-between gap-2 text-xs">
                            <button
                              type="button"
                              onClick={() => {
                                if (year === activeAcademicYear) {
                                  alert('⚠️ لا يمكن حذف العام الدراسي المحدد كعام نشط حالياً. قم باختيار عام آخر كعام نشط أولاً.');
                                  return;
                                }
                                if (confirm(`هل أنت متأكد من حذف العام الدراسي (${year}) نهائياً من القائمة؟`)) {
                                  const updated = academicYears.filter(y => y !== year);
                                  setAcademicYears(updated);
                                  localStorage.setItem('school_academic_years', JSON.stringify(updated));
                                }
                              }}
                              className="text-rose-600 hover:text-rose-800 p-1 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                              title="حذف هذا العام"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            <div className="flex items-center gap-1.5 font-bold">
                              {year === activeAcademicYear && (
                                <span className="text-[9px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-md font-extrabold">
                                  نشط حالياً
                                </span>
                              )}
                              <span className="text-slate-700">{year}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>


              {/* Targeted Custom Data Deletion & Management Panel */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
                <div>
                  <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 justify-end">
                    <span>لوحة تصفير وإدارة البيانات المخصصة 🧹</span>
                  </h2>
                  <p className="text-slate-500 text-xs mt-1 text-right">
                    أداة تحكم متقدمة تتيح لك البحث عن أي طالب، معلم، إعلان، رسالة، أو صف دراسي وحذفه بمفرده، أو تصفير القسم بالكامل دفعة واحدة بكل أمان.
                  </p>
                </div>

                {/* Category Selection Tabs */}
                <div className="flex flex-wrap gap-1.5 justify-end border-b border-slate-100 pb-3">
                  {[
                    { id: 'students', label: 'الطلاب والتحضير', count: students.length },
                    { id: 'teachers', label: 'المعلمين', count: teachers.length },
                    { id: 'classes', label: 'الصفوف والشعب', count: classes.length },
                    { id: 'grades', label: 'الدرجات المرصودة', count: grades.length },
                    { id: 'announcements', label: 'التعاميم والإعلانات', count: announcements.length },
                    { id: 'messages', label: 'الرسائل والإشعارات', count: messages.length },
                    { id: 'excuses', label: 'الأعذار الطبية', count: excuses.length }
                  ].map(cat => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        setTargetDeleteCategory(cat.id as any);
                        setDeleteSearchQuery('');
                        setBulkDeleteConfirmation('');
                      }}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border ${
                        targetDeleteCategory === cat.id
                          ? 'bg-slate-900 text-white border-slate-950 shadow-xs'
                          : 'bg-slate-50 text-slate-600 border-slate-150 hover:bg-slate-100'
                      }`}
                    >
                      <span className="bg-white/25 px-1.5 py-0.5 rounded-md font-sans text-[10px]">{cat.count}</span>
                      <span>{cat.label}</span>
                    </button>
                  ))}
                </div>

                {/* Two Column Layout */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-right">
                  {/* Left: Scrollable Search & Individual Delete List (Cols: 7) */}
                  <div className="lg:col-span-7 space-y-4">
                    <div className="flex items-center gap-2 border border-slate-200 px-3 py-2.5 rounded-xl bg-slate-50 focus-within:border-indigo-500 focus-within:bg-white transition">
                      <Search className="w-4 h-4 text-slate-400 shrink-0" />
                      <input
                        type="text"
                        value={deleteSearchQuery}
                        onChange={e => setDeleteSearchQuery(e.target.value)}
                        placeholder={`ابحث عن ${
                          targetDeleteCategory === 'students' ? 'اسم الطالب أو الصف...' :
                          targetDeleteCategory === 'teachers' ? 'اسم المعلم أو التخصص...' :
                          targetDeleteCategory === 'classes' ? 'اسم الشعبة أو المرحلة...' :
                          targetDeleteCategory === 'grades' ? 'اسم الطالب أو المادة...' :
                          targetDeleteCategory === 'announcements' ? 'عنوان الإعلان أو محتواه...' :
                          targetDeleteCategory === 'messages' ? 'اسم المرسل أو نص الرسالة...' :
                          'اسم صاحب العذر...'
                        }`}
                        className="w-full text-xs font-medium focus:outline-none text-right bg-transparent"
                      />
                    </div>

                    <div className="border border-slate-150 rounded-2xl overflow-hidden divide-y divide-slate-100 max-h-[320px] overflow-y-auto bg-slate-50/20">
                      {getFilteredPurgeItems().length === 0 ? (
                        <div className="p-8 text-center text-xs text-slate-400 italic">
                          لا توجد نتائج مطابقة لعملية البحث أو القسم فارغ تماماً.
                        </div>
                      ) : (
                        getFilteredPurgeItems().slice(0, 80).map((item: any) => {
                          let title = '';
                          let subtitle = '';
                          if (targetDeleteCategory === 'students') {
                            title = item.name;
                            subtitle = `الصف الدراسي: ${classes.find(c => c.id === item.classId)?.name || 'غير محدد'} | هاتف ولي الأمر: ${item.parentPhone || 'غير متوفر'}`;
                          } else if (targetDeleteCategory === 'teachers') {
                            title = item.name;
                            subtitle = `المواد: ${item.subjects.join('، ') || 'لا يوجد'} | البريد: ${item.email || 'غير متوفر'}`;
                          } else if (targetDeleteCategory === 'announcements') {
                            title = item.title;
                            subtitle = `تاريخ النشر: ${item.date || 'غير محدد'} | المحتوى: ${item.content ? item.content.substring(0, 60) + '...' : ''}`;
                          } else if (targetDeleteCategory === 'messages') {
                            title = item.content;
                            subtitle = `المرسل: ${item.senderName} (${item.senderRole === 'director' ? 'المدير' : item.senderRole === 'teacher' ? 'المعلم' : 'ولي الأمر'}) | تاريخ: ${item.timestamp || ''}`;
                          } else if (targetDeleteCategory === 'excuses') {
                            title = students.find(s => s.id === item.studentId)?.name || 'طالب مجهول';
                            subtitle = `السبب: ${item.reason} | الحالة: ${item.status === 'approved' ? 'مقبول ✅' : item.status === 'rejected' ? 'مرفوض ❌' : 'قيد الانتظار ⏳'}`;
                          } else if (targetDeleteCategory === 'classes') {
                            title = item.name;
                            subtitle = `المرحلة: ${item.grade} | رقم القاعة: ${item.room || 'غير محدد'} | رائد الفصل: ${teachers.find(t => t.id === item.classTeacherId)?.name || 'غير حدد'}`;
                          } else if (targetDeleteCategory === 'grades') {
                            title = `مادة ${item.subject} - الطالب: ${students.find(s => s.id === item.studentId)?.name || 'مجهول'}`;
                            subtitle = `النوع: ${item.type} | الشهر: ${item.month || 'غير محدد'} | الدرجة: ${item.score} من ${item.maxScore}`;
                          }

                          return (
                            <div key={item.id} className="p-3 bg-white hover:bg-slate-50/50 transition flex items-center justify-between gap-4 text-right">
                              <button
                                type="button"
                                onClick={() => handleDeleteSingleItem(targetDeleteCategory, item.id)}
                                className="text-rose-600 hover:text-rose-800 hover:bg-rose-50 p-2 rounded-xl transition cursor-pointer"
                                title="حذف هذا العنصر نهائياً"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                              <div className="flex-1 space-y-0.5">
                                <h4 className="font-bold text-xs text-slate-800 leading-tight">{title}</h4>
                                <p className="text-[10px] text-slate-500 font-sans leading-tight text-right">{subtitle}</p>
                              </div>
                            </div>
                          );
                        })
                      )}
                      {getFilteredPurgeItems().length > 80 && (
                        <div className="p-2.5 text-center text-[10px] text-slate-400 bg-slate-50 font-bold border-t border-slate-100">
                          تنبيه: تم عرض أول 80 نتيجة فقط للتسريع. يرجى استخدام شريط البحث لتصفية النتائج بشكل أدق.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Category Summary & Safe Wipe All Section (Cols: 5) */}
                  <div className="lg:col-span-5 bg-rose-50/40 border border-rose-100 p-5 rounded-2xl flex flex-col justify-between space-y-4">
                    <div className="space-y-2">
                      <h3 className="font-bold text-rose-950 text-sm flex items-center gap-1.5 justify-end">
                        <AlertTriangle className="w-5 h-5 text-rose-600" />
                        <span>تصفير فئة البيانات المحددة بالكامل</span>
                      </h3>
                      <p className="text-slate-600 text-[11px] leading-relaxed">
                        {targetDeleteCategory === 'students' && '⚠️ تحذير: مسح الطلاب سيقوم بتصفير كافة الطلاب المسجلين، وحذف درجاتهم وعلاماتهم، وسجلات الغياب والحضور، وأعذارهم الطبية، وحسابات أولياء الأمور المرتبطين بهم.'}
                        {targetDeleteCategory === 'teachers' && '⚠️ تحذير: مسح الكادر التعليمي سيمسح جميع حسابات المعلمين من المنصة ويلغي دورهم القيادي للفصول الدراسية والمواد.'}
                        {targetDeleteCategory === 'classes' && '⚠️ تحذير: مسح الفصول والشعب سيلغي هيكل الفصول. سيبقى الطلاب مسجلين ولكن بدون أي انتساب لشعبة، ويمكنك إعادة تصنيفهم لاحقاً.'}
                        {targetDeleteCategory === 'grades' && '⚠️ تحذير: سيتم حذف كافة الدرجات المرصودة في جميع الاختبارات والشهادات والتقارير الشهرية للفوج بالكامل.'}
                        {targetDeleteCategory === 'announcements' && '⚠️ تنبيه: سيتم حذف جميع الإعلانات والتعاميم المدرسية والرسائل الإدارية العامة المنشورة مسبقاً.'}
                        {targetDeleteCategory === 'messages' && '⚠️ تنبيه: سيتم حذف جميع رسائل وصندوق المحادثات والدردشة بين الإدارة والمعلمين وأولياء الأمور نهائياً.'}
                        {targetDeleteCategory === 'excuses' && '⚠️ تنبيه: سيتم حذف جميع الطلبات والأعذار الطبية المرفوعة من أولياء الأمور لتبرير غياب أبنائهم.'}
                      </p>
                    </div>

                    <div className="space-y-3 pt-3 border-t border-rose-100 text-right">
                      <div className="space-y-1">
                        <label className="block text-[10px] font-bold text-rose-900">لتأكيد رغبتك في حذف كل السجلات، اكتب العبارة بدقة:</label>
                        <input
                          type="text"
                          value={bulkDeleteConfirmation}
                          onChange={e => setBulkDeleteConfirmation(e.target.value)}
                          placeholder="اكتب كلمة 'تأكيد الحذف' للتصفير"
                          className="w-full text-center text-xs font-bold bg-white border border-rose-200 px-3 py-2.5 rounded-xl focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 text-rose-700"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => handleBulkDeleteCategory(targetDeleteCategory)}
                        disabled={bulkDeleteConfirmation !== 'تأكيد الحذف'}
                        className={`w-full py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm ${
                          bulkDeleteConfirmation === 'تأكيد الحذف'
                            ? 'bg-rose-600 hover:bg-rose-700 text-white cursor-pointer shadow-rose-100/50'
                            : 'bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>تفريغ وتصفير الفئة بالكامل 🚨</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>



              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Backup & Restore Card */}
                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <h3 className="font-bold text-slate-800 text-base flex items-center gap-2 justify-end">
                      <Database className="w-5 h-5 text-indigo-600" />
                      <span>النسخ الاحتياطي واستعادة البيانات</span>
                    </h3>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      قم بتحميل وحفظ نسخة احتياطية كاملة من كافة بيانات المدرسة (معلمون، طلاب، أولياء أمور، درجات، سجلات الحضور) في ملف JSON آمن للرجوع إليه في أي وقت.
                    </p>
                  </div>

                  {/* APK & Mobile Compatibility Switch */}
                  <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-4 flex items-start justify-between gap-3 text-right">
                    <div className="flex-1">
                      <h4 className="text-xs font-bold text-amber-950 flex items-center gap-1 justify-end">
                        <span>نمط التوافق للأجهزة الذكية والـ APK 📱</span>
                      </h4>
                      <p className="text-[10px] text-amber-800 leading-relaxed mt-0.5">
                        يمنع حدوث "الشاشة البيضاء" في الهواتف عبر استبدال رفع/تنزيل الملفات بنسخ ولصق كود البيانات مباشرة للحافظة (Clipboard) مع استيراد نصي ذكي.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleApkMode(!apkCompatibilityMode)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        apkCompatibilityMode ? 'bg-amber-600' : 'bg-slate-200'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                          apkCompatibilityMode ? '-translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  <div className="space-y-3 pt-4 border-t border-slate-50">
                    <button
                      onClick={handleDownloadBackup}
                      className="w-full text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 py-3 rounded-xl transition cursor-pointer flex items-center justify-center gap-2 shadow-md shadow-indigo-100"
                    >
                      <Download className="w-4 h-4" />
                      <span>{apkCompatibilityMode ? '📋 نسخ كود النسخة الاحتياطية للحافظة' : 'تنزيل نسخة احتياطية كاملة (JSON)'}</span>
                    </button>

                    {apkCompatibilityMode ? (
                      <div className="space-y-2">
                        <button
                          type="button"
                          onClick={() => setShowPastedBackupInput(!showPastedBackupInput)}
                          className="w-full text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 py-2.5 rounded-xl transition cursor-pointer flex items-center justify-center gap-2"
                        >
                          <span>📥 لصق واستعادة نسخة احتياطية من الحافظة</span>
                        </button>
                        
                        {showPastedBackupInput && (
                          <motion.div
                            initial={{ opacity: 0, y: -5 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2"
                          >
                            <label className="block text-[11px] font-semibold text-slate-600">الصق الكود البرمجي للنسخة الاحتياطية هنا:</label>
                            <textarea
                              rows={4}
                              value={pastedBackupData}
                              onChange={e => setPastedBackupData(e.target.value)}
                              placeholder='{"teachers":[...],"students":[...],"classes":[...], ...}'
                              className="w-full text-[10px] border border-slate-200 p-2 rounded-lg focus:border-indigo-500 focus:outline-none font-mono"
                              style={{ direction: 'ltr' }}
                            />
                            <button
                              type="button"
                              onClick={() => handleRestoreBackupFromText(pastedBackupData)}
                              className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition cursor-pointer"
                            >
                              تأكيد استعادة البيانات من الكود الملصق 🔄
                            </button>
                          </motion.div>
                        )}
                      </div>
                    ) : (
                      <div className="relative">
                        <input
                          type="file"
                          accept=".json"
                          onChange={handleRestoreBackup}
                          className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                        />
                        <div className="w-full text-xs font-semibold text-center border-2 border-dashed border-slate-200 rounded-xl py-2.5 px-4 text-slate-500 hover:border-indigo-300 hover:text-indigo-600 transition cursor-pointer">
                          <span>📤 رفع واستعادة نسخة احتياطية</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Hot Patching Card */}
                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <h3 className="font-bold text-slate-800 text-base flex items-center gap-2 justify-end">
                      <RefreshCw className="w-5 h-5 text-amber-500 animate-spin-slow" />
                      <span>مركز التحديث والترقية الذكي (Patches)</span>
                    </h3>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      الصق كود JavaScript مخصص لتطبيق ميزات برمجية جديدة أو ترقية سجلات المدرسة ديناميكياً بدون انقطاع وبدون الحاجة لإعادة تحميل التطبيق.
                    </p>
                  </div>

                  <div className="space-y-3 pt-4 border-t border-slate-50">
                    <textarea
                      rows={3}
                      value={patchInput}
                      onChange={e => setPatchInput(e.target.value)}
                      placeholder="// الصق كود JavaScript هنا لترقية النظام..."
                      className="w-full text-xs border border-slate-200 p-3 rounded-xl focus:border-amber-500 focus:outline-none font-mono"
                      style={{ direction: 'ltr' }}
                    />
                    <button
                      onClick={handleApplyPatch}
                      className="w-full text-xs font-bold text-white bg-amber-500 hover:bg-amber-600 py-3 rounded-xl transition cursor-pointer flex items-center justify-center gap-2 shadow-md shadow-amber-100"
                    >
                      <span>تطبيق التحديث البرمجي فوراً 🚀</span>
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Modals for Quick Actions */}
        <AnimatePresence>
          {showClipboardModal && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[10005]">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden text-right"
              >
                <div className="bg-indigo-900 text-white p-5 flex justify-between items-center">
                  <button
                    onClick={() => setShowClipboardModal(false)}
                    className="text-white/80 hover:text-white p-1 hover:bg-white/10 rounded-lg transition cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                  <div className="flex items-center gap-2.5">
                    <div className="bg-white/10 p-2 rounded-xl">
                      <Copy className="w-5 h-5 text-indigo-300" />
                    </div>
                    <div>
                      <h3 className="font-bold text-base">{clipboardModalTitle}</h3>
                      <p className="text-[10px] text-indigo-200 font-medium">النسخ الاحتياطي والاستيراد الذكي للأجهزة و APK</p>
                    </div>
                  </div>
                </div>

                <div className="p-6 space-y-4">
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {clipboardModalBody}
                  </p>

                  <div className="relative bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <textarea
                      readOnly
                      rows={6}
                      value={clipboardModalText}
                      onClick={e => (e.target as HTMLTextAreaElement).select()}
                      className="w-full text-[11px] bg-transparent text-slate-700 font-mono focus:outline-none focus:ring-0 border-0 resize-none"
                      style={{ direction: 'ltr' }}
                    />
                  </div>

                  {clipboardModalSuccess ? (
                    <div className="bg-emerald-50 text-emerald-850 border border-emerald-100 p-3 rounded-xl text-xs font-medium text-center flex items-center justify-center gap-1.5">
                      <span>✓ تم نسخ البيانات تلقائياً لحافظة هاتفك! يمكنك الآن لصقها في إكسل أو تطبيق الملاحظات.</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          navigator.clipboard.writeText(clipboardModalText);
                          setClipboardModalSuccess(true);
                        } catch (err) {
                          alert('فشل النسخ التلقائي. يرجى تحديد النص أعلاه ونسخه يدوياً.');
                        }
                      }}
                      className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Copy className="w-4 h-4" />
                      <span>نسخ النص يدوياً للحافظة</span>
                    </button>
                  )}
                </div>
              </motion.div>
            </div>
          )}

          {showClassForm && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[10000]">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden text-right"
              >
                <div className="bg-slate-900 text-white p-5 flex justify-between items-center">
                  <button
                    onClick={() => setShowClassForm(false)}
                    className="text-white/80 hover:text-white p-1 hover:bg-white/10 rounded-lg transition cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                  <div className="flex items-center gap-2.5">
                    <div className="bg-white/10 p-2 rounded-xl">
                      <Building className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="font-bold text-base">🏫 إضافة صف وشعبة جديدة</h3>
                      <p className="text-[10px] text-slate-300 font-medium">تسجيل فصل دراسي وتخصيص المشرف والبيانات</p>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleAddClass} className="p-6 space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">اسم الشعبة الدراسية *</label>
                    <input
                      type="text"
                      value={newClassName}
                      onChange={e => setNewClassName(e.target.value)}
                      placeholder="مثال: الصف الأول - شعبة أ"
                      className="w-full text-sm border border-slate-200 px-3.5 py-2.5 rounded-xl focus:border-emerald-500 focus:outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">الصف / المرحلة الدراسية *</label>
                    <input
                      type="text"
                      value={newClassGrade}
                      onChange={e => setNewClassGrade(e.target.value)}
                      placeholder="مثال: الأول، الثاني، الثالث"
                      className="w-full text-sm border border-slate-200 px-3.5 py-2.5 rounded-xl focus:border-emerald-500 focus:outline-none"
                      required
                    />
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowClassForm(false)}
                      className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold py-3 rounded-xl transition text-sm cursor-pointer text-center"
                    >
                      إلغاء
                    </button>
                    <button
                      type="submit"
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl transition shadow-md shadow-emerald-100 text-sm cursor-pointer text-center"
                    >
                      تأكيد الإضافة ✨
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}

          {showSubjectModal && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[10000]">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden text-right"
              >
                <div className="bg-slate-900 text-white p-5 flex justify-between items-center">
                  <button
                    onClick={() => setShowSubjectModal(false)}
                    className="text-white/80 hover:text-white p-1 hover:bg-white/10 rounded-lg transition cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                  <div className="flex items-center gap-2.5">
                    <div className="bg-white/10 p-2 rounded-xl">
                      <BookOpen className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div>
                      <h3 className="font-bold text-base">📚 إضافة مادة دراسية جديدة</h3>
                      <p className="text-[10px] text-slate-300 font-medium">تسجيل وتفعيل مادة دراسية جديدة بالمنصة</p>
                    </div>
                  </div>
                </div>

                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">اسم المادة الدراسية الجديدة *</label>
                    <input
                      type="text"
                      value={newSubjectName}
                      onChange={e => setNewSubjectName(e.target.value)}
                      placeholder="مثال: التربية البدنية، المهارات الحياتية"
                      className="w-full text-sm border border-slate-200 px-3.5 py-2.5 rounded-xl focus:border-indigo-500 focus:outline-none"
                      required
                    />
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowSubjectModal(false)}
                      className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold py-3 rounded-xl transition text-sm cursor-pointer text-center"
                    >
                      إلغاء
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const trimmed = newSubjectName.trim();
                        if (!trimmed) {
                          alert('الرجاء كتابة اسم المادة');
                          return;
                        }
                        if (customSubjects.includes(trimmed)) {
                          alert('هذه المادة موجودة بالفعل!');
                          return;
                        }
                        const updated = [...customSubjects, trimmed];
                        setCustomSubjects(updated);
                        localStorage.setItem('school_custom_subjects', JSON.stringify(updated));
                        setNewSubjectName('');
                        setShowSubjectModal(false);
                        alert('🎉 تم إضافة المادة الدراسية بنجاح!');
                      }}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition shadow-md shadow-indigo-100 text-sm cursor-pointer text-center"
                    >
                      تأكيد الإضافة ✨
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}

          {isMetricsModalOpen && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[10000]">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden text-right"
              >
                {/* Modal Header */}
                <div className="bg-slate-900 text-white p-5 flex justify-between items-center">
                  <button
                    onClick={() => setIsMetricsModalOpen(false)}
                    className="text-white/80 hover:text-white p-1 hover:bg-white/10 rounded-lg transition cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                  <div className="flex items-center gap-2.5">
                    <div className="bg-indigo-600/30 p-2 rounded-xl border border-indigo-500/20">
                      <Activity className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div>
                      <h3 className="font-bold text-base">📊 لوحة مراقبة الاستهلاك السحابي (Firestore)</h3>
                      <p className="text-[10px] text-slate-300 font-medium">التحكم الذكي وحساب معدل قراءة وكتابة البيانات يومياً</p>
                    </div>
                  </div>
                </div>

                {/* Modal Body */}
                <div className="p-6 space-y-5">
                  {/* Status Box */}
                  {(() => {
                    const readPct = Math.min(100, Math.round((firestoreMetrics.totalReads / 40000) * 100));
                    const writePct = Math.min(100, Math.round((firestoreMetrics.totalWrites / 20000) * 100));
                    const maxPct = Math.max(readPct, writePct);

                    let statusTitle = "مستوى ممتاز وآمن (Safe Level) ✅";
                    let statusMsg = "حالة جيدة: معدل استهلاك العمليات في مستواه الطبيعي والمستقر بالكامل. المنصة تعمل بكفاءة عالية وبأقل تكلفة تشغيلية.";
                    let statusColor = "text-emerald-600 bg-emerald-50 border-emerald-100";

                    if (maxPct >= 90) {
                      statusTitle = "مستوى حرج (Critical Level) 🚨";
                      statusMsg = "تنبيه هام جداً: لقد اقترب معدل استهلاك العمليات اليومية من سقف باقة الاستضافة المجانية (Spark 40k). نوصي بترشيد العمليات أو ترقية الخطة لتفادي أي انقطاع مؤقت للخدمة.";
                      statusColor = "text-rose-600 bg-rose-50 border-rose-100";
                    } else if (maxPct >= 75) {
                      statusTitle = "مستوى تنبيه (Caution Level) ⚠️";
                      statusMsg = "تنبيه: استهلاك العمليات اليومية مرتفع نسبياً ولكنه تحت السيطرة. قد يكون هذا ناتجاً عن زيادة نشاط أولياء الأمور والمعلمين اليوم.";
                      statusColor = "text-amber-600 bg-amber-50 border-amber-100";
                    }

                    return (
                      <div className={`p-4 rounded-2xl border text-xs leading-relaxed ${statusColor}`}>
                        <h4 className="font-bold text-sm mb-1">{statusTitle}</h4>
                        <p>{statusMsg}</p>
                      </div>
                    );
                  })()}

                  {/* Reads Bar */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-700">عمليات القراءة اليومية (Reads)</span>
                      <span className="font-mono text-slate-500 font-bold">
                        {firestoreMetrics.totalReads.toLocaleString()} / 40,000 (
                        {Math.min(100, Math.round((firestoreMetrics.totalReads / 40000) * 100))}%
                        )
                      </span>
                    </div>
                    {/* Progress Bar */}
                    <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${
                          firestoreMetrics.totalReads >= 36000
                            ? 'bg-rose-500'
                            : firestoreMetrics.totalReads >= 30000
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(100, (firestoreMetrics.totalReads / 40000) * 100)}%` }}
                      />
                    </div>
                    {/* Breakdown */}
                    <div className="grid grid-cols-2 gap-3 bg-slate-50 p-2.5 rounded-xl text-[11px] text-slate-500">
                      <div>
                        <span>عملياتك الفعلية: </span>
                        <strong className="font-mono text-slate-700">{firestoreMetrics.reads.toLocaleString()}</strong>
                      </div>
                      <div>
                        <span>نشاط أولياء الأمور والمعلمين: </span>
                        <strong className="font-mono text-slate-700">{firestoreMetrics.simulatedReads.toLocaleString()}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Writes Bar */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-700">عمليات الكتابة اليومية (Writes)</span>
                      <span className="font-mono text-slate-500 font-bold">
                        {firestoreMetrics.totalWrites.toLocaleString()} / 20,000 (
                        {Math.min(100, Math.round((firestoreMetrics.totalWrites / 20000) * 100))}%
                        )
                      </span>
                    </div>
                    {/* Progress Bar */}
                    <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${
                          firestoreMetrics.totalWrites >= 18000
                            ? 'bg-rose-500'
                            : firestoreMetrics.totalWrites >= 15000
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(100, (firestoreMetrics.totalWrites / 20000) * 100)}%` }}
                      />
                    </div>
                    {/* Breakdown */}
                    <div className="grid grid-cols-2 gap-3 bg-slate-50 p-2.5 rounded-xl text-[11px] text-slate-500">
                      <div>
                        <span>عملياتك الفعلية: </span>
                        <strong className="font-mono text-slate-700">{firestoreMetrics.writes.toLocaleString()}</strong>
                      </div>
                      <div>
                        <span>تعديلات وإشعارات المستخدمين: </span>
                        <strong className="font-mono text-slate-700">{firestoreMetrics.simulatedWrites.toLocaleString()}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Quick Testing Actions */}
                  <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 space-y-2">
                    <span className="text-[10px] text-slate-400 block font-bold">أدوات تحكم محاكاة الضغط وتجربة الحالات (Testing Area)</span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const raw = localStorage.getItem('school_firestore_metrics');
                          if (raw) {
                            const parsed = JSON.parse(raw);
                            parsed.simulatedReads += 5000;
                            parsed.simulatedWrites += 1000;
                            parsed.totalReads = parsed.reads + parsed.simulatedReads;
                            parsed.totalWrites = parsed.writes + parsed.simulatedWrites;
                            localStorage.setItem('school_firestore_metrics', JSON.stringify(parsed));
                            window.dispatchEvent(new CustomEvent('school_firestore_metrics_updated', { detail: parsed }));
                          }
                        }}
                        className="flex-1 bg-slate-900 text-white text-[11px] font-bold py-1.5 px-3 rounded-xl hover:bg-slate-800 transition cursor-pointer"
                      >
                        ⚡ محاكاة نشاط ذروة (+5,000 قراءة)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const today = new Date().toISOString().split('T')[0];
                          const resetMetrics = {
                            date: today,
                            reads: 0,
                            writes: 0,
                            simulatedReads: 0,
                            simulatedWrites: 0,
                            totalReads: 0,
                            totalWrites: 0
                          };
                          localStorage.setItem('school_firestore_metrics', JSON.stringify(resetMetrics));
                          window.dispatchEvent(new CustomEvent('school_firestore_metrics_updated', { detail: resetMetrics }));
                        }}
                        className="bg-slate-200 text-slate-700 text-[11px] font-bold py-1.5 px-3 rounded-xl hover:bg-slate-300 transition cursor-pointer"
                      >
                        🔄 تصفير العداد
                      </button>
                    </div>
                  </div>

                  {/* Close button */}
                  <button
                    type="button"
                    onClick={() => setIsMetricsModalOpen(false)}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition text-xs cursor-pointer text-center"
                  >
                    إغلاق نافذة المراقبة 📊
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
