/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
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
  Copy,
  CheckCircle2,
  Maximize,
  Minimize,
  Moon,
  Sun,
  Clock,
  Layers,
  Image as ImageIcon,
  Sparkles,
  RotateCcw
} from 'lucide-react';
import { buildWhatsAppUrl, openWhatsAppDirectly, getWhatsAppSentRecords, recordWhatsAppSent, WhatsAppSentRecord } from '../lib/whatsapp';
import { generateEvaluationCardImage, shareOrDownloadEvaluationImage } from '../lib/generateCardImage';
import { WhatsAppMessageCustomizerModal } from './WhatsAppMessageCustomizerModal';
import { Teacher, Student, Parent, Class, AbsenceExcuse, Announcement, Grade, Attendance, Message } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import { db } from '../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { subscribeToFirestoreMetrics, FirestoreMetrics, trackFirestoreWrite, trackFirestoreRead } from '../lib/firestoreTracker';
import { forceRefreshDataFromFirestore } from '../lib/firebaseSync';
import { Bell, Activity, Info } from 'lucide-react';

const getShareableOrigin = () => {
  if (typeof window === 'undefined') return '';
  return window.location.origin;
};

const copyToClipboard = async (text: string): Promise<boolean> => {
  if (typeof window === 'undefined') return false;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn('navigator.clipboard failed, trying fallback:', err);
    }
  }
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.width = '2em';
    textArea.style.height = '2em';
    textArea.style.padding = '0';
    textArea.style.border = 'none';
    textArea.style.outline = 'none';
    textArea.style.boxShadow = 'none';
    textArea.style.background = 'transparent';
    textArea.style.fontSize = '16px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    textArea.setSelectionRange(0, 99999);
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.error('Fallback copy to clipboard failed:', err);
    return false;
  }
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
  const [activeTab, setActiveTab] = useState<'dashboard' | 'teachers' | 'students' | 'excuses' | 'announcements' | 'grades' | 'settings' | 'sharing-links' | 'tuition' | 'messages' | 'subjects' | 'classes' | 'attendance'>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [copiedState, setCopiedState] = useState<{ [key: string]: boolean }>({});

  const handleCopy = async (text: string, key: string, label?: string) => {
    const success = await copyToClipboard(text);
    if (success) {
      setCopiedState(prev => ({ ...prev, [key]: true }));
      setTimeout(() => {
        setCopiedState(prev => ({ ...prev, [key]: false }));
      }, 2000);
    } else {
      triggerClipboardExport(
        label ? `نسخ ${label}` : 'نسخ الرابط',
        `تمنع حماية المتصفح النسخ التلقائي في هذا الإطار (بسبب قيود iframe). يمكنك نسخ الرابط يدوياً من المربع أدناه بسهولة:`,
        text
      );
    }
  };

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
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      setIsFullscreen(false);
    }
  };

  const [isSyncingData, setIsSyncingData] = useState(false);
  const [syncSuccessMsg, setSyncSuccessMsg] = useState<string | null>(null);

  const [schoolAppIcon, setSchoolAppIcon] = useState<string>(() => {
    return localStorage.getItem('school_app_icon') || '';
  });

  useEffect(() => {
    const handleStorageUpdate = (e: any) => {
      const savedIcon = localStorage.getItem('school_app_icon');
      if (savedIcon !== null) {
        setSchoolAppIcon(savedIcon);
      }
    };
    window.addEventListener('school_storage_update', handleStorageUpdate);
    return () => window.removeEventListener('school_storage_update', handleStorageUpdate);
  }, []);

  const updateAppIcon = (iconValue: string) => {
    setSchoolAppIcon(iconValue);
    if (iconValue) {
      localStorage.setItem('school_app_icon', iconValue);
    } else {
      localStorage.removeItem('school_app_icon');
    }
    window.dispatchEvent(new CustomEvent('school_storage_update', {
      detail: { key: 'school_app_icon', value: iconValue }
    }));
    window.dispatchEvent(new Event('storage'));
  };

  const handleManualSync = async () => {
    setIsSyncingData(true);
    try {
      // 1. Pull latest data from Firestore if available
      await forceRefreshDataFromFirestore();

      // 2. Dispatch custom storage events so App.tsx and other portals sync immediately
      window.dispatchEvent(new CustomEvent('school_storage_update'));
      window.dispatchEvent(new Event('storage'));

      // 3. Reload local state hooks in Director Portal directly from updated localStorage
      const savedTeachers = localStorage.getItem('school_teachers');
      if (savedTeachers) {
        try { setTeachers(JSON.parse(savedTeachers)); } catch (e) {}
      }
      const savedStudents = localStorage.getItem('school_students');
      if (savedStudents) {
        try { setStudents(JSON.parse(savedStudents)); } catch (e) {}
      }
      const savedParents = localStorage.getItem('school_parents');
      if (savedParents) {
        try { setParents(JSON.parse(savedParents)); } catch (e) {}
      }
      const savedClasses = localStorage.getItem('school_classes');
      if (savedClasses) {
        try { setClasses(JSON.parse(savedClasses)); } catch (e) {}
      }
      const savedAttendance = localStorage.getItem('school_attendance');
      if (savedAttendance) {
        try { setAttendance(JSON.parse(savedAttendance)); } catch (e) {}
      }
      const savedGrades = localStorage.getItem('school_grades');
      if (savedGrades) {
        try { setGrades(JSON.parse(savedGrades)); } catch (e) {}
      }
      const savedAnnounce = localStorage.getItem('school_announcements');
      if (savedAnnounce) {
        try { setAnnouncements(JSON.parse(savedAnnounce)); } catch (e) {}
      }
      const savedExcuses = localStorage.getItem('school_excuses');
      if (savedExcuses) {
        try { setExcuses(JSON.parse(savedExcuses)); } catch (e) {}
      }
      const savedTuitions = localStorage.getItem('school_tuitions');
      if (savedTuitions) {
        try { setTuitions(JSON.parse(savedTuitions)); } catch (e) {}
      }
      const savedEval = localStorage.getItem('school_monthly_evaluations');
      if (savedEval) {
        try { setMonthlyEvaluations(JSON.parse(savedEval)); } catch (e) {}
      }
      const savedCustom = localStorage.getItem('school_custom_subjects');
      if (savedCustom) {
        try { setCustomSubjects(JSON.parse(savedCustom)); } catch (e) {}
      }
    } catch (err) {
      console.error('Error during manual data sync:', err);
    }

    setTimeout(() => {
      setIsSyncingData(false);
      setSyncSuccessMsg('🎉 تم تحديث ومزامنة كافة البيانات فقط في اللحظة دون إعادة تحميل الصفحة!');
      setTimeout(() => {
        setSyncSuccessMsg(null);
      }, 4000);
    }, 400);
  };

  React.useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

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
          
          // Load custom FCM Server Key from school_fcm_config sync or localStorage
          let savedServerKey = 'AIzaSyDcSshIC_Rs7m8uOF9OkHIJQ--JTifVKUQ_MOCK';
          const savedFcmConfig = localStorage.getItem('school_fcm_config');
          if (savedFcmConfig) {
            try {
              const parsedConfig = JSON.parse(savedFcmConfig);
              if (parsedConfig && parsedConfig.serverKey) {
                savedServerKey = parsedConfig.serverKey;
              }
            } catch (e) {
              console.warn("Could not parse saved school_fcm_config:", e);
            }
          }
          if (savedServerKey === 'AIzaSyDcSshIC_Rs7m8uOF9OkHIJQ--JTifVKUQ_MOCK') {
            const legacyKey = localStorage.getItem('fcm_server_key');
            if (legacyKey) savedServerKey = legacyKey;
          }
          
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
      shift: activeCohort === 'evening' ? 'evening' : 'morning',
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
  
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editingStudentPhone, setEditingStudentPhone] = useState<string>('');
  
  // Excel and Grade states
  const [selectedClassForGrades, setSelectedClassForGrades] = useState<string>('');
  const gradeImportInputRef = React.useRef<HTMLInputElement>(null);
  const [currentEvaluationMonth, setCurrentEvaluationMonth] = useState<string>(() => {
    return localStorage.getItem('school_evaluation_current_month') || 'تشرين الأول';
  });
  const [savedEvaluationMonths, setSavedEvaluationMonths] = useState<string[]>(() => {
    const saved = localStorage.getItem('school_saved_evaluation_months');
    return saved ? JSON.parse(saved) : ['تشرين الأول', 'تشرين الثاني', 'كانون الأول', 'كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار'];
  });
  const [isAddingNewMonth, setIsAddingNewMonth] = useState(false);
  const [newMonthName, setNewMonthName] = useState('');
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
  const [transferCohort, setTransferCohort] = useState<string>('الفوج الدراسي الحالي');
  const [transferGrade, setTransferGrade] = useState<string>('');
  const [transferSection, setTransferSection] = useState<string>('');
  const [patchInput, setPatchInput] = useState<string>('');
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [editMessageContent, setEditMessageContent] = useState<string>('');
  const [msgDirectionFilter, setMsgDirectionFilter] = useState<'all' | 'incoming' | 'outgoing'>('all');
  const [msgTypeFilter, setMsgTypeFilter] = useState<'all' | 'general' | 'admin' | 'warning' | 'financial'>('all');
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const confirmAndExecute = (title: string, message: string, onConfirm: () => void) => {
    setDeleteConfirmModal({
      isOpen: true,
      title,
      message,
      onConfirm: () => {
        onConfirm();
        setDeleteConfirmModal(null);
      }
    });
  };

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
  const [targetDeleteCategory, setTargetDeleteCategory] = useState<'students' | 'teachers' | 'announcements' | 'messages' | 'excuses' | 'classes' | 'grades' | 'attendance'>('students');
  const [deleteSearchQuery, setDeleteSearchQuery] = useState('');
  const [bulkDeleteConfirmation, setBulkDeleteConfirmation] = useState('');

  const isBulkDeleteConfirmationValid = (val: string): boolean => {
    if (!val || !val.trim()) return true;
    const normalized = val.trim().replace(/\s+/g, '').replace(/[أإآة]/g, 'ا');
    return normalized === 'تاكيدالحذف' || normalized === 'تاكيد' || normalized === 'حذف' || normalized === 'تفرغ' || normalized === 'تصفير' || normalized === 'نعم' || normalized === 'الحذف';
  };

  // Academic Year states
  const [academicYears, setAcademicYears] = useState<string[]>(() => {
    const saved = localStorage.getItem('school_academic_years');
    return saved ? JSON.parse(saved) : ['1447هـ - 2026م', '1448هـ - 2027م'];
  });
  const [activeAcademicYear, setActiveAcademicYear] = useState<string>(() => {
    const saved = localStorage.getItem('school_active_academic_year');
    return saved || 'غير محدد';
  });
  const [activeCohort, setActiveCohort] = useState<'all' | 'morning' | 'evening'>(() => {
    const saved = localStorage.getItem('school_active_cohort');
    return (saved as 'all' | 'morning' | 'evening') || 'morning';
  });
  const [isCohortSelected, setIsCohortSelected] = useState<boolean>(() => {
    const saved = localStorage.getItem('school_cohort_selected_session');
    return saved === 'true';
  });
  const [newAcademicYearInput, setNewAcademicYearInput] = useState<string>('');
  const [quickDeleteGrade, setQuickDeleteGrade] = useState('');
  const [quickDeleteClassId, setQuickDeleteClassId] = useState('');

  // Shift selection states
  const [newClassShift, setNewClassShift] = useState<'morning' | 'evening'>(() => activeCohort === 'evening' ? 'evening' : 'morning');
  const [newStudentShift, setNewStudentShift] = useState<'morning' | 'evening'>(() => activeCohort === 'evening' ? 'evening' : 'morning');
  const [newTeacherShift, setNewTeacherShift] = useState<'morning' | 'evening'>(() => activeCohort === 'evening' ? 'evening' : 'morning');

  useEffect(() => {
    if (activeCohort === 'evening' || activeCohort === 'morning') {
      setNewClassShift(activeCohort);
      setNewStudentShift(activeCohort);
      setNewTeacherShift(activeCohort);
    }
  }, [activeCohort]);

  // Helper function to check if item belongs to current active cohort
  const matchesCohort = (item: { shift?: 'morning' | 'evening'; studentId?: string }) => {
    if (activeCohort === 'all') return true;
    let itemShift = item.shift;
    if (!itemShift && item.studentId) {
      const st = students.find(s => s.id === item.studentId);
      if (st) itemShift = st.shift;
    }
    itemShift = itemShift || 'morning';
    return itemShift === activeCohort;
  };

  // Director Messages states
  const [directorChatRecipientRole, setDirectorChatRecipientRole] = useState<'teacher' | 'parent'>('teacher');
  const [directorChatRecipientId, setDirectorChatRecipientId] = useState<string>('');
  const [chatSelectedClassId, setChatSelectedClassId] = useState<string>('all');
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

  const markAllAsRead = () => {
    if (setMessages) {
      setMessages(prev => {
        const updated = prev.map(m => m.receiverRole === 'director' && !m.read ? { ...m, read: true } : m);
        localStorage.setItem('school_messages', JSON.stringify(updated));
        return updated;
      });
    }
  };
  
  // Login states
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    const saved = localStorage.getItem('school_director_is_logged_in');
    return saved === 'true';
  });
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');

  // WhatsApp sent records tracking
  const [whatsappSentRecords, setWhatsappSentRecords] = useState<Record<string, WhatsAppSentRecord>>(() => getWhatsAppSentRecords());

  // WhatsApp Customizer Modal State
  const [waModalState, setWaModalState] = useState<{
    isOpen: boolean;
    studentName: string;
    recipientPhone: string;
    initialMessage: string;
    defaultTemplateText: string;
    waKey: string;
    studentId: string;
  } | null>(null);

  const handleSendMonthlyWhatsApp = (
    student: Student,
    parentPhone: string,
    month: string,
    evalText: string | undefined,
    studentGrades: Grade[],
    subjects: string[],
    totalScore: number,
    scoredCount: number,
    teacherText?: string,
    directorText?: string,
    directSend: boolean = true
  ) => {
    let targetPhone = parentPhone;
    if (!targetPhone) {
      const parentObj = parents.find(p => p.childrenIds.includes(student.id) || p.id === student.parentId);
      if (parentObj?.phone) {
        targetPhone = parentObj.phone;
      }
    }

    // Attendance stats for student
    const studentAtt = attendance.filter(a => a.studentId === student.id);
    const presentDays = studentAtt.filter(a => a.status === 'present').length;
    const absentDays = studentAtt.filter(a => a.status === 'absent').length;
    const lateDays = studentAtt.filter(a => a.status === 'late').length;
    const totalDays = studentAtt.length;

    const attendanceFormatted = `📌 *سجل ومواظبة الحضور والغياب:*
• 🟢 *أيام الحضور:* ❪ *${presentDays} يوم* ❫
• 🔴 *أيام الغياب:* ❪ *${absentDays} يوم* ❫
${lateDays > 0 ? `• 🟡 *أيام التأخر:* ❪ *${lateDays} يوم* ❫\n` : ''}• 📊 *إجمالي أيام الدوام:* ❪ *${totalDays} يوم* ❫`;

    const isExamMatch = (examName: string | undefined, targetMonth: string) => {
      if (!examName || !targetMonth) return true;
      const e = examName.trim().toLowerCase();
      const m = targetMonth.trim().toLowerCase();
      if (e === m) return true;
      const eClean = e.replace(/^شهر\s+/, '').replace(/^تقييم\s+/, '').replace(/^اختبار\s+/, '').trim();
      const mClean = m.replace(/^شهر\s+/, '').replace(/^تقييم\s+/, '').replace(/^اختبار\s+/, '').trim();
      return eClean === mClean || (eClean.length > 0 && mClean.length > 0 && (e.includes(mClean) || m.includes(eClean)));
    };

    const targetStudentGrades = (studentGrades && studentGrades.length > 0)
      ? studentGrades
      : grades.filter(g => g.studentId === student.id && isExamMatch(g.examName, month));

    const recordedSubjectsForStudent = targetStudentGrades.map(g => g.subject).filter(Boolean);
    const customSubsList = (customSubjects && customSubjects.length > 0) ? customSubjects : [];

    const rawSubjectsList = [...subjects, ...customSubsList, ...recordedSubjectsForStudent];
    const seenSubjectsSet = new Set<string>();
    let allSubjectsForStudent: string[] = [];
    for (const rawSub of rawSubjectsList) {
      if (!rawSub) continue;
      const cleanSub = rawSub.trim();
      if (cleanSub && !seenSubjectsSet.has(cleanSub)) {
        seenSubjectsSet.add(cleanSub);
        allSubjectsForStudent.push(cleanSub);
      }
    }

    if (allSubjectsForStudent.length === 0) {
      allSubjectsForStudent = ['الرياضيات', 'العلوم', 'اللغة العربية', 'التربية الإسلامية', 'اللغة الإنجليزية', 'الاجتماعيات'];
    }

    let calculatedTotal = 0;
    let calculatedScoredCount = 0;

    let subjectsDetails = allSubjectsForStudent.map(sub => {
      const g = targetStudentGrades.find(x => x.subject && x.subject.trim() === sub.trim());
      const hasScore = g !== undefined && g.score !== undefined && g.score !== null;
      if (hasScore) {
        calculatedTotal += Number(g.score);
        calculatedScoredCount++;
      }
      const scoreVal = hasScore ? g.score : 'لم ترصد';
      return `• 📘 *${sub}:* ❪ *${scoreVal}* ${hasScore ? '/100' : ''} ❫`;
    }).join('\n');

    const finalTotalScore = calculatedScoredCount > 0 ? calculatedTotal : totalScore;
    const finalScoredCount = calculatedScoredCount > 0 ? calculatedScoredCount : scoredCount;

    const avg = finalScoredCount > 0 ? (finalTotalScore / finalScoredCount).toFixed(1) : '---';
    const avgFormatted = avg !== '---' ? `${avg}%` : '---';
    let estimation = '---';
    if (finalScoredCount > 0) {
      const avgNum = Number(avg);
      if (avgNum >= 90) estimation = 'ممتاز 🌟';
      else if (avgNum >= 80) estimation = 'جيد جداً ✨';
      else if (avgNum >= 70) estimation = 'جيد 👍';
      else if (avgNum >= 60) estimation = 'مقبول 🟢';
      else estimation = 'ضعيف 🔴';
    }

    const selectedClassObj = classes.find(c => c.id === selectedClassForGrades);
    const className = selectedClassObj ? selectedClassObj.name : '';

    const evalForStudentMonth = monthlyEvaluations[`${student.id}_${month}`] || 
      (monthlyEvaluations[student.id]?.month === month ? monthlyEvaluations[student.id] : null) ||
      monthlyEvaluations[student.id];

    const teacherDirectiveText = (teacherText !== undefined && teacherText.trim() !== '') 
      ? teacherText.trim() 
      : (evalForStudentMonth?.teacherText !== undefined && evalForStudentMonth.teacherText.trim() !== ''
        ? evalForStudentMonth.teacherText.trim()
        : (evalForStudentMonth?.text?.trim() || evalText?.trim() || ''));

    const directorDirectiveText = (directorText !== undefined && directorText.trim() !== '') 
      ? directorText.trim() 
      : (evalForStudentMonth?.directorText?.trim() || '');

    let directivesFormatted = '';
    if (teacherDirectiveText && directorDirectiveText) {
      directivesFormatted = `👨‍🏫 *توجيهات المعلم:* ❪ ${teacherDirectiveText} ❫\n🏫 *توجيهات الإدارة:* ❪ ${directorDirectiveText} ❫`;
    } else if (teacherDirectiveText) {
      directivesFormatted = `👨‍🏫 *توجيهات المعلم:* ❪ ${teacherDirectiveText} ❫`;
    } else if (directorDirectiveText) {
      directivesFormatted = `🏫 *توجيهات الإدارة:* ❪ ${directorDirectiveText} ❫`;
    } else {
      directivesFormatted = '🌟 *طالب متميز ونتمنى له دوام التوفيق والنجاح.*';
    }

    const defaultGenerated = `💚 *المدرسة الدولية الخاصة* 💚
📜 *التقييم والتقرير الشهري للدرجات*
─────────────────────────
🌹 *السلام عليكم ورحمة الله وبركاته*
إلى ولي أمر الطالب/ة المحترم:

👤 *الطالب:* *${student.name}* | 🏫 *الصف:* *${className}* | 📅 *شهر:* *[${month}]*

📚 *نتائج ودرجات المواد الدراسية:*
${subjectsDetails}

📊 *المعدل العام:* ❪ *${avgFormatted}* ❫ | 🌟 *التقدير النهائي:* *${estimation}*

📌 *سجل الحضور والمواظبة:*
• 🟢 *حضور:* ❪ *${presentDays} يوم* ❫ | 🔴 *غياب:* ❪ *${absentDays} يوم* ❫${lateDays > 0 ? ` | 🟡 *تأخر:* ❪ *${lateDays} يوم* ❫` : ''} | 📊 *إجمالي:* ❪ *${totalDays} يوم* ❫

📝 *توجيهات وتقارير المتابعة:*
${directivesFormatted}
─────────────────────────
✨ *شاكرين لكم حسن التعاون والمتابعة* | 🏫 *إدارة المدرسة*`;

    const savedCustomTemplate = localStorage.getItem('school_whatsapp_monthly_template');
    let initialMessage = defaultGenerated;

    if (savedCustomTemplate) {
      let tpl = savedCustomTemplate;

      if (!tpl.includes('{كشف_الدرجات}') && !tpl.includes('{الدرجات}') && !tpl.includes('{نتائج_المواد}')) {
        tpl = tpl.replace(/(?:•\s*(?:📘|📗|📙|📕|📚|\*)*[\s\S]*?(?:العلامة|الدرجة|\/100|\/ 100)[\s\S]*?\n?)+/gi, '{كشف_الدرجات}\n');
      }

      initialMessage = tpl
        .replace(/{اسم_الطالب}/g, student.name)
        .replace(/{الصف}/g, className)
        .replace(/{الشهر}/g, month)
        .replace(/{كشف_الدرجات}/g, subjectsDetails)
        .replace(/{الدرجات}/g, subjectsDetails)
        .replace(/{نتائج_المواد}/g, subjectsDetails)
        .replace(/{المعدل}/g, avgFormatted)
        .replace(/{المعدل_العام}/g, avgFormatted)
        .replace(/{التقدير}/g, estimation)
        .replace(/{التقدير_النهائي}/g, estimation)
        .replace(/{التقدير_العام}/g, estimation)
        .replace(/{توجيهات_المعلم}/g, teacherDirectiveText || 'لا توجد')
        .replace(/{ملاحظات_المعلم}/g, teacherDirectiveText || 'لا توجد')
        .replace(/{توجيهات_الإدارة}/g, directorDirectiveText || 'لا توجد')
        .replace(/{توجيهات_الادارة}/g, directorDirectiveText || 'لا توجد')
        .replace(/{ملاحظات_الإدارة}/g, directorDirectiveText || 'لا توجد')
        .replace(/{التقييم}/g, directivesFormatted)
        .replace(/{توجيهات}/g, directivesFormatted)
        .replace(/{التوجيهات}/g, directivesFormatted)
        .replace(/{تقرير_المتابعة}/g, directivesFormatted)
        .replace(/{أيام_الحضور}/g, `${presentDays}`)
        .replace(/{أيام_الغياب}/g, `${absentDays}`)
        .replace(/{أيام_التأخر}/g, `${lateDays}`)
        .replace(/{إجمالي_الأيام}/g, `${totalDays}`)
        .replace(/{أيام_الدوام}/g, `${totalDays}`)
        .replace(/{تقرير_الحضور}/g, attendanceFormatted)
        .replace(/{سجل_الحضور}/g, attendanceFormatted);
    }

    const waKey = `${student.id}_monthly_${month}`;

    if (directSend) {
      // 1. Copy formatted text to clipboard
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(initialMessage);
        }
      } catch (e) {}

      // 2. Open WhatsApp page directly
      openWhatsAppDirectly(targetPhone, initialMessage);

      // 3. Mark as sent
      const record = recordWhatsAppSent(waKey, student.name, 'monthly_eval');
      setWhatsappSentRecords(prev => ({
        ...prev,
        [waKey]: record
      }));
    } else {
      setWaModalState({
        isOpen: true,
        studentName: student.name,
        recipientPhone: targetPhone || '',
        initialMessage: initialMessage,
        defaultTemplateText: defaultGenerated,
        waKey: waKey,
        studentId: student.id
      });
    }
  };

  const handleConfirmSendWhatsAppDirector = (finalPhone: string, finalMessage: string, targetType: 'auto' | 'web' | 'app' = 'auto') => {
    if (!waModalState) return;

    try {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(finalMessage);
      }
    } catch (e) {}

    openWhatsAppDirectly(finalPhone, finalMessage, targetType);

    const record = recordWhatsAppSent(waModalState.waKey, waModalState.studentName, 'monthly_eval');
    setWhatsappSentRecords(prev => ({
      ...prev,
      [waModalState.waKey]: record
    }));

    // Update parent phone if changed or provided
    if (finalPhone) {
      const updatedParents = parents.map(p => {
        if (p.childrenIds.includes(waModalState.studentId) || p.id === waModalState.studentId) {
          return { ...p, phone: finalPhone };
        }
        return p;
      });
      setParents(updatedParents);
      localStorage.setItem('school_parents', JSON.stringify(updatedParents));
    }

    setWaModalState(null);
  };

  // Forms states
  const [showTeacherForm, setShowTeacherForm] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [showStudentForm, setShowStudentForm] = useState(false);
  const [showAnnounceForm, setShowAnnounceForm] = useState(false);

  // Search states
  const [teacherSearch, setTeacherSearch] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedClassForStudentAffairs, setSelectedClassForStudentAffairs] = useState<string>('all');

  // Director Attendance Management States
  const [selectedClassForAttendance, setSelectedClassForAttendance] = useState<string>('');
  const [attendanceDateForDir, setAttendanceDateForDir] = useState<string>(new Date().toISOString().split('T')[0]);
  const [localAttendanceForDir, setLocalAttendanceForDir] = useState<{ [studentId: string]: { status: 'present' | 'absent' | 'late' | 'excused'; notes: string } }>({});

  React.useEffect(() => {
    if (!selectedClassForAttendance && classes.length > 0) {
      setSelectedClassForAttendance(classes[0].id);
    }
  }, [classes, selectedClassForAttendance]);

  React.useEffect(() => {
    if (!selectedClassForAttendance) return;
    const classStudents = students.filter(s => s.classId === selectedClassForAttendance);
    const updated: typeof localAttendanceForDir = {};
    classStudents.forEach(student => {
      const record = attendance.find(a => a.studentId === student.id && a.date === attendanceDateForDir);
      if (record) {
        updated[student.id] = { status: record.status, notes: record.notes || '' };
      } else {
        updated[student.id] = { status: 'present', notes: '' };
      }
    });
    setLocalAttendanceForDir(updated);
  }, [selectedClassForAttendance, attendanceDateForDir, attendance, students]);

  React.useEffect(() => {
    if (!transferringStudent) return;
    const matchedClass = classes.find(c => {
      const isGradeMatch = c.grade === transferGrade;
      const sec = c.name.includes('-') 
        ? c.name.split('-')[1]?.trim() 
        : c.name.includes('شعبة') 
          ? c.name.split('شعبة')[1]?.trim() 
          : c.name.replace(c.grade, '').replace('الصف', '').trim();
      const isSecMatch = sec === transferSection;
      return isGradeMatch && isSecMatch;
    });
    if (matchedClass) {
      setTransferTargetClassId(matchedClass.id);
    } else {
      const anyClassInGrade = classes.find(c => c.grade === transferGrade);
      if (anyClassInGrade) {
        setTransferTargetClassId(anyClassInGrade.id);
      }
    }
  }, [transferGrade, transferSection, transferringStudent, classes]);

  const handleSaveAttendanceForDir = () => {
    if (!selectedClassForAttendance) {
      alert('الرجاء تحديد الصف والشعبة أولاً.');
      return;
    }

    const payloads = Object.keys(localAttendanceForDir).map(studentId => {
      const record = localAttendanceForDir[studentId];
      
      // Auto-notify Parent
      const student = students.find(s => s.id === studentId);
      const studentParent = parents.find(p => p.childrenIds.includes(studentId));
      if (student && studentParent) {
        let statusText = '';
        if (record.status === 'present') statusText = 'حاضر';
        else if (record.status === 'absent') statusText = 'غائب ⚠️';
        else if (record.status === 'late') statusText = 'متأخر ⏰';
        else if (record.status === 'excused') statusText = 'غائب بعذر مقبول';

        const messageContent = `📢 [تصنيف الإشعار: حضور وغياب]\nتم تسجيل حالة الحضور والغياب للطالب (${student.name}) لتاريخ اليوم (${attendanceDateForDir}) بواسطة إدارة المدرسة.\nالحالة الموثقة: ${statusText}${record.notes ? `\nملاحظات الإدارة: ${record.notes}` : ''}`;
        
        const newMsg: Message = {
          id: 'msg_att_dir_' + Date.now() + Math.random().toString(36).substring(2, 7),
          senderId: 'director_admin',
          senderName: 'إدارة المدرسة (المدير)',
          senderRole: 'director',
          receiverId: studentParent.id,
          receiverName: studentParent.name,
          receiverRole: 'parent',
          content: messageContent,
          date: new Date().toISOString().split('T')[0] + ' ' + new Date().toTimeString().split(' ')[0].substring(0, 5),
          read: false,
          studentId: student.id
        };
        
        setMessages(prev => [newMsg, ...prev]);

        // Send REST / FCM Push Notification
        sendPushNotificationViaFCM(studentParent.id, `حالة حضور وغياب: ${student.name}`, `الحالة الموثقة: ${statusText}`);
      }

      return {
        studentId,
        date: attendanceDateForDir,
        status: record.status,
        notes: record.notes
      };
    });

    // Save attendance
    setAttendance(prev => {
      const copy = [...prev];
      payloads.forEach(item => {
        const index = copy.findIndex(a => a.studentId === item.studentId && a.date === item.date);
        if (index !== -1) {
          copy[index] = { ...copy[index], status: item.status, notes: item.notes };
        } else {
          copy.push({
            id: 'att_dir_' + Date.now() + Math.random().toString(36).substring(2, 7),
            studentId: item.studentId,
            date: item.date,
            status: item.status,
            notes: item.notes
          });
        }
      });
      return copy;
    });

    alert('تم رصد وحفظ سجل حضور وغياب الطلاب بنجاح! وتم إرسال الإشعارات التلقائية لأولياء أمورهم 📲');
  };

  const handleExportAttendanceToExcel = () => {
    if (!selectedClassForAttendance) return;
    const cls = classes.find(c => c.id === selectedClassForAttendance);
    if (!cls) return;

    const classStudents = students.filter(s => s.classId === selectedClassForAttendance);
    const data = classStudents.map(student => {
      const record = localAttendanceForDir[student.id] || { status: 'present', notes: '' };
      let statusText = 'حاضر';
      if (record.status === 'absent') statusText = 'غائب';
      else if (record.status === 'late') statusText = 'متأخر';
      else if (record.status === 'excused') statusText = 'غياب بعذر';

      return {
        'رقم الطالب': student.rollNo,
        'اسم الطالب': student.name,
        'الصف والشعبة': cls.name,
        'التاريخ': attendanceDateForDir,
        'حالة الحضور': statusText,
        'ملاحظات': record.notes || ''
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'سجل الحضور والغياب');
    XLSX.writeFile(workbook, `سجل_حضور_غياب_${cls.name.replace(/\s+/g, '_')}_${attendanceDateForDir}.xlsx`);
  };

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
  const [teacherSelectedSubjects, setTeacherSelectedSubjects] = useState<string[]>([]);
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
  const triggerClipboardExport = async (title: string, body: string, textToCopy: string) => {
    setClipboardModalTitle(title);
    setClipboardModalBody(body);
    setClipboardModalText(textToCopy);
    setClipboardModalSuccess(false);
    setShowClipboardModal(true);
    
    const copied = await copyToClipboard(textToCopy);
    setClipboardModalSuccess(copied);
  };

  const handleDownloadStudentAffairsTemplate = () => {
    const headers = [
      "الرقم الموحد",
      "اسم الطالب",
      "ولي الأمر",
      "رقم الواتساب"
    ];

    // Filter students based on selectedClassForStudentAffairs
    const classStudents = students.filter(s => selectedClassForStudentAffairs === 'all' || s.classId === selectedClassForStudentAffairs);

    let dataToExport: any[] = [];
    if (classStudents.length > 0) {
      dataToExport = classStudents.map(s => {
        const parent = parents.find(p => p.childrenIds.includes(s.id) || p.id === s.parentId);
        return {
          "الرقم الموحد": s.rollNo,
          "اسم الطالب": s.name,
          "ولي الأمر": s.parentName || parent?.name || `ولي أمر ${s.name}`,
          "رقم الواتساب": parent?.phone || ''
        };
      });
    } else {
      dataToExport = [
        {
          "الرقم الموحد": "1002030401",
          "اسم الطالب": "محمد أحمد العتيبي",
          "ولي الأمر": "أحمد العتيبي",
          "رقم الواتساب": "0501234567"
        }
      ];
    }

    // Create plain text tab-separated string for easy clipboard copy fallback
    const textRows = dataToExport.map(item => [item["الرقم الموحد"], item["اسم الطالب"], item["ولي الأمر"], item["رقم الواتساب"]].join('\t')).join('\n');
    const textToCopy = `${headers.join('\t')}\n${textRows}`;

    try {
      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'نموذج تسجيل الطلاب');
      
      // Set widths
      worksheet['!cols'] = [
        { wch: 22 },
        { wch: 30 },
        { wch: 30 },
        { wch: 22 }
      ];

      const fileName = selectedClassForStudentAffairs === 'all' 
        ? 'كشف_كل_الطلاب.xlsx' 
        : `كشف_أسماء_${(classes.find(c => c.id === selectedClassForStudentAffairs)?.name || 'الصف').replace(/\s+/g, '_')}.xlsx`;

      XLSX.writeFile(workbook, fileName);
      
      // Also copy to clipboard as a helpful fallback for mobile browsers where downloading files inside iframe is blocked
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(textToCopy);
        }
      } catch (e) {
        console.warn("Silent clipboard copy failed", e);
      }
      
      alert(`🎉 تم تصدير ملف Excel بنجاح باسم [${fileName}]!\n📑 تم تصدير عدد ${classStudents.length || 1} صف.\n\n💡 مستخدمي الهواتف: إذا لم يبدأ تحميل الملف تلقائياً بسبب قيود المتصفح، فقد قمنا بنسخ البيانات للحافظة أيضاً! يمكنك الانتقال لتطبيق Excel أو Google Sheets وعمل لصق مباشرة للبدء.`);
    } catch (error) {
      console.error("XLSX write failed, falling back to clipboard", error);
      triggerClipboardExport(
        "📋 نسخ كشف الطلاب لـ Excel",
        "نظراً لأن جهازك أو المتصفح لا يدعم التحميل المباشر للملفات، تم نسخ الكشف تلقائياً لحافظة جهازك! يمكنك الآن الانتقال لتطبيق Excel أو Google Sheets ولصقها مباشرة لتعبئتها.",
        textToCopy
      );
    }
  };

  const handleImportStudentsFromText = (pastedText: string) => {
    if (!pastedText.trim()) {
      alert('الرجاء لصق النص أولاً.');
      return;
    }
    if (!importTargetClassId || importTargetClassId === 'auto') {
      alert('الرجاء اختيار الصف المستهدف للاستيراد أولاً.');
      return;
    }

    const lines = pastedText.split('\n').map(l => l.trim()).filter(Boolean);
    let importedCount = 0;
    let updatedPhoneCount = 0;
    const updatedStudents = [...students];
    const updatedParents = [...parents];

    lines.forEach(line => {
      const cols = line.split(/\t|,/);
      if (cols.length < 2) return;

      const rollNoRaw = cols[0]?.trim();
      const nameRaw = cols[1]?.trim();
      const parentNameRaw = cols[2]?.trim();
      const phoneRaw = cols[3]?.trim();

      if (!rollNoRaw || !nameRaw) return;
      if (rollNoRaw.includes('الرقم الموحد') || nameRaw.includes('اسم الطالب')) return;
      if (rollNoRaw.includes('مثال:') || nameRaw.includes('مثال:')) return;

      const rollNo = String(rollNoRaw);
      const name = String(nameRaw);
      const finalClassId = importTargetClassId;

      const parentName = parentNameRaw ? String(parentNameRaw) : `ولي أمر ${name}`;
      const parentPhone = phoneRaw ? String(phoneRaw) : ('05' + rollNo.padEnd(8, '0').slice(0, 8));

      const existingStudent = updatedStudents.find(s => s.rollNo === rollNo || s.name.trim() === name);
      if (existingStudent) {
        if (phoneRaw) {
          const existingParent = updatedParents.find(p => p.id === existingStudent.parentId || p.childrenIds.includes(existingStudent.id) || p.name === parentName);
          if (existingParent) {
            existingParent.phone = parentPhone;
            updatedPhoneCount++;
          }
        }
        return;
      }

      const studentId = 's_pst_' + Date.now() + Math.random().toString(36).substring(2, 7);
      const parentId = 'p_pst_' + Date.now() + Math.random().toString(36).substring(2, 7);
      const parentEmail = `${parentName.replace(/\s+/g, '') || 'parent'}@school.edu`;

      let finalParentId = parentId;
      const existingParent = updatedParents.find(p => p.name === parentName);
      if (existingParent) {
        finalParentId = existingParent.id;
        if (phoneRaw) {
          existingParent.phone = parentPhone;
        }
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
        classId: finalClassId,
        parentId: finalParentId,
        rollNo: rollNo,
        gender: 'male',
        dob: '2018-01-01',
        parentName: parentName,
        shift: activeCohort === 'evening' ? 'evening' : 'morning'
      });

      importedCount++;
    });

    if (importedCount > 0 || updatedPhoneCount > 0) {
      setStudents(updatedStudents);
      setParents(updatedParents);
      localStorage.setItem('school_students', JSON.stringify(updatedStudents));
      localStorage.setItem('school_parents', JSON.stringify(updatedParents));
      setPastedStudentData('');
      setShowPastedStudentInput(false);
      let msg = `🎉 تم استيراد عدد ${importedCount} طالب بنجاح وتوزيعهم على الصف المحدد!`;
      if (updatedPhoneCount > 0) {
        msg += `\n📲 وتم تحديث أرقام الواتساب لـ ${updatedPhoneCount} طالب مسجل مسبقاً.`;
      }
      alert(msg);
    } else {
      alert('لم يتم العثور على أي بيانات طلاب جديدة. يرجى التأكد من أن التنسيق يحتوي على: الرقم الموحد | اسم الطالب | ولي الأمر | رقم الواتساب.');
    }
  };

  const handleImportStudentsExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!importTargetClassId || importTargetClassId === 'auto') {
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
        let skippedCount = 0;
        let updatedPhoneCount = 0;
        const skippedNames: string[] = [];
        const updatedStudents = [...students];
        const updatedParents = [...parents];

        // Helper to flexibly find column value in row regardless of spacing or column variations
        const getRowVal = (rowObj: any, keywords: string[]): string | undefined => {
          if (!rowObj || typeof rowObj !== 'object') return undefined;
          for (const [k, v] of Object.entries(rowObj)) {
            if (v === undefined || v === null) continue;
            const valStr = String(v).trim();
            if (!valStr) continue;
            const cleanKey = k.trim().replace(/\s+/g, ' ').toLowerCase();
            for (const kw of keywords) {
              const cleanKw = kw.trim().toLowerCase();
              if (cleanKey === cleanKw || cleanKey.includes(cleanKw)) {
                return valStr;
              }
            }
          }
          return undefined;
        };

        jsonRows.forEach(row => {
          const nameVal = getRowVal(row, ['اسم الطالب', 'الاسم', 'اسم الطالب الثلاثي', 'اسم الطالب الرباعي', 'اسم التلميذ', 'student name', 'name']);
          if (!nameVal) return;
          const nameStr = nameVal.trim();
          if (nameStr.includes('مثال:')) return;
          
          const rollNoVal = getRowVal(row, ['الرقم الموحد', 'رقم القيد', 'رقم الطالب', 'الرقم الأكاديمي', 'المعرف الموحد', 'رقم الهوية', 'roll no', 'id']);
          const rollNo = String(rollNoVal !== undefined ? rollNoVal : Math.floor(100000 + Math.random() * 900000)).trim();
          if (rollNo.includes('مثال:')) return;
          
          const parentNameVal = getRowVal(row, ['ولي الأمر', 'اسم ولي الأمر', 'اسم الاب', 'اسم أب', 'parent name', 'parent']);
          const parentName = parentNameVal ? parentNameVal.trim() : `ولي أمر ${nameStr}`;
          if (parentName.includes('مثال:')) return;

          const rawPhone = getRowVal(row, ['رقم الواتساب', 'الواتساب', 'رقم الواتس اب', 'رقم الواتس', 'واتساب', 'واتس', 'رقم الجوال', 'الجوال', 'رقم الهاتف', 'الهاتف', 'موبايل', 'رقم التواصل', 'هاتف ولي الأمر', 'جوال ولي الأمر', 'phone', 'whatsapp', 'mobile', 'tel']);
          const parentPhone = rawPhone && rawPhone.trim() !== '' 
            ? rawPhone.trim() 
            : ('05' + rollNo.padEnd(8, '0').slice(0, 8));

          // Check if student with same rollNo or same name already exists
          const existingStudent = updatedStudents.find(s => s.rollNo === rollNo || s.name.trim() === nameStr);

          if (existingStudent) {
            if (rawPhone) {
              const existingParent = updatedParents.find(p => p.id === existingStudent.parentId || p.childrenIds.includes(existingStudent.id) || p.name === parentName);
              if (existingParent) {
                existingParent.phone = parentPhone;
                updatedPhoneCount++;
              }
            }
            skippedCount++;
            if (skippedNames.length < 5) {
              skippedNames.push(nameStr);
            }
            return;
          }

          const gender = 'male';
          const dob = '2018-01-01';
          const parentEmail = `${parentName.replace(/\s+/g, '')}@school.edu`;
          const finalClassId = importTargetClassId;
          
          const parentId = 'p_imp_' + Date.now() + Math.random().toString(36).substring(2, 7);
          const studentId = 's_imp_' + Date.now() + Math.random().toString(36).substring(2, 7);
          
          let finalParentId = parentId;
          const existingParent = updatedParents.find(p => p.name === parentName);
          if (existingParent) {
            finalParentId = existingParent.id;
            if (rawPhone) {
              existingParent.phone = parentPhone;
            }
            if (!existingParent.childrenIds.includes(studentId)) {
              existingParent.childrenIds.push(studentId);
            }
          } else {
            updatedParents.push({
              id: parentId,
              name: parentName,
              email: parentEmail,
              phone: parentPhone,
              childrenIds: [studentId]
            });
          }
          
          updatedStudents.push({
            id: studentId,
            name: nameStr,
            classId: finalClassId,
            parentId: finalParentId,
            rollNo: rollNo,
            gender: gender,
            dob: dob,
            parentName: parentName,
            shift: activeCohort === 'evening' ? 'evening' : 'morning'
          });
          
          importedCount++;
        });
        
        if (importedCount > 0 || updatedPhoneCount > 0) {
          setStudents(updatedStudents);
          setParents(updatedParents);
          localStorage.setItem('school_students', JSON.stringify(updatedStudents));
          localStorage.setItem('school_parents', JSON.stringify(updatedParents));
          e.target.value = '';
          
          let msg = `🎉 تم استيراد عدد ${importedCount} طالب بنجاح وتوزيعهم على الصف المحدد! ✅`;
          if (updatedPhoneCount > 0) {
            msg += `\n📲 وتم تحديث أرقام الواتساب لـ ${updatedPhoneCount} طالب مسجل مسبقاً!`;
          }
          if (skippedCount > 0) {
            msg += `\n⚠️ (تم تخطي ${skippedCount} طالب مكررين ومسجلين مسبقاً)`;
          }
          alert(msg);
        } else {
          if (skippedCount > 0) {
            alert(`⚠️ تنبيه: لم يتم استيراد أي طالب لأن كل الطلاب في ملف الإكسل (${skippedCount} طالب) مسجلون بالفعل في النظام مسبقاً!`);
          } else {
            alert('لم يتم العثور على أي بيانات طلاب صالحة في ملف Excel.');
          }
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
    
    const uniqueSubjects = customSubjects && customSubjects.length > 0 
      ? customSubjects 
      : ['الرياضيات', 'العلوم', 'اللغة العربية', 'التربية الإسلامية', 'اللغة الإنجليزية', 'الاجتماعيات'];

    const headers = ['رقم الطالب', 'اسم الطالب', 'الصف', ...uniqueSubjects, 'المعدل', 'التقدير', 'توجيهات المعلم', 'توجيهات الإدارة'];

    const data = classStudents.map(s => {
      const row: any = {
        'رقم الطالب': s.rollNo,
        'اسم الطالب': s.name,
        'الصف': cls.name
      };
      uniqueSubjects.forEach(sub => {
        row[sub] = '';
      });
      row['المعدل'] = '';
      row['التقدير'] = '';
      row['توجيهات المعلم'] = '';
      row['توجيهات الإدارة'] = '';
      return row;
    });

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
      
      const uniqueSubjects = customSubjects && customSubjects.length > 0 
        ? customSubjects 
        : ['الرياضيات', 'العلوم', 'اللغة العربية', 'التربية الإسلامية', 'اللغة الإنجليزية', 'الاجتماعيات'];

      // Parse headers from the first line
      const firstLine = lines[0];
      const headers = firstLine.split(/\t|,/).map(h => h.trim());
      
      // Determine columns mapping
      const rollNoIdx = headers.findIndex(h => {
        const clean = h.trim();
        return clean.includes('رقم الطالب') || clean.includes('رقم القيد') || clean.includes('الرقم الموحد') || clean.includes('الرقم') || clean === 'rollNo';
      });

      let teacherColIdx = -1;
      let directorColIdx = -1;

      headers.forEach((h, hIdx) => {
        const clean = h.trim();
        if (clean === 'توجيهات المعلم' || clean === 'توجيهات معلم' || clean === 'توجيهات المعلمين' || clean === 'ملاحظات المعلم' || clean === 'ملاحظات المعلمين' || clean === 'توجيه المعلم' || clean === 'تقرير المعلم' || clean === 'سلوك الطالب' || clean === 'السلوك') {
          teacherColIdx = hIdx;
        }
        if (clean === 'توجيهات الإدارة' || clean === 'توجيهات الادارة' || clean === 'توجيهات إدارية' || clean === 'ملاحظات الإدارة' || clean === 'ملاحظات الادارة' || clean === 'توجيهات المدير' || clean === 'توجيهات مدير' || clean === 'ملاحظات المدير' || clean === 'توجيه المدير' || clean === 'التقييم الشهري' || clean === 'التقييم') {
          directorColIdx = hIdx;
        }
      });
      
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

        const teacherVal = teacherColIdx !== -1 ? cols[teacherColIdx] : undefined;
        const directorVal = directorColIdx !== -1 ? cols[directorColIdx] : undefined;

        if ((teacherVal !== undefined && teacherVal !== '') || (directorVal !== undefined && directorVal !== '')) {
          const evalKey = `${student.id}_${currentEvaluationMonth}`;
          const existing = newMonthlyEvaluations[evalKey] || newMonthlyEvaluations[student.id];
          const tText = teacherVal !== undefined ? teacherVal.trim() : (existing?.teacherText || existing?.text || '');
          const dText = directorVal !== undefined ? directorVal.trim() : (existing?.directorText || '');

          newMonthlyEvaluations[evalKey] = {
            month: currentEvaluationMonth,
            teacherText: tText,
            directorText: dText,
            text: tText
          };
          newMonthlyEvaluations[student.id] = newMonthlyEvaluations[evalKey];
          behaviorUpdatedCount++;
        }

        // Find and update grades for each subject found in the headers
        headers.forEach((h, hIdx) => {
          if (hIdx === rollNoIdx || hIdx === teacherColIdx || hIdx === directorColIdx) return;
          const colValue = cols[hIdx];
          if (colValue === undefined || colValue === '') return;

          const matchedSub = uniqueSubjects.find(sub => sub.trim() === h.trim());
          if (matchedSub) {
            const score = parseFloat(colValue) || 0;
            const existingIdx = newGradesList.findIndex(g => 
              g.studentId === student.id && 
              g.subject === matchedSub && 
              g.examName === currentEvaluationMonth
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
                subject: matchedSub,
                examName: currentEvaluationMonth,
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
        
        const uniqueSubjects = customSubjects && customSubjects.length > 0 
          ? customSubjects 
          : ['الرياضيات', 'العلوم', 'اللغة العربية', 'التربية الإسلامية', 'اللغة الإنجليزية', 'الاجتماعيات'];
        
        jsonRows.forEach(row => {
          const rowKeys = Object.keys(row);
          
          // Find student roll no trim-safely
          let rollNo = '';
          const rollNoKey = rowKeys.find(k => {
            const clean = k.trim();
            return clean === 'رقم الطالب' || clean === 'رقم القيد' || clean === 'الرقم الموحد' || clean === 'الرقم' || clean === 'rollNo';
          });
          
          if (rollNoKey) {
            rollNo = String(row[rollNoKey]).trim();
          }
          
          if (!rollNo) return;
          
          const student = students.find(s => s.rollNo === rollNo || s.id === rollNo);
          if (!student) return;
          
          // Check for student teacher & director directives columns
          const teacherKey = rowKeys.find(k => {
            const clean = k.trim();
            return clean === 'توجيهات المعلم' || clean === 'توجيهات معلم' || clean === 'توجيهات المعلمين' || clean === 'ملاحظات المعلم' || clean === 'ملاحظات المعلمين' || clean === 'توجيه المعلم' || clean === 'تقرير المعلم' || clean === 'سلوك الطالب' || clean === 'السلوك';
          });
          const directorKey = rowKeys.find(k => {
            const clean = k.trim();
            return clean === 'توجيهات الإدارة' || clean === 'توجيهات الادارة' || clean === 'توجيهات إدارية' || clean === 'ملاحظات الإدارة' || clean === 'ملاحظات الادارة' || clean === 'توجيهات المدير' || clean === 'توجيهات مدير' || clean === 'ملاحظات المدير' || clean === 'توجيه المدير' || clean === 'التقييم الشهري' || clean === 'التقييم';
          });

          const teacherVal = teacherKey !== undefined ? row[teacherKey] : undefined;
          const directorVal = directorKey !== undefined ? row[directorKey] : undefined;

          if ((teacherVal !== undefined && String(teacherVal).trim() !== '') || (directorVal !== undefined && String(directorVal).trim() !== '')) {
            const evalKey = `${student.id}_${currentEvaluationMonth}`;
            const existing = newMonthlyEvaluations[evalKey] || newMonthlyEvaluations[student.id];
            const tText = teacherVal !== undefined ? String(teacherVal).trim() : (existing?.teacherText || existing?.text || '');
            const dText = directorVal !== undefined ? String(directorVal).trim() : (existing?.directorText || '');

            newMonthlyEvaluations[evalKey] = {
              month: currentEvaluationMonth,
              teacherText: tText,
              directorText: dText,
              text: tText
            };
            newMonthlyEvaluations[student.id] = newMonthlyEvaluations[evalKey];
            behaviorUpdatedCount++;
          }
          
          uniqueSubjects.forEach(sub => {
            const matchingKey = rowKeys.find(k => k.trim() === sub.trim());
            if (matchingKey && row[matchingKey] !== undefined && row[matchingKey] !== '') {
              const score = parseFloat(row[matchingKey]) || 0;
              
              const existingIdx = newGradesList.findIndex(g => 
                g.studentId === student.id && 
                g.subject === sub && 
                g.examName === currentEvaluationMonth
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
                  examName: currentEvaluationMonth,
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
            localStorage.setItem('school_grades', JSON.stringify(newGradesList));
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

  const handleAddNewMonth = (nameToUse?: string) => {
    const targetName = nameToUse !== undefined ? nameToUse : newMonthName;
    const trimmed = targetName.trim();
    if (!trimmed) return;
    if (!savedEvaluationMonths.includes(trimmed)) {
      const updated = [...savedEvaluationMonths, trimmed];
      setSavedEvaluationMonths(updated);
      localStorage.setItem('school_saved_evaluation_months', JSON.stringify(updated));
    }
    setCurrentEvaluationMonth(trimmed);
    localStorage.setItem('school_evaluation_current_month', trimmed);
    setIsAddingNewMonth(false);
  };

  const handleSaveAndSendGradesToParents = () => {
    if (!selectedClassForGrades) {
      alert('الرجاء اختيار الصف الدراسي أولاً.');
      return;
    }
    const cls = classes.find(c => c.id === selectedClassForGrades);
    if (!cls) return;

    const classStudents = students.filter(s => s.classId === selectedClassForGrades);
    if (classStudents.length === 0) {
      alert('لا يوجد طلاب في هذا الصف لحفظ نتائجهم.');
      return;
    }

    // Save grades explicitly to local storage
    localStorage.setItem('school_grades', JSON.stringify(grades));

    alert(`🚀 تم حفظ وتوثيق كشف الدرجات لشهر (${currentEvaluationMonth}) بنجاح! يمكن لجميع أولياء الأمور الآن الاطلاع على كشف الدرجات والشهادة الأكاديمية مباشرة من حساباتهم دون إرسال إشعارات تشويشية. ✅`);
  };

  const handleExportGradesExcel = () => {
    if (!selectedClassForGrades) {
      alert('الرجاء اختيار الصف أولاً لتصدير درجاته.');
      return;
    }
    const cls = classes.find(c => c.id === selectedClassForGrades);
    if (!cls) return;
    
    const classStudents = students.filter(s => s.classId === selectedClassForGrades);
    const uniqueSubjects = customSubjects && customSubjects.length > 0 
      ? customSubjects 
      : ['الرياضيات', 'العلوم', 'اللغة العربية', 'التربية الإسلامية', 'اللغة الإنجليزية', 'الاجتماعيات'];

    const headers = ['رقم الطالب', 'اسم الطالب', 'الصف', ...uniqueSubjects, 'المعدل', 'التقدير', 'توجيهات المعلم', 'توجيهات الإدارة'];
    
    const data = classStudents.map(s => {
      const studentGrades = grades.filter(g => g.studentId === s.id && g.examName === currentEvaluationMonth);
      const evalForMonth = monthlyEvaluations[`${s.id}_${currentEvaluationMonth}`] || 
        (monthlyEvaluations[s.id]?.month === currentEvaluationMonth ? monthlyEvaluations[s.id] : null);

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
      
      row['توجيهات المعلم'] = evalForMonth?.teacherText !== undefined ? evalForMonth.teacherText : (evalForMonth?.text || '');
      row['توجيهات الإدارة'] = evalForMonth?.directorText || '';

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

    // 3. Confirm with user via confirmAndExecute modal
    confirmAndExecute(
      `⚠️ تنبيه هام للغاية: حذف الطلاب من ${scopeLabel}`,
      `أنت على وشك حذف عدد (${targetStudents.length}) طالب/طالبة نهائياً من ${scopeLabel}.\nسيؤدي هذا الإجراء أيضاً إلى حذف كافة درجاتهم وسجلات حضورهم وأعذارهم وحسابات أولياء أمورهم غير المرتبطين بأبناء آخرين. لا يمكن التراجع عن هذه الخطوة!`,
      () => {
        const studentIdsToDelete = targetStudents.map(s => s.id);

        // 4. Perform filtering (deleting) on states
        setStudents(prev => prev.filter(s => !studentIdsToDelete.includes(s.id)));
        setGrades(prev => prev.filter(g => !studentIdsToDelete.includes(g.studentId)));
        setAttendance(prev => prev.filter(a => !studentIdsToDelete.includes(a.studentId)));
        setExcuses(prev => prev.filter(e => !studentIdsToDelete.includes(e.studentId)));
        setMessages(prev => prev.filter(m => !m.studentId || !studentIdsToDelete.includes(m.studentId)));

        setParents(prev => {
          return prev
            .map(parent => ({
              ...parent,
              childrenIds: parent.childrenIds.filter(cid => !studentIdsToDelete.includes(cid))
            }))
            .filter(parent => parent.childrenIds.length > 0);
        });

        // 5. Success feedback and clear inputs
        alert(`🎉 تم بنجاح حذف (${targetStudents.length}) طالب وكافة بياناتهم وسجلاتهم المرتبطة نهائياً من النظام لسهولة العمل.`);
        setDeleteConfirmationText('');
        setSelectedGradeForDelete('');
        setSelectedClassIdForDelete('');
      }
    );
  };

  const handleDeleteSingleItem = (category: 'students' | 'teachers' | 'announcements' | 'messages' | 'excuses' | 'classes' | 'grades' | 'attendance', itemId: string) => {
    if (category === 'students') {
      const student = students.find(s => s.id === itemId);
      if (!student) return;
      confirmAndExecute(
        '⚠️ حذف الطالب نهائياً من النظام',
        `هل أنت متأكد من حذف الطالب (${student.name}) نهائياً من النظام؟ سيؤدي ذلك لحذف كافة درجاته، سجلات غيابه وحضوره، وأعذاره الطبية أيضاً. لا يمكن التراجع عن هذه الخطوة!`,
        () => {
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
        }
      );
    } else if (category === 'teachers') {
      const teacher = teachers.find(t => t.id === itemId);
      if (!teacher) return;
      confirmAndExecute(
        '⚠️ حذف المعلم نهائياً',
        `هل أنت متأكد من حذف المعلم (${teacher.name}) نهائياً من النظام وسحب كافة الصلاحيات التعليمية الممنوحة له؟`,
        () => {
          const updated = teachers.filter(t => t.id !== itemId);
          setTeachers(updated);
          localStorage.setItem('school_teachers', JSON.stringify(updated));
          alert(`✅ تم حذف المعلم (${teacher.name}) بنجاح.`);
        }
      );
    } else if (category === 'announcements') {
      const ann = announcements.find(a => a.id === itemId);
      if (!ann) return;
      confirmAndExecute(
        '⚠️ حذف الإعلان/التعميم',
        'هل أنت متأكد من حذف هذا التعميم/الإعلان نهائياً من لوحة إعلانات المنصة؟',
        () => {
          const updated = announcements.filter(a => a.id !== itemId);
          setAnnouncements(updated);
          localStorage.setItem('school_announcements', JSON.stringify(updated));
          alert(`✅ تم حذف الإعلان بنجاح.`);
        }
      );
    } else if (category === 'messages') {
      const msg = messages.find(m => m.id === itemId);
      if (!msg) return;
      confirmAndExecute(
        '⚠️ حذف الرسالة',
        'هل أنت متأكد من حذف هذه الرسالة نهائياً من صندوق المحادثات؟',
        () => {
          const updated = messages.filter(m => m.id !== itemId);
          setMessages(updated);
          localStorage.setItem('school_messages', JSON.stringify(updated));
          alert(`✅ تم حذف الرسالة بنجاح.`);
        }
      );
    } else if (category === 'excuses') {
      const exc = excuses.find(e => e.id === itemId);
      if (!exc) return;
      confirmAndExecute(
        '⚠️ حذف العذر الطبي',
        'هل أنت متأكد من حذف طلب العذر هذا نهائياً من سجلات المدرسة؟',
        () => {
          const updated = excuses.filter(e => e.id !== itemId);
          setExcuses(updated);
          localStorage.setItem('school_excuses', JSON.stringify(updated));
          alert(`✅ تم حذف العذر الطبي بنجاح.`);
        }
      );
    } else if (category === 'classes') {
      const cls = classes.find(c => c.id === itemId);
      if (!cls) return;
      confirmAndExecute(
        '⚠️ حذف الصف/الشعبة',
        `هل أنت متأكد من حذف الصف/الشعبة (${cls.name})؟ سيتم إلغاء تعيين أي طلاب أو معلمين منتسبين لها وتصفير انتساباتهم بالكامل.`,
        () => {
          const updated = classes.filter(c => c.id !== itemId);
          setClasses(updated);
          localStorage.setItem('school_classes', JSON.stringify(updated));
          alert(`✅ تم حذف الصف/الشعبة بنجاح.`);
        }
      );
    } else if (category === 'grades') {
      const gd = grades.find(g => g.id === itemId);
      if (!gd) return;
      confirmAndExecute(
        '⚠️ حذف سجل الدرجة',
        'هل أنت متأكد من حذف سجل رصد هذه الدرجة نهائياً من الشهادات والتقارير المدرسية؟',
        () => {
          const updated = grades.filter(g => g.id !== itemId);
          setGrades(updated);
          localStorage.setItem('school_grades', JSON.stringify(updated));
          alert(`✅ تم حذف سجل الدرجة بنجاح.`);
        }
      );
    } else if (category === 'attendance') {
      const att = attendance.find(a => a.id === itemId);
      if (!att) return;
      const studName = students.find(s => s.id === att.studentId)?.name || 'طالب مجهول';
      confirmAndExecute(
        '⚠️ حذف سجل التحضير/الغياب',
        `هل أنت متأكد من حذف سجل التحضير للطالب (${studName}) بتاريخ (${att.date}) نهائياً؟`,
        () => {
          const updated = attendance.filter(a => a.id !== itemId);
          setAttendance(updated);
          localStorage.setItem('school_attendance', JSON.stringify(updated));
          alert(`✅ تم حذف سجل التحضير بنجاح.`);
        }
      );
    }
  };

  const handleBulkDeleteCategory = (category: 'students' | 'teachers' | 'announcements' | 'messages' | 'excuses' | 'classes' | 'grades' | 'attendance') => {
    let label = '';
    const cohortBadge = activeCohort === 'evening' ? ' [الفوج المسائي 🌙]' : activeCohort === 'morning' ? ' [الفوج الصباحي ☀️]' : ' [جميع الأفواج 🏫]';

    if (category === 'students') label = 'كافة الطلاب وأولياء أمورهم ودرجاتهم وغيابهم' + cohortBadge;
    else if (category === 'teachers') label = 'كافة المعلمين المسجلين' + cohortBadge;
    else if (category === 'announcements') label = 'كافة الإعلانات والتعاميم المدرسية' + cohortBadge;
    else if (category === 'messages') label = 'كافة الرسائل والإشعارات' + cohortBadge;
    else if (category === 'excuses') label = 'كافة طلبات وأعذار الغياب المرفوعة' + cohortBadge;
    else if (category === 'classes') label = 'كافة الصفوف والشعب المدرسية' + cohortBadge;
    else if (category === 'grades') label = 'كافة درجات وعلامات الطلاب المترصدة' + cohortBadge;
    else if (category === 'attendance') label = 'كافة سجلات الحضور والغياب اليومي' + cohortBadge;

    if (bulkDeleteConfirmation.trim() && !isBulkDeleteConfirmationValid(bulkDeleteConfirmation)) {
      alert("يرجى كتابة العبارة 'تأكيد الحذف' بدقة لتنفيذ تصفير الفئة.");
      return;
    }

    confirmAndExecute(
      `🚨🚨🚨 تحذير أمني وتأكيد تفريغ السجلات!`,
      `هل أنت متأكد تماماً وبشكل قاطع من رغبتك في تفريغ وتصفير (${label}) بالكامل؟\nملاحظة: يتم مسح فقط بيانات الفوج المختار دون تأثير على الفوج الآخر.`,
      () => {
        if (category === 'students') {
          const remainingStudents = students.filter(s => !matchesCohort(s));
          const removedIds = students.filter(s => matchesCohort(s)).map(s => s.id);
          
          setStudents(remainingStudents);
          localStorage.setItem('school_students', JSON.stringify(remainingStudents));
          window.dispatchEvent(new CustomEvent('school_storage_update', { detail: { key: 'school_students', value: JSON.stringify(remainingStudents) } }));
          
          const remainingGrades = grades.filter(g => !removedIds.includes(g.studentId));
          setGrades(remainingGrades);
          localStorage.setItem('school_grades', JSON.stringify(remainingGrades));
          window.dispatchEvent(new CustomEvent('school_storage_update', { detail: { key: 'school_grades', value: JSON.stringify(remainingGrades) } }));
          
          const remainingExcuses = excuses.filter(e => !removedIds.includes(e.studentId));
          setExcuses(remainingExcuses);
          localStorage.setItem('school_excuses', JSON.stringify(remainingExcuses));
          window.dispatchEvent(new CustomEvent('school_storage_update', { detail: { key: 'school_excuses', value: JSON.stringify(remainingExcuses) } }));
          
          const remainingAttendance = attendance.filter(a => !removedIds.includes(a.studentId));
          setAttendance(remainingAttendance);
          localStorage.setItem('school_attendance', JSON.stringify(remainingAttendance));
          window.dispatchEvent(new CustomEvent('school_storage_update', { detail: { key: 'school_attendance', value: JSON.stringify(remainingAttendance) } }));
          
          const remainingParents = parents.map(p => ({
            ...p,
            childrenIds: p.childrenIds.filter(cid => !removedIds.includes(cid))
          })).filter(p => p.childrenIds.length > 0);
          setParents(remainingParents);
          localStorage.setItem('school_parents', JSON.stringify(remainingParents));
          window.dispatchEvent(new CustomEvent('school_storage_update', { detail: { key: 'school_parents', value: JSON.stringify(remainingParents) } }));
        } else if (category === 'teachers') {
          const remaining = teachers.filter(t => !matchesCohort(t));
          setTeachers(remaining);
          localStorage.setItem('school_teachers', JSON.stringify(remaining));
          window.dispatchEvent(new CustomEvent('school_storage_update', { detail: { key: 'school_teachers', value: JSON.stringify(remaining) } }));
        } else if (category === 'announcements') {
          const remaining = announcements.filter(a => !matchesCohort(a));
          setAnnouncements(remaining);
          localStorage.setItem('school_announcements', JSON.stringify(remaining));
          window.dispatchEvent(new CustomEvent('school_storage_update', { detail: { key: 'school_announcements', value: JSON.stringify(remaining) } }));
        } else if (category === 'messages') {
          const remaining = messages.filter(m => !matchesCohort(m));
          setMessages(remaining);
          localStorage.setItem('school_messages', JSON.stringify(remaining));
          window.dispatchEvent(new CustomEvent('school_storage_update', { detail: { key: 'school_messages', value: JSON.stringify(remaining) } }));
        } else if (category === 'excuses') {
          const remaining = excuses.filter(e => !matchesCohort(e));
          setExcuses(remaining);
          localStorage.setItem('school_excuses', JSON.stringify(remaining));
          window.dispatchEvent(new CustomEvent('school_storage_update', { detail: { key: 'school_excuses', value: JSON.stringify(remaining) } }));
        } else if (category === 'classes') {
          const remaining = classes.filter(c => !matchesCohort(c));
          setClasses(remaining);
          localStorage.setItem('school_classes', JSON.stringify(remaining));
          window.dispatchEvent(new CustomEvent('school_storage_update', { detail: { key: 'school_classes', value: JSON.stringify(remaining) } }));
        } else if (category === 'grades') {
          const remaining = grades.filter(g => !matchesCohort(g));
          setGrades(remaining);
          localStorage.setItem('school_grades', JSON.stringify(remaining));
          window.dispatchEvent(new CustomEvent('school_storage_update', { detail: { key: 'school_grades', value: JSON.stringify(remaining) } }));
        } else if (category === 'attendance') {
          const remaining = attendance.filter(a => !matchesCohort(a));
          setAttendance(remaining);
          localStorage.setItem('school_attendance', JSON.stringify(remaining));
          window.dispatchEvent(new CustomEvent('school_storage_update', { detail: { key: 'school_attendance', value: JSON.stringify(remaining) } }));
        }

        setBulkDeleteConfirmation('');
        alert(`🎉 تم بنجاح تفريغ وتصفير سجلات ${label}!`);
      }
    );
  };

  const getFilteredPurgeItems = () => {
    const query = deleteSearchQuery.toLowerCase().trim();
    switch (targetDeleteCategory) {
      case 'students':
        return students.filter(s => 
          matchesCohort(s) && (
            !query || 
            s.name.toLowerCase().includes(query) || 
            (classes.find(c => c.id === s.classId)?.name || '').toLowerCase().includes(query)
          )
        );
      case 'teachers':
        return teachers.filter(t => 
          matchesCohort(t) && (
            !query || 
            t.name.toLowerCase().includes(query) || 
            t.subjects.some(sub => sub.toLowerCase().includes(query))
          )
        );
      case 'announcements':
        return announcements.filter(a => 
          matchesCohort(a) && (
            !query || 
            a.title.toLowerCase().includes(query) || 
            a.content.toLowerCase().includes(query)
          )
        );
      case 'messages':
        return messages.filter(m => 
          matchesCohort(m) && (
            !query || 
            m.content.toLowerCase().includes(query) || 
            m.senderName.toLowerCase().includes(query)
          )
        );
      case 'excuses':
        return excuses.filter(e => {
          const stud = students.find(s => s.id === e.studentId);
          return matchesCohort(e) && (
            !query || 
            (stud?.name || '').toLowerCase().includes(query) || 
            e.reason.toLowerCase().includes(query)
          );
        });
      case 'classes':
        return classes.filter(c => 
          matchesCohort(c) && (
            !query || 
            c.name.toLowerCase().includes(query) || 
            c.grade.toLowerCase().includes(query)
          )
        );
      case 'grades':
        return grades.filter(g => {
          const stud = students.find(s => s.id === g.studentId);
          return matchesCohort(g) && (
            !query || 
            (stud?.name || '').toLowerCase().includes(query) || 
            g.subject.toLowerCase().includes(query)
          );
        });
      case 'attendance':
        return attendance.filter(a => {
          const stud = students.find(s => s.id === a.studentId);
          return matchesCohort(a) && (
            !query || 
            (stud?.name || '').toLowerCase().includes(query) || 
            a.date.toLowerCase().includes(query) ||
            a.status.toLowerCase().includes(query)
          );
        });
      default:
        return [];
    }
  };

  const handleDeleteAllAppData = () => {
    confirmAndExecute(
      `⚠️ تحذير أمني خطير وعاجل جداً!`,
      `أنت تقوم الآن بـ "تصفير وحذف كامل بيانات التطبيق" بالكامل.\nسيشمل هذا الإجراء حذف:\n1. جميع المعلمين المسجلين وبياناتهم وكلمات مرورهم.\n2. جميع الطلاب المسجلين وشعبهم ودرجاتهم.\n3. جميع أولياء الأمور وحساباتهم.\n4. جميع الصفوف والصفوف الدراسية بالكامل.\n\nهل تريد بالتأكيد تصفير المنصة وحذف كل شيء نهائياً للبدء بصفحة جديدة؟`,
      () => {
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

        ['school_teachers', 'school_classes', 'school_parents', 'school_students', 'school_attendance', 'school_grades', 'school_announcements', 'school_messages', 'school_excuses'].forEach(key => {
          window.dispatchEvent(new CustomEvent('school_storage_update', { detail: { key, value: JSON.stringify([]) } }));
        });

        alert('🎉 تم بنجاح تصفير المنصة وحذف كافة البيانات والملفات والصفوف بالكامل! التطبيق جاهز الآن للبدء من جديد.');
      }
    );
  };

  const handleQuickDeleteCohort = (cohortTarget?: 'morning' | 'evening' | 'all') => {
    const targetShift = cohortTarget || (activeCohort === 'all' ? 'evening' : activeCohort);
    const matchesTarget = (item: { shift?: 'morning' | 'evening' }) => {
      if (targetShift === 'all') return true;
      const itemShift = item.shift || 'morning';
      return itemShift === targetShift;
    };

    const cohortLabel = targetShift === 'evening' ? 'الفوج المسائي 🌙' : targetShift === 'morning' ? 'الفوج الصباحي ☀️' : 'جميع الأفواج 🏫';

    const cohortStudents = students.filter(matchesTarget);
    const cohortTeachers = teachers.filter(matchesTarget);
    const cohortClasses = classes.filter(matchesTarget);

    confirmAndExecute(
      `🚨🚨🚨 تحذير أمني وتأكيد تصفير الفوج!`,
      `هل أنت متأكد تماماً وبشكل قاطع من رغبتك في تصفير وتفريغ (${cohortLabel}) بالكامل؟\n\nسيتم حذف كافة بياناته المخصصة:\n- جميع الطلاب (${cohortStudents.length} طالب)\n- جميع المعلمين (${cohortTeachers.length} معلم)\n- جميع الصفوف والشعب (${cohortClasses.length} صف)\n- كافة الدرجات، سجلات الغياب، الأعذار، الإعلانات والرسائل.\n\nلاحظ أن بيانات الفوج الآخر لن تتأثر مطلقاً!`,
      () => {
        const studentIds = cohortStudents.map(s => s.id);

        // 1. Remove students
        const updatedStudents = students.filter(s => !matchesTarget(s));
        setStudents(updatedStudents);
        localStorage.setItem('school_students', JSON.stringify(updatedStudents));
        window.dispatchEvent(new CustomEvent('school_storage_update', { detail: { key: 'school_students', value: JSON.stringify(updatedStudents) } }));

        // 2. Remove teachers
        const updatedTeachers = teachers.filter(t => !matchesTarget(t));
        setTeachers(updatedTeachers);
        localStorage.setItem('school_teachers', JSON.stringify(updatedTeachers));
        window.dispatchEvent(new CustomEvent('school_storage_update', { detail: { key: 'school_teachers', value: JSON.stringify(updatedTeachers) } }));

        // 3. Remove classes
        const updatedClasses = classes.filter(c => !matchesTarget(c));
        setClasses(updatedClasses);
        localStorage.setItem('school_classes', JSON.stringify(updatedClasses));
        window.dispatchEvent(new CustomEvent('school_storage_update', { detail: { key: 'school_classes', value: JSON.stringify(updatedClasses) } }));

        // 4. Remove announcements
        const updatedAnnounce = announcements.filter(a => !matchesTarget(a));
        setAnnouncements(updatedAnnounce);
        localStorage.setItem('school_announcements', JSON.stringify(updatedAnnounce));
        window.dispatchEvent(new CustomEvent('school_storage_update', { detail: { key: 'school_announcements', value: JSON.stringify(updatedAnnounce) } }));

        // 5. Remove grades, attendance, excuses, messages
        setGrades(prev => {
          const updated = prev.filter(g => !studentIds.includes(g.studentId) && !matchesTarget(g));
          localStorage.setItem('school_grades', JSON.stringify(updated));
          return updated;
        });

        setAttendance(prev => {
          const updated = prev.filter(a => !studentIds.includes(a.studentId) && !matchesTarget(a));
          localStorage.setItem('school_attendance', JSON.stringify(updated));
          return updated;
        });

        setExcuses(prev => {
          const updated = prev.filter(e => !studentIds.includes(e.studentId) && !matchesTarget(e));
          localStorage.setItem('school_excuses', JSON.stringify(updated));
          return updated;
        });

        setMessages(prev => {
          const updated = prev.filter(m => (!m.studentId || !studentIds.includes(m.studentId)) && !matchesTarget(m));
          localStorage.setItem('school_messages', JSON.stringify(updated));
          return updated;
        });

        setParents(prev => {
          const updated = prev
            .map(parent => ({
              ...parent,
              childrenIds: parent.childrenIds.filter(cid => !studentIds.includes(cid))
            }))
            .filter(parent => parent.childrenIds.length > 0);
          localStorage.setItem('school_parents', JSON.stringify(updated));
          return updated;
        });

        alert(`🎉 تم بنجاح تصفير وتفريغ كافة بيانات ${cohortLabel} بالكامل! بإمكانك الآن البدء في إضافة الطلاب والمعلمين والصفوف لهذا الفوج من جديد.`);
      }
    );
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

    confirmAndExecute(
      `⚠️ تأكيد حذف طلاب الصف (${gradeName})`,
      `هل تريد بالتأكيد حذف كافة طلاب الصف (${gradeName}) وعددهم (${targetStudents.length}) طالب وطالبة؟\nسيتم تصفير وحذف جميع سجلاتهم المرتبطة (درجات، غياب وحضور، أعذار).`,
      () => {
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
      }
    );
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

    confirmAndExecute(
      `⚠️ تأكيد حذف طلاب الشعبة (${cls?.name || ''})`,
      `هل تريد بالتأكيد حذف جميع طلاب الشعبة (${cls?.name || ''}) وعددهم (${targetStudents.length}) طالب وطالبة؟\nسيتم حذف جميع علاماتهم وسجلات حضورهم وغيابهم وأعذارهم تلقائياً.`,
      () => {
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
        alert(`🎉 تم بنجاح حذف جميع طلاب الشعبة وسجلاتهم المرتبطة.`);
      }
    );
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
    const currentShift = newClassShift || (activeCohort === 'evening' ? 'evening' : 'morning');
    const newClassObj: Class = {
      id: `class-${Date.now()}`,
      name: newClassName.trim(),
      grade: newClassGrade.trim(),
      room: newClassRoom.trim() || 'غير محدد',
      teacherId: newClassTeacherId || '',
      shift: currentShift
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
      setTeacherSelectedSubjects([]);
      setTeacherSelectedClassIds([]);
    } else {
      setTeacherAssignmentType('subject_multi_class');
      setTeacherSelectedClassId('');
      
      const teacherSubs = teacher.subjects || [];
      const newCustoms = teacherSubs.filter(s => s && s !== 'عام - جميع المواد' && !customSubjects.includes(s));
      if (newCustoms.length > 0) {
        const updatedCustoms = [...customSubjects, ...newCustoms];
        setCustomSubjects(updatedCustoms);
        localStorage.setItem('school_custom_subjects', JSON.stringify(updatedCustoms));
      }
      setTeacherSelectedSubjects(teacherSubs);
      setTeacherSelectedClassIds(teacher.classes || []);
    }
    
    setShowTeacherForm(true);
    setTimeout(() => {
      const formElement = document.getElementById('dir-btn-add-teacher');
      if (formElement) {
        formElement.scrollIntoView({ behavior: 'smooth' });
      }
    }, 100);
  };

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
      let subjects = [...teacherSelectedSubjects];
      if (teacherNewSubjectInput.trim() && !subjects.includes(teacherNewSubjectInput.trim())) {
        const newSub = teacherNewSubjectInput.trim();
        subjects.push(newSub);
        if (!customSubjects.includes(newSub)) {
          const updated = [...customSubjects, newSub];
          setCustomSubjects(updated);
          localStorage.setItem('school_custom_subjects', JSON.stringify(updated));
        }
      }

      if (subjects.length === 0) {
        alert('الرجاء اختيار أو كتابة مادة دراسية واحدة على الأقل');
        return;
      }
      if (teacherSelectedClassIds.length === 0) {
        alert('الرجاء اختيار صف واحد على الأقل للمواد الدراسية المختارة');
        return;
      }
      finalSubjects = subjects;
      finalClasses = teacherSelectedClassIds;
    }

    const generatedEmail = `${newTeacher.name.trim().replace(/\s+/g, "")}_${Date.now()}@school.com`;
    const defaultPhone = '0500000000';

    if (editingTeacher) {
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
      addTeacher({
        name: newTeacher.name.trim(),
        email: generatedEmail,
        phone: defaultPhone,
        subjects: finalSubjects,
        classes: finalClasses,
        password: newTeacher.password.trim(),
        shift: newTeacherShift || (activeCohort === 'evening' ? 'evening' : 'morning')
      });
    }

    const isEdit = !!editingTeacher;

    setNewTeacher({ name: '', email: '', phone: '', subjectsStr: '', classId: '', password: '123' });
    setTeacherSelectedClassId('');
    setTeacherSelectedSubjects([]);
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
        parentName: newStudent.parentName,
        shift: newStudentShift || (activeCohort === 'evening' ? 'evening' : 'morning')
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
    alert('🎉 تم إضافة الطالب بنجاح وتأسيس حساب لولي أمره!');
    setShowStudentForm(false);
  };

  const handleAddAnnounce = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAnnounce.title || !newAnnounce.content) return;

    addAnnouncement({
      title: newAnnounce.title,
      content: newAnnounce.content,
      target: newAnnounce.target,
      authorRole: 'director',
      shift: activeCohort === 'evening' ? 'evening' : 'morning'
    });

    setNewAnnounce({ title: '', content: '', target: 'all' });
    setShowAnnounceForm(false);
  };

  // Filter teachers & students by search and active cohort
  const filteredTeachers = teachers.filter(t => 
    matchesCohort(t) && (
      t.name.toLowerCase().includes(teacherSearch.toLowerCase()) ||
      t.email.toLowerCase().includes(teacherSearch.toLowerCase()) ||
      t.subjects.some(s => s.toLowerCase().includes(teacherSearch.toLowerCase()))
    )
  );

  const filteredStudents = students.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
      s.rollNo.includes(studentSearch) ||
      s.parentName.toLowerCase().includes(studentSearch.toLowerCase());
    
    const matchesClass = selectedClassForStudentAffairs === 'all' || s.classId === selectedClassForStudentAffairs;

    return matchesSearch && matchesClass && matchesCohort(s);
  });

  if (!isLoggedIn) {
    return (
      <div id="director-login-container" className="bg-white min-h-[460px] rounded-2xl border border-slate-200 shadow-md flex flex-col items-center justify-center p-8 max-w-md mx-auto my-12">
        <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl mb-4 shadow-xs overflow-hidden w-14 h-14 flex items-center justify-center">
          {schoolAppIcon ? (
            <img src={schoolAppIcon} alt="الشعار" className="w-full h-full object-cover rounded-xl" />
          ) : (
            <Building className="w-8 h-8" />
          )}
        </div>
        <h2 className="text-xl font-extrabold text-slate-900 text-center">المدرسة الدولية</h2>
        <p className="text-xs font-medium text-slate-500 text-center mt-1">حلب - مدينة مارع (بوابة المدير العام)</p>
        
        <form onSubmit={(e) => {
          e.preventDefault();
          if (passwordInput === (directorPassword || '123')) {
            setIsLoggedIn(true);
            localStorage.setItem('school_director_is_logged_in', 'true');
            setIsCohortSelected(false);
            localStorage.removeItem('school_cohort_selected_session');
            setLoginError('');
          } else {
            setLoginError('كلمة المرور غير صحيحة، حاول مجدداً.');
          }
        }} className="w-full mt-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 text-right">كلمة مرور المدير العام</label>
            <div className="relative">
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                <Lock className="w-4 h-4" />
              </span>
              <input
                type="password"
                value={passwordInput}
                onChange={e => setPasswordInput(e.target.value)}
                placeholder="أدخل كلمة المرور..."
                className="w-full text-xs border border-slate-300 pr-10 pl-4 py-2.5 rounded-xl focus:border-indigo-600 focus:outline-none text-center font-bold font-mono tracking-widest text-slate-900"
                required
              />
            </div>
            {loginError && (
              <p className="text-xs text-rose-600 mt-2 font-bold text-center">{loginError}</p>
            )}
          </div>

          <button
            type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold py-3 px-4 rounded-xl transition shadow-xs cursor-pointer"
          >
            تسجيل الدخول للمنصة 🔐
          </button>
        </form>
      </div>
    );
  }

  // --- GATE SCREEN: Cohort Selection before entering the application (matches user screenshot) ---
  if (isLoggedIn && !isCohortSelected) {
    return (
      <div className="min-h-screen bg-slate-100/80 flex flex-col items-center justify-center p-4 font-sans" style={{ direction: 'rtl' }}>
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-3xl border border-slate-200/90 shadow-xl p-6 md:p-10 max-w-md w-full text-center space-y-6"
        >
          {/* Logo icon */}
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-200 mx-auto overflow-hidden">
            {schoolAppIcon ? (
              <img src={schoolAppIcon} alt="الشعار" className="w-full h-full object-cover" />
            ) : (
              <Building className="w-8 h-8" />
            )}
          </div>

          {/* Title & Subtitle */}
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">المدرسة الدولية الخاصة</h1>
            <p className="text-xs font-semibold text-slate-500 mt-1">
              لوحة تحكم الإدارة - الرجاء اختيار الفوج الدراسي للمتابعة
            </p>
          </div>

          {/* Academic Year Selector Pill */}
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-800 border border-emerald-200 px-4 py-2 rounded-full text-xs font-extrabold shadow-2xs">
              <Calendar className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>العام الدراسي النشط:</span>
              <select
                value={activeAcademicYear}
                onChange={(e) => {
                  setActiveAcademicYear(e.target.value);
                  localStorage.setItem('school_active_academic_year', e.target.value);
                }}
                className="bg-transparent font-black text-emerald-900 outline-none cursor-pointer pr-1"
              >
                {academicYears.map((yr) => (
                  <option key={yr} value={yr} className="bg-white text-slate-800">
                    {yr}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <button
                type="button"
                onClick={() => {
                  const year = prompt('أدخل العام الدراسي الجديد (مثال: 1449هـ - 2028م):');
                  if (year && year.trim()) {
                    const trimmed = year.trim();
                    if (!academicYears.includes(trimmed)) {
                      const updated = [...academicYears, trimmed];
                      setAcademicYears(updated);
                      localStorage.setItem('school_academic_years', JSON.stringify(updated));
                    }
                    setActiveAcademicYear(trimmed);
                    localStorage.setItem('school_active_academic_year', trimmed);
                  }
                }}
                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer transition"
              >
                + إضافة عام دراسي آخر
              </button>
            </div>
          </div>

          {/* Cohort Selection Cards */}
          <div className="grid grid-cols-1 gap-4 pt-1">
            {/* Morning Cohort Card */}
            <button
              type="button"
              onClick={() => {
                setActiveCohort('morning');
                localStorage.setItem('school_active_cohort', 'morning');
                setIsCohortSelected(true);
                localStorage.setItem('school_cohort_selected_session', 'true');
              }}
              className="group w-full p-6 bg-white hover:bg-amber-50/60 border-2 border-slate-200 hover:border-amber-400 rounded-2xl transition-all duration-200 shadow-2xs hover:shadow-md text-center cursor-pointer flex flex-col items-center gap-2"
            >
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-500 flex items-center justify-center group-hover:scale-110 transition-transform duration-200 shadow-2xs">
                <Sun className="w-7 h-7 text-amber-500" />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-800 group-hover:text-amber-700 transition-colors">
                  الفوج الصباحي
                </h2>
                <p className="text-[11px] font-medium text-slate-500 mt-0.5">
                  الصفوف والمواد الصباحية
                </p>
              </div>
            </button>

            {/* Evening Cohort Card */}
            <button
              type="button"
              onClick={() => {
                setActiveCohort('evening');
                localStorage.setItem('school_active_cohort', 'evening');
                setIsCohortSelected(true);
                localStorage.setItem('school_cohort_selected_session', 'true');
              }}
              className="group w-full p-6 bg-white hover:bg-purple-50/60 border-2 border-slate-200 hover:border-purple-400 rounded-2xl transition-all duration-200 shadow-2xs hover:shadow-md text-center cursor-pointer flex flex-col items-center gap-2"
            >
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-500 flex items-center justify-center group-hover:scale-110 transition-transform duration-200 shadow-2xs">
                <Moon className="w-7 h-7 text-amber-500" />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-800 group-hover:text-purple-700 transition-colors">
                  الفوج المسائي
                </h2>
                <p className="text-[11px] font-medium text-slate-500 mt-0.5">
                  الصفوف والمواد المسائية
                </p>
              </div>
            </button>
          </div>

          {/* Logout Button */}
          <div className="pt-2">
            <button
              type="button"
              onClick={() => {
                setIsLoggedIn(false);
                localStorage.removeItem('school_director_is_logged_in');
                setIsCohortSelected(false);
                localStorage.removeItem('school_cohort_selected_session');
              }}
              className="px-6 py-2.5 border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-bold transition inline-flex items-center gap-2 cursor-pointer shadow-2xs"
            >
              <LogOut className="w-4 h-4" />
              <span>تسجيل الخروج</span>
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-slate-100/60 text-slate-800" style={{ direction: 'rtl' }}>
      {/* Sidebar / Navigation panel */}
      <div className="w-full md:w-52 lg:w-56 bg-slate-950 text-slate-100 flex flex-col justify-between p-3.5 shrink-0 border-l border-slate-900 shadow-xl md:sticky md:top-0 md:h-screen md:overflow-y-auto">
        <div>
          {/* Header section of Sidebar with Logo and metrics button */}
          <div className="flex items-center justify-between mb-2 pb-2.5 border-b border-slate-900">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-900/40 shrink-0 overflow-hidden flex items-center justify-center">
                {schoolAppIcon ? (
                  <img src={schoolAppIcon} alt="الشعار" className="w-full h-full object-cover" />
                ) : (
                  <Building className="w-4 h-4" />
                )}
              </div>
              <div className="text-right">
                <span className="block font-black text-xs text-slate-100 tracking-wide">الإدارة العامة</span>
                <span className="block text-[9px] text-slate-400 mt-0.5 font-medium">بوابة المدير العام</span>
              </div>
            </div>

            {/* Action buttons: Screen mode & Firestore metrics monitoring badge */}
            <div className="flex items-center gap-1.5">
              {/* Fullscreen / Computer View Toggle Button */}
              <button
                type="button"
                onClick={toggleFullscreen}
                className="p-1.5 rounded-lg border border-indigo-900/40 bg-indigo-950/40 text-indigo-300 hover:text-white hover:bg-indigo-900/60 transition cursor-pointer flex items-center gap-1 shadow-2xs"
                title={isFullscreen ? "تصغير الشاشة (مناسب للهاتف 📱)" : "عرض ملء شاشة الكمبيوتر (مناسب للكمبيوتر 🖥️)"}
              >
                {isFullscreen ? (
                  <Minimize className="w-3.5 h-3.5 text-indigo-400" />
                ) : (
                  <Maximize className="w-3.5 h-3.5 text-indigo-400" />
                )}
              </button>

              {/* Firestore metrics monitoring badge */}
              <button
                type="button"
                onClick={() => setIsMetricsModalOpen(true)}
                className={`relative p-1.5 rounded-lg border flex items-center gap-1 transition cursor-pointer ${
                  firestoreMetrics.totalReads >= 36000
                    ? 'bg-rose-950/40 text-rose-400 border-rose-900/50'
                    : firestoreMetrics.totalReads >= 30000
                    ? 'bg-amber-950/40 text-amber-400 border-amber-500/30 hover:bg-amber-950/85 hover:border-amber-500'
                    : 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30 hover:bg-emerald-950/85 hover:border-emerald-500'
                }`}
                title="مراقبة استهلاك الفايربيس"
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
          </div>

          {/* Active Cohort Switcher & Badge directly under "الإدارة العامة" header */}
          <div className="bg-slate-900/90 border border-slate-800/90 rounded-xl p-2 mb-3.5 space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-black px-0.5">
              <span className="text-slate-400 font-bold">الفوج النشط:</span>
              <span className={`px-2 py-0.5 rounded-md font-extrabold flex items-center gap-1 shadow-xs ${
                activeCohort === 'evening' 
                  ? 'bg-purple-600 text-white' 
                  : 'bg-amber-400 text-slate-950'
              }`}>
                {activeCohort === 'evening' ? <Moon className="w-3 h-3 text-purple-200" /> : <Sun className="w-3 h-3 text-amber-900" />}
                <span>{activeCohort === 'evening' ? 'الفوج المسائي 🌙' : 'الفوج الصباحي ☀️'}</span>
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1 pt-0.5">
              <button
                type="button"
                onClick={() => {
                  setActiveCohort('morning');
                  localStorage.setItem('school_active_cohort', 'morning');
                }}
                className={`py-1.5 px-1.5 rounded-lg text-[10px] font-bold transition flex items-center justify-center gap-1 cursor-pointer border ${
                  activeCohort === 'morning'
                    ? 'bg-amber-500 text-slate-950 border-amber-400 font-black shadow-xs'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white hover:bg-slate-900'
                }`}
              >
                <Sun className={`w-3 h-3 ${activeCohort === 'morning' ? 'text-slate-950' : 'text-amber-400'}`} />
                <span>☀️ الصباحي</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveCohort('evening');
                  localStorage.setItem('school_active_cohort', 'evening');
                }}
                className={`py-1.5 px-1.5 rounded-lg text-[10px] font-bold transition flex items-center justify-center gap-1 cursor-pointer border ${
                  activeCohort === 'evening'
                    ? 'bg-purple-600 text-white border-purple-400 font-black shadow-xs'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white hover:bg-slate-900'
                }`}
              >
                <Moon className={`w-3 h-3 ${activeCohort === 'evening' ? 'text-purple-200' : 'text-purple-300'}`} />
                <span>🌙 المسائي</span>
              </button>
            </div>
          </div>
            
          {/* Hamburger Button for Mobile on the Right */}
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-2 text-slate-300 hover:text-white hover:bg-slate-900 rounded-lg transition cursor-pointer"
            aria-label="القائمة"
          >
            {isMobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
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
              className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-right text-[11px] font-bold transition-all duration-200 ${
                activeTab === 'dashboard' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-300 hover:bg-slate-900 hover:text-white'
              }`}
            >
              <Building className="w-3.5 h-3.5 shrink-0 text-indigo-400" />
              <span>لوحة التحكم الرئيسية</span>
            </button>

            <button
              id="dir-nav-subjects"
              onClick={() => {
                setActiveTab('subjects');
                setIsMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-right text-[11px] font-bold transition-all duration-200 ${
                activeTab === 'subjects' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-300 hover:bg-slate-900 hover:text-white'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
              <span>إدارة المواد الدراسية 📚</span>
              <span className="mr-auto bg-slate-900/80 text-emerald-300 border border-emerald-800/40 px-1.5 py-0.5 rounded-full text-[9px] font-extrabold">{customSubjects.length}</span>
            </button>

            <button
              id="dir-nav-classes"
              onClick={() => {
                setActiveTab('classes');
                setIsMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-right text-[11px] font-bold transition-all duration-200 ${
                activeTab === 'classes' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-300 hover:bg-slate-900 hover:text-white'
              }`}
            >
              <Building className="w-3.5 h-3.5 shrink-0 text-indigo-400" />
              <span>إدارة الصفوف والشعب 🏫</span>
              <span className="mr-auto bg-slate-900/80 text-indigo-300 border border-indigo-800/40 px-1.5 py-0.5 rounded-full text-[9px] font-extrabold">{classes.filter(matchesCohort).length}</span>
            </button>

            <button
              id="dir-nav-teachers"
              onClick={() => {
                setActiveTab('teachers');
                setIsMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-right text-[11px] font-bold transition-all duration-200 ${
                activeTab === 'teachers' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-300 hover:bg-slate-900 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5 shrink-0 text-sky-400" />
              <span>شؤون المعلمين</span>
              <span className="mr-auto bg-slate-900/80 text-sky-300 border border-sky-800/40 px-1.5 py-0.5 rounded-full text-[9px] font-extrabold">{teachers.filter(matchesCohort).length}</span>
            </button>

            <button
              id="dir-nav-students"
              onClick={() => {
                setActiveTab('students');
                setIsMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-right text-[11px] font-bold transition-all duration-200 ${
                activeTab === 'students' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-300 hover:bg-slate-900 hover:text-white'
              }`}
            >
              <GraduationCap className="w-3.5 h-3.5 shrink-0 text-amber-400" />
              <span>شؤون الطلاب وأولياء الأمور</span>
              <span className="mr-auto bg-slate-900/80 text-amber-300 border border-amber-800/40 px-1.5 py-0.5 rounded-full text-[9px] font-extrabold">{students.filter(matchesCohort).length}</span>
            </button>

            <button
              id="dir-nav-excuses"
              onClick={() => {
                setActiveTab('excuses');
                setIsMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-right text-[11px] font-bold transition-all duration-200 ${
                activeTab === 'excuses' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-300 hover:bg-slate-900 hover:text-white'
              }`}
            >
              <FileCheck className="w-3.5 h-3.5 shrink-0 text-amber-400" />
              <span>طلبات الغياب والأعذار</span>
              {excuses.filter(e => {
                const st = students.find(s => s.id === e.studentId);
                return ((st && matchesCohort(st)) || matchesCohort(e)) && e.status === 'pending';
              }).length > 0 && (
                <span className="mr-auto bg-rose-600 text-white px-1.5 py-0.5 rounded-full text-[9px] font-extrabold animate-pulse">
                  {excuses.filter(e => {
                    const st = students.find(s => s.id === e.studentId);
                    return ((st && matchesCohort(st)) || matchesCohort(e)) && e.status === 'pending';
                  }).length}
                </span>
              )}
            </button>

            <button
              id="dir-nav-attendance"
              onClick={() => {
                setActiveTab('attendance');
                const cohortClasses = classes.filter(matchesCohort);
                if (cohortClasses.length > 0 && !cohortClasses.some(c => c.id === selectedClassForAttendance)) {
                  setSelectedClassForAttendance(cohortClasses[0].id);
                }
                setIsMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-right text-[11px] font-bold transition-all duration-200 ${
                activeTab === 'attendance' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-300 hover:bg-slate-900 hover:text-white'
              }`}
            >
              <Calendar className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
              <span>سجل الحضور والغياب 📅</span>
            </button>

            <button
              id="dir-nav-grades"
              onClick={() => {
                setActiveTab('grades');
                const cohortClasses = classes.filter(matchesCohort);
                if (cohortClasses.length > 0 && !cohortClasses.some(c => c.id === selectedClassForGrades)) {
                  setSelectedClassForGrades(cohortClasses[0].id);
                }
                setIsMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-right text-[11px] font-bold transition-all duration-200 ${
                activeTab === 'grades' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-300 hover:bg-slate-900 hover:text-white'
              }`}
            >
              <FileCheck className="w-3.5 h-3.5 shrink-0 text-indigo-400" />
              <span>كشوفات ومعالجة الدرجات</span>
            </button>

            <button
              id="dir-nav-tuition"
              onClick={() => {
                setActiveTab('tuition');
                const cohortClasses = classes.filter(matchesCohort);
                if (cohortClasses.length > 0 && !cohortClasses.some(c => c.id === selectedClassForTuition)) {
                  setSelectedClassForTuition(cohortClasses[0].id);
                }
                setIsMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-right text-[11px] font-bold transition-all duration-200 ${
                activeTab === 'tuition' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-300 hover:bg-slate-900 hover:text-white'
              }`}
            >
              <Coins className="w-3.5 h-3.5 shrink-0 text-amber-400" />
              <span>إدارة الأقساط والرسوم 💰</span>
            </button>

            <button
              id="dir-nav-messages"
              onClick={() => {
                setActiveTab('messages');
                setIsMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-right text-[11px] font-bold transition-all duration-200 ${
                activeTab === 'messages' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-300 hover:bg-slate-900 hover:text-white'
              }`}
            >
              <div className="relative shrink-0">
                <MessageSquare className="w-3.5 h-3.5 text-sky-400" />
                {messages.filter(m => matchesCohort(m) && m.receiverRole === 'director' && !m.read).length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-600 text-[8px] font-black text-white ring-2 ring-slate-950 animate-bounce">
                    {messages.filter(m => matchesCohort(m) && m.receiverRole === 'director' && !m.read).length}
                  </span>
                )}
              </div>
              <span>المراسلات والرسائل</span>
              {messages.filter(m => matchesCohort(m) && m.receiverRole === 'director' && !m.read).length > 0 && (
                <span className="mr-auto bg-rose-600 text-white px-1.5 py-0.5 rounded-full text-[9px] font-extrabold animate-pulse">
                  {messages.filter(m => matchesCohort(m) && m.receiverRole === 'director' && !m.read).length} جديدة
                </span>
              )}
            </button>

            <button
              id="dir-nav-cleanup"
              onClick={() => {
                setActiveTab('data-cleanup');
                setIsMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-right text-[11px] font-bold transition-all duration-200 ${
                activeTab === 'data-cleanup' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-300 hover:bg-slate-900 hover:text-white'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5 shrink-0 text-rose-400 animate-pulse" />
              <span>تنظيف وحذف التراكمات 🧹</span>
            </button>

            <button
              id="dir-nav-settings"
              onClick={() => {
                setActiveTab('settings');
                setIsMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-right text-[11px] font-bold transition-all duration-200 ${
                activeTab === 'settings' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-300 hover:bg-slate-900 hover:text-white'
              }`}
            >
              <Settings className="w-3.5 h-3.5 shrink-0 text-indigo-400" />
              <span>الإعدادات والتحديثات الذكية</span>
            </button>
          </nav>
        </div>

        {/* User login info & Logout - Collapsible on Mobile */}
        <div className={`${isMobileMenuOpen ? 'block mt-4' : 'hidden md:block'} mt-4 border-t border-slate-900 pt-3 text-[11px] text-slate-400 space-y-2`}>
          <div className="flex items-center gap-1.5 justify-end">
            <span className="text-[10px] font-medium text-slate-300">تسجيل الدخول: المدير العام</span>
            <UserCheck className="w-3 h-3 text-indigo-400" />
          </div>
          <div className={`flex items-center gap-1.5 justify-end px-2.5 py-1.5 rounded-xl border ${
            activeAcademicYear === 'غير محدد' 
              ? 'bg-amber-950/20 border-amber-900/30 text-amber-400' 
              : 'bg-indigo-950/30 border-indigo-900/40 text-indigo-300'
          }`}>
            <span className="font-extrabold text-[10px]">العام الدراسي: {activeAcademicYear}</span>
            <Calendar className="w-3 h-3 shrink-0" />
          </div>

          <button
            onClick={() => {
              setIsLoggedIn(false);
              localStorage.removeItem('school_director_is_logged_in');
              setPasswordInput('');
              setIsMobileMenuOpen(false);
            }}
            className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-rose-950/40 text-rose-300 hover:bg-rose-900/60 border border-rose-900/40 rounded-xl text-[10px] font-bold transition cursor-pointer"
          >
            <LogOut className="w-3 h-3" />
            <span>قفل البوابة (خروج)</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 p-4 md:p-6 lg:p-8 overflow-y-auto w-full space-y-5">
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
                <div className="flex flex-wrap items-center gap-2.5 self-end sm:self-center">
                  <div className={`text-xs px-3.5 py-1.5 rounded-xl font-bold border flex items-center gap-1.5 ${
                    activeAcademicYear === 'غير محدد' 
                      ? 'bg-amber-50 border-amber-200 text-amber-700' 
                      : 'bg-indigo-50 border-indigo-200 text-indigo-700'
                  }`}>
                    <span>العام الدراسي النشط: {activeAcademicYear}</span>
                    <Calendar className="w-4 h-4 text-indigo-500" />
                  </div>
                </div>
              </div>

              {/* Subject Addition Button / Quick Actions Row */}
              <div className="grid grid-cols-1 gap-4">
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

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* School Classes list */}
                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm lg:col-span-2">
                  <h3 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-sky-600" />
                    <span>الصفوف الدراسية المشرف عليها</span>
                  </h3>
                  <div className="space-y-3">
                    {classes.filter(matchesCohort).map(cls => {
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
                    {announcements.filter(matchesCohort).slice(0, 3).map(announce => (
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

              {/* App Icon / Logo Customization Card */}
              <div className="bg-white p-5 md:p-6 rounded-2xl border border-indigo-100 shadow-sm space-y-5 text-right">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-amber-500" />
                      <span>تخصيص أيقونة وشعار التطبيق والبوابات (App Icon) 🎨</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      يمكنك رفع شعار مدرستك الخاص أو اختيار أحد الشعارات الجاهزة. تتغير الأيقونة فوراً عبر كافة البوابات (المدير، المعلم، ولي الأمر) وشريط العنوان!
                    </p>
                  </div>

                  {/* Live Preview Badge */}
                  <div className="flex items-center gap-2 bg-slate-900 text-white p-2 px-3 rounded-xl border border-slate-800 shrink-0">
                    <span className="text-[10px] text-slate-400 font-bold">المعاينة الحية:</span>
                    <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center overflow-hidden border border-white/20 shadow-xs">
                      {schoolAppIcon ? (
                        <img src={schoolAppIcon} alt="المعاينة" className="w-full h-full object-cover" />
                      ) : (
                        <Building className="w-4 h-4 text-white" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Upload Custom File & Image URL Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {/* Upload File */}
                  <div className="p-3.5 bg-indigo-50/60 rounded-xl border border-indigo-100 flex flex-col justify-between gap-2">
                    <label className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                      <Upload className="w-4 h-4 text-indigo-600" />
                      <span>رفع صورة أو شعار من الجهاز (PNG/JPG/SVG):</span>
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (evt) => {
                            const res = evt.target?.result as string;
                            if (res) {
                              updateAppIcon(res);
                              alert('🎉 تم تحديث شعار وأيقونة التطبيق بنجاح عبر كافة البوابات!');
                            }
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                      className="text-xs text-slate-600 file:mr-0 file:ml-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-indigo-600 file:text-white hover:file:bg-indigo-700 cursor-pointer"
                    />
                  </div>

                  {/* Image URL Input */}
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex flex-col justify-between gap-2">
                    <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <ImageIcon className="w-4 h-4 text-slate-600" />
                      <span>أو لصق رابط صورة مباشر (URL):</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="url"
                        placeholder="https://example.com/logo.png"
                        id="custom-icon-url-input"
                        className="text-xs border border-slate-300 px-3 py-1.5 rounded-lg focus:border-indigo-600 focus:outline-none flex-1 font-mono text-left"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const input = document.getElementById('custom-icon-url-input') as HTMLInputElement;
                          if (input && input.value.trim()) {
                            updateAppIcon(input.value.trim());
                            alert('🎉 تم تطبيق رابط الأيقونة بنجاح!');
                            input.value = '';
                          }
                        }}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition shrink-0 cursor-pointer"
                      >
                        تطبيق
                      </button>
                    </div>
                  </div>
                </div>

                {/* Reset Icon Button */}
                {schoolAppIcon && (
                  <div className="pt-2 border-t border-slate-100 flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm('هل ترغب بإعادة الأيقونة الافتراضية للنظام؟')) {
                          updateAppIcon('');
                        }
                      }}
                      className="text-xs font-bold text-slate-500 hover:text-rose-600 flex items-center gap-1 transition cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>إعادة الأيقونة الافتراضية</span>
                    </button>
                  </div>
                )}
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

              {/* Direct Portal Sharing Links Card (Dashboard version) */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm mt-4 text-right">
                <h3 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-2 justify-end">
                  <span>روابط المشاركة والوصول المباشر للبوابات الفرعية 🔗</span>
                  <ArrowLeftRight className="w-4 h-4 text-indigo-600" />
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed mb-4">
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
                      setTeacherSelectedSubjects([]);
                      setTeacherSelectedClassIds([]);
                      setTeacherNewSubjectInput('');
                    } else {
                      setShowTeacherForm(!showTeacherForm);
                      if (!showTeacherForm) {
                        setEditingTeacher(null);
                        setNewTeacher({ name: '', email: '', phone: '', subjectsStr: '', classId: '', password: '123' });
                        setTeacherSelectedClassId('');
                        setTeacherSelectedSubjects([]);
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
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">الفوج الدراسي *</label>
                        <select
                          value={newTeacherShift}
                          onChange={e => setNewTeacherShift(e.target.value as 'morning' | 'evening')}
                          className="w-full text-sm font-bold border border-slate-200 px-3.5 py-2.5 rounded-xl bg-white focus:border-sky-500 focus:outline-none cursor-pointer"
                        >
                          <option value="morning">☀️ الفوج الصباحي</option>
                          <option value="evening">🌙 الفوج المسائي</option>
                        </select>
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
                            {classes.filter(matchesCohort).map(c => (
                              <option key={c.id} value={c.id}>{c.name} ({c.grade})</option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <div className="space-y-5">
                          {/* Section 1: Multi-Subject Selection */}
                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <label className="block text-xs font-bold text-slate-800">
                                اختر المواد الدراسية المسندة للمعلم (أكثر من مادة) *
                              </label>
                              {customSubjects.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (teacherSelectedSubjects.length === customSubjects.length) {
                                      setTeacherSelectedSubjects([]);
                                    } else {
                                      setTeacherSelectedSubjects([...customSubjects]);
                                    }
                                  }}
                                  className="text-[11px] font-semibold text-indigo-600 hover:underline cursor-pointer"
                                >
                                  {teacherSelectedSubjects.length === customSubjects.length ? 'إلغاء تحديد الكل' : 'تحديد جميع المواد'}
                                </button>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-400 mb-2 font-sans">
                              انقر على مادة أو أكثر لتحديدها (مثال: الرياضيات والعلوم للصفوف المختارة):
                            </p>

                            {/* Subjects Badges Grid */}
                            <div className="flex flex-wrap gap-2 p-3 border border-slate-100 rounded-xl bg-slate-50/50 max-h-40 overflow-y-auto">
                              {customSubjects.map(sub => {
                                const isSelected = teacherSelectedSubjects.includes(sub);
                                return (
                                  <button
                                    key={sub}
                                    type="button"
                                    onClick={() => {
                                      if (isSelected) {
                                        setTeacherSelectedSubjects(prev => prev.filter(s => s !== sub));
                                      } else {
                                        setTeacherSelectedSubjects(prev => [...prev, sub]);
                                      }
                                    }}
                                    className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                                      isSelected
                                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                                    }`}
                                  >
                                    <span>{sub}</span>
                                    {isSelected && <span className="text-[10px] font-bold">✓</span>}
                                  </button>
                                );
                              })}
                            </div>

                            {/* Active Selected Subjects Summary */}
                            {teacherSelectedSubjects.length > 0 && (
                              <div className="mt-2.5 flex items-center flex-wrap gap-1.5 bg-indigo-50/50 p-2.5 rounded-xl border border-indigo-100">
                                <span className="text-[11px] font-bold text-indigo-900 ml-1">المواد المحددة ({teacherSelectedSubjects.length}):</span>
                                {teacherSelectedSubjects.map(sub => (
                                  <span
                                    key={sub}
                                    className="bg-indigo-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 shadow-2xs"
                                  >
                                    {sub}
                                    <button
                                      type="button"
                                      onClick={() => setTeacherSelectedSubjects(prev => prev.filter(s => s !== sub))}
                                      className="hover:text-red-200 transition font-mono font-bold cursor-pointer"
                                    >
                                      ×
                                    </button>
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Quick Add Custom Subject */}
                            <div className="mt-3 flex items-center gap-2">
                              <input
                                type="text"
                                value={teacherNewSubjectInput}
                                onChange={e => setTeacherNewSubjectInput(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    const val = teacherNewSubjectInput.trim();
                                    if (val) {
                                      if (!customSubjects.includes(val)) {
                                        const updated = [...customSubjects, val];
                                        setCustomSubjects(updated);
                                        localStorage.setItem('school_custom_subjects', JSON.stringify(updated));
                                      }
                                      if (!teacherSelectedSubjects.includes(val)) {
                                        setTeacherSelectedSubjects(prev => [...prev, val]);
                                      }
                                      setTeacherNewSubjectInput('');
                                    }
                                  }
                                }}
                                placeholder="إضافة مادة جديدة مثلاً: التربية البدنية..."
                                className="flex-1 text-xs border border-slate-200 px-3 py-2 rounded-xl focus:border-indigo-500 focus:outline-none bg-white"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const val = teacherNewSubjectInput.trim();
                                  if (val) {
                                    if (!customSubjects.includes(val)) {
                                      const updated = [...customSubjects, val];
                                      setCustomSubjects(updated);
                                      localStorage.setItem('school_custom_subjects', JSON.stringify(updated));
                                    }
                                    if (!teacherSelectedSubjects.includes(val)) {
                                      setTeacherSelectedSubjects(prev => [...prev, val]);
                                    }
                                    setTeacherNewSubjectInput('');
                                  }
                                }}
                                className="px-3.5 py-2 text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-xl hover:bg-indigo-100 transition whitespace-nowrap cursor-pointer"
                              >
                                + إضافة المادة
                              </button>
                            </div>
                          </div>

                          {/* Section 2: Multi-Class Selection */}
                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <label className="block text-xs font-bold text-slate-800">
                                اختر الفصول والشعب التي يدرسها المعلم (أكثر من صف) *
                              </label>
                              {classes.filter(matchesCohort).length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const cohortClassIds = classes.filter(matchesCohort).map(c => c.id);
                                    if (teacherSelectedClassIds.length === cohortClassIds.length) {
                                      setTeacherSelectedClassIds([]);
                                    } else {
                                      setTeacherSelectedClassIds(cohortClassIds);
                                    }
                                  }}
                                  className="text-[11px] font-semibold text-indigo-600 hover:underline cursor-pointer"
                                >
                                  {teacherSelectedClassIds.length === classes.filter(matchesCohort).length ? 'إلغاء تحديد الكل' : 'تحديد كافة الصفوف'}
                                </button>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-400 mb-2 font-sans">
                              حدد الصفوف والشعب التي سيدرّس فيها المعلم المواد المحددة أعلاه:
                            </p>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-44 overflow-y-auto p-2 border border-slate-100 rounded-xl bg-slate-50/50">
                              {classes.filter(matchesCohort).map(c => {
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
                                    className={`p-2.5 rounded-lg border text-right transition text-xs font-semibold flex items-center justify-between gap-2 cursor-pointer ${
                                      isSelected
                                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                                    }`}
                                  >
                                    <span className="truncate">{c.name}</span>
                                    <span className={`w-4 h-4 rounded-full flex items-center justify-center border text-[9px] font-bold ${
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
                          setTeacherSelectedSubjects([]);
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
                  <h1 className="text-2xl font-bold text-slate-800">شؤون الطلاب وأولياء الأمور (Excel)</h1>
                  <p className="text-slate-500 text-sm mt-1">إدارة كشوف الطلاب وتوثيق ارتباطهم بأولياء أمورهم عبر تصدير واستيراد ملفات Excel ومعاينتها فورياً</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setNewStudent({
                      name: '',
                      classId: selectedClassForStudentAffairs !== 'all' ? selectedClassForStudentAffairs : '',
                      rollNo: '',
                      gender: 'male',
                      dob: '2018-01-01',
                      parentName: '',
                      parentEmail: '',
                      parentPhone: ''
                    });
                    setShowStudentForm(true);
                  }}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 justify-center shadow-md shadow-indigo-100/50 transition cursor-pointer self-start sm:self-auto"
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة طالب يدوي جديد 👤</span>
                </button>
              </div>

              {/* Class & Section Selection for viewing and registration */}
              <div className="bg-sky-50/40 border border-sky-100/60 p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <span className="text-xs font-bold text-sky-950 flex items-center gap-1.5 justify-end sm:justify-start">
                    <span className="w-2.5 h-2.5 rounded-full bg-sky-500"></span>
                    <span>حدد الصف والشعبة المطلوب عرض طلابها وتصدير كشفها:</span>
                  </span>
                  <div className="relative">
                    <select
                      value={selectedClassForStudentAffairs}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedClassForStudentAffairs(val);
                        setImportTargetClassId(val === 'all' ? '' : val);
                      }}
                      className="w-full sm:w-64 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-800 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer text-right appearance-none pl-8 pr-3 shadow-xs"
                      style={{ direction: 'rtl' }}
                    >
                      <option value="all">كل الصفوف والشعب (الكل)</option>
                      {classes.filter(matchesCohort).map(c => (
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
                  </div>
                ) : (
                  <div className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-100/50 self-start md:self-auto">
                    💡 يمكنك فلترة الصف لتصدير ملف مخصص له أو تحديد صف قبل الاستيراد.
                  </div>
                )}
              </div>

              {/* Excel Bulk Student Import & Export Card */}
              <div className="bg-slate-50 border border-slate-100 p-5 rounded-2xl text-right space-y-5">
                <div>
                  <h3 className="font-bold text-slate-800 text-sm mb-1 flex items-center gap-2 justify-end">
                    <Upload className="w-4 h-4 text-sky-600" />
                    <span>تصدير واستيراد كشوف الطلاب الذكية (إكسل)</span>
                  </h3>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    يتيح لك النظام تصدير كشف الطلاب الحالي لبرنامج Excel مباشرة، أو تعبئة كشف أسماء الطلاب بالبيانات المطلوبة <strong className="text-emerald-700 font-bold">(الرقم الموحد، اسم الطالب، ولي الأمر)</strong> وإعادة رفع الكشف لتسكين الطلاب فورياً.
                  </p>
                </div>

                {/* Double Core Buttons Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Export Button Container */}
                  <div className="bg-white p-4 rounded-xl border border-slate-150 shadow-xs flex flex-col justify-between">
                    <div className="mb-3">
                      <span className="block text-xs font-bold text-slate-700 mb-1">1. تصدير الكشف الحالي إلى Excel</span>
                      <p className="text-[10px] text-slate-400">
                        {selectedClassForStudentAffairs === 'all' 
                          ? 'سيتم تصدير كشف يحتوي على جميع الطلاب بكافة الصفوف.'
                          : `سيتم تصدير كشف مخصص لطلاب [${classes.find(c => c.id === selectedClassForStudentAffairs)?.name}].`
                        }
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleDownloadStudentAffairsTemplate}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-3 rounded-xl text-xs font-bold flex items-center gap-2 justify-center shadow-md shadow-emerald-100/50 transition cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                      <span>تصدير كشف الأسماء الحالي إلى Excel 📥</span>
                    </button>
                  </div>

                  {/* Import Button Container */}
                  <div className="bg-white p-4 rounded-xl border border-slate-150 shadow-xs flex flex-col justify-between">
                    <div className="mb-3">
                      <span className="block text-xs font-bold text-slate-700 mb-1">2. استيراد كشف الأسماء من ملف Excel</span>
                      <p className="text-[10px] text-slate-400">
                        {importTargetClassId 
                          ? `سيتم تسكين الطلاب المستوردين في صف [${classes.find(c => c.id === importTargetClassId)?.name}] مباشرة.` 
                          : '⚠️ يرجى اختيار صف أو شعبة مستهدفة للطلاب المستوردين أولاً.'
                        }
                      </p>
                    </div>
                    <div className="relative">
                      <input
                        type="file"
                        accept=".xlsx, .xls"
                        onChange={handleImportStudentsExcel}
                        disabled={!importTargetClassId}
                        className="opacity-0 absolute inset-0 w-full h-full cursor-pointer disabled:cursor-not-allowed z-10"
                      />
                      <div className={`w-full text-xs font-bold text-center border-2 border-dashed rounded-xl py-2.5 px-4 transition flex items-center justify-center gap-2 ${
                        importTargetClassId 
                          ? 'border-sky-300 hover:bg-sky-50/50 text-sky-700 bg-sky-50/20' 
                          : 'border-slate-200 bg-slate-50 text-slate-400'
                      }`}>
                        <Upload className="w-4 h-4" />
                        <span>{importTargetClassId ? 'استيراد الأسماء من ملف Excel 📤' : 'حدد الصف لتفعيل زر الاستيراد ⚠️'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* VISUAL EXCEL SPREADSHEET PREVIEW TABLE */}
                <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
                  <div className="bg-slate-100/80 px-4 py-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex flex-col gap-1 text-right">
                      <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        <span>🔍 معاينة وإدارة كشف الطلاب ({filteredStudents.length} طلاب)</span>
                      </span>
                      <span className="text-[10px] text-slate-500">
                        الصف المحدد: {selectedClassForStudentAffairs === 'all' ? 'جميع الصفوف والشعب' : classes.find(c => c.id === selectedClassForStudentAffairs)?.name}
                      </span>
                    </div>

                    <div className="relative w-full sm:w-80">
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                        <Search className="w-3.5 h-3.5" />
                      </span>
                      <input
                        type="text"
                        placeholder="ابحث باسم الطالب أو رقم القيد أو ولي الأمر..."
                        value={studentSearch}
                        onChange={e => setStudentSearch(e.target.value)}
                        className="w-full text-[11px] border border-slate-200 pr-9 pl-3 py-1.5 rounded-lg bg-white focus:border-sky-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-right border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50/50 text-slate-600 font-bold border-b border-slate-200">
                          <th className="p-2 border-l border-slate-200 text-center w-12 bg-slate-100/50">#</th>
                          <th className="p-3 border-l border-slate-200 font-bold text-slate-800">الرقم الموحد</th>
                          <th className="p-3 border-l border-slate-200 font-bold text-slate-800">اسم الطالب</th>
                          <th className="p-3 border-l border-slate-200 font-bold text-slate-800">ولي الأمر</th>
                          <th className="p-3 border-l border-slate-200 font-bold text-slate-800 text-center">رقم الواتساب 📲</th>
                          <th className="p-3 text-center font-bold text-slate-800">إجراءات التحكم بالبيانات والاسم</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-150">
                        {filteredStudents.length > 0 ? (
                          filteredStudents.map((student, idx) => {
                            const parentObj = parents.find(p => p.childrenIds.includes(student.id) || p.id === student.parentId);
                            const parentPhone = parentObj?.phone || '';

                            return (
                              <tr key={student.id} className="hover:bg-slate-50/40 font-medium text-slate-600">
                                <td className="p-2 border-l border-slate-150 text-center text-slate-400 bg-slate-50 font-mono">{idx + 1}</td>
                                <td className="p-3 border-l border-slate-150 font-mono text-sky-700 font-semibold">{student.rollNo}</td>
                                <td className="p-3 border-l border-slate-150 font-bold text-slate-800">{student.name}</td>
                                <td className="p-3 border-l border-slate-150">{student.parentName || parentObj?.name || `ولي أمر ${student.name}`}</td>
                                <td className="p-3 border-l border-slate-150 text-center font-mono text-emerald-700 font-bold text-[11px] dir-ltr">
                                  {parentPhone ? (
                                    <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-lg shadow-2xs">
                                      <span>📲</span>
                                      <span>{parentPhone}</span>
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 font-sans italic text-[10px]">غير مسجل</span>
                                  )}
                                </td>
                                <td className="p-3 text-center">
                                  <div className="flex gap-1.5 justify-center">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingStudent(student);
                                        setEditingStudentPhone(parentPhone);
                                      }}
                                      className="text-[10px] bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-lg border border-indigo-100 transition cursor-pointer flex items-center gap-1 font-bold"
                                    >
                                      <span>✏️ تعديل البيانات</span>
                                    </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setTransferringStudent(student);
                                      setTransferTargetClassId(student.classId);
                                      const studentClass = classes.find(c => c.id === student.classId);
                                      if (studentClass) {
                                        setTransferCohort('الفوج الدراسي الحالي');
                                        setTransferGrade(studentClass.grade);
                                        const sec = studentClass.name.includes('-') 
                                          ? studentClass.name.split('-')[1]?.trim() 
                                          : studentClass.name.includes('شعبة') 
                                            ? studentClass.name.split('شعبة')[1]?.trim() 
                                            : studentClass.name.replace(studentClass.grade, '').replace('الصف', '').trim();
                                        setTransferSection(sec || '');
                                      } else {
                                        setTransferCohort('الفوج الدراسي الحالي');
                                        setTransferGrade('');
                                        setTransferSection('');
                                      }
                                    }}
                                    className="text-[10px] bg-amber-50 hover:bg-amber-100 text-amber-700 px-2.5 py-1 rounded-lg border border-amber-100 transition cursor-pointer flex items-center gap-1 font-bold"
                                  >
                                    <span>⚙️ نقل الشعبة</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteSingleItem('students', student.id)}
                                    className="text-[10px] bg-rose-50 hover:bg-rose-100 text-rose-600 px-2.5 py-1 rounded-lg border border-rose-100 transition cursor-pointer flex items-center gap-1 font-bold"
                                  >
                                    <span>🗑️ حذف الاسم</span>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-slate-400 italic">
                              {studentSearch ? 'لم يتم العثور على أي طالب يطابق معايير البحث.' : 'لا يوجد طلاب مضافين بعد لهذا الصف.'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Manual Add Student Modal */}
              <AnimatePresence>
                {showStudentForm && (
                  <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 text-right"
                      style={{ direction: 'rtl' }}
                    >
                      <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                        <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                          <Plus className="w-5 h-5 text-indigo-600" />
                          <span>إضافة طالب يدوي جديد 👤</span>
                        </h3>
                        <button
                          type="button"
                          onClick={() => setShowStudentForm(false)}
                          className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-50 transition"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <form onSubmit={handleAddStudent} className="space-y-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1.5">الرقم الموحد للطالب: <span className="text-red-500">*</span></label>
                          <input
                            type="text"
                            required
                            placeholder="أدخل الرقم الموحد (مثال: 1029482)"
                            value={newStudent.rollNo}
                            onChange={e => setNewStudent(prev => ({ ...prev, rollNo: e.target.value }))}
                            className="w-full text-xs border border-slate-200 px-3.5 py-2.5 rounded-xl bg-white focus:border-indigo-500 focus:outline-none text-right"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1.5">اسم الطالب ثلاثي: <span className="text-red-500">*</span></label>
                          <input
                            type="text"
                            required
                            placeholder="أدخل اسم الطالب الكامل"
                            value={newStudent.name}
                            onChange={e => setNewStudent(prev => ({ ...prev, name: e.target.value }))}
                            className="w-full text-xs border border-slate-200 px-3.5 py-2.5 rounded-xl bg-white focus:border-indigo-500 focus:outline-none text-right"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1.5">اسم ولي الأمر: <span className="text-red-500">*</span></label>
                          <input
                            type="text"
                            required
                            placeholder="أدخل اسم ولي أمر الطالب"
                            value={newStudent.parentName}
                            onChange={e => setNewStudent(prev => ({ ...prev, parentName: e.target.value }))}
                            className="w-full text-xs border border-slate-200 px-3.5 py-2.5 rounded-xl bg-white focus:border-indigo-500 focus:outline-none text-right"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1 justify-end">
                            <span>رقم الواتس اب لولي الأمر (ربط تلقائي بالمعرف):</span>
                            <span className="text-emerald-600">📲</span>
                          </label>
                          <input
                            type="tel"
                            placeholder="أدخل رقم الواتساب (مثال: 0501234567)"
                            value={newStudent.parentPhone || ''}
                            onChange={e => setNewStudent(prev => ({ ...prev, parentPhone: e.target.value }))}
                            className="w-full text-xs border border-slate-200 px-3.5 py-2.5 rounded-xl bg-white focus:border-indigo-500 focus:outline-none text-right font-mono"
                          />
                        </div>

                        {/* Class selector */}
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1.5">الصف والشعبة: <span className="text-red-500">*</span></label>
                          {selectedClassForStudentAffairs !== 'all' ? (
                            <div className="w-full bg-slate-50 border border-slate-200 text-slate-600 px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between">
                              <span>{classes.find(c => c.id === selectedClassForStudentAffairs)?.name}</span>
                              <span className="text-[10px] text-emerald-600 font-semibold">(تم التحديد تلقائياً)</span>
                            </div>
                          ) : (
                            <select
                              required
                              value={newStudent.classId}
                              onChange={e => setNewStudent(prev => ({ ...prev, classId: e.target.value }))}
                              className="w-full text-xs border border-slate-200 px-3.5 py-2.5 rounded-xl bg-white focus:border-indigo-500 focus:outline-none cursor-pointer text-right"
                            >
                              <option value="">-- اختر الصف والشعبة --</option>
                              {classes.filter(matchesCohort).map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          )}
                        </div>

                        {/* Shift Selector */}
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1.5">الفوج الدراسي: <span className="text-red-500">*</span></label>
                          <select
                            value={newStudentShift}
                            onChange={e => setNewStudentShift(e.target.value as 'morning' | 'evening')}
                            className="w-full text-xs font-bold border border-slate-200 px-3.5 py-2.5 rounded-xl bg-white focus:border-indigo-500 focus:outline-none cursor-pointer text-right"
                          >
                            <option value="morning">☀️ الفوج الصباحي</option>
                            <option value="evening">🌙 الفوج المسائي</option>
                          </select>
                        </div>

                        <div className="flex gap-2 pt-2 justify-end">
                          <button
                            type="button"
                            onClick={() => setShowStudentForm(false)}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold px-4 py-2.5 rounded-xl transition cursor-pointer"
                          >
                            إلغاء
                          </button>
                          <button
                            type="submit"
                            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition shadow-md shadow-indigo-100 cursor-pointer"
                          >
                            تأكيد وإضافة الطالب 💾
                          </button>
                        </div>
                      </form>
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>

              {/* Transfer Student Modal */}
              <AnimatePresence>
                {transferringStudent && (() => {
                  const uniqueGrades = Array.from(new Set(classes.filter(matchesCohort).map(c => c.grade))).filter(Boolean);
                  const gradesList = uniqueGrades.length > 0 ? uniqueGrades : ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس'];

                  const uniqueSections = Array.from(new Set(classes.filter(matchesCohort).map(c => {
                    if (c.name.includes('-')) return c.name.split('-')[1]?.trim();
                    if (c.name.includes('شعبة')) return c.name.split('شعبة')[1]?.trim();
                    return c.name.replace(c.grade, '').replace('الصف', '').trim();
                  }))).filter(Boolean);
                  const sectionsList = uniqueSections.length > 0 ? uniqueSections : ['أ', 'ب', 'ج', 'د'];

                  return (
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
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">1. الفوج الدراسي (الدفعة):</label>
                            <select
                              value={transferCohort}
                              onChange={e => setTransferCohort(e.target.value)}
                              className="w-full text-xs border border-slate-200 px-3.5 py-2.5 rounded-xl bg-white focus:border-indigo-500 focus:outline-none cursor-pointer"
                            >
                              <option value="الفوج الدراسي الحالي">الفوج الدراسي الحالي (2026/2027)</option>
                              <option value="الفوج الأول">الفوج الأول</option>
                              <option value="الفوج الثاني">الفوج الثاني</option>
                              <option value="الفوج الصباحي">الفوج الصباحي</option>
                              <option value="الفوج المسائي">الفوج المسائي</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">2. الصف الدراسي / المرحلة:</label>
                            <select
                              value={transferGrade}
                              onChange={e => setTransferGrade(e.target.value)}
                              className="w-full text-xs border border-slate-200 px-3.5 py-2.5 rounded-xl bg-white focus:border-indigo-500 focus:outline-none cursor-pointer"
                            >
                              <option value="">-- اختر الصف --</option>
                              {gradesList.map(g => (
                                <option key={g} value={g}>{g}</option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">3. الشعبة / الفصل:</label>
                            <select
                              value={transferSection}
                              onChange={e => setTransferSection(e.target.value)}
                              className="w-full text-xs border border-slate-200 px-3.5 py-2.5 rounded-xl bg-white focus:border-indigo-500 focus:outline-none cursor-pointer"
                            >
                              <option value="">-- اختر الشعبة --</option>
                              {sectionsList.map(s => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                          </div>

                          <div className="mt-4 p-3 bg-indigo-50 rounded-xl border border-indigo-100/50 text-center">
                            <p className="text-[10px] text-indigo-950 font-bold">الشعبة المستهدفة النهائية المطابقة بالنظام:</p>
                            <p className="text-xs font-bold text-indigo-600 mt-1 font-sans">
                              {classes.find(c => c.id === transferTargetClassId)?.name || '⚠️ لم يتم العثور على صف مطابق تماماً لهذه البيانات'}
                            </p>
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
                            disabled={!transferTargetClassId}
                            onClick={() => {
                              if (!transferTargetClassId) {
                                alert('يرجى التأكد من اختيار صف وشعبة صحيحة متطابقة مع الصفوف المفعلة بالنظام.');
                                return;
                              }
                              setStudents(prev => prev.map(s => s.id === transferringStudent.id ? { ...s, classId: transferTargetClassId } : s));
                              alert(`تم نقل الطالب ${transferringStudent.name} بنجاح إلى [${classes.find(c => c.id === transferTargetClassId)?.name}] (${transferCohort})!`);
                              setTransferringStudent(null);
                            }}
                            className="px-4 py-2 text-xs font-semibold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition shadow-sm cursor-pointer"
                          >
                            تأكيد النقل المباشر
                          </button>
                        </div>
                      </motion.div>
                    </div>
                  );
                })()}

                {editingStudent && (
                  <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 text-right"
                      style={{ direction: 'rtl' }}
                    >
                      <h3 className="font-bold text-slate-800 text-base mb-2 flex items-center gap-2">
                        <span>✏️ تعديل بيانات الطالب بالكامل والتحكم بالاسم</span>
                      </h3>
                      <p className="text-xs text-slate-500 mb-4">
                        يمكنك تعديل الاسم بالكامل، رقم القيد/الموحد، واسم ولي الأمر المرتبط للتعديل الشامل.
                      </p>
                      
                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1.5">اسم الطالب بالكامل:</label>
                          <input
                            type="text"
                            value={editingStudent.name}
                            onChange={e => setEditingStudent({ ...editingStudent, name: e.target.value })}
                            className="w-full text-xs border border-slate-200 px-3.5 py-2.5 rounded-xl bg-white focus:border-indigo-500 focus:outline-none"
                            placeholder="اسم الطالب الثلاثي"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">الرقم الموحد / رقم القيد:</label>
                            <input
                              type="text"
                              value={editingStudent.rollNo}
                              onChange={e => setEditingStudent({ ...editingStudent, rollNo: e.target.value })}
                              className="w-full text-xs border border-slate-200 px-3.5 py-2.5 rounded-xl bg-white focus:border-indigo-500 focus:outline-none font-mono"
                              placeholder="الرقم الموحد"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">تاريخ الميلاد:</label>
                            <input
                              type="date"
                              value={editingStudent.dob}
                              onChange={e => setEditingStudent({ ...editingStudent, dob: e.target.value })}
                              className="w-full text-xs border border-slate-200 px-3.5 py-2.5 rounded-xl bg-white focus:border-indigo-500 focus:outline-none font-mono"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1.5">اسم ولي الأمر المرتبط:</label>
                          <input
                            type="text"
                            value={editingStudent.parentName || ''}
                            onChange={e => setEditingStudent({ ...editingStudent, parentName: e.target.value })}
                            className="w-full text-xs border border-slate-200 px-3.5 py-2.5 rounded-xl bg-white focus:border-indigo-500 focus:outline-none"
                            placeholder="اسم ولي أمر الطالب"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1 justify-end">
                            <span>رقم واتساب ولي الأمر (📲):</span>
                          </label>
                          <input
                            type="tel"
                            value={editingStudentPhone}
                            onChange={e => setEditingStudentPhone(e.target.value)}
                            className="w-full text-xs border border-slate-200 px-3.5 py-2.5 rounded-xl bg-white focus:border-indigo-500 focus:outline-none font-mono text-right"
                            placeholder="أدخل رقم واتساب ولي الأمر (مثال: 0501234567)"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">الصف والشعبة:</label>
                            <select
                              value={editingStudent.classId}
                              onChange={e => setEditingStudent({ ...editingStudent, classId: e.target.value })}
                              className="w-full text-xs border border-slate-200 px-3.5 py-2.5 rounded-xl bg-white focus:border-indigo-500 focus:outline-none"
                            >
                              {classes.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">الجنس:</label>
                            <select
                              value={editingStudent.gender}
                              onChange={e => setEditingStudent({ ...editingStudent, gender: e.target.value as 'male' | 'female' })}
                              className="w-full text-xs border border-slate-200 px-3.5 py-2.5 rounded-xl bg-white focus:border-indigo-500 focus:outline-none"
                            >
                              <option value="male">ذكر</option>
                              <option value="female">أنثى</option>
                            </select>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex gap-2 mt-6 justify-end">
                        <button
                          type="button"
                          onClick={() => setEditingStudent(null)}
                          className="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 rounded-xl transition cursor-pointer"
                        >
                          إلغاء
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!editingStudent.name.trim()) {
                              alert('يرجى إدخال اسم الطالب');
                              return;
                            }
                            if (!editingStudent.rollNo.trim()) {
                              alert('يرجى إدخال الرقم الموحد');
                              return;
                            }
                            
                            // Save changes
                            const updatedStudents = students.map(s => s.id === editingStudent.id ? editingStudent : s);
                            setStudents(updatedStudents);
                            localStorage.setItem('school_students', JSON.stringify(updatedStudents));

                            // Sync with parent name and phone if found
                            const parentToSync = parents.find(p => p.id === editingStudent.parentId || p.childrenIds.includes(editingStudent.id));
                            if (parentToSync) {
                              const updatedParents = parents.map(p => {
                                if (p.id === parentToSync.id) {
                                  return { 
                                    ...p, 
                                    name: editingStudent.parentName || p.name,
                                    phone: editingStudentPhone || p.phone
                                  };
                                }
                                return p;
                              });
                              setParents(updatedParents);
                              localStorage.setItem('school_parents', JSON.stringify(updatedParents));
                            }

                            alert(`✅ تم حفظ تعديلات الطالب (${editingStudent.name}) بنجاح!`);
                            setEditingStudent(null);
                          }}
                          className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition shadow-sm cursor-pointer"
                        >
                          حفظ التعديلات 💾
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
                <span>طلبات الغياب والأعذار</span>
                <p className="text-slate-500 text-sm mt-1">
                  طلبات مرسلة مباشرة من أولياء الأمور لتبرير غياب أبنائهم. الموافقة عليها تعدل حالة التحضير فوراً في السجلات.
                </p>
              </div>

              <div className="space-y-4">
                {excuses.filter(e => {
                  const st = students.find(s => s.id === e.studentId);
                  return (st && matchesCohort(st)) || matchesCohort(e);
                }).map(excuse => (
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
                {announcements.filter(matchesCohort).map(ann => (
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

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">اختر الصف الدراسي للمعاينة والتحكم:</label>
                    <select
                      value={selectedClassForGrades}
                      onChange={e => setSelectedClassForGrades(e.target.value)}
                      className="w-full text-xs border border-slate-200 px-3.5 py-2.5 rounded-xl bg-white focus:border-indigo-500 focus:outline-none"
                    >
                      <option value="">-- اختر الصف الدراسي --</option>
                      {classes.filter(matchesCohort).map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2 flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={handleDownloadEmptyTemplate}
                      disabled={!selectedClassForGrades}
                      className="flex-1 text-xs font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 py-2.5 px-4 rounded-xl transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                    >
                      <Download className="w-4 h-4 text-slate-500" />
                      <span>نموذج رصد فارغ (Excel) 📥</span>
                    </button>

                    <div className="flex-1 relative">
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
                        className={`w-full text-xs font-bold py-2.5 px-4 rounded-xl border transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 ${
                          selectedClassForGrades
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100/80 shadow-xs'
                            : 'border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        <Upload className="w-4 h-4 text-emerald-600" />
                        <span>📥 استيراد الدرجات من ملف إكسل</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={handleSaveAndSendGradesToParents}
                      disabled={!selectedClassForGrades}
                      className={`flex-1 text-xs font-bold py-2.5 px-4 rounded-xl border transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 ${
                        selectedClassForGrades
                          ? 'border-indigo-200 bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs'
                          : 'border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed'
                      }`}
                    >
                      <Send className="w-4 h-4" />
                      <span>💾 حفظ وإرسال النتائج لأولياء الأمور</span>
                    </button>
                  </div>
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

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 self-stretch md:self-auto">
                      <button
                        type="button"
                        onClick={() => {
                          const savedCustomTemplate = localStorage.getItem('school_whatsapp_monthly_template');
                          const sampleName = 'محمد أحمد العتيبي';
                          const sampleClass = 'الصف الأول - الشعبة (أ)';
                          const sampleMonth = currentEvaluationMonth || 'شهر يناير';
                          const sampleGrades = '• 📘 *الرياضيات:* ❪ *95 /100* ❫\n• 📗 *العلوم:* ❪ *90 /100* ❫\n• 📙 *اللغة العربية:* ❪ *98 /100* ❫';
                          const sampleAvg = '94.3%';
                          const sampleEst = 'ممتاز مرتفع 🌟';
                          const samplePresent = '22';
                          const sampleAbsent = '1';
                          const sampleLate = '0';
                          const sampleTotalDays = '23';
                          const sampleAttendanceFormatted = `📌 *سجل الحضور والمواظبة:*
• 🟢 *حضور:* ❪ *${samplePresent} يوم* ❫ | 🔴 *غياب:* ❪ *${sampleAbsent} يوم* ❫ | 📊 *إجمالي:* ❪ *${sampleTotalDays} يوم* ❫`;

                          const sampleEval = `👨‍🏫 *توجيهات المعلم:* ❪ طالب متميز ومواظب ومتفوق في تحصيله العلمي 🌟 ❫
🏫 *توجيهات الإدارة:* ❪ شكر وتقدير من إدارة المدرسة لولي الأمر على المتابعة الدائمة 🏫 ❫`;

                          const defaultGenerated = `💚 *المدرسة الدولية الخاصة* 💚
📜 *التقييم والتقرير الشهري للدرجات*
─────────────────────────
🌹 *السلام عليكم ورحمة الله وبركاته*
إلى ولي أمر الطالب/ة المحترم:

👤 *الطالب:* *${sampleName}* | 🏫 *الصف:* *${sampleClass}* | 📅 *شهر:* *[${sampleMonth}]*

📚 *نتائج ودرجات المواد الدراسية:*
${sampleGrades}

📊 *المعدل العام:* ❪ *${sampleAvg}* ❫ | 🌟 *التقدير النهائي:* *${sampleEst}*

📌 *سجل الحضور والمواظبة:*
• 🟢 *حضور:* ❪ *${samplePresent} يوم* ❫ | 🔴 *غياب:* ❪ *${sampleAbsent} يوم* ❫ | 📊 *إجمالي:* ❪ *${sampleTotalDays} يوم* ❫

📝 *توجيهات وتقارير المتابعة:*
${sampleEval}
─────────────────────────
✨ *شاكرين لكم حسن التعاون والمتابعة* | 🏫 *إدارة المدرسة*`;

                          let initialMsg = defaultGenerated;
                          if (savedCustomTemplate) {
                            let tpl = savedCustomTemplate;
                            if (!tpl.includes('{كشف_الدرجات}') && !tpl.includes('{الدرجات}') && !tpl.includes('{نتائج_المواد}')) {
                              tpl = tpl.replace(/(?:•\s*(?:📘|📗|📙|📕|📚|\*)*[\s\S]*?(?:العلامة|الدرجة|\/100|\/ 100)[\s\S]*?\n?)+/gi, '{كشف_الدرجات}\n');
                            }

                            initialMsg = tpl
                              .replace(/{اسم_الطالب}/g, sampleName)
                              .replace(/{الصف}/g, sampleClass)
                              .replace(/{الشهر}/g, sampleMonth)
                              .replace(/{الدرجات}/g, sampleGrades)
                              .replace(/{كشف_الدرجات}/g, sampleGrades)
                              .replace(/{نتائج_المواد}/g, sampleGrades)
                              .replace(/{المعدل}/g, sampleAvg)
                              .replace(/{المعدل_العام}/g, sampleAvg)
                              .replace(/{التقدير}/g, sampleEst)
                              .replace(/{التقدير_النهائي}/g, sampleEst)
                              .replace(/{التقدير_العام}/g, sampleEst)
                              .replace(/{توجيهات_المعلم}/g, 'طالب متميز ومواظب ومتفوق في تحصيله العلمي. 🌟')
                              .replace(/{توجيهات_الإدارة}/g, 'شكر وتقدير من إدارة المدرسة لولي الأمر على المتابعة الدائمة. 🏫')
                              .replace(/{توجيهات_الادارة}/g, 'شكر وتقدير من إدارة المدرسة لولي الأمر على المتابعة الدائمة. 🏫')
                              .replace(/{ملاحظات_الإدارة}/g, 'شكر وتقدير من إدارة المدرسة لولي الأمر على المتابعة الدائمة. 🏫')
                              .replace(/{التقييم}/g, sampleEval)
                              .replace(/{توجيهات}/g, sampleEval)
                              .replace(/{التوجيهات}/g, sampleEval)
                              .replace(/{تقرير_المتابعة}/g, sampleEval)
                              .replace(/{أيام_الحضور}/g, samplePresent)
                              .replace(/{أيام_الغياب}/g, sampleAbsent)
                              .replace(/{أيام_التأخر}/g, sampleLate)
                              .replace(/{إجمالي_الأيام}/g, sampleTotalDays)
                              .replace(/{أيام_الدوام}/g, sampleTotalDays)
                              .replace(/{تقرير_الحضور}/g, sampleAttendanceFormatted)
                              .replace(/{سجل_الحضور}/g, sampleAttendanceFormatted);
                          }

                          setWaModalState({
                            isOpen: true,
                            studentName: sampleName,
                            recipientPhone: '0501234567',
                            initialMessage: initialMsg,
                            defaultTemplateText: defaultGenerated,
                            waKey: 'preview_template',
                            studentId: 'sample'
                          });
                        }}
                        className="text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 py-2 px-3.5 rounded-xl transition cursor-pointer shadow-2xs flex items-center justify-center gap-1.5"
                        title="تخصيص صياغة وقالب رسائل الواتساب لأولياء الأمور"
                      >
                        <span>⚙️ تخصيص صياغة رسائل الواتساب</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleSaveAndSendGradesToParents}
                        className="text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded-xl transition cursor-pointer shadow-xs flex items-center justify-center gap-1.5"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>💾 حفظ وإرسال النتائج لأولياء الأمور</span>
                      </button>

                      <div className="flex items-center gap-3 bg-indigo-50/50 border border-indigo-100/60 p-2 sm:py-1.5 rounded-2xl">
                        <span className="text-[11px] font-bold text-indigo-950 whitespace-nowrap">📋 التقييم الشهري لشهر:</span>
                        {!isAddingNewMonth ? (
                          <select
                            value={currentEvaluationMonth}
                            onChange={e => {
                              if (e.target.value === 'add_new') {
                                setIsAddingNewMonth(true);
                                setNewMonthName('');
                              } else {
                                setCurrentEvaluationMonth(e.target.value);
                                localStorage.setItem('school_evaluation_current_month', e.target.value);
                              }
                            }}
                            className="bg-white border border-indigo-200 rounded-xl px-2 py-1 text-indigo-900 text-[11px] font-black focus:outline-none focus:ring-2 focus:ring-indigo-500 text-center cursor-pointer min-w-[120px]"
                          >
                            {savedEvaluationMonths.map(m => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                            <option value="add_new" className="text-indigo-600 font-bold">➕ إضافة شهر جديد...</option>
                          </select>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={newMonthName}
                              onChange={e => setNewMonthName(e.target.value)}
                              placeholder="اكتب الشهر..."
                              className="bg-white border border-indigo-200 rounded-xl px-2 py-1 text-indigo-900 text-[11px] font-bold w-24 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-center"
                              autoFocus
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  handleAddNewMonth();
                                }
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => handleAddNewMonth()}
                              className="bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold px-2 py-1 rounded-lg transition cursor-pointer"
                            >
                              حفظ
                            </button>
                            <button
                              type="button"
                              onClick={() => setIsAddingNewMonth(false)}
                              className="bg-slate-200 hover:bg-slate-300 text-slate-700 text-[10px] font-bold px-2 py-1 rounded-lg transition cursor-pointer"
                            >
                              إلغاء
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    {(() => {
                      const classStudentIds = new Set(students.filter(s => s.classId === selectedClassForGrades).map(s => s.id));
                      const baseSubs = (customSubjects && customSubjects.length > 0)
                        ? customSubjects 
                        : ['الرياضيات', 'العلوم', 'اللغة العربية', 'التربية الإسلامية', 'اللغة الإنجليزية', 'الاجتماعيات'];
                      const recordedClassSubs = grades
                        .filter(g => classStudentIds.has(g.studentId) && (g.examName === currentEvaluationMonth || !g.examName))
                        .map(g => g.subject)
                        .filter(Boolean);
                      const uniqueSubjects = Array.from(new Set([...baseSubs, ...recordedClassSubs]));

                      return (
                        <table className="w-full text-right border-collapse">
                          <thead>
                            <tr className="bg-slate-50 text-slate-600 text-xs font-semibold border-b border-slate-100">
                              <th className="p-4">رقم القيد</th>
                              <th className="p-4">اسم الطالب</th>
                              {uniqueSubjects.map(sub => (
                                <th key={sub} className="p-4 text-center">{sub}</th>
                              ))}
                              <th className="p-4 text-center">المعدل</th>
                              <th className="p-4 text-center">التقدير</th>
                              <th className="p-4 text-center min-w-[180px]">توجيهات المعلم</th>
                              <th className="p-4 text-center min-w-[180px]">توجيهات الإدارة</th>
                              <th className="p-4 text-center min-w-[210px]">إرسال التقييم عبر واتساب 📲</th>
                              <th className="p-4 text-center min-w-[320px]">
                                <span className="text-slate-600 block text-xs">حجب كشف الدرجات للطلب</span>
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-slate-700 text-xs">
                            {students.filter(s => s.classId === selectedClassForGrades).map(student => {
                              const studentGrades = grades.filter(g => g.studentId === student.id && (g.examName === currentEvaluationMonth || !g.examName));
                              
                              let totalScore = 0;
                              let scoredCount = 0;
                              
                              const evalForMonth = monthlyEvaluations[`${student.id}_${currentEvaluationMonth}`] || 
                                (monthlyEvaluations[student.id]?.month === currentEvaluationMonth ? monthlyEvaluations[student.id] : null) ||
                                monthlyEvaluations[student.id];

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
                                  <td key={sub} className="p-2 text-center font-semibold text-slate-700 min-w-[70px]">
                                    <input
                                      type="number"
                                      min="0"
                                      max="100"
                                      value={subGrade ? subGrade.score : ''}
                                      onChange={e => {
                                        const valStr = e.target.value.trim();
                                        const score = valStr === '' ? 0 : parseFloat(valStr) || 0;
                                        setGrades(prev => {
                                          const copy = [...prev];
                                          const idx = copy.findIndex(g => g.studentId === student.id && g.subject === sub && g.examName === currentEvaluationMonth);
                                          if (idx !== -1) {
                                            copy[idx] = {
                                              ...copy[idx],
                                              score: score
                                            };
                                          } else {
                                            copy.push({
                                              id: 'g_dir_edt_' + Date.now() + Math.random().toString(36).substring(2, 7),
                                              studentId: student.id,
                                              subject: sub,
                                              examName: currentEvaluationMonth,
                                              score: score,
                                              maxScore: 100,
                                              date: new Date().toISOString().split('T')[0],
                                              teacherId: 'director'
                                            });
                                          }
                                          localStorage.setItem('school_grades', JSON.stringify(copy));
                                          return copy;
                                        });
                                      }}
                                      className="w-12 text-center border border-slate-200 hover:border-indigo-450 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-100 rounded-lg p-1 text-xs font-bold font-mono focus:outline-none"
                                      placeholder="---"
                                    />
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
                              {/* Teacher Directives Column */}
                              <td className="p-2 text-center min-w-[180px]">
                                <textarea
                                  rows={1}
                                  value={evalForMonth?.teacherText !== undefined ? evalForMonth.teacherText : (evalForMonth?.text || '')}
                                  onChange={e => {
                                    const val = e.target.value;
                                    const currentTeacher = val;
                                    const currentDirector = evalForMonth?.directorText || '';
                                    const updated = {
                                      ...monthlyEvaluations,
                                      [`${student.id}_${currentEvaluationMonth}`]: {
                                        ...evalForMonth,
                                        month: currentEvaluationMonth,
                                        teacherText: currentTeacher,
                                        directorText: currentDirector,
                                        text: currentTeacher
                                      },
                                      [student.id]: {
                                        ...monthlyEvaluations[student.id],
                                        month: currentEvaluationMonth,
                                        teacherText: currentTeacher,
                                        directorText: currentDirector,
                                        text: currentTeacher
                                      }
                                    };
                                    setMonthlyEvaluations(updated);
                                    localStorage.setItem('school_monthly_evaluations', JSON.stringify(updated));
                                  }}
                                  className="w-full text-xs border border-slate-200 hover:border-indigo-400 focus:border-indigo-600 rounded-lg p-1.5 focus:outline-none text-right bg-slate-50/50 focus:bg-white"
                                  placeholder="توجيهات المعلم..."
                                />
                              </td>
                              {/* Director Directives Column */}
                              <td className="p-2 text-center min-w-[180px]">
                                <textarea
                                  rows={1}
                                  value={evalForMonth?.directorText || ''}
                                  onChange={e => {
                                    const val = e.target.value;
                                    const currentTeacher = evalForMonth?.teacherText !== undefined ? evalForMonth.teacherText : (evalForMonth?.text || '');
                                    const currentDirector = val;
                                    const updated = {
                                      ...monthlyEvaluations,
                                      [`${student.id}_${currentEvaluationMonth}`]: {
                                        ...evalForMonth,
                                        month: currentEvaluationMonth,
                                        teacherText: currentTeacher,
                                        directorText: currentDirector,
                                        text: currentTeacher
                                      },
                                      [student.id]: {
                                        ...monthlyEvaluations[student.id],
                                        month: currentEvaluationMonth,
                                        teacherText: currentTeacher,
                                        directorText: currentDirector,
                                        text: currentTeacher
                                      }
                                    };
                                    setMonthlyEvaluations(updated);
                                    localStorage.setItem('school_monthly_evaluations', JSON.stringify(updated));
                                  }}
                                  className="w-full text-xs border border-slate-200 hover:border-indigo-400 focus:border-indigo-600 rounded-lg p-1.5 focus:outline-none text-right bg-amber-50/30 focus:bg-white"
                                  placeholder="توجيهات الإدارة..."
                                />
                              </td>
                              {/* WhatsApp Send Column with Status Indicator */}
                              <td className="p-2 text-center min-w-[180px]">
                                {(() => {
                                  const waKey = `${student.id}_monthly_${currentEvaluationMonth}`;
                                  const waRecord = whatsappSentRecords[waKey];
                                  const parent = parents.find(p => p.childrenIds.includes(student.id) || p.id === student.parentId);
                                  const parentPhone = parent?.phone || '';
                                  const teacherText = evalForMonth?.teacherText !== undefined ? evalForMonth.teacherText : (evalForMonth?.text || '');
                                  const directorText = evalForMonth?.directorText || '';

                                  return (
                                    <div className="flex flex-col items-center gap-1 w-full">
                                      {waRecord ? (
                                        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-2 rounded-xl text-[10px] font-bold w-full text-center space-y-1.5 shadow-2xs">
                                          <div className="flex items-center justify-center gap-1 text-emerald-700">
                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                            <span>تم الإرسال عبر الواتس ✅</span>
                                          </div>
                                          <div className="text-[9px] text-emerald-600 font-mono dir-ltr text-center">
                                            {waRecord.timeLabel} ({waRecord.dateLabel})
                                          </div>
                                          <div className="flex items-center gap-1 mt-1">
                                            <button
                                              type="button"
                                              onClick={() => handleSendMonthlyWhatsApp(student, parentPhone, currentEvaluationMonth, evalForMonth?.text, studentGrades, uniqueSubjects, totalScore, scoredCount, teacherText, directorText, true)}
                                              className="flex-1 text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1 px-2 rounded-lg transition cursor-pointer flex items-center justify-center gap-1 shadow-2xs"
                                              title="إعادة إرسال مباشرة عبر الواتساب ونسخ النص"
                                            >
                                              <MessageSquare className="w-3 h-3" />
                                              <span>إعادة إرسال 📲</span>
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleSendMonthlyWhatsApp(student, parentPhone, currentEvaluationMonth, evalForMonth?.text, studentGrades, uniqueSubjects, totalScore, scoredCount, teacherText, directorText, false)}
                                              className="bg-white hover:bg-slate-100 text-slate-700 font-bold text-[10px] py-1 px-1.5 rounded-lg transition cursor-pointer border border-slate-300 shrink-0"
                                              title="تعديل صياغة النص قبل الإرسال"
                                            >
                                              ✏️
                                            </button>
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-1 w-full">
                                          <button
                                            type="button"
                                            onClick={() => handleSendMonthlyWhatsApp(student, parentPhone, currentEvaluationMonth, evalForMonth?.text, studentGrades, uniqueSubjects, totalScore, scoredCount, teacherText, directorText, true)}
                                            className="flex-1 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs py-2 px-2.5 rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
                                            title="إرسال تقرير الدرجات مباشرة عبر الواتساب ونسخ النص تلقائياً"
                                          >
                                            <MessageSquare className="w-4 h-4" />
                                            <span>إرسال عبر الواتس 📲</span>
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleSendMonthlyWhatsApp(student, parentPhone, currentEvaluationMonth, evalForMonth?.text, studentGrades, uniqueSubjects, totalScore, scoredCount, teacherText, directorText, false)}
                                            className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-2 px-2 rounded-xl transition cursor-pointer border border-slate-300 shrink-0"
                                            title="تعديل صياغة النص قبل الإرسال"
                                          >
                                            ✏️
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}
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
                      );
                    })()}
                  </div>
                </div>
              ) : (
                <div className="bg-slate-50 border border-slate-100 p-8 rounded-2xl text-center text-slate-500 text-sm">
                  الرجاء تحديد الصف الدراسي من القائمة أعلاه لمعاينة كشوف الدرجات.
                </div>
              )}
            </motion.div>
          )}

          {/* Attendance Management Tab */}
          {activeTab === 'attendance' && (
            <motion.div
              key="attendance-management"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-6 text-right"
              style={{ direction: 'rtl' }}
            >
              {/* Top Banner & Info */}
              <div className="bg-gradient-to-l from-emerald-900 to-slate-900 text-slate-100 p-6 rounded-3xl shadow-md border border-slate-850">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-bold flex items-center gap-2 justify-end">
                      <span>سجل الحضور والغياب الموحد 📅</span>
                    </h3>
                    <p className="text-slate-400 text-xs mt-1 leading-relaxed text-right">
                      رصد ومتابعة الانضباط اليومي لجميع الفصول الدراسية. عند تحديث السجل وحفظه، سيتم إرسال إشعارات فورية لهواتف أولياء الأمور وتحديث تطبيق ولي الأمر تلقائياً.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 justify-end">
                    <button
                      onClick={handleExportAttendanceToExcel}
                      disabled={!selectedClassForAttendance}
                      className="bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 border border-slate-700 text-xs font-semibold py-2 px-4 rounded-xl transition cursor-pointer flex items-center gap-1.5"
                    >
                      <Download className="w-4 h-4" />
                      <span>تصدير تقرير Excel 📊</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Selection Panel & Batch Operations */}
              <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Select Class */}
                  <div>
                    <label className="block text-slate-500 text-xs font-semibold mb-2 text-right">الصف والشعبة الدراسية</label>
                    <select
                      value={selectedClassForAttendance}
                      onChange={(e) => setSelectedClassForAttendance(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 hover:border-indigo-400 rounded-xl px-3 py-2.5 text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-100 transition text-right"
                    >
                      <option value="">-- اختر الصف --</option>
                      {classes.filter(matchesCohort).map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Select Date */}
                  <div>
                    <label className="block text-slate-500 text-xs font-semibold mb-2 text-right">تاريخ التحضير</label>
                    <input
                      type="date"
                      value={attendanceDateForDir}
                      onChange={(e) => setAttendanceDateForDir(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 hover:border-indigo-400 rounded-xl px-3 py-2.5 text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-100 transition text-right"
                    />
                  </div>

                  {/* Batch Actions */}
                  <div className="flex flex-col justify-end">
                    <span className="block text-slate-500 text-[10px] font-bold mb-2 text-right">عمليات جماعية سريعة</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          const updated = { ...localAttendanceForDir };
                          Object.keys(updated).forEach(studentId => {
                            updated[studentId] = { ...updated[studentId], status: 'present' };
                          });
                          setLocalAttendanceForDir(updated);
                        }}
                        disabled={!selectedClassForAttendance}
                        className="flex-1 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold py-2.5 px-3 rounded-xl transition cursor-pointer text-center"
                      >
                        حضور الجميع ✅
                      </button>
                      <button
                        onClick={() => {
                          const updated = { ...localAttendanceForDir };
                          Object.keys(updated).forEach(studentId => {
                            updated[studentId] = { ...updated[studentId], status: 'absent' };
                          });
                          setLocalAttendanceForDir(updated);
                        }}
                        disabled={!selectedClassForAttendance}
                        className="flex-1 bg-rose-50 hover:bg-rose-100 disabled:opacity-50 text-rose-700 border border-rose-200 text-[11px] font-bold py-2.5 px-3 rounded-xl transition cursor-pointer text-center"
                      >
                        غياب الجميع ⚠️
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {selectedClassForAttendance ? (() => {
                const classStudents = students.filter(s => s.classId === selectedClassForAttendance);
                
                // Calculate Statistics
                const totalCount = classStudents.length;
                let presentCount = 0;
                let absentCount = 0;
                let lateCount = 0;
                let excusedCount = 0;

                classStudents.forEach(s => {
                  const record = localAttendanceForDir[s.id] || { status: 'present' };
                  if (record.status === 'present') presentCount++;
                  else if (record.status === 'absent') absentCount++;
                  else if (record.status === 'late') lateCount++;
                  else if (record.status === 'excused') excusedCount++;
                });

                return (
                  <div className="space-y-6">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex items-center justify-between">
                        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-slate-500">
                          <Users className="w-5 h-5" />
                        </div>
                        <div className="text-left">
                          <span className="text-[10px] text-slate-400 font-bold block text-left">إجمالي الطلاب</span>
                          <span className="text-xl font-extrabold text-slate-800 block mt-1">{totalCount} طالب</span>
                        </div>
                      </div>

                      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex items-center justify-between">
                        <div className="bg-emerald-50 p-2.5 rounded-xl border border-emerald-100 text-emerald-600">
                          <Check className="w-5 h-5" />
                        </div>
                        <div className="text-left">
                          <span className="text-[10px] text-slate-400 font-bold block text-left">الحاضرين</span>
                          <span className="text-xl font-extrabold text-emerald-600 block mt-1">{presentCount} طالب</span>
                        </div>
                      </div>

                      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex items-center justify-between">
                        <div className="bg-rose-50 p-2.5 rounded-xl border border-rose-100 text-rose-500">
                          <X className="w-5 h-5" />
                        </div>
                        <div className="text-left">
                          <span className="text-[10px] text-slate-400 font-bold block text-left">الغائبين</span>
                          <span className="text-xl font-extrabold text-rose-500 block mt-1">{absentCount} طالب</span>
                        </div>
                      </div>

                      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex items-center justify-between">
                        <div className="bg-indigo-50 p-2.5 rounded-xl border border-indigo-100 text-indigo-600">
                          <Calendar className="w-5 h-5" />
                        </div>
                        <div className="text-left">
                          <span className="text-[10px] text-slate-400 font-bold block text-left">متأخرين ومعذورين</span>
                          <span className="text-xl font-extrabold text-indigo-600 block mt-1">{lateCount + excusedCount} طالب</span>
                        </div>
                      </div>
                    </div>

                    {/* Students Checklist Table */}
                    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                      <div className="p-5 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between">
                        <span className="text-[11px] text-slate-500 font-medium">التاريخ المحدد: {attendanceDateForDir}</span>
                        <span className="text-xs text-slate-700 font-bold">قائمة طلاب الصف ورصد حضورهم</span>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-right">
                          <thead>
                            <tr className="bg-slate-50/30 text-slate-500 text-xs font-bold border-b border-slate-100">
                              <th className="p-4 w-24 text-right">رقم القيد</th>
                              <th className="p-4 text-right">اسم الطالب</th>
                              <th className="p-4 hidden sm:table-cell text-right">ولي الأمر والتواصل</th>
                              <th className="p-4 text-center w-80">حالة الحضور والغياب</th>
                              <th className="p-4 text-right w-72">ملاحظات إضافية</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                            {classStudents.map(student => {
                              const record = localAttendanceForDir[student.id] || { status: 'present', notes: '' };
                              const parent = parents.find(p => p.childrenIds.includes(student.id));

                              return (
                                <tr key={student.id} className="hover:bg-slate-50/30 transition-colors">
                                  {/* Roll No */}
                                  <td className="p-4 font-mono font-medium text-slate-500 text-right">
                                    {student.rollNo}
                                  </td>

                                  {/* Name */}
                                  <td className="p-4 font-bold text-slate-800 text-right">
                                    {student.name}
                                  </td>

                                  {/* Parent Info */}
                                  <td className="p-4 text-slate-500 hidden sm:table-cell text-right">
                                    {parent ? (
                                      <div className="space-y-0.5">
                                        <p className="font-semibold text-slate-600">{parent.name}</p>
                                        <p className="text-[10px] font-mono text-slate-400">{parent.phone}</p>
                                      </div>
                                    ) : (
                                      <span className="text-slate-400 italic">غير متوفر</span>
                                    )}
                                  </td>

                                  {/* Status Selector */}
                                  <td className="p-4 text-center">
                                    <div className="flex items-center justify-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-100 max-w-sm mx-auto">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setLocalAttendanceForDir(prev => ({
                                            ...prev,
                                            [student.id]: { ...record, status: 'present' }
                                          }));
                                        }}
                                        className={`flex-1 py-1.5 px-2 rounded-lg font-bold text-[11px] transition-all duration-200 cursor-pointer ${
                                          record.status === 'present'
                                            ? 'bg-emerald-600 text-white shadow-xs'
                                            : 'text-slate-500 hover:bg-slate-200/50'
                                        }`}
                                      >
                                        حاضر
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setLocalAttendanceForDir(prev => ({
                                            ...prev,
                                            [student.id]: { ...record, status: 'absent' }
                                          }));
                                        }}
                                        className={`flex-1 py-1.5 px-2 rounded-lg font-bold text-[11px] transition-all duration-200 cursor-pointer ${
                                          record.status === 'absent'
                                            ? 'bg-rose-500 text-white shadow-xs'
                                            : 'text-slate-500 hover:bg-slate-200/50'
                                        }`}
                                      >
                                        غائب
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setLocalAttendanceForDir(prev => ({
                                            ...prev,
                                            [student.id]: { ...record, status: 'late' }
                                          }));
                                        }}
                                        className={`flex-1 py-1.5 px-2 rounded-lg font-bold text-[11px] transition-all duration-200 cursor-pointer ${
                                          record.status === 'late'
                                            ? 'bg-amber-500 text-white shadow-xs'
                                            : 'text-slate-500 hover:bg-slate-200/50'
                                        }`}
                                      >
                                        متأخر
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setLocalAttendanceForDir(prev => ({
                                            ...prev,
                                            [student.id]: { ...record, status: 'excused' }
                                          }));
                                        }}
                                        className={`flex-1 py-1.5 px-2 rounded-lg font-bold text-[11px] transition-all duration-200 cursor-pointer ${
                                          record.status === 'excused'
                                            ? 'bg-indigo-600 text-white shadow-xs'
                                            : 'text-slate-500 hover:bg-slate-200/50'
                                        }`}
                                      >
                                        بعذر
                                      </button>
                                    </div>
                                  </td>

                                  {/* Notes */}
                                  <td className="p-4 text-right">
                                    <input
                                      type="text"
                                      placeholder="ملاحظات صحية، إذن تأخير..."
                                      value={record.notes}
                                      onChange={(e) => {
                                        setLocalAttendanceForDir(prev => ({
                                          ...prev,
                                          [student.id]: { ...record, notes: e.target.value }
                                        }));
                                      }}
                                      className="w-full bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:bg-white transition text-right"
                                    />
                                  </td>
                                </tr>
                              );
                            })}

                            {classStudents.length === 0 && (
                              <tr>
                                <td colSpan={5} className="p-8 text-center text-slate-400 italic">
                                  لا يوجد طلاب مضافين لهذا الصف بعد. يمكنك إضافة طلاب من صفحة "شؤون الطلاب".
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      {classStudents.length > 0 && (
                        <div className="p-5 bg-slate-50/50 border-t border-slate-100 flex justify-end">
                          <button
                            type="button"
                            onClick={handleSaveAttendanceForDir}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-3 px-8 rounded-xl shadow-md shadow-indigo-100 hover:shadow-lg transition cursor-pointer flex items-center gap-2"
                          >
                            <Check className="w-4 h-4" />
                            <span>حفظ وإرسال التنبيهات لأولياء الأمور 📲</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })() : (
                <div className="bg-white p-12 rounded-3xl border border-slate-100 text-center text-slate-400 font-medium shadow-sm space-y-2">
                  <p>⚠️ لم يتم تحديد صف دراسي للمعاينة بعد.</p>
                  <p className="text-[11px] text-slate-400/80">يرجى اختيار الصف والشعبة وتاريخ التحضير من الخيارات في الأعلى للبدء برصد الحضور والغياب.</p>
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
                  {classes.filter(matchesCohort).map(cls => {
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

                    {directorChatRecipientRole === 'parent' && (
                      <div className="bg-sky-50/50 p-3 rounded-2xl border border-sky-100/60 space-y-2">
                        <label className="block text-[11px] font-bold text-sky-800">🏫 فلترة أولياء الأمور حسب الصف والشعبة:</label>
                        <select
                          value={chatSelectedClassId}
                          onChange={e => {
                            setChatSelectedClassId(e.target.value);
                            setDirectorChatRecipientId('');
                          }}
                          className="w-full text-xs border border-sky-200 px-3 py-2 rounded-xl bg-white focus:outline-none focus:border-sky-500 font-semibold text-slate-700"
                        >
                          <option value="all">📁 جميع الصفوف والشعب</option>
                          {classes.filter(matchesCohort).map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                        {directorChatRecipientRole === 'teacher' ? 'اختر المعلم المستلم *' : 'اختر ولي الأمر المستلم *'}
                      </label>
                      <select
                        value={directorChatRecipientId}
                        onChange={e => setDirectorChatRecipientId(e.target.value)}
                        className="w-full text-xs border border-slate-200 px-3 py-2.5 rounded-xl bg-white focus:outline-none focus:border-indigo-500 font-semibold"
                        required
                      >
                        <option value="">-- اختر من القائمة --</option>
                        {directorChatRecipientRole === 'teacher' 
                          ? teachers.filter(matchesCohort).map(t => (
                              <option key={t.id} value={t.id}>{t.name} ({t.subjects.join('، ')})</option>
                            ))
                          : parents
                              .filter(p => {
                                const parentStudents = students.filter(s => (s.parentId === p.id || p.childrenIds.includes(s.id)) && matchesCohort(s));
                                if (parentStudents.length === 0) return false;
                                if (chatSelectedClassId === 'all') return true;
                                return parentStudents.some(s => s.classId === chatSelectedClassId);
                              })
                              .map(p => {
                                const children = students.filter(s => (s.parentId === p.id || p.childrenIds.includes(s.id)) && matchesCohort(s));
                                const childrenNames = children.map(s => `${s.name} (${classes.find(c => c.id === s.classId)?.name || ''})`).join('، ');
                                return (
                                  <option key={p.id} value={p.id}>
                                    {p.name} {childrenNames ? `[أبناؤه: ${childrenNames}]` : ''} ({p.phone})
                                  </option>
                                );
                              })
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
                  <div className="border-b border-slate-100 pb-3 flex justify-between items-center gap-3">
                    <div className="text-right">
                      <h4 className="font-bold text-slate-800 text-sm">📥 الوارد والصادر (أحدث الرسائل والإشعارات)</h4>
                      <p className="text-[10px] text-slate-400 mt-0.5">انقر على أي رسالة لتحديدها كمقروءة وإخفائها من شريط العدادات العلوي.</p>
                    </div>
                    {messages.filter(m => m.receiverRole === 'director' && !m.read).length > 0 && (
                      <button
                        onClick={markAllAsRead}
                        className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-lg border border-emerald-200 text-[10px] font-bold transition flex items-center gap-1 cursor-pointer"
                      >
                        <span>تحديد الكل كمقروء 👁️</span>
                      </button>
                    )}
                  </div>

                  {/* فلترة متقدمة للرسائل والمراسلات */}
                  <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/60 grid grid-cols-1 sm:grid-cols-2 gap-3" style={{ direction: 'rtl' }}>
                    {/* فلترة اتجاه المراسلات (الوارد والصادر) */}
                    <div className="space-y-1">
                      <label className="block text-[10px] font-extrabold text-slate-500">اتجاه المراسلات:</label>
                      <div className="grid grid-cols-3 gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
                        <button
                          type="button"
                          onClick={() => setMsgDirectionFilter('all')}
                          className={`text-[10px] font-bold py-1.5 rounded-lg transition cursor-pointer ${msgDirectionFilter === 'all' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-50'}`}
                        >
                          🔄 الكل
                        </button>
                        <button
                          type="button"
                          onClick={() => setMsgDirectionFilter('incoming')}
                          className={`text-[10px] font-bold py-1.5 rounded-lg transition cursor-pointer ${msgDirectionFilter === 'incoming' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-50'}`}
                        >
                          📥 الوارد
                        </button>
                        <button
                          type="button"
                          onClick={() => setMsgDirectionFilter('outgoing')}
                          className={`text-[10px] font-bold py-1.5 rounded-lg transition cursor-pointer ${msgDirectionFilter === 'outgoing' ? 'bg-indigo-500 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-50'}`}
                        >
                          📤 الصادر
                        </button>
                      </div>
                    </div>

                    {/* فلترة نوع الإشعار */}
                    <div className="space-y-1">
                      <label className="block text-[10px] font-extrabold text-slate-500">نوع الإشعار والرسالة:</label>
                      <select
                        value={msgTypeFilter}
                        onChange={e => setMsgTypeFilter(e.target.value as any)}
                        className="w-full text-[11px] font-bold border border-slate-200 px-3 py-1.5 rounded-xl bg-white focus:outline-none focus:border-indigo-500 text-slate-700 h-[34px]"
                      >
                        <option value="all">📁 جميع الأنواع والإشعارات</option>
                        <option value="general">💬 رسائل عامة</option>
                        <option value="admin">🏛️ توجيهات إدارية</option>
                        <option value="warning">⚠️ تنبيهات هامة</option>
                        <option value="financial">💳 إشعارات مالية وأقساط</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-3 max-h-[500px] overflow-y-auto p-1">
                    {(() => {
                      const filtered = messages
                        .filter(m => matchesCohort(m) && (m.receiverRole === 'director' || m.senderRole === 'director' || m.senderRole === 'parent'))
                        .filter(m => {
                          // 1. Direction Filter
                          if (msgDirectionFilter === 'incoming' && m.receiverRole !== 'director') return false;
                          if (msgDirectionFilter === 'outgoing' && m.senderRole !== 'director') return false;
                          
                          // 2. Type Filter
                          if (msgTypeFilter === 'all') return true;
                          
                          const content = m.content || '';
                          if (msgTypeFilter === 'admin') {
                            return content.includes('[توجيه إداري]');
                          }
                          if (msgTypeFilter === 'warning') {
                            return content.includes('[تنبيه هام]');
                          }
                          if (msgTypeFilter === 'financial') {
                            return content.includes('إشعار مالي') || content.includes('كشف سجل الأقساط') || content.includes('أمريكي') || content.includes('الأقساط') || content.includes('الدفعات');
                          }
                          if (msgTypeFilter === 'general') {
                            return !content.includes('[توجيه إداري]') && 
                                   !content.includes('[تنبيه هام]') && 
                                   !content.includes('إشعار مالي') && 
                                   !content.includes('الأقساط') && 
                                   !content.includes('الدفعات');
                          }
                          return true;
                        });

                      if (filtered.length === 0) {
                        return (
                          <div className="text-center py-12 text-slate-400 text-xs italic">
                            لا توجد رسائل تطابق معايير الفلترة المحددة حالياً.
                          </div>
                        );
                      }

                      return filtered
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
                              <div className="flex items-center gap-1.5 flex-wrap">
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
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingMessage(msg);
                                    setEditMessageContent(msg.content);
                                  }}
                                  className="bg-amber-50 text-amber-700 hover:bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-200 text-[10px] font-bold transition flex items-center gap-1 shadow-xs cursor-pointer"
                                  title="تعديل الرسالة"
                                >
                                  <span>✏️ تعديل</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteSingleItem('messages', msg.id);
                                  }}
                                  className="bg-rose-50 text-rose-700 hover:bg-rose-100 px-2.5 py-1 rounded-lg border border-rose-200 text-[10px] font-bold transition flex items-center gap-1 shadow-xs cursor-pointer"
                                  title="حذف الرسالة"
                                >
                                  <span>🗑️ حذف</span>
                                </button>
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
                      });
                    })()}


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
                    <span className="text-xs text-slate-400 font-semibold font-sans">إجمالي عدد الشعب المفعلة: {classes.filter(matchesCohort).length}</span>
                    <h4 className="font-bold text-slate-800 text-sm">قائمة الصفوف والشعب المفعلة بالمنصة 📋</h4>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[500px] overflow-y-auto p-1">
                    {classes.filter(matchesCohort).map(cls => {
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

          {/* Data Cleanup & Anti-Accumulation Tab */}
          {activeTab === 'data-cleanup' && (
            <motion.div
              key="data-cleanup"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-6 text-right"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-rose-800">تنظيف وحذف التراكمات 🧹</h1>
                  <p className="text-slate-500 text-sm mt-1">
                    أداة تحكم متقدمة ومباشرة للمدير لحذف أي سجلات أو درجات أو محادثات لمنع التراكم في التطبيق
                  </p>
                </div>
              </div>

              {/* Informative alert box explaining the role of this page */}
              <div className="bg-rose-50 border border-rose-100 p-4 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h4 className="font-bold text-rose-900 text-xs flex items-center gap-2 justify-end">
                    <span>💡 صلاحيات المدير العام للتخلص من التراكمات</span>
                    <AlertTriangle className="w-4 h-4 text-rose-600 font-bold" />
                  </h4>
                  <p className="text-[11px] text-rose-800 leading-relaxed">
                    هذه الصفحة صُممت خصيصاً لتمنحك كمدير القدرة الكاملة على تنظيف وتصفية التطبيق من أي تراكمات قد تحدث بمرور الوقت من المعلمين (كالدرجات والغياب اليومي والتعاميم) أو أولياء الأمور (كالرسائل والأعذار الطبية). يمكنك تصفح وحذف السجلات فراداً، أو تصفير أي فئة بالكامل لبدء صفحة جديدة وبأعلى أداء للمنصة!
                  </p>
                </div>
              </div>

              {/* THE CLEANUP PANEL ITSELF */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
                <div>
                  <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 justify-end">
                    <span>لوحة تصفير وإدارة البيانات المخصصة 🧹</span>
                  </h2>
                  <p className="text-slate-500 text-xs mt-1 text-right">
                    ابحث عن أي عنصر وحذفه بمفرده، أو اكتب "تأكيد الحذف" لتصفير وتفريغ فئة كاملة دفعة واحدة.
                  </p>
                </div>

                {/* Category Selection Tabs */}
                <div className="flex flex-wrap gap-1.5 justify-end border-b border-slate-100 pb-3">
                  {[
                    { id: 'students', label: 'الطلاب والتحضير', count: students.filter(matchesCohort).length },
                    { id: 'teachers', label: 'المعلمين', count: teachers.filter(matchesCohort).length },
                    { id: 'classes', label: 'الصفوف والشعب', count: classes.filter(matchesCohort).length },
                    { id: 'grades', label: 'الدرجات المرصودة', count: grades.filter(matchesCohort).length },
                    { id: 'attendance', label: 'سجلات الحضور والغياب اليومي', count: attendance.filter(matchesCohort).length },
                    { id: 'announcements', label: 'التعاميم والإعلانات', count: announcements.filter(matchesCohort).length },
                    { id: 'messages', label: 'الرسائل والإشعارات والسلوكيات', count: messages.filter(matchesCohort).length },
                    { id: 'excuses', label: 'الأعذار الطبية', count: excuses.filter(matchesCohort).length }
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
                  {/* Left: Scrollable Search & Individual Delete List */}
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
                          targetDeleteCategory === 'attendance' ? 'تاريخ الحضور أو اسم الطالب...' :
                          targetDeleteCategory === 'announcements' ? 'عنوان الإعلان أو محتواه...' :
                          targetDeleteCategory === 'messages' ? 'اسم المرسل أو نص الرسالة...' :
                          'اسم صاحب العذر...'
                        }`}
                        className="w-full text-xs font-medium focus:outline-none text-right bg-transparent"
                      />
                    </div>

                    <div className="border border-slate-150 rounded-2xl overflow-hidden divide-y divide-slate-100 max-h-[350px] overflow-y-auto bg-slate-50/20">
                      {getFilteredPurgeItems().length === 0 ? (
                        <div className="p-8 text-center text-xs text-slate-400 italic">
                          لا توجد نتائج مطابقة لعملية البحث أو القسم فارغ تماماً.
                        </div>
                      ) : (
                        getFilteredPurgeItems().slice(0, 100).map((item: any) => {
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
                            subtitle = `المرحلة: ${item.grade} | رقم القاعة: ${item.room || 'غير محدد'} | رائد الفصل: ${teachers.find(t => t.id === item.classTeacherId)?.name || 'غير محدد'}`;
                          } else if (targetDeleteCategory === 'grades') {
                            title = `مادة ${item.subject} - الطالب: ${students.find(s => s.id === item.studentId)?.name || 'مجهول'}`;
                            subtitle = `النوع: ${item.type} | الشهر: ${item.month || 'غير محدد'} | الدرجة: ${item.score} من ${item.maxScore}`;
                          } else if (targetDeleteCategory === 'attendance') {
                            const studName = students.find(s => s.id === item.studentId)?.name || 'طالب مجهول';
                            title = `حالة تحضير: ${studName}`;
                            let statusAr = '';
                            if (item.status === 'present') statusAr = 'حاضر ✅';
                            else if (item.status === 'absent') statusAr = 'غائب ❌';
                            else if (item.status === 'late') statusAr = 'متأخر ⏳';
                            else if (item.status === 'excused') statusAr = 'مرفق عذر 📝';
                            subtitle = `التاريخ: ${item.date} | الحالة: ${statusAr} ${item.notes ? `| ملاحظة: ${item.notes}` : ''}`;
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
                      {getFilteredPurgeItems().length > 100 && (
                        <div className="p-2.5 text-center text-[10px] text-slate-400 bg-slate-50 font-bold border-t border-slate-100">
                          تنبيه: تم عرض أول 100 نتيجة فقط للتسريع. يرجى استخدام شريط البحث لتصفية النتائج بشكل أدق.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Category Summary & Safe Wipe All Section */}
                  <div className="lg:col-span-5 bg-rose-50/40 border border-rose-100 p-5 rounded-2xl flex flex-col justify-between space-y-4">
                    <div className="space-y-2">
                      <h3 className="font-bold text-rose-950 text-sm flex items-center gap-1.5 justify-end">
                        <AlertTriangle className="w-5 h-5 text-rose-600" />
                        <span>تصفير فئة البيانات المحددة بالكامل</span>
                      </h3>
                      <p className="text-slate-600 text-[11px] leading-relaxed text-right">
                        {targetDeleteCategory === 'students' && '⚠️ تحذير: مسح الطلاب سيقوم بتصفير كافة الطلاب المسجلين، وحذف درجاتهم وعلاماتهم، وسجلات الغياب والحضور، وأعذاره الطبية، وحسابات أولياء الأمور المرتبطين بهم.'}
                        {targetDeleteCategory === 'teachers' && '⚠️ تحذير: مسح الكادر التعليمي سيمسح جميع حسابات المعلمين من المنصة ويلغي دورهم القيادي للفصول الدراسية والمواد.'}
                        {targetDeleteCategory === 'classes' && '⚠️ تحذير: مسح الفصول والشعب سيلغي هيكل الفصول. سيبقى الطلاب مسجلين ولكن بدون أي انتساب لشعبة، ويمكنك إعادة تصنيفهم لاحقاً.'}
                        {targetDeleteCategory === 'grades' && '⚠️ تحذير: سيتم حذف كافة الدرجات المرصودة في جميع الاختبارات والشهادات والتقارير الشهرية للفوج بالكامل.'}
                        {targetDeleteCategory === 'attendance' && '⚠️ تحذير: سيتم حذف كافة سجلات الغياب والحضور اليومية المسجلة للطلاب بالكامل من قاعدة البيانات.'}
                        {targetDeleteCategory === 'announcements' && '⚠️ تنبيه: سيتم حذف جميع الإعلانات والتعاميم المدرسية والرسائل الإدارية العامة المنشورة مسبقاً.'}
                        {targetDeleteCategory === 'messages' && '⚠️ تنبيه: سيتم حذف جميع رسائل وصندوق المحادثات والدردشة والسلوكيات بين الإدارة والمعلمين وأولياء الأمور نهائياً.'}
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
                        className="w-full py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm bg-rose-600 hover:bg-rose-700 text-white cursor-pointer shadow-rose-100/50"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>تفريغ وتصفير الفئة بالكامل 🚨</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Cohort Specific Purge Box */}
              <div className="bg-amber-50 border border-amber-200 p-6 rounded-2xl space-y-4 text-right">
                <div>
                  <h3 className="font-bold text-amber-950 text-base flex items-center gap-2 justify-end">
                    <Trash2 className="w-5 h-5 text-amber-600" />
                    <span>تصفير وتفريغ الأفواج المدرسية المستقلة 🌅🌙</span>
                  </h3>
                  <p className="text-amber-800 text-xs mt-1 leading-relaxed">
                    تصفير وتفريغ الفوج المحدد بالكامل (الطلاب، المعلمون، الصفوف والشعب، الدرجات والإعلانات) لإتاحة إدخال وإعادة تعيين بيانات جديدة للفوج المختار دون التأثير نهائياً على الفوج الآخر.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3 justify-end">
                  <button
                    type="button"
                    onClick={() => handleQuickDeleteCohort('evening')}
                    className="bg-indigo-900 hover:bg-indigo-950 text-amber-300 text-xs font-bold px-4 py-2.5 rounded-xl transition shadow-md shadow-indigo-200 cursor-pointer flex items-center gap-2"
                  >
                    <span>🌙 تصفير وإعادة تعيين بيانات الفوج المسائي بالكامل</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickDeleteCohort('morning')}
                    className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition shadow-md shadow-amber-200 cursor-pointer flex items-center gap-2"
                  >
                    <span>☀️ تصفير وإعادة تعيين بيانات الفوج الصباحي بالكامل</span>
                  </button>
                </div>
              </div>

              {/* Master Purge Box */}
              <div className="bg-red-50 border border-red-200 p-6 rounded-2xl space-y-4">
                <div className="text-right">
                  <h3 className="font-bold text-red-950 text-base flex items-center gap-2 justify-end">
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                    <span>خيار المطور والمسح الشامل 🚨</span>
                  </h3>
                  <p className="text-red-800 text-xs mt-1">
                    هذا الخيار يمسح كافة محتويات وقواعد بيانات المنصة بالكامل لتبدأ المدرسة من الصفر بصفحة فارغة ونظيفة تماماً. استخدمه بحذر شديد!
                  </p>
                </div>
                <div className="flex justify-start">
                  <button
                    type="button"
                    onClick={handleDeleteAllAppData}
                    className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition shadow-md shadow-red-200 cursor-pointer"
                  >
                    تصفير كامل المنصة وحذف كل البيانات ⚠️
                  </button>
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
                  <h1 className="text-2xl font-bold text-slate-800">إعدادات النظام</h1>
                  <p className="text-slate-500 text-sm mt-1">
                    إدارة الحسابات، كلمات المرور، وتخصيص هوية المدرسة
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
                          onClick={() => handleCopy(`${getShareableOrigin()}${window.location.pathname}?portal=parent`, 'parent_portal', 'رابط بوابة أولياء الأمور والطلاب')}
                          className={`text-[11px] font-bold px-3 py-2 rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
                            copiedState['parent_portal']
                              ? 'bg-emerald-600 text-white border border-emerald-600 shadow-sm'
                              : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'
                          }`}
                        >
                          {copiedState['parent_portal'] ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>تم النسخ! ✓</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>نسخ الرابط</span>
                            </>
                          )}
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
                          onClick={() => handleCopy(`${getShareableOrigin()}${window.location.pathname}?portal=teacher`, 'teacher_portal', 'رابط بوابة المعلمين')}
                          className={`text-[11px] font-bold px-3 py-2 rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
                            copiedState['teacher_portal']
                              ? 'bg-emerald-600 text-white border border-emerald-600 shadow-sm'
                              : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'
                          }`}
                        >
                          {copiedState['teacher_portal'] ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>تم النسخ! ✓</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>نسخ الرابط</span>
                            </>
                          )}
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
                          type="button"
                          onClick={() => handleCopy(`${getShareableOrigin()}${window.location.pathname}?portal=director`, 'director_portal', 'رابط لوحة المدير العام')}
                          className={`text-[11px] font-bold px-3 py-2 rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
                            copiedState['director_portal']
                              ? 'bg-emerald-600 text-white border border-emerald-600 shadow-sm'
                              : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'
                          }`}
                        >
                          {copiedState['director_portal'] ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>تم النسخ! ✓</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>نسخ الرابط</span>
                            </>
                          )}
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
                    { id: 'students', label: 'الطلاب والتحضير', count: students.filter(matchesCohort).length },
                    { id: 'teachers', label: 'المعلمين', count: teachers.filter(matchesCohort).length },
                    { id: 'classes', label: 'الصفوف والشعب', count: classes.filter(matchesCohort).length },
                    { id: 'grades', label: 'الدرجات المرصودة', count: grades.filter(matchesCohort).length },
                    { id: 'attendance', label: 'سجلات الحضور والغياب اليومي', count: attendance.filter(matchesCohort).length },
                    { id: 'announcements', label: 'التعاميم والإعلانات', count: announcements.filter(matchesCohort).length },
                    { id: 'messages', label: 'الرسائل والإشعارات', count: messages.filter(matchesCohort).length },
                    { id: 'excuses', label: 'الأعذار الطبية', count: excuses.filter(matchesCohort).length }
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
                          targetDeleteCategory === 'attendance' ? 'تاريخ الحضور أو اسم الطالب...' :
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
                          } else if (targetDeleteCategory === 'attendance') {
                            const studName = students.find(s => s.id === item.studentId)?.name || 'طالب مجهول';
                            title = `حالة تحضير: ${studName}`;
                            let statusAr = '';
                            if (item.status === 'present') statusAr = 'حاضر ✅';
                            else if (item.status === 'absent') statusAr = 'غائب ❌';
                            else if (item.status === 'late') statusAr = 'متأخر ⏳';
                            else if (item.status === 'excused') statusAr = 'مرفق عذر 📝';
                            subtitle = `التاريخ: ${item.date} | الحالة: ${statusAr} ${item.notes ? `| ملاحظة: ${item.notes}` : ''}`;
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
                        {targetDeleteCategory === 'attendance' && '⚠️ تحذير: سيتم حذف كافة سجلات الغياب والحضور اليومية المسجلة للطلاب بالكامل من قاعدة البيانات.'}
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
                        className="w-full py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm bg-rose-600 hover:bg-rose-700 text-white cursor-pointer shadow-rose-100/50"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>تفريغ وتصفير الفئة بالكامل 🚨</span>
                      </button>
                    </div>
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
                      onClick={async () => {
                        const copied = await copyToClipboard(clipboardModalText);
                        if (copied) {
                          setClipboardModalSuccess(true);
                        } else {
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

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">الفوج الدراسي *</label>
                    <select
                      value={newClassShift}
                      onChange={e => setNewClassShift(e.target.value as 'morning' | 'evening')}
                      className="w-full text-sm font-bold border border-slate-200 px-3.5 py-2.5 rounded-xl focus:border-emerald-500 focus:outline-none bg-white cursor-pointer"
                    >
                      <option value="morning">☀️ الفوج الصباحي</option>
                      <option value="evening">🌙 الفوج المسائي</option>
                    </select>
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

          {deleteConfirmModal && deleteConfirmModal.isOpen && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[9999]">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 text-right"
                style={{ direction: 'rtl' }}
              >
                <h3 className="font-bold text-slate-800 text-base mb-2 flex items-center gap-2">
                  <span className="text-rose-500">⚠️</span>
                  <span>{deleteConfirmModal.title}</span>
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed mb-6">
                  {deleteConfirmModal.message}
                </p>
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmModal(null)}
                    className="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 rounded-xl transition cursor-pointer"
                  >
                    إلغاء التراجع
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      deleteConfirmModal.onConfirm();
                    }}
                    className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition shadow-sm cursor-pointer"
                  >
                    نعم، تأكيد الحذف 🗑️
                  </button>
                </div>
              </motion.div>
            </div>
          )}

          {editingMessage && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[9999]">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 text-right"
                style={{ direction: 'rtl' }}
              >
                <h3 className="font-bold text-slate-800 text-base mb-2 flex items-center gap-2">
                  <span>✏️ تعديل الرسالة / المراسلة</span>
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                  أنت تقوم بتعديل الرسالة الموجهة من/إلى: <strong className="text-slate-800">{editingMessage.senderRole === 'director' ? editingMessage.receiverName : editingMessage.senderName}</strong>
                </p>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">محتوى الرسالة:</label>
                    <textarea
                      rows={6}
                      value={editMessageContent}
                      onChange={e => setEditMessageContent(e.target.value)}
                      className="w-full text-xs border border-slate-200 px-3.5 py-2.5 rounded-xl bg-white focus:border-indigo-500 focus:outline-none"
                      placeholder="اكتب مضمون الرسالة الجديد..."
                    />
                  </div>
                </div>
                
                <div className="flex gap-2 mt-6 justify-end">
                  <button
                    type="button"
                    onClick={() => setEditingMessage(null)}
                    className="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 rounded-xl transition cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!editMessageContent.trim()) {
                        alert('يرجى كتابة محتوى الرسالة أولاً.');
                        return;
                      }
                      const updated = messages.map(m => m.id === editingMessage.id ? { ...m, content: editMessageContent } : m);
                      setMessages(updated);
                      localStorage.setItem('school_messages', JSON.stringify(updated));
                      alert('✅ تم تعديل الرسالة بنجاح.');
                      setEditingMessage(null);
                    }}
                    className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition shadow-sm cursor-pointer"
                  >
                    حفظ التعديلات 💾
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
        {/* WhatsApp Customizer Modal */}
        {waModalState && (
          <WhatsAppMessageCustomizerModal
            isOpen={waModalState.isOpen}
            onClose={() => setWaModalState(null)}
            studentName={waModalState.studentName}
            studentId={waModalState.studentId}
            recipientPhone={waModalState.recipientPhone}
            initialMessage={waModalState.initialMessage}
            defaultTemplateText={waModalState.defaultTemplateText}
            templateStorageKey="school_whatsapp_monthly_template"
            onConfirmSend={handleConfirmSendWhatsAppDirector}
          />
        )}
      </div>
    </div>
  );
}
