import buildResponse from "../../../utils/responseBuilder.js";
import departmentModel from "../../department/department.model.js";
import CarryoverCourse from "../../result/carryover.model.js";
import ComputationSummary from "../../result/computation.model.js";
import Semester from "../../semester/semester.model.js";
import studentModel from "../../student/student.model.js";

/**
 * Get detailed computation summary with student lists
 * @route GET /api/computation/hod/summary/:summaryId
 * @description HOD fetches detailed computation summary with populated student lists
 */
export const getHodComputationDetails = async (req, res) => {
    try {
        const hodId = req.user._id;
        const { summaryId } = req.params;
        
        // Get HOD's department first
        const department = await departmentModel.findOne({ 
            hod: hodId 
        }).select("_id name");
        
        if (!department) {
            return buildResponse(res, 404, "You are not assigned as HOD of any department");
        }
        
        // Find summary with department verification
        const summary = await ComputationSummary.findOne({
            _id: summaryId,
            department: department._id // Ensure HOD can only access their department
        })
            .populate("semester", "name academicYear isActive isLocked lockedAt lockedBy")
            .populate("computedBy", "name email role")
            .lean();

        if (!summary) {
            return buildResponse(res, 404, "Computation summary not found or access denied");
        }

        // Convert Map fields from MongoDB storage to objects for easier processing
        const processedSummary = {
            ...summary,
            // Convert Maps to objects for easier frontend consumption
            studentSummariesByLevel: convertMapToObject(summary.studentSummariesByLevel),
            keyToCoursesByLevel: convertMapToObject(summary.keyToCoursesByLevel),
            studentListsByLevel: convertMapToObject(summary.studentListsByLevel),
            carryoverStatsByLevel: convertMapToObject(summary.carryoverStatsByLevel),
            summaryOfResultsByLevel: convertMapToObject(summary.summaryOfResultsByLevel),
            masterSheetDataByLevel: convertMapToObject(summary.masterSheetDataByLevel)
        };

        // Get student IDs from all level-based lists for additional population
        const allStudentIds = new Set();
        
        // Collect student IDs from level-based lists
        if (processedSummary.studentListsByLevel) {
            Object.values(processedSummary.studentListsByLevel).forEach(levelLists => {
                if (levelLists.passList) {
                    levelLists.passList.forEach(item => {
                        if (item.studentId) allStudentIds.add(item.studentId.toString());
                    });
                }
                if (levelLists.probationList) {
                    levelLists.probationList.forEach(item => {
                        if (item.studentId) allStudentIds.add(item.studentId.toString());
                    });
                }
                if (levelLists.withdrawalList) {
                    levelLists.withdrawalList.forEach(item => {
                        if (item.studentId) allStudentIds.add(item.studentId.toString());
                    });
                }
                if (levelLists.terminationList) {
                    levelLists.terminationList.forEach(item => {
                        if (item.studentId) allStudentIds.add(item.studentId.toString());
                    });
                }
                if (levelLists.carryoverStudents) {
                    levelLists.carryoverStudents.forEach(item => {
                        if (item.studentId) allStudentIds.add(item.studentId.toString());
                    });
                }
            });
        }

        // Also collect from backward compatible lists
        if (processedSummary.passList) {
            processedSummary.passList.forEach(item => {
                if (item.studentId) allStudentIds.add(item.studentId.toString());
            });
        }
        if (processedSummary.probationList) {
            processedSummary.probationList.forEach(item => {
                if (item.studentId) allStudentIds.add(item.studentId.toString());
            });
        }
        if (processedSummary.withdrawalList) {
            processedSummary.withdrawalList.forEach(item => {
                if (item.studentId) allStudentIds.add(item.studentId.toString());
            });
        }
        if (processedSummary.terminationList) {
            processedSummary.terminationList.forEach(item => {
                if (item.studentId) allStudentIds.add(item.studentId.toString());
            });
        }

        // Get student details in batch
        const studentIdsArray = Array.from(allStudentIds);
        const studentDetails = await studentModel.find({
            _id: { $in: studentIdsArray }
        })
        .populate("_id", "name email")
        .select("matricNumber name level cgpa gpa probationStatus terminationStatus totalCarryovers")
        .lean();

        // Create student lookup map
        const studentMap = studentDetails.reduce((acc, student) => {
            acc[student._id.toString()] = {
                ...student,
                name: student._id?.name || student.name,
                email: student._id?.email
            };
            return acc;
        }, {});

        // Enrich level-based lists with student details
        if (processedSummary.studentListsByLevel) {
            Object.keys(processedSummary.studentListsByLevel).forEach(level => {
                const levelLists = processedSummary.studentListsByLevel[level];
                
                // Enrich each list type
                ['passList', 'probationList', 'withdrawalList', 'terminationList', 'carryoverStudents'].forEach(listType => {
                    if (levelLists[listType]) {
                        levelLists[listType] = levelLists[listType].map(item => {
                            const studentInfo = item.studentId ? studentMap[item.studentId.toString()] : null;
                            return {
                                ...item,
                                studentInfo: studentInfo ? {
                                    name: studentInfo.name,
                                    email: studentInfo.email,
                                    level: studentInfo.level,
                                    cgpa: studentInfo.cgpa,
                                    gpa: studentInfo.gpa,
                                    probationStatus: studentInfo.probationStatus,
                                    terminationStatus: studentInfo.terminationStatus,
                                    totalCarryovers: studentInfo.totalCarryovers
                                } : null
                            };
                        });
                    }
                });
            });
        }

        // Enrich backward compatible lists
        ['passList', 'probationList', 'withdrawalList', 'terminationList'].forEach(listType => {
            if (processedSummary[listType]) {
                processedSummary[listType] = processedSummary[listType].map(item => {
                    const studentInfo = item.studentId ? studentMap[item.studentId.toString()] : null;
                    return {
                        ...item,
                        studentInfo: studentInfo ? {
                            name: studentInfo.name,
                            email: studentInfo.email,
                            level: studentInfo.level,
                            cgpa: studentInfo.cgpa,
                            gpa: studentInfo.gpa
                        } : null
                    };
                });
            }
        });

        // Get top performers from all students
        const topPerformers = studentDetails
            .sort((a, b) => (b.gpa || 0) - (a.gpa || 0))
            .slice(0, 5)
            .map(student => ({
                matricNumber: student.matricNumber,
                name: student._id?.name || student.name,
                level: student.level,
                cgpa: student.cgpa,
                gpa: student.gpa
            }));

        // Get carryover courses breakdown by level
        const carryoverBreakdownByLevel = {};
        
        // Use level-based carryover stats if available
        if (processedSummary.carryoverStatsByLevel) {
            Object.entries(processedSummary.carryoverStatsByLevel).forEach(([level, stats]) => {
                if (stats.affectedStudents && stats.affectedStudents.length > 0) {
                    carryoverBreakdownByLevel[level] = {
                        totalCarryovers: stats.totalCarryovers,
                        affectedStudentsCount: stats.affectedStudentsCount,
                        courses: {}
                    };
                    
                    // Count courses by level
                    stats.affectedStudents.forEach(student => {
                        if (student.courses && Array.isArray(student.courses)) {
                            student.courses.forEach(course => {
                                const courseId = course._id?.toString() || course.toString();
                                if (!carryoverBreakdownByLevel[level].courses[courseId]) {
                                    carryoverBreakdownByLevel[level].courses[courseId] = {
                                        courseId: course._id || course,
                                        studentCount: 0,
                                        students: []
                                    };
                                }
                                carryoverBreakdownByLevel[level].courses[courseId].studentCount++;
                                carryoverBreakdownByLevel[level].courses[courseId].students.push({
                                    studentId: student.studentId,
                                    matricNumber: student.matricNumber,
                                    name: student.name
                                });
                            });
                        }
                    });
                }
            });
        }

        // Convert courses objects to arrays for easier consumption
        Object.keys(carryoverBreakdownByLevel).forEach(level => {
            if (carryoverBreakdownByLevel[level].courses) {
                carryoverBreakdownByLevel[level].courses = Object.values(carryoverBreakdownByLevel[level].courses);
            }
        });

        return buildResponse(res, 200, "Detailed computation summary retrieved", {
            summary: processedSummary,
            analytics: {
                topPerformers,
                carryoverBreakdownByLevel,
                overallCarryoverStats: processedSummary.carryoverStats,
                gradeDistribution: processedSummary.gradeDistribution || {},
                levelStats: processedSummary.additionalMetrics?.levelStats || {}
            }
        });
        
    } catch (error) {
        console.error("Error fetching detailed computation summary:", error);
        return buildResponse(res, 500, "Failed to fetch computation details", null, true, error);
    }
};

