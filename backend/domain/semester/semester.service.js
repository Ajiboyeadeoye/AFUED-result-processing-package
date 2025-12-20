import mongoose from "mongoose";
import Semester from "./semester.model.js";
import { AcademicSemester } from "./semester.academicModel.js";

/**
 * ======================================================
 * SEMESTER SERVICE (Production-safe)
 * ------------------------------------------------------
 * Enhanced service layer WITHOUT breaking existing code
 * ======================================================
 */

const SemesterService = {

    /**
     * --------------------------------------------------
     * GET ACTIVE ACADEMIC SEMESTER (School-wide)
     * --------------------------------------------------
     */
    async getActiveAcademicSemester(session = null) {
        return AcademicSemester.findOne({ isActive: true }).session(session);
    },

    /**
     * --------------------------------------------------
     * GET ACTIVE SEMESTER FOR A DEPARTMENT
     * --------------------------------------------------
     */
    async getActiveDepartmentSemester(departmentId, session = null) {
        if (!departmentId) throw new Error("Department ID is required");

        return Semester.findOne({
            department: departmentId,
            isActive: true
        })
            .populate("academicSemester")
            .session(session);
    },

    /**
     * --------------------------------------------------
     * CREATE A NEW ACADEMIC SEMESTER
     * --------------------------------------------------
     */
    async createAcademicSemester({
        name,
        sessionYear,
        createdBy,
        session = null
    }) {
        if (!name || !sessionYear) {
            throw new Error("Semester name and session are required");
        }

        return AcademicSemester.create(
            [{
                name,
                session: sessionYear,
                isActive: false,
                createdBy
            }],
            { session }
        ).then(res => res[0]);
    },

    /**
     * --------------------------------------------------
     * CREATE DEPARTMENT SEMESTERS
     * --------------------------------------------------
     */
    async createDepartmentSemester({
        academicSemesterId,
        departmentId,
        name,
        sessionYear,
        levelSettings,
        createdBy,
        registrationDeadline,
        lateRegistrationDate,
        session = null
    }) {
        if (!academicSemesterId || !departmentId) {
            throw new Error("Academic semester and department are required");
        }

        return Semester.create(
            [{
                academicSemester: academicSemesterId,
                department: departmentId,
                name,
                session: sessionYear,
                levelSettings,
                isActive: false,
                isRegistrationOpen: false,
                isResultsPublished: false,
                registrationDeadline,
                lateRegistrationDate,
                createdBy
            }],
            { session }
        ).then(res => res[0]);
    },

    /**
     * --------------------------------------------------
     * ACTIVATE ACADEMIC SEMESTER
     * --------------------------------------------------
     */
    async activateAcademicSemester(academicSemesterId, session = null) {
        if (!academicSemesterId) {
            throw new Error("AcademicSemester ID is required");
        }

        await AcademicSemester.updateMany(
            { isActive: true },
            { isActive: false, endDate: new Date() },
            { session }
        );

        return AcademicSemester.findByIdAndUpdate(
            academicSemesterId,
            { isActive: true, startDate: new Date() },
            { new: true, session }
        );
    },

    /**
     * --------------------------------------------------
     * ACTIVATE A DEPARTMENT SEMESTER
     * --------------------------------------------------
     */
    async activateDepartmentSemester(semesterId, session = null) {
        if (!semesterId) throw new Error("Semester ID is required");

        const semester = await Semester.findById(semesterId).session(session);
        if (!semester) throw new Error("Semester not found");

        await Semester.updateMany(
            {
                department: semester.department,
                isActive: true
            },
            { isActive: false, endDate: new Date() },
            { session }
        );

        semester.isActive = true;
        semester.startDate = new Date();
        await semester.save({ session });

        return semester;
    },

    /**
     * --------------------------------------------------
     * OPEN / CLOSE COURSE REGISTRATION
     * --------------------------------------------------
     */
    async setRegistrationState({
        semesterId,
        isOpen,
        session = null
    }) {
        if (!semesterId) throw new Error("Semester ID is required");

        return Semester.findByIdAndUpdate(
            semesterId,
            { isRegistrationOpen: isOpen },
            { new: true, session }
        );
    },

    /**
     * --------------------------------------------------
     * PUBLISH / UNPUBLISH RESULTS
     * --------------------------------------------------
     */
    async setResultPublicationState({
        semesterId,
        isPublished,
        session = null
    }) {
        if (!semesterId) throw new Error("Semester ID is required");

        return Semester.findByIdAndUpdate(
            semesterId,
            { isResultsPublished: isPublished },
            { new: true, session }
        );
    },

    /**
     * --------------------------------------------------
     * LOCK A SEMESTER (No more mutations)
     * --------------------------------------------------
     */
    async lockSemester(semesterId, session = null) {
        if (!semesterId) throw new Error("Semester ID is required");

        return Semester.findByIdAndUpdate(
            semesterId,
            { isLocked: true },
            { new: true, session }
        );
    },

    /**
     * --------------------------------------------------
     * GET LEVEL SETTINGS FOR A STUDENT LEVEL
     * --------------------------------------------------
     */
    async getLevelSettings({
        semesterId,
        level
    }) {
        if (!semesterId || !level) {
            throw new Error("Semester ID and level are required");
        }

        const semester = await Semester.findById(semesterId).lean();
        if (!semester) throw new Error("Semester not found");

        return semester.levelSettings.find(ls => ls.level === level);
    },

    /**
     * --------------------------------------------------
     * VALIDATE REGISTRATION WINDOW
     * --------------------------------------------------
     */
    async canRegister(semesterId) {
        const semester = await Semester.findById(semesterId).lean();
        if (!semester) return false;

        const now = new Date();

        if (!semester.isRegistrationOpen) return false;
        if (semester.registrationDeadline && now > semester.registrationDeadline) {
            return now <= semester.lateRegistrationDate;
        }

        return true;
    },

    /**
     * --------------------------------------------------
     * NEW: UPDATE MULTIPLE SEMESTERS' REGISTRATION STATE
     * --------------------------------------------------
     */
    async updateRegistrationForDepartments({
        departmentIds,
        isOpen,
        userId,
        session = null
    }) {
        if (!departmentIds || !Array.isArray(departmentIds)) {
            throw new Error("Department IDs array is required");
        }

        const updateData = { isRegistrationOpen: isOpen };
        if (userId) {
            updateData.updatedBy = userId;
        }

        return Semester.updateMany(
            { department: { $in: departmentIds }, isActive: true },
            updateData,
            { session }
        );
    },

    /**
     * --------------------------------------------------
     * NEW: UPDATE MULTIPLE SEMESTERS' RESULT PUBLICATION
     * --------------------------------------------------
     */
    async updateResultPublicationForDepartments({
        departmentIds,
        isPublished,
        userId,
        session = null
    }) {
        if (!departmentIds || !Array.isArray(departmentIds)) {
            throw new Error("Department IDs array is required");
        }

        const updateData = { isResultsPublished: isPublished };
        if (userId) {
            updateData.updatedBy = userId;
        }

        return Semester.updateMany(
            { department: { $in: departmentIds }, isActive: true },
            updateData,
            { session }
        );
    },

    /**
     * --------------------------------------------------
     * NEW: GET DEPARTMENT SEMESTERS
     * --------------------------------------------------
     */
    async getDepartmentSemesters(departmentId) {
        if (!departmentId) throw new Error("Department ID is required");

        return Semester.find({ department: departmentId })
            .sort({ createdAt: -1 })
            .populate('department', 'name code')
            .populate('createdBy', 'firstName lastName');
    },

    /**
     * --------------------------------------------------
     * NEW: UPDATE SEMESTER SETTINGS
     * --------------------------------------------------
     */
    async updateSemesterSettings({
        semesterId,
        levelSettings,
        registrationDeadline,
        lateRegistrationDate,
        userId,
        session = null
    }) {
        if (!semesterId) throw new Error("Semester ID is required");

        const updateData = {};

        if (levelSettings) {
            updateData.levelSettings = levelSettings;
        }

        if (registrationDeadline) {
            updateData.registrationDeadline = new Date(registrationDeadline);
        }

        if (lateRegistrationDate) {
            updateData.lateRegistrationDate = new Date(lateRegistrationDate);
        }

        if (userId) {
            updateData.updatedBy = userId;
        }

        // Validate deadline dates
        if (registrationDeadline && lateRegistrationDate) {
            const deadline = new Date(registrationDeadline);
            const lateDate = new Date(lateRegistrationDate);
            if (lateDate <= deadline) {
                throw new Error("Late registration date must be after the registration deadline");
            }
        }

        return Semester.findByIdAndUpdate(
            semesterId,
            updateData,
            { new: true, session }
        );
    },

    /**
     * --------------------------------------------------
     * NEW: DEACTIVATE SEMESTER
     * --------------------------------------------------
     */
    async deactivateSemester(semesterId, userId = null, session = null) {
        if (!semesterId) throw new Error("Semester ID is required");

        const updateData = {
            isActive: false,
            endDate: new Date(),
            isRegistrationOpen: false,
            isResultsPublished: false
        };

        if (userId) {
            updateData.updatedBy = userId;
        }

        return Semester.findByIdAndUpdate(
            semesterId,
            updateData,
            { new: true, session }
        );
    },

    // Add to semester.service.js

    /**
     * --------------------------------------------------
     * GET SEMESTER BY ID
     * --------------------------------------------------
     */
    async getSemesterById(semesterId, session = null) {
        if (!semesterId) throw new Error("Semester ID is required");

        return Semester.findById(semesterId)
            .select("name session startDate endDate isActive")
            .populate("academicSemester", "name session")
            .populate("department", "name code")
            .session(session);
    },

    /**
     * --------------------------------------------------
     * GET ACADEMIC SEMESTER BY ID
     * --------------------------------------------------
     */
    async getAcademicSemesterById(academicSemesterId, session = null) {
        if (!academicSemesterId) throw new Error("Academic Semester ID is required");

        return AcademicSemester.findById(academicSemesterId)
            .select("name session startDate endDate isActive")
            .session(session);
    },

};

export default SemesterService;