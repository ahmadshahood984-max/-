import { pgTable, text, serial, integer, doublePrecision, jsonb, timestamp } from 'drizzle-orm/pg-core';

export const parents = pgTable('parents', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  phone: text('phone'),
  nationalId: text('national_id'),
  childrenIds: jsonb('children_ids').$type<string[]>(),
  createdAt: timestamp('created_at').defaultNow()
});

export const students = pgTable('students', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  unifiedNo: text('unified_no'),
  rollNo: text('roll_no'),
  nationalId: text('national_id'),
  parentId: text('parent_id'),
  parentName: text('parent_name'),
  classId: text('class_id'),
  shift: text('shift'),
  createdAt: timestamp('created_at').defaultNow()
});

export const grades = pgTable('grades', {
  id: text('id').primaryKey(),
  studentId: text('student_id').notNull(),
  subject: text('subject').notNull(),
  score: doublePrecision('score').notNull(),
  maxScore: doublePrecision('max_score').default(100),
  examName: text('exam_name').notNull(),
  date: text('date'),
  createdAt: timestamp('created_at').defaultNow()
});

export const sentGradeSheets = pgTable('sent_grade_sheets', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  month: text('month').notNull(),
  className: text('class_name'),
  classId: text('class_id'),
  dateSent: text('date_sent'),
  studentCount: integer('student_count').default(0),
  studentsSummary: jsonb('students_summary').$type<any[]>(),
  createdAt: timestamp('created_at').defaultNow()
});

export const monthlyEvaluations = pgTable('monthly_evaluations', {
  id: text('id').primaryKey(),
  studentId: text('student_id').notNull(),
  month: text('month').notNull(),
  teacherText: text('teacher_text'),
  directorText: text('director_text'),
  createdAt: timestamp('created_at').defaultNow()
});