/**
 * Get list of semesters with available computations
 * @route GET /api/computation/hod/semesters
 * @description HOD fetches list of semesters that have computation summaries
 */
export const getHodComputationSemesters = async (req, res) => {
    try {
        const hodId = req.user._id;
        
        // Get HOD's department
        const department = await departmentModel.findOne({ 
            hod: hodId 
        }).select("_id name");
        
        if (!department) {
            return buildResponse(res, 404, "You are not assigned as HOD of any department");
        }
        
        // Get unique semesters with computations
        const semesters = await ComputationSummary.aggregate([
            {
                $match: {
                    department: department._id,
                    status: { $in: ["completed", "completed_with_errors"] }
                }
            },
            {
                $group: {
                    _id: "$semester",
                    latestComputation: { $max: "$createdAt" },
                    totalComputations: { $sum: 1 },
                    successfulComputations: {
                        $sum: {
                            $cond: [{ $eq: ["$status", "completed"] }, 1, 0]
                        }
                    },
                    // Get preview/final counts
                    previewComputations: {
                        $sum: {
                            $cond: [{ $eq: ["$isPreview", true] }, 1, 0]
                        }
                    },
                    finalComputations: {
                        $sum: {
                            $cond: [{ $eq: ["$isPreview", false] }, 1, 0]
                        }
                    }
                }
            },
            {
                $lookup: {
                    from: "semesters",
                    localField: "_id",
                    foreignField: "_id",
                    as: "semesterInfo"
                }
            },
            { $unwind: "$semesterInfo" },
            {
                $project: {
                    semesterId: "$_id",
                    semesterName: "$semesterInfo.name",
                    academicYear: "$semesterInfo.academicYear",
                    isActive: "$semesterInfo.isActive",
                    isLocked: "$semesterInfo.isLocked",
                    latestComputation: 1,
                    totalComputations: 1,
                    successfulComputations: 1,
                    previewComputations: 1,
                    finalComputations: 1
                }
            },
            { $sort: { latestComputation: -1 } }
        ]);
        
        // Get active semester separately
        const activeSemester = await Semester.findOne({
            department: department._id,
            isActive: true
        }).select("_id name academicYear");
        
        // Get latest computation summary for active semester
        let activeSemesterComputation = null;
        if (activeSemester) {
            activeSemesterComputation = await ComputationSummary.findOne({
                department: department._id,
                semester: activeSemester._id,
                status: { $in: ["completed", "completed_with_errors"] }
            })
            .sort({ createdAt: -1 })
            .select("_id status isPreview purpose startedAt completedAt")
            .lean();
        }
        
        return buildResponse(res, 200, "Semesters with computations retrieved", {
            department,
            activeSemester,
            activeSemesterComputation,
            semesters,
            hasComputations: semesters.length > 0
        });
        
    } catch (error) {
        console.error("Error fetching computation semesters:", error);
        return buildResponse(res, 500, "Failed to fetch semesters", null, true, error);
    }
};

