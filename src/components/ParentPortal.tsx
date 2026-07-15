/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
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
  Smartphone,
  Download,
  ExternalLink
} from 'lucide-react';
import { Parent, Student, Attendance, Grade, Announcement, Message, AbsenceExcuse, Teacher, Class } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { trackActivityOperation } from '../lib/firestoreTracker';

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
  // Unified Student ID Login System
  const [loggedInStudentId, setLoggedInStudentId] = useState<string>(() => {
    return localStorage.getItem('parent_portal_student_id') || '';
  });
  const [studentRollInput, setStudentRollInput] = useState('');
  const [loginError, setLoginError] = useState('');

  const activeStudentObj = students.find(s => s.id === loggedInStudentId || s.rollNo === loggedInStudentId);
  const selectedParentId = activeStudentObj ? activeStudentObj.parentId : '';
  const activeParent = parents.find(p => p.id === selectedParentId);

  // Active child (from parent's children)
  const children = students.filter(s => s.parentId === selectedParentId);
  const [selectedChildId, setSelectedChildId] = useState<string>(() => {
    return localStorage.getItem('parent_portal_student_id') || '';
  });

  // Keep selected child in sync when loggedInStudentId changes
  React.useEffect(() => {
    if (loggedInStudentId) {
      const found = students.find(s => s.id === loggedInStudentId);
      if (found) {
        setSelectedChildId(found.id);
      }
    } else {
      setSelectedChildId('');
    }
  }, [loggedInStudentId]);

  const activeChild = students.find(s => s.id === selectedChildId);
  const activeChildClass = classes.find(c => c.id === activeChild?.classId);
  const activeChildTeacher = teachers.find(t => t.id === activeChildClass?.teacherId);

  // Firebase Live Sync status
  const [isFirebaseLive, setIsFirebaseLive] = useState<boolean>(true);
  const [firebaseErrorMsg, setFirebaseErrorMsg] = useState<string>('');

  // FCM and Push notification states
  const [fcmToken, setFcmToken] = useState<string>('');
  const [pushPermissionStatus, setPushPermissionStatus] = useState<string>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  );

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
      console.warn('System notifications are not supported by this browser.');
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      setPushPermissionStatus(permission);

      if (permission === 'granted' && selectedParentId) {
        const { getMessagingInstance } = await import('../lib/firebase');
        const messaging = await getMessagingInstance();

        if (messaging) {
          const { getToken } = await import('firebase/messaging');
          
          // Get the active Service Worker Registration to pass to getToken (critical for mobile PWA)
          let activeRegistration: ServiceWorkerRegistration | undefined;
          if ('serviceWorker' in navigator) {
            try {
              activeRegistration = await navigator.serviceWorker.ready;
              console.log("[FCM PWA] Found active Service Worker Registration:", activeRegistration);
            } catch (swErr) {
              console.warn("[FCM PWA] Could not obtain ready Service Worker:", swErr);
            }
          }

          // Standard public VAPID key for web push notifications
          const token = await getToken(messaging, {
            serviceWorkerRegistration: activeRegistration,
            vapidKey: 'BPr7CisEId0VlPof_fC7WlO5X4QY68Kby6eNclvX6XoI1XUf_SgM_f7E6G8Q9g2g5Ncl7H5p18qHlJ7m8Q9p2p0'
          });

          if (token) {
            setFcmToken(token);
            const { doc, setDoc } = await import('firebase/firestore');
            const { db } = await import('../lib/firebase');
            await setDoc(doc(db, 'fcm_tokens', selectedParentId), {
              token,
              updatedAt: Date.now(),
              parentName: activeParent?.name || 'ولي أمر'
            });
            console.log("FCM registration token successfully saved to Firestore:", token);
          }
        } else {
          // Fallback if FCM is not supported (e.g. inside an sandbox iframe without native sw)
          console.log("FCM is not supported in this container environment, but browser permission is granted.");
        }
      }
    } catch (err) {
      console.warn("Could not retrieve FCM registration token (running in local preview sandbox mode):", err);
    }
  };

  // Auto request permission when selected parent is logged in
  React.useEffect(() => {
    if (selectedParentId) {
      requestPushPermission();
    }
  }, [selectedParentId]);

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
              const isTargetParent = newMsg.receiverId === selectedParentId || newMsg.receiverRole === 'parent';
              
              setMessages(prev => {
                if (prev.some(m => m.id === newMsg.id)) {
                  return prev;
                }
                
                // Trigger native push notification
                if (isTargetParent && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
                  try {
                    new Notification(newMsg.senderName || 'إشعار مدرسي جديد 🔔', {
                      body: newMsg.content,
                      icon: '/icon.png'
                    });
                  } catch (e) {
                    console.warn("Could not display system push notification in this context:", e);
                  }
                }

                const updated = [...prev, newMsg];
                localStorage.setItem('school_messages', JSON.stringify(updated));
                return updated;
              });
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

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanInput = studentRollInput.trim();
    if (!cleanInput) return;

    // 1. Try to find by student roll number or ID
    let foundStudent = students.find(
      s => s.rollNo === cleanInput || s.id.toLowerCase() === cleanInput.toLowerCase()
    );

    // 2. If not found, try to find by parent's phone number
    if (!foundStudent) {
      const targetPhone = cleanInput.replace(/\s+/g, '');
      const foundParent = parents.find(p => {
        const pPhone = p.phone ? p.phone.replace(/\s+/g, '') : '';
        return pPhone === targetPhone || (pPhone && targetPhone && (pPhone.endsWith(targetPhone) || targetPhone.endsWith(pPhone)));
      });

      if (foundParent) {
        // Find the first student belonging to this parent
        foundStudent = students.find(s => s.parentId === foundParent.id);
      }
    }

    if (foundStudent) {
      setLoggedInStudentId(foundStudent.id);
      localStorage.setItem('parent_portal_student_id', foundStudent.id);
      setSelectedChildId(foundStudent.id);
      setLoginError('');
    } else {
      setLoginError('رقم الدخول غير مسجل. يرجى إدخال رقم الطالب الموحد (مثال: 101) أو رقم هاتف ولي الأمر المسجل بدقة.');
    }
  };

  const handleLogout = () => {
    setLoggedInStudentId('');
    localStorage.removeItem('parent_portal_student_id');
    setSelectedChildId('');
    setStudentRollInput('');
    setLoginError('');
  };

  const markAsRead = (msgId: string) => {
    if (setMessages) {
      setMessages(prev => {
        const updated = prev.map(m => m.id === msgId ? { ...m, read: true } : m);
        localStorage.setItem('school_messages', JSON.stringify(updated));
        return updated;
      });
    }
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

  // Tabs inside parent portal
  const [activeTab, setActiveTab] = useState<'grades' | 'attendance' | 'announcements' | 'messages' | 'excuse' | 'tuition'>('grades');

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
  const [parentMsgText, setParentMsgText] = useState<string>('');
  const [chatRecipient, setChatRecipient] = useState<'teacher' | 'director'>('teacher');

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
    if (!parentMsgText) return;

    if (chatRecipient === 'teacher') {
      if (!activeChildTeacher) return;
      sendMessageFromParent({
        senderId: selectedParentId,
        senderName: activeParent?.name || 'ولي أمر',
        senderRole: 'parent',
        receiverId: activeChildTeacher.id,
        receiverName: activeChildTeacher.name,
        receiverRole: 'teacher',
        content: parentMsgText,
        studentId: selectedChildId
      });
    } else {
      sendMessageFromParent({
        senderId: selectedParentId,
        senderName: activeParent?.name || 'ولي أمر',
        senderRole: 'parent',
        receiverId: 'director',
        receiverName: 'المدير العام',
        receiverRole: 'director',
        content: parentMsgText,
        studentId: selectedChildId
      });
    }
    trackActivityOperation('write', 1);

    setParentMsgText('');
    alert(chatRecipient === 'teacher' ? 'تم إرسال رسالتك للمعلم المشرف، سيتم إشعارك فور رده!' : 'تم إرسال رسالتك للمدير العام، سيتم إشعارك فور رده!');
  };

  // Filter child-specific grades
  const childGrades = grades.filter(g => g.studentId === selectedChildId);

  // Filter child-specific attendance
  const childAttendance = attendance.filter(a => a.studentId === selectedChildId);

  // Filter announcements for parents or all
  const filteredAnnouncements = announcements.filter(a => a.target === 'parents' || a.target === 'all');

  // Filter messages with active child's teacher or director
  const chatMessages = messages.filter(
    m => {
      if (chatRecipient === 'teacher') {
        return (m.senderId === selectedParentId && m.receiverId === activeChildTeacher?.id) ||
               (m.senderId === activeChildTeacher?.id && m.receiverId === selectedParentId);
      } else {
        return (m.senderId === selectedParentId && m.receiverId === 'director') ||
               (m.senderId === 'director' && m.receiverId === selectedParentId);
      }
    }
  );

  // Grade badge helper
  const getGradeEvaluation = (score: number, max: number) => {
    const percentage = (score / max) * 100;
    if (percentage >= 90) return { label: 'ممتاز', color: 'bg-emerald-50 text-emerald-700 border border-emerald-100' };
    if (percentage >= 80) return { label: 'جيد جداً', color: 'bg-sky-50 text-sky-700 border border-sky-100' };
    if (percentage >= 70) return { label: 'جيد', color: 'bg-amber-50 text-amber-700 border border-amber-100' };
    return { label: 'مقبول', color: 'bg-rose-50 text-rose-700 border border-rose-100' };
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

  if (!loggedInStudentId) {
    return (
      <div id="parent-login-screen" className="bg-slate-50 min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-xl p-6 space-y-6">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 bg-indigo-600 rounded-2xl text-white shadow-md flex items-center justify-center mx-auto mb-4">
              <User className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-slate-800">بوابة ولي الأمر الإلكترونية</h2>
            <p className="text-slate-500 text-xs leading-relaxed">
              يرجى إدخال **رقم الطالب الموحد** (الرقم التعريفي المكون من 3 أرقام) أو **رقم هاتف ولي الأمر** المسجل لدى المدرسة للمتابعة الفورية.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2">رقم الطالب الموحد أو رقم هاتف ولي الأمر</label>
              <input
                type="text"
                value={studentRollInput}
                onChange={e => setStudentRollInput(e.target.value)}
                placeholder="أدخل الرقم التعريفي للطفل أو رقم الهاتف..."
                className="w-full text-xs border border-slate-200 px-4 py-3 rounded-xl focus:outline-none focus:border-indigo-500 font-mono text-center font-bold bg-slate-50"
                required
              />
            </div>

            {loginError && (
              <p className="text-rose-500 text-[11px] font-bold text-center bg-rose-50 p-2.5 rounded-lg border border-rose-100">
                ⚠️ {loginError}
              </p>
            )}

            <button
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition cursor-pointer text-xs shadow-sm flex items-center justify-center gap-2"
            >
              <span>دخول النظام</span>
              <UserCheck className="w-4 h-4" />
            </button>
          </form>

          <div className="border-t border-slate-100 pt-4 space-y-3">
            <button
              type="button"
              onClick={() => setShowInstallGuide(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold transition cursor-pointer"
            >
              <Smartphone className="w-4 h-4 text-emerald-600" />
              <span>شرح تثبيت التطبيق على الشاشة الرئيسية للهاتف 📱</span>
            </button>
            <p className="text-[10px] text-slate-400 text-center">نظام المدرسة الدولية - مارع</p>
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
              <div className="p-2.5 bg-indigo-600 rounded-xl text-white shadow-sm">
                <User className="w-5 h-5" />
              </div>
              <div className="text-right">
                <h3 className="font-bold text-sm text-slate-100">{activeParent?.name}</h3>
                <span className="text-[10px] text-indigo-400 font-bold block">تطبيق ولي الأمر للهاتف</span>
              </div>
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

          {/* Collapsible Content Area on Mobile */}
          <div className={`${isMobileMenuOpen ? 'block' : 'hidden md:block'} space-y-4`}>
            {/* Active Parent Info and Logout button */}
            <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800/40 space-y-3">
              <div className="text-right">
                <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">بيانات الحساب</label>
                <div className="text-xs font-bold text-white">{activeParent?.name}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">{activeParent?.phone}</div>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold text-[10px] py-1.5 px-3 rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>تسجيل الخروج</span>
              </button>
            </div>

            {/* Children Selector Dropdown */}
            <div className="space-y-2 bg-slate-900/60 p-3.5 rounded-2xl border border-slate-800/40">
              <label htmlFor="child-selector" className="block text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1 text-right flex items-center gap-1.5 justify-end">
                <span>اختر الابن/الابنة للتصفح</span>
                <UserCheck className="w-3.5 h-3.5 text-indigo-400" />
              </label>
              
              <div className="relative">
                <select
                  id="child-selector"
                  value={selectedChildId}
                  onChange={(e) => {
                    setSelectedChildId(e.target.value);
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full bg-slate-950 text-white border border-slate-800 rounded-xl px-3 py-2.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer text-right appearance-none block pr-3 pl-8"
                  style={{ direction: 'rtl' }}
                >
                  {children.map(child => {
                    const childClass = classes.find(c => c.id === child.classId);
                    return (
                      <option key={child.id} value={child.id} className="bg-slate-950 text-white font-bold text-xs py-2">
                        {child.name} ({childClass?.name || 'بدون صف'}) - #{child.rollNo}
                      </option>
                    );
                  })}
                </select>
                {/* Custom arrow for styling consistency */}
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                  <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                    <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
                  </svg>
                </div>
              </div>
              
              <span className="block text-[9px] text-indigo-400 text-right font-semibold">
                * مرتبطة بحساب ولي الأمر وحقوقه فقط
              </span>
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
                <Award className="w-4.5 h-4.5 shrink-0" />
                <span>الشهادات والدرجات</span>
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
                {childAttendance.filter(a => a.status === 'absent').length > 0 && (
                  <span className="mr-auto bg-amber-500 text-white px-1.5 py-0.5 rounded text-[9px] font-bold">
                    {childAttendance.filter(a => a.status === 'absent').length} غياب
                  </span>
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
                <span>الإعلانات والتعاميم</span>
                <span className="mr-auto bg-slate-900 px-1.5 py-0.5 rounded text-[9px] text-slate-300 font-bold">
                  {filteredAnnouncements.length}
                </span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('messages');
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-right text-xs font-semibold transition-all duration-200 ${
                  activeTab === 'messages' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-300 hover:bg-slate-900 hover:text-slate-100'
                }`}
              >
                <Bell className="w-4.5 h-4.5 shrink-0" />
                <span>الإشعارات والرسائل</span>
                {messages.filter(m => m.receiverId === selectedParentId && !m.read).length > 0 && (
                  <span className="mr-auto bg-rose-500 text-white px-2 py-0.5 rounded-full text-[9px] font-bold animate-pulse">
                    {messages.filter(m => m.receiverId === selectedParentId && !m.read).length} جديدة
                  </span>
                )}
              </button>

              <button
                onClick={() => {
                  setActiveTab('excuse');
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-right text-xs font-semibold transition-all duration-200 ${
                  activeTab === 'excuse' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-300 hover:bg-slate-900 hover:text-slate-100'
                }`}
              >
                <FileText className="w-4.5 h-4.5 shrink-0" />
                <span>تقديم تبرير غياب</span>
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

            <div className="pt-3 border-t border-slate-900 mt-3">
              <button
                type="button"
                onClick={() => {
                  setShowInstallGuide(true);
                  setIsMobileMenuOpen(false);
                }}
                className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl text-right text-xs font-semibold bg-emerald-950/40 text-emerald-400 border border-emerald-900/30 hover:bg-emerald-950/60 hover:text-emerald-300 transition-all cursor-pointer shadow-sm"
              >
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 shrink-0" />
                  <span>تثبيت التطبيق على الهاتف</span>
                </div>
                <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-mono font-bold">PWA</span>
              </button>
            </div>
          </div>
        </div>

        {/* Portal Info - Collapsible on Mobile */}
        <div className={`${isMobileMenuOpen ? 'block mt-6' : 'hidden md:block'} mt-8 border-t border-slate-800 pt-4 text-[10px] text-slate-400 text-right space-y-1`}>
          <p>تطبيق ولي الأمر المعتمد - نظام المدرسة الدولية</p>
        </div>
      </div>

      {/* Main content body */}
      <div className="flex-1 p-6 md:p-8 overflow-y-auto max-h-[800px]">
        {/* Active Child Summary Header */}
        {activeChild ? (
          <div className="mb-6 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col xl:flex-row items-stretch xl:items-center gap-4 justify-between">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-black text-lg shrink-0">
                {activeChild.name.charAt(0)}
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block font-medium">بيانات الطالب المحدد</span>
                <h2 className="font-bold text-slate-800 text-base">{activeChild.name}</h2>
                <div className="flex gap-2 text-[11px] text-slate-500 mt-0.5">
                  <span>الفصل: <strong className="text-indigo-600">{activeChildClass?.name}</strong></span>
                  <span>•</span>
                  <span>رقم القيد: <strong className="font-mono">#{activeChild.rollNo}</strong></span>
                </div>
              </div>
            </div>

            {/* Dropdown Navigation for Children (linked strictly to this parent's kids) */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-slate-50 border border-slate-200/60 p-3 rounded-2xl self-stretch xl:self-auto">
              <span className="text-xs font-bold text-slate-700 text-right">👨‍👩‍👦 تصفح الأبناء:</span>
              <div className="relative grow sm:grow-0">
                <select
                  value={selectedChildId}
                  onChange={(e) => setSelectedChildId(e.target.value)}
                  className="w-full sm:w-64 bg-white border border-slate-200 rounded-xl px-4 py-2 text-slate-800 text-xs font-black focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer text-right appearance-none pl-8 pr-3"
                  style={{ direction: 'rtl' }}
                >
                  {children.map(child => {
                    const childClass = classes.find(c => c.id === child.classId);
                    return (
                      <option key={child.id} value={child.id}>
                        {child.name} ({childClass?.name || 'بدون صف'})
                      </option>
                    );
                  })}
                </select>
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                  <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                    <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
                  </svg>
                </div>
              </div>
            </div>

            {activeChildTeacher && (
              <div className="p-3 bg-indigo-50/40 rounded-xl border border-indigo-100 text-xs shrink-0">
                <span className="text-indigo-500 block text-[10px] font-bold">المعلم المشرف ورائد الصف</span>
                <span className="font-bold text-slate-700">{activeChildTeacher.name}</span>
                <span className="text-[10px] text-slate-400 block mt-0.5">{activeChildTeacher.phone}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-amber-50 p-6 rounded-xl border border-amber-200 text-amber-800 text-sm text-center">
            تنبيه: لا يوجد طلاب مسجلين لولي الأمر هذا حالياً. يرجى تسجيل الطلاب من بوابة المدير العام أولاً!
          </div>
        )}

        {/* PWA Install Banner */}
        {activeChild && !isBannerDismissed && (() => {
          const isIframe = typeof window !== 'undefined' && window.self !== window.top;
          const isIOS = typeof window !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;

          if (isIframe) {
            return (
              <div className="mb-6 bg-gradient-to-r from-amber-950 via-slate-900 to-amber-900 text-white p-5 rounded-2xl border border-amber-900/40 shadow-md relative overflow-hidden text-right">
                {/* Background decoration */}
                <div className="absolute top-0 left-0 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl -translate-x-6 -translate-y-6"></div>
                <div className="absolute bottom-0 right-0 w-32 h-32 bg-yellow-500/10 rounded-full blur-3xl translate-x-10 translate-y-10"></div>
                
                <button
                  onClick={() => {
                    setIsBannerDismissed(true);
                    localStorage.setItem('pwa_banner_dismissed', 'true');
                  }}
                  className="absolute top-3 left-3 p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white transition cursor-pointer z-20"
                  title="إغلاق التنبيه"
                >
                  <X className="w-4 h-4" />
                </button>

                <div className="flex flex-col md:flex-row items-center gap-4 justify-between relative z-10">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-yellow-600 text-white flex items-center justify-center font-black text-xl shrink-0 shadow-lg shadow-amber-500/20">
                      <ExternalLink className="w-6 h-6 animate-pulse" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap justify-end md:justify-start">
                        <span className="bg-amber-500/20 text-amber-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-500/10 font-mono">PWA PREVIEW</span>
                        <h3 className="font-bold text-slate-100 text-sm md:text-base">تثبيت تطبيق المدرسة على الهاتف 📲 (مطلوب الخروج من المعاينة)</h3>
                      </div>
                      <p className="text-slate-300 text-xs mt-1.5 leading-relaxed">
                        أنت تتصفح التطبيق حالياً داخل نافذة المعاينة المؤطرة (Iframe). لتتمكن من تثبيته بنقرة واحدة وتفعيل الإشعارات وتنبيهات الهاتف فوراً، يرجى فتح التطبيق خارج المعاينة في صفحة كاملة أولاً.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full md:w-auto shrink-0 mt-3 md:mt-0 justify-end">
                    <button
                      onClick={handleInstallClick}
                      className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-5 py-3 rounded-xl transition shadow-md shadow-amber-950/20 flex items-center gap-1.5 cursor-pointer w-full md:w-auto justify-center"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>افتح في صفحة مستقلة للتثبيت المباشر</span>
                    </button>
                    <button
                      onClick={() => setShowInstallGuide(true)}
                      className="bg-white/10 hover:bg-white/15 text-white text-xs font-bold px-4 py-3 rounded-xl transition flex items-center gap-1.5 cursor-pointer w-full md:w-auto justify-center"
                    >
                      <HelpCircle className="w-4 h-4" />
                      <span>دليل التثبيت اليدوي</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          }

          if (isIOS) {
            return (
              <div className="mb-6 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-5 rounded-2xl border border-indigo-950 shadow-md relative overflow-hidden text-right">
                {/* Background decoration */}
                <div className="absolute top-0 left-0 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl -translate-x-6 -translate-y-6"></div>
                <div className="absolute bottom-0 right-0 w-32 h-32 bg-pink-500/10 rounded-full blur-3xl translate-x-10 translate-y-10"></div>
                
                <button
                  onClick={() => {
                    setIsBannerDismissed(true);
                    localStorage.setItem('pwa_banner_dismissed', 'true');
                  }}
                  className="absolute top-3 left-3 p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white transition cursor-pointer z-20"
                  title="إغلاق التنبيه"
                >
                  <X className="w-4 h-4" />
                </button>

                <div className="flex flex-col md:flex-row items-center gap-4 justify-between relative z-10">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 text-white flex items-center justify-center font-black text-xl shrink-0 shadow-lg shadow-indigo-500/20">
                      <Smartphone className="w-6 h-6 animate-pulse" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap justify-end md:justify-start">
                        <span className="bg-indigo-500/20 text-indigo-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-indigo-500/10 font-mono">PWA IOS</span>
                        <h3 className="font-bold text-slate-100 text-sm md:text-base">إضافة التطبيق إلى هاتف الآيفون 🍎</h3>
                      </div>
                      <p className="text-slate-300 text-xs mt-1.5 leading-relaxed">
                        يدعم نظام iOS تثبيت التطبيقات مباشرة لتلقي الإشعارات والرسائل فوراً! يرجى إضافة التطبيق للشاشة الرئيسية يدويًا عبر متصفح Safari بالضغط على زر مشاركة ثم إضافة للشاشة الرئيسية.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full md:w-auto shrink-0 mt-3 md:mt-0 justify-end">
                    <button
                      onClick={handleInstallClick}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-5 py-3 rounded-xl transition shadow-md shadow-indigo-950/20 flex items-center gap-1.5 cursor-pointer w-full md:w-auto justify-center"
                    >
                      <Smartphone className="w-4 h-4" />
                      <span>عرض خطوات تثبيت الآيفون</span>
                    </button>
                    <button
                      onClick={() => setShowInstallGuide(true)}
                      className="bg-white/10 hover:bg-white/15 text-white text-xs font-bold px-4 py-3 rounded-xl transition flex items-center gap-1.5 cursor-pointer w-full md:w-auto justify-center"
                    >
                      <HelpCircle className="w-4 h-4" />
                      <span>دليل التثبيت اليدوي</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          }

          // Default top-level Android / Chrome / Desktop PWA installation
          return (
            <div className="mb-6 bg-gradient-to-r from-emerald-950 via-slate-900 to-emerald-900 text-white p-5 rounded-2xl border border-emerald-950/40 shadow-md relative overflow-hidden text-right">
              {/* Background decoration */}
              <div className="absolute top-0 left-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl -translate-x-6 -translate-y-6"></div>
              <div className="absolute bottom-0 right-0 w-32 h-32 bg-teal-500/10 rounded-full blur-3xl translate-x-10 translate-y-10"></div>
              
              <button
                onClick={() => {
                  setIsBannerDismissed(true);
                  localStorage.setItem('pwa_banner_dismissed', 'true');
                }}
                className="absolute top-3 left-3 p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white transition cursor-pointer z-20"
                title="إغلاق التنبيه"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex flex-col md:flex-row items-center gap-4 justify-between relative z-10">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white flex items-center justify-center font-black text-xl shrink-0 shadow-lg shadow-emerald-500/20">
                    <Smartphone className="w-6 h-6 animate-pulse" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap justify-end md:justify-start">
                      <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-500/10 font-mono">PWA APP</span>
                      <h3 className="font-bold text-slate-100 text-sm md:text-base">تثبيت تطبيق المدرسة على هاتفك مباشرة 📲</h3>
                    </div>
                    <p className="text-slate-300 text-xs mt-1.5 leading-relaxed">
                      لتفعيل الإشعارات الخارجية وتلقي تنبيهات الغياب والدرجات والرسائل بشكل مباشر وفوري على شاشة هاتفك المغلقة، يرجى تثبيت التطبيق الآن على الشاشة الرئيسية.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto shrink-0 mt-3 md:mt-0 justify-end">
                  <button
                    onClick={handleInstallClick}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-5 py-3 rounded-xl transition shadow-md shadow-emerald-950/20 flex items-center gap-1.5 cursor-pointer w-full md:w-auto justify-center"
                  >
                    <Download className="w-4 h-4" />
                    <span>تثبيت التطبيق مباشرة</span>
                  </button>
                  <button
                    onClick={() => setShowInstallGuide(true)}
                    className="bg-white/10 hover:bg-white/15 text-white text-xs font-bold px-4 py-3 rounded-xl transition flex items-center gap-1.5 cursor-pointer w-full md:w-auto justify-center"
                    title="مشاهدة دليل التثبيت"
                  >
                    <HelpCircle className="w-4 h-4" />
                    <span>دليل التثبيت اليدوي</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

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
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">الشهادة الأكاديمية والتقييمات</h3>
                    <p className="text-slate-500 text-xs mt-1">درجات التقويم المستمر والامتحانات المرصودة فورياً من المعلمين.</p>
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
                      {/* Monthly Evaluation Card */}
                      {monthlyEvaluations[selectedChildId] && monthlyEvaluations[selectedChildId].text.trim() && (
                        <div className="bg-indigo-50/80 border border-indigo-100/80 p-5 rounded-2xl shadow-xs text-right space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] bg-indigo-600 text-white px-2.5 py-0.5 rounded-full font-bold">
                              سلوك الطالب لـ {monthlyEvaluations[selectedChildId].month || currentEvaluationMonth}
                            </span>
                            <span className="text-[10px] text-indigo-600 font-bold flex items-center gap-1">
                              📋 تقرير السلوك والتقييم المعتمد
                            </span>
                          </div>
                          <p className="text-slate-800 text-xs font-semibold leading-relaxed pt-1 whitespace-pre-line">
                            {monthlyEvaluations[selectedChildId].text}
                          </p>
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {childGrades.map(grade => {
                          const evalData = getGradeEvaluation(grade.score, grade.maxScore);
                          return (
                            <div key={grade.id} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between hover:shadow-md transition">
                              <div>
                                <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-bold">
                                  {grade.subject}
                                </span>
                                <h4 className="font-bold text-slate-800 text-sm mt-2">{grade.examName}</h4>
                                <span className="text-[10px] text-slate-400 block mt-1">تاريخ الرصد: {grade.date}</span>
                              </div>

                              <div className="text-left">
                                <span className="text-xl font-black text-indigo-700 block font-mono">
                                  {grade.score} <span className="text-xs text-slate-400">/ {grade.maxScore}</span>
                                </span>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full mt-1.5 inline-block ${evalData.color}`}>
                                  {evalData.label}
                                </span>
                              </div>
                            </div>
                          );
                        })}

                        {childGrades.length === 0 && (
                          <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm col-span-2 text-center text-slate-400 text-xs">
                            لم يتم رصد أي درجات لهذا الطالب بعد في النظام.
                          </div>
                        )}
                      </div>
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

                  {/* Attendance table/list */}
                  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="p-4 bg-slate-50 border-b border-slate-100 text-xs text-slate-600 font-bold">
                      سجل التحضير المفصل لآخر الأيام
                    </div>

                    <div className="divide-y divide-slate-100">
                      {childAttendance.map(record => (
                        <div key={record.id} className="p-4 flex items-center justify-between hover:bg-slate-50/50 transition text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-slate-500 font-medium">{record.date}</span>
                            {record.notes && (
                              <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-medium">
                                ملاحظة: {record.notes}
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
                      ))}

                      {childAttendance.length === 0 && (
                        <div className="p-8 text-center text-slate-400 text-xs italic">
                          لم يتم رصد أي تحضير حتى الآن.
                        </div>
                      )}
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
                    {filteredAnnouncements.map(ann => (
                      <div key={ann.id} className="bg-white p-5 rounded-2xl border-r-4 border-indigo-600 border-y border-l border-slate-100 shadow-sm flex flex-col justify-between hover:shadow-md transition">
                        <div>
                          <div className="flex justify-between items-start gap-4">
                            <h4 className="font-bold text-slate-800 text-sm">{ann.title}</h4>
                            <span className="text-[10px] text-slate-400 font-mono shrink-0">{ann.date}</span>
                          </div>
                          <p className="text-xs text-slate-600 mt-2.5 leading-relaxed">{ann.content}</p>
                        </div>
                        <div className="mt-4 pt-2.5 border-t border-slate-50 flex justify-between items-center text-[10px] text-slate-400">
                          <span>الجهة الناشرة: {ann.authorName}</span>
                          <span className="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">عقد موحد</span>
                        </div>
                      </div>
                    ))}

                    {filteredAnnouncements.length === 0 && (
                      <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm text-center text-slate-400 text-xs">
                        لا توجد أي تعاميم منشورة حالياً.
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {/* Chat with Teacher Tab */}
              {activeTab === 'messages' && (() => {
                const receivedMessages = messages.filter(
                  m => m.receiverId === selectedParentId && (m.senderRole === 'teacher' || m.senderRole === 'director')
                ).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

                return (
                  <motion.div
                    key="messages"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-6"
                  >
                    <div className="flex flex-wrap gap-2 items-center justify-between">
                      <div>
                        <h3 className="text-lg font-bold text-slate-800">بوابة الإشعارات والرسائل</h3>
                        <p className="text-slate-500 text-xs mt-1">تصفح كافة الرسائل الرسمية والإشعارات المدرسية الواردة، وتواصل مع معلم الصف مباشرة.</p>
                      </div>
                      
                      {/* Live Sync Connection Badge */}
                      <div className="flex flex-wrap gap-2 items-center">
                        {showInstallBtn && (
                          <button
                            onClick={handleInstallClick}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-500 text-[11px] font-bold shadow-sm cursor-pointer transition animate-bounce"
                          >
                            <span>📥</span>
                            <span>تثبيت التطبيق على الهاتف</span>
                          </button>
                        )}

                        <button
                          onClick={requestPushPermission}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px] font-bold shadow-xs cursor-pointer transition ${
                            pushPermissionStatus === 'granted'
                              ? 'bg-indigo-50 text-indigo-700 border-indigo-100 hover:bg-indigo-100'
                              : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 animate-pulse'
                          }`}
                        >
                          <span>{pushPermissionStatus === 'granted' ? '✅' : '🔔'}</span>
                          <span>
                            {pushPermissionStatus === 'granted'
                              ? 'إشعارات الهاتف الخارجية مفعّلة'
                              : 'تفعيل إشعارات الهاتف الخارجية'}
                          </span>
                        </button>

                        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px] font-bold shadow-xs ${
                          isFirebaseLive 
                            ? 'bg-green-50 text-green-700 border-green-200' 
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}>
                          <span className={`w-2 h-2 rounded-full ${isFirebaseLive ? 'bg-green-500' : 'bg-rose-500'} ${isFirebaseLive ? 'animate-pulse' : ''}`}></span>
                          <span>{isFirebaseLive ? 'الإشعارات اللحظية متصلة ⚡' : 'وضع عدم الاتصال بالإنترنت ⚠️'}</span>
                        </div>
                      </div>
                    </div>

                    {firebaseErrorMsg && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 font-bold flex items-center gap-2">
                        <span>🔔</span>
                        <span>{firebaseErrorMsg}</span>
                      </div>
                    )}

                    {/* Helpful Guide for Mobile PWA Push Notifications */}
                    <div className="bg-gradient-to-r from-sky-50 to-indigo-50 border border-indigo-100 rounded-2xl p-4 text-right shadow-xs">
                      <h4 className="font-bold text-slate-800 text-xs mb-2 flex items-center gap-1.5 justify-end">
                        <span>إرشادات تفعيل الإشعارات الخارجية على الهاتف 📱</span>
                        <span>💡</span>
                      </h4>
                      <ul className="space-y-1.5 text-[11px] text-slate-600 leading-relaxed list-disc list-inside pr-2">
                        <li>
                          <strong>لمستخدمي الآيفون (iOS 16.4+):</strong> يجب إضافة الموقع إلى الشاشة الرئيسية أولاً (بالنقر على زر <strong>مشاركة 📤</strong> في Safari ثم اختيار <strong>إضافة للشاشة الرئيسية ➕</strong>). بعد فتح التطبيق من الشاشة الرئيسية، انقر على زر <strong>تفعيل إشعارات الهاتف الخارجية</strong> أعلاه للسماح بالتنبيهات.
                        </li>
                        <li>
                          <strong>لمستخدمي الأندرويد (Android):</strong> تأكد من تفعيل إذن الإشعارات من إعدادات النظام الخاص بهاتفك عند النقر على زر التفعيل أعلاه.
                        </li>
                        <li>
                          <strong>تأكيد الاتصال السحابي:</strong> عند تفعيل الإشعارات بنجاح، سيظهر لك الإشعار فوراً في الخلفية (خارج التطبيق) حتى لو كان الهاتف مغلقاً، طالما أن مدير المدرسة قد قام بتهيئة <strong>مفتاح خادم FCM</strong> في لوحة تحكم الإدارة العامة.
                        </li>
                      </ul>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      {/* Received Messages & Notifications list */}
                      <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm lg:col-span-2 space-y-4">
                        <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
                          <div className="text-right">
                            <h4 className="font-bold text-slate-800 text-xs">صندوق الرسائل والإشعارات الواردة</h4>
                            <p className="text-[10px] text-slate-400 mt-0.5">مرتبة من الأقدم للأحدث مع إمكانية الحذف من عرضك.</p>
                          </div>
                          <span className="bg-indigo-50 text-indigo-700 font-bold font-mono px-2.5 py-1 rounded-xl text-xs">
                            {receivedMessages.length} رسالة
                          </span>
                        </div>

                        <div className="space-y-3 max-h-[350px] overflow-y-auto p-1">
                          {receivedMessages.map(msg => {
                            const isFromDirector = msg.senderRole === 'director';
                            const isUnread = !msg.read;
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
                                    ? isFromDirector 
                                      ? 'bg-amber-50 border-amber-300 shadow-sm ring-2 ring-amber-400/50 hover:bg-amber-100/70' 
                                      : 'bg-indigo-50 border-indigo-300 shadow-sm ring-2 ring-indigo-400/50 hover:bg-indigo-100/70'
                                    : isFromDirector 
                                      ? 'bg-amber-50/40 border-amber-100/50 hover:bg-amber-50/70' 
                                      : 'bg-indigo-50/20 border-indigo-100/30 hover:bg-indigo-50/40'
                                }`}
                                title={isUnread ? "انقر لتحديد هذه الرسالة كمقروءة" : undefined}
                              >
                                <div className="flex justify-between items-center mb-2.5">
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteParentMessage(msg.id);
                                      }}
                                      className="text-rose-500 hover:bg-rose-50 px-2.5 py-1 rounded-lg transition flex items-center gap-1 cursor-pointer text-[10px] font-bold border border-rose-100 bg-white shadow-xs"
                                      title="حذف الإشعار"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                      <span>حذف</span>
                                    </button>
                                    
                                    {isUnread && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          markAsRead(msg.id);
                                        }}
                                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded-lg text-[10px] font-bold transition flex items-center gap-1 shadow-sm"
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
                                      <span className="bg-red-500 text-white text-[9px] px-2 py-0.5 rounded-full font-bold animate-pulse">
                                        جديد ✉️
                                      </span>
                                    )}
                                    {isFromDirector ? (
                                      <span className="bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-md text-[10px]">
                                        من الإدارة 🏛️
                                      </span>
                                    ) : (
                                      <span className="bg-indigo-100 text-indigo-800 font-bold px-2 py-0.5 rounded-md text-[10px]">
                                        من المعلم: {msg.senderName} 👨‍🏫
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="text-slate-700 leading-relaxed text-right text-xs bg-white/70 p-3 rounded-xl border border-slate-100/50">
                                  {renderMessageContent(msg.content)}
                                </div>
                              </div>
                            );
                          })}

                          {receivedMessages.length === 0 && (
                            <div className="text-center py-16 text-slate-400 text-xs italic">
                              لا توجد رسائل أو إشعارات واردة حتى الآن.
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Chat Area on the Side */}
                      <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between h-[450px]">
                        <div>
                          <div className="pb-3 border-b border-slate-100 flex flex-col gap-2 mb-3">
                            <div className="flex justify-between items-center text-xs font-semibold">
                              <span className="text-slate-700">جهة التواصل النشطة:</span>
                              <span className="text-emerald-600 flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                <span>نشط الآن</span>
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-lg">
                              <button
                                type="button"
                                onClick={() => setChatRecipient('teacher')}
                                className={`text-[10px] font-bold py-1.5 rounded-md transition cursor-pointer ${chatRecipient === 'teacher' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
                              >
                                المعلم: {activeChildTeacher?.name || 'مشرف الصف'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setChatRecipient('director')}
                                className={`text-[10px] font-bold py-1.5 rounded-md transition cursor-pointer ${chatRecipient === 'director' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
                              >
                                الإدارة: المدير العام
                              </button>
                            </div>
                          </div>

                          <div className="space-y-3 max-h-[250px] overflow-y-auto p-1">
                            {chatMessages.map(msg => {
                              const isIncomingUnread = msg.receiverId === selectedParentId && !msg.read;
                              return (
                                <div
                                  key={msg.id}
                                  onClick={() => {
                                    if (isIncomingUnread) {
                                      markAsRead(msg.id);
                                    }
                                  }}
                                  className={`p-3 rounded-xl border text-xs max-w-[85%] transition-all duration-200 ${
                                    msg.senderId === selectedParentId
                                      ? 'bg-indigo-50/50 border-indigo-100/40 text-right mr-auto'
                                      : isIncomingUnread
                                      ? 'bg-amber-50 border-amber-200 text-right ml-auto cursor-pointer shadow-xs ring-2 ring-amber-400 hover:bg-amber-100/80 animate-pulse'
                                      : 'bg-slate-50 border-slate-100 text-right ml-auto'
                                  }`}
                                  title={isIncomingUnread ? "انقر لتحديد هذه الرسالة كمقروءة" : undefined}
                                >
                                  <div className="flex justify-between font-bold text-[10px] mb-1 text-slate-500 gap-4">
                                    <span className="flex items-center gap-1">
                                      <span>{msg.senderId === selectedParentId ? 'أنت' : msg.senderName}</span>
                                      {isIncomingUnread && (
                                        <span className="bg-amber-500 text-white text-[8px] px-1 py-0.5 rounded font-bold">
                                          جديد ✉️
                                        </span>
                                      )}
                                    </span>
                                    <span className="font-mono">{new Date(msg.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                  </div>
                                  {renderMessageContent(msg.content)}
                                </div>
                              );
                            })}

                            {chatMessages.length === 0 && (
                              <div className="text-center p-8 text-slate-400 text-xs italic">
                                {chatRecipient === 'teacher' ? 'ابدأ المحادثة الآن واكتب أول رسالة للأستاذ المشرف.' : 'تواصل مباشرة مع المدير العام أو إدارة المدرسة لطرح استفسار أو مشكلة.'}
                              </div>
                            )}
                          </div>
                        </div>

                        <form onSubmit={handleSendParentMsg} className="mt-4 pt-3 border-t border-slate-100 flex gap-2">
                          <input
                            type="text"
                            value={parentMsgText}
                            onChange={e => setParentMsgText(e.target.value)}
                            placeholder="اكتب رسالتك هنا..."
                            className="flex-1 text-xs border border-slate-200 px-3 py-2 rounded-xl focus:outline-none focus:border-indigo-500 bg-slate-50"
                            required
                          />
                          <button
                            type="submit"
                            className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-indigo-700 transition cursor-pointer flex items-center gap-1 shrink-0"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>إرسال</span>
                          </button>
                        </form>
                      </div>
                    </div>
                  </motion.div>
                );
              })()}

              {/* Submit Absence Excuse Tab */}
              {activeTab === 'excuse' && (
                <motion.div
                  key="excuse"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">تقديم عذر غياب طبي/إداري</h3>
                    <p className="text-slate-500 text-xs mt-1">
                      عند مرافقة طفلك لمستشفى أو تغيبه لعذر قاهر، يمكنك إرسال التبرير للإدارة فوراً لتفادي احتساب غياب غير مبرر.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm lg:col-span-2">
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
                              value={activeChild.name}
                              className="w-full text-xs border border-transparent bg-slate-50 text-slate-500 px-3.5 py-2 rounded-xl focus:outline-none"
                              disabled
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1.5">مبرر الغياب بالتفصيل *</label>
                          <textarea
                            rows={4}
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

                    {/* History of submitted excuses */}
                    <div className="space-y-4">
                      <h4 className="font-bold text-slate-800 text-xs">طلبات الأعذار السابقة وحالتها</h4>
                      
                      <div className="space-y-3">
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
                              <p className="text-[11px] text-slate-600 line-clamp-2">{exc.reason}</p>
                              {exc.notes && (
                                <p className="text-[10px] text-slate-400 bg-slate-50 p-1.5 rounded border border-slate-100/30">
                                  <strong>رد الإدارة:</strong> {exc.notes}
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
                        لوحة المتابعة والتحصيل المالي التفصيلية بالدولار ($) الخاصة بالطالب <strong className="text-indigo-600">{activeChild.name}</strong>.
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
                          <li>يرجى إرفاق رقم قيد الطالب <strong className="text-amber-300 font-mono">#{activeChild.rollNo}</strong> كمرجع للتحويل لضمان سرعة تسجيلها.</li>
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
    </div>
  );
}
