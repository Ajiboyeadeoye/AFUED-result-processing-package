// computation/services/AcademicStandingEngine.js
import { ACADEMIC_RULES, STUDENT_STATUS, REMARK_CATEGORIES } from "../utils/computationConstants.js";
import studentSemseterResultModel from "../../student/student.semseterResult.model.js";
import courseRegistrationModel from "../../course/courseRegistration.model.js";

class AcademicStandingEngine {

  /**
   * Optimized academic standing determination (without DB calls)
   * @param {Object} student - Student object
   * @param {number} semesterGPA - Current semester GPA
   * @param {number} currentCGPA - Cumulative GPA
   * @param {number} totalCarryovers - Total carryovers
   * @param {boolean} isFinal - Whether this is final computation
   * @returns {Object} Academic standing
   */
  async determineAcademicStanding(student, semesterGPA, currentCGPA, totalCarryovers, semesterId, isFinal = true) {
    // Check non-registration first
    const nonRegResult = await this._handleNonRegistration(student, semesterId, isFinal);
    if (nonRegResult) {
      console.log("nonRegResult")
      return nonRegResult;
    }

    // For non-final computations, just calculate the status without actions
    if (!isFinal) {
      return this._getPreviewStanding(student, semesterGPA, currentCGPA, totalCarryovers, semesterId);
    }

    // Rules based on refined requirements
    const rules = {
      withdrawal: currentCGPA < 1.0 && student.level > 1,
      probation: currentCGPA < 1.5 || semesterGPA < 1.0,
      excellent: currentCGPA >= 4.0,
      good: currentCGPA >= 3.0
    };

    // Withdrawal has highest priority
    if (rules.withdrawal) {
      return {
        probationStatus: STUDENT_STATUS.NONE,
        terminationStatus: STUDENT_STATUS.WITHDRAWN,
        remark: REMARK_CATEGORIES.WITHDRAWN,
        actionTaken: "withdrawn_cgpa_low"
      };
    }

    // Probation check
    if (rules.probation) {
      return {
        probationStatus: STUDENT_STATUS.PROBATION,
        terminationStatus: STUDENT_STATUS.NONE,
        remark: REMARK_CATEGORIES.PROBATION,
        actionTaken: student.probationStatus === STUDENT_STATUS.NONE ? "placed_on_probation" : "probation_continued"
      };
    }

    // Performance remarks
    if (rules.excellent) {
      return {
        probationStatus: STUDENT_STATUS.NONE,
        terminationStatus: STUDENT_STATUS.NONE,
        remark: REMARK_CATEGORIES.EXCELLENT,
        actionTaken: "none"
      };
    }

    if (rules.good) {
      return {
        probationStatus: STUDENT_STATUS.NONE,
        terminationStatus: STUDENT_STATUS.NONE,
        remark: REMARK_CATEGORIES.GOOD,
        actionTaken: "none"
      };
    }

    // Default standing
    return {
      probationStatus: STUDENT_STATUS.NONE,
      terminationStatus: STUDENT_STATUS.NONE,
      remark: REMARK_CATEGORIES.GOOD,
      actionTaken: "none"
    };
  }

  /**
   * Get preview standing without changing actual statuses (optimized version)
   */
  _getPreviewStanding(student, semesterGPA, currentCGPA, totalCarryovers) {
    const rules = {
      withdrawal: currentCGPA < 1.0 && student.level > 100,
      probation: currentCGPA < 1.5 || semesterGPA < 1.0,
      excellent: currentCGPA >= 4.0,
      good: currentCGPA >= 3.0
    };


    if (rules.withdrawal) {
      return {
        probationStatus: STUDENT_STATUS.NONE,
        terminationStatus: STUDENT_STATUS.WITHDRAWN,
        remark: REMARK_CATEGORIES.WITHDRAWN,
        actionTaken: "would_be_withdrawn_cgpa_low",
        isPreview: true
      };
    }

    if (rules.probation) {
      const data = {
        probationStatus: STUDENT_STATUS.PROBATION,
        terminationStatus: STUDENT_STATUS.NONE,
        remark: REMARK_CATEGORIES.PROBATION,
        actionTaken: student.probationStatus === STUDENT_STATUS.NONE ? "would_be_placed_on_probation" : "probation_continued",
        isPreview: true
      };
      return data
    }

    if (rules.excellent) {
      return {
        probationStatus: STUDENT_STATUS.NONE,
        terminationStatus: STUDENT_STATUS.NONE,
        remark: REMARK_CATEGORIES.EXCELLENT,
        actionTaken: "none",
        isPreview: true
      };
    }

    if (rules.good) {
      return {
        probationStatus: STUDENT_STATUS.NONE,
        terminationStatus: STUDENT_STATUS.NONE,
        remark: REMARK_CATEGORIES.GOOD,
        actionTaken: "none",
        isPreview: true
      };
    }

    return {
      probationStatus: STUDENT_STATUS.NONE,
      terminationStatus: STUDENT_STATUS.NONE,
      remark: REMARK_CATEGORIES.GOOD,
      actionTaken: "none",
      isPreview: true
    };
  }

