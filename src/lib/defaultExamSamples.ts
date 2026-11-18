/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExamQuestionPaper } from '../types';

export const getDefaultExamSamples = (): ExamQuestionPaper[] => [
  {
    id: 'exam_sample_1',
    title: 'أسئلة مذاكرة اللغة العربية - الفصل الأول',
    teacherId: 't1',
    teacherName: 'أحمد العلي',
    subject: 'اللغة العربية',
    classId: 'c1',
    className: 'الصف الأول - الشعبة (أ)',
    dateCreated: new Date(Date.now() - 86400000 * 2).toISOString(),
    status: 'submitted',
    headerConfig: {
      ministryText: 'الجمهورية العربية السورية - وزارة التربية',
      schoolName: 'المدرسة الدولية الخاصة',
      examTitle: 'أسئلة مذاكرة مادة اللغة العربية',
      academicYear: '2025 - 2026 م',
      subject: 'اللغة العربية',
      className: 'الصف الأول - الشعبة (أ)',
      examDate: '2026-10-25',
      duration: 'ساعة ونصف (90 دقيقة)',
      totalMarks: '100 درجة',
      teacherName: 'أحمد العلي',
      instructions: 'أجب عن جميع الأسئلة الآتية بخط واضح ومرتب. اقرأ كل سؤال بعناية.',
      customFields: [
        { label: 'رقم النموذج', value: 'نموذج (أ)' },
        { label: 'الفصل الدراسي', value: 'الفصل الأول' }
      ]
    },
    contentHtml: `
      <div class="question-block" style="margin-bottom: 24px;">
        <p style="font-weight: bold; font-size: 17px; color: #0f172a; margin-bottom: 8px;">
          <span>السؤال الأول: القراءة وفهم المقروء:</span>
          <span style="float: left; color: #4338ca; font-size: 14px;">[ 25 علامة ]</span>
        </p>
        <p style="font-size: 15px; line-height: 1.8; margin-right: 12px; background-color: #f8fafc; padding: 10px; border-radius: 8px; border: 1px solid #e2e8f0;">
          «الوطن هو الأرض التي نعيش عليها، ونستنشق هواءها، ونأكل من خيراتها. وواجبنا نحوه أن نحميه ونسعى لرفعته وتطوره بالعلم والعمل الصالح.»
        </p>
        <ol style="font-size: 14px; line-height: 2; margin-right: 14px;">
          <li>ما هو واجبنا تجاه الوطن كما ورد في النص السابق؟ ....................................................................................</li>
          <li>استخرج من النص السابق: اسماً مجروراً، وكلمة تبدأ بهمزة وصل: ............................................................</li>
        </ol>
      </div>

      <div class="question-block" style="margin-bottom: 24px;">
        <p style="font-weight: bold; font-size: 17px; color: #0f172a; margin-bottom: 8px;">
          <span>السؤال الثاني: القواعد اللغوية والإعراب:</span>
          <span style="float: left; color: #4338ca; font-size: 14px;">[ 25 علامة ]</span>
        </p>
        <p style="font-size: 15px; line-height: 2; margin-right: 12px;">
          أعرب الكلمات التي تحتها خط في الجملة الآتية: <strong>«كَتَبَ <u>الطالبُ</u> <u>الدَّرْسَ</u> بإتقانٍ»</strong>.<br>
          • <strong>الطالبُ:</strong> ................................................................................................................................................<br>
          • <strong>الدَّرْسَ:</strong> ................................................................................................................................................
        </p>
      </div>

      <div class="question-block" style="margin-bottom: 24px;">
        <p style="font-weight: bold; font-size: 17px; color: #0f172a; margin-bottom: 8px;">
          <span>السؤال الثالث: ضع إشارة ( ✓ ) أو ( ✗ ) أمام العبارات الآتية:</span>
          <span style="float: left; color: #4338ca; font-size: 14px;">[ 25 علامة ]</span>
        </p>
        <ol style="font-size: 15px; line-height: 2; margin-right: 14px;">
          <li>الفعل المضارع يبدأ دائماً بأحد حروف كلمة (نأتي) .................................................... ( &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; )</li>
          <li>المبتدأ والخبر يكونان دائماً في حالة نصب ................................................................ ( &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; )</li>
          <li>تكتب التاء المربوطة في أواخر الأسماء المفردة المؤنثة .................................................. ( &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; )</li>
        </ol>
      </div>

      <div class="question-block" style="margin-bottom: 24px;">
        <p style="font-weight: bold; font-size: 17px; color: #0f172a; margin-bottom: 8px;">
          <span>السؤال الرابع: التعبير الكتابي والإملاء:</span>
          <span style="float: left; color: #4338ca; font-size: 14px;">[ 25 علامة ]</span>
        </p>
        <p style="font-size: 15px; line-height: 1.8; margin-right: 12px;">
          اكتب فقرة لا تتجاوز خمسة أسطر تتحدث فيها عن <strong>أهمية القراءة والمطالعة في بناء العقل</strong>، مع مراعاة علامات الترقيم وصحة الإملاء.<br>
          ....................................................................................................................................................................................................................<br>
          ....................................................................................................................................................................................................................
        </p>
      </div>
    `
  },
  {
    id: 'exam_sample_2',
    title: 'اختبار مادة الرياضيات - المسائل والعمليات الحسابية',
    teacherId: 't2',
    teacherName: 'سارة الخطيب',
    subject: 'الرياضيات',
    classId: 'c2',
    className: 'الصف الثاني - الشعبة (أ)',
    dateCreated: new Date(Date.now() - 86400000).toISOString(),
    status: 'approved',
    headerConfig: {
      ministryText: 'الجمهورية العربية السورية - وزارة التربية',
      schoolName: 'المدرسة الدولية الخاصة',
      examTitle: 'اختبار مادة الرياضيات الشهري',
      academicYear: '2025 - 2026 م',
      subject: 'الرياضيات',
      className: 'الصف الثاني - الشعبة (أ)',
      examDate: '2026-10-28',
      duration: 'ساعة واحدة (60 دقيقة)',
      totalMarks: '100 درجة',
      teacherName: 'سارة الخطيب',
      instructions: 'يُمنع استخدام الآلة الحاسبة. أجب عن كافة العمليات الحسابية موضحاً خطوات الحل.',
      customFields: [
        { label: 'رقم القاعة', value: 'القاعة (3)' },
        { label: 'الفرع', value: 'العلمي الأساسي' }
      ]
    },
    contentHtml: `
      <div class="question-block" style="margin-bottom: 24px;">
        <p style="font-weight: bold; font-size: 17px; color: #0f172a; margin-bottom: 8px;">
          <span>السؤال الأول: اختر الإجابة الصحيحة لكل مما يأتي:</span>
          <span style="float: left; color: #4338ca; font-size: 14px;">[ 30 علامة ]</span>
        </p>
        <ol style="font-size: 15px; line-height: 2; margin-right: 14px;">
          <li>ناتج العملية الحسابية: ( 25 × 4 ) + 50 يساوي: &nbsp;&nbsp;&nbsp;&nbsp; [ 100 &nbsp;|&nbsp; 150 &nbsp;|&nbsp; 200 &nbsp;|&nbsp; 250 ]</li>
          <li>الكسر المكافئ للكسر 1/2 هو: &nbsp;&nbsp;&nbsp;&nbsp; [ 2/4 &nbsp;|&nbsp; 3/4 &nbsp;|&nbsp; 1/4 &nbsp;|&nbsp; 2/3 ]</li>
          <li>محيط المربع الذي طول ضلعه 5 سم يساوي: &nbsp;&nbsp;&nbsp;&nbsp; [ 10 سم &nbsp;|&nbsp; 15 سم &nbsp;|&nbsp; 20 سم &nbsp;|&nbsp; 25 سم ]</li>
        </ol>
      </div>

      <div class="question-block" style="margin-bottom: 24px;">
        <p style="font-weight: bold; font-size: 17px; color: #0f172a; margin-bottom: 8px;">
          <span>السؤال الثاني: أوجد ناتج العمليات الآتية مع كتابة الخطوات:</span>
          <span style="float: left; color: #4338ca; font-size: 14px;">[ 35 علامة ]</span>
        </p>
        <table style="width: 100%; border-collapse: collapse; border: 1px solid #1e293b; text-align: center; margin: 10px 0;" dir="rtl">
          <tr style="background-color: #f1f5f9;">
            <th style="border: 1px solid #1e293b; padding: 8px;">العملية الحسابية</th>
            <th style="border: 1px solid #1e293b; padding: 8px;">خطوات الحل والناتج</th>
          </tr>
          <tr>
            <td style="border: 1px solid #1e293b; padding: 12px; font-weight: bold; font-family: monospace; font-size: 16px;">1450 + 2350 = ?</td>
            <td style="border: 1px solid #1e293b; padding: 12px;">............................................................................................................</td>
          </tr>
          <tr>
            <td style="border: 1px solid #1e293b; padding: 12px; font-weight: bold; font-family: monospace; font-size: 16px;">560 ÷ 7 = ?</td>
            <td style="border: 1px solid #1e293b; padding: 12px;">............................................................................................................</td>
          </tr>
        </table>
      </div>

      <div class="question-block" style="margin-bottom: 24px;">
        <p style="font-weight: bold; font-size: 17px; color: #0f172a; margin-bottom: 8px;">
          <span>السؤال الثالث: مسألة لفظية تطبيقية:</span>
          <span style="float: left; color: #4338ca; font-size: 14px;">[ 35 علامة ]</span>
        </p>
        <p style="font-size: 15px; line-height: 1.8; margin-right: 12px;">
          «اشترى أحمد 4 كتب سعر الكتاب الواحد 250 ليرة، و3 دفاتر سعر الدفتر الواحد 100 ليرة. احسب المبلغ الإجمالي الذي دفعه للبائع؟»<br>
          <strong>الحل:</strong><br>
          ثمن الكتب: .......................................................................................................................................................................<br>
          ثمن الدفاتر: .......................................................................................................................................................................<br>
          المبلغ الإجمالي: .................................................................................................................................................................
        </p>
      </div>
    `
  }
];
