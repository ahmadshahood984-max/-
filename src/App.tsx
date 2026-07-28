/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Teacher, 
  Student, 
  Parent, 
  Class, 
  Attendance, 
  Grade, 
  Announcement, 
  Message, 
  AbsenceExcuse 
} from './types';
import { 
  INITIAL_CLASSES, 
  INITIAL_TEACHERS, 
  INITIAL_PARENTS, 
  INITIAL_STUDENTS, 
  INITIAL_ATTENDANCE, 
  INITIAL_GRADES, 
  INITIAL_ANNOUNCEMENTS, 
  INITIAL_MESSAGES, 
  INITIAL_EXCUSES 
} from './data';
import DirectorPortal from './components/DirectorPortal';
import TeacherPortal from './components/TeacherPortal';
import ParentPortal from './components/ParentPortal';
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
  Volume2,
  Smartphone,
  X,
  ExternalLink,
  Copy,
  Share2,
  Menu,
  Laptop,
  Monitor,
  Download,
  CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Live Event log interface
interface SchoolEvent {
  id: string;
  text: string;
  time: string;
  type: 'success' | 'info' | 'warning' | 'primary';
}

export default function App() {
  // --- Persistent State Hooks ---
  const [teachers, setTeachers] = useState<Teacher[]>(() => {
    const saved = localStorage.getItem('school_teachers');
    return saved ? JSON.parse(saved) : INITIAL_TEACHERS;
  });

  const [classes, setClasses] = useState<Class[]>(() => {
    const saved = localStorage.getItem('school_classes');
    return saved ? JSON.parse(saved) : INITIAL_CLASSES;
  });

  const [parents, setParents] = useState<Parent[]>(() => {
    const saved = localStorage.getItem('school_parents');
    return saved ? JSON.parse(saved) : INITIAL_PARENTS;
  });

  const [students, setStudents] = useState<Student[]>(() => {
    const saved = localStorage.getItem('school_students');
    return saved ? JSON.parse(saved) : INITIAL_STUDENTS;
  });

  const [attendance, setAttendance] = useState<Attendance[]>(() => {
    const saved = localStorage.getItem('school_attendance');
    return saved ? JSON.parse(saved) : INITIAL_ATTENDANCE;
  });

  const [grades, setGrades] = useState<Grade[]>(() => {
    const saved = localStorage.getItem('school_grades');
    return saved ? JSON.parse(saved) : INITIAL_GRADES;
  });

  const [announcements, setAnnouncements] = useState<Announcement[]>(() => {
    const saved = localStorage.getItem('school_announcements');
    return saved ? JSON.parse(saved) : INITIAL_ANNOUNCEMENTS;
  });

  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = localStorage.getItem('school_messages');
    return saved ? JSON.parse(saved) : INITIAL_MESSAGES;
  });

  const [excuses, setExcuses] = useState<AbsenceExcuse[]>(() => {
    const saved = localStorage.getItem('school_excuses');
    return saved ? JSON.parse(saved) : INITIAL_EXCUSES;
  });

  const [directorPassword, setDirectorPassword] = useState<string>(() => {
    const saved = localStorage.getItem('school_director_password');
    return saved || '123';
  });

  const [appIcon, setAppIcon] = useState<string>(() => {
    return localStorage.getItem('school_app_icon') || '';
  });

  // Simulator Active Portal: 'director' | 'teacher' | 'parent'
  const [activePortal, setActivePortal] = useState<'director' | 'teacher' | 'parent'>(() => {
    const params = new URLSearchParams(window.location.search);
    const portalParam = params.get('portal');
    if (portalParam === 'teacher' || portalParam === 'parent' || portalParam === 'director') {
      return portalParam as 'director' | 'teacher' | 'parent';
    }
    return 'director';
  });

  // Check if portal is locked based on URL parameter
  const [isPortalLocked] = useState<boolean>(() => {
    const params = new URLSearchParams(window.location.search);
    const portalParam = params.get('portal');
    return portalParam === 'teacher' || portalParam === 'parent' || portalParam === 'director';
  });

  const [isPortalSelectorOpen, setIsPortalSelectorOpen] = useState(false);

  // Live System Events state
  const [events, setEvents] = useState<SchoolEvent[]>([
    { id: '1', text: 'تم تشغيل المنصة المدرسية الموحدة وتوصيل التطبيقات الثلاثة', time: 'الآن', type: 'success' },
    { id: '2', text: 'مزامنة وتوصيل قاعدة البيانات المحلية بنجاح', time: 'قبل دقيقة', type: 'info' }
  ]);

  // Help modal for configuring and testing notifications
  const [showNotificationHelper, setShowNotificationHelper] = useState<boolean>(false);
  const [showDesktopInstallModal, setShowDesktopInstallModal] = useState<boolean>(false);

  // Listen to remote changes via Firebase Sync and update React states in real-time
  useEffect(() => {
    const handleStorageUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<{ key: string; value: string }>;
      const { key, value } = customEvent.detail;
      
      try {
        const parsed = JSON.parse(value);
        switch (key) {
          case 'school_teachers':
            setTeachers(parsed);
            break;
          case 'school_classes':
            setClasses(parsed);
            break;
          case 'school_parents':
            setParents(parsed);
            break;
          case 'school_students':
            setStudents(parsed);
            break;
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

    // Initial load check to capture early Firebase synced keys in localStorage
    const reloadFromLocalStorage = () => {
      const keysToLoad: Record<string, (val: any) => void> = {
        'school_teachers': setTeachers,
        'school_classes': setClasses,
        'school_parents': setParents,
        'school_students': setStudents,
        'school_attendance': setAttendance,
        'school_grades': setGrades,
        'school_announcements': setAnnouncements,
        'school_messages': setMessages,
        'school_excuses': setExcuses,
      };

      Object.entries(keysToLoad).forEach(([key, setter]) => {
        const saved = localStorage.getItem(key);
        if (saved) {
          try {
            setter(JSON.parse(saved));
          } catch (e) {
            // ignore
          }
        }
      });

      const savedPwd = localStorage.getItem('school_director_password');
      if (savedPwd) {
        setDirectorPassword(savedPwd);
      }

      const savedIcon = localStorage.getItem('school_app_icon');
      if (savedIcon !== null) {
        setAppIcon(savedIcon);
      }
    };

    reloadFromLocalStorage();

    return () => {
      window.removeEventListener('school_storage_update', handleStorageUpdate);
    };
  }, []);

  // Save to localStorage whenever state changes with race condition protection
  useEffect(() => {
    const saved = localStorage.getItem('school_teachers');
    const currentStr = JSON.stringify(teachers);
    if (saved !== currentStr) {
      localStorage.setItem('school_teachers', currentStr);
    }
  }, [teachers]);

  useEffect(() => {
    const saved = localStorage.getItem('school_classes');
    const currentStr = JSON.stringify(classes);
    if (saved !== currentStr) {
      localStorage.setItem('school_classes', currentStr);
    }
  }, [classes]);

  useEffect(() => {
    const saved = localStorage.getItem('school_parents');
    const currentStr = JSON.stringify(parents);
    if (saved !== currentStr) {
      localStorage.setItem('school_parents', currentStr);
    }
  }, [parents]);

  useEffect(() => {
    const saved = localStorage.getItem('school_students');
    const currentStr = JSON.stringify(students);
    if (saved !== currentStr) {
      localStorage.setItem('school_students', currentStr);
    }
  }, [students]);

  useEffect(() => {
    const saved = localStorage.getItem('school_attendance');
    const currentStr = JSON.stringify(attendance);
    if (saved !== currentStr) {
      localStorage.setItem('school_attendance', currentStr);
    }
  }, [attendance]);

  useEffect(() => {
    const saved = localStorage.getItem('school_grades');
    const currentStr = JSON.stringify(grades);
    if (saved !== currentStr) {
      localStorage.setItem('school_grades', currentStr);
    }
  }, [grades]);

  useEffect(() => {
    const saved = localStorage.getItem('school_announcements');
    const currentStr = JSON.stringify(announcements);
    if (saved !== currentStr) {
      localStorage.setItem('school_announcements', currentStr);
    }
  }, [announcements]);

  useEffect(() => {
    const saved = localStorage.getItem('school_messages');
    const currentStr = JSON.stringify(messages);
    if (saved !== currentStr) {
      localStorage.setItem('school_messages', currentStr);
    }
  }, [messages]);

  useEffect(() => {
    const saved = localStorage.getItem('school_excuses');
    const currentStr = JSON.stringify(excuses);
    if (saved !== currentStr) {
      localStorage.setItem('school_excuses', currentStr);
    }
  }, [excuses]);

  useEffect(() => {
    const saved = localStorage.getItem('school_director_password');
    if (saved && saved !== directorPassword && directorPassword === '123') {
      return;
    }
    localStorage.setItem('school_director_password', directorPassword);
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

  const handleInstallDesktopApp = async () => {
    const isIframe = typeof window !== 'undefined' && window.self !== window.top;
    if (isIframe) {
      alert(
        "💻 لتثبيت التطبيق بنقرة واحدة كأيقونة على سطح مكتب الكمبيوتر (Desktop):\n\n" +
        "يجب فتح التطبيق في تبويب مستقل خارج إطار المعاينة.\n" +
        "سنفتح لك التطبيق بتبويب جديد الآن، واضغط هناك على زر 'تثبيت على الكمبيوتر' وسينشئ أيقونة سطح المكتب فوراً! 🚀"
      );
      window.open(window.location.href, '_blank');
      return;
    }

    if (pwaPrompt) {
      pwaPrompt.prompt();
      const { outcome } = await pwaPrompt.userChoice;
      if (outcome === 'accepted') {
        (window as any).clearDeferredPrompt?.();
        setPwaPrompt(null);
        alert('🎉 تهانينا! تم تثبيت تطبيق المدرسة الدولية بنجاح كبرنامج وأيقونة على سطح مكتب الكمبيوتر.');
      }
    } else {
      setShowDesktopInstallModal(true);
    }
  };

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      alert('عذراً، متصفحك أو هذا الجهاز لا يدعم الإشعارات الخارجية حالياً. سنقوم بالاعتماد على محاكي التنبيهات الداخلي الذكي!');
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission === 'granted') {
        playPingSound();
        new Notification('🔔 تم تفعيل الإشعارات بنجاح', {
          body: 'المدرسة الدولية: ستصلك رسائل المعلمين والتقارير المدرسية هنا بشكل مباشر وفوري!',
          dir: 'rtl'
        });
        alert('🔔 تم تفعيل إشعارات الهاتف الخارجية بنجاح! ستصلك الآن التنبيهات والرسائل بقمم الهواتف حتى لو كان التطبيق بالخلفية.');
      } else if (permission === 'denied') {
        alert('⚠️ تم رفض أو حظر إذن الإشعارات من المتصفح.\n\nلتفعيلها يدوياً:\n1. اضغط على رمز القفل أو علامة التعجب بجوار عنوان الموقع في شريط المتصفح.\n2. ابحث عن خيار "الإشعارات" (Notifications) وقم بتغييره إلى "السماح" (Allow).\n3. أعد تحميل الصفحة وجرب مجدداً!');
      }
    } catch (e) {
      console.error('Error requesting permission', e);
      alert('⚠️ لم نتمكن من فتح نافذة السماح بالإشعارات بسبب قيود الأمان داخل إطار المعاينة (IFrame).\n\n💡 الحل السريع والفعال:\n1. اضغط على زر "فتح في تبويب جديد" أعلى يسار الشاشة لتشغيل التطبيق بشكل مباشر بمتصفحك.\n2. انقر على زر "تفعيل الإشعارات" هناك وستظهر لك نافذة السماح فوراً كالهاتف!');
    }
  };

  const testNotificationSimulation = () => {
    playPingSound();
    setActiveToast({
      id: 'test-ping-' + Date.now(),
      senderName: 'المربّي / إدارة المدرسة',
      content: '📢 [تصنيف الإشعار: تجربة تفعيل النظام]\nمرحباً بك! هذا تنبيه تجريبي فوري يحاكي إشعارات WhatsApp بالهاتف مع نغمة الرنين المزدوجة المميزة. نظام الإشعارات والمزامنة المباشرة مفعّل وجاهز بالكامل!',
      msgNumber: '777',
      studentName: 'اسم الطالب (تجريبي)'
    });
  };

  // --- Active Teacher and Parent tracking for accurate recipient counters ---
  const [activeTeacherId, setActiveTeacherId] = useState<string>(() => localStorage.getItem('school_active_teacher_id') || '');
  const [activeParentId, setActiveParentId] = useState<string>('');

  useEffect(() => {
    const updateActiveIds = () => {
      const tId = localStorage.getItem('school_active_teacher_id') || '';
      setActiveTeacherId(tId);

      const sId = localStorage.getItem('parent_portal_student_id') || '';
      if (sId) {
        const student = students.find(s => s.id === sId || s.rollNo === sId);
        if (student) {
          setActiveParentId(student.parentId);
        } else {
          setActiveParentId('');
        }
      } else {
        setActiveParentId('');
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
    return messages.filter(m => m.receiverId === activeTeacherId && !m.read).length;
  };

  const getParentUnreadCount = () => {
    if (!activeParentId) return 0;
    return messages.filter(
      m => m.receiverId === activeParentId && 
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

  const [lastMessageCount, setLastMessageCount] = useState<number>(messages.length);

  useEffect(() => {
    if (messages.length > lastMessageCount) {
      const latest = messages[messages.length - 1];
      
      // Notify only if the active portal is the intended receiver of the message
      // AND receiver is not parent (as requested to cancel simulated alerts for parent)
      // AND is the actual logged-in recipient (not another teacher/parent)
      const isActualRecipient = 
        (activePortal === 'director' && latest.receiverId === 'director') ||
        (activePortal === 'teacher' && latest.receiverId === activeTeacherId) ||
        (activePortal === 'parent' && latest.receiverId === activeParentId);

      if (latest && latest.receiverRole === activePortal && latest.receiverRole !== 'parent' && isActualRecipient) {
        // Generate a clear message number (based on ID number or messages array index)
        const numericId = parseInt(latest.id.replace(/\D/g, ''), 10) || (messages.length + 100);
        const msgNumStr = `${numericId}`;
        
        const student = students.find(s => s.id === latest.studentId);
        const studentName = student ? student.name : undefined;

        // Play the ring/alert sound
        playPingSound();

        // Trigger floating top toast
        setActiveToast({
          id: latest.id,
          senderName: latest.senderName,
          content: latest.content,
          msgNumber: msgNumStr,
          studentName
        });

        // Trigger HTML5 Web Notification outside application
        if ('Notification' in window && Notification.permission === 'granted') {
          // Strip internal code category markup for the body
          const cleanBody = latest.content.replace(/^📢 \[تصنيف الإشعار:[^\]]+\]\n/, '');
          const matchCategory = latest.content.match(/^📢 \[تصنيف الإشعار:\s*([^\]]+)\]/);
          const prefix = matchCategory ? `[${matchCategory[1]}] ` : '';

          new Notification(`💬 رسالة جديدة رقم #${msgNumStr}`, {
            body: `من المعلم: ${latest.senderName}\nالموضوع: ${prefix}${cleanBody}`,
            icon: 'https://cdn-icons-png.flaticon.com/512/124/124034.png', // WhatsApp style logo
            tag: 'msg-' + latest.id,
            dir: 'rtl'
          });
        }
      }
    }
    setLastMessageCount(messages.length);
  }, [messages, lastMessageCount, students]);

  // --- Boot Saved System Patches on Startup ---
  useEffect(() => {
    try {
      const stored = localStorage.getItem('system_patches');
      if (stored) {
        const patches: string[] = JSON.parse(stored);
        patches.forEach((codeStr, idx) => {
          try {
            eval(codeStr);
            console.log(`Successfully booted loaded system patch #${idx + 1}`);
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
    const id = 't' + (teachers.length + 1);
    const joinDate = new Date().toISOString().split('T')[0];
    const newTeacher: Teacher = { ...teacherData, id, joinDate };
    
    setTeachers(prev => [...prev, newTeacher]);
    logEvent(`المدير أضاف المعلم الجديد: ${newTeacher.name} وتخصيص المواد: ${newTeacher.subjects.join(', ')}`, 'success');
  };

  const updateTeacherPassword = (teacherId: string, newPass: string) => {
    setTeachers(prev => prev.map(t => t.id === teacherId ? { ...t, password: newPass } : t));
    const teacherName = teachers.find(t => t.id === teacherId)?.name || '';
    logEvent(`المدير قام بتعديل كلمة مرور المعلم: ${teacherName}`, 'success');
  };

  const changeDirectorPassword = (newPass: string) => {
    setDirectorPassword(newPass);
    logEvent(`تم تعديل كلمة مرور المدير العام بنجاح`, 'success');
  };

  // 2. Director registers a Student and links/creates a Parent
  const addStudent = (studentData: Omit<Student, 'id'>, parentData: Omit<Parent, 'id' | 'childrenIds'>) => {
    const studentId = 's' + (students.length + 1);
    
    // Check if parent already exists (by phone)
    let parentId = '';
    const existingParent = parents.find(p => p.phone === parentData.phone);
    
    if (existingParent) {
      parentId = existingParent.id;
      // update parent's children
      setParents(prev => prev.map(p => 
        p.id === parentId ? { ...p, childrenIds: [...p.childrenIds, studentId] } : p
      ));
    } else {
      parentId = 'p' + (parents.length + 1);
      const newParent: Parent = {
        id: parentId,
        name: parentData.name,
        email: parentData.email,
        phone: parentData.phone,
        childrenIds: [studentId]
      };
      setParents(prev => [...prev, newParent]);
    }

    const newStudent: Student = {
      ...studentData,
      id: studentId,
      parentId
    };

    setStudents(prev => [...prev, newStudent]);
    logEvent(`تم تسجيل الطالب: ${newStudent.name} وربطه بولي الأمر: ${parentData.name}`, 'success');
  };

  // 3. Director or Teacher publishes Announcement
  const addAnnouncement = (announceData: Omit<Announcement, 'id' | 'date'> & { authorName?: string; authorRole?: 'director' | 'teacher'; shift?: 'morning' | 'evening' }) => {
    const id = 'a' + (announcements.length + 1);
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

    setAnnouncements(prev => [newAnn, ...prev]);
    logEvent(`${newAnn.authorName} نشر تعميماً جديداً: "${newAnn.title}" المستهدف: ${
      newAnn.target === 'all' ? 'الجميع' : newAnn.target === 'teachers' ? 'المعلمون' : 'أولياء الأمور'
    }`, 'primary');
  };

  // 4. Director approves/rejects Absence Excuse (INTERCONNECTED LOGIC)
  const updateExcuseStatus = (id: string, status: 'approved' | 'rejected', notes?: string) => {
    setExcuses(prev => prev.map(exc => {
      if (exc.id === id) {
        const updated = { ...exc, status, notes };
        
        // If approved, dynamically update attendance records to 'excused'
        if (status === 'approved') {
          setAttendance(prevAtt => {
            const date = exc.date;
            const studentId = exc.studentId;
            const existingRecord = prevAtt.find(a => a.studentId === studentId && a.date === date);

            if (existingRecord) {
              // Update state
              return prevAtt.map(a => 
                (a.studentId === studentId && a.date === date) 
                  ? { ...a, status: 'excused', notes: `عذر مقبول معتمد: ${exc.reason}` } 
                  : a
              );
            } else {
              // Create new record
              return [...prevAtt, {
                id: 'att' + (prevAtt.length + 1),
                studentId,
                date,
                status: 'excused',
                notes: `عذر مقبول معتمد: ${exc.reason}`
              }];
            }
          });
          logEvent(`تم اعتماد عذر غياب الطالب: ${exc.studentName} للتاريخ ${exc.date} وتعديل الغياب لعذر مقبول تلقائياً.`, 'success');
        } else {
          logEvent(`تم رفض عذر غياب الطالب: ${exc.studentName} للتاريخ ${exc.date}`, 'warning');
        }

        return updated;
      }
      return exc;
    }));
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
            id: 'att' + (copy.length + 1),
            studentId: item.studentId,
            date: item.date,
            status: item.status,
            notes: item.notes
          });
        }
      });
      return copy;
    });

    const presentCount = newAttendance.filter(a => a.status === 'present').length;
    const absentCount = newAttendance.filter(a => a.status === 'absent').length;
    logEvent(`المعلم قام بتحضير الطلاب وتوثيق: ${presentCount} حضور، ${absentCount} غياب.`, 'info');
  };

  // 6. Teacher records a Grade
  const saveGrade = (gradeData: Omit<Grade, 'id' | 'date'>) => {
    const id = 'g' + (grades.length + 1);
    const date = new Date().toISOString().split('T')[0];
    const newGrade: Grade = { ...gradeData, id, date };

    setGrades(prev => [newGrade, ...prev]);
    const student = students.find(s => s.id === gradeData.studentId);
    logEvent(`المعلم رصد درجة الطالب ${student?.name || ''} بمادة ${gradeData.subject}: ${gradeData.score}/${gradeData.maxScore}`, 'success');

    // Send instant grade notification message to parent
    const studentParent = parents.find(p => p.childrenIds.includes(gradeData.studentId));
    if (studentParent && student) {
      const teacher = teachers.find(t => t.id === gradeData.teacherId);
      const msgId = 'm_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
      const newMsg: Message = {
        id: msgId,
        senderId: gradeData.teacherId || 'teacher',
        senderName: teacher?.name || 'استاذ المادة',
        senderRole: 'teacher',
        receiverId: studentParent.id,
        receiverName: studentParent.name,
        receiverRole: 'parent',
        content: `📢 [تصنيف الإشعار: رصد الدرجات الأكاديمية]\nتم رصد درجة جديدة للطالب (${student.name}) في مادة (${gradeData.subject}) - تقييم (${gradeData.examName}): الدرجة (${gradeData.score}/${gradeData.maxScore}).`,
        date: new Date().toISOString(),
        read: false
      };
      setMessages(prev => [newMsg, ...prev]);
    }
  };

  // 7. Messaging
  const sendMessage = (msgData: Omit<Message, 'id' | 'date' | 'read'>) => {
    const id = 'm' + (messages.length + 1);
    const date = new Date().toISOString();
    const newMsg: Message = { ...msgData, id, date, read: false };

    setMessages(prev => [...prev, newMsg]);
    logEvent(`رسالة جديدة من المعلم ${msgData.senderName} إلى ولي الأمر ${msgData.receiverName}`, 'primary');
  };

  // 8. Parent submits Excuse
  const submitExcuse = (excuseData: Omit<AbsenceExcuse, 'id' | 'status' | 'parentName'>) => {
    const id = 'e' + (excuses.length + 1);
    const parent = parents.find(p => p.id === excuseData.parentId);
    const newExc: AbsenceExcuse = {
      ...excuseData,
      id,
      status: 'pending',
      parentName: parent?.name || 'ولي أمر'
    };

    setExcuses(prev => [...prev, newExc]);
    logEvent(`ولي الأمر ${newExc.parentName} أرسل طلب غياب بعذر للطالب ${newExc.studentName} للتاريخ ${newExc.date}`, 'warning');
  };

  // 9. Parent sends message
  const sendMessageFromParent = (msgData: Omit<Message, 'id' | 'date' | 'read'>) => {
    const id = 'm' + (messages.length + 1);
    const date = new Date().toISOString();
    const newMsg: Message = { ...msgData, id, date, read: false };

    setMessages(prev => [...prev, newMsg]);
    logEvent(`رسالة من ولي الأمر ${msgData.senderName} إلى المعلم ${msgData.receiverName}`, 'primary');
  };

  // 10. System reset simulator data helper
  const handleResetData = () => {
    if (window.confirm('هل تريد بالتأكيد إعادة النظام للحالة الافتراضية وحذف التعديلات؟')) {
      localStorage.clear();
      setTeachers(INITIAL_TEACHERS);
      setClasses(INITIAL_CLASSES);
      setParents(INITIAL_PARENTS);
      setStudents(INITIAL_STUDENTS);
      setAttendance(INITIAL_ATTENDANCE);
      setGrades(INITIAL_GRADES);
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

          {/* Sync Status Badge, Desktop Install Button, and Notification Button - Desktop ONLY */}
          <div className="hidden md:flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleInstallDesktopApp}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] px-3.5 py-1.5 rounded-full font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm shrink-0 border border-indigo-500/30"
              title="تثبيت المنصة كأيقونة وبرنامج على سطح مكتب الكمبيوتر"
            >
              <Laptop className="w-3.5 h-3.5 text-amber-300" />
              <span>تثبيت على الكمبيوتر 💻</span>
            </button>

            {activePortal === 'director' && (
              <>
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
                
                <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 text-green-700 rounded-full border border-green-200 shadow-sm shrink-0">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                  <span className="text-[11px] font-semibold">متزامن أونلاين Cloud</span>
                </div>
              </>
            )}
          </div>

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
                  <div className="flex justify-between items-center gap-2">
                    <div className="flex items-center gap-1 px-2.5 py-1.5 bg-green-50 text-green-700 rounded-full border border-green-200 shadow-sm shrink-0">
                      <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                      <span className="text-[10px] font-semibold">متزامن Cloud</span>
                    </div>

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
            transition={{ duration: 0.25 }}
            className="w-full min-h-[640px]"
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
                setStudents={setStudents}
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
          </motion.div>
        </div>
      </main>

      {/* Unified Platform Footer */}
      <footer className="bg-white border-t border-slate-200 py-5 px-6 md:px-12 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-slate-400 mt-12">
        <div className="flex gap-6 items-center">
          <div className="flex items-center gap-1">
            <span className="text-slate-400 font-medium">تحديث البيانات:</span>
            <span className="text-slate-600 font-mono font-semibold">Real-time</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-slate-400 font-medium">قاعدة البيانات:</span>
            <span className="text-slate-600 font-mono font-semibold">Cloud-Sync-v4</span>
          </div>
        </div>
        <p className="text-slate-400 font-medium">المدرسة الدولية - حلب مدينة مارع &copy; {new Date().getFullYear()}</p>
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
                <span>💬 إشعار فوري (محاكي تنبيه الهاتف)</span>
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

                {/* Simulation / Diagnostic Tools */}
                <div className="space-y-2">
                  <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-2">
                    <Volume2 className="w-4 h-4 text-emerald-600" />
                    <span>🔊 تجربة واختبار النظام الفوري (بدون إذن خارجي)</span>
                  </h4>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    إذا كان جهازك لا يدعم الإشعارات الخارجية أو كنت داخل إطار المعاينة، يمكنك اختبار نغمة رنين الـ WhatsApp والمنبه المدمج بالتطبيق فوراً عبر الزر أدناه:
                  </p>
                  <button
                    onClick={testNotificationSimulation}
                    className="w-full bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold py-2.5 px-4 rounded-xl transition cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span>🔊 تجربة الرنين مع إشعار محاكي للهاتف</span>
                  </button>
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

        {/* Desktop PC Installation Guide Modal */}
        {showDesktopInstallModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[10000]">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-indigo-100 overflow-hidden text-right"
              style={{ direction: 'rtl' }}
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 text-white p-5 flex justify-between items-center relative overflow-hidden">
                <div className="flex items-center gap-3 relative z-10">
                  <div className="w-11 h-11 bg-amber-400/20 border border-amber-300/30 rounded-2xl flex items-center justify-center shrink-0">
                    <Laptop className="w-6 h-6 text-amber-300" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-white">🖥️ تثبيت المنصة على جهاز الكمبيوتر</h3>
                    <p className="text-[11px] text-indigo-200 mt-0.5">إنشاء أيقونة واختصار مباشر على سطح المكتب للوصول السريع</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowDesktopInstallModal(false)}
                  className="text-white/80 hover:text-white p-1 hover:bg-white/10 rounded-lg transition cursor-pointer relative z-10"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body Content */}
              <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
                {/* One-Click Action Trigger */}
                <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-2xl text-center space-y-3">
                  <div className="space-y-1">
                    <span className="inline-block bg-indigo-600 text-white text-[10px] font-extrabold px-2.5 py-0.5 rounded-full">
                      تثبيت تلقائي بنقرة واحدة
                    </span>
                    <h4 className="font-extrabold text-sm text-indigo-950">
                      هل تريد إضافة أيقونة المنصة إلى سطح المكتب الآن؟
                    </h4>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      عند التثبيت، ستظهر أيقونة المنصة المدرسية الموحدة على سطح مكتب الكمبيوتر وقائمة ابدأ (Start) لفتحها بنقرة واحدة كأي برنامج آخر.
                    </p>
                  </div>

                  <button
                    onClick={async () => {
                      const isIframe = typeof window !== 'undefined' && window.self !== window.top;
                      if (isIframe) {
                        alert("💻 سنقوم بفتح المنصة في تبويب مستقل جديد الآن، ثم انقر على 'تثبيت التطبيق' لتنزيله فوراً!");
                        window.open(window.location.href, '_blank');
                        return;
                      }
                      if (pwaPrompt) {
                        pwaPrompt.prompt();
                        const { outcome } = await pwaPrompt.userChoice;
                        if (outcome === 'accepted') {
                          (window as any).clearDeferredPrompt?.();
                          setPwaPrompt(null);
                          setShowDesktopInstallModal(false);
                          alert('🎉 تهانينا! تم تثبيت المنصة المدرسية بنجاح على سطح مكتب الكمبيوتر.');
                        }
                      } else {
                        alert("💡 يرجى اتباع الطرق الموضحة بالأسفل لتثبيت الأيقونة من شريط عنوان المتصفح أو القائمة الرئيسية!");
                      }
                    }}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-5 rounded-xl shadow-md shadow-indigo-200 transition cursor-pointer flex items-center justify-center gap-2 text-xs"
                  >
                    <Download className="w-4 h-4 text-amber-300" />
                    <span>تثبيت التطبيق الآن على الكمبيوتر 💻</span>
                  </button>
                </div>

                {/* Clear Visual Step-by-Step Instructions */}
                <div className="space-y-3">
                  <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-2">
                    <Monitor className="w-4 h-4 text-indigo-600" />
                    <span>طرق تثبيت الأيقونة على الكمبيوتر (Windows / Mac / Chrome / Edge)</span>
                  </h4>

                  {/* Method 1: Address Bar Icon */}
                  <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 space-y-2">
                    <div className="flex items-center gap-2 font-bold text-xs text-slate-900">
                      <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] shrink-0">1</span>
                      <span>عبر شريط العنوان أعلى المتصفح (Chrome أو Edge):</span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed pr-7">
                      في أعلى شاشة الكمبيوتر في شريط عنوان الموقع (URL) بجانب القفل 🔐، ابحث عن أيقونة الكمبيوتر وبداخلها سهم لأسفل 💻⬇️ أو علامة ➕ ورسالة <strong className="text-indigo-900 font-bold">"تثبيت التطبيق" (Install)</strong> واضغط عليها فوراً!
                    </p>
                  </div>

                  {/* Method 2: Browser 3-Dots Menu */}
                  <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 space-y-2">
                    <div className="flex items-center gap-2 font-bold text-xs text-slate-900">
                      <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] shrink-0">2</span>
                      <span>عبر قائمة المتصفح الرئيسية (النقاط الثلاث ⚙️):</span>
                    </div>
                    <ol className="list-decimal list-inside text-[11px] text-slate-600 space-y-1 pr-7 leading-relaxed">
                      <li>اضغط على زر النقاط الثلاث <strong>⋮</strong> أو <strong>⋯</strong> في أعلى يمين أو يسار المتصفح.</li>
                      <li>اختر خيار <strong>"تثبيت المنصة المدرسية" (Install)</strong>.</li>
                      <li>إذا لم تظهر، اختر <strong>"الحفظ والمشاركة" (Save and Share)</strong> ثم <strong>"إنشاء اختصار..." (Create Shortcut)</strong>.</li>
                      <li>تأكد من وضع إشارة صح ✅ على خيار <strong>"فتح كنافذة مستقلة" (Open as window)</strong> واضغط <strong>إنشاء</strong>.</li>
                    </ol>
                  </div>

                  {/* Benefit Banner */}
                  <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-xl flex items-start gap-2.5 text-xs text-emerald-950">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-extrabold text-emerald-900 block">مميزات فتح المنصة من أيقونة الكمبيوتر:</span>
                      <p className="text-[11px] text-emerald-800 mt-0.5 leading-relaxed">
                        تفتح المنصة في شاشة كاملة وبدون أشرطة متصفح، مع سرعة فائقة في استجابة المزامنة والوصول الفوري لبيانات المدرسة.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="bg-slate-50 p-4 border-t border-slate-100 flex justify-between items-center">
                <button
                  type="button"
                  onClick={() => window.open(window.location.href, '_blank')}
                  className="text-xs font-bold text-indigo-700 hover:text-indigo-900 underline flex items-center gap-1 cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>فتح في تبويب جديد مستقل</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowDesktopInstallModal(false)}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition cursor-pointer"
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

