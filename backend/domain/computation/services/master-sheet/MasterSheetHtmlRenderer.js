// MasterSheetHtmlRenderer.js
// PROFESSIONAL UNIVERSITY MASTER SHEET - ENHANCED VERSION

import config from "./MasterSheetConfig.js";

class MasterSheetHtmlRenderer {
  render({ summary, level, masterComputationId }) {
    const shortBatchId = masterComputationId ? masterComputationId.slice(-8) : 'N/A';
    const purpose = summary?.purpose || 'final';
    const isPreview = purpose === 'preview' || purpose === 'simulation' || summary?.isPreview === true;

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>MASTER SHEET – ${level} LEVEL</title>
  <style>
    /* ================= BASE PRINT STYLING ================= */
    @page {
      size: A4 landscape;
      margin: 10mm 15mm 15mm 15mm;
    }
    
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      font-family: "Times New Roman", serif;
      font-size: 12pt;
      line-height: 1.3;
      color: #000;
      -webkit-print-color-adjust: exact;
      margin: 0;
      padding: 0;
      background-color: #fff;
      position: relative;
    }
    
    /* ================= WATERMARK ================= */
    .watermark {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 1000;
      opacity: 0.15;
    }
    
.preview-watermark {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300' viewBox='0 0 400 300'%3E%3Ctext x='50%25' y='50%25' font-family='Arial' font-size='40' font-weight='bold' fill='%23ff0000' text-anchor='middle' dominant-baseline='middle' transform='rotate(-45 200 150)'%3EPREVIEW%3C/text%3E%3Ctext x='50%25' y='60%25' font-family='Arial' font-size='20' fill='%23ff0000' text-anchor='middle' dominant-baseline='middle' transform='rotate(-45 200 150)'%3ENOT FOR OFFICIAL USE%3C/text%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: center;
  background-size: 60% auto;
}

.final-watermark {
  background-image: url('${config.logoUrl || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxjaXJjbGUgY3g9IjUwIiBjeT0iNTAiIHI9IjQ1IiBzdHJva2U9IiMwMDAiIHN0cm9rZS13aWR0aD0iMiIvPgo8dGV4dCB4PSI1MCIgeT0iNTUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iIzAwMCI+VU5JVkVSU0lUWTwvdGV4dD4KPC9zdmc+'}');
  background-repeat: no-repeat;
  background-position: center;
  background-size: 200px 200px;
}
    
    /* ================= MASTER TABLE CONTAINER ================= */
    .master-container {
      width: 100%;
      position: relative;
      z-index: 1;
    }
    
    /* ================= SECTION DIVIDERS ================= */
    .section-divider {
      height: 10mm;
      page-break-before: always;
    }
    
    .section-divider:first-child {
      page-break-before: auto;
    }
    
    /* ================= MASTER TABLE ================= */
    .master-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    
    /* ================= HEADER ROW (Repeats on each page) ================= */
    .header-row {
      page-break-before: always;
      page-break-after: avoid;
      page-break-inside: avoid;
    }
    
    .header-cell {
      padding: 4mm 0 3mm 0;
      border-bottom: 1.5pt solid #000;
      text-align: cente;
      vertical-align: top;
    }
    
    .header-content {
      position: relative;
      min-height: 25mm;
    }
    
    .header-logo-container {
      position: absolute;
      left: 0;
      top: 0;
      width: 25mm;
      height: 25mm;
    }
    