/**
 * Get latest computation summary for HOD's department
 * @route GET /api/computation/hod/summary
 * @description HOD fetches latest computation summary for their department
 * @param {string} semester_id - Optional semester ID, falls back to latest
 */
export const getHodComputationSummary = async (req, res) => {
    try {
        const hodId = req.user._id;
        const { semester_id: semesterId, level, includeDetails = false } = req.query;
        
        // 1. Get HOD's department
        const department = await departmentModel.findOne({ 
            hod: hodId,
            // status: "active" // optional
        });
        
        if (!department) {
            return buildResponse(res, 404, "You are not assigned as HOD of any department");
        }
        
        // 2. Build query
        const query = {
            department: department._id,
            status: { $in: ["completed", "completed_with_errors", "processing"] }
        };
        
        // 3. If semester_id provided, use it; otherwise get latest
        if (semesterId) {
            query.semester = semesterId;
        }
        
        // 4. Find computation summary
        const computationSummary = await ComputationSummary.findOne(query)
            .populate("semester", "name academicYear isActive isLocked")
            .populate("computedBy", "name email")
            .sort({ createdAt: -1 })
            .lean();
        
        // 5. If no summary found with semester_id, fallback to latest
        if (!computationSummary && semesterId) {
            delete query.semester; // Remove semester filter
            
            const fallbackSummary = await ComputationSummary.findOne(query)
                .populate("semester", "name academicYear isActive isLocked")
                .populate("computedBy", "name email")
                .sort({ createdAt: -1 })
                .lean();
            
            if (!fallbackSummary) {
                return buildResponse(res, 404, "No computation summary found for your department");
            }
            
            return buildResponse(res, 200, "Computation summary retrieved (using latest as fallback)", {
                summary: processComputationSummaryForResponse(fallbackSummary, level, includeDetails),
                usedFallback: true,
                requestedSemesterId: semesterId,
                message: `No computation found for specified semester. Showing latest from ${fallbackSummary.semester.name}`
            });
        }
        
        if (!computationSummary) {
            return buildResponse(res, 404, "No computation summary found for your department");
        }
        
        return buildResponse(res, 200, "Computation summary retrieved", {
            summary: processComputationSummaryForResponse(computationSummary, level, includeDetails),
            usedFallback: false
        });
        
    } catch (error) {
        console.error("Error fetching HOD computation summary:", error);
        return buildResponse(res, 500, "Failed to fetch computation summary", null, true, error);
    }
};

