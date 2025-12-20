// computation/services/ReportService.js
import { capitalizeFirstLetter } from "../../../utils/StringUtils.js";
import { queueNotification } from "../../../workers/department.queue.js";
import ComputationSummary from "../../result/computation.model.js";
import MasterSheetService from "./MasterSheetService.js";

class ReportService {
    /**
     * Send HOD notification about computation completion with level-based details
     * @param {Object} department - Department object
     * @param {Object} semester - Semester object
     * @param {Object} summary - Computation summary (with level-based data)
     */
    async sendHODNotification(department, semester, summary) {
        if (!department.hod) return;

        // Convert Map fields if necessary
        const studentSummariesByLevel = this.convertMapToObject(summary.studentSummariesByLevel);
        const studentListsByLevel = this.convertMapToObject(summary.studentListsByLevel);
        const summaryOfResultsByLevel = this.convertMapToObject(summary.summaryOfResultsByLevel);
        const carryoverStatsByLevel = this.convertMapToObject(summary.carryoverStatsByLevel);

        // Build level-wise statistics
        const levelStats = [];
        for (const [level, levelData] of Object.entries(summaryOfResultsByLevel || {})) {
            if (levelData) {
                levelStats.push({
                    level,
                    students: levelData.totalStudents || 0,
                    averageGPA: levelData.gpaStatistics?.average || 0,
                    passCount: studentListsByLevel[level]?.passList?.length || 0,
                    probationCount: studentListsByLevel[level]?.probationList?.length || 0,
                    carryoverCount: carryoverStatsByLevel[level]?.totalCarryovers || 0
                });
            }
        }

        // Sort levels numerically
        levelStats.sort((a, b) => parseInt(a.level) - parseInt(b.level));

        // Build level-wise summary message
        let levelSummaryMessage = "";
        if (levelStats.length > 0) {
            levelSummaryMessage = "\n\n📊 LEVEL-WISE BREAKDOWN:\n";
            levelStats.forEach(stat => {
                levelSummaryMessage += `Level ${stat.level}: ${stat.students} students | Avg GPA: ${stat.averageGPA.toFixed(2)} | Pass: ${stat.passCount} | Probation: ${stat.probationCount} | Carryovers: ${stat.carryoverCount}\n`;
            });
        }

        const message = `📊 RESULTS COMPUTATION COMPLETE - ${department.name}
      
${capitalizeFirstLetter(semester.name)} Semester
Processed: ${summary.studentsWithResults}/${summary.totalStudents} students
Overall Average GPA: ${summary.averageGPA?.toFixed(2) || '0.00'}
Highest GPA: ${summary.highestGPA?.toFixed(2) || '0.00'}
Lowest GPA: ${summary.lowestGPA?.toFixed(2) || '0.00'}
${levelSummaryMessage}
🎓 OVERALL STUDENT LISTS:
Passed: ${summary.passList?.length || 0} students
Probation: ${summary.probationList?.length || 0} students
Withdrawal: ${summary.withdrawalList?.length || 0} students
Termination: ${summary.terminationList?.length || 0} students

📚 CARRYOVER ANALYSIS:
Total Carryovers: ${summary.carryoverStats?.totalCarryovers || 0}
Affected Students: ${summary.carryoverStats?.affectedStudentsCount || 0}

⚠️ FAILED PROCESSING: ${summary.failedStudents?.length || 0}
${summary.failedStudents?.length > 0 ? 'Check dashboard for details' : 'All students processed successfully'}

View detailed report in the dashboard.`;

        await queueNotification(
            "hod",
            department.hod,
            "department_results_computed",
            message,
            {
                department: department.name,
                semester: semester.name,
                summaryId: summary._id,
                passListCount: summary.passList?.length || 0,
                probationListCount: summary.probationList?.length || 0,
                withdrawalListCount: summary.withdrawalList?.length || 0,
                terminationListCount: summary.terminationList?.length || 0,
                totalCarryovers: summary.carryoverStats?.totalCarryovers || 0,
                affectedStudentsCount: summary.carryoverStats?.affectedStudentsCount || 0,
                averageGPA: summary.averageGPA?.toFixed(2) || '0.00',
                levelStats: JSON.stringify(levelStats),
                isPreview: summary.isPreview || false,
                purpose: summary.purpose || 'final'
            }
        );

        console.log(`✅ HOD notification sent for ${department.name} - ${semester.name}`);
    }

