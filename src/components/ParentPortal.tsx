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
  Smartphone,
  Download,
  ExternalLink,
  Sparkles,
  Building2
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

  const [schoolAppIcon, setSchoolAppIcon] = useState<string>(() => {
    return localStorage.getItem('school_app_icon') || '';
  });

  React.useEffect(() => {
    const handleStorageUpdate = () => {
      const savedIcon = localStorage.getItem('school_app_icon');
      if (savedIcon !== null) {
        setSchoolAppIcon(savedIcon);
      }
    };
    window.addEventListener('school_storage_update', handleStorageUpdate);
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
  const activeChildTeacher = 
    teachers.find(t => t.id === activeChildClass?.teacherId) ||
    teachers.find(t => activeChildClass?.id && t.classes && t.classes.includes(activeChildClass.id)) ||
    teachers[0];

  // --- Auto-Login & Save Phone Number States ---
  const [rememberMe, setRememberMe] = React.useState<boolean>(true);
  const savedLoginInput = typeof window !== 'undefined' ? localStorage.getItem('parent_portal_saved_login_input') || '' : '';

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

    const senderNameStr = activeParent?.name
      ? `${activeParent.name} (ولي أمر ${activeChild?.name || 'الطالب'})`
      : `ولي أمر الطالب ${activeChild?.name || ''}`;

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
    if (students.length === 0) return;

    // Verify if currently loggedInStudentId actually exists in students list
    const isCurrentValid = students.some(s => s.id === loggedInStudentId || s.rollNo === loggedInStudentId);

    if (loggedInStudentId && !isCurrentValid) {
      // If logged in student ID is no longer valid, reset
      setLoggedInStudentId('');
      setSelectedChildId('');
      return;
    }

    if (!loggedInStudentId) {
      const autoLogin = localStorage.getItem('parent_portal_auto_login');
      // If user explicitly logged out, do not auto-login
      if (autoLogin === 'false') return;

      const savedStudentId = localStorage.getItem('parent_portal_student_id');
      const savedInput = localStorage.getItem('parent_portal_saved_login_input');

      // 1. Try saved student ID directly
      let targetStudent = students.find(s => s.id === savedStudentId || s.rollNo === savedStudentId);

      // 2. Try saved input (roll number or phone)
      if (!targetStudent && savedInput) {
        const cleanInput = savedInput.trim();
        targetStudent = students.find(
          s => s.rollNo === cleanInput || s.id.toLowerCase() === cleanInput.toLowerCase()
        );
        if (!targetStudent) {
          const targetPhone = cleanInput.replace(/\s+/g, '');
          const foundParent = parents.find(p => {
            const pPhone = p.phone ? p.phone.replace(/\s+/g, '') : '';
            return pPhone === targetPhone || (pPhone && targetPhone && (pPhone.endsWith(targetPhone) || targetPhone.endsWith(pPhone)));
          });
          if (foundParent) {
            targetStudent = students.find(s => s.parentId === foundParent.id);
          }
        }
      }

      // 3. Direct access default: Auto-select first student only if auto_login is not explicitly set to false
      if (!targetStudent && autoLogin !== 'false' && students[0]) {
        targetStudent = students[0];
      }

      if (targetStudent) {
        setLoggedInStudentId(targetStudent.id);
        setSelectedChildId(targetStudent.id);
        localStorage.setItem('parent_portal_student_id', targetStudent.id);
      }
    }
  }, [students, parents, loggedInStudentId]);

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
    const currentMessages = messages.filter(m => m.receiverId === selectedParentId || m.receiverRole === 'parent');

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
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(title, { body, icon: '/icon.png' });
        }
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
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(title, { body, icon: '/icon.png' });
        }
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
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(title, { body, icon: '/icon.png' });
        }
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
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(title, { body, icon: '/icon.png' });
          }
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

          // Load public VAPID key from school_fcm_config sync or localStorage
          let configuredVapidKey = 'BPr7CisEId0VlPof_fC7WlO5X4QY68Kby6eNclvX6XoI1XUf_SgM_f7E6G8Q9g2g5Ncl7H5p18qHlJ7m8Q9p2p0';
          const savedFcmConfig = localStorage.getItem('school_fcm_config');
          if (savedFcmConfig) {
            try {
              const parsedConfig = JSON.parse(savedFcmConfig);
              if (parsedConfig && parsedConfig.vapidKey) {
                configuredVapidKey = parsedConfig.vapidKey;
                console.log("[FCM PWA] Using custom VAPID Key from configuration:", configuredVapidKey);
              }
            } catch (e) {
              console.warn("Could not parse saved school_fcm_config:", e);
            }
          }

          // Standard public VAPID key for web push notifications
          const token = await getToken(messaging, {
            serviceWorkerRegistration: activeRegistration,
            vapidKey: configuredVapidKey
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
      localStorage.setItem('parent_portal_saved_login_input', cleanInput);
      localStorage.setItem('parent_portal_auto_login', rememberMe ? 'true' : 'false');
      setSelectedChildId(foundStudent.id);
      setLoginError('');
    } else {
      setLoginError('رقم الدخول غير مسجل. يرجى إدخال رقم الطالب الموحد (مثال: 101) أو رقم هاتف ولي الأمر المسجل بدقة.');
    }
  };

  const handleLogout = () => {
    setLoggedInStudentId('');
    localStorage.removeItem('parent_portal_student_id');
    localStorage.removeItem('parent_portal_saved_login_input');
    localStorage.setItem('parent_portal_auto_login', 'false'); // Disable automatic login loop on manual logout
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

  const markAllAsRead = () => {
    if (setMessages) {
      setMessages(prev => {
        const updated = prev.map(m => m.receiverId === selectedParentId && !m.read ? { ...m, read: true } : m);
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

  const isTeacherGradeMessage = (m: Message) => {
    if (m.senderRole !== 'teacher') return false;
    const contentLower = m.content.toLowerCase();
    return (
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
    const isForParent = m.receiverId === selectedParentId || m.receiverRole === 'parent' || m.receiverId === 'parent';
    const isForChild = !m.studentId || m.studentId === selectedChildId;
    const isFromStaff = m.senderRole === 'teacher' || m.senderRole === 'director';
    const isBehavior = m.content.includes('سلوك') || 
                       m.content.includes('تنبيه سلوكي') || 
                       m.content.includes('تصنيف الإشعار: سلوك') ||
                       m.content.includes('ملاحظة سلوكية') ||
                       m.content.includes('تقييم سلوكي');
    return isForParent && isForChild && isFromStaff && isBehavior;
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const unreadBehaviorCount = childBehaviorMessages.filter(m => !m.read).length;

  const unreadMessagesCount = messages.filter(m => 
    (!m.studentId || m.studentId === selectedChildId) && 
    (m.receiverId === selectedParentId || m.receiverId === 'parent' || m.receiverRole === 'parent') && 
    !m.read &&
    isTeacherGradeMessage(m)
  ).length;

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
  const [parentSelectedMonth, setParentSelectedMonth] = useState<string>('');
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
      const isParentInvolved = m.senderId === selectedParentId || 
        m.receiverId === selectedParentId || 
        m.senderRole === 'parent' || 
        m.receiverRole === 'parent';
      return isRelatedToChild && isParentInvolved && !isTeacherGradeMessage(m);
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const unreadDirectCount = directMessages.filter(m => m.receiverId === selectedParentId && !m.read).length;

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
                  const isUnread = msg.receiverId === selectedParentId && !msg.read;

                  return (
                    <div
                      key={msg.id}
                      onClick={() => {
                        if (isUnread) markAsRead(msg.id);
                      }}
                      className={`p-3.5 rounded-2xl border text-xs transition-all duration-200 text-right space-y-2 ${
                        isSentByParent
                          ? 'bg-indigo-50/80 border-indigo-200 text-slate-800 mr-4 border-r-4 border-r-indigo-600'
                          : isUnread
                          ? 'bg-amber-50 border-amber-300 text-slate-800 ml-4 cursor-pointer ring-2 ring-amber-400 animate-pulse'
                          : 'bg-white border-slate-200 text-slate-800 ml-4 shadow-3xs'
                      }`}
                    >
                      <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 border-b border-slate-100/60 pb-1.5">
                        <div className="flex items-center gap-1.5">
                          {isSentByParent ? (
                            <span className="bg-indigo-600 text-white px-2 py-0.5 rounded text-[9px] font-extrabold">
                              👤 أرسلتها أنت (ولي الأمر)
                            </span>
                          ) : msg.senderRole === 'director' ? (
                            <span className="bg-amber-500 text-white px-2 py-0.5 rounded text-[9px] font-extrabold">
                              🏫 رد من إدارة المدرسة
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
                    عندما يقوم المعلم برصد درجات جديدة أو إرسال كشف تقييم للطالب {activeChild?.name || 'الطالب'}، ستظهر هنا فورياً وموثقة.
                  </p>
                </div>
              ) : (
                teacherGradeMessages.map(msg => {
                  const isIncomingUnread = msg.receiverId === selectedParentId && !msg.read;
                  
                  return (
                    <div
                      key={msg.id}
                      onClick={() => {
                        if (isIncomingUnread) {
                          markAsRead(msg.id);
                        }
                      }}
                      className={`p-4 rounded-2xl border text-xs transition-all duration-200 text-right space-y-2 ${
                        isIncomingUnread
                          ? 'bg-amber-50/90 border-amber-300 text-slate-800 cursor-pointer ring-1 ring-amber-400 animate-pulse shadow-sm'
                          : 'bg-white border-slate-200/80 text-slate-800 shadow-3xs hover:border-indigo-200'
                      }`}
                    >
                      <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 border-b border-slate-100 pb-2">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                          <span className="text-slate-800 font-extrabold text-[11px]">المعلم: {msg.senderName}</span>
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
      } else if (estimationValue.includes('مقبول')) {
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

                  if (gv.score >= 90) {
                    chipStyle = 'bg-emerald-50/80 text-emerald-950 border-emerald-200';
                    scoreBadge = 'bg-emerald-600 text-white';
                    statusEmoji = '🌟 ممتاز';
                  } else if (gv.score >= 80) {
                    chipStyle = 'bg-teal-50/80 text-teal-950 border-teal-200';
                    scoreBadge = 'bg-teal-600 text-white';
                    statusEmoji = '🏅 جيد جداً';
                  } else if (gv.score >= 70) {
                    chipStyle = 'bg-blue-50/80 text-blue-950 border-blue-200';
                    scoreBadge = 'bg-blue-600 text-white';
                    statusEmoji = '👍 جيد';
                  } else if (gv.score >= 50) {
                    chipStyle = 'bg-amber-50/80 text-amber-950 border-amber-200';
                    scoreBadge = 'bg-amber-600 text-white';
                    statusEmoji = '⚠️ مقبول';
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

  if (!loggedInStudentId) {
    return (
      <div id="parent-login-screen" className="bg-slate-50 min-h-screen flex flex-col items-center justify-center p-4 space-y-4">
        <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-xl p-6 space-y-6">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 bg-indigo-600 rounded-2xl text-white shadow-md flex items-center justify-center mx-auto mb-4 overflow-hidden">
              {schoolAppIcon ? (
                <img src={schoolAppIcon} alt="الشعار" className="w-full h-full object-cover" />
              ) : (
                <User className="w-8 h-8" />
              )}
            </div>
            <h2 className="text-xl font-bold text-slate-800">بوابة ولي الأمر الإلكترونية</h2>
            <p className="text-slate-500 text-xs leading-relaxed">
              الدخول المباشر إلى بوابة ولي الأمر لمتابعة الدرجات والغياب والرسائل المدرسية.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2">أدخل رقم الطالب الموحد / رقم الهاتف</label>
              <input
                type="text"
                value={studentRollInput}
                onChange={e => setStudentRollInput(e.target.value)}
                placeholder="أدخل الرقم التعريفي للطفل أو رقم الهاتف..."
                className="w-full text-xs border border-slate-200 px-4 py-3 rounded-xl focus:outline-none focus:border-indigo-500 font-mono text-center font-bold bg-slate-50"
              />
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
                حفظ الرقم وتفعيل الدخول التلقائي لاحقاً 🔐
              </label>
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

          <div className="border-t border-slate-100 pt-4 text-center">
            <p className="text-[10px] text-slate-400">نظام المدرسة الدولية - مارع</p>
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
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-right text-xs font-semibold transition-all duration-200 ${
                  activeTab === 'messages' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-300 hover:bg-slate-900 hover:text-slate-100'
                }`}
              >
                <MessageSquare className="w-4.5 h-4.5 shrink-0 text-emerald-400" />
                <span>تواصل مباشر + إشعارات الدرجات 💬</span>
                {unreadMessagesCount > 0 && (
                  <span className="mr-auto bg-emerald-500 text-white px-1.5 py-0.5 rounded-full text-[9px] font-bold animate-pulse">
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
        <div className={`${isMobileMenuOpen ? 'block mt-6' : 'hidden md:block'} mt-8 border-t border-slate-800 pt-4 text-[10px] text-slate-400 text-right space-y-1`}>
          <p>تطبيق ولي الأمر المعتمد - نظام المدرسة الدولية</p>
        </div>
      </div>

      {/* Main content body */}
      <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto min-h-screen w-full">
        {/* Active Child Summary Header */}
        {activeChild ? (
          <div className="mb-6 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col xl:flex-row items-stretch xl:items-center gap-4 justify-between">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-black text-lg shrink-0">
                {activeChild?.name?.charAt(0) || 'ط'}
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block font-medium">بيانات الطالب المحدد</span>
                <h2 className="font-bold text-slate-800 text-base">{activeChild?.name || 'الطالب'}</h2>
                <div className="flex gap-2 text-[11px] text-slate-500 mt-0.5">
                  <span>الفصل: <strong className="text-indigo-600">{activeChildClass?.name || 'عام'}</strong></span>
                  <span>•</span>
                  <span>رقم القيد: <strong className="font-mono">#{activeChild?.rollNo || '---'}</strong></span>
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
                      {/* Horizontal Report Card Model sent by Director */}
                      {(() => {
                        const savedSubjects = localStorage.getItem('school_custom_subjects');
                        const parsedSubjects = savedSubjects ? JSON.parse(savedSubjects) : [];
                        const activeSubjects = parsedSubjects.length > 0 
                          ? parsedSubjects 
                          : ['الرياضيات', 'العلوم', 'اللغة العربية', 'التربية الإسلامية', 'اللغة الإنجليزية', 'الاجتماعيات'];

                        // Get all months that have grades for this child
                        const allChildGrades = grades.filter(g => g.studentId === selectedChildId);
                        const uniqueGradeMonths = Array.from(new Set(allChildGrades.map(g => g.examName).filter(Boolean)));
                        
                        // Default month to show
                        const targetMonth = parentSelectedMonth || currentEvaluationMonth;
                        
                        const studentGrades = allChildGrades.filter(g => g.examName === targetMonth);

                        let totalScore = 0;
                        let scoredCount = 0;
                        const gradeValues = activeSubjects.map(sub => {
                          const subGrade = studentGrades.find(g => g.subject === sub);
                          if (subGrade) {
                            totalScore += subGrade.score;
                            scoredCount++;
                          }
                          return {
                            subject: sub,
                            score: subGrade ? subGrade.score : null
                          };
                        });

                        const avg = scoredCount > 0 ? (totalScore / scoredCount).toFixed(1) : null;
                        let estimation = '---';
                        let badgeColor = 'bg-slate-100 text-slate-700';
                        if (avg !== null) {
                          const avgNum = parseFloat(avg);
                          if (avgNum >= 90) {
                            estimation = 'ممتاز 🌟';
                            badgeColor = 'bg-emerald-50 text-emerald-700 border-emerald-100';
                          } else if (avgNum >= 80) {
                            estimation = 'جيد جداً 🎈';
                            badgeColor = 'bg-teal-50 text-teal-700 border-teal-100';
                          } else if (avgNum >= 70) {
                            estimation = 'جيد 👍';
                            badgeColor = 'bg-blue-50 text-blue-700 border-blue-100';
                          } else if (avgNum >= 60) {
                            estimation = 'مقبول';
                            badgeColor = 'bg-amber-50 text-amber-700 border-amber-100';
                          } else {
                            estimation = 'ضعيف';
                            badgeColor = 'bg-rose-50 text-rose-700 border-rose-100';
                          }
                        }

                        return (
                          <div className="bg-white rounded-2xl border-2 border-indigo-600/30 shadow-md p-5 text-right space-y-4 overflow-hidden mb-4" style={{ direction: 'rtl' }}>
                            {/* Header */}
                            <div className="border-b border-slate-100 pb-3 flex flex-col sm:flex-row items-center justify-between gap-3">
                              <div className="space-y-1 w-full sm:w-auto">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-base">📋</span>
                                  <h4 className="text-sm font-black text-indigo-950">
                                    التقرير الشهري المعتمد لشهر:
                                  </h4>
                                  <select
                                    value={targetMonth}
                                    onChange={(e) => setParentSelectedMonth(e.target.value)}
                                    className="bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-1 text-indigo-900 text-xs font-black focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                                  >
                                    {Array.from(new Set([currentEvaluationMonth, ...uniqueGradeMonths])).map(m => (
                                      <option key={m} value={m}>{m}</option>
                                    ))}
                                  </select>
                                </div>
                                <p className="text-[10px] text-slate-400 font-medium">التقرير المعتمد والموقّع إلكترونياً من إدارة المدرسة لولي الأمر</p>
                              </div>
                              <div className="bg-indigo-50 border border-indigo-100 px-3 py-1 rounded-lg flex items-center gap-1.5 shrink-0">
                                <span className="text-[9px] text-indigo-700 font-bold">الحالة:</span>
                                <span className="text-[9px] bg-emerald-500 text-white px-2 py-0.5 rounded-full font-black">
                                  {scoredCount > 0 ? "مكتمل وموثّق ✅" : "قيد الانتظار ⏳"}
                                </span>
                              </div>
                            </div>

                            {/* Grades complete horizontally */}
                            <div className="overflow-x-auto pb-1 scrollbar-thin">
                              <table className="w-full text-center border border-slate-100 rounded-xl overflow-hidden min-w-[500px]">
                                <thead>
                                  <tr className="bg-slate-50 text-slate-600 text-[10px] font-bold border-b border-slate-100">
                                    {gradeValues.map(gv => (
                                      <th key={gv.subject} className="p-2 border-l border-slate-100 font-bold">{gv.subject}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr className="bg-white text-slate-800 text-xs font-bold">
                                    {gradeValues.map(gv => (
                                      <td key={gv.subject} className="p-3 border-l border-slate-100 font-mono text-sm">
                                        {gv.score !== null ? (
                                          <span className={gv.score < 50 ? 'text-red-500 font-black' : 'text-slate-900 font-black'}>
                                            {gv.score}
                                          </span>
                                        ) : (
                                          <span className="text-slate-300 font-light">---</span>
                                        )}
                                      </td>
                                    ))}
                                  </tr>
                                </tbody>
                              </table>
                            </div>

                            {/* After the grades: average and appreciation */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                              <div className="bg-indigo-50/60 border border-indigo-100 p-3 rounded-xl flex items-center justify-between">
                                <span className="text-[11px] font-bold text-indigo-950 flex items-center gap-1">
                                  <span>📈</span>
                                  <span>المعدل العام للشهر:</span>
                                </span>
                                <span className="text-sm font-black text-indigo-700 font-mono">
                                  {avg !== null ? `${avg}%` : '---'}
                                </span>
                              </div>

                              <div className={`border p-3 rounded-xl flex items-center justify-between ${avg !== null ? badgeColor : 'bg-slate-50 border-slate-100'}`}>
                                <span className="text-[11px] font-bold flex items-center gap-1">
                                  <span>📝</span>
                                  <span>التقدير العام:</span>
                                </span>
                                <span className="text-xs font-black">
                                  {estimation}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Monthly Evaluation Card from Director & Teacher */}
                      {(() => {
                        const targetMonth = parentSelectedMonth || currentEvaluationMonth;
                        const evalForMonth = monthlyEvaluations[`${selectedChildId}_${targetMonth}`] || 
                          (monthlyEvaluations[selectedChildId]?.month === targetMonth ? monthlyEvaluations[selectedChildId] : null);
                        
                        const teacherMsg = evalForMonth?.teacherText !== undefined ? evalForMonth.teacherText : (evalForMonth?.text || '');
                        const directorMsg = evalForMonth?.directorText || '';

                        const schoolLogo = localStorage.getItem('school_logo_image');
                        const studentPhoto = localStorage.getItem(`student_photo_${selectedChildId}`) || localStorage.getItem(`student_photo_${activeChild?.name}`);

                        if (!teacherMsg.trim() && !directorMsg.trim()) return null;

                        return (
                          <div className={`p-5 rounded-2xl shadow-xs text-right space-y-3 border transition duration-200 ${
                            isEvalUnread 
                              ? 'bg-rose-50 border-rose-300 ring-2 ring-rose-400/50 shadow-sm' 
                              : 'bg-indigo-50/80 border border-indigo-100/80'
                          }`}>
                            {/* Official Header with Logo & Photo if present */}
                            {(schoolLogo || studentPhoto) && (
                              <div className="bg-white/90 p-3 rounded-xl border border-indigo-100 flex items-center justify-between gap-3 shadow-2xs mb-2">
                                <div className="flex items-center gap-2.5">
                                  {schoolLogo && (
                                    <img src={schoolLogo} alt="شعار المدرسة" className="w-9 h-9 object-contain rounded-lg border border-slate-100 p-0.5" />
                                  )}
                                  <div>
                                    <span className="font-bold text-xs text-indigo-950 block">المدرسة الدولية الخاصة</span>
                                    <span className="text-[10px] text-slate-500 font-medium block">تقرير المتابعة المعتمد</span>
                                  </div>
                                </div>

                                {studentPhoto && (
                                  <img src={studentPhoto} alt="صورة الطالب" className="w-10 h-10 rounded-xl object-cover border border-indigo-200 shadow-2xs shrink-0" />
                                )}
                              </div>
                            )}

                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] bg-indigo-600 text-white px-2.5 py-0.5 rounded-full font-bold">
                                  توجيهات وتقارير المتابعة لشهر: {evalForMonth?.month || targetMonth}
                                </span>
                                {isEvalUnread && (
                                  <span className="bg-red-500 text-white text-[9px] px-1.5 py-0.5 rounded font-bold animate-pulse">
                                    جديد 🆕
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-indigo-600 font-bold flex items-center gap-1">
                                📋 التقرير الشهري المعتمد
                              </span>
                            </div>

                            <div className="space-y-2 text-xs">
                              {teacherMsg.trim() !== '' && (
                                <div className="bg-white/80 p-2.5 rounded-xl border border-indigo-100/80">
                                  <span className="font-bold text-indigo-900 block text-[11px] mb-0.5">👨‍🏫 توجيهات المعلم:</span>
                                  <p className="text-slate-800 font-medium whitespace-pre-line leading-relaxed">{teacherMsg}</p>
                                </div>
                              )}
                              {directorMsg.trim() !== '' && (
                                <div className="bg-amber-50/80 p-2.5 rounded-xl border border-amber-200/80">
                                  <span className="font-bold text-amber-900 block text-[11px] mb-0.5">🏫 توجيهات الإدارة:</span>
                                  <p className="text-slate-800 font-medium whitespace-pre-line leading-relaxed">{directorMsg}</p>
                                </div>
                              )}
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
                          className={`p-5 rounded-2xl border-y border-l shadow-sm flex flex-col justify-between hover:shadow-md transition ${
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
                                  <span className="bg-red-500 text-white text-[9px] px-1.5 py-0.5 rounded font-bold animate-pulse">
                                    جديد 🆕
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
                    {monthlyEvaluations[selectedChildId] && monthlyEvaluations[selectedChildId].text.trim() && (
                      <div className="bg-gradient-to-br from-indigo-50/50 to-white border border-indigo-100 p-5 rounded-2xl shadow-xs space-y-3">
                        <div className="flex justify-between items-center border-b border-indigo-50 pb-3">
                          <div className="flex items-center gap-2">
                            <span className="bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-lg text-[10px] font-bold">
                              👑 تقييم معتمد من الإدارة
                            </span>
                          </div>
                          <span className="text-[11px] font-black text-slate-600">
                            التقييم السلوكي لـ {monthlyEvaluations[selectedChildId].month || currentEvaluationMonth}
                          </span>
                        </div>
                        <p className="text-slate-700 text-xs font-bold leading-relaxed whitespace-pre-line text-right bg-white p-3.5 rounded-xl border border-indigo-50/50">
                          {monthlyEvaluations[selectedChildId].text}
                        </p>
                      </div>
                    )}

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

                        return (
                          <div key={msg.id} className={`p-5 rounded-2xl border ${cardBorder} shadow-2xs space-y-3 transition duration-200 hover:shadow-xs`}>
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100/80 pb-2.5">
                              <div className="flex items-center gap-2">
                                <span className={`px-2.5 py-0.5 rounded-full border text-[10px] font-bold ${tagBg}`}>
                                  {tagText}
                                </span>
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
    </div>
  );
}
