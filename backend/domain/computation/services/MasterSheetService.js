// services/MasterSheetService.js
import ComputationSummary from "../../result/computation.model.js";
import SummaryListBuilder from "./SummaryListBuilder.js";
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';

class MasterSheetService {
    /**
     * Generate master sheet data with level-based organization
     * @param {string} summaryId - Computation summary ID
     * @returns {Promise<Object>} Master sheet data with level-based organization
     */
    async generateMasterSheetData(summaryId) {
        try {
            const computationSummary = await ComputationSummary.findById(summaryId)
                .populate('department', 'name code')
                .populate('semester', 'name academicYear')
                .lean();

            if (!computationSummary) {
                throw new Error(`Computation summary ${summaryId} not found`);
            }

            // Convert Map fields to objects
            const studentSummariesByLevel = this.convertMapToObject(computationSummary.studentSummariesByLevel);
            const keyToCoursesByLevel = this.convertMapToObject(computationSummary.keyToCoursesByLevel);
            const summaryOfResultsByLevel = this.convertMapToObject(computationSummary.summaryOfResultsByLevel);

            // Get overall summary statistics
            const summaryStats = {
                totalStudents: computationSummary.totalStudents || 0,
                studentsWithResults: computationSummary.studentsWithResults || 0,
                averageGPA: computationSummary.averageGPA || 0,
                highestGPA: computationSummary.highestGPA || 0,
                lowestGPA: computationSummary.lowestGPA || 0,
                gradeDistribution: computationSummary.gradeDistribution || {},
                summaryOfResultsByLevel: summaryOfResultsByLevel
            };

            // Build master sheet data organized by level
            const masterSheetDataByLevel = SummaryListBuilder.buildMasterSheetDataByLevel(
                studentSummariesByLevel,
                summaryStats,
                keyToCoursesByLevel
            );

            // Update computation summary with master sheet data
            await ComputationSummary.findByIdAndUpdate(summaryId, {
                masterSheetDataByLevel: new Map(Object.entries(masterSheetDataByLevel.masterSheetDataByLevel || {})),
                masterSheetGenerated: true,
                masterSheetGeneratedAt: new Date(),
                // Also store overall summary for backward compatibility
                masterSheetData: masterSheetDataByLevel.overallSummary || null
            });

            console.log(`✅ Generated master sheet data for summary ${summaryId} with ${Object.keys(masterSheetDataByLevel.masterSheetDataByLevel || {}).length} levels`);

            return {
                ...masterSheetDataByLevel,
                summaryId,
                department: computationSummary.department,
                semester: computationSummary.semester,
                generatedAt: new Date()
            };
        } catch (error) {
            console.error(`Error generating master sheet data:`, error);
            throw error;
        }
    }