    /**
     * Generate computation report asynchronously with level-based data
     * @param {string} summaryId - Summary ID
     * @param {Object} department - Department object
     * @param {Object} semester - Semester object
     * @param {Object} data - Report data
     */
    async generateReportAsync(summaryId, department, semester, data) {
        // Run in background
        process.nextTick(async () => {
            try {
                await this.generateComputationReport(summaryId, {
                    department,
                    semester,
                    ...data
                });
            } catch (error) {
                console.error("Async report generation failed:", error);
            }
        });
    }

    /**
     * Generate comprehensive computation report with level-based data
     * @param {string} summaryId - Summary ID
     * @param {Object} data - Report data
     */
    async generateComputationReport(summaryId, data) {
        try {
            const summary = await ComputationSummary.findById(summaryId)
                .populate('department', 'name code')
                .populate('semester', 'name')
                .populate('computedBy', 'name email')
                .lean();

            if (!summary) {
                throw new Error(`Summary ${summaryId} not found`);
            }

            // Convert Map fields
            const studentSummariesByLevel = this.convertMapToObject(summary.studentSummariesByLevel);
            const studentListsByLevel = this.convertMapToObject(summary.studentListsByLevel);
            const summaryOfResultsByLevel = this.convertMapToObject(summary.summaryOfResultsByLevel);
            const carryoverStatsByLevel = this.convertMapToObject(summary.carryoverStatsByLevel);
            const keyToCoursesByLevel = this.convertMapToObject(summary.keyToCoursesByLevel);

            // Build level-based report data
            const reportData = {
                title: `Academic Results Computation Report - ${data.department.name}`,
                subtitle: `${data.semester.name} Semester`,
                generatedAt: new Date(),
                
                // Executive summary
                executiveSummary: {
                    totalStudents: summary.totalStudents,
                    processedStudents: summary.studentsProcessed,
                    successRate: summary.studentsProcessed > 0 
                        ? ((summary.studentsProcessed / summary.totalStudents) * 100).toFixed(1) + '%'
                        : '0%',
                    averageGPA: summary.averageGPA,
                    highestGPA: summary.highestGPA,
                    lowestGPA: summary.lowestGPA,
                    totalCarryovers: summary.carryoverStats?.totalCarryovers || 0,
                    affectedStudentsCount: summary.carryoverStats?.affectedStudentsCount || 0
                },

                // Level-wise analysis
                levelAnalysis: this.buildLevelAnalysis(
                    studentSummariesByLevel,
                    studentListsByLevel,
                    summaryOfResultsByLevel,
                    carryoverStatsByLevel
                ),

                // Student lists (consolidated across levels)
                studentLists: {
                    passList: {
                        count: summary.passList?.length || 0,
                        students: (summary.passList || []).slice(0, 50).map(s => ({
                            matricNumber: s.matricNumber,
                            name: s.name,
                            gpa: s.gpa
                        }))
                    },
                    probationList: {
                        count: summary.probationList?.length || 0,
                        students: (summary.probationList || []).slice(0, 50).map(s => ({
                            matricNumber: s.matricNumber,
                            name: s.name,
                            gpa: s.gpa,
                            remarks: s.remarks
                        }))
                    },
                    withdrawalList: {
                        count: summary.withdrawalList?.length || 0,
                        students: (summary.withdrawalList || []).slice(0, 50).map(s => ({
                            matricNumber: s.matricNumber,
                            name: s.name,
                            reason: s.reason,
                            remarks: s.remarks
                        }))
                    },
                    terminationList: {
                        count: summary.terminationList?.length || 0,
                        students: (summary.terminationList || []).slice(0, 50).map(s => ({
                            matricNumber: s.matricNumber,
                            name: s.name,
                            reason: s.reason,
                            remarks: s.remarks
                        }))
                    }
                },

                // Analysis
                analysis: {
                    gradeDistribution: summary.gradeDistribution,
                    carryoverAnalysis: summary.carryoverStats,
                    levelPerformance: summary.additionalMetrics?.levelStats || {},
                    failedStudents: summary.failedStudents?.length || 0
                },

                // Recommendations
                recommendations: this.generateReportRecommendations(summary),

                // Metadata
                metadata: {
                    isPreview: summary.isPreview || false,
                    purpose: summary.purpose || 'final',
                    computedBy: summary.computedBy,
                    startedAt: summary.startedAt,
                    completedAt: summary.completedAt,
                    duration: summary.duration,
                    masterSheetGenerated: summary.masterSheetGenerated,
                    masterSheetGeneratedAt: summary.masterSheetGeneratedAt
                }
            };

            // Store report in computation summary
            await ComputationSummary.findByIdAndUpdate(summaryId, {
                $set: {
                    reportData: reportData,
                    reportGeneratedAt: new Date()
                }
            });

            // Generate master sheet data if not already generated
            if (!summary.masterSheetGenerated && !summary.isPreview) {
                try {
                    const masterSheetData = await MasterSheetService.generateMasterSheetData(summaryId);
                    console.log(`✅ Generated master sheet data for summary ${summaryId}`);
                } catch (masterSheetError) {
                    console.error(`Failed to generate master sheet data:`, masterSheetError);
                }
            }

            console.log(`✅ Generated comprehensive report for summary ${summaryId}`);
            return reportData;
        } catch (error) {
            console.error("Failed to generate report:", error);
            throw error;
        }
    }

