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
            .populate({
                path: "passList.studentId",
                select: "matricNumber name level cgpa",
                populate: {
                    path: "_id",
                    select: "name email"
                }
            })
            .populate({
                path: "probationList.studentId",
                select: "matricNumber name level cgpa probationStatus",
                populate: {
                    path: "_id",
                    select: "name email"
                }
            })
            .populate({
                path: "withdrawalList.studentId",
                select: "matricNumber name level cgpa terminationStatus",
                populate: {
                    path: "_id",
                    select: "name email"
                }
            })
            .populate({
                path: "terminationList.studentId",
                select: "matricNumber name level cgpa terminationStatus",
                populate: {
                    path: "_id",
                    select: "name email"
                }
            })
            .populate({
                path: "carryoverStats.affectedStudents.studentId",
                select: "matricNumber name level totalCarryovers",
                populate: {
                    path: "_id",
                    select: "name email"
                }
            })
            .lean();
        
        if (!summary) {
            return buildResponse(res, 404, "Computation summary not found or access denied");
        }
        
        // Get additional statistics
        const studentIds = [
            ...(summary.passList || []).map(item => item.studentId?._id),
            ...(summary.probationList || []).map(item => item.studentId?._id),
            ...(summary.withdrawalList || []).map(item => item.studentId?._id),
            ...(summary.terminationList || []).map(item => item.studentId?._id)
        ].filter(id => id);
        
        // Get top performers
        const topPerformers = await studentModel.find({
            _id: { $in: studentIds }
        })
        .populate("_id", "name")
        .select("matricNumber name level cgpa gpa")
        .sort({ gpa: -1 })
        .limit(5)
        .lean();
        
        // Get carryover courses breakdown
        const carryoverBreakdown = await CarryoverCourse.aggregate([
            {
                $match: {
                    department: department._id,
                    semester: summary.semester._id,
                    cleared: false
                }
            },
            {
                $group: {
                    _id: "$course",
                    studentCount: { $sum: 1 }
                }
            },
            {
                $lookup: {
                    from: "courses",
                    localField: "_id",
                    foreignField: "_id",
                    as: "course"
                }
            },
            { $unwind: "$course" },
            {
                $project: {
                    courseCode: "$course.courseCode",
                    courseTitle: "$course.title",
                    courseUnit: "$course.unit",
                    studentCount: 1
                }
            },
            { $sort: { studentCount: -1 } },
            { $limit: 10 }
        ]);
        
        return buildResponse(res, 200, "Detailed computation summary retrieved", {
            summary,
            analytics: {
                topPerformers,
                carryoverBreakdown,
                gradeDistribution: summary.gradeDistribution || {},
                levelStats: summary.additionalMetrics?.levelStats || {}
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
                    successfulComputations: 1
                }
            },
            { $sort: { latestComputation: -1 } }
        ]);
        
        // Get active semester separately
        const activeSemester = await Semester.findOne({
            department: department._id,
            isActive: true
        }).select("_id name academicYear");
        
        return buildResponse(res, 200, "Semesters with computations retrieved", {
            department,
            activeSemester,
            semesters,
            hasComputations: semesters.length > 0
        });
        
    } catch (error) {
        console.error("Error fetching computation semesters:", error);
        return buildResponse(res, 500, "Failed to fetch semesters", null, true, error);
    }
};

// computation.controller.js

/**
 * Get latest computation summary for HOD's department
 * @route GET /api/computation/hod/summary
 * @description HOD fetches latest computation summary for their department
 * @param {string} semester_id - Optional semester ID, falls back to latest
 */
export const getHodComputationSummary = async (req, res) => {
    try {
        const hodId = req.user._id;
        const { semester_id: semesterId } = req.query;
        
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
            status: { $in: ["completed", "completed_with_errors", "processing"] } // Only completed computations
        };
        
        // 3. If semester_id provided, use it; otherwise get latest
        if (semesterId) {
            query.semester = semesterId;
        }
        
        // 4. Find computation summary
        const computationSummary = await ComputationSummary.findOne(query)
            .populate("semester", "name academicYear isActive isLocked")
            .populate("computedBy", "name email")
            .sort({ createdAt: -1 }) // Get most recent first
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
                summary: fallbackSummary,
                usedFallback: true,
                requestedSemesterId: semesterId,
                message: `No computation found for specified semester. Showing latest from ${fallbackSummary.semester.name}`
            });
        }
        
        if (!computationSummary) {
            return buildResponse(res, 404, "No computation summary found for your department");
        }
        
        return buildResponse(res, 200, "Computation summary retrieved", {
            summary: computationSummary,
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
        const { page = 1, limit = 10, status, semester_id } = req.query;
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
        if (semester_id) query.semester = semester_id;
        
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
        
        // Get active semester info
        const activeSemester = await Semester.findOne({
            department: department._id,
            isActive: true
        }).select("_id name");
        
        return buildResponse(res, 200, "Computation history retrieved", {
            department,
            activeSemester,
            summaries,
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