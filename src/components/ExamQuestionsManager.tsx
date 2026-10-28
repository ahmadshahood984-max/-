/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  FileText, 
  Plus, 
  Search, 
  Filter, 
  FileDown, 
  Printer, 
  Edit3, 
  Trash2, 
  CheckCircle, 
  Clock, 
  AlertCircle, 
  Eye, 
  BookOpen, 
  User, 
  GraduationCap, 
  Calendar, 
  Sparkles,
  ArrowRight,
  Send
} from 'lucide-react';
import { ExamQuestionPaper, Teacher, Class } from '../types';
import { ExamQuestionPaperEditor } from './ExamQuestionPaperEditor';
import { exportExamPaperToWord } from '../lib/wordExport';

interface ExamQuestionsManagerProps {
  currentUserRole: 'teacher' | 'director';
  currentTeacher?: Teacher | null;
  classes: Class[];
  examQuestions: ExamQuestionPaper[];
  onSavePaper: (paper: ExamQuestionPaper) => void;
  onDeletePaper: (id: string) => void;
  availableSubjects?: string[];
}

export const ExamQuestionsManager: React.FC<ExamQuestionsManagerProps> = ({
  currentUserRole,
  currentTeacher,
  classes,
  examQuestions,
  onSavePaper,
  onDeletePaper,
  availableSubjects = ['الرياضيات', 'اللغة العربية', 'العلوم', 'التربية الإسلامية', 'اللغة الإنجليزية', 'الاجتماعيات']
}) => {
  const [editingPaper, setEditingPaper] = useState<ExamQuestionPaper | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState<boolean>(false);
  const [paperToDelete, setPaperToDelete] = useState<ExamQuestionPaper | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('');
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>('');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('');

  // Filter papers
  // If teacher, show their own papers, or if director, show all
  const filteredPapers = examQuestions.filter(paper => {
    if (currentUserRole === 'teacher' && currentTeacher) {
      if (paper.teacherId && paper.teacherId !== currentTeacher.id && paper.teacherName !== currentTeacher.name) {
        return false;
      }
    }

    if (selectedClassFilter && paper.classId !== selectedClassFilter && paper.className !== selectedClassFilter) {
      return false;
    }

    if (selectedSubjectFilter && paper.subject !== selectedSubjectFilter) {
      return false;
    }

    if (selectedStatusFilter && paper.status !== selectedStatusFilter) {
      return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = (paper.title || '').toLowerCase().includes(q);
      const matchTeacher = (paper.teacherName || '').toLowerCase().includes(q);
      const matchSubject = (paper.subject || '').toLowerCase().includes(q);
      const matchClass = (paper.className || '').toLowerCase().includes(q);
      const matchContent = (paper.contentHtml || '').toLowerCase().includes(q);
      if (!matchTitle && !matchTeacher && !matchSubject && !matchClass && !matchContent) {
        return false;
      }
    }

    return true;
  }).sort((a, b) => new Date(b.dateCreated).getTime() - new Date(a.dateCreated).getTime());

  // Handle Save
  const handleSave = (savedPaper: ExamQuestionPaper) => {
    onSavePaper(savedPaper);
    setEditingPaper(null);
    setIsCreatingNew(false);
  };

  // If in Editor mode
  if (isCreatingNew || editingPaper) {
    const currentClass = classes.find(c => c.id === currentTeacher?.classId) || classes[0];
    return (
      <div className="w-full">
        <div className="max-w-5xl mx-auto mb-4 px-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              setEditingPaper(null);
              setIsCreatingNew(false);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer shadow-2xs"
          >
            <ArrowRight className="w-4 h-4" />
            <span>الرجوع إلى قائمة الأسئلة</span>
          </button>
        </div>

        <ExamQuestionPaperEditor
          paper={editingPaper}
          currentUserRole={currentUserRole}
          currentTeacherName={currentTeacher?.name || 'المعلم'}
          currentTeacherId={currentTeacher?.id || 't1'}
          defaultSubject={currentTeacher?.subject || availableSubjects[0] || 'الرياضيات'}
          defaultClassName={currentClass?.name || 'الصف الأول'}
          defaultClassId={currentClass?.id || 'c1'}
          availableClasses={classes.map(c => ({ id: c.id, name: c.name }))}
          availableSubjects={availableSubjects}
          onSave={handleSave}
          onClose={() => {
            setEditingPaper(null);
            setIsCreatingNew(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 text-right" style={{ direction: 'rtl' }}>
      {/* Header Banner */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-800 text-white flex items-center justify-center font-black text-xl shadow-xs shrink-0">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h2 className="font-black text-base sm:text-lg text-slate-900 flex items-center gap-2">
              <span>{currentUserRole === 'director' ? 'بنك وملف الأسئلة والمذاكرات المدرسية' : 'كتابة وإدارة أسئلة المذاكرات والاختبارات'}</span>
              <span className="text-xs bg-indigo-50 text-indigo-700 font-bold px-2.5 py-0.5 rounded-full border border-indigo-200">
                {filteredPapers.length} نماذج
              </span>
            </h2>
            <p className="text-slate-500 text-xs mt-0.5">
              {currentUserRole === 'director'
                ? 'استعراض كافة أسئلة المذاكرات المرسلة من المعلمين، مع اسم المعلم والصف والمادة، وتصديرها بصيغة وورد (Word) للتعديل والطباعة.'
                : 'أنشئ أسئلة المذاكرة بصيغة الوورد مع إدراج الصور والجداول والتنسيق الكامل وإرسالها لإدارة المدرسة للاعتماد.'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setEditingPaper(null);
            setIsCreatingNew(true);
          }}
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-sm shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>+ كتابة أسئلة مذاكرة جديدة (Word)</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 absolute right-3 top-3 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث بالمعلم، المادة، الصف، العنوان..."
            className="w-full pr-9 pl-3 py-2 border border-slate-200 rounded-xl focus:border-indigo-500 focus:outline-none"
          />
        </div>

        {/* Class Filter */}
        <div>
          <select
            value={selectedClassFilter}
            onChange={(e) => setSelectedClassFilter(e.target.value)}
            className="w-full py-2 px-3 border border-slate-200 rounded-xl focus:border-indigo-500 focus:outline-none bg-white font-medium"
          >
            <option value="">-- جميع الصفوف والشعب --</option>
            {classes.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Subject Filter */}
        <div>
          <select
            value={selectedSubjectFilter}
            onChange={(e) => setSelectedSubjectFilter(e.target.value)}
            className="w-full py-2 px-3 border border-slate-200 rounded-xl focus:border-indigo-500 focus:outline-none bg-white font-medium"
          >
            <option value="">-- جميع المواد الدراسية --</option>
            {availableSubjects.map(sub => (
              <option key={sub} value={sub}>{sub}</option>
            ))}
          </select>
        </div>

        {/* Status Filter */}
        <div>
          <select
            value={selectedStatusFilter}
            onChange={(e) => setSelectedStatusFilter(e.target.value)}
            className="w-full py-2 px-3 border border-slate-200 rounded-xl focus:border-indigo-500 focus:outline-none bg-white font-medium"
          >
            <option value="">-- جميع الحالات --</option>
            <option value="approved">معتمدة رسمياً ✅</option>
            <option value="submitted">مرسلة للمدير ⏳</option>
            <option value="draft">مسودة قيد الكتابة ✍️</option>
            <option value="revision_requested">تحتاج تعديل ⚠️</option>
          </select>
        </div>
      </div>

      {/* Questions Papers Table / Cards */}
      {filteredPapers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center space-y-3">
          <div className="w-16 h-16 bg-indigo-50 rounded-2xl text-indigo-500 flex items-center justify-center mx-auto">
            <FileText className="w-8 h-8" />
          </div>
          <h3 className="font-extrabold text-slate-700 text-sm">لا توجد أوراق أسئلة مسجلة حالياً</h3>
          <p className="text-slate-400 text-xs max-w-md mx-auto">
            {currentUserRole === 'director'
              ? 'لم يقم المعلمون بإرسال أسئلة مذاكرات بعد، أو لا توجد نتائج تطابق خيارات التصفية المحددة.'
              : 'ابدأ بكتابة ورقة أسئلة امتحان ومذاكرة جديدة مستخدماً ميزات الوورد وإدراج الصور.'}
          </p>
          <button
            type="button"
            onClick={() => {
              setEditingPaper(null);
              setIsCreatingNew(true);
            }}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>كتابة نموذج أسئلة جديد</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredPapers.map((paper, idx) => {
            const dateFormatted = new Date(paper.dateCreated).toLocaleDateString('ar-EG', {
              year: 'numeric',
              month: 'short',
              day: 'numeric'
            });

            return (
              <div
                key={paper.id || idx}
                className="bg-white rounded-2xl border border-slate-200 hover:border-indigo-300 p-5 shadow-2xs hover:shadow-md transition flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4"
              >
                {/* Left/Right Paper Info */}
                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-black text-sm sm:text-base text-slate-900">{paper.title}</h3>
                    
                    <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border ${
                      paper.status === 'approved' 
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                        : paper.status === 'submitted'
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : paper.status === 'revision_requested'
                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                        : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                      {paper.status === 'approved' ? 'معتمد رسمياً ✅' : paper.status === 'submitted' ? 'مرسل للمدير ⏳' : paper.status === 'revision_requested' ? 'يحتاج تعديل ⚠️' : 'مسودة ✍️'}
                    </span>
                  </div>

                  {/* Explicit Meta Details: Teacher, Subject, Class */}
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                    <span className="flex items-center gap-1 bg-indigo-50 text-indigo-900 px-2.5 py-1 rounded-lg border border-indigo-150 font-bold">
                      <User className="w-3.5 h-3.5 text-indigo-600" />
                      <span>المعلم: <strong className="text-indigo-950">{paper.teacherName}</strong></span>
                    </span>

                    <span className="flex items-center gap-1 bg-slate-50 text-slate-800 px-2.5 py-1 rounded-lg border border-slate-200 font-bold">
                      <BookOpen className="w-3.5 h-3.5 text-slate-500" />
                      <span>المادة: <strong className="text-slate-900">{paper.subject}</strong></span>
                    </span>

                    <span className="flex items-center gap-1 bg-slate-50 text-slate-800 px-2.5 py-1 rounded-lg border border-slate-200 font-bold">
                      <GraduationCap className="w-3.5 h-3.5 text-slate-500" />
                      <span>الصف: <strong className="text-slate-900">{paper.className}</strong></span>
                    </span>

                    <span className="flex items-center gap-1 text-[11px] text-slate-400 font-mono">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>{dateFormatted}</span>
                    </span>
                  </div>

                  {/* Header details summary */}
                  <div className="text-[11px] text-slate-500 flex flex-wrap gap-2 pt-1 border-t border-slate-100">
                    <span>العام: {paper.headerConfig?.academicYear || '2025 - 2026'}</span>
                    <span>•</span>
                    <span>المدة: {paper.headerConfig?.duration || 'ساعة ونصف'}</span>
                    <span>•</span>
                    <span>الدرجة: <strong className="text-indigo-700 font-bold">{paper.headerConfig?.totalMarks || '100'}</strong></span>
                    {paper.headerConfig?.customFields && paper.headerConfig.customFields.map((cf, i) => (
                      <span key={i} className="text-indigo-600 font-medium">
                        • {cf.label}: {cf.value}
                      </span>
                    ))}
                  </div>

                  {paper.directorNotes && (
                    <div className="text-xs bg-amber-50 text-amber-900 p-2.5 rounded-xl border border-amber-200/80">
                      <strong>ملاحظة الإدارة: </strong> {paper.directorNotes}
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  {/* Export Word Button - Primary highlight requested by user */}
                  <button
                    type="button"
                    onClick={() => exportExamPaperToWord(paper)}
                    className="px-3.5 py-2 bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-800 hover:to-indigo-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                    title="تصدير ملف وورد (.doc) جاهز للتعديل والطباعة في Microsoft Word"
                  >
                    <FileDown className="w-4 h-4" />
                    <span>تصدير Word 📥</span>
                  </button>

                  {/* Edit / View in Rich Word Editor */}
                  <button
                    type="button"
                    onClick={() => setEditingPaper(paper)}
                    className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                    title="فتح ورقة الأسئلة وتعديلها في محرر الوورد"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>{currentUserRole === 'director' ? 'معاينة / تعديل' : 'تعديل الأسئلة'}</span>
                  </button>

                  {/* Delete button */}
                  <button
                    type="button"
                    onClick={() => setPaperToDelete(paper)}
                    className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl transition cursor-pointer border border-transparent hover:border-rose-200"
                    title="حذف ورقة الأسئلة"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {paperToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-sm w-full space-y-4 shadow-xl text-right">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1.5">
              <h4 className="font-extrabold text-sm text-slate-800">تأكيد حذف ورقة الأسئلة</h4>
              <p className="text-xs text-slate-500">
                هل أنت متأكد من حذف ورقة الأسئلة:<br />
                <strong className="text-slate-900 font-bold block mt-1">"{paperToDelete.title}"</strong>
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setPaperToDelete(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeletePaper(paperToDelete.id);
                  setPaperToDelete(null);
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-xs"
              >
                نعم، تأكيد الحذف 🗑️
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