  /**
   * Check consecutive probation semesters
   * @param {string} studentId - Student ID
   * @param {string} currentSemesterId - Current semester ID
   * @param {number} limit - Probation semester limit
   * @returns {Promise<boolean>} True if should be withdrawn
   */
  async _checkConsecutiveProbation(studentId, currentSemesterId, limit) {
    try {
      const previousResults = await studentSemseterResultModel.find({
        studentId,
        semesterId: { $ne: currentSemesterId }
      }).sort({ createdAt: -1 }).limit(limit);

      const consecutiveProbationCount = previousResults.filter(r =>
        r.remark === REMARK_CATEGORIES.PROBATION || r.gpa < ACADEMIC_RULES.PROBATION_THRESHOLD
      ).length;

      return consecutiveProbationCount >= limit - 1;
    } catch (error) {
      console.error(`Error checking consecutive probation for student ${studentId}:`, error);
      return false;
    }
  }

  /**
   * Handle withdrawal case
   * @param {string} terminationStatus - Current termination status
   * @param {string} remark - Current remark
   * @param {string} actionTaken - Action taken
   * @param {string} action - Specific action
   * @returns {Object} Updated standing
   */
  _handleWithdrawal(terminationStatus, remark, actionTaken, action) {
    return {
      probationStatus: STUDENT_STATUS.NONE,
      terminationStatus: STUDENT_STATUS.WITHDRAWN,
      remark: REMARK_CATEGORIES.WITHDRAWN,
      actionTaken: action
    };
  }

  /**
   * Check if student did not register for current semester
   */
  async _didNotRegister(studentId, currentSemesterId) {
    const record = await courseRegistrationModel.exists({
      student: studentId,
      semester: currentSemesterId
    });
    return !record;
  }

  /**
   * Handle non-registration cases
   */
  async _handleNonRegistration(student, currentSemesterId, isFinal) {
    const didNotRegister = await this._didNotRegister(
      student._id,
      currentSemesterId
    );

    if (!didNotRegister) return null;

    // Check existing suspension status
    if (student.suspension?.status) {
      // Second offense → terminate
      if (student.suspension.reason === "NO_REGISTRATION") {
        return {
          probationStatus: STUDENT_STATUS.NONE,
          terminationStatus: STUDENT_STATUS.TERMINATED,
          remark: REMARK_CATEGORIES.TERMINATED,
          actionTaken: isFinal
            ? "terminated_non_registration"
            : "would_be_terminated_non_registration",
          isPreview: !isFinal,
          reason: "No Registration Data"
        };
      }

      // School-approved suspension → respect it
      if (student.suspension.reason === "SCHOOL_APPROVED") {
        return {
          probationStatus: STUDENT_STATUS.NONE,
          terminationStatus: STUDENT_STATUS.NONE,
          remark: REMARK_CATEGORIES.SUSPENDED,
          actionTaken: "school_approved_suspension_respected",
          isPreview: !isFinal
        };
      }
    }

    // First offense → suspend
    return {
      probationStatus: STUDENT_STATUS.NONE,
      terminationStatus: STUDENT_STATUS.NONE,
      remark: REMARK_CATEGORIES.SUSPENDED,
      reason: "Suspended due to no registration data",
      actionTaken: isFinal
        ? "suspended_no_registration"
        : "would_be_suspended_no_registration",
      suspension: {
        status: true,
        reason: "NO_REGISTRATION",
        sinceSemesterId: currentSemesterId
      },
      isPreview: !isFinal
    };
  }

  /**
   * Validate academic standing data
   * @param {Object} standing - Academic standing object
   * @returns {boolean} True if valid
   */
  validateStanding(standing) {
    const requiredFields = ['probationStatus', 'terminationStatus', 'remark'];
    return requiredFields.every(field => standing[field] !== undefined);
  }
}

export default new AcademicStandingEngine();