/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Teacher, Student, Parent, Class, Attendance, Grade, Announcement, Message, AbsenceExcuse } from './types';

import seedData from './seedData.json';

export const INITIAL_CLASSES: Class[] = (seedData.classes || []) as Class[];

export const INITIAL_TEACHERS: Teacher[] = (seedData.teachers || []) as Teacher[];

export const INITIAL_PARENTS: Parent[] = (seedData.parents || []) as Parent[];

export const INITIAL_STUDENTS: Student[] = (seedData.students || []) as Student[];

export const INITIAL_ATTENDANCE: Attendance[] = [];

export const INITIAL_GRADES: Grade[] = [];

export const INITIAL_ANNOUNCEMENTS: Announcement[] = [];

export const INITIAL_MESSAGES: Message[] = [];

export const INITIAL_EXCUSES: AbsenceExcuse[] = [];