    /**
     * Build level-based analysis for report
     * @param {Object} studentSummariesByLevel - Student summaries by level
     * @param {Object} studentListsByLevel - Student lists by level
     * @param {Object} summaryOfResultsByLevel - Results summary by level
     * @param {Object} carryoverStatsByLevel - Carryover stats by level
     * @returns {Object} Level analysis
     */
    buildLevelAnalysis(studentSummariesByLevel, studentListsByLevel, summaryOfResultsByLevel, carryoverStatsByLevel) {
        const levelAnalysis = {};

        // Process each level
        Object.keys(studentSummariesByLevel || {}).forEach(level => {
            const summaries = studentSummariesByLevel[level] || [];
            const lists = studentListsByLevel[level] || {};
            const results = summaryOfResultsByLevel[level] || {};
            const carryovers = carryoverStatsByLevel[level] || {};

            // Calculate performance metrics
            const gpas = summaries.map(s => s.currentSemester?.gpa || 0).filter(gpa => gpa > 0);
            const averageGPA = gpas.length > 0 ? gpas.reduce((sum, gpa) => sum + gpa, 0) / gpas.length : 0;
            
            const cgpas = summaries.map(s => s.cumulativePerformance?.cgpa || 0).filter(cgpa => cgpa > 0);
            const averageCGPA = cgpas.length > 0 ? cgpas.reduce((sum, cgpa) => sum + cgpa, 0) / cgpas.length : 0;

            // Count academic statuses
            const statusCounts = {
                good: 0,
                probation: 0,
                withdrawal: 0,
                terminated: 0,
                graduated: 0
            };

            summaries.forEach(student => {
                const status = student.academicStatus || 'good';
                if (statusCounts[status] !== undefined) {
                    statusCounts[status]++;
                }
            });

            levelAnalysis[level] = {
                studentCount: summaries.length,
                averageGPA: parseFloat(averageGPA.toFixed(2)),
                averageCGPA: parseFloat(averageCGPA.toFixed(2)),
                highestGPA: results.gpaStatistics?.highest || 0,
                lowestGPA: results.gpaStatistics?.lowest || 0,
                
                // List counts
                passCount: lists.passList?.length || 0,
                probationCount: lists.probationList?.length || 0,
                withdrawalCount: lists.withdrawalList?.length || 0,
                terminationCount: lists.terminationList?.length || 0,
                
                // Academic status distribution
                academicStatusDistribution: statusCounts,
                
                // Carryover statistics
                carryoverStats: {
                    totalCarryovers: carryovers.totalCarryovers || 0,
                    affectedStudentsCount: carryovers.affectedStudentsCount || 0,
                    affectedStudents: (carryovers.affectedStudents || []).slice(0, 10)
                },
                
                // Grade distribution
                gradeDistribution: results.classDistribution || {
                    firstClass: 0, secondClassUpper: 0, secondClassLower: 0,
                    thirdClass: 0, pass: 0, fail: 0
                }
            };
        });

        return levelAnalysis;
    }