/**
 * Get computation history for HOD's department
 * @route GET /api/computation/hod/history
 * @description HOD fetches computation history for their department
 */
export const getHodComputationHistory = async (req, res) => {
    try {
        const hodId = req.user._id;
        const { 
            page = 1, 
            limit = 10, 
            status, 
            semester_id: semesterId,
            isPreview,
            purpose,
            level 
        } = req.query;
        const skip = (page - 1) * limit;
        
        // Get HOD's department
        const department = await departmentModel.findOne({ 
            hod: hodId 
        }).select("_id name");
        
        if (!department) {
            return buildResponse(res, 404, "You are not assigned as HOD of any department");
        }
        
        // Build query
        const query = { department: department._id };
        if (status) query.status = status;
        if (semesterId) query.semester = semesterId;
        if (isPreview !== undefined) query.isPreview = isPreview === 'true';
        if (purpose) query.purpose = purpose;
        
        // Get summaries with pagination
        const [summaries, total] = await Promise.all([
            ComputationSummary.find(query)
                .populate("semester", "name academicYear isActive isLocked")
                .populate("computedBy", "name email")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            ComputationSummary.countDocuments(query)
        ]);
        
        // Process each summary for response
        const processedSummaries = summaries.map(summary => 
            processComputationSummaryForResponse(summary, level)
        );
        
        // Get active semester info
        const activeSemester = await Semester.findOne({
            department: department._id,
            isActive: true
        }).select("_id name");
        
        return buildResponse(res, 200, "Computation history retrieved", {
            department,
            activeSemester,
            summaries: processedSummaries,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / limit),
                totalItems: total,
                itemsPerPage: parseInt(limit)
            }
        });
        
    } catch (error) {
        console.error("Error fetching HOD computation history:", error);
        return buildResponse(res, 500, "Failed to fetch computation history", null, true, error);
    }
};

