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
  nationalId?: string;
  fatherName?: string;
  motherName?: string;
  motherMaidenName?: string;
  grandfatherName?: string;
  birthPlace?: string;
  residencePlace?: string;
  address?: string;
  previousSchool?: string;
  healthStatus?: string;
  transportation?: string;
  booksStatus?: string;
  uniformStatus?: string;
  parentPhone?: string;
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
