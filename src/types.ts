/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Teacher {
  id: string;
  name: string;
  email: string;
  phone: string;
  subjects: string[];
  classes: string[]; // Class IDs
  joinDate: string;
  password?: string; // Teacher password set by Director
  shift?: 'morning' | 'evening';
}

export interface Student {
  id: string;
  name: string;
  classId: string;
  parentId: string;
  rollNo: string;
  gender: 'male' | 'female';
  dob: string;
  parentName: string;
  shift?: 'morning' | 'evening';
  serialNo?: string;
  unifiedNo?: string;
  nationalId?: string;
  fatherName?: string;
  fatherJob?: string;
  motherName?: string;
  motherJob?: string;
  motherMaidenName?: string;
  grandfatherName?: string;
  birthPlace?: string;
  residencePlace?: string;
  residenceCity?: string;
  address?: string;
  previousSchool?: string;
  healthStatus?: string;
  bloodTypeOrHealth?: string;
  transportation?: string;
  booksStatus?: string;
  uniformStatus?: string;
  parentPhone?: string;
  parentBackupPhone?: string;
  guardianRelation?: string;
  guardianNationalId?: string;
  avatar?: string;
  photo?: string;
}

export interface Parent {
  id: string;
  name: string;
  email: string;
  phone: string;
  childrenIds: string[];
}

export interface Class {
  id: string;
  name: string; // e.g. "الصف الأول - أ", "الصف الثاني - ب"
  grade: string; // e.g. "الأول", "الثاني"
  room: string;
  teacherId: string; // Class Advisor
  shift?: 'morning' | 'evening';
}

export interface Attendance {
  id: string;
  studentId: string;
  date: string; // YYYY-MM-DD
  status: 'present' | 'absent' | 'late' | 'excused';
  notes?: string;
  shift?: 'morning' | 'evening';
}

export interface Grade {
  id: string;
  studentId: string;
  subject: string;
  examName: string;
  score: number;
  maxScore: number;
  date: string;
  teacherId: string;
  examType?: 'special' | 'monthly' | 'general';
  term?: string;
  classId?: string;
  notes?: string;
  attachedMedia?: string;
  attachedMediaType?: 'image' | 'video';
  shift?: 'morning' | 'evening';
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  target: 'all' | 'teachers' | 'parents';
  date: string;
  authorName: string;
  authorRole?: 'director' | 'teacher';
  shift?: 'morning' | 'evening';
}

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: 'director' | 'teacher' | 'parent';
  receiverId: string;
  receiverName: string;
  receiverRole: 'director' | 'teacher' | 'parent';
  content: string;
  date: string;
  read: boolean;
  studentId?: string; // If message is related to a specific student
  shift?: 'morning' | 'evening';
  category?: string;
  gradeReportData?: any;
}

export interface AbsenceExcuse {
  id: string;
  studentId: string;
  studentName: string;
  parentId: string;
  parentName: string;
  date: string; // The date of absence
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  notes?: string;
  shift?: 'morning' | 'evening';
}

export interface SentGradeSheetStudentSummary {
  studentId: string;
  studentName: string;
  unifiedNo?: string;
  rollNo?: string;
  parentId: string;
  parentName: string;
  parentPhone?: string;
  average: string;
  estimation: string;
  scores: { subject: string; score: number | null; maxScore: number }[];
  teacherNotes?: string;
  directorNotes?: string;
}

export interface SentGradeSheet {
  id: string;
  title: string;
  month: string;
  classId: string;
  className: string;
  cohort?: string;
  dateSent: string;
  sentBy: string;
  studentCount: number;
  studentsSummary: SentGradeSheetStudentSummary[];
}

export interface ExamHeaderConfig {
  ministryText?: string;
  schoolName?: string;
  examTitle: string;
  academicYear?: string;
  subject: string;
  className: string;
  examDate?: string;
  duration?: string;
  totalMarks?: string;
  teacherName: string;
  instructions?: string;
  customFields?: { label: string; value: string }[];
}

export interface ExamQuestionPaper {
  id: string;
  title: string;
  teacherId: string;
  teacherName: string;
  subject: string;
  classId: string;
  className: string;
  dateCreated: string;
  dateUpdated?: string;
  headerConfig: ExamHeaderConfig;
  showHeader?: boolean;
  showFooter?: boolean;
  contentHtml: string;
  status: 'draft' | 'submitted' | 'approved' | 'revision_requested';
  directorNotes?: string;
  shift?: 'morning' | 'evening';
}

