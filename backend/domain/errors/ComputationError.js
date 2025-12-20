// errors/ComputationError.js

class ComputationError extends Error {
  constructor(message, code = 'COMPUTATION_ERROR', details = null) {
    super(message);
    this.name = 'ComputationError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date();
  }

  static fromError(error, code = 'COMPUTATION_ERROR') {
    if (error instanceof ComputationError) return error;
    return new ComputationError(error.message, code, error);
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      timestamp: this.timestamp
    };
  }
}

// Specific error types
export class StudentProcessingError extends ComputationError {
  constructor(studentId, message, details = null) {
    super(`Student ${studentId} processing failed: ${message}`, 'STUDENT_PROCESSING_ERROR', details);
    this.studentId = studentId;
  }
}

export class DepartmentProcessingError extends ComputationError {
  constructor(departmentId, message, details = null) {
    super(`Department ${departmentId} processing failed: ${message}`, 'DEPARTMENT_PROCESSING_ERROR', details);
    this.departmentId = departmentId;
  }
}

export class CarryoverProcessingError extends ComputationError {
  constructor(courseId, message, details = null) {
    super(`Carryover for course ${courseId} failed: ${message}`, 'CARRYOVER_PROCESSING_ERROR', details);
    this.courseId = courseId;
  }
}

export default ComputationError;