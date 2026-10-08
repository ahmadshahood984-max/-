with open('src/components/ParentPortal.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
i = 0
while i < len(lines):
    line = lines[i]

    # 1. Add Excel export button next to Download as Image
    if 'title="حفظ الشهادة كصورة على جهازك"' in line and '                                  >' in lines[i+1]:
        new_lines.append(line)
        new_lines.append(lines[i+1]) # >
        new_lines.append(lines[i+2]) # Download icon
        new_lines.append(lines[i+3]) # span
        new_lines.append(lines[i+4]) # </button>
        # Add Excel button
        new_lines.append('\n')
        new_lines.append('                                  {/* Export Excel Button */}\n')
        new_lines.append('                                  <button\n')
        new_lines.append('                                    type="button"\n')
        new_lines.append('                                    onClick={() => handleExportStudentGradesExcel(activeChild?.name || "الطالب", activeChildClass?.name || "", targetMonth, gradeValues, avg, estimation)}\n')
        new_lines.append('                                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-2.5 py-1.5 rounded-xl transition flex items-center gap-1 border border-emerald-400/40 shadow-xs cursor-pointer"\n')
        new_lines.append('                                    title="تصدير كشف درجات الطالب إلى Excel"\n')
        new_lines.append('                                  >\n')
        new_lines.append('                                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-200" />\n')
        new_lines.append('                                    <span>تصدير إكسل</span>\n')
        new_lines.append('                                  </button>\n')
        i += 5
        continue

    # 2. Add selector strip and update badge above table
    if '<span>📊 جدول رصد درجات المواد والمستوى التحصيلي:</span>' in line:
        # Prepend selector strip before the h4 container
        strip_code = '''                              {/* Interactive Grade Scale Selector Strip */}
                              <div className="no-print bg-gradient-to-r from-slate-50 via-indigo-50/50 to-slate-50 p-2.5 sm:p-3 rounded-2xl border border-indigo-150 flex flex-wrap items-center justify-between gap-3 text-xs mb-3 shadow-2xs">
                                <div className="flex items-center gap-2 text-indigo-950 font-black">
                                  <span>⚙️ مقياس درجات التقييم بالكشف:</span>
                                  <span className="text-[10px] text-slate-500 font-semibold hidden sm:inline">(يمكن اختيار محدد أو غير محدد)</span>
                                </div>

                                <div className="flex flex-wrap items-center gap-2.5">
                                  {/* Max Grade Selector */}
                                  <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-xl border border-slate-200 shadow-2xs">
                                    <span className="text-[11px] font-bold text-slate-600">الدرجة العظمى:</span>
                                    <select
                                      value={maxGradeChoice}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setMaxGradeChoice(val);
                                        localStorage.setItem('school_parent_max_grade_choice', val);
                                      }}
                                      className="text-xs font-black text-indigo-700 bg-transparent focus:outline-none cursor-pointer"
                                    >
                                      <option value="100">100 (افتراضي)</option>
                                      <option value="unspecified">✨ غير محدد (مفتوح)</option>
                                      <option value="50">50</option>
                                      <option value="20">20</option>
                                      <option value="custom">قيمة مخصصة...</option>
                                    </select>
                                    {maxGradeChoice === 'custom' && (
                                      <input
                                        type="number"
                                        value={customMaxGrade}
                                        onChange={(e) => {
                                          setCustomMaxGrade(e.target.value);
                                          localStorage.setItem('school_parent_custom_max_grade', e.target.value);
                                        }}
                                        className="w-14 text-center border border-indigo-200 rounded-lg px-1 py-0.5 text-xs font-bold"
                                        placeholder="مثال 60"
                                      />
                                    )}
                                  </div>

                                  {/* Pass Grade Selector */}
                                  <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-xl border border-slate-200 shadow-2xs">
                                    <span className="text-[11px] font-bold text-slate-600">درجة النجاح:</span>
                                    <select
                                      value={passGradeChoice}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setPassGradeChoice(val);
                                        localStorage.setItem('school_parent_pass_grade_choice', val);
                                      }}
                                      className="text-xs font-black text-emerald-700 bg-transparent focus:outline-none cursor-pointer"
                                    >
                                      <option value="50">50 (افتراضي)</option>
                                      <option value="unspecified">✨ غير محدد (مفتوح)</option>
                                      <option value="25">25</option>
                                      <option value="10">10</option>
                                      <option value="custom">قيمة مخصصة...</option>
                                    </select>
                                    {passGradeChoice === 'custom' && (
                                      <input
                                        type="number"
                                        value={customPassGrade}
                                        onChange={(e) => {
                                          setCustomPassGrade(e.target.value);
                                          localStorage.setItem('school_parent_custom_pass_grade', e.target.value);
                                        }}
                                        className="w-14 text-center border border-emerald-200 rounded-lg px-1 py-0.5 text-xs font-bold"
                                        placeholder="مثال 25"
                                      />
                                    )}
                                  </div>

                                  {/* Export Cohort Names */}
                                  <button
                                    type="button"
                                    onClick={() => handleExportCohortStudentsExcel(activeChildClass?.name || '')}
                                    className="text-[11px] text-slate-700 hover:text-indigo-700 font-bold bg-white px-2.5 py-1 rounded-xl border border-slate-200 shadow-2xs transition flex items-center gap-1 cursor-pointer"
                                    title="تصدير قائمة أسماء طلاب الصف والفوج إلى ملف Excel"
                                  >
                                    <span>👥 تصدير أسماء الفوج</span>
                                  </button>
                                </div>
                              </div>
'''
        # Replace lines in new_lines that opened the table container
        new_lines.append(strip_code)
        new_lines.append(line)
        i += 1
        continue

    if 'الدرجة العظمى: 100 • الصغرى للنجاح: 50' in line:
        new_lines.append('                                  <span className="text-[10px] text-slate-600 font-bold bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200 shadow-2xs">\n')
        new_lines.append('                                    الدرجة العظمى: <strong className="text-indigo-950 font-black">{displayMaxGrade}</strong> • الصغرى للنجاح: <strong className="text-emerald-950 font-black">{displayPassGrade}</strong>\n')
        new_lines.append('                                  </span>\n')
        # Skip the original lines for the badge
        if '</span>' in lines[i+1]:
            i += 2
        else:
            i += 1
        continue

    # 3. Update table row cells
    if '<td className="p-3 font-mono text-slate-500 font-bold">100</td>' in line:
        row_cells = '''                                            <td className="p-3 font-mono font-bold">
                                              {maxGradeChoice === 'unspecified' ? (
                                                <span className="text-slate-500 font-semibold text-[11px] bg-slate-100 px-2 py-0.5 rounded-md">غير محدد</span>
                                              ) : (
                                                <span className="text-slate-600">{displayMaxGrade}</span>
                                              )}
                                            </td>
                                            <td className="p-3 font-mono font-bold">
                                              {passGradeChoice === 'unspecified' ? (
                                                <span className="text-slate-500 font-semibold text-[11px] bg-slate-100 px-2 py-0.5 rounded-md">غير محدد</span>
                                              ) : (
                                                <span className="text-slate-600">{displayPassGrade}</span>
                                              )}
                                            </td>
'''
        new_lines.append(row_cells)
        # Skip 100 line and next 50 line
        i += 2
        continue

    # 4. Update total score denominator
    if '/ {gradeValues.length * 100}' in line:
        new_lines.append('                                      {numericMaxGrade ? (\n')
        new_lines.append('                                        <span className="text-xs text-slate-400 font-normal mr-1">/ {gradeValues.length * numericMaxGrade}</span>\n')
        new_lines.append('                                      ) : (\n')
        new_lines.append('                                        <span className="text-xs text-slate-400 font-semibold mr-1.5">(غير محدد)</span>\n')
        new_lines.append('                                      )}\n')
        i += 1
        continue

    new_lines.append(line)
    i += 1

with open('src/components/ParentPortal.tsx', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print('Updated ParentPortal.tsx successfully!')