/**
 * Get computation summary statistics by level
 * @route GET /api/computation/hod/level-stats/:summaryId
 * @description HOD fetches level-based statistics for a computation summary
 */
export const getHodComputationLevelStats = async (req, res) => {
    try {
        const hodId = req.user._id;
        const { summaryId } = req.params;
        const { level } = req.query;
        
        // Get HOD's department
        const department = await departmentModel.findOne({ 
            hod: hodId 
        }).select("_id name");
        
        if (!department) {
            return buildResponse(res, 404, "You are not assigned as HOD of any department");
        }
        
        // Find summary with department verification
        const summary = await ComputationSummary.findOne({
            _id: summaryId,
            department: department._id
        })
        .populate("semester", "name academicYear")
        .lean();
        
        if (!summary) {
            return buildResponse(res, 404, "Computation summary not found or access denied");
        }
        
        // Convert Map fields
        const processedSummary = {
            ...summary,
            studentSummariesByLevel: convertMapToObject(summary.studentSummariesByLevel),
            keyToCoursesByLevel: convertMapToObject(summary.keyToCoursesByLevel),
            studentListsByLevel: convertMapToObject(summary.studentListsByLevel),
            carryoverStatsByLevel: convertMapToObject(summary.carryoverStatsByLevel),
            summaryOfResultsByLevel: convertMapToObject(summary.summaryOfResultsByLevel)
        };
        
        // If specific level requested, return only that level
        if (level) {
            const levelData = {
                studentSummaries: processedSummary.studentSummariesByLevel[level] || [],
                keyToCourses: processedSummary.keyToCoursesByLevel[level] || [],
                studentLists: processedSummary.studentListsByLevel[level] || {
                    passList: [],
                    probationList: [],
                    withdrawalList: [],
                    terminationList: [],
                    carryoverStudents: []
                },
                carryoverStats: processedSummary.carryoverStatsByLevel[level] || {
                    totalCarryovers: 0,
                    affectedStudentsCount: 0,
                    affectedStudents: []
                },
                summaryOfResults: processedSummary.summaryOfResultsByLevel[level] || {
                    totalStudents: 0,
                    studentsWithResults: 0,
                    gpaStatistics: { average: 0, highest: 0, lowest: 0, standardDeviation: 0 },
                    classDistribution: {
                        firstClass: 0, secondClassUpper: 0, secondClassLower: 0,
                        thirdClass: 0, pass: 0, fail: 0
                    }
                }
            };
            
            return buildResponse(res, 200, "Level-specific computation data retrieved", {
                summaryId,
                semester: summary.semester,
                level,
                data: levelData
            });
        }
        
        // Return all levels
        const levelStats = {};
        Object.keys(processedSummary.summaryOfResultsByLevel || {}).forEach(lvl => {
            levelStats[lvl] = {
                summary: processedSummary.summaryOfResultsByLevel[lvl],
                studentCount: processedSummary.studentSummariesByLevel[lvl]?.length || 0,
                passCount: processedSummary.studentListsByLevel[lvl]?.passList?.length || 0,
                probationCount: processedSummary.studentListsByLevel[lvl]?.probationList?.length || 0,
                withdrawalCount: processedSummary.studentListsByLevel[lvl]?.withdrawalList?.length || 0,
                terminationCount: processedSummary.studentListsByLevel[lvl]?.terminationList?.length || 0,
                carryoverCount: processedSummary.carryoverStatsByLevel[lvl]?.totalCarryovers || 0,
                affectedStudentsCount: processedSummary.carryoverStatsByLevel[lvl]?.affectedStudentsCount || 0
            };
        });
        
        return buildResponse(res, 200, "All level statistics retrieved", {
            summaryId,
            semester: summary.semester,
            levelStats,
            totalLevels: Object.keys(levelStats).length
        });
        
    } catch (error) {
        console.error("Error fetching computation level stats:", error);
        return buildResponse(res, 500, "Failed to fetch level statistics", null, true, error);
    }
};