    .header-logo {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
    
    .header-text-container {
      margin: 0 30mm;
    }
    
    .header-institution {
      font-size: 14pt;
      font-weight: bold;
      text-transform: uppercase;
      margin-bottom: 1mm;
    }
    
    .header-faculty {
      font-size: 12pt;
      font-weight: bold;
      margin-bottom: 1mm;
    }
    
    .header-programme {
      font-size: 11pt;
      margin-bottom: 1mm;
    }
    
    .header-session {
      font-size: 11pt;
      font-weight: bold;
      text-transform: uppercase;
      margin-bottom: 1mm;
    }
    
    .header-level {
      font-size: 10pt;
      font-weight: bold;
    }
    
    .header-meta {
      position: absolute;
      right: 0;
      top: 0;
      font-size: 9pt;
      text-align: right;
      line-height: 1.2;
    }
    
    /* ================= CONTENT SECTIONS ================= */
    .section-title-row {
      height: 8mm;
      page-break-after: avoid;
      page-break-inside: avoid;
    }
    
    .section-title-cell {
      padding: 2mm 0 1mm 0;
      text-align: left;
      vertical-align: bottom;
      border-bottom: 0.75pt solid #000;
    }
    
    .section-title {
      font-size: 12pt;
      font-weight: bold;
      text-transform: uppercase;
    }
    
    .section-subtitle {
      font-size: 10pt;
      font-style: italic;
      margin: 2mm 0;
      text-align: left;
    }
    
    /* ================= DATA TABLES ================= */
    .data-table {
      width: 100%;
      border-collapse: collapse;
      margin: 3mm 0 5mm 0;
      font-size: 10pt;
      table-layout: fixed;
    }
    
    .data-table th {
      font-weight: bold;
      text-align: left;
      vertical-align: middle;
      padding: 2mm 1.5mm;
      border: 0.75pt solid #000;
      font-size: 9pt;
      background-color: #fff;
    }
    
    .data-table td {
      padding: 1.5mm 1.5mm;
      border: 0.75pt solid #000;
      text-align: left;
      vertical-align: middle;
      min-height: 6mm;
    }
    
    .data-table thead {
      display: table-header-group;
    }
    
    .table-margin {
      margin-bottom: 8mm;
    }
    
    /* ================= COURSE HEADER TABLE ================= */
    .course-header-table {
      width: 100%;
      border-collapse: collapse;
      margin: 3mm 0 5mm 0;
      font-size: 9pt;
      table-layout: fixed;
    }
    
    .course-header-table th {
      font-weight: bold;
      text-align: cente;
      vertical-align: middle;
      padding: 1mm;
      border: 0.75pt solid #000;
    }
    
    .course-header-table .course-code {
      border-bottom: none;
    }
    
    .course-header-table .course-title {
      border-top: none;
      font-weight: normal;
      font-size: 8pt;
      font-style: italic;
    }
    
    /* ================= UTILITY CLASSES ================= */
    .text-left {
      text-align: left;
      padding-left: 1.5mm;
    }
    
    .text-cente {
      text-align: cente;
    }
    
    .text-right {
      text-align: right;
    }
    
    .text-bold {
      font-weight: bold;
    }
    
    .numeric {
      font-family: "Courier New", monospace;
      text-align: right;
      padding-right: 1.5mm;
    }
    
    .compact {
      font-size: 9pt;
    }
    
    .no-data {
      color: #666;
      font-style: italic;
      text-align: cente;
      padding: 4mm;
    }
    
    /* ================= SUMMARY AND SIGNATURES CONTAINER ================= */
    .summary-signatures-container {
      margin-top: 5mm;
    }
    
    .summary-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 10mm;
    }
    
    .summary-table td {
      padding: 2mm 1.5mm;
      border: 0.75pt solid #000;
      text-align: left;
    }
    
    .summary-table .numeric {
      text-align: right;
      padding-right: 1.5mm;
    }
    
    /* ================= SIGNATURES ================= */
    .signatures-container {
      display: flex;
      justify-content: space-between;
      margin-top: 15mm;
    }
    
    .signature-block {
      width: 45%;
      text-align: cente;
    }
    
    .signature-line {
      border-top: 0.75pt solid #000;
      width: 70mm;
      margin: 0 auto;
      height: 10mm;
    }
    
    .signature-name {
      font-weight: bold;
      margin-top: 2mm;
    }
    
    .signature-title {
      font-size: 9pt;
      margin-top: 1mm;
    }
    
    /* ================= KEY TO COURSES TABLE ================= */
    .key-table {
      width: 100%;
      border-collapse: collapse;
      margin: 3mm 0 5mm 0;
      font-size: 10pt;
    }
    
