/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Users, 
  BookOpen, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Award, 
  Send, 
  MessageSquare,
  Search,
  Calendar,
  AlertCircle,
  FileCheck,
  Lock,
  Unlock,
  Key,
  LogOut,
  Menu,
  X,
  Camera,
  Image,
  Video,
  UserCheck,
  Sparkles,
  AlertTriangle,
  Check,
  Plus,
  Trash2,
  Megaphone,
  Phone,
  ArrowLeft,
  CheckCircle2
} from 'lucide-react';
import { buildWhatsAppUrl, openWhatsAppDirectly, getWhatsAppSentRecords, recordWhatsAppSent, WhatsAppSentRecord } from '../lib/whatsapp';
import { WhatsAppMessageCustomizerModal } from './WhatsAppMessageCustomizerModal';
import { Teacher, Student, Class, Attendance, Grade, Parent, Message, Announcement } from '../types';
import { getStoredWelcomeMessages, WelcomeMessagesConfig } from '../lib/welcomeMessages';
import { motion, AnimatePresence } from 'motion/react';

interface TeacherPortalProps {
  teachers: Teacher[];
  students: Student[];
  classes: Class[];
  attendance: Attendance[];
  grades: Grade[];
  parents: Parent[];
  messages: Message[];
  announcements: Announcement[];
  saveAttendance: (newAttendance: Omit<Attendance, 'id'>[]) => void;
  saveGrade: (grade: Omit<Grade, 'id' | 'date'>) => void;
  sendMessage: (message: Omit<Message, 'id' | 'date' | 'read'>) => void;
  setMessages?: React.Dispatch<React.SetStateAction<Message[]>>;
  setGrades?: React.Dispatch<React.SetStateAction<Grade[]>>;
  addAnnouncement?: (announceData: Omit<Announcement, 'id' | 'date'> & { authorName?: string; authorRole?: 'director' | 'teacher' }) => void;
}