/**
 * Get master sheet data for a computation summary
 * @route GET /api/computation/hod/master-sheet/:summaryId
 * @description HOD fetches master sheet data for a computation summary
 */
export const getHodMasterSheetData = async (req, res) => {
    try {
        const hodId = req.user._id;
        const { summaryId } = req.params;
        const { level, format = 'json' } = req.query; // json, pdf, excel
        
        // Get HOD's department
        const department = await departmentModel.findOne({ 
            hod: hodId 
        }).select("_id name");
        
        if (!department) {
            return buildResponse(res, 404, "You are not assigned as HOD of any department");
        }
        
        // Find summary with department verification
        const summary = await ComputationSummary.findOne({
            _id: summaryId,
            department: department._id
        })
        .populate("semester", "name academicYear")
        .lean();
        
        if (!summary) {
            return buildResponse(res, 404, "Computation summary not found or access denied");
        }
        
        // Check if master sheet is generated
        if (!summary.masterSheetGenerated && !summary.masterSheetDataByLevel) {
            return buildResponse(res, 400, "Master sheet not generated for this computation");
        }
        
        // Convert Map fields
        const processedSummary = {
            ...summary,
            masterSheetDataByLevel: convertMapToObject(summary.masterSheetDataByLevel)
        };
        
        // If specific level requested
        if (level) {
            const levelData = processedSummary.masterSheetDataByLevel[level];
            if (!levelData) {
                return buildResponse(res, 404, `No master sheet data found for level ${level}`);
            }
            
            if (format === 'json') {
                return buildResponse(res, 200, `Master sheet data for level ${level}`, {
                    summaryId,
                    semester: summary.semester,
                    level,
                    data: levelData
                });
            }
            
            // For PDF/Excel generation, we would call MasterSheetService here
            // This would be implemented separately
            return buildResponse(res, 501, "PDF/Excel export not yet implemented", {
                message: "Export functionality coming soon"
            });
        }
        
        // Return all levels
        return buildResponse(res, 200, "Master sheet data retrieved", {
            summaryId,
            semester: summary.semester,
            masterSheetDataByLevel: processedSummary.masterSheetDataByLevel,
            masterSheetGenerated: summary.masterSheetGenerated,
            masterSheetGeneratedAt: summary.masterSheetGeneratedAt
        });
        
    } catch (error) {
        console.error("Error fetching master sheet data:", error);
        return buildResponse(res, 500, "Failed to fetch master sheet data", null, true, error);
    }
};

/**
 * Helper function to process computation summary for response
 * @param {Object} summary - Raw computation summary from DB
 * @param {string} level - Optional level filter
 * @param {boolean} includeDetails - Whether to include detailed data
 * @returns {Object} Processed summary for response
 */
