// computation/services/AcademicStandingEngine.js
import { ACADEMIC_RULES, STUDENT_STATUS, REMARK_CATEGORIES } from "../utils/computationConstants.js";
import studentSemseterResultModel from "../../student/student.semseterResult.model.js";

class AcademicStandingEngine {
  /**
   * Determine academic standing for a student
   * @param {Object} student - Student object
   * @param {number} semesterGPA - Current semester GPA
   * @param {number} cgpa - Cumulative GPA
   * @param {number} carryoverCount - Number of carryovers
   * @param {string} currentSemesterId - Current semester ID
   * @returns {Promise<Object>} Academic standing decision
   */
  async determineAcademicStanding(student, semesterGPA, cgpa, carryoverCount, currentSemesterId) {
    let probationStatus = student.probationStatus || STUDENT_STATUS.NONE;
    let terminationStatus = student.terminationStatus || STUDENT_STATUS.NONE;
    let remark = REMARK_CATEGORIES.GOOD;
    let actionTaken = null;

    // Check for termination due to excessive carryovers
    if (carryoverCount >= ACADEMIC_RULES.CARRYOVER_LIMIT) {
      return this._handleTermination(terminationStatus, remark, actionTaken, "terminated_carryover_limit");
    }

    // Check CGPA termination rule (if on probation and CGPA below threshold)
    if (probationStatus === STUDENT_STATUS.PROBATION && cgpa < ACADEMIC_RULES.TERMINATION_THRESHOLD) {
      const shouldTerminate = await this._checkConsecutiveProbation(
        student._id,
        currentSemesterId,
        ACADEMIC_RULES.PROBATION_SEMESTER_LIMIT
      );

      if (shouldTerminate) {
        return this._handleWithdrawal(terminationStatus, remark, actionTaken, "withdrawn_cgpa_low");
      }
    }

    // Check for probation
    if (semesterGPA < ACADEMIC_RULES.PROBATION_THRESHOLD && terminationStatus === STUDENT_STATUS.NONE) {
      if (probationStatus === STUDENT_STATUS.NONE) {
        probationStatus = STUDENT_STATUS.PROBATION;
        actionTaken = "placed_on_probation";
      }
      remark = REMARK_CATEGORIES.PROBATION;
    }
    // Check for probation lifting
    else if (probationStatus === STUDENT_STATUS.PROBATION && semesterGPA >= ACADEMIC_RULES.GOOD_GPA) {
      probationStatus = STUDENT_STATUS.PROBATION_LIFTED;
      actionTaken = "probation_lifted";
      remark = REMARK_CATEGORIES.GOOD;
    }
    // Check for excellent performance
    else if (semesterGPA >= ACADEMIC_RULES.EXCELLENT_GPA) {
      remark = REMARK_CATEGORIES.EXCELLENT;
    }

    return {
      probationStatus,
      terminationStatus,
      remark,
      actionTaken
    };
  }

  /**
   * Optimized academic standing determination (without DB calls)
   * @param {Object} student - Student object
   * @param {number} semesterGPA - Current semester GPA
   * @param {number} currentCGPA - Cumulative GPA
   * @param {number} totalCarryovers - Total carryovers
   * @returns {Object} Academic standing
   */
  determineAcademicStandingOptimized(student, semesterGPA, currentCGPA, totalCarryovers) {
    const rules = {
      probation: currentCGPA < 1.5 || semesterGPA < 1.0,
      withdrawn: currentCGPA < 1.0 && student.level > 1,
      terminated: totalCarryovers > 8 || (currentCGPA < 0.5 && student.level > 2)
    };

    if (rules.terminated) {
      return {
        probationStatus: STUDENT_STATUS.NONE,
        terminationStatus: STUDENT_STATUS.TERMINATED,
        remark: REMARK_CATEGORIES.TERMINATED,
        actionTaken: "terminated_carryover_limit"
      };
    }

    if (rules.withdrawn) {
      return {
        probationStatus: STUDENT_STATUS.NONE,
        terminationStatus: STUDENT_STATUS.WITHDRAWN,
        remark: REMARK_CATEGORIES.WITHDRAWN,
        actionTaken: "withdrawn_cgpa_low"
      };
    }

    if (rules.probation) {
      return {
        probationStatus: STUDENT_STATUS.PROBATION,
        terminationStatus: STUDENT_STATUS.NONE,
        remark: REMARK_CATEGORIES.PROBATION,
        actionTaken: student.probationStatus === STUDENT_STATUS.NONE ? "placed_on_probation" : "probation_continued"
      };
    }

    if (currentCGPA >= 4.0) {
      return {
        probationStatus: STUDENT_STATUS.NONE,
        terminationStatus: STUDENT_STATUS.NONE,
        remark: REMARK_CATEGORIES.EXCELLENT,
        actionTaken: "none"
      };
    }

    if (currentCGPA >= 3.0) {
      return {
        probationStatus: STUDENT_STATUS.NONE,
        terminationStatus: STUDENT_STATUS.NONE,
        remark: REMARK_CATEGORIES.GOOD,
        actionTaken: "none"
      };
    }

    return {
      probationStatus: STUDENT_STATUS.NONE,
      terminationStatus: STUDENT_STATUS.NONE,
      remark: REMARK_CATEGORIES.GOOD,
      actionTaken: "none"
    };
  }

  /**
   * Check consecutive probation semesters
   * @param {string} studentId - Student ID
   * @param {string} currentSemesterId - Current semester ID
   * @param {number} limit - Probation semester limit
   * @returns {Promise<boolean>} True if should be terminated
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
   * Handle termination case
   * @param {string} terminationStatus - Current termination status
   * @param {string} remark - Current remark
   * @param {string} actionTaken - Action taken
   * @param {string} action - Specific action
   * @returns {Object} Updated standing
   */
  _handleTermination(terminationStatus, remark, actionTaken, action) {
    return {
      probationStatus: STUDENT_STATUS.NONE,
      terminationStatus: STUDENT_STATUS.TERMINATED,
      remark: REMARK_CATEGORIES.TERMINATED,
      actionTaken: action
    };
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