    /**
     * Generate recommendations based on computation results with level-based insights
     * @param {Object} summary - Computation summary
     * @returns {Array} List of recommendations
     */
    generateReportRecommendations(summary) {
        const recommendations = [];
        const totalStudents = summary.totalStudents || 1;

        // Convert Map fields for analysis
        const studentListsByLevel = this.convertMapToObject(summary.studentListsByLevel);
        const carryoverStatsByLevel = this.convertMapToObject(summary.carryoverStatsByLevel);
        const summaryOfResultsByLevel = this.convertMapToObject(summary.summaryOfResultsByLevel);

        // High overall probation rate
        const probationRate = (summary.probationList?.length || 0) / totalStudents;
        if (probationRate > 0.1) {
            recommendations.push({
                priority: "high",
                title: "High Probation Rate",
                description: `More than 10% of students (${summary.probationList?.length || 0}) are on probation.`,
                action: "Review academic support services and consider additional tutoring programs.",
                affectedLevels: this.getLevelsWithHighRate(studentListsByLevel, 'probationList', 0.1)
            });
        }

        // High overall carryover rate
        const carryoverRate = (summary.carryoverStats?.affectedStudentsCount || 0) / totalStudents;
        if (carryoverRate > 0.15) {
            recommendations.push({
                priority: "high",
                title: "High Carryover Rate",
                description: `${summary.carryoverStats?.affectedStudentsCount || 0} students (${(carryoverRate * 100).toFixed(1)}%) have carryover courses.`,
                action: "Review curriculum difficulty and consider course structure adjustments.",
                affectedLevels: this.getLevelsWithHighRate(carryoverStatsByLevel, 'affectedStudentsCount', 0.15, totalStudents)
            });
        }

        // High termination/withdrawal rate
        const criticalStudents = (summary.terminationList?.length || 0) + (summary.withdrawalList?.length || 0);
        const criticalRate = criticalStudents / totalStudents;
        if (criticalRate > 0.05) {
            recommendations.push({
                priority: "critical",
                title: "High Student Attrition",
                description: `${criticalStudents} students (${(criticalRate * 100).toFixed(1)}%) have been withdrawn or terminated.`,
                action: "Immediate review of academic policies and student support systems required.",
                affectedLevels: this.getLevelsWithHighCriticalRate(studentListsByLevel, totalStudents)
            });
        }

        // Low average GPA
        if (summary.averageGPA < 2.5) {
            recommendations.push({
                priority: "medium",
                title: "Below Average Performance",
                description: `Department average GPA is ${summary.averageGPA?.toFixed(2) || '0.00'}, below the recommended threshold.`,
                action: "Consider reviewing teaching methods and assessment strategies.",
                affectedLevels: this.getLevelsWithLowGPA(summaryOfResultsByLevel, 2.5)
            });
        }

        // Level-specific recommendations
        if (summaryOfResultsByLevel) {
            Object.entries(summaryOfResultsByLevel).forEach(([level, levelData]) => {
                const levelGPA = levelData.gpaStatistics?.average || 0;
                const levelStudents = levelData.totalStudents || 0;
                
                if (levelGPA < 2.0 && levelStudents > 10) {
                    recommendations.push({
                        priority: "medium",
                        title: `Low Performance in Level ${level}`,
                        description: `Level ${level} has average GPA of ${levelGPA.toFixed(2)}, significantly below department average.`,
                        action: `Focus interventions on Level ${level} students. Review course delivery and assessment for this level.`,
                        specificLevel: level
                    });
                }
            });
        }

        return recommendations;
    }

    /**
     * Send student notifications with level context
     * @param {Array} notifications - List of notifications
     */
    async sendStudentNotifications(notifications) {
        const notificationPromises = notifications.map(async (notification) => {
            if (notification.error) {
                return queueNotification(
                    "student",
                    notification.studentId,
                    "computation_failed",
                    `Dear ${notification.studentName}, your results computation for ${notification.activeSemesterName} in ${notification.departmentName} has failed. Reason: ${notification.errorMessage}. Please contact your HOD.`,
                    {
                        department: notification.departmentName,
                        semester: notification.activeSemesterName,
                        reason: notification.errorMessage
                    }
                );
            } else {
                let notificationType = "results_computed";
                let message = `Your ${capitalizeFirstLetter(notification.activeSemesterName)} semester results have been computed. GPA: ${notification.semesterGPA.toFixed(2)}, CGPA: ${notification.currentCGPA.toFixed(2)}.`;

                if (notification.studentCarryovers > 0) {
                    notificationType = "results_with_carryovers";
                    message += ` You have ${notification.studentCarryovers} carryover course(s).`;
                }

                if (notification.academicStanding.actionTaken) {
                    const action = notification.academicStanding.actionTaken.replace(/_/g, ' ');
                    message += ` Status: ${action}.`;
                    
                    // Add specific guidance based on academic standing
                    if (notification.academicStanding.remark === 'probation') {
                        message += ` You are placed on academic probation. Please meet with your academic advisor.`;
                    } else if (notification.academicStanding.remark === 'withdrawn') {
                        message += ` You have been withdrawn from the program. Please contact the department office.`;
                    } else if (notification.academicStanding.remark === 'terminated') {
                        message += ` You have been terminated from the program. Please contact the department office.`;
                    }
                }

                return queueNotification(
                    "specific",
                    notification.studentId,
                    notificationType,
                    message,
                    {
                        semester: notification.activeSemesterName,
                        gpa: notification.semesterGPA,
                        cgpa: notification.currentCGPA,
                        carryoverCount: notification.studentCarryovers,
                        probationStatus: notification.academicStanding.probationStatus,
                        terminationStatus: notification.academicStanding.terminationStatus,
                        academicStanding: notification.academicStanding.remark,
                        level: notification.level || 'unknown'
                    }
                );
            }
        });

        const results = await Promise.allSettled(notificationPromises);
        
        // Log results
        const successful = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;
        
        console.log(`✅ Sent ${successful} student notifications, ${failed} failed`);
        
        if (failed > 0) {
            console.error("Failed notifications:", results.filter(r => r.status === 'rejected').map(r => r.reason));
        }
    }

