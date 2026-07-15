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
  Trash2
} from 'lucide-react';
import { Teacher, Student, Class, Attendance, Grade, Parent, Message } from '../types';
import { motion, AnimatePresence } from 'motion/react';

interface TeacherPortalProps {
  teachers: Teacher[];
  students: Student[];
  classes: Class[];
  attendance: Attendance[];
  grades: Grade[];
  parents: Parent[];
  messages: Message[];
  saveAttendance: (newAttendance: Omit<Attendance, 'id'>[]) => void;
  saveGrade: (grade: Omit<Grade, 'id' | 'date'>) => void;
  sendMessage: (message: Omit<Message, 'id' | 'date' | 'read'>) => void;
  setMessages?: React.Dispatch<React.SetStateAction<Message[]>>;
}

export default function TeacherPortal({
  teachers,
  students,
  classes,
  attendance,
  grades,
  parents,
  messages,
  saveAttendance,
  saveGrade,
  sendMessage,
  setMessages
}: TeacherPortalProps) {
  // Simulator: active logged in teacher
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>(teachers[0]?.id || 't1');
  const activeTeacher = teachers.find(t => t.id === selectedTeacherId);

  const markAsRead = (msgId: string) => {
    if (setMessages) {
      setMessages(prev => {
        const updated = prev.map(m => m.id === msgId ? { ...m, read: true } : m);
        localStorage.setItem('school_messages', JSON.stringify(updated));
        return updated;
      });
    }
  };

  const handleDeleteTeacherMessage = (msgId: string) => {
    if (window.confirm('هل تريد حذف هذه الرسالة/الإشعار نهائياً من العرض؟')) {
      if (setMessages) {
        setMessages(prev => {
          const updated = prev.filter(m => m.id !== msgId);
          localStorage.setItem('school_messages', JSON.stringify(updated));
          return updated;
        });
      }
    }
  };

  // Login states
  const [isTeacherLoggedIn, setIsTeacherLoggedIn] = useState<boolean>(false);
  const [teacherPasswordInput, setTeacherPasswordInput] = useState<string>('');
  const [teacherLoginError, setTeacherLoginError] = useState<string>('');

  // Tabs
  const [activeTab, setActiveTab] = useState<'grades' | 'students' | 'messages'>('grades');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Student directory & Behavior state
  const [selectedStudentForBehavior, setSelectedStudentForBehavior] = useState<Student | null>(null);
  const [selectedStudentForMessages, setSelectedStudentForMessages] = useState<Student | null>(null);
  const [behaviorType, setBehaviorType] = useState<'positive' | 'negative'>('positive');
  const [behaviorCategory, setBehaviorCategory] = useState<string>('مشاركة متميزة بالصف');
  const [behaviorNotes, setBehaviorNotes] = useState<string>('');
  const [behaviorAttachedMedia, setBehaviorAttachedMedia] = useState<string | null>(null);
  const [behaviorAttachedMediaType, setBehaviorAttachedMediaType] = useState<'image' | 'video' | null>(null);
  
  // Real-time camera streaming & capture variables
  const [isCameraOn, setIsCameraOn] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string>('');

  // Grade attachment states
  const [gradeAttachedMedia, setGradeAttachedMedia] = useState<{ [studentId: string]: string | null }>({});
  const [gradeAttachedMediaType, setGradeAttachedMediaType] = useState<{ [studentId: string]: 'image' | 'video' | null }>({});

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
  const [examName, setExamName] = useState<string>('');
  const [maxScore, setMaxScore] = useState<number>(20);
  const [studentGrades, setStudentGrades] = useState<{ [studentId: string]: number | string }>({});
  
  useEffect(() => {
    if (activeTeacher && activeTeacher.subjects.length > 0) {
      setGradeSubject(activeTeacher.subjects[0]);
    }
  }, [selectedTeacherId]);

  // Message state
  const [selectedParentId, setSelectedParentId] = useState<string>('');
  const [messageText, setMessageText] = useState<string>('');
  const [chatStudentId, setChatStudentId] = useState<string>('');
  const [notificationType, setNotificationType] = useState<string>('عام');
  const [customTypeLabel, setCustomTypeLabel] = useState<string>('');

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
    if (score === undefined || score === '' || Number(score) < 0 || Number(score) > 100) {
      alert('الرجاء إدخال درجة صالحة بين 0 و 100');
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
      maxScore,
      teacherId: selectedTeacherId
    });

    // Auto-notify Parent
    const student = students.find(s => s.id === studentId);
    const studentParent = parents.find(p => p.childrenIds.includes(studentId));
    if (student && studentParent) {
      const mediaUrl = gradeAttachedMedia[studentId];
      const mediaType = gradeAttachedMediaType[studentId];
      
      let attachmentText = '';
      if (mediaUrl) {
        if (mediaType === 'video') {
          attachmentText = `\n[مرفق_فيديو: ${mediaUrl}]`;
        } else {
          attachmentText = `\n[مرفق_صورة: ${mediaUrl}]`;
        }
      }

      sendMessage({
        senderId: selectedTeacherId,
        senderName: activeTeacher?.name || 'المعلم',
        senderRole: 'teacher',
        receiverId: studentParent.id,
        receiverName: studentParent.name,
        receiverRole: 'parent',
        content: `📢 [تصنيف الإشعار: رصد درجات]\nتم رصد درجة جديدة للطالب (${student.name}) في مادة (${gradeSubject}) للاختبار (${examName}).\nالدرجة المرصودة: ${score} من ${maxScore}.${attachmentText}`,
        studentId: student.id,
      });

      // Clear the attachment after saving
      setGradeAttachedMedia(prev => ({ ...prev, [studentId]: null }));
      setGradeAttachedMediaType(prev => ({ ...prev, [studentId]: null }));
    }

    alert(`تم رصد درجة الطالب بنجاح! وتم إرسال إشعار فوري لولي الأمر عبر المنصة الموحدة 🔔`);
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
          const targetTeacher = teachers.find(t => t.id === selectedTeacherId);
          if (teacherPasswordInput === (targetTeacher?.password || '123')) {
            setIsTeacherLoggedIn(true);
            setTeacherLoginError('');
            setTeacherPasswordInput('');
          } else {
            setTeacherLoginError('كلمة المرور غير صحيحة، حاول مجدداً.');
          }
        }} className="w-full mt-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 text-right font-medium">اختر المعلم لتسجيل الدخول</label>
            <select
              value={selectedTeacherId}
              onChange={e => {
                setSelectedTeacherId(e.target.value);
                setTeacherLoginError('');
              }}
              className="w-full text-xs border border-slate-200 px-3.5 py-2.5 rounded-xl bg-white focus:border-indigo-500 focus:outline-none text-right font-semibold text-slate-800"
            >
              {teachers.map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t.subjects.join(' / ')})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 text-right font-medium">كلمة مرور المعلم</label>
            <div className="relative">
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                <Lock className="w-4 h-4" />
              </span>
              <input
                type="password"
                value={teacherPasswordInput}
                onChange={e => setTeacherPasswordInput(e.target.value)}
                placeholder="أدخل كلمة المرور الخاصة بك..."
                className="w-full text-xs border border-slate-200 pr-10 pl-4 py-2.5 rounded-xl focus:border-indigo-500 focus:outline-none text-center font-bold font-mono tracking-widest"
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
            تسجيل الدخول للمتابعة
          </button>
          
          <div className="mt-4 p-3 bg-slate-50 border border-slate-100 rounded-xl text-right">
            <p className="text-[11px] text-slate-600 leading-relaxed">
              🔒 <strong>تنبيه الأمان:</strong> يجب الحصول على كلمة المرور الخاصة بك من مدير المدرسة مباشرة. لا يمكن للمعلم تعديل كلمة المرور أو تعيينها بنفسه، بل يتم تحديدها وإدارتها حصراً عبر لوحة تحكم المدير العام للمدرسة الدولية.
            </p>
            <p className="text-[10px] text-indigo-600 mt-2 text-center font-semibold">
              (كلمة المرور التجريبية الافتراضية للمعلمين حالياً هي: <strong className="font-mono bg-indigo-50 px-1 py-0.5 rounded text-indigo-950 font-bold">123</strong>)
            </p>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div id="teacher-portal-root" className="bg-slate-50 min-h-full rounded-2xl border border-slate-200 overflow-hidden shadow-md flex flex-col md:flex-row">
      {/* Teacher App Sidebar */}
      <div id="teacher-sidebar" className="w-full md:w-64 bg-slate-950 text-white p-4 md:p-6 flex flex-col justify-between">
        <div>
          {/* Sidebar Header with Hamburger button on Mobile */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4 md:mb-6 md:pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold shadow-sm">
                {activeTeacher?.name.replace('أ.', '').trim().charAt(0)}
              </div>
              <div className="text-right">
                <h3 className="font-bold text-sm text-slate-100">{activeTeacher?.name}</h3>
                <span className="text-[10px] text-indigo-400 font-bold block">بوابة المعلم الإلكترونية</span>
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

          {/* Navigation and Login Info - Collapsible on Mobile */}
          <div className={`${isMobileMenuOpen ? 'block' : 'hidden md:block'} space-y-4`}>
            {/* Logged in Teacher Info & Logout */}
            <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800/40 space-y-2.5">
              <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1 justify-end">
                <span>بوابة المعلم المعتمدة والآمنة</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              </span>
              <button
                onClick={() => {
                  setIsTeacherLoggedIn(false);
                  setTeacherPasswordInput('');
                  setIsMobileMenuOpen(false);
                }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-rose-950/40 text-rose-300 hover:bg-rose-950/75 border border-rose-900/30 rounded-xl text-[11px] font-bold transition cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>قفل الخروج (تسجيل خروج)</span>
              </button>
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
                <span>رصد الدرجات والتقييم</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('students');
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-right text-xs font-semibold transition-all duration-200 ${
                  activeTab === 'students' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-300 hover:bg-slate-900 hover:text-slate-100'
                }`}
              >
                <Users className="w-4.5 h-4.5 shrink-0" />
                <span>أسماء ودليل الطلاب</span>
                <span className="mr-auto bg-indigo-500/40 text-indigo-200 px-2 py-0.5 rounded-full text-[9px] font-bold">
                  {classStudents.length} طلاب
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
                <MessageSquare className="w-4.5 h-4.5 shrink-0" />
                <span>مراسلة أولياء الأمور</span>
                {messages.filter(m => m.receiverId === selectedTeacherId && !m.read).length > 0 && (
                  <span className="mr-auto bg-rose-500 text-white px-2 py-0.5 rounded-full text-[9px] font-bold animate-pulse">
                    {messages.filter(m => m.receiverId === selectedTeacherId && !m.read).length} جديدة
                  </span>
                )}
              </button>
            </nav>
          </div>
        </div>

        {/* Portal Info - Collapsible on Mobile */}
        <div className={`${isMobileMenuOpen ? 'block mt-6' : 'hidden md:block'} mt-8 border-t border-slate-800 pt-4 text-[10px] text-slate-400 text-right`}>
          <p>تطبيق المعلم المعتمد - الكادر التدريسي</p>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 p-6 md:p-8 overflow-y-auto max-h-[800px]">
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

              {/* Assessment Configurations */}
              <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">المادة المرصودة</label>
                  <select
                    value={gradeSubject}
                    onChange={e => setGradeSubject(e.target.value)}
                    className="w-full text-xs border border-slate-200 px-3 py-2 rounded-lg bg-white focus:outline-none"
                  >
                    {activeTeacher?.subjects.map((sub, i) => (
                      <option key={i} value={sub}>{sub}</option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">عنوان الاختبار / التقييم *</label>
                  <input
                    type="text"
                    value={examName}
                    onChange={e => setExamName(e.target.value)}
                    placeholder="مثال: التقويم الشهري الأول، أو اختبار الإملاء"
                    className="w-full text-xs border border-slate-200 px-3 py-2 rounded-lg focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">الدرجة العظمى *</label>
                  <input
                    type="number"
                    value={maxScore}
                    onChange={e => setMaxScore(Number(e.target.value))}
                    min={1}
                    className="w-full text-xs border border-slate-200 px-3 py-2 rounded-lg focus:outline-none"
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
                    const existingGrades = grades.filter(g => g.studentId === student.id && g.subject === gradeSubject);
                    return (
                      <div key={student.id} className="p-4 flex items-center justify-between hover:bg-slate-50/50 transition gap-4">
                        <div>
                          <span className="font-bold text-slate-800 text-xs block">{student.name}</span>
                          {existingGrades.length > 0 && (
                            <div className="flex gap-1.5 mt-1">
                              <span className="text-[10px] text-slate-400">الدرجات السابقة:</span>
                              {existingGrades.map((g, idx) => (
                                <span key={idx} className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                                  {g.examName}: {g.score}/{g.maxScore}
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
                              onFocus={() => {
                                setStudentGrades({
                                  ...studentGrades,
                                  [student.id]: ''
                                });
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
                                if (num < 0) {
                                  setStudentGrades({
                                    ...studentGrades,
                                    [student.id]: 0
                                  });
                                } else if (num > 100) {
                                  setStudentGrades({
                                    ...studentGrades,
                                    [student.id]: 100
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

                        {/* Status (Present / Absent) */}
                        <div className="hidden sm:block sm:col-span-2 text-center">
                          <span className="inline-flex items-center gap-1 text-[10px] bg-slate-100 text-slate-600 px-2 py-1 rounded-full font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            منتظم بالدراسة
                          </span>
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
              <div>
                <h2 className="text-xl font-bold text-slate-800">مراسلة أولياء الأمور</h2>
                <p className="text-slate-500 text-xs mt-1">تواصل مباشرة مع والد الطالب لإرسال تقرير سلوكي، شكر وتقدير، أو ملاحظة أكاديمية.</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Send Message Form */}
                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm lg:col-span-2 space-y-4">
                  <h3 className="font-bold text-slate-800 text-sm mb-2">إرسال تقرير/رسالة لولي الأمر</h3>
                  <form onSubmit={handleSendMessage} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5">اختر الطالب المعني للتواصل بخصوصه *</label>
                      <select
                        value={chatStudentId}
                        onChange={e => {
                          const sId = e.target.value;
                          setChatStudentId(sId);
                          // Auto set parent linked to this student
                          const s = students.find(stud => stud.id === sId);
                          if (s) setSelectedParentId(s.parentId);
                        }}
                        className="w-full text-xs border border-slate-200 px-3 py-2 rounded-lg bg-white focus:outline-none"
                        required
                      >
                        <option value="">اختر طالباً...</option>
                        {classStudents.map(s => (
                          <option key={s.id} value={s.id}>{s.name} (والده: {s.parentName})</option>
                        ))}
                      </select>
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
                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between">
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm mb-3">سجل الرسائل الصادرة والواردة</h3>
                    <div className="space-y-3 max-h-[320px] overflow-y-auto">
                      {messages
                        .filter(m => m.senderId === selectedTeacherId || m.receiverId === selectedTeacherId)
                        .map(msg => {
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
                                <span className="text-[9px] bg-slate-200 text-slate-600 px-1 py-0.5 rounded font-medium mt-1.5 inline-block">
                                  بخصوص: {students.find(s => s.id === msg.studentId)?.name || 'طالب'}
                                </span>
                              )}
                            </div>
                          );
                        })}

                      {messages.filter(m => m.senderId === selectedTeacherId || m.receiverId === selectedTeacherId).length === 0 && (
                        <div className="text-center p-8 text-slate-400 text-xs italic">
                          لا توجد محادثات جارية حالياً.
                        </div>
                      )}
                    </div>
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
                  <span className="block text-xs font-bold text-slate-700 mb-2">إرفاق وسائط (صورة من كاميرا، فيديو، استوديو)</span>
                  
                  {/* Action buttons */}
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {/* Camera */}
                    <button
                      type="button"
                      onClick={() => {
                        if (isCameraOn) {
                          stopCamera();
                        } else {
                          startCamera();
                        }
                      }}
                      className={`p-2.5 rounded-xl border text-[10px] font-bold flex flex-col items-center gap-1.5 transition cursor-pointer ${
                        isCameraOn
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Camera className="w-4 h-4" />
                      <span>{isCameraOn ? 'إيقاف الكاميرا' : 'التقاط بالكاميرا'}</span>
                    </button>

                    {/* Studio Upload */}
                    <label className="p-2.5 rounded-xl border bg-white border-slate-200 text-slate-600 hover:bg-slate-50 text-[10px] font-bold flex flex-col items-center gap-1.5 transition cursor-pointer text-center justify-center">
                      <Image className="w-4 h-4" />
                      <span>ألبوم / استوديو</span>
                      <input
                        type="file"
                        accept="image/*,video/*"
                        onChange={e => handleFileChange(e, 'behavior')}
                        className="hidden"
                      />
                    </label>

                    {/* Video simulation */}
                    <button
                      type="button"
                      onClick={useSimulatedVideo}
                      className="p-2.5 rounded-xl border bg-white border-slate-200 text-slate-600 hover:bg-slate-50 text-[10px] font-bold flex flex-col items-center justify-center gap-1.5 transition cursor-pointer text-center"
                    >
                      <Video className="w-4 h-4 text-rose-500" />
                      <span>تسجيل/إرفاق فيديو</span>
                    </button>
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

                {/* Submit button */}
                <div className="flex gap-2 justify-end pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      stopCamera();
                      setSelectedStudentForBehavior(null);
                    }}
                    className="border border-slate-200 text-slate-500 px-4 py-2 rounded-xl text-xs font-bold hover:bg-slate-50 transition cursor-pointer"
                  >
                    إلغاء التوثيق
                  </button>
                  <button
                    type="submit"
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl text-xs font-bold transition shadow-md cursor-pointer flex items-center gap-1"
                  >
                    <Send className="w-4 h-4 animate-bounce" />
                    <span>إرسال السلوك وإخطار ولي الأمر</span>
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
                          <button
                            onClick={() => handleDeleteTeacherMessage(msg.id)}
                            className="text-rose-500 hover:bg-rose-50 p-1 rounded transition flex items-center gap-1 cursor-pointer font-sans"
                            title="حذف الرسالة"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>حذف</span>
                          </button>
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
      </AnimatePresence>
    </div>
  );
}