    .key-table th {
      font-weight: bold;
      text-align: left;
      vertical-align: middle;
      padding: 1.5mm 1.5mm;
      border-bottom: 1pt solid #000;
      border-top: none;
      border-left: none;
      border-right: none;
      font-size: 10pt;
      text-decoration: underline;
    }
    
    .key-table td {
      padding: 1.5mm 1.5mm;
      border: none;
      text-align: left;
      vertical-align: middle;
    }
    
    .key-table tr:last-child td {
      border-bottom: none;
    }
    
    /* ================= FOOTER ================= */
    .footer-row {
      height: 6mm;
      page-break-inside: avoid;
      margin-top: 5mm;
    }
    
    .footer-cell {
      padding-top: 3mm;
      border-top: 0.5pt solid #ccc;
      font-size: 8pt;
      text-align: cente;
      vertical-align: top;
    }
    
    /* ================= PAGE BREAK CONTROL ================= */
    .force-page-break {
      page-break-before: always;
    }
    
    .avoid-break {
      page-break-inside: avoid;
    }
    
    /* ================= PRINT OPTIMIZATION ================= */
    @media print {
      /* Ensure tables break properly */
      tr {
        page-break-inside: avoid;
        page-break-after: auto;
      }
      
      /* Force header to repeat */
      .header-row {
        display: table-header-group;
      }
      
      .data-table {
        page-break-inside: auto;
      }
      
      .data-table tr {
        page-break-inside: avoid;
        page-break-after: auto;
      }
      
      /* Ensure watermark prints on all pages */
      .watermark {
        position: fixed;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
    
    /* ================= EMPTY CELL STYLING ================= */
    .empty-cell {
      color: #666;
      font-style: italic;
    }
    
    .list-nil {
      color: #666;
      font-style: italic;
      text-align: cente;
      padding: 2mm;
      border: 0.75pt solid #000;
    }
  </style>
</head>
<body>
  ${isPreview ? '<div class="watermark preview-watermark"></div>' : '<div class="watermark final-watermark"></div>'}

<table class="master-table">
  ${this.renderHeaderRow(1, summary, level, shortBatchId, isPreview)}
  
  ${this.renderStudentLists(summary, level)}
  
  ${this.renderCoursesTillOutstanding(summary, level)}
  
  ${this.renderMMS1(summary, level)}
  
  ${this.renderMMS2(summary, level)}
  
  ${this.renderSummaryAndSignatures(summary, level)}
  
  ${this.renderKeyToCourses(summary, level)}
  
  ${this.renderFooter(masterComputationId)}
</table>

</body>
</html>`;
  }

  /* ================= HEADER ROW (Will repeat on each printed page) ================= */
  renderHeaderRow(pageNum, summary, level, shortBatchId, isPreview = false) {
    const purposeText = isPreview ? "PREVIEW - NOT FOR OFFICIAL USE" : "OFFICIAL";

    return `
  <thead class="header-row">
    <tr>
      <td class="header-cell">
        <div class="header-content">
          <div class="header-logo-container">
            <img src="${config.logoUrl || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxjaXJjbGUgY3g9IjUwIiBjeT0iNTAiIHI9IjQ1IiBzdHJva2U9IiMwMDAiIHN0cm9rZS13aWR0aD0iMiIvPgo8dGV4dCB4PSI1MCIgeT0iNTUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iIzAwMCI+VU5JVkVSU0lUWTwvdGV4dD4KPC9zdmc+'}" 
                 alt="University Logo" class="header-logo" />
          </div>
          
          <div class="header-text-container">
            <div class="header-institution">${config.institution}</div>
            <div class="header-faculty">${config.faculty}</div>
            <div class="header-programme">${config.programmePrefix} ${summary.department.name}</div>
            <div class="header-session">${summary.semester.name.toUpperCase()} EXAMINATION</div>
            <div class="header-level">${level} LEVEL MASTER SHEET</div>
            ${isPreview ? `<div class="header-level" style="color: red; font-style: italic;">${purposeText}</div>` : ''}
          </div>
          
          <div class="header-meta">
            <div>Batch: ${shortBatchId}</div>
            <div>Page ${pageNum}</div>
            ${isPreview ? '<div style="color: red; font-weight: bold;">PREVIEW</div>' : ''}
          </div>
        </div>
      </td>
    </tr>
  </thead>`;
  }

  /* ================= STUDENT LISTS (First Section) ================= */
  renderStudentLists(summary, level) {
    const lists = summary.studentListsByLevel[level];

    return `
  <tbody>
    <!-- Section Title -->
    <tr class="section-title-row">
      <td class="section-title-cell">
        <div class="section-title">STUDENT LISTS</div>
      </td>
    </tr>
    
    <!-- Content -->
    <tr>
      <td>
        ${this.renderPassListWithCourses(lists?.passList, summary, level)}
        ${this.renderTerminationListWithCourses(lists?.terminationList, summary, level)}
        ${this.renderProbationListWithCourses(lists?.probationList, summary, level)}
        ${this.renderWithdrawalListWithCourses(lists?.withdrawalList, summary, level)}
      </td>
    </tr>
  </tbody>`;
  }

  renderPassListWithCourses(list = [], summary, level) {
    if (!list || list.length === 0) {
      return `
        <div class="table-margin">
          <div class="section-subtitle">PASS LIST</div>
          <div class="list-nil">NIL</div>
        </div>`;
    }

    const rowsHTML = list.map((s, i) => {
      const studentData = this.getStudentData(s.studentId?.$oid || s.studentId, summary, level);
      const degreeClass = s.gpa ? this.getDegreeClass(s.gpa) : '-';
      const failedCourses = studentData?.courseResults?.filter(cr => cr.status === 'failed') || [];

      return `
        <tr>
          <td class="numeric">${i + 1}</td>
          <td class="text-bold text-left">${s.matricNumber || '-'}</td>
          <td class="text-left">${s.name || '-'}</td>
          <td class="numeric text-bold">${s.gpa ? s.gpa.toFixed(2) : '-'}</td>
          <td class="text-left">${degreeClass}</td>
        </tr>
      `;
    }).join('');

    return `
        <div class="table-margin">
          <div class="section-subtitle">PASS LIST</div>
          <table class="data-table">
            <thead>
              <tr>
                <th width="5%">S/N</th>
                <th width="18%">MATRIC NO.</th>
                <th width="35%">NAME</th>
                <th width="10%">GPA</th>
                <th width="15%">CLASS</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHTML}
            </tbody>
          </table>
        </div>`;
  }

  renderTerminationListWithCourses(list = [], summary, level) {
    if (!list || list.length === 0) {
      return `
        <div class="table-margin">
          <div class="section-subtitle">TERMINATION LIST</div>
          <div class="list-nil">NIL</div>
        </div>`;
    }

    const rowsHTML = list.map((s, i) => {
      const studentData = this.getStudentData(s.studentId?.$oid || s.studentId, summary, level);
      const failedCourses = studentData?.courseResults?.filter(cr => cr.status === 'failed') || [];

      return `
      <tr>
        <td class="numeric">${i + 1}</td>
        <td class="text-bold text-left">${s.matricNumber || '-'}</td>
        <td class="text-left">${s.name || '-'}</td>
        <td class="text-left">${s.remarks || s.reason || '-'}</td>
        <td class="text-left">${failedCourses.length > 0 ? failedCourses.map(c => c.courseCode).join(', ') : 'None'}</td>
      </tr>
    `}).join('');

    return `
        <div class="table-margin">
          <div class="section-subtitle">TERMINATION LIST</div>
          <table class="data-table">
            <thead>
              <tr>
                <th width="5%">S/N</th>
                <th width="18%">MATRIC NO.</th>
                <th width="30%">NAME</th>
                <th width="27%">REMARKS</th>
                <th width="20%">FAILED COURSES</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHTML}
            </tbody>
          </table>
        </div>`;
  }

  renderProbationListWithCourses(list = [], summary, level) {
    if (!list || list.length === 0) {
      return `
        <div class="table-margin">
          <div class="section-subtitle">PROBATION LIST</div>
          <div class="list-nil">NIL</div>
        </div>`;
    }

    const rowsHTML = list.map((s, i) => {
      const studentData = this.getStudentData(s.studentId?.$oid || s.studentId, summary, level);
      const failedCourses = studentData?.courseResults?.filter(cr => cr.status === 'failed') || [];

      return `
      <tr>
        <td class="numeric">${i + 1}</td>
        <td class="text-bold text-left">${s.matricNumber || '-'}</td>
        <td class="text-left">${s.name || '-'}</td>
        <td class="text-left">${s.remarks || s.reason || '-'}</td>
        <td class="text-left">${failedCourses.length > 0 ? failedCourses.map(c => c.courseCode).join(', ') : 'None'}</td>
      </tr>
    `}).join('');

    return `
        <div class="table-margin">
          <div class="section-subtitle">PROBATION LIST</div>
          <table class="data-table">
            <thead>
              <tr>
                <th width="5%">S/N</th>
                <th width="18%">MATRIC NO.</th>
                <th width="30%">NAME</th>
                <th width="27%">REMARKS</th>
                <th width="20%">FAILED COURSES</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHTML}
            </tbody>
          </table>
        </div>`;
  }

  renderWithdrawalListWithCourses(list = [], summary, level) {
    if (!list || list.length === 0) {
      return `
        <div class="table-margin">
          <div class="section-subtitle">WITHDRAWAL LIST</div>
          <div class="list-nil">NIL</div>
        </div>`;
    }

    const rowsHTML = list.map((s, i) => {
      const studentData = this.getStudentData(s.studentId?.$oid || s.studentId, summary, level);
      const failedCourses = studentData?.courseResults?.filter(cr => cr.status === 'failed') || [];

      return `
      <tr>
        <td class="numeric">${i + 1}</td>
        <td class="text-bold text-left">${s.matricNumber || '-'}</td>
        <td class="text-left">${s.name || '-'}</td>
        <td class="text-left">${s.remarks || s.reason || '-'}</td>
        <td class="text-left">${failedCourses.length > 0 ? failedCourses.map(c => c.courseCode).join(', ') : 'None'}</td>
      </tr>
    `}).join('');

    return `
        <div class="table-margin">
          <div class="section-subtitle">WITHDRAWAL LIST</div>
          <table class="data-table">
            <thead>
              <tr>
                <th width="5%">S/N</th>
                <th width="18%">MATRIC NO.</th>
                <th width="30%">NAME</th>
                <th width="27%">REMARKS</th>
                <th width="20%">FAILED COURSES</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHTML}
            </tbody>
          </table>
        </div>`;
  }

  /* ================= COURSES TILL OUTSTANDING ================= */
  renderCoursesTillOutstanding(summary, level) {
    const students = summary.studentSummariesByLevel[level] || [];
    const csoStudents = students.filter(s => s.outstandingCourses && s.outstandingCourses.length > 0);

    if (csoStudents.length === 0) {
      return this.renderEmptySection("COURSES TILL OUTSTANDING (CSO)", "No students with outstanding courses");
    }

    const rowsHTML = csoStudents.map((s, i) => {
      const outstandingCourses = s.outstandingCourses || [];
      const courseList = outstandingCourses.map(oc => oc.courseCode || oc.courseId?.courseCode || 'N/A').join(', ');

      return `
      <tr>
        <td class="numeric">${i + 1}</td>
        <td class="text-bold text-left">${s.matricNumber || '-'}</td>
        <td class="text-left">${s.name || '-'}</td>
        <td class="text-left">${courseList || '-'}</td>
      </tr>
    `}).join('');

    return `
  <tbody>
    <!-- Section Title -->
    <tr class="section-title-row">
      <td class="section-title-cell">
        <div class="section-title">COURSES TILL OUTSTANDING (CSO)</div>
      </td>
    </tr>
    
    <!-- Content -->
    <tr>
      <td>
        <table class="data-table table-margin">
          <thead>
            <tr>
              <th width="5%">S/N</th>
              <th width="25%">MATRIC NO.</th>
              <th width="40%">NAME</th>
              <th width="30%">OUTSTANDING COURSES</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHTML}
          </tbody>
        </table>
      </td>
    </tr>
  </tbody>`;
  }

  /* ================= MMS I ================= */
  renderMMS1(summary, level) {
    const students = summary.studentSummariesByLevel[level] || [];
    if (students.length === 0) return this.renderEmptySection("MASTER MARK SHEET I", "No student data available");

    const courseResults = students[0]?.courseResults || [];

    // Create course header with two rows
    const courseHeaderHTML = this.renderCourseHeader(courseResults);

    const studentsHTML = students.map((s, i) => {
      const courseCells = courseResults.map(r => {
        const score = r.score ? `${r.score}` : '-';
        const grade = r.grade ? `(${r.grade})` : '';
        return `<td class="numeric">${score}${grade}</td>`;
      }).join('');

      return `
      <tr>
        <td class="numeric">${i + 1}</td>
        <td class="text-bold text-left">${s.matricNumber || '-'}</td>
        ${courseCells}
        <td class="numeric text-bold">${s.currentSemester?.tcp || '-'}</td>
        <td class="numeric">${s.currentSemester?.tnu || '-'}</td>
        <td class="numeric text-bold">${s.currentSemester?.gpa ? s.currentSemester.gpa.toFixed(2) : '-'}</td>
      </tr>`;
    }).join('');

    const courseColspan = courseResults.length;
    const courseWidth = Math.max(6, Math.floor(70 / courseResults.length));

    return `
  <tbody>
    <!-- Section Title -->
    <tr class="section-title-row">
      <td class="section-title-cell">
        <div class="section-title">MASTER MARK SHEET I</div>
      </td>
    </tr>
    
    <!-- Content -->
    <tr>
      <td>
        <table class="data-table table-margin">
          <thead>
            <tr>
              <th rowspan="2" width="4%">S/N</th>
              <th rowspan="2" width="12%">MATRIC NO.</th>
              <th colspan="${courseColspan}" width="${courseColspan * courseWidth}%">Courses</th>
              <th rowspan="2" width="6%">TCP</th>
              <th rowspan="2" width="6%">TNU</th>
              <th rowspan="2" width="6%">GPA</th>
            </tr>
            ${courseHeaderHTML}
          </thead>
          <tbody>
            ${studentsHTML}
          </tbody>
        </table>
      </td>
    </tr>
  </tbody>`;
  }

  renderCourseHeader(courses = []) {
    if (courses.length === 0) return '';

    const courseCells = courses.map(course => {
      const courseCode = course.courseCode || 'N/A';
      const courseTitle = course.courseTitle || course.title || '';
      return `
        <th width="${Math.floor(100 / courses.length)}%" class="compact">
          <div>${courseCode}</div>
          <div style="font-size: 7pt; font-weight: normal; font-style: italic; margin-top: 0.5mm;">${courseTitle.substring(0, 15)}${courseTitle.length > 15 ? '...' : ''}</div>
        </th>
      `;
    }).join('');

    return `<tr>${courseCells}</tr>`;
  }

  /* ================= MMS II ================= */
  renderMMS2(summary, level) {
    const students = summary.studentSummariesByLevel[level] || [];
    if (students.length === 0) return this.renderEmptySection("MASTER MARK SHEET II", "No student data available");

    const studentsHTML = students.map((s, i) => `
      <tr>
        <td class="numeric">${i + 1}</td>
        <td class="text-bold text-left">${s.matricNumber || '-'}</td>
        <td class="numeric">${s.currentSemester?.tcp || '-'}</td>
        <td class="numeric">${s.currentSemester?.tnu || '-'}</td>
        <td class="numeric text-bold">${s.currentSemester?.gpa ? s.currentSemester.gpa.toFixed(2) : '-'}</td>
        <td class="numeric">${s.previousPerformance?.cumulativeTCP || '-'}</td>
        <td class="numeric">${s.previousPerformance?.cumulativeTNU || '-'}</td>
        <td class="numeric">${s.previousPerformance?.previousSemesterGPA ? s.previousPerformance.previousSemesterGPA.toFixed(2) : '-'}</td>
        <td class="numeric text-bold">${s.cumulativePerformance?.totalTCP || '-'}</td>
        <td class="numeric">${s.cumulativePerformance?.totalTNU || '-'}</td>
        <td class="numeric text-bold">${s.cumulativePerformance?.cgpa ? s.cumulativePerformance.cgpa.toFixed(2) : '-'}</td>
      </tr>
    `).join('');

    return `
  <tbody>
    <!-- Section Title -->
    <tr class="section-title-row">
      <td class="section-title-cell">
        <div class="section-title">MASTER MARK SHEET II</div>
      </td>
    </tr>
    
    <!-- Content -->
    <tr>
      <td>
        <table class="data-table table-margin">
          <thead>
            <tr>
              <th rowspan="2" width="4%">S/N</th>
              <th rowspan="2" width="12%">MATRIC NO.</th>
              <th colspan="3" width="18%">CURRENT</th>
              <th colspan="3" width="18%">PREVIOUS</th>
              <th colspan="3" width="18%">CUMULATIVE</th>
            </tr>
            <tr>
              <th width="6%">TCP</th>
              <th width="6%">TNU</th>
              <th width="6%">GPA</th>
              <th width="6%">TCP</th>
              <th width="6%">TNU</th>
              <th width="6%">GPA</th>
              <th width="6%">TCP</th>
              <th width="6%">TNU</th>
              <th width="6%">CGPA</th>
            </tr>
          </thead>
          <tbody>
            ${studentsHTML}
          </tbody>
        </table>
      </td>
    </tr>
  </tbody>`;
  }

  /* ================= SUMMARY AND SIGNATURES ================= */
  renderSummaryAndSignatures(summary, level) {
    const s = summary.summaryOfResultsByLevel[level];

    return `
  <tbody class="avoid-break">
    <!-- Section Title -->
    <tr class="section-title-row">
      <td class="section-title-cell">
        <div class="section-title">SUMMARY AND SIGNATURES</div>
      </td>
    </tr>
    
    <!-- Content -->
    <tr>
      <td>
        <div class="summary-signatures-container">
          ${this.renderSummaryTable(s)}
          
          <div class="signatures-container">
            <div class="signature-block">
              <div class="signature-line"></div>
              <div class="signature-name">${config.hod.name}</div>
              <div class="signature-title">${config.hod.title}</div>
              <div class="signature-title">Head of Department</div>
            </div>
            
            <div class="signature-block">
              <div class="signature-line"></div>
              <div class="signature-name">${config.dean.name}</div>
              <div class="signature-title">${config.dean.title}</div>
              <div class="signature-title">Dean, ${config.faculty}</div>
            </div>
          </div>
        </div>
      </td>
    </tr>
  </tbody>`;
  }

  renderSummaryTable(s) {
    if (!s) {
      return `<div class="no-data table-margin">No summary data available</div>`;
    }

    const stats = s.gpaStatistics || {};
    const passCount = (s.classDistribution?.firstClass || 0) +
      (s.classDistribution?.secondClassUpper || 0) +
      (s.classDistribution?.secondClassLower || 0) +
      (s.classDistribution?.thirdClass || 0);
    const totalStudents = s.totalStudents || 0;
    const passRate = totalStudents > 0 ? (passCount / totalStudents * 100).toFixed(1) : '0.0';

    return `
        <table class="summary-table table-margin">
          <tbody>
            <tr>
              <td class="text-bold" width="30%">First Class</td>
              <td class="numeric" width="20%">${s.classDistribution?.firstClass || 0}</td>
              <td class="text-bold" width="30%">Average GPA</td>
              <td class="numeric" width="20%">${stats.average ? stats.average.toFixed(2) : '-'}</td>
            </tr>
            <tr>
              <td class="text-bold">Second Class Upper</td>
              <td class="numeric">${s.classDistribution?.secondClassUpper || 0}</td>
              <td class="text-bold">Highest GPA</td>
              <td class="numeric">${stats.highest ? stats.highest.toFixed(2) : '-'}</td>
            </tr>
            <tr>
              <td class="text-bold">Second Class Lower</td>
              <td class="numeric">${s.classDistribution?.secondClassLower || 0}</td>
              <td class="text-bold">Lowest GPA</td>
              <td class="numeric">${stats.lowest ? stats.lowest.toFixed(2) : '-'}</td>
            </tr>
            <tr>
              <td class="text-bold">Third Class</td>
              <td class="numeric">${s.classDistribution?.thirdClass || 0}</td>
              <td class="text-bold">Students with Results</td>
              <td class="numeric">${s.studentsWithResults || s.totalStudents || 0}</td>
            </tr>
            <tr>
              <td class="text-bold">Fail</td>
              <td class="numeric">${s.classDistribution?.fail || 0}</td>
              <td class="text-bold">Pass Rate</td>
              <td class="numeric">${passRate}%</td>
            </tr>
            <tr>
              <td class="text-bold">Total Students</td>
              <td class="numeric text-bold">${totalStudents}</td>
              <td class="text-bold">Total Processed</td>
              <td class="numeric text-bold">${totalStudents}</td>
            </tr>
          </tbody>
        </table>`;
  }

  /* ================= KEY TO COURSES (LAST) ================= */
  renderKeyToCourses(summary, level) {
    const courses = summary.keyToCoursesByLevel[level] || [];
    if (courses.length === 0) return this.renderEmptySection("KEY TO COURSES", "No courses available");

    const coursesHTML = courses.map(c => `
      <tr>
        <td class="text-bold text-left">${c.courseCode || '-'}</td>
        <td class="text-left">${c.title || '-'}</td>
        <td class="numeric">${c.unit || '-'}</td>
      </tr>
    `).join('');

    return `
  <tbody>
    <!-- Section Title -->
    <tr class="section-title-row">
      <td class="section-title-cell">
        <div class="section-title">KEY TO COURSES</div>
      </td>
    </tr>
    
    <!-- Content -->
    <tr>
      <td>
        <table class="key-table">
          <thead>
            <tr>
              <th width="20%">COURSE CODE</th>
              <th width="65%">COURSE TITLE</th>
              <th width="15%">UNITS</th>
            </tr>
          </thead>
          <tbody>
            ${coursesHTML}
          </tbody>
        </table>
      </td>
    </tr>
  </tbody>`;
  }

  /* ================= FOOTER ================= */
  renderFooter(masterComputationId) {
    return `
  <tbody>
    <tr class="footer-row">
      <td class="footer-cell">
        Generated: ${new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })} • Batch: ${masterComputationId || 'N/A'}
      </td>
    </tr>
  </tbody>`;
  }

  /* ================= HELPER METHODS ================= */
  renderEmptySection(title, message) {
    return `
  <tbody>
    <!-- Section Title -->
    <tr class="section-title-row">
      <td class="section-title-cell">
        <div class="section-title">${title}</div>
      </td>
    </tr>
    
    <!-- Content -->
    <tr>
      <td>
        <div class="no-data table-margin">${message}</div>
      </td>
    </tr>
  </tbody>`;
  }

  getStudentData(studentId, summary, level) {
    const students = summary.studentSummariesByLevel[level] || [];
    return students.find(s =>
      (s.studentId?.$oid === studentId) ||
      (s.studentId === studentId) ||
      (s._id?.$oid === studentId)
    );
  }

  getDegreeClass(gpa) {
    if (gpa >= 4.50) return "First Class";
    if (gpa >= 3.50) return "Second Class Upper";
    if (gpa >= 2.50) return "Second Class Lower";
    if (gpa >= 1.50) return "Third Class";
    return "Fail";
  }
}

export default new MasterSheetHtmlRenderer();