function processComputationSummaryForResponse(summary, level = null, includeDetails = false) {
    if (!summary) return null;
    
    // Convert Map fields to objects
    const processedSummary = {
        ...summary,
        studentSummariesByLevel: convertMapToObject(summary.studentSummariesByLevel),
        keyToCoursesByLevel: convertMapToObject(summary.keyToCoursesByLevel),
        studentListsByLevel: convertMapToObject(summary.studentListsByLevel),
        carryoverStatsByLevel: convertMapToObject(summary.carryoverStatsByLevel),
        summaryOfResultsByLevel: convertMapToObject(summary.summaryOfResultsByLevel),
        masterSheetDataByLevel: convertMapToObject(summary.masterSheetDataByLevel)
    };
    
    // If level is specified, filter to only that level
    if (level) {
        const levelData = {
            studentSummaries: processedSummary.studentSummariesByLevel[level] || [],
            keyToCourses: processedSummary.keyToCoursesByLevel[level] || [],
            studentLists: processedSummary.studentListsByLevel[level] || {
                passList: [], probationList: [], withdrawalList: [], terminationList: [], carryoverStudents: []
            },
            carryoverStats: processedSummary.carryoverStatsByLevel[level] || {
                totalCarryovers: 0, affectedStudentsCount: 0, affectedStudents: []
            },
            summaryOfResults: processedSummary.summaryOfResultsByLevel[level] || null
        };
        
        return {
            ...processedSummary,
            levelData: {
                [level]: levelData
            },
            // Include overall stats as well
            totalStudents: processedSummary.totalStudents,
            studentsWithResults: processedSummary.studentsWithResults,
            averageGPA: processedSummary.averageGPA,
            highestGPA: processedSummary.highestGPA,
            lowestGPA: processedSummary.lowestGPA,
            gradeDistribution: processedSummary.gradeDistribution,
            isLevelSpecific: true,
            requestedLevel: level
        };
    }
    
    // If not including details, remove large data fields
    if (!includeDetails) {
        const { 
            studentSummariesByLevel, 
            keyToCoursesByLevel, 
            studentListsByLevel,
            masterSheetDataByLevel,
            ...lightSummary 
        } = processedSummary;
        
        // Keep only counts, not the actual data
        const levelCounts = {};
        Object.keys(studentSummariesByLevel || {}).forEach(lvl => {
            levelCounts[lvl] = {
                studentCount: studentSummariesByLevel[lvl]?.length || 0,
                passCount: studentListsByLevel[lvl]?.passList?.length || 0,
                probationCount: studentListsByLevel[lvl]?.probationList?.length || 0,
                withdrawalCount: studentListsByLevel[lvl]?.withdrawalList?.length || 0,
                terminationCount: studentListsByLevel[lvl]?.terminationList?.length || 0
            };
        });
        
        return {
            ...lightSummary,
            levelCounts,
            hasDetails: true, // Indicates that details are available via other endpoints
            detailsEndpoint: `/api/computation/hod/summary/${summary._id}`
        };
    }
    
    return processedSummary;
}

/**
 * Helper function to convert Map to object for JSON serialization
 * @param {Map|Object} mapField - Field that might be a Map or already an object
 * @returns {Object} Regular JavaScript object
 */
function convertMapToObject(mapField) {
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

// Add this helper function
export function fixNestedKeyToCoursesStructure(data) {
  console.log('🔧 [FIX] Checking keyToCourses structure...');
  
  if (!data || typeof data !== 'object') {
    console.log('  No data to fix');
    return {};
  }
  
  const fixedData = {};
  
  for (const level in data) {
    const value = data[level];
    
    if (Array.isArray(value)) {
      // Already correct
      fixedData[level] = value;
      console.log(`  ✅ Level ${level}: Already correct array with ${value.length} items`);
    } else if (value && typeof value === 'object') {
      // Check if it's nested like {"100": [...]}
      if (value[level] && Array.isArray(value[level])) {
        // Extract the array from nested structure
        fixedData[level] = value[level];
        console.log(`  🔧 Level ${level}: Fixed nested structure, extracted ${value[level].length} items`);
      } else {
        // Try to find any array in the object
        const subArrays = Object.values(value).filter(v => Array.isArray(v));
        if (subArrays.length > 0) {
          fixedData[level] = subArrays[0];
          console.log(`  🔧 Level ${level}: Extracted first array found with ${subArrays[0].length} items`);
        } else {
          fixedData[level] = [];
          console.log(`  ⚠️ Level ${level}: No array found, setting to empty`);
        }
      }
    } else {
      fixedData[level] = [];
      console.log(`  ⚠️ Level ${level}: Invalid type (${typeof value}), setting to empty`);
    }
  }
  
  return fixedData;
}