    /**
     * Generate PDF master sheet with level-based organization
     * @param {Object} masterSheetData - Master sheet data with level-based organization
     * @returns {Promise<Buffer>} PDF buffer
     */
    async generatePDFMasterSheet(masterSheetData) {
        return new Promise((resolve, reject) => {
            try {
                const doc = new PDFDocument({ 
                    margin: 50, 
                    size: 'A4',
                    font: 'Helvetica'
                });
                const buffers = [];

                doc.on('data', buffers.push.bind(buffers));
                doc.on('end', () => {
                    const pdfData = Buffer.concat(buffers);
                    resolve(pdfData);
                });

                // Generate PDF content with level-based organization
                this._generatePDFContent(doc, masterSheetData);

                doc.end();
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Generate Excel master sheet with level-based organization
     * @param {Object} masterSheetData - Master sheet data with level-based organization
     * @returns {Promise<Buffer>} Excel buffer
     */
    async generateExcelMasterSheet(masterSheetData) {
        try {
            const workbook = new ExcelJS.Workbook();
            
            // Add metadata sheet
            const metadataSheet = workbook.addWorksheet('Metadata');
            this._generateMetadataSheet(metadataSheet, masterSheetData);

            // Process each level
            const masterSheetDataByLevel = masterSheetData.masterSheetDataByLevel || {};
            const levels = Object.keys(masterSheetDataByLevel).sort();

            for (const level of levels) {
                const levelData = masterSheetDataByLevel[level];
                
                // Key to Courses sheet for this level
                const keySheet = workbook.addWorksheet(`Key to Courses L${level}`);
                this._generateKeyToCoursesSheet(keySheet, levelData.keyToCourses || []);

                // Pass List sheet for this level
                const passSheet = workbook.addWorksheet(`Pass List L${level}`);
                this._generatePassListSheet(passSheet, levelData.passList || []);

                // Outstanding Courses sheet for this level
                const outstandingSheet = workbook.addWorksheet(`Outstanding Courses L${level}`);
                this._generateOutstandingSheet(outstandingSheet, levelData.outstandingCoursesList || []);

                // Probation List sheet for this level
                const probationSheet = workbook.addWorksheet(`Probation List L${level}`);
                this._generateProbationSheet(probationSheet, levelData.probationList || []);

                // Withdrawal List sheet for this level
                const withdrawalSheet = workbook.addWorksheet(`Withdrawal List L${level}`);
                this._generateWithdrawalSheet(withdrawalSheet, levelData.withdrawalList || []);

                // Termination List sheet for this level
                const terminationSheet = workbook.addWorksheet(`Termination List L${level}`);
                this._generateTerminationSheet(terminationSheet, levelData.terminationList || []);

                // Summary of Results sheet for this level
                const summarySheet = workbook.addWorksheet(`Summary L${level}`);
                this._generateSummarySheet(summarySheet, levelData.summaryOfResults || {});

                // MMS1 sheet for this level
                const mms1Sheet = workbook.addWorksheet(`MMS1 L${level}`);
                this._generateMMS1Sheet(mms1Sheet, levelData.mms1 || []);

                // MMS2 sheet for this level
                const mms2Sheet = workbook.addWorksheet(`MMS2 L${level}`);
                this._generateMMS2Sheet(mms2Sheet, levelData.mms2 || []);
            }

            // Add overall summary sheet
            const overallSummarySheet = workbook.addWorksheet('Overall Summary');
            this._generateOverallSummarySheet(overallSummarySheet, masterSheetData.overallSummary || {});

            // Generate buffer
            const buffer = await workbook.xlsx.writeBuffer();
            return buffer;
        } catch (error) {
            console.error('Error generating Excel master sheet:', error);
            throw error;
        }
    }

    /**
     * Generate master sheet for specific level only
     * @param {Object} masterSheetData - Master sheet data with level-based organization
     * @param {string} level - Academic level to generate sheet for
     * @param {string} format - 'pdf' or 'excel'
     * @returns {Promise<Buffer>} File buffer
     */
    async generateLevelMasterSheet(masterSheetData, level, format = 'excel') {
        try {
            const masterSheetDataByLevel = masterSheetData.masterSheetDataByLevel || {};
            const levelData = masterSheetDataByLevel[level];

            if (!levelData) {
                throw new Error(`No master sheet data found for level ${level}`);
            }

            if (format === 'pdf') {
                return await this.generatePDFLevelSheet(level, levelData, masterSheetData);
            } else {
                return await this.generateExcelLevelSheet(level, levelData, masterSheetData);
            }
        } catch (error) {
            console.error(`Error generating ${format} master sheet for level ${level}:`, error);
            throw error;
        }
    }

    /**
     * Generate PDF sheet for specific level
     * @param {string} level - Academic level
     * @param {Object} levelData - Level-specific data
     * @param {Object} masterSheetData - Complete master sheet data
     * @returns {Promise<Buffer>} PDF buffer
     */
    async generatePDFLevelSheet(level, levelData, masterSheetData) {
        return new Promise((resolve, reject) => {
            try {
                const doc = new PDFDocument({ 
                    margin: 50, 
                    size: 'A4',
                    font: 'Helvetica'
                });
                const buffers = [];

                doc.on('data', buffers.push.bind(buffers));
                doc.on('end', () => {
                    const pdfData = Buffer.concat(buffers);
                    resolve(pdfData);
                });

                // Add header with level information
                doc.fontSize(16).text(`MASTER SHEET - LEVEL ${level}`, { align: 'center' });
                doc.moveDown(0.5);
                
                if (masterSheetData.department) {
                    doc.fontSize(12).text(`Department: ${masterSheetData.department.name}`, { align: 'center' });
                }
                
                if (masterSheetData.semester) {
                    doc.fontSize(12).text(`Semester: ${masterSheetData.semester.name}`, { align: 'center' });
                }
                
                doc.fontSize(10).text(`Generated: ${new Date().toLocaleDateString()}`, { align: 'center' });
                doc.moveDown();

                // Generate content for this level
                this._generatePDFLevelContent(doc, level, levelData);

                doc.end();
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Generate Excel sheet for specific level
     * @param {string} level - Academic level
     * @param {Object} levelData - Level-specific data
     * @param {Object} masterSheetData - Complete master sheet data
     * @returns {Promise<Buffer>} Excel buffer
     */
    async generateExcelLevelSheet(level, levelData, masterSheetData) {
        try {
            const workbook = new ExcelJS.Workbook();
            
            // Add metadata sheet
            const metadataSheet = workbook.addWorksheet('Metadata');
            metadataSheet.columns = [
                { header: 'Property', key: 'property', width: 20 },
                { header: 'Value', key: 'value', width: 40 }
            ];
            
            metadataSheet.addRow({ property: 'Level', value: level });
            metadataSheet.addRow({ property: 'Department', value: masterSheetData.department?.name || 'N/A' });
            metadataSheet.addRow({ property: 'Semester', value: masterSheetData.semester?.name || 'N/A' });
            metadataSheet.addRow({ property: 'Generated Date', value: new Date().toLocaleDateString() });

            // Add all level-specific sheets
            this._generateKeyToCoursesSheet(workbook.addWorksheet('Key to Courses'), levelData.keyToCourses || []);
            this._generatePassListSheet(workbook.addWorksheet('Pass List'), levelData.passList || []);
            this._generateOutstandingSheet(workbook.addWorksheet('Outstanding Courses'), levelData.outstandingCoursesList || []);
            this._generateProbationSheet(workbook.addWorksheet('Probation List'), levelData.probationList || []);
            this._generateWithdrawalSheet(workbook.addWorksheet('Withdrawal List'), levelData.withdrawalList || []);
            this._generateTerminationSheet(workbook.addWorksheet('Termination List'), levelData.terminationList || []);
            this._generateSummarySheet(workbook.addWorksheet('Summary of Results'), levelData.summaryOfResults || {});
            this._generateMMS1Sheet(workbook.addWorksheet('MMS1'), levelData.mms1 || []);
            this._generateMMS2Sheet(workbook.addWorksheet('MMS2'), levelData.mms2 || []);

            const buffer = await workbook.xlsx.writeBuffer();
            return buffer;
        } catch (error) {
            console.error(`Error generating Excel for level ${level}:`, error);
            throw error;
        }
    }

    // ==================== PRIVATE HELPER METHODS ====================

    /**
     * Generate metadata sheet
     */
    _generateMetadataSheet(worksheet, masterSheetData) {
        worksheet.columns = [
            { header: 'Property', key: 'property', width: 25 },
            { header: 'Value', key: 'value', width: 50 }
        ];

        const metadata = [
            { property: 'Department', value: masterSheetData.department?.name || 'N/A' },
            { property: 'Semester', value: masterSheetData.semester?.name || 'N/A' },
            { property: 'Academic Year', value: masterSheetData.semester?.academicYear || 'N/A' },
            { property: 'Total Students', value: masterSheetData.overallSummary?.totalStudents || 0 },
            { property: 'Students with Results', value: masterSheetData.overallSummary?.studentsWithResults || 0 },
            { property: 'Average GPA', value: masterSheetData.overallSummary?.averageGPA?.toFixed(2) || '0.00' },
            { property: 'Highest GPA', value: masterSheetData.overallSummary?.highestGPA?.toFixed(2) || '0.00' },
            { property: 'Lowest GPA', value: masterSheetData.overallSummary?.lowestGPA?.toFixed(2) || '0.00' },
            { property: 'Total Carryovers', value: masterSheetData.overallSummary?.totalCarryovers || 0 },
            { property: 'Affected Students', value: masterSheetData.overallSummary?.affectedStudentsCount || 0 },
            { property: 'Generated Date', value: new Date().toLocaleDateString() },
            { property: 'Number of Levels', value: Object.keys(masterSheetData.masterSheetDataByLevel || {}).length }
        ];

        metadata.forEach(item => worksheet.addRow(item));
    }

    /**
     * Generate Key to Courses sheet
     */
    _generateKeyToCoursesSheet(worksheet, keyToCourses) {
        worksheet.columns = [
            { header: 'Course Code', key: 'courseCode', width: 15 },
            { header: 'Course Title', key: 'courseTitle', width: 40 },
            { header: 'Unit Load', key: 'unitLoad', width: 10 },
            { header: 'Type', key: 'type', width: 10 },
            { header: 'Level', key: 'level', width: 10 }
        ];

        keyToCourses.forEach(course => {
            worksheet.addRow({
                courseCode: course.courseCode,
                courseTitle: course.courseTitle,
                unitLoad: course.unitLoad,
                type: course.isElective ? 'Elective' : 'Core',
                level: course.level
            });
        });
    }

    /**
     * Generate Pass List sheet
     */
    _generatePassListSheet(worksheet, passList) {
        worksheet.columns = [
            { header: 'S/N', key: 's_n', width: 10 },
            { header: 'Matric No', key: 'matricNo', width: 20 },
            { header: 'Name', key: 'name', width: 30 },
            { header: 'GPA', key: 'gpa', width: 10 }
        ];

        passList.forEach(student => {
            worksheet.addRow({
                s_n: student.s_n,
                matricNo: student.matricNo,
                name: student.name,
                gpa: student.gpa
            });
        });
    }

    /**
     * Generate Outstanding Courses sheet
     */
    _generateOutstandingSheet(worksheet, outstandingList) {
        worksheet.columns = [
            { header: 'S/N', key: 's_n', width: 10 },
            { header: 'Matric No', key: 'matricNo', width: 20 },
            { header: 'Name', key: 'name', width: 30 },
            { header: 'Courses', key: 'courses', width: 40 }
        ];

        outstandingList.forEach(student => {
            worksheet.addRow({
                s_n: student.s_n,
                matricNo: student.matricNo,
                name: student.name,
                courses: Array.isArray(student.courses) ? student.courses.join(', ') : student.courses
            });
        });
    }

    /**
     * Generate MMS1 sheet
     */
    _generateMMS1Sheet(worksheet, mms1Data) {
        if (!mms1Data || mms1Data.length === 0) {
            worksheet.addRow({ note: 'No MMS1 data available for this level' });
            return;
        }

        // Dynamic columns based on courses
        const columns = [
            { header: 'S/N', key: 's_n', width: 10 },
            { header: 'Matric No', key: 'matricNo', width: 20 }
        ];

        // Add course columns from first student
        if (mms1Data[0] && mms1Data[0].courses) {
            mms1Data[0].courses.forEach((course, index) => {
                columns.push(
                    { header: `${course.courseCode} Score`, key: `course_${index}_score`, width: 15 },
                    { header: `${course.courseCode} Grade`, key: `course_${index}_grade`, width: 10 }
                );
            });
        }

        columns.push(
            { header: 'TCP', key: 'current_tcp', width: 10 },
            { header: 'TNU', key: 'current_tnu', width: 10 },
            { header: 'GPA', key: 'current_gpa', width: 10 }
        );

        worksheet.columns = columns;

        // Add rows
        mms1Data.forEach(student => {
            const rowData = {
                s_n: student.s_n,
                matricNo: student.matricNo
            };

            // Add course scores and grades
            if (student.courses) {
                student.courses.forEach((course, index) => {
                    rowData[`course_${index}_score`] = course.result?.score || '-';
                    rowData[`course_${index}_grade`] = course.result?.grade || '-';
                });
            }

            // Add current semester data
            rowData.current_tcp = student.current?.tcp || 0;
            rowData.current_tnu = student.current?.tnu || 0;
            rowData.current_gpa = student.current?.gpa || 0;

            worksheet.addRow(rowData);
        });
    }

    /**
     * Generate MMS2 sheet
     */
    _generateMMS2Sheet(worksheet, mms2Data) {
        worksheet.columns = [
            { header: 'S/N', key: 's_n', width: 10 },
            { header: 'Matric No', key: 'matricNo', width: 20 },
            { header: 'Current TCP', key: 'current_tcp', width: 15 },
            { header: 'Current TNU', key: 'current_tnu', width: 15 },
            { header: 'Current GPA', key: 'current_gpa', width: 15 },
            { header: 'Previous TCP', key: 'previous_tcp', width: 15 },
            { header: 'Previous TNU', key: 'previous_tnu', width: 15 },
            { header: 'Previous GPA', key: 'previous_gpa', width: 15 },
            { header: 'Cumulative TCP', key: 'cumulative_tcp', width: 15 },
            { header: 'Cumulative TNU', key: 'cumulative_tnu', width: 15 },
            { header: 'Cumulative GPA', key: 'cumulative_gpa', width: 15 }
        ];

        mms2Data.forEach(student => {
            worksheet.addRow({
                s_n: student.s_n,
                matricNo: student.matricNo,
                current_tcp: student.current?.tcp || 0,
                current_tnu: student.current?.tnu || 0,
                current_gpa: student.current?.gpa || 0,
                previous_tcp: student.previous?.tcp || 0,
                previous_tnu: student.previous?.tnu || 0,
                previous_gpa: student.previous?.gpa || 0,
                cumulative_tcp: student.cumulative?.tcp || 0,
                cumulative_tnu: student.cumulative?.tnu || 0,
                cumulative_gpa: student.cumulative?.gpa || 0
            });
        });
    }

    /**
     * Generate Probation List sheet
     */
    _generateProbationSheet(worksheet, probationList) {
        worksheet.columns = [
            { header: 'S/N', key: 's_n', width: 10 },
            { header: 'Matric No', key: 'matricNo', width: 20 },
            { header: 'Name', key: 'name', width: 30 },
            { header: 'GPA', key: 'gpa', width: 10 },
            { header: 'CGPA', key: 'cgpa', width: 10 },
            { header: 'Remarks', key: 'remarks', width: 40 }
        ];

        probationList.forEach((student, index) => {
            worksheet.addRow({
                s_n: index + 1,
                matricNo: student.matricNo || 'N/A',
                name: student.name || 'N/A',
                gpa: student.gpa || 0,
                cgpa: student.cgpa || 0,
                remarks: student.remarks || 'Placed on academic probation'
            });
        });
    }

    /**
     * Generate Withdrawal List sheet
     */
    _generateWithdrawalSheet(worksheet, withdrawalList) {
        worksheet.columns = [
            { header: 'S/N', key: 's_n', width: 10 },
            { header: 'Matric No', key: 'matricNo', width: 20 },
            { header: 'Name', key: 'name', width: 30 },
            { header: 'Reason', key: 'reason', width: 30 },
            { header: 'Remarks', key: 'remarks', width: 40 }
        ];

        withdrawalList.forEach((student, index) => {
            worksheet.addRow({
                s_n: index + 1,
                matricNo: student.matricNo || 'N/A',
                name: student.name || 'N/A',
                reason: student.reason || 'Poor academic performance',
                remarks: student.remarks || 'Withdrawn due to low CGPA'
            });
        });
    }

    /**
     * Generate Termination List sheet
     */
    _generateTerminationSheet(worksheet, terminationList) {
        worksheet.columns = [
            { header: 'S/N', key: 's_n', width: 10 },
            { header: 'Matric No', key: 'matricNo', width: 20 },
            { header: 'Name', key: 'name', width: 30 },
            { header: 'Reason', key: 'reason', width: 30 },
            { header: 'Remarks', key: 'remarks', width: 40 }
        ];

        terminationList.forEach((student, index) => {
            worksheet.addRow({
                s_n: index + 1,
                matricNo: student.matricNo || 'N/A',
                name: student.name || 'N/A',
                reason: student.reason || 'Excessive carryovers or poor performance',
                remarks: student.remarks || 'Terminated due to academic standing'
            });
        });
    }

    /**
     * Generate Summary sheet
     */
    _generateSummarySheet(worksheet, summaryOfResults) {
        worksheet.columns = [
            { header: 'Metric', key: 'metric', width: 30 },
            { header: 'Value', key: 'value', width: 20 }
        ];

        const summaryData = [
            { metric: 'Total Students', value: summaryOfResults.totalStudents || 0 },
            { metric: 'Students with Results', value: summaryOfResults.studentsWithResults || 0 },
            { metric: 'Average GPA', value: summaryOfResults.gpaStatistics?.average?.toFixed(2) || '0.00' },
            { metric: 'Highest GPA', value: summaryOfResults.gpaStatistics?.highest?.toFixed(2) || '0.00' },
            { metric: 'Lowest GPA', value: summaryOfResults.gpaStatistics?.lowest?.toFixed(2) || '0.00' },
            { metric: 'First Class', value: summaryOfResults.classDistribution?.firstClass || 0 },
            { metric: 'Second Class Upper', value: summaryOfResults.classDistribution?.secondClassUpper || 0 },
            { metric: 'Second Class Lower', value: summaryOfResults.classDistribution?.secondClassLower || 0 },
            { metric: 'Third Class', value: summaryOfResults.classDistribution?.thirdClass || 0 },
            { metric: 'Pass', value: summaryOfResults.classDistribution?.pass || 0 },
            { metric: 'Fail', value: summaryOfResults.classDistribution?.fail || 0 }
        ];

        summaryData.forEach(item => worksheet.addRow(item));
    }

    /**
     * Generate Overall Summary sheet
     */
    _generateOverallSummarySheet(worksheet, overallSummary) {
        worksheet.columns = [
            { header: 'Metric', key: 'metric', width: 30 },
            { header: 'Value', key: 'value', width: 20 }
        ];

        const summaryData = [
            { metric: 'Total Students', value: overallSummary.totalStudents || 0 },
            { metric: 'Students with Results', value: overallSummary.studentsWithResults || 0 },
            { metric: 'Average GPA', value: overallSummary.averageGPA?.toFixed(2) || '0.00' },
            { metric: 'Highest GPA', value: overallSummary.highestGPA?.toFixed(2) || '0.00' },
            { metric: 'Lowest GPA', value: overallSummary.lowestGPA?.toFixed(2) || '0.00' },
            { metric: 'Total Carryovers', value: overallSummary.totalCarryovers || 0 },
            { metric: 'Affected Students', value: overallSummary.affectedStudentsCount || 0 }
        ];

        if (overallSummary.gradeDistribution) {
            Object.entries(overallSummary.gradeDistribution).forEach(([grade, count]) => {
                summaryData.push({ metric: `${grade} (Grade Distribution)`, value: count });
            });
        }

        summaryData.forEach(item => worksheet.addRow(item));
    }

    /**
     * Generate PDF content with level-based organization
     */
    _generatePDFContent(doc, masterSheetData) {
        const { department, semester, masterSheetDataByLevel = {}, overallSummary = {} } = masterSheetData;
        const levels = Object.keys(masterSheetDataByLevel).sort();

        // Add title page
        doc.fontSize(20).text('ACADEMIC MASTER SHEET', { align: 'center' });
        doc.moveDown();
        
        if (department) {
            doc.fontSize(16).text(department.name, { align: 'center' });
        }
        
        if (semester) {
            doc.fontSize(14).text(semester.name, { align: 'center' });
        }
        
        doc.fontSize(12).text(`Generated: ${new Date().toLocaleDateString()}`, { align: 'center' });
        doc.moveDown(2);

        // Add overall summary
        doc.fontSize(14).text('OVERALL SUMMARY', { underline: true });
        doc.moveDown(0.5);
        
        doc.fontSize(12).text(`Total Students: ${overallSummary.totalStudents || 0}`);
        doc.text(`Students with Results: ${overallSummary.studentsWithResults || 0}`);
        doc.text(`Average GPA: ${overallSummary.averageGPA?.toFixed(2) || '0.00'}`);
        doc.text(`Highest GPA: ${overallSummary.highestGPA?.toFixed(2) || '0.00'}`);
        doc.text(`Lowest GPA: ${overallSummary.lowestGPA?.toFixed(2) || '0.00'}`);
        doc.text(`Total Carryovers: ${overallSummary.totalCarryovers || 0}`);
        doc.text(`Affected Students: ${overallSummary.affectedStudentsCount || 0}`);
        doc.moveDown();

        // Process each level
        for (const level of levels) {
            doc.addPage();
            this._generatePDFLevelContent(doc, level, masterSheetDataByLevel[level]);
        }
    }

    /**
     * Generate PDF content for a specific level
     */
    _generatePDFLevelContent(doc, level, levelData) {
        // Level header
        doc.fontSize(16).text(`LEVEL ${level}`, { align: 'center', underline: true });
        doc.moveDown();

        // Summary of Results
        if (levelData.summaryOfResults) {
            doc.fontSize(14).text('Summary of Results', { underline: true });
            doc.moveDown(0.5);
            
            const summary = levelData.summaryOfResults;
            doc.fontSize(12).text(`Total Students: ${summary.totalStudents || 0}`);
            doc.text(`Students with Results: ${summary.studentsWithResults || 0}`);
            doc.text(`Average GPA: ${summary.gpaStatistics?.average?.toFixed(2) || '0.00'}`);
            doc.text(`Highest GPA: ${summary.gpaStatistics?.highest?.toFixed(2) || '0.00'}`);
            doc.text(`Lowest GPA: ${summary.gpaStatistics?.lowest?.toFixed(2) || '0.00'}`);
            doc.moveDown();
        }

        // Pass List
        if (levelData.passList && levelData.passList.length > 0) {
            doc.fontSize(14).text('Pass List', { underline: true });
            doc.moveDown(0.5);
            
            levelData.passList.forEach(student => {
                doc.fontSize(12).text(`${student.s_n}. ${student.matricNo} - ${student.name} (GPA: ${student.gpa})`);
            });
            doc.moveDown();
        }

        // Add more sections as needed...
        // Note: Due to space constraints, we're showing a simplified version.
        // In production, you would add all the sections (Probation, Withdrawal, etc.)
    }

    /**
     * Helper function to convert Map to object
     */
    convertMapToObject(mapField) {
        if (!mapField) return {};
        
        if (typeof mapField === 'object' && !(mapField instanceof Map)) {
            return mapField;
        }
        
        if (mapField instanceof Map) {
            const obj = {};
            mapField.forEach((value, key) => {
                obj[key] = value;
            });
            return obj;
        }
        
        return {};
    }

    /**
     * Get available levels for a computation summary
     * @param {string} summaryId - Computation summary ID
     * @returns {Promise<Array>} Available levels
     */
    async getAvailableLevels(summaryId) {
        try {
            const summary = await ComputationSummary.findById(summaryId)
                .select('studentSummariesByLevel')
                .lean();

            if (!summary) {
                return [];
            }

            const studentSummariesByLevel = this.convertMapToObject(summary.studentSummariesByLevel);
            return Object.keys(studentSummariesByLevel).sort();
        } catch (error) {
            console.error('Error getting available levels:', error);
            return [];
        }
    }

    /**
     * Check if master sheet is generated for a summary
     * @param {string} summaryId - Computation summary ID
     * @returns {Promise<boolean>} True if generated
     */
    async isMasterSheetGenerated(summaryId) {
        try {
            const summary = await ComputationSummary.findById(summaryId)
                .select('masterSheetGenerated masterSheetDataByLevel')
                .lean();

            return !!summary?.masterSheetGenerated && 
                   !!summary?.masterSheetDataByLevel && 
                   summary.masterSheetDataByLevel.size > 0;
        } catch (error) {
            console.error('Error checking master sheet generation:', error);
            return false;
        }
    }
}

export default new MasterSheetService();