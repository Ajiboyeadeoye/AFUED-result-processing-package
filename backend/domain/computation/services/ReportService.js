// computation/services/ReportService.js
import { capitalizeFirstLetter } from "../../../utils/StringUtils.js";
import { queueNotification } from "../../../workers/department.queue.js";
import ComputationSummary from "../../result/computation.model.js";
// import ComputationReport from "../../result/computationReport.model.js"; // Assume this model exists

class ReportService {
    /**
     * Send HOD notification about computation completion
     * @param {Object} department - Department object
     * @param {Object} semester - Semester object
     * @param {Object} summary - Computation summary
     */
    async sendHODNotification(department, semester, summary) {
        if (!department.hod) return;

        const message = `📊 RESULTS COMPUTATION COMPLETE - ${department.name}
      
${capitalizeFirstLetter(semester.name)} Semester
Processed: ${summary.studentsWithResults}/${summary.totalStudents} students
Average GPA: ${summary.averageGPA?.toFixed(2) || '0.00'}

🎓 STUDENT LISTS:
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
                terminationListCount: summary.terminationList?.length || 0
            }
        );
    }

    /**
     * Generate computation report asynchronously
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
     * Generate comprehensive computation report
     * @param {string} summaryId - Summary ID
     * @param {Object} data - Report data
     */
    async generateComputationReport(summaryId, data) {
        try {
            const summary = await ComputationSummary.findById(summaryId)
                .populate('department', 'name code')
                .populate('semester', 'name')
                .populate('passList.studentId', 'matricNumber name')
                .populate('probationList.studentId', 'matricNumber name')
                .populate('withdrawalList.studentId', 'matricNumber name')
                .populate('terminationList.studentId', 'matricNumber name')
                .populate('carryoverStats.affectedStudents.studentId', 'matricNumber name')
                .lean();

            if (!summary) {
                throw new Error(`Summary ${summaryId} not found`);
            }

            const reportData = {
                title: `Academic Results Computation Report - ${data.department.name}`,
                semester: data.semester.name,
                generatedAt: new Date(),
                executiveSummary: {
                    totalStudents: summary.totalStudents,
                    processedStudents: summary.studentsProcessed,
                    successRate: ((summary.studentsProcessed / summary.totalStudents) * 100).toFixed(1) + '%',
                    averageGPA: summary.averageGPA,
                    highestGPA: summary.highestGPA,
                    lowestGPA: summary.lowestGPA
                },
                studentLists: {
                    passList: {
                        count: summary.passList?.length || 0,
                        students: (summary.passList || []).map(s => ({
                            matricNumber: s.matricNumber,
                            name: s.name,
                            gpa: s.gpa
                        }))
                    },
                    probationList: {
                        count: summary.probationList?.length || 0,
                        students: (summary.probationList || []).map(s => ({
                            matricNumber: s.matricNumber,
                            name: s.name,
                            gpa: s.gpa,
                            remarks: s.remarks
                        }))
                    },
                    withdrawalList: {
                        count: summary.withdrawalList?.length || 0,
                        students: (summary.withdrawalList || []).map(s => ({
                            matricNumber: s.matricNumber,
                            name: s.name,
                            reason: s.reason,
                            remarks: s.remarks
                        }))
                    },
                    terminationList: {
                        count: summary.terminationList?.length || 0,
                        students: (summary.terminationList || []).map(s => ({
                            matricNumber: s.matricNumber,
                            name: s.name,
                            reason: s.reason,
                            remarks: s.remarks
                        }))
                    }
                },
                analysis: {
                    gradeDistribution: summary.gradeDistribution,
                    carryoverAnalysis: summary.carryoverStats,
                    levelPerformance: summary.additionalMetrics?.levelStats || {},
                    failedStudents: summary.failedStudents?.length || 0
                },
                recommendations: this.generateReportRecommendations(summary)
            };

            // Store report
            //   await ComputationReport.create({
            //     computationSummary: summaryId,
            //     reportData,
            //     generatedBy: summary.computedBy,
            //     status: "generated",
            //     createdAt: new Date()
            //   });

            console.log(`Generated comprehensive report for summary ${summaryId}`);
        } catch (error) {
            console.error("Failed to generate report:", error);
            throw error;
        }
    }

    /**
     * Generate recommendations based on computation results
     * @param {Object} summary - Computation summary
     * @returns {Array} List of recommendations
     */
    generateReportRecommendations(summary) {
        const recommendations = [];
        const totalStudents = summary.totalStudents || 1;

        // High probation rate
        const probationRate = (summary.probationList?.length || 0) / totalStudents;
        if (probationRate > 0.1) {
            recommendations.push({
                priority: "high",
                title: "High Probation Rate",
                description: `More than 10% of students (${summary.probationList?.length || 0}) are on probation. Consider implementing academic support programs.`,
                action: "Review academic support services and consider additional tutoring programs."
            });
        }

        // High carryover rate
        const carryoverRate = (summary.carryoverStats?.affectedStudentsCount || 0) / totalStudents;
        if (carryoverRate > 0.15) {
            recommendations.push({
                priority: "high",
                title: "High Carryover Rate",
                description: `${summary.carryoverStats?.affectedStudentsCount || 0} students (${(carryoverRate * 100).toFixed(1)}%) have carryover courses.`,
                action: "Review curriculum difficulty and consider course structure adjustments."
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
                action: "Immediate review of academic policies and student support systems required."
            });
        }

        // Low average GPA
        if (summary.averageGPA < 2.5) {
            recommendations.push({
                priority: "medium",
                title: "Below Average Performance",
                description: `Department average GPA is ${summary.averageGPA?.toFixed(2) || '0.00'}, below the recommended threshold.`,
                action: "Consider reviewing teaching methods and assessment strategies."
            });
        }

        return recommendations;
    }

    /**
     * Send student notifications
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
                    message += ` Status: ${notification.academicStanding.actionTaken.replace(/_/g, ' ')}.`;
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
                        terminationStatus: notification.academicStanding.terminationStatus
                    }
                );
            }
        });

        await Promise.allSettled(notificationPromises);
    }
}

export default new ReportService();