    /**
     * Get levels with high rate of a specific metric
     * @param {Object} levelData - Level-based data
     * @param {string} metricKey - Metric key to check
     * @param {number} threshold - Threshold rate
     * @param {number} totalStudents - Total students for normalization
     * @returns {Array} Levels with high rate
     */
    getLevelsWithHighRate(levelData, metricKey, threshold, totalStudents = null) {
        const highLevels = [];
        
        if (!levelData) return highLevels;
        
        Object.entries(levelData).forEach(([level, data]) => {
            const metricValue = data[metricKey] || 0;
            const levelStudents = data.totalStudents || data.studentCount || 0;
            
            if (levelStudents > 0) {
                const rate = metricValue / levelStudents;
                if (rate > threshold) {
                    highLevels.push({
                        level,
                        rate: parseFloat((rate * 100).toFixed(1)),
                        count: metricValue,
                        totalStudents: levelStudents
                    });
                }
            }
        });
        
        return highLevels;
    }

    /**
     * Get levels with high critical rate (withdrawal + termination)
     * @param {Object} studentListsByLevel - Student lists by level
     * @param {number} totalStudents - Total students
     * @returns {Array} Levels with high critical rate
     */
    getLevelsWithHighCriticalRate(studentListsByLevel, totalStudents) {
        const highLevels = [];
        
        if (!studentListsByLevel) return highLevels;
        
        Object.entries(studentListsByLevel).forEach(([level, lists]) => {
            const withdrawalCount = lists.withdrawalList?.length || 0;
            const terminationCount = lists.terminationList?.length || 0;
            const criticalCount = withdrawalCount + terminationCount;
            const levelStudents = lists.studentCount || 0;
            
            if (levelStudents > 0) {
                const rate = criticalCount / levelStudents;
                if (rate > 0.05) {
                    highLevels.push({
                        level,
                        rate: parseFloat((rate * 100).toFixed(1)),
                        withdrawalCount,
                        terminationCount,
                        totalStudents: levelStudents
                    });
                }
            }
        });
        
        return highLevels;
    }

    /**
     * Get levels with low GPA
     * @param {Object} summaryOfResultsByLevel - Results by level
     * @param {number} threshold - GPA threshold
     * @returns {Array} Levels with low GPA
     */
    getLevelsWithLowGPA(summaryOfResultsByLevel, threshold) {
        const lowLevels = [];
        
        if (!summaryOfResultsByLevel) return lowLevels;
        
        Object.entries(summaryOfResultsByLevel).forEach(([level, data]) => {
            const averageGPA = data.gpaStatistics?.average || 0;
            if (averageGPA < threshold && averageGPA > 0) {
                lowLevels.push({
                    level,
                    averageGPA: parseFloat(averageGPA.toFixed(2)),
                    studentCount: data.totalStudents || 0
                });
            }
        });
        
        return lowLevels;
    }