export default function TeacherPortal({
  teachers,
  students,
  classes,
  attendance,
  grades,
  parents,
  messages,
  announcements,
  saveAttendance,
  saveGrade,
  sendMessage,
  setMessages,
  setGrades,
  addAnnouncement
}: TeacherPortalProps) {
  // Simulator: active logged in teacher
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>(teachers[0]?.id || 't1');
  const activeTeacher = teachers.find(t => t.id === selectedTeacherId);

  const [showWelcomeModal, setShowWelcomeModal] = useState<boolean>(() => {
    return !sessionStorage.getItem('teacher_welcome_dismissed');
  });

  const [schoolAppIcon, setSchoolAppIcon] = useState<string>(() => {
    return localStorage.getItem('school_app_icon') || '';
  });

  const [welcomeMsgs, setWelcomeMsgs] = useState<WelcomeMessagesConfig>(getStoredWelcomeMessages);

  useEffect(() => {
    const handleStorageUpdate = () => {
      const savedIcon = localStorage.getItem('school_app_icon');
      if (savedIcon !== null) {
        setSchoolAppIcon(savedIcon);
      }
      setWelcomeMsgs(getStoredWelcomeMessages());
    };
    window.addEventListener('school_storage_update', handleStorageUpdate);
    return () => window.removeEventListener('school_storage_update', handleStorageUpdate);
  }, []);

  // Sync selectedTeacherId to localStorage so other portals/App.tsx can read the active teacher
  useEffect(() => {
    if (selectedTeacherId) {
      localStorage.setItem('school_active_teacher_id', selectedTeacherId);
      // Dispatch storage update event so App.tsx can re-check unread counts in real-time
      window.dispatchEvent(new CustomEvent('school_storage_update', {
        detail: { key: 'school_active_teacher_id', value: selectedTeacherId }
      }));
    }
  }, [selectedTeacherId]);

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
        const updated = prev.map(m => m.receiverId === selectedTeacherId && !m.read ? { ...m, read: true } : m);
        localStorage.setItem('school_messages', JSON.stringify(updated));
        return updated;
      });
    }
  };

  const markAllAsReadForStudent = (studentId: string) => {
    if (setMessages) {
      setMessages(prev => {
        const updated = prev.map(m => m.receiverId === selectedTeacherId && m.studentId === studentId && !m.read ? { ...m, read: true } : m);
        localStorage.setItem('school_messages', JSON.stringify(updated));
        return updated;
      });
    }
  };

  const handleDeleteTeacherMessage = (msgId: string) => {
    setMessageToDelete(msgId);
  };

  const handleEditTeacherMessage = (msgId: string, currentContent: string) => {
    setMessageToEdit({ id: msgId, content: currentContent });
    setEditMessageContent(currentContent);
  };

  const handleDeleteGrade = (gradeId: string) => {
    setGradeToDelete(gradeId);
  };

  const handleEditGrade = (grade: Grade) => {
    setGradeToEdit(grade);
    setEditGradeScore(grade.score.toString());
  };

  const confirmDeleteGrade = () => {
    if (!gradeToDelete) return;
    if (setGrades) {
      setGrades(prev => {
        const updated = prev.filter(g => g.id !== gradeToDelete);
        localStorage.setItem('school_grades', JSON.stringify(updated));
        return updated;
      });
    }
    setGradeToDelete(null);
  };

  const confirmEditGrade = () => {
    if (!gradeToEdit) return;
    const newScore = parseFloat(editGradeScore);
    const effectiveMax = Math.min(100, gradeToEdit.maxScore);
    if (isNaN(newScore) || newScore < 0 || newScore > effectiveMax) {
      alert(`❌ الرجاء إدخال درجة صالحة بين 0 و ${effectiveMax}`);
      return;
    }
    if (setGrades) {
      setGrades(prev => {
        const updated = prev.map(g => g.id === gradeToEdit.id ? { ...g, score: newScore } : g);
        localStorage.setItem('school_grades', JSON.stringify(updated));
        return updated;
      });
      alert('🎉 تم تعديل الدرجة بنجاح وتحديثها لدى ولي الأمر فوراً!');
    }
    setGradeToEdit(null);
    setEditGradeScore('');
  };

  // Login states
  const [isTeacherLoggedIn, setIsTeacherLoggedIn] = useState<boolean>(() => {
    const saved = localStorage.getItem('school_teacher_is_logged_in');
    return saved === 'true';
  });
  const [teacherPasswordInput, setTeacherPasswordInput] = useState<string>('');
  const [teacherLoginError, setTeacherLoginError] = useState<string>('');

  // Auto-restore teacher ID if logged in
  useEffect(() => {
    const savedLoggedIn = localStorage.getItem('school_teacher_is_logged_in');
    const savedTeacherId = localStorage.getItem('school_teacher_logged_in_id') || localStorage.getItem('school_active_teacher_id');
    if (savedLoggedIn === 'true') {
      setIsTeacherLoggedIn(true);
      if (savedTeacherId && teachers.some(t => t.id === savedTeacherId)) {
        setSelectedTeacherId(savedTeacherId);
      }
    }
  }, [teachers]);

  // Tabs
  const [activeTab, setActiveTab] = useState<'grades' | 'students' | 'messages' | 'announcements'>('grades');
  const [gradingMode, setGradingMode] = useState<'single' | 'all'>('single');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Announcement states for Teacher
  const [announceTitle, setAnnounceTitle] = useState('');
  const [announceContent, setAnnounceContent] = useState('');
  const [announceTarget, setAnnounceTarget] = useState<'all' | 'parents'>('parents');

  // Student directory & Behavior state
  const [selectedStudentForBehavior, setSelectedStudentForBehavior] = useState<Student | null>(null);
  const [selectedStudentForMessages, setSelectedStudentForMessages] = useState<Student | null>(null);
  const [behaviorType, setBehaviorType] = useState<'positive' | 'negative'>('positive');
  const [behaviorCategory, setBehaviorCategory] = useState<string>('مشاركة متميزة بالصف');
  const [behaviorNotes, setBehaviorNotes] = useState<string>('');
  const [behaviorAttachedMedia, setBehaviorAttachedMedia] = useState<string | null>(null);
  const [behaviorAttachedMediaType, setBehaviorAttachedMediaType] = useState<'image' | 'video' | null>(null);

  // WhatsApp tracking & Parent phone input
  const [whatsappSentRecords, setWhatsappSentRecords] = useState<Record<string, WhatsAppSentRecord>>(() => getWhatsAppSentRecords());
  const [parentPhoneInput, setParentPhoneInput] = useState<string>('');

  const [waModalState, setWaModalState] = useState<{
    isOpen: boolean;
    studentName: string;
    recipientPhone: string;
    initialMessage: string;
    defaultTemplateText: string;
    waKey: string;
    waKeyGeneral: string;
    studentId: string;
    nextStudent: Student | null;
  } | null>(null);

  const handleConfirmSendWhatsAppTeacher = (finalPhone: string, finalMessage: string, targetType: 'auto' | 'web' | 'app' = 'auto') => {
    if (!waModalState) return;

    try {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(finalMessage);
      }
    } catch (e) {}

    openWhatsAppDirectly(finalPhone, finalMessage, targetType);

    const rec = recordWhatsAppSent(waModalState.waKey, waModalState.studentName, 'behavior');
    recordWhatsAppSent(waModalState.waKeyGeneral, waModalState.studentName, 'behavior');

    setWhatsappSentRecords(prev => ({
      ...prev,
      [waModalState.waKey]: rec,
      [waModalState.waKeyGeneral]: rec
    }));

    if (waModalState.nextStudent) {
      // Cleanly reset behavior selection and state so it does NOT return to message text
      setBehaviorNotes('');
      setBehaviorAttachedMedia(null);
      setBehaviorAttachedMediaType(null);
    } else {
      stopCamera();
      setSelectedStudentForBehavior(null);
    }
    setWaModalState(null);
  };

  useEffect(() => {
    if (selectedStudentForBehavior) {
      const parent = parents.find(p => p.childrenIds.includes(selectedStudentForBehavior.id) || p.id === selectedStudentForBehavior.parentId);
      setParentPhoneInput(parent?.phone || '');
    }
  }, [selectedStudentForBehavior, parents]);
  
  // Real-time camera streaming & capture variables
  const [isCameraOn, setIsCameraOn] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string>('');

  // Grade attachment states
  const [gradeAttachedMedia, setGradeAttachedMedia] = useState<{ [studentId: string]: string | null }>({});
  const [gradeAttachedMediaType, setGradeAttachedMediaType] = useState<{ [studentId: string]: 'image' | 'video' | null }>({});

  // "Grades of all subjects" modal states
  const [selectedStudentForAllGrades, setSelectedStudentForAllGrades] = useState<Student | null>(null);
  const [allGradesExamName, setAllGradesExamName] = useState<string>('');
  const [allGradesMaxScore, setAllGradesMaxScore] = useState<number>(20);
  const [allGradesExamType, setAllGradesExamType] = useState<'special' | 'monthly' | 'general'>('general');
  const [allGradesScores, setAllGradesScores] = useState<{ [subjectName: string]: string }>({});

  // Grade Edit / Delete modal states
  const [gradeToDelete, setGradeToDelete] = useState<string | null>(null);
  const [gradeToEdit, setGradeToEdit] = useState<Grade | null>(null);
  const [editGradeScore, setEditGradeScore] = useState<string>('');

  // Message Edit / Delete modal states
  const [messageToDelete, setMessageToDelete] = useState<string | null>(null);
  const [messageToEdit, setMessageToEdit] = useState<{ id: string; content: string } | null>(null);
  const [editMessageContent, setEditMessageContent] = useState<string>('');

  const handleSaveAllSubjectsGrades = () => {
    if (!selectedStudentForAllGrades) return;
    if (!allGradesExamName.trim()) {
      alert('الرجاء إدخال اسم الاختبار أو التقييم لجميع المواد (مثال: اختبار نهاية الفصل الدراسي)');
      return;
    }
    if (allGradesMaxScore <= 0 || allGradesMaxScore > 100) {
      alert('الرجاء إدخال درجة عظمى صالحة بين 1 و 100');
      return;
    }

    const enteredScores = Object.entries(allGradesScores).filter(([_, val]) => val !== undefined && String(val).trim() !== '');
    if (enteredScores.length === 0) {
      alert('الرجاء إدخال علامة واحدة على الأقل في أي مادة لحفظها!');
      return;
    }

    const effectiveMax = Math.min(100, allGradesMaxScore);
    // Validate scores are correct numbers
    for (const [sub, val] of enteredScores) {
      const numVal = Number(val);
      if (isNaN(numVal) || numVal < 0 || numVal > effectiveMax) {
        alert(`❌ الدرجة المدخلة للمادة (${sub}) غير صالحة. يجب أن تكون بين 0 و ${effectiveMax}`);
        return;
      }
    }

    const studentId = selectedStudentForAllGrades.id;
    const studentParent = parents.find(p => p.childrenIds.includes(studentId));

    // Save each grade
    enteredScores.forEach(([sub, val]) => {
      saveGrade({
        studentId,
        subject: sub,
        examName: allGradesExamName,
        score: Number(val),
        maxScore: effectiveMax,
        teacherId: selectedTeacherId,
        examType: allGradesExamType
      });

    });

    alert(`🎉 تم رصد درجات عدد ${enteredScores.length} مادة بنجاح للطالب (${selectedStudentForAllGrades.name}) وتم إرسال إشعار فوري لولي الأمر! 🔔`);
    
    // Clear state & Close modal
    if (gradingMode !== 'all') {
      setSelectedStudentForAllGrades(null);
    }
    setAllGradesScores({});
  };

  // Selected class (for active teacher)
  const teacherClasses = classes.filter(c => activeTeacher?.classes.includes(c.id));
  const [selectedClassId, setSelectedClassId] = useState<string>('');

  useEffect(() => {
    if (teacherClasses.length > 0) {
      setSelectedClassId(teacherClasses[0].id);
    } else {
      setSelectedClassId('');
    }
  }, [selectedTeacherId]);

  // Students in selected class
  const classStudents = students.filter(s => s.classId === selectedClassId);

  // Attendance state
  const [attendanceDate, setAttendanceDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [localAttendance, setLocalAttendance] = useState<{ [studentId: string]: { status: 'present' | 'absent' | 'late' | 'excused'; notes: string } }>({});

  // Sync local attendance state when class or date changes
  useEffect(() => {
    const updated: typeof localAttendance = {};
    classStudents.forEach(student => {
      // Find if attendance already recorded for this student on this date
      const record = attendance.find(a => a.studentId === student.id && a.date === attendanceDate);
      if (record) {
        updated[student.id] = { status: record.status, notes: record.notes || '' };
      } else {
        updated[student.id] = { status: 'present', notes: '' }; // default
      }
    });
    setLocalAttendance(updated);
  }, [selectedClassId, attendanceDate, attendance]);

  // Grade state
  const [gradeSubject, setGradeSubject] = useState<string>('');
  const [isCustomSubject, setIsCustomSubject] = useState<boolean>(false);
  const [examName, setExamName] = useState<string>('');
  const [maxScore, setMaxScore] = useState<number>(20);
  const [examType, setExamType] = useState<'special' | 'monthly' | 'general'>('general');
  const [studentGrades, setStudentGrades] = useState<{ [studentId: string]: number | string }>({});
  
  // Get subjects assigned to the selected class based on the teachers teaching it
  const classSubjects = React.useMemo(() => {
    if (!selectedClassId) return [];
    
    const subjectsSet = new Set<string>();
    let hasGeneralTeacher = false;
    
    // Find all teachers assigned to this class
    const assignedTeachers = teachers.filter(t => t.classes.includes(selectedClassId));
    
    assignedTeachers.forEach(t => {
      t.subjects.forEach(sub => {
        if (sub === 'عام - جميع المواد' || sub.includes('جميع المواد')) {
          hasGeneralTeacher = true;
        } else {
          subjectsSet.add(sub);
        }
      });
    });
    
    // Fallback/General subjects when there is a general teacher or no teachers explicitly registered yet
    if (hasGeneralTeacher || subjectsSet.size === 0) {
      const defaultSubjects = ['الرياضيات', 'العلوم', 'اللغة العربية', 'التربية الإسلامية', 'اللغة الإنجليزية', 'الاجتماعيات'];
      defaultSubjects.forEach(s => subjectsSet.add(s));
      
      // Also fetch custom subjects defined in the school settings
      const saved = localStorage.getItem('school_custom_subjects');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            parsed.forEach((s: string) => subjectsSet.add(s));
          }
        } catch (e) {
          // ignore
        }
      }
    }
    
    return Array.from(subjectsSet);
  }, [selectedClassId, teachers]);

  // Get subjects assigned to the active teacher for this class
  const teacherClassSubjects = React.useMemo(() => {
    if (!activeTeacher) return [];
    
    const teacherSubjects = activeTeacher.subjects || [];
    
    // Check if the teacher is a general teacher who teaches all subjects
    const isGeneralTeacher = teacherSubjects.some(sub => sub === 'عام - جميع المواد' || sub.includes('جميع المواد'));
    
    if (isGeneralTeacher) {
      return classSubjects.filter(sub => sub !== 'عام - جميع المواد' && !sub.includes('جميع المواد'));
    }
    
    // Return exactly the subjects assigned to this active teacher, excluding placeholder roles, filtered by classSubjects
    return teacherSubjects.filter(sub => sub !== 'عام - جميع المواد' && !sub.includes('جميع المواد') && classSubjects.includes(sub));
  }, [selectedClassId, activeTeacher, classSubjects]);

  // Auto-update gradeSubject when class changes to ensure it matches one of the teacher's/class's assigned subjects
  useEffect(() => {
    if (teacherClassSubjects.length > 0) {
      if (!teacherClassSubjects.includes(gradeSubject)) {
        setGradeSubject(teacherClassSubjects[0]);
        setIsCustomSubject(false);
      }
    } else {
      setGradeSubject('');
    }
  }, [selectedClassId, teacherClassSubjects]);

  // Message state
  const [selectedParentId, setSelectedParentId] = useState<string>('');
  const [messageText, setMessageText] = useState<string>('');
  const [chatStudentId, setChatStudentId] = useState<string>('');
  const [messageFilterType, setMessageFilterType] = useState<'all' | 'outgoing' | 'incoming'>('all');
  const [notificationType, setNotificationType] = useState<string>('عام');
  const [customTypeLabel, setCustomTypeLabel] = useState<string>('');

  // Auto-mark student messages as read when selected or when new messages arrive
  useEffect(() => {
    if (chatStudentId) {
      const hasUnread = messages.some(m => m.receiverId === selectedTeacherId && m.studentId === chatStudentId && !m.read);
      if (hasUnread) {
        markAllAsReadForStudent(chatStudentId);
      }
    }
  }, [chatStudentId, selectedTeacherId, messages]);

  // Live Camera and Attachment Capture Functions
  const startCamera = async () => {
    setCameraError('');
    setIsCameraOn(true);
    setTimeout(async () => {
      const videoEl = document.getElementById('behavior-video-preview') as HTMLVideoElement;
      if (videoEl) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
          videoEl.srcObject = stream;
          videoEl.play();
        } catch (err) {
          console.error("Camera access error:", err);
          setCameraError('لم نتمكن من تشغيل الكاميرا الحقيقية (قد تكون محجوبة في المتصفح أو بيئة التجربة). سنقوم باستخدام المحاكاة التفاعلية الذكية للكاميرا والتقاط لقطة فورية!');
        }
      }
    }, 100);
  };

  const stopCamera = () => {
    const videoEl = document.getElementById('behavior-video-preview') as HTMLVideoElement;
    if (videoEl && videoEl.srcObject) {
      const stream = videoEl.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }
    setIsCameraOn(false);
  };

  const captureSnapshot = () => {
    const videoEl = document.getElementById('behavior-video-preview') as HTMLVideoElement;
    if (videoEl && !cameraError) {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = videoEl.videoWidth || 640;
        canvas.height = videoEl.videoHeight || 480;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/png');
          setBehaviorAttachedMedia(dataUrl);
          setBehaviorAttachedMediaType('image');
          stopCamera();
          alert('📸 تم التقاط الصورة من الكاميرا بنجاح وإرفاقها مع السلوك!');
        }
      } catch (err) {
        useSimulatedPhoto();
      }
    } else {
      useSimulatedPhoto();
    }
  };

  const useSimulatedPhoto = () => {
    const mockPhotos = [
      'https://images.unsplash.com/photo-1577896851231-70ef18881754?w=500&auto=format&fit=crop&q=60',
      'https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?w=500&auto=format&fit=crop&q=60',
      'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=500&auto=format&fit=crop&q=60',
      'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=500&auto=format&fit=crop&q=60',
    ];
    const chosen = mockPhotos[Math.floor(Math.random() * mockPhotos.length)];
    setBehaviorAttachedMedia(chosen);
    setBehaviorAttachedMediaType('image');
    stopCamera();
    alert('📸 تم توليد لقطة سلوكية تفاعلية عالية الجودة للفصل الدراسي وإرفاقها بنجاح!');
  };

  const useSimulatedVideo = () => {
    // Elegant sample educational/behavioral video url reference
    const sampleVideo = 'https://assets.mixkit.co/videos/preview/mixkit-children-studying-and-writing-in-classroom-39824-large.mp4';
    setBehaviorAttachedMedia(sampleVideo);
    setBehaviorAttachedMediaType('video');
    alert('🎥 تم توليد وتثبيت مقطع فيديو توثيقي متميز للطالب وإرفاقه بنجاح مع السلوك!');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, target: 'behavior' | 'grade', studentId?: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileType = file.type.startsWith('video/') ? 'video' : 'image';
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      if (target === 'behavior') {
        setBehaviorAttachedMedia(result);
        setBehaviorAttachedMediaType(fileType);
        alert(`تم رفع المرفق من الاستوديو بنجاح! نوع الملف: ${fileType === 'video' ? 'فيديو' : 'صورة'}`);
      } else if (target === 'grade' && studentId) {
        setGradeAttachedMedia(prev => ({ ...prev, [studentId]: result }));
        setGradeAttachedMediaType(prev => ({ ...prev, [studentId]: fileType }));
        alert(`تم إرفاق الملف بنجاح للاختبار! سيتم إرساله مع التقييم لولي الأمر عند الحفظ.`);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveAttendance = () => {
    const payloads = Object.keys(localAttendance).map(studentId => {
      const record = localAttendance[studentId];
      
      // Auto-notify Parent
      const student = students.find(s => s.id === studentId);
      const studentParent = parents.find(p => p.childrenIds.includes(studentId));
      if (student && studentParent) {
        let statusText = '';
        if (record.status === 'present') statusText = 'حاضر';
        else if (record.status === 'absent') statusText = 'غائب ⚠️';
        else if (record.status === 'late') statusText = 'متأخر ⏰';
        else if (record.status === 'excused') statusText = 'غائب بعذر مقبول';

        sendMessage({
          senderId: selectedTeacherId,
          senderName: activeTeacher?.name || 'المعلم',
          senderRole: 'teacher',
          receiverId: studentParent.id,
          receiverName: studentParent.name,
          receiverRole: 'parent',
          content: `📢 [تصنيف الإشعار: حضور وغياب]\nتم تسجيل حالة الحضور والغياب للطالب (${student.name}) لتاريخ اليوم (${attendanceDate}).\nالحالة الموثقة: ${statusText}${record.notes ? `\nملاحظات المعلم: ${record.notes}` : ''}`,
          studentId: student.id,
        });
      }

      return {
        studentId,
        date: attendanceDate,
        status: record.status,
        notes: record.notes
      };
    });
    saveAttendance(payloads);
    alert('تم رصد الحفظ والغياب بنجاح في النظام الموحد! وتم إرسال تنبيهات تلقائية لهواتف أولياء الأمور 📱');
  };

  const handleSaveGrades = (studentId: string) => {
    const score = studentGrades[studentId];
    const effectiveMax = Math.min(100, maxScore > 0 ? maxScore : 100);
    if (score === undefined || score === '' || isNaN(Number(score)) || Number(score) < 0 || Number(score) > effectiveMax) {
      alert(`الرجاء إدخال درجة صالحة بين 0 و ${effectiveMax}`);
      return;
    }
    if (!examName) {
      alert('الرجاء إدخال اسم الاختبار أو التقييم');
      return;
    }

    saveGrade({
      studentId,
      subject: gradeSubject,
      examName,
      score: Number(score),
      maxScore: effectiveMax,
      teacherId: selectedTeacherId,
      examType
    });

    // Clear the attachment after saving
    setGradeAttachedMedia(prev => ({ ...prev, [studentId]: null }));
    setGradeAttachedMediaType(prev => ({ ...prev, [studentId]: null }));

    alert(`تم رصد درجة الطالب بنجاح وتم إرسال إشعار فوري لولي الأمر! 🔔`);
  };

  // Format notification type and custom text
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

        {/* Render Video Attachment */}
        {videoMatch && (
          <div className="mt-2 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 max-w-xs inline-block">
            <video 
              src={videoMatch[1]} 
              controls 
              className="max-h-48 w-full"
            />
            <div className="p-1.5 bg-slate-50 text-[10px] text-slate-500 font-bold flex items-center gap-1 justify-center border-t border-slate-100">
              <Video className="w-3.5 h-3.5 text-rose-500" />
              <span>مرفق فيديو سلوك/تقييم</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedParentId || !messageText) return;

    const parent = parents.find(p => p.id === selectedParentId);
    if (!parent) return;

    // Rich message prefixing with type
    let finalContent = messageText;
    const selectedType = notificationType === 'custom' ? (customTypeLabel || 'إشعار مخصص') : notificationType;
    if (selectedType && selectedType !== 'عام') {
      finalContent = `📢 [تصنيف الإشعار: ${selectedType}]\n${messageText}`;
    }

    sendMessage({
      senderId: selectedTeacherId,
      senderName: activeTeacher?.name || 'معلم',
      senderRole: 'teacher',
      receiverId: selectedParentId,
      receiverName: parent.name,
      receiverRole: 'parent',
      content: finalContent,
      studentId: chatStudentId || undefined
    });

    setMessageText('');
    setCustomTypeLabel('');
    setNotificationType('عام');
    alert('تم إرسال الرسالة والإشعار لولي الأمر بنجاح، وستصله إشعارات فورية!');
  };

  const handlePublishAnnouncement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!announceTitle.trim() || !announceContent.trim()) {
      alert('يرجى ملء جميع الحقول المطلوبة!');
      return;
    }
    if (addAnnouncement) {
      addAnnouncement({
        title: announceTitle,
        content: announceContent,
        target: announceTarget,
        authorName: activeTeacher?.name ? `المعلم ${activeTeacher.name}` : 'معلم الصف',
        authorRole: 'teacher'
      });
      alert('🎉 تم نشر التعميم والإعلان بنجاح، وسيظهر فوراً لأولياء الأمور المعنيين!');
      setAnnounceTitle('');
      setAnnounceContent('');
    } else {
      alert('حدث خطأ أثناء محاولة الاتصال بالنظام لنشر الإعلان.');
    }
  };

  if (!isTeacherLoggedIn) {
    return (
      <div id="teacher-login-container" className="bg-white min-h-[500px] rounded-2xl border border-slate-200 shadow-md flex flex-col items-center justify-center p-8 max-w-md mx-auto my-12">
        <div className="p-4 bg-indigo-50 text-indigo-600 rounded-2xl mb-4 shadow-sm">
          <Users className="w-12 h-12" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 text-center">المدرسة الدولية</h2>
        <p className="text-xs text-slate-400 text-center mt-1">حلب - مدينة مارع (بوابة الكادر التعليمي)</p>
        
        <form onSubmit={(e) => {
          e.preventDefault();
          const enteredVal = teacherPasswordInput.trim();
          if (!enteredVal) {
            setTeacherLoginError('الرجاء إدخال الرقم الخاص بك.');
            return;
          }
          // Find teacher whose phone matches, OR whose ID matches, OR whose password matches
          const targetTeacher = teachers.find(t => 
            t.phone === enteredVal || 
            t.id === enteredVal || 
            (t.phone && t.phone.replace(/[\s-]/g, '') === enteredVal.replace(/[\s-]/g, '')) ||
            (t.password && t.password === enteredVal)
          );

          if (targetTeacher) {
            setSelectedTeacherId(targetTeacher.id);
            setIsTeacherLoggedIn(true);
            localStorage.setItem('school_teacher_is_logged_in', 'true');
            localStorage.setItem('school_teacher_logged_in_id', targetTeacher.id);
            localStorage.setItem('school_active_teacher_id', targetTeacher.id);
            setTeacherLoginError('');
            setTeacherPasswordInput('');
          } else {
            setTeacherLoginError('رقم الهاتف أو المعرف المدخل غير مسجل لدينا، يرجى مراجعة إدارة المدرسة.');
          }
        }} className="w-full mt-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 text-right font-medium">أدخل رقم الهاتف أو رقم المعرف الخاص بك *</label>
            <div className="relative">
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                <Users className="w-4 h-4" />
              </span>
              <input
                type="text"
                value={teacherPasswordInput}
                onChange={e => {
                  setTeacherPasswordInput(e.target.value);
                  setTeacherLoginError('');
                }}
                placeholder="أدخل رقم هاتفك أو معرف المعلم..."
                className="w-full text-xs border border-slate-200 pr-10 pl-4 py-2.5 rounded-xl focus:border-indigo-500 focus:outline-none text-center font-bold tracking-wider"
                required
              />
            </div>
            {teacherLoginError && (
              <p className="text-xs text-rose-500 mt-2 font-semibold text-center">{teacherLoginError}</p>
            )}
          </div>

          <button
            type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-3 px-4 rounded-xl transition shadow-sm cursor-pointer"
          >
            فتح البوابة التعليمية 🚀
          </button>
          
          <div className="mt-4 p-3 bg-slate-50 border border-slate-100 rounded-xl text-right">
            <p className="text-[11px] text-slate-600 leading-relaxed">
              🔒 <strong>تنبيه الأمان:</strong> قم بإدخال رقم الهاتف المسجل لدى إدارة المدرسة لفتح البوابة مباشرة ودون الحاجة لتحديد الاسم أو كتابة كلمات مرور معقدة.
            </p>
            <p className="text-[10px] text-indigo-600 mt-2 text-center font-semibold leading-relaxed">
              (إذا لم تكن تملك رقم هاتف مسجل، يمكنك استخدام المعرف الافتراضي للمعلم الأول لتسجيل الدخول السريع: <strong className="font-mono bg-indigo-50 px-1 py-0.5 rounded text-indigo-950 font-bold">t1</strong> أو استخدام رقمه المسجل)
            </p>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div id="teacher-portal-root" className="bg-slate-50 min-h-screen rounded-2xl border border-slate-200 overflow-hidden shadow-md flex flex-col md:flex-row">
      {/* Teacher App Sidebar */}
      <div id="teacher-sidebar" className="w-full md:w-52 lg:w-56 bg-indigo-50/70 text-slate-900 p-3.5 flex flex-col justify-between border-b md:border-b-0 md:border-l border-indigo-100/80 md:sticky md:top-0 md:h-screen md:overflow-y-auto shrink-0">
        <div>
          {/* Sidebar Header with Hamburger button on Mobile */}
          <div className="flex items-center justify-between border-b border-indigo-100 pb-3 mb-3 md:mb-4 md:pb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black shadow-xs text-xs overflow-hidden shrink-0">
                {schoolAppIcon ? (
                  <img src={schoolAppIcon} alt="الشعار" className="w-full h-full object-cover" />
                ) : (
                  activeTeacher?.name.replace('أ.', '').trim().charAt(0)
                )}
              </div>
              <div className="text-right">
                <h3 className="font-extrabold text-xs text-slate-950">{activeTeacher?.name}</h3>
                <span className="text-[9px] text-indigo-700 font-bold block">بوابة المعلم الإلكترونية</span>
              </div>
            </div>

            {/* Hamburger Button for Mobile on the Right */}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-1.5 text-slate-700 hover:text-slate-950 hover:bg-indigo-100 rounded-lg transition cursor-pointer"
              aria-label="القائمة"
            >
              {isMobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>

          {/* Navigation and Login Info - Collapsible on Mobile */}
          <div className={`${isMobileMenuOpen ? 'block' : 'hidden md:block'} space-y-3`}>
            {/* Logged in Teacher Info & Logout */}
            <div className="bg-white p-3 rounded-xl border border-indigo-100/80 shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setShowWelcomeModal(true)}
                  className="px-2 py-0.5 bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 rounded-md text-[9px] font-extrabold flex items-center gap-1 transition cursor-pointer"
                  title="عرض رسالة الترحيب"
                >
                  <Sparkles className="w-2.5 h-2.5 text-amber-500" />
                  <span>ترحيب ✨</span>
                </button>

                <span className="text-[9px] text-emerald-700 font-bold flex items-center gap-1">
                  <span>بوابة المعلم الآمنة</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                </span>
              </div>
              <button
                onClick={() => {
                  setIsTeacherLoggedIn(false);
                  localStorage.removeItem('school_teacher_is_logged_in');
                  localStorage.removeItem('school_teacher_logged_in_id');
                  setTeacherPasswordInput('');
                  setIsMobileMenuOpen(false);
                }}
                className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200/80 rounded-xl text-[10px] font-extrabold transition cursor-pointer shadow-2xs"
              >
                <LogOut className="w-3 h-3" />
                <span>تسجيل الخروج</span>
              </button>
            </div>

            <nav className="space-y-1">
              <button
                onClick={() => {
                  setActiveTab('grades');
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-right text-[11px] font-bold transition-all duration-200 cursor-pointer ${
                  activeTab === 'grades' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-900 hover:bg-white hover:text-indigo-900'
                }`}
              >
                <Award className="w-4 h-4 shrink-0" />
                <span>رصد الدرجات والتقييم</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('students');
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-right text-[11px] font-bold transition-all duration-200 cursor-pointer ${
                  activeTab === 'students' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-900 hover:bg-white hover:text-indigo-900'
                }`}
              >
                <Users className="w-4 h-4 shrink-0" />
                <span>أسماء ودليل الطلاب</span>
                <span className={`mr-auto px-1.5 py-0.5 rounded-full text-[8px] font-bold ${
                  activeTab === 'students' ? 'bg-indigo-500/40 text-white' : 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                }`}>
                  {classStudents.length} طلاب
                </span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('messages');
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-right text-[11px] font-bold transition-all duration-200 cursor-pointer ${
                  activeTab === 'messages' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-900 hover:bg-white hover:text-indigo-900'
                }`}
              >
                <div className="relative shrink-0">
                  <MessageSquare className="w-4 h-4" />
                  {messages.filter(m => m.receiverId === selectedTeacherId && !m.read).length > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-rose-600 text-[8px] font-extrabold text-white ring-1 ring-white animate-bounce">
                      {messages.filter(m => m.receiverId === selectedTeacherId && !m.read).length}
                    </span>
                  )}
                </div>
                <span>مراسلة أولياء الأمور</span>
                {messages.filter(m => m.receiverId === selectedTeacherId && !m.read).length > 0 && (
                  <span className="mr-auto bg-rose-600 text-white px-1.5 py-0.5 rounded-full text-[8px] font-bold animate-pulse">
                    {messages.filter(m => m.receiverId === selectedTeacherId && !m.read).length} جديدة
                  </span>
                )}
              </button>

              <button
                onClick={() => {
                  setActiveTab('announcements');
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-right text-[11px] font-bold transition-all duration-200 cursor-pointer ${
                  activeTab === 'announcements' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-900 hover:bg-white hover:text-indigo-900'
                }`}
              >
                <Megaphone className="w-4 h-4 shrink-0" />
                <span>نشر تعميم وإعلان</span>
              </button>
            </nav>
          </div>
        </div>

        {/* Portal Info - Collapsible on Mobile */}
        <div className={`${isMobileMenuOpen ? 'block mt-6' : 'hidden md:block'} mt-8 border-t border-indigo-100/80 pt-4 text-[10px] text-slate-700 font-bold text-right`}>
          <p>تطبيق المعلم المعتمد - الكادر التدريسي</p>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0 p-4 md:p-6 lg:p-8 overflow-y-auto w-full">
        {/* Class selector */}
        <div className="mb-6 bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-xs text-slate-400 block font-medium">الفصل الدراسي الحالي للمعلم</span>
            <div className="flex gap-2.5 mt-1.5">
              {teacherClasses.map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelectedClassId(c.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                    selectedClassId === c.id
                      ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-sm'
                      : 'bg-slate-50 text-slate-600 border border-slate-100 hover:bg-slate-100'
                  }`}
                >
                  {c.name}
                </button>
              ))}
              {teacherClasses.length === 0 && (
                <span className="text-xs text-amber-600 font-medium italic">لم يتم إسناد فصول لهذا المعلم بعد.</span>
              )}
            </div>
          </div>

          <div className="text-left">
            <span className="text-xs text-slate-400 block font-medium">المواد المسندة</span>
            <div className="flex gap-1.5 mt-1.5 justify-end">
              {activeTeacher?.subjects.map((sub, i) => (
                <span key={i} className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-semibold">
                  {sub}
                </span>
              ))}
            </div>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {/* Grades Tab */}
          {activeTab === 'grades' && (
            <motion.div
              key="grades"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div>
                <h2 className="text-xl font-bold text-slate-800">رصد درجات الاختبارات والتقويم</h2>
                <p className="text-slate-500 text-xs mt-1">سجل التقييمات للطلاب. يتم تحديث الشهادة وكشف الدرجات لدى ولي الأمر فوراً.</p>
              </div>

              {/* Grading Mode Selection Icons/Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setGradingMode('single')}
                  className={`p-4 rounded-2xl border text-right transition duration-200 flex items-start gap-4 cursor-pointer ${
                    gradingMode === 'single'
                      ? 'bg-indigo-50/60 border-indigo-200 shadow-xs text-indigo-900'
                      : 'bg-white border-slate-100 hover:border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className={`p-2.5 rounded-xl shrink-0 ${gradingMode === 'single' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-xs sm:text-sm">رصد مادة مفرَدة (لكافة الطلاب) 📚</h4>
                    <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 leading-relaxed">رصد درجة مادة واحدة محددة لكافة طلاب الشعبة في جدول مجمع.</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setGradingMode('all');
                    if (!selectedStudentForAllGrades && classStudents.length > 0) {
                      setSelectedStudentForAllGrades(classStudents[0]);
                    }
                  }}
                  className={`p-4 rounded-2xl border text-right transition duration-200 flex items-start gap-4 cursor-pointer ${
                    gradingMode === 'all'
                      ? 'bg-emerald-50/60 border-emerald-200 shadow-xs text-emerald-900'
                      : 'bg-white border-slate-100 hover:border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className={`p-2.5 rounded-xl shrink-0 ${gradingMode === 'all' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    <Award className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-xs sm:text-sm font-sans">رصد كافة المواد (لطالب محدد) 📊</h4>
                    <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 leading-relaxed font-sans">رصد درجات كافة المواد المضافة بجانب بعضها دفعة واحدة وإرسالها مباشرة لولي الأمر.</p>
                  </div>
                </button>
              </div>

              {gradingMode === 'single' ? (
                <>
                  {/* Assessment Configurations */}
              <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm grid grid-cols-1 md:grid-cols-5 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">المادة المرصودة</label>
                  {!isCustomSubject ? (
                    <select
                      value={gradeSubject}
                      onChange={e => {
                        if (e.target.value === '__custom__') {
                          setIsCustomSubject(true);
                          setGradeSubject('');
                        } else {
                          setGradeSubject(e.target.value);
                        }
                      }}
                      className="w-full text-xs border border-slate-200 px-3 py-2 rounded-lg bg-white focus:outline-none font-semibold text-slate-700"
                    >
                      <optgroup label={`📚 موادك المسندة لشعبة (${classes.find(c => c.id === selectedClassId)?.name || 'هذا الصف'})`}>
                        {teacherClassSubjects.map((sub, i) => (
                          <option key={`class-sub-${i}`} value={sub}>{sub}</option>
                        ))}
                      </optgroup>
                      {teacherClassSubjects.length === 0 && (
                        <option value="">⚠️ لا توجد مواد مسندة لك في هذه الشعبة</option>
                      )}
                      
                      <optgroup label="✍️ أخرى">
                        <option value="__custom__">➕ كتابة مادة أخرى غير مدرجة...</option>
                      </optgroup>
                    </select>
                  ) : (
                    <div className="flex gap-1">
                      <input
                        type="text"
                        value={gradeSubject}
                        onChange={e => setGradeSubject(e.target.value)}
                        placeholder="اكتب اسم المادة هنا..."
                        className="w-full text-xs border border-indigo-200 px-3 py-2 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setIsCustomSubject(false);
                          if (teacherClassSubjects.length > 0) {
                            setGradeSubject(teacherClassSubjects[0]);
                          } else {
                            setGradeSubject('اللغة العربية');
                          }
                        }}
                        className="text-[10px] text-red-600 hover:text-red-700 font-bold px-2 bg-red-50 border border-red-100 rounded-lg transition shrink-0"
                        title="إلغاء المادة المخصصة والعودة للقائمة"
                      >
                        إلغاء
                      </button>
                    </div>
                  )}
                </div>
                <div className="md:col-span-1">
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">عنوان الاختبار / التقييم *</label>
                  <input
                    type="text"
                    value={examName}
                    onChange={e => setExamName(e.target.value)}
                    placeholder="مثال: التقويم الشهري الأول، أو اختبار الإملاء"
                    className="w-full text-xs border border-slate-200 px-3 py-2 rounded-lg focus:outline-none font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">تصنيف الاختبار / التقييم *</label>
                  <select
                    value={examType}
                    onChange={e => setExamType(e.target.value as any)}
                    className="w-full text-xs border border-slate-200 px-3 py-2 rounded-lg focus:outline-none font-semibold bg-white text-slate-700"
                  >
                    <option value="general">✍️ اختبار عام من المعلم</option>
                    <option value="monthly">📋 تقييم شهري معتمد من المدير</option>
                    <option value="special">🌟 اختبار خاص</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">الدرجة العظمى *</label>
                  <input
                    type="number"
                    value={maxScore === 0 ? '' : maxScore}
                    onFocus={e => e.target.select()}
                    onClick={e => (e.target as HTMLInputElement).select()}
                    onChange={e => {
                      const val = e.target.value;
                      if (val === '') {
                        setMaxScore(0);
                        return;
                      }
                      const num = Number(val);
                      if (num > 100) {
                        alert('❌ الدرجة العظمى لا يمكن أن تتجاوز 100');
                        setMaxScore(100);
                      } else {
                        setMaxScore(num);
                      }
                    }}
                    min={1}
                    max={100}
                    className="w-full text-xs border border-slate-200 px-3 py-2 rounded-lg focus:outline-none font-semibold"
                  />
                </div>
              </div>



              {/* Students grade sheet */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center text-xs text-slate-500">
                  <span>اسم الطالب</span>
                  <span className="pl-16">إدخال الدرجة المستحقة</span>
                </div>

                <div className="divide-y divide-slate-100">
                  {classStudents.map(student => {
                    const existingGrades = grades.filter(g => 
                      g.studentId === student.id && 
                      g.subject === gradeSubject && 
                      g.teacherId === selectedTeacherId && 
                      g.teacherId !== 'director' && 
                      g.examType !== 'monthly'
                    );
                    return (
                      <div key={student.id} className="p-4 flex items-center justify-between hover:bg-slate-50/50 transition gap-4">
                        <div>
                          <span className="font-bold text-slate-800 text-xs block">{student.name}</span>
                          {existingGrades.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-1 items-center">
                              <span className="text-[10px] text-slate-400">الدرجات السابقة:</span>
                              {existingGrades.map((g, idx) => (
                                <span key={idx} className="text-[9px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md flex items-center gap-1 border border-slate-200">
                                  <span>{g.examName}: {g.score}/{g.maxScore}</span>
                                  <span className="text-slate-300">|</span>
                                  <button
                                    type="button"
                                    onClick={() => handleEditGrade(g)}
                                    className="text-amber-600 hover:text-amber-800 font-bold px-0.5 cursor-pointer transition text-[9px]"
                                    title="تعديل الدرجة"
                                  >
                                    تعديل
                                  </button>
                                  <span className="text-slate-300">|</span>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteGrade(g.id)}
                                    className="text-rose-500 hover:text-rose-700 font-bold px-0.5 cursor-pointer transition text-[9px]"
                                    title="حذف الدرجة"
                                  >
                                    حذف
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-3">
                          {/* Attached Media Info for Grade */}
                          {gradeAttachedMedia[student.id] && (
                            <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2.5 py-1.5 rounded-xl border border-emerald-100 flex items-center gap-1 font-bold animate-pulse">
                              <span>مرفق ✓</span>
                              <button 
                                onClick={() => {
                                  setGradeAttachedMedia(prev => ({ ...prev, [student.id]: null }));
                                  setGradeAttachedMediaType(prev => ({ ...prev, [student.id]: null }));
                                }}
                                className="text-rose-500 hover:text-rose-700 font-extrabold pr-1 cursor-pointer"
                                title="حذف المرفق"
                              >
                                ×
                              </button>
                            </span>
                          )}

                          {/* Media upload option for grade */}
                          <label className="p-2 rounded-xl border bg-white border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-slate-700 transition cursor-pointer" title="إرفاق صورة ورقة الاختبار أو فيديو">
                            <Camera className="w-4 h-4" />
                            <input
                              type="file"
                              accept="image/*,video/*"
                              onChange={e => handleFileChange(e, 'grade', student.id)}
                              className="hidden"
                            />
                          </label>

                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={studentGrades[student.id] !== undefined ? studentGrades[student.id] : ''}
                              onFocus={(e) => {
                                e.target.select();
                              }}
                              onChange={e => {
                                const val = e.target.value;
                                if (val === '') {
                                  setStudentGrades({
                                    ...studentGrades,
                                    [student.id]: ''
                                  });
                                  return;
                                }
                                const num = Number(val);
                                const effectiveMax = Math.min(100, maxScore > 0 ? maxScore : 100);
                                if (num < 0) {
                                  setStudentGrades({
                                    ...studentGrades,
                                    [student.id]: 0
                                  });
                                } else if (num > effectiveMax) {
                                  alert(`❌ لا يمكن إدخال درجة أعلى من ${effectiveMax}`);
                                  setStudentGrades({
                                    ...studentGrades,
                                    [student.id]: effectiveMax
                                  });
                                } else {
                                  setStudentGrades({
                                    ...studentGrades,
                                    [student.id]: num
                                  });
                                }
                              }}
                              placeholder="0"
                              className="w-16 text-center text-xs font-bold border border-slate-200 px-2 py-1.5 rounded focus:outline-none focus:border-indigo-500"
                            />
                            <span className="text-xs text-slate-400">/ {maxScore}</span>
                          </div>

                          <button
                            id={`teacher-btn-save-grade-${student.id}`}
                            onClick={() => handleSaveGrades(student.id)}
                            className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-[11px] font-bold px-3 py-1.5 rounded-lg border border-indigo-200 transition cursor-pointer shadow-sm"
                          >
                            رصد هذه الدرجة
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {classStudents.length === 0 && (
                    <div className="p-8 text-center text-slate-400 text-sm">
                      يرجى اختيار فصل يحتوي على طلاب لإدخال الدرجات.
                    </div>
                  )}
                </div>
              </div>
                </>
              ) : (
                <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-xs space-y-6 text-right animate-fadeIn" style={{ direction: 'rtl' }}>
                  {/* Mode header */}
                  <div className="flex flex-col sm:flex-row gap-4 items-center justify-between border-b border-slate-100 pb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="bg-emerald-100 text-emerald-800 p-2.5 rounded-2xl">
                        <Users className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-extrabold text-slate-800 text-sm">اختر الطالب لتسجيل علاماته 👤</h4>
                        <p className="text-[11px] text-slate-400">سيتم تسجيل الدرجات للطالب المختار لكل المواد المضافة أدناه دفعة واحدة.</p>
                      </div>
                    </div>
                    <select
                      value={selectedStudentForAllGrades?.id || ''}
                      onChange={e => {
                        const student = classStudents.find(s => s.id === e.target.value);
                        setSelectedStudentForAllGrades(student || null);
                        setAllGradesScores({});
                      }}
                      className="text-xs font-bold border border-slate-200 px-4 py-2.5 rounded-xl bg-slate-50 focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-700 min-w-[200px]"
                    >
                      <option value="">-- اختر طالباً من الصف --</option>
                      {classStudents.map(student => (
                        <option key={student.id} value={student.id}>{student.name}</option>
                      ))}
                    </select>
                  </div>

                  {selectedStudentForAllGrades ? (
                    <div className="space-y-6 pt-2">
                      {/* Title and Max Score configuration */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1.5">العنوان الرئيسي للرصد (اسم الاختبار) *</label>
                          <input
                            type="text"
                            value={allGradesExamName}
                            onChange={e => setAllGradesExamName(e.target.value)}
                            placeholder="مثال: اختبار الشهر الأول، تقويم منتصف الفصل"
                            className="w-full text-xs border border-slate-200 px-3.5 py-2.5 rounded-xl bg-white focus:outline-none focus:border-indigo-500 font-semibold text-slate-700"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1.5">تصنيف الاختبار / التقييم الموحد *</label>
                          <select
                            value={allGradesExamType}
                            onChange={e => setAllGradesExamType(e.target.value as any)}
                            className="w-full text-xs border border-slate-200 px-3.5 py-2.5 rounded-xl bg-white focus:outline-none focus:border-indigo-500 font-semibold text-slate-700 text-right cursor-pointer"
                          >
                            <option value="general">✍️ اختبار عام من المعلم</option>
                            <option value="monthly">📋 تقييم شهري معتمد من المدير</option>
                            <option value="special">🌟 اختبار خاص</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1.5">الدرجة العظمى الموحدة للرصد *</label>
                          <input
                            type="number"
                            value={allGradesMaxScore === 0 ? '' : allGradesMaxScore}
                            onFocus={e => e.target.select()}
                            onClick={e => (e.target as HTMLInputElement).select()}
                            onChange={e => {
                              const val = e.target.value;
                              if (val === '') {
                                setAllGradesMaxScore(0);
                                return;
                              }
                              const num = Number(val);
                              if (num > 100) {
                                alert('❌ الدرجة العظمى لا يمكن أن تتجاوز 100');
                                setAllGradesMaxScore(100);
                              } else {
                                setAllGradesMaxScore(num);
                              }
                            }}
                            min={1}
                            max={100}
                            className="w-full text-xs border border-slate-200 px-3.5 py-2.5 rounded-xl bg-white focus:outline-none focus:border-indigo-500 font-semibold text-slate-700"
                          />
                        </div>
                      </div>

                      {/* Subject List with empty inputs */}
                      <div>
                        <div className="flex justify-between items-center bg-indigo-50/40 p-3 rounded-xl border border-indigo-100/30 mb-3">
                          <span className="text-[11px] text-slate-600 font-bold">📚 المواد المسندة لك لهذه الشعبة حالياً:</span>
                          <button
                            type="button"
                            onClick={() => setAllGradesScores({})}
                            className="text-[10px] text-rose-600 hover:text-rose-800 font-bold bg-white border border-rose-100 px-2.5 py-1 rounded-lg transition"
                          >
                            🗑️ إفراغ كافة الحقول
                          </button>
                        </div>

                        <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-2xs divide-y divide-slate-50 bg-white">
                          {teacherClassSubjects.map((sub, index) => (
                            <div key={index} className="p-4 flex items-center justify-between hover:bg-slate-50/30 transition gap-4">
                              <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full"></span>
                                <span className="font-extrabold text-xs text-slate-700">{sub}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  placeholder="حقل فارغ (أدخل الدرجة)"
                                  value={allGradesScores[sub] !== undefined ? allGradesScores[sub] : ''}
                                  onFocus={e => e.target.select()}
                                  onClick={e => (e.target as HTMLInputElement).select()}
                                  onChange={e => {
                                    const val = e.target.value;
                                    if (val === '') {
                                      setAllGradesScores(prev => ({
                                        ...prev,
                                        [sub]: ''
                                      }));
                                      return;
                                    }
                                    const num = Number(val);
                                    const effectiveMax = Math.min(100, allGradesMaxScore > 0 ? allGradesMaxScore : 100);
                                    if (num < 0) {
                                      setAllGradesScores(prev => ({
                                        ...prev,
                                        [sub]: '0'
                                      }));
                                    } else if (num > effectiveMax) {
                                      alert(`❌ لا يمكن إدخال درجة أعلى من ${effectiveMax}`);
                                      setAllGradesScores(prev => ({
                                        ...prev,
                                        [sub]: String(effectiveMax)
                                      }));
                                    } else {
                                      setAllGradesScores(prev => ({
                                        ...prev,
                                        [sub]: val
                                      }));
                                    }
                                  }}
                                  className="w-36 text-center text-xs border border-slate-200 px-3 py-2 rounded-xl bg-slate-50/50 focus:bg-white focus:outline-none font-bold text-slate-800 focus:ring-1 focus:ring-emerald-500"
                                  min={0}
                                  max={Math.min(100, allGradesMaxScore > 0 ? allGradesMaxScore : 100)}
                                />
                                <span className="text-[11px] text-slate-400">من {Math.min(100, allGradesMaxScore > 0 ? allGradesMaxScore : 100)}</span>
                              </div>
                            </div>
                          ))}

                          {teacherClassSubjects.length === 0 && (
                            <div className="p-8 text-center text-xs text-slate-400 italic">
                              ⚠️ لم يتم إيجاد أي مواد مسندة لك في هذه الشعبة. يرجى مراجعة إدارة المدرسة.
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Submit Button */}
                      {teacherClassSubjects.length > 0 && (
                        <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedStudentForAllGrades(null);
                              setAllGradesScores({});
                              setGradingMode('single');
                            }}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-6 py-3 rounded-2xl text-xs font-bold transition cursor-pointer"
                          >
                            إلغاء والتراجع ↩️
                          </button>
                          <button
                            type="button"
                            onClick={handleSaveAllSubjectsGrades}
                            className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white px-8 py-3 rounded-2xl text-xs font-bold transition shadow-md flex items-center gap-2 cursor-pointer"
                          >
                            <Check className="w-4.5 h-4.5" />
                            <span>حفظ الدرجات وإرسالها لولي الأمر 📱</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-12 text-center text-slate-400 text-xs italic bg-slate-50/50 rounded-2xl border border-dashed border-slate-100">
                      يرجى تحديد طالب من القائمة المنسدلة في الأعلى للبدء في رصد درجات المواد له معاً.
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {/* Students Directory Tab */}
          {activeTab === 'students' && (
            <motion.div
              key="students"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6 text-right"
            >
              <div>
                <h2 className="text-xl font-bold text-slate-800">أسماء ودليل الطلاب والشُعب الدراسية</h2>
                <p className="text-slate-500 text-xs mt-1">
                  استعرض قائمة الطلاب المسجلين بالصف، وسلوكهم، مع إمكانية إرسال إشعارات سلوكية وتقييمات فورية مدعومة بالوسائط (كاميرا، فيديو، ملفات) مباشرة لأولياء الأمور.
                </p>
              </div>

              {/* Class Dropdown Selection if teacher has multiple classes */}
              {teacherClasses.length > 1 && (
                <div className="bg-gradient-to-l from-indigo-50 to-indigo-100/30 border border-indigo-200/50 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-3 text-right">
                    <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-xs">
                      <Users className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-[10px] text-indigo-500 block font-bold">بوابة الشُعب الدراسية المتعددة</span>
                      <span className="text-xs font-bold text-slate-800">أنت معلم مرتبط بأكثر من صف دراسي، اختر الصف لفلترة أسماء الطلاب من القائمة المنسدلة:</span>
                    </div>
                  </div>
                  <select
                    value={selectedClassId}
                    onChange={e => setSelectedClassId(e.target.value)}
                    className="text-xs border border-indigo-200 px-3.5 py-2.5 rounded-xl bg-white focus:outline-none focus:border-indigo-500 font-bold text-slate-800 shadow-xs text-right cursor-pointer min-w-[150px]"
                  >
                    {teacherClasses.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Subject Information Display */}
              <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-slate-400 block font-bold">المواد المسندة والتدريس</span>
                    <span className="text-xs font-bold text-slate-800">
                      يتم تصفية الطلاب حسب المواد المسندة للمعلم: {activeTeacher?.subjects.join(' - ')}
                    </span>
                  </div>
                </div>
                <div className="text-center font-bold text-[10px] bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-xl w-full sm:w-auto">
                  عدد الطلاب بالصف: {classStudents.length} طالب وطالبة
                </div>
              </div>

              {/* Students List Directory */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="p-4 bg-slate-50 border-b border-slate-100 grid grid-cols-12 gap-2 text-right text-xs font-bold text-slate-500">
                  <div className="col-span-5 sm:col-span-4">اسم الطالب والدليل</div>
                  <div className="col-span-4 sm:col-span-3">كافة الرسائل</div>
                  <div className="hidden sm:block sm:col-span-2 text-center">حالة الطالب الحالية</div>
                  <div className="col-span-3 sm:col-span-3 text-left">إجراءات وإرسال سلوك</div>
                </div>

                <div className="divide-y divide-slate-100">
                  {classStudents.map(student => {
                    const studentParent = parents.find(p => p.childrenIds.includes(student.id));
                    return (
                      <div key={student.id} className="p-4 grid grid-cols-12 gap-2 items-center hover:bg-slate-50/50 transition text-right">
                        {/* Name & ID */}
                        <div className="col-span-5 sm:col-span-4 flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 font-bold flex items-center justify-center border border-slate-200">
                            {student.name.charAt(0)}
                          </div>
                          <div>
                            <span className="font-bold text-slate-800 text-xs block">{student.name}</span>
                            <span className="text-[10px] text-slate-400 font-mono block">الرقم الأكاديمي: #{student.id}</span>
                          </div>
                        </div>

                        {/* كافة الرسائل بدل التواصل مع ولي الأمر */}
                        <div className="col-span-4 sm:col-span-3 flex flex-col items-start gap-1">
                          {studentParent ? (
                            <>
                              <span className="text-xs font-semibold text-slate-700 block">{studentParent.name}</span>
                              <button
                                onClick={() => setSelectedStudentForMessages(student)}
                                className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-3 py-1.5 rounded-xl text-[10px] font-bold transition flex items-center gap-1 cursor-pointer shadow-xs"
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                                <span>كافة الرسائل</span>
                              </button>
                            </>
                          ) : (
                            <span className="text-[10px] text-rose-500 font-semibold italic">غير متصل بولي أمر</span>
                          )}
                        </div>

                        {/* Status (Present / WhatsApp Sent Badge) */}
                        <div className="hidden sm:block sm:col-span-2 text-center">
                          {whatsappSentRecords[`${student.id}_last_whatsapp`] ? (
                            <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-full font-bold shadow-2xs" title={`أرسل عبر الواتساب في: ${whatsappSentRecords[`${student.id}_last_whatsapp`].timeLabel}`}>
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              تم الإرسال واتس ✅
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] bg-slate-100 text-slate-600 px-2 py-1 rounded-full font-semibold">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                              منتظم بالدراسة
                            </span>
                          )}
                        </div>

                        {/* Actions (Send Behavior, Record Exam) */}
                        <div className="col-span-3 sm:col-span-3 flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setSelectedStudentForBehavior(student);
                              setBehaviorNotes('');
                              setBehaviorAttachedMedia(null);
                              setBehaviorAttachedMediaType(null);
                            }}
                            className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-3 py-1.5 rounded-xl text-[11px] font-bold transition cursor-pointer flex items-center gap-1"
                          >
                            <AlertCircle className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">إرسال سلوك</span>
                          </button>

                          <button
                            onClick={() => {
                              setActiveTab('grades');
                              // prefill the student grade field for them
                              setStudentGrades(prev => ({ ...prev, [student.id]: 0 }));
                            }}
                            className="bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 p-1.5 rounded-xl text-xs transition cursor-pointer"
                            title="رصد درجة سريعة"
                          >
                            <Award className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {classStudents.length === 0 && (
                    <div className="p-12 text-center text-slate-400 text-xs italic">
                      لا يوجد طلاب مسجلين في هذا الصف حالياً.
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
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-800">مراسلة أولياء الأمور</h2>
                  <p className="text-slate-500 text-xs mt-1">تواصل مباشرة مع والد الطالب لإرسال تقرير سلوكي، شكر وتقدير، أو ملاحظة أكاديمية.</p>
                </div>
                {messages.filter(m => m.receiverId === selectedTeacherId && !m.read).length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      markAllAsRead();
                      alert('👁️ تم تحديد جميع الرسائل الواردة كمقروءة بنجاح!');
                    }}
                    className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold px-4 py-2 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <span>👁️ تحديد كافة الوارد كمقروء</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Send Message Form */}
                <div className={`bg-white p-5 rounded-2xl border border-slate-100 shadow-sm ${chatStudentId ? 'lg:col-span-2' : 'lg:col-span-3'} space-y-4`}>
                  <h3 className="font-bold text-slate-800 text-sm mb-2">إرسال تقرير/رسالة لولي الأمر</h3>
                  <form onSubmit={handleSendMessage} className="space-y-4">
                    {/* Visual Student Cards list with unread red badges */}
                    <div className="bg-slate-50/60 p-4 rounded-xl border border-slate-100 space-y-2.5">
                      <label className="block text-xs font-bold text-slate-700 text-right">الطلاب في هذا الصف (اضغط على بطاقة الطالب لعرض رسائله فوراً 📥):</label>
                      <div className="flex flex-wrap gap-2 justify-start">
                        {classStudents.map(s => {
                          const isSelected = chatStudentId === s.id;
                          const studentUnreadCount = messages.filter(
                            m => m.receiverId === selectedTeacherId && m.studentId === s.id && !m.read
                          ).length;

                          return (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => {
                                setChatStudentId(s.id);
                                setSelectedParentId(s.parentId);
                              }}
                              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 border relative cursor-pointer ${
                                isSelected
                                  ? 'bg-indigo-600 text-white border-transparent shadow-md scale-[1.02]'
                                  : 'bg-white text-slate-700 border-slate-200/80 hover:border-indigo-300 hover:bg-indigo-50/30'
                              }`}
                            >
                              <div className="text-right">
                                <span className="block font-bold">{s.name}</span>
                                <span className={`block text-[9px] font-medium mt-0.5 ${isSelected ? 'text-indigo-200' : 'text-slate-400'}`}>
                                  والده: {s.parentName}
                                </span>
                              </div>
                              
                              {studentUnreadCount > 0 && (
                                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-black text-white px-1.5 shadow-sm animate-pulse">
                                  {studentUnreadCount}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1.5 text-right font-medium">أو اختر الطالب المعني من القائمة بخصوصه *</label>
                        <select
                          value={chatStudentId}
                          onChange={e => {
                            const sId = e.target.value;
                            setChatStudentId(sId);
                            // Auto set parent linked to this student
                            const s = students.find(stud => stud.id === sId);
                            if (s) {
                              setSelectedParentId(s.parentId);
                            } else {
                              setSelectedParentId('');
                            }
                          }}
                          className="w-full text-xs border border-slate-200 px-3 py-2 rounded-lg bg-white focus:outline-none font-semibold text-slate-700"
                          required
                        >
                          <option value="">اختر طالباً...</option>
                          {classStudents.map(s => {
                            const unreadCount = messages.filter(m => m.receiverId === selectedTeacherId && m.studentId === s.id && !m.read).length;
                            return (
                              <option key={s.id} value={s.id}>
                                {s.name} (والده: {s.parentName}){unreadCount > 0 ? ` 🔴 [${unreadCount} غير مقروء]` : ''}
                              </option>
                            );
                          })}
                        </select>
                      </div>

                      {chatStudentId && (
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1.5 text-right font-medium">عرض الرسائل بخصوص الطالب</label>
                          <select
                            value={messageFilterType}
                            onChange={e => setMessageFilterType(e.target.value as 'all' | 'outgoing' | 'incoming')}
                            className="w-full text-xs border border-indigo-200 px-3 py-2 rounded-lg bg-indigo-50/40 focus:bg-white focus:border-indigo-500 font-bold text-indigo-900 focus:outline-none transition"
                          >
                            <option value="all">📥📤 الكل (الصادرة والواردة)</option>
                            <option value="outgoing">📤 الصادرة لولي الأمر</option>
                            <option value="incoming">📥 الواردة من ولي الأمر</option>
                          </select>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5">ولي الأمر المستلم (يحدد تلقائياً عند اختيار الطالب)</label>
                      <select
                        value={selectedParentId}
                        onChange={e => setSelectedParentId(e.target.value)}
                        className="w-full text-xs border border-slate-200 px-3 py-2 rounded-lg bg-slate-50 text-slate-500 focus:outline-none"
                        disabled
                      >
                        <option value="">لا يوجد مستلم محدد</option>
                        {parents.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-2">نوع الإشعار أو الإجراء المرسل لولي الأمر *</label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {[
                          { id: 'عام', label: '💬 رسالة عامة', color: 'border-slate-200 text-slate-700 bg-slate-50/50 hover:bg-slate-50' },
                          { id: 'شهادة شكر وتقدير', label: '🌟 شكر وتقدير', color: 'border-amber-200 text-amber-800 bg-amber-50/30 hover:bg-amber-50/60' },
                          { id: 'تفوق أكاديمي', label: '📚 تفوق أكاديمي', color: 'border-emerald-200 text-emerald-800 bg-emerald-50/30 hover:bg-emerald-50/60' },
                          { id: 'تنبيه سلوكي', label: '⚠️ تنبيه سلوكي', color: 'border-rose-200 text-rose-800 bg-rose-50/30 hover:bg-rose-50/60' },
                          { id: 'تذكير بالواجبات', label: '✏️ تذكير بالواجبات', color: 'border-sky-200 text-sky-800 bg-sky-50/30 hover:bg-sky-50/60' },
                          { id: 'custom', label: '⚙️ اختيار مفتوح ومخصص', color: 'border-purple-200 text-purple-800 bg-purple-50/30 hover:bg-purple-50/60' },
                        ].map(type => (
                          <button
                            key={type.id}
                            type="button"
                            onClick={() => {
                              setNotificationType(type.id);
                              if (type.id !== 'custom') {
                                setCustomTypeLabel('');
                              }
                            }}
                            className={`px-3 py-2 rounded-xl text-[11px] font-bold border transition text-center cursor-pointer ${
                              notificationType === type.id
                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                                : type.color
                            }`}
                          >
                            {type.label}
                          </button>
                        ))}
                      </div>

                      {notificationType === 'custom' && (
                        <div className="mt-3">
                          <label className="block text-xs font-semibold text-purple-800 mb-1.5">اكتب التصنيف المخصص بنفسك (اختيار مفتوح تحدده أنت) *</label>
                          <input
                            type="text"
                            value={customTypeLabel}
                            onChange={e => setCustomTypeLabel(e.target.value)}
                            placeholder="مثال: مبادرة تطوعية، تفوق في الحساب الذهني، نشاط لاصفي..."
                            className="w-full text-xs border border-purple-200 bg-purple-50/10 px-3.5 py-2.5 rounded-xl focus:outline-none focus:border-purple-500 font-semibold text-purple-950 text-right"
                            required
                          />
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5">محتوى الرسالة *</label>
                      <textarea
                        rows={4}
                        value={messageText}
                        onChange={e => setMessageText(e.target.value)}
                        placeholder="اكتب هنا التقرير أو الرسالة لولي الأمر بخصوص سلوك الطالب أو مستواه الدراسي..."
                        className="w-full text-xs border border-slate-200 px-3.5 py-2.5 rounded-lg focus:outline-none focus:border-indigo-500"
                        required
                      />
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="submit"
                        className="bg-indigo-600 text-white px-5 py-2 rounded-xl text-xs font-bold hover:bg-indigo-700 transition cursor-pointer flex items-center gap-1.5 shadow-sm"
                      >
                        <Send className="w-4 h-4" />
                        <span>إرسال الرسالة لولي الأمر</span>
                      </button>
                    </div>
                  </form>
                </div>

                {/* Messages Chat History Log */}
                {chatStudentId && (() => {
                  const filteredMessages = messages.filter(m => {
                    const isRelatedToTeacher = m.senderId === selectedTeacherId || 
                      m.receiverId === selectedTeacherId || 
                      m.receiverRole === 'teacher' || 
                      m.receiverId === 'teacher';
                    if (!isRelatedToTeacher) return false;

                    // Only show messages specifically for the selected student
                    if (m.studentId !== chatStudentId) return false;

                    // Filter by type
                    if (messageFilterType === 'outgoing') {
                      return m.senderId === selectedTeacherId;
                    }
                    if (messageFilterType === 'incoming') {
                      return m.receiverId === selectedTeacherId;
                    }

                    return true;
                  });

                  return (
                    <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-center mb-3 gap-3">
                          <h3 className="font-bold text-slate-800 text-sm">سجل الرسائل الصادرة والواردة</h3>
                          {messages.filter(m => m.receiverId === selectedTeacherId && m.studentId === chatStudentId && !m.read).length > 0 && (
                            <button
                              type="button"
                              onClick={() => markAllAsReadForStudent(chatStudentId)}
                              className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-lg border border-emerald-200 text-[10px] font-bold transition flex items-center gap-1 cursor-pointer"
                            >
                              <span>تحديد الكل كمقروء 👁️</span>
                            </button>
                          )}
                        </div>
                        <div className="space-y-3 max-h-[320px] overflow-y-auto">
                          {filteredMessages.map(msg => {
                            const isIncomingUnread = msg.receiverId === selectedTeacherId && !msg.read;
                            return (
                              <div
                                key={msg.id}
                                onClick={() => {
                                  if (isIncomingUnread) {
                                    markAsRead(msg.id);
                                  }
                                }}
                                className={`p-3.5 rounded-xl border text-xs transition-all duration-200 ${
                                  msg.senderId === selectedTeacherId
                                    ? 'bg-indigo-50/50 border-indigo-100/40 text-right mr-4'
                                    : isIncomingUnread
                                    ? 'bg-amber-50 border-amber-300 text-right ml-4 cursor-pointer shadow-xs ring-2 ring-amber-400 hover:bg-amber-100/80 animate-pulse'
                                    : 'bg-slate-50 border-slate-100 text-right ml-4'
                                }`}
                                title={isIncomingUnread ? "انقر لتحديد هذه الرسالة كمقروءة" : undefined}
                              >
                                <div className="flex justify-between font-bold text-[10px] mb-1 text-slate-500 gap-4 items-center">
                                  <span className="flex items-center gap-1.5">
                                    <span>{msg.senderId === selectedTeacherId ? 'أنت' : msg.senderName}</span>
                                    {isIncomingUnread && (
                                      <span className="bg-amber-500 text-white text-[8px] px-1.5 py-0.5 rounded font-bold">
                                        غير مقروءة ✉️
                                      </span>
                                    )}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    {isIncomingUnread && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          markAsRead(msg.id);
                                        }}
                                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-[9px] px-1.5 py-0.5 rounded font-bold transition shadow-xs"
                                      >
                                        تحديد كمقروءة 👁️
                                      </button>
                                    )}
                                    <span className="font-mono text-[9px]">{new Date(msg.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                  </div>
                                </div>
                                <div className="text-slate-700 font-medium">
                                  {renderMessageContent(msg.content)}
                                </div>
                                {msg.studentId && (
                                  <span className="text-[9px] bg-slate-200 text-slate-600 px-1 py-0.5 rounded font-medium mt-1.5 inline-block font-sans">
                                    بخصوص: {students.find(s => s.id === msg.studentId)?.name || 'طالب'}
                                  </span>
                                )}
                                {msg.senderId === selectedTeacherId && (
                                  <div className="flex justify-end gap-2.5 mt-2 pt-1.5 border-t border-slate-100/50">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleEditTeacherMessage(msg.id, msg.content);
                                      }}
                                      className="text-[10px] text-amber-600 hover:text-amber-800 font-bold flex items-center gap-0.5 cursor-pointer"
                                      title="تعديل محتوى الرسالة أو السلوك"
                                    >
                                      ✏️ تعديل
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {filteredMessages.length === 0 && (
                            <div className="text-center p-8 text-slate-400 text-xs italic">
                              {messageFilterType === 'outgoing'
                                ? 'لا توجد رسائل صادرة بخصوص هذا الطالب.'
                                : messageFilterType === 'incoming'
                                ? 'لا توجد رسائل واردة من ولي الأمر بخصوص هذا الطالب.'
                                : 'لا توجد محادثات جارية بخصوص هذا الطالب حالياً.'}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </motion.div>
          )}

          {/* Announcements Tab */}
          {activeTab === 'announcements' && (
            <motion.div
              key="announcements"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div>
                <h2 className="text-xl font-bold text-slate-800">إدارة ونشر التعاميم والإعلانات</h2>
                <p className="text-slate-500 text-xs mt-1">
                  يمكنك نشر تعاميم وتنبيهات مباشرة لتصل فوراً على أجهزة أولياء الأمور المعنيين بالصف.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Publish Form */}
                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4 lg:col-span-1">
                  <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                    <Megaphone className="w-4.5 h-4.5 text-indigo-600" />
                    <span>نشر إعلان/تعميم جديد</span>
                  </h3>
                  
                  <form onSubmit={handlePublishAnnouncement} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5">عنوان الإعلان *</label>
                      <input
                        type="text"
                        value={announceTitle}
                        onChange={e => setAnnounceTitle(e.target.value)}
                        placeholder="مثال: موعد اختبار الشهر الأول، رحلة مدرسية..."
                        className="w-full text-xs border border-slate-200 px-3.5 py-2 rounded-xl focus:outline-none focus:border-indigo-500"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5">المستهدفون بالإعلان</label>
                      <select
                        value={announceTarget}
                        onChange={e => setAnnounceTarget(e.target.value as 'all' | 'parents')}
                        className="w-full text-xs border border-slate-200 px-3 py-2 rounded-xl focus:outline-none focus:border-indigo-500 bg-white"
                      >
                        <option value="parents">أولياء الأمور بالصف فقط</option>
                        <option value="all">الجميع (أولياء أمور ومعلمون)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5">نص ومحتوى الإعلان بالتفصيل *</label>
                      <textarea
                        rows={4}
                        value={announceContent}
                        onChange={e => setAnnounceContent(e.target.value)}
                        placeholder="اكتب هنا كافة تفاصيل التعميم والتعليمات الموجهة بدقة..."
                        className="w-full text-xs border border-slate-200 px-3.5 py-2.5 rounded-xl focus:outline-none focus:border-indigo-500"
                        required
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full bg-indigo-600 text-white py-2.5 rounded-xl text-xs font-bold hover:bg-indigo-700 transition cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <Megaphone className="w-4 h-4" />
                      <span>نشر التعميم فوراً 📢</span>
                    </button>
                  </form>
                </div>

                {/* List of Published Announcements with Role Badge next to them */}
                <div className="lg:col-span-2 space-y-4">
                  <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-700">سجل التعاميم والإعلانات المنشورة</span>
                    <span className="text-[10px] text-slate-400">إجمالي التعاميم: {announcements.length}</span>
                  </div>

                  <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
                    {announcements.map(ann => {
                      const isDirector = ann.authorRole === 'director' || ann.authorName.includes('المدير');
                      return (
                        <div key={ann.id} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition space-y-3">
                          <div className="flex justify-between items-start gap-4">
                            <h4 className="font-bold text-slate-800 text-sm">{ann.title}</h4>
                            <span className="text-[10px] text-slate-400 font-mono shrink-0">{ann.date}</span>
                          </div>
                          
                          <p className="text-xs text-slate-600 leading-relaxed">{ann.content}</p>
                          
                          <div className="pt-2.5 border-t border-slate-50 flex justify-between items-center text-[10px]">
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-400">الناشر:</span>
                              <span className="font-semibold text-slate-700">{ann.authorName}</span>
                            </div>

                            {/* ROLE BADGE: Director vs Teacher */}
                            <div>
                              {isDirector ? (
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

                    {announcements.length === 0 && (
                      <div className="bg-white p-12 rounded-2xl border border-slate-100 text-center text-slate-400 text-xs italic">
                        لم يتم نشر أي إعلانات أو تعاميم بعد.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Student Behavior Modal with Camera & Attachment */}
      <AnimatePresence>
        {selectedStudentForBehavior && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-lg p-6 text-right overflow-hidden relative"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      stopCamera();
                      setSelectedStudentForBehavior(null);
                    }}
                    className="p-1.5 text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition cursor-pointer"
                  >
                    <X className="w-4.5 h-4.5" />
                  </button>

                  {(() => {
                    const currentIndex = classStudents.findIndex(s => s.id === selectedStudentForBehavior.id);
                    const nextStudent = (currentIndex !== -1 && currentIndex < classStudents.length - 1)
                      ? classStudents[currentIndex + 1]
                      : null;
                    if (nextStudent) {
                      return (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedStudentForBehavior(nextStudent);
                            setBehaviorNotes('');
                            setBehaviorAttachedMedia(null);
                            setBehaviorAttachedMediaType(null);
                          }}
                          className="text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                          title="الانتقال لتوثيق الطالب التالي"
                        >
                          <span>الطالب التالي: {nextStudent.name}</span>
                          <ArrowLeft className="w-3.5 h-3.5" />
                        </button>
                      );
                    }
                    return null;
                  })()}
                </div>

                <div className="flex items-center gap-2">
                  <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
                    <AlertCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm">توثيق وإرسال سلوك الطالب</h3>
                    <span className="text-[10px] text-slate-400 block font-bold">للطالب: {selectedStudentForBehavior.name}</span>
                  </div>
                </div>
              </div>

              {/* Parent & WhatsApp Phone Info Header Card */}
              {(() => {
                const parent = parents.find(p => p.childrenIds.includes(selectedStudentForBehavior.id) || p.id === selectedStudentForBehavior.parentId);
                const waRecord = whatsappSentRecords[`${selectedStudentForBehavior.id}_behavior_${behaviorCategory}`] || whatsappSentRecords[`${selectedStudentForBehavior.id}_last_whatsapp`];

                return (
                  <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-2xl p-3.5 mb-4 space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-emerald-950 flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5 text-emerald-600" />
                        <span>بيانات ولي الأمر والواتساب:</span>
                      </span>
                      <span className="text-[11px] font-bold text-slate-700">{parent?.name || selectedStudentForBehavior.parentName || 'ولي الأمر'}</span>
                    </div>

                    <div className="flex gap-2 items-center">
                      <input
                        type="tel"
                        value={parentPhoneInput}
                        onChange={e => setParentPhoneInput(e.target.value)}
                        placeholder="أدخل رقم واتساب ولي الأمر (مثال: 0501234567)"
                        className="grow text-xs border border-slate-200 bg-white px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-600 text-right font-mono font-bold"
                      />
                    </div>

                    {waRecord && (
                      <div className="bg-white/80 border border-emerald-300 p-2 rounded-xl flex items-center justify-between text-[10px] font-bold text-emerald-800">
                        <div className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>تم إرسال إشعار سلوك سابق عبر الواتس لهذه الجلسة ✅</span>
                        </div>
                        <span className="font-mono dir-ltr text-emerald-600">{waRecord.timeLabel}</span>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Form Body */}
              <form onSubmit={(e) => {
                e.preventDefault();
                const student = selectedStudentForBehavior;
                const studentParent = parents.find(p => p.childrenIds.includes(student.id));
                if (!studentParent) {
                  alert('تعذر إيجاد ولي أمر مرتبط بهذا الطالب في النظام الموحد لمراسلته!');
                  return;
                }

                // Compile content
                let finalContent = `📢 [تصنيف الإشعار: سلوك وتنبيه]\nتم تسجيل سلوك (${behaviorType === 'positive' ? 'إيجابي متميز 🌟' : 'سلبي ويحتاج لمتابعة ⚠️'}) للطالب (${student.name}) في مادة (${gradeSubject || 'المادة الدراسية'}).\nالتصنيف والوصف: ${behaviorCategory}\nالتفاصيل والملاحظات: ${behaviorNotes || 'لا توجد تفاصيل إضافية مكتوبة.'}`;
                
                if (behaviorAttachedMedia) {
                  if (behaviorAttachedMediaType === 'video') {
                    finalContent += `\n[مرفق_فيديو: ${behaviorAttachedMedia}]`;
                  } else {
                    finalContent += `\n[مرفق_صورة: ${behaviorAttachedMedia}]`;
                  }
                }

                sendMessage({
                  senderId: selectedTeacherId,
                  senderName: activeTeacher?.name || 'المعلم',
                  senderRole: 'teacher',
                  receiverId: studentParent.id,
                  receiverName: studentParent.name,
                  receiverRole: 'parent',
                  content: finalContent,
                  studentId: student.id
                });

                // Trigger alerts
                alert(`🚀 تم تسجيل السلوك وإخطار ولي الأمر (${studentParent.name}) فوراً عبر المنصة وتطبيق الهاتف بنجاح!`);
                stopCamera();
                setSelectedStudentForBehavior(null);
              }} className="space-y-4">
                
                {/* Behavior Type Selection */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setBehaviorType('positive');
                      setBehaviorCategory('مشاركة متميزة بالصف');
                    }}
                    className={`p-3 rounded-xl border text-center font-bold text-xs transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      behaviorType === 'positive'
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-700 ring-2 ring-emerald-300/30'
                        : 'bg-slate-50 border-slate-200 text-slate-500'
                    }`}
                  >
                    <Sparkles className="w-4.5 h-4.5" />
                    <span>سلوك إيجابي 🌟</span>
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => {
                      setBehaviorType('negative');
                      setBehaviorCategory('تشتت وعدم انتباه');
                    }}
                    className={`p-3 rounded-xl border text-center font-bold text-xs transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      behaviorType === 'negative'
                        ? 'bg-rose-50 border-rose-300 text-rose-700 ring-2 ring-rose-300/30'
                        : 'bg-slate-50 border-slate-200 text-slate-500'
                    }`}
                  >
                    <AlertTriangle className="w-4.5 h-4.5" />
                    <span>سلوك سلبي ⚠️</span>
                  </button>
                </div>

                {/* Behavior Category */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">تصنيف السلوك الرئيسي *</label>
                  <select
                    value={behaviorCategory}
                    onChange={e => setBehaviorCategory(e.target.value)}
                    className="w-full text-xs border border-slate-200 px-3 py-2.5 rounded-xl bg-white focus:outline-none focus:border-indigo-500 text-right font-semibold"
                  >
                    {behaviorType === 'positive' ? (
                      <>
                        <option value="مشاركة متميزة بالصف">مشاركة وتفاعل متميز بالصف 🙋‍♂️</option>
                        <option value="أداء ممتاز في الواجب المنزلي">أداء ممتاز ومنظم في الواجب المنزلي 📝</option>
                        <option value="أخلاق وتعاون مميز مع الزملاء">أخلاق وتعاون مميز مع زملائه ومعلميه 🤝</option>
                        <option value="تحسن أكاديمي كبير وملحوظ">تحسن أكاديمي كبير وملحوظ 📈</option>
                        <option value="أخرى">أخرى (اكتب في التفاصيل أدناه)</option>
                      </>
                    ) : (
                      <>
                        <option value="تشتت وعدم انتباه للحصة">تشتت وعدم انتباه أثناء الشرح 😴</option>
                        <option value="عدم حل الواجب المنزلي">إهمال أو عدم حل الواجب المنزلي ❌</option>
                        <option value="تأخر عن الحصة الدراسية">تأخر متكرر عن الحصة الدراسية ⏰</option>
                        <option value="سلوك غير لائق وإثارة فوضى">سلوك غير لائق بالصف وإثارة الفوضى ⚠️</option>
                        <option value="أخرى">أخرى (اكتب في التفاصيل أدناه)</option>
                      </>
                    )}
                  </select>
                </div>

                {/* Behavior Notes */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">تفاصيل وملاحظات إضافية</label>
                  <textarea
                    rows={2}
                    value={behaviorNotes}
                    onChange={e => setBehaviorNotes(e.target.value)}
                    placeholder="أدخل تفاصيل السلوك أو الإجراء المتخذ لمساعدة ولي الأمر على المتابعة..."
                    className="w-full text-xs border border-slate-200 px-3.5 py-2.5 rounded-xl focus:outline-none focus:border-indigo-500 text-right"
                  />
                </div>

                {/* Media Capture & Attachments */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/60">
                  <span className="block text-xs font-bold text-slate-700 mb-2">إرفاق وسائط (من الألبوم/الاستوديو)</span>
                  
                  {/* Action buttons */}
                  <div className="grid grid-cols-1 gap-2 mb-3">
                    {/* Studio Upload */}
                    <label className="p-3 rounded-xl border bg-white border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold flex flex-col items-center gap-1.5 transition cursor-pointer text-center justify-center shadow-xs">
                      <Image className="w-5 h-5 text-indigo-500" />
                      <span>ألبوم / استوديو</span>
                      <input
                        type="file"
                        accept="image/*,video/*"
                        onChange={e => handleFileChange(e, 'behavior')}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {/* Camera Live Preview */}
                  {isCameraOn && (
                    <div className="mb-3 rounded-xl overflow-hidden border border-slate-300 relative bg-black">
                      <video
                        id="behavior-video-preview"
                        autoPlay
                        playsInline
                        muted
                        className="w-full max-h-48 object-cover"
                      />
                      {cameraError && (
                        <div className="absolute inset-0 bg-slate-900/95 p-3 flex flex-col items-center justify-center text-center">
                          <p className="text-[10px] text-amber-400 font-semibold mb-2 leading-relaxed">{cameraError}</p>
                          <button
                            type="button"
                            onClick={useSimulatedPhoto}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg shadow-xs cursor-pointer"
                          >
                            متابعة بالمحاكاة الذكية 📸
                          </button>
                        </div>
                      )}
                      {!cameraError && (
                        <div className="absolute bottom-2 inset-x-0 flex justify-center">
                          <button
                            type="button"
                            onClick={captureSnapshot}
                            className="bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold px-4 py-1.5 rounded-full shadow-md cursor-pointer flex items-center gap-1"
                          >
                            <Camera className="w-3.5 h-3.5" />
                            <span>التقط الصورة الآن</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Attached Media Preview */}
                  {behaviorAttachedMedia && (
                    <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200/50 p-2.5 rounded-xl">
                      <div className="flex items-center gap-2">
                        {behaviorAttachedMediaType === 'video' ? (
                          <div className="w-10 h-10 rounded-lg overflow-hidden border border-emerald-200 bg-slate-100 flex items-center justify-center">
                            <Video className="w-5 h-5 text-emerald-600" />
                          </div>
                        ) : (
                          <img
                            src={behaviorAttachedMedia}
                            alt="Attachment preview"
                            className="w-10 h-10 object-cover rounded-lg border border-emerald-200"
                            referrerPolicy="no-referrer"
                          />
                        )}
                        <div className="text-right">
                          <span className="text-[10px] text-emerald-700 font-bold block">تم إرفاق وسيط بنجاح ✓</span>
                          <span className="text-[9px] text-slate-400 font-medium block">
                            نوع المرفق: {behaviorAttachedMediaType === 'video' ? 'مقطع فيديو توثيقي' : 'صورة فوتوغرافية'}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setBehaviorAttachedMedia(null);
                          setBehaviorAttachedMediaType(null);
                        }}
                        className="text-rose-500 hover:text-rose-700 text-[10px] font-bold bg-white border border-rose-100 hover:bg-rose-50 px-2 py-1 rounded-lg"
                      >
                        حذف
                      </button>
                    </div>
                  )}
                </div>

                {/* Submit buttons */}
                <div className="flex flex-wrap gap-2 justify-end pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      stopCamera();
                      setSelectedStudentForBehavior(null);
                    }}
                    className="border border-slate-200 text-slate-500 px-3.5 py-2 rounded-xl text-xs font-bold hover:bg-slate-50 transition cursor-pointer"
                  >
                    إلغاء
                  </button>

                  <button
                    type="submit"
                    className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>إرسال بالمنصة فقط 📩</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const student = selectedStudentForBehavior;
                      let studentParent = parents.find(p => p.childrenIds.includes(student.id) || p.id === student.parentId);

                      let phoneToUse = parentPhoneInput.trim() || studentParent?.phone || '';
                      if (!phoneToUse) {
                        alert('الرجاء إدخال رقم واتساب ولي الأمر لإرسال التنبيه عبر الواتس.');
                        return;
                      }

                      // Update parent phone if provided/changed
                      if (studentParent && studentParent.phone !== phoneToUse) {
                        try {
                          const storedParentsStr = localStorage.getItem('school_parents');
                          const storedParents: Parent[] = storedParentsStr ? JSON.parse(storedParentsStr) : parents;
                          const updatedParents = storedParents.map(p => (p.id === studentParent.id || p.childrenIds.includes(student.id)) ? { ...p, phone: phoneToUse } : p);
                          localStorage.setItem('school_parents', JSON.stringify(updatedParents));
                          studentParent.phone = phoneToUse;
                        } catch (err) {
                          console.error(err);
                        }
                      }

                      // 1. Send platform message
                      let finalContent = `📢 [إشعار سلوكي وتربوي]\nتم تسجيل سلوك (${behaviorType === 'positive' ? 'إيجابي متميز 🌟' : 'سلبي ويحتاج لمتابعة ⚠️'}) للطالب (${student.name}) في مادة (${gradeSubject || 'المادة الدراسية'}).\nالتصنيف: ${behaviorCategory}\nالتفاصيل والملاحظات: ${behaviorNotes || 'لا توجد ملاحظات إضافية.'}`;
                      
                      if (behaviorAttachedMedia) {
                        finalContent += `\n[مرفق وسائط: ${behaviorAttachedMediaType === 'video' ? 'فيديو' : 'صورة'}]`;
                      }

                      if (studentParent) {
                        sendMessage({
                          senderId: selectedTeacherId,
                          senderName: activeTeacher?.name || 'المعلم',
                          senderRole: 'teacher',
                          receiverId: studentParent.id,
                          receiverName: studentParent.name,
                          receiverRole: 'parent',
                          content: finalContent,
                          studentId: student.id
                        });
                      }

                      // 2. Build WhatsApp text & open customizer modal
                      const defaultGenerated = `💚 *المدرسة الدولية الخاصة* 💚\n📢 *إشعار وتنبيه سلوكي وتربوي*\n═════════════════════════\n\n🌹 *السلام عليكم ورحمة الله وبركاته*\nإلى ولي أمر الطالب/ة المحترم:\n\n👤 *اسم الطالب:* *${student.name}*\n👨‍🏫 *المعلم المشرف:* *${activeTeacher?.name || 'المعلم'}*\n📘 *المادة الدراسية:* *${gradeSubject || 'المادة الدراسية'}*\n\n📌 *تفاصيل التقرير السلوكي:*\n• *نوع السلوك:* ${behaviorType === 'positive' ? '🌟 إيجابي متميز' : '⚠️ يحتاج لمتابعة'}\n• *التصنيف:* *${behaviorCategory}*\n• *الملاحظات والتفاصيل:* ${behaviorNotes || 'لا توجد ملاحظات إضافية'}\n\n═════════════════════════\n✨ *شاكرين لكم حسن المتابعة لتعزيز تميز ابنكم*\n🏫 *إدارة المدرسة الدولية الخاصة*`;

                      const savedTemplate = localStorage.getItem('school_whatsapp_behavior_template');
                      let initialMsg = defaultGenerated;
                      if (savedTemplate) {
                        initialMsg = savedTemplate
                          .replace(/{اسم_الطالب}/g, student.name)
                          .replace(/{المعلم}/g, activeTeacher?.name || 'المعلم')
                          .replace(/{المادة}/g, gradeSubject || 'المادة الدراسية')
                          .replace(/{نوع_السلوك}/g, behaviorType === 'positive' ? 'إيجابي متميز 🌟' : 'سلبي ويحتاج لمتابعة ⚠️')
                          .replace(/{التصنيف}/g, behaviorCategory)
                          .replace(/{الملاحظات}/g, behaviorNotes || 'لا توجد ملاحظات إضافية');
                      }

                      const waKey = `${student.id}_behavior_${behaviorCategory}`;
                      const waKeyGeneral = `${student.id}_last_whatsapp`;

                      const currentIndex = classStudents.findIndex(s => s.id === student.id);
                      const nextStudent = (currentIndex !== -1 && currentIndex < classStudents.length - 1)
                        ? classStudents[currentIndex + 1]
                        : null;

                      setWaModalState({
                        isOpen: true,
                        studentName: student.name,
                        recipientPhone: phoneToUse,
                        initialMessage: initialMsg,
                        defaultTemplateText: defaultGenerated,
                        waKey,
                        waKeyGeneral,
                        studentId: student.id,
                        nextStudent
                      });
                    }}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-xl text-xs font-bold transition shadow-md cursor-pointer flex items-center gap-1.5"
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span>إرسال عبر الواتساب مباشرة 📲</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const student = selectedStudentForBehavior;
                      const sampleName = student ? student.name : 'عبد الله الخالد';
                      const sampleTeacher = activeTeacher?.name || 'المعلم';
                      const sampleSubject = gradeSubject || 'المادة الدراسية';
                      const sampleType = behaviorType === 'positive' ? 'إيجابي متميز 🌟' : 'سلبي ويحتاج لمتابعة ⚠️';
                      const sampleCategory = behaviorCategory || 'المواظبة والانضباط';
                      const sampleNotes = behaviorNotes || 'طالب متميز ومتفاعل دائماً في الصف.';

                      const defaultGenerated = `💚 *المدرسة الدولية الخاصة* 💚\n📢 *إشعار وتنبيه سلوكي وتربوي*\n═════════════════════════\n\n🌹 *السلام عليكم ورحمة الله وبركاته*\nإلى ولي أمر الطالب/ة المحترم:\n\n👤 *اسم الطالب:* *${sampleName}*\n👨‍🏫 *المعلم المشرف:* *${sampleTeacher}*\n📘 *المادة الدراسية:* *${sampleSubject}*\n\n📌 *تفاصيل التقرير السلوكي:*\n• *نوع السلوك:* ${sampleType}\n• *التصنيف:* *${sampleCategory}*\n• *الملاحظات والتفاصيل:* ${sampleNotes}\n\n═════════════════════════\n✨ *شاكرين لكم حسن المتابعة لتعزيز تميز ابنكم*\n🏫 *إدارة المدرسة الدولية الخاصة*`;

                      const savedTemplate = localStorage.getItem('school_whatsapp_behavior_template');
                      let initialMsg = defaultGenerated;
                      if (savedTemplate) {
                        initialMsg = savedTemplate
                          .replace(/{اسم_الطالب}/g, sampleName)
                          .replace(/{المعلم}/g, sampleTeacher)
                          .replace(/{المادة}/g, sampleSubject)
                          .replace(/{نوع_السلوك}/g, sampleType)
                          .replace(/{التصنيف}/g, sampleCategory)
                          .replace(/{الملاحظات}/g, sampleNotes);
                      }

                      setWaModalState({
                        isOpen: true,
                        studentName: sampleName,
                        recipientPhone: parentPhoneInput || '0501234567',
                        initialMessage: initialMsg,
                        defaultTemplateText: defaultGenerated,
                        waKey: 'preview_behavior',
                        waKeyGeneral: 'preview_behavior_general',
                        studentId: student?.id || 'sample',
                        nextStudent: null
                      });
                    }}
                    className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 px-3.5 py-2 rounded-xl text-xs font-bold transition shadow-2xs cursor-pointer flex items-center gap-1.5"
                    title="تخصيص صياغة وقالب رسائل الواتساب السلوكية"
                  >
                    <span>⚙️ تخصيص صياغة الرسالة</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {/* Modal: كافة الرسائل لولي الأمر */}
        {selectedStudentForMessages && (() => {
          const studentParent = parents.find(p => p.childrenIds.includes(selectedStudentForMessages.id));
          const studentMessages = messages.filter(m => 
            (m.senderId === selectedTeacherId && m.receiverId === studentParent?.id) ||
            (m.receiverId === selectedTeacherId && m.senderId === studentParent?.id) ||
            (m.studentId === selectedStudentForMessages.id)
          ).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

          return (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden p-6 text-right space-y-4"
              >
                <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                  <button
                    onClick={() => setSelectedStudentForMessages(null)}
                    className="p-1.5 hover:bg-slate-100 text-slate-500 rounded-lg transition"
                  >
                    <X className="w-5 h-5" />
                  </button>
                  <div className="text-right">
                    <h3 className="font-bold text-slate-800 text-sm">أرشيف كافة الرسائل والإشعارات</h3>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      الطالب: <strong className="text-indigo-600">{selectedStudentForMessages.name}</strong> • ولي الأمر: <strong className="text-indigo-600">{studentParent?.name || 'غير معروف'}</strong>
                    </p>
                  </div>
                </div>

                <div className="space-y-3 max-h-[350px] overflow-y-auto p-1 text-right">
                  {studentMessages.map(msg => {
                    const isFromTeacher = msg.senderId === selectedTeacherId;
                    return (
                      <div
                        key={msg.id}
                        className={`p-3 rounded-xl border text-xs relative ${
                          isFromTeacher
                            ? 'bg-indigo-50/40 border-indigo-100/30 mr-4'
                            : 'bg-slate-50 border-slate-100 ml-4'
                        }`}
                      >
                        <div className="flex justify-between items-center font-bold text-[10px] mb-1 text-slate-500">
                          <div className="flex items-center gap-1.5">
                            {isFromTeacher && (
                              <button
                                onClick={() => handleEditTeacherMessage(msg.id, msg.content)}
                                className="text-amber-600 hover:bg-amber-50 p-1 rounded transition flex items-center gap-1 cursor-pointer font-sans"
                                title="تعديل الرسالة/السلوك"
                              >
                                ✏️ <span>تعديل</span>
                              </button>
                            )}
                          </div>
                          <span className="font-mono text-[9px]">
                            {new Date(msg.date).toLocaleString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="font-semibold text-slate-700">
                            {isFromTeacher ? 'أنت (المعلم)' : 'ولي الأمر'}
                          </span>
                        </div>
                        <div className="text-slate-700 leading-relaxed text-xs mt-1">
                          {msg.content}
                        </div>
                      </div>
                    );
                  })}

                  {studentMessages.length === 0 && (
                    <div className="text-center py-12 text-slate-400 text-xs italic">
                      لا توجد رسائل متبادلة مع ولي الأمر لهذا الطالب حتى الآن.
                    </div>
                  )}
                </div>

                <div className="flex justify-end pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setSelectedStudentForMessages(null)}
                    className="bg-slate-800 hover:bg-slate-900 text-white px-5 py-2 rounded-xl text-xs font-bold transition shadow-sm cursor-pointer"
                  >
                    إغلاق النافذة
                  </button>
                </div>
              </motion.div>
            </div>
          );
        })()}

        {gradeToDelete && (
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
                <span>تأكيد حذف الدرجة المرصودة</span>
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed mb-6">
                هل تريد حذف هذه الدرجة المرصودة نهائياً؟ سيتم تحديث الشهادة وكشف الدرجات لدى ولي الأمر فوراً.
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setGradeToDelete(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 rounded-xl transition cursor-pointer"
                >
                  إلغاء التراجع
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteGrade}
                  className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition shadow-sm cursor-pointer"
                >
                  نعم، تأكيد الحذف 🗑️
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {gradeToEdit && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[9999]">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 text-right"
              style={{ direction: 'rtl' }}
            >
              <h3 className="font-bold text-slate-800 text-base mb-2 flex items-center gap-2">
                <span className="text-amber-500">✏️</span>
                <span>تعديل درجة الاختبار</span>
              </h3>
              <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                تعديل درجة الاختبار (<strong className="text-indigo-600">{gradeToEdit.examName}</strong>) في مادة (<strong className="text-indigo-600">{gradeToEdit.subject}</strong>).
                <br />
                الدرجة الحالية: {gradeToEdit.score} من {gradeToEdit.maxScore}
              </p>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">الدرجة الجديدة:</label>
                  <input
                    type="number"
                    step="any"
                    value={editGradeScore}
                    onFocus={e => e.target.select()}
                    onClick={e => (e.target as HTMLInputElement).select()}
                    onChange={e => {
                      const val = e.target.value;
                      if (val === '') {
                        setEditGradeScore('');
                        return;
                      }
                      const num = Number(val);
                      const effectiveMax = Math.min(100, gradeToEdit.maxScore);
                      if (num < 0) {
                        setEditGradeScore('0');
                      } else if (num > effectiveMax) {
                        alert(`❌ لا يمكن إدخال درجة أعلى من ${effectiveMax}`);
                        setEditGradeScore(String(effectiveMax));
                      } else {
                        setEditGradeScore(val);
                      }
                    }}
                    className="w-full text-xs border border-slate-200 px-3.5 py-2.5 rounded-xl bg-white focus:border-indigo-500 focus:outline-none"
                    placeholder={`أدخل الدرجة الجديدة من 0 إلى ${Math.min(100, gradeToEdit.maxScore)}`}
                    min={0}
                    max={Math.min(100, gradeToEdit.maxScore)}
                  />
                </div>
              </div>
              
              <div className="flex gap-2 mt-6 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setGradeToEdit(null);
                    setEditGradeScore('');
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 rounded-xl transition cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={confirmEditGrade}
                  className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition shadow-sm cursor-pointer"
                >
                  حفظ التعديلات 💾
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {messageToDelete && (
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
                <span>تأكيد حذف الرسالة/الإشعار</span>
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed mb-6">
                هل تريد حذف هذه الرسالة/الإشعار نهائياً من العرض؟
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setMessageToDelete(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 rounded-xl transition cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (setMessages) {
                      setMessages(prev => {
                        const updated = prev.filter(m => m.id !== messageToDelete);
                        localStorage.setItem('school_messages', JSON.stringify(updated));
                        return updated;
                      });
                    }
                    setMessageToDelete(null);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition shadow-sm cursor-pointer"
                >
                  نعم، تأكيد الحذف 🗑️
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {messageToEdit && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[9999]">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 text-right"
              style={{ direction: 'rtl' }}
            >
              <h3 className="font-bold text-slate-800 text-base mb-2 flex items-center gap-2">
                <span className="text-amber-500">✏️</span>
                <span>تعديل نص الرسالة / السلوك المرسل</span>
              </h3>
              <textarea
                value={editMessageContent}
                onChange={e => setEditMessageContent(e.target.value)}
                className="w-full h-32 text-xs border border-slate-200 p-3 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold text-slate-700 mt-3"
                placeholder="أدخل نص الرسالة الجديد هنا..."
              />
              <div className="flex gap-2 justify-end mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setMessageToEdit(null);
                    setEditMessageContent('');
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 rounded-xl transition cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (editMessageContent.trim() === '') {
                      alert('الرجاء إدخال نص للرسالة');
                      return;
                    }
                    if (setMessages) {
                      setMessages(prev => {
                        const updated = prev.map(m => m.id === messageToEdit.id ? { ...m, content: editMessageContent.trim() } : m);
                        localStorage.setItem('school_messages', JSON.stringify(updated));
                        return updated;
                      });
                      alert('🎉 تم تعديل نص الرسالة/السلوك بنجاح وتحديثه فوراً!');
                    }
                    setMessageToEdit(null);
                    setEditMessageContent('');
                  }}
                  className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition shadow-sm cursor-pointer"
                >
                  حفظ التعديلات 💾
                </button>
              </div>
            </motion.div>
          </div>
        )}
        {/* WhatsApp Customizer Modal for Teacher */}
        {waModalState && (
          <WhatsAppMessageCustomizerModal
            isOpen={waModalState.isOpen}
            onClose={() => setWaModalState(null)}
            studentName={waModalState.studentName}
            studentId={waModalState.studentId}
            recipientPhone={waModalState.recipientPhone}
            initialMessage={waModalState.initialMessage}
            defaultTemplateText={waModalState.defaultTemplateText}
            templateStorageKey="school_whatsapp_behavior_template"
            onConfirmSend={handleConfirmSendWhatsAppTeacher}
          />
        )}

        {/* Welcome Greeting Modal for Teacher */}
        {showWelcomeModal && (
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-[10010]">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 15 }}
              className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-indigo-100 overflow-hidden text-right relative"
            >
              {/* Header Banner */}
              <div className="bg-gradient-to-r from-indigo-800 via-indigo-700 to-slate-900 text-white p-6 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-amber-400/20 via-transparent to-transparent pointer-events-none"></div>
                <button
                  onClick={() => {
                    sessionStorage.setItem('teacher_welcome_dismissed', 'true');
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
                      <BookOpen className="w-7 h-7 text-amber-300" />
                    )}
                  </div>
                  <div>
                    <span className="inline-block bg-amber-400/20 border border-amber-300/30 text-amber-300 text-[10px] font-bold px-2.5 py-0.5 rounded-full mb-1">
                      بوابة المعلم 📚
                    </span>
                    <h3 className="font-extrabold text-lg text-white">{welcomeMsgs.teacherTitle}</h3>
                    <p className="text-xs text-indigo-200 mt-0.5">{activeTeacher?.name || 'المعلم الموقر'}</p>
                  </div>
                </div>
              </div>

              {/* Body Content */}
              <div className="p-6 space-y-4">
                <div className="bg-indigo-50/70 border border-indigo-100 rounded-2xl p-4 text-xs text-indigo-950 leading-relaxed space-y-2">
                  <p className="font-extrabold text-sm text-indigo-900">
                    {welcomeMsgs.teacherSubtitle}
                  </p>
                  <p className="text-slate-700 whitespace-pre-line">
                    {welcomeMsgs.teacherBody}
                  </p>
                </div>

                {/* Highlights Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                  <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl text-center space-y-1">
                    <div className="w-8 h-8 bg-indigo-100 text-indigo-700 rounded-lg flex items-center justify-center mx-auto">
                      <Award className="w-4 h-4" />
                    </div>
                    <span className="block text-[11px] font-bold text-slate-800">رصد الدرجات</span>
                    <span className="block text-[9px] text-slate-500">سجل العلامات والاختبارات</span>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl text-center space-y-1">
                    <div className="w-8 h-8 bg-emerald-100 text-emerald-700 rounded-lg flex items-center justify-center mx-auto">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <span className="block text-[11px] font-bold text-slate-800">تفقد الحضور</span>
                    <span className="block text-[9px] text-slate-500">حضور وغياب الطلاب</span>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl text-center space-y-1">
                    <div className="w-8 h-8 bg-amber-100 text-amber-700 rounded-lg flex items-center justify-center mx-auto">
                      <MessageSquare className="w-4 h-4" />
                    </div>
                    <span className="block text-[11px] font-bold text-slate-800">التواصل اليومي</span>
                    <span className="block text-[9px] text-slate-500">ملاحظات وواجبات</span>
                  </div>
                </div>

                {/* Action Button */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      sessionStorage.setItem('teacher_welcome_dismissed', 'true');
                      setShowWelcomeModal(false);
                    }}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-md shadow-indigo-100 flex items-center justify-center gap-2"
                  >
                    <span>البدء بالمهام والدروس 📝</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