    /**
     * Helper function to convert Map to object
     * @param {Map|Object} mapField - Field that might be a Map or already an object
     * @returns {Object} Regular JavaScript object
     */
    convertMapToObject(mapField) {
        if (!mapField) return {};
        
        // If it's already an object, return it
        if (typeof mapField === 'object' && !(mapField instanceof Map)) {
            return mapField;
        }
        
        // If it's a Map, convert to object
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
     * Send batch notifications to multiple HODs about computation completion
     * @param {Array} departmentSummaries - Array of {department, semester, summary}
     */
    async sendBatchHODNotifications(departmentSummaries) {
        const notificationPromises = departmentSummaries.map(async ({ department, semester, summary }) => {
            try {
                await this.sendHODNotification(department, semester, summary);
            } catch (error) {
                console.error(`Failed to send HOD notification for ${department.name}:`, error);
                return { success: false, department: department.name, error: error.message };
            }
            return { success: true, department: department.name };
        });

        const results = await Promise.allSettled(notificationPromises);
        
        const successful = results.filter(r => r.status === 'fulfilled' && r.value?.success).length;
        const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value?.success)).length;
        
        console.log(`✅ Sent ${successful} HOD notifications, ${failed} failed`);
        
        return {
            total: departmentSummaries.length,
            successful,
            failed,
            details: results.map(r => r.status === 'fulfilled' ? r.value : { error: r.reason?.message || 'Unknown error' })
        };
    }

    /**
     * Generate and send summary report to admin
     * @param {string} masterComputationId - Master computation ID
     * @param {Object} admin - Admin user object
     */
    async sendAdminSummaryReport(masterComputationId, admin) {
        try {
            // Get master computation with all department summaries
            const masterComputation = await mongoose.model('MasterComputation')
                .findById(masterComputationId)
                .populate('semester', 'name academicYear')
                .lean();

            if (!masterComputation) {
                throw new Error(`Master computation ${masterComputationId} not found`);
            }

            // Get all department summaries
            const departmentSummaries = await ComputationSummary.find({
                masterComputationId: masterComputationId,
                status: { $in: ['completed', 'completed_with_errors'] }
            })
            .populate('department', 'name code')
            .populate('semester', 'name')
            .lean();

            // Build admin summary
            const adminMessage = this.buildAdminSummaryMessage(masterComputation, departmentSummaries);

            // Send notification to admin
            await queueNotification(
                "admin",
                admin._id,
                "all_departments_computed",
                adminMessage,
                {
                    masterComputationId,
                    totalDepartments: masterComputation.totalDepartments,
                    processedDepartments: masterComputation.departmentsProcessed,
                    semester: masterComputation.semester?.name,
                    overallAverageGPA: masterComputation.overallAverageGPA?.toFixed(2) || '0.00'
                }
            );

            console.log(`✅ Admin summary report sent for master computation ${masterComputationId}`);
        } catch (error) {
            console.error("Failed to send admin summary report:", error);
            throw error;
        }
    }

    /**
     * Build admin summary message
     * @param {Object} masterComputation - Master computation
     * @param {Array} departmentSummaries - Department summaries
     * @returns {string} Admin message
     */
    buildAdminSummaryMessage(masterComputation, departmentSummaries) {
        const semesterName = masterComputation.semester?.name || 'Unknown Semester';
        const academicYear = masterComputation.semester?.academicYear || 'Unknown Year';

        let message = `🏫 UNIVERSITY-WIDE RESULTS COMPUTATION SUMMARY
      
${semesterName} ${academicYear}
Total Departments: ${masterComputation.totalDepartments}
Processed Departments: ${masterComputation.departmentsProcessed}
Overall Average GPA: ${masterComputation.overallAverageGPA?.toFixed(2) || '0.00'}
Total Students: ${masterComputation.totalStudents || 0}
Total Carryovers: ${masterComputation.totalCarryovers || 0}
Failed Students: ${masterComputation.totalFailedStudents || 0}

📋 DEPARTMENT SUMMARY:\n`;

        // Add department breakdown
        departmentSummaries.forEach((summary, index) => {
            const deptName = summary.department?.name || `Department ${index + 1}`;
            const status = summary.status === 'completed_with_errors' ? '⚠️ With Errors' : '✅ Completed';
            
            message += `${index + 1}. ${deptName}: ${status}
   Students: ${summary.studentsWithResults || 0}/${summary.totalStudents || 0}
   Avg GPA: ${summary.averageGPA?.toFixed(2) || '0.00'}
   Carryovers: ${summary.carryoverStats?.totalCarryovers || 0}
   Failed: ${summary.failedStudents?.length || 0}\n`;
        });

        message += "\nView detailed reports in the administration dashboard.";

        return message;
    }
}

export default new ReportService();