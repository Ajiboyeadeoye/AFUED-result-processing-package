// computation/utils/computationConstants.js

export const ACADEMIC_RULES = {
  PROBATION_THRESHOLD: 1.50,
  TERMINATION_THRESHOLD: 1.00,
  PROBATION_SEMESTER_LIMIT: 2,
  CARRYOVER_LIMIT: 5,
  EXCELLENT_GPA: 4.50,
  GOOD_GPA: 2.00,
  BATCH_SIZE: 100,
  NOTIFICATION_BATCH_SIZE: 50
};

export const GRADE_POINTS = {
  A: 5,
  B: 4,
  C: 3,
  D: 2,
  E: 1,  // Added E grade
  F: 0
};

export const GRADE_BOUNDARIES = {
  A: 70,
  B: 60,
  C: 50,
  D: 45,
  E: 40,  // Added E: 40-44
  F: 0
};

export const COMPUTATION_STATUS = {
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  COMPLETED_WITH_ERRORS: 'completed_with_errors',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

export const STUDENT_STATUS = {
  NONE: 'none',
  PROBATION: 'probation',
  PROBATION_LIFTED: 'probation_lifted',
  WITHDRAWN: 'withdrawn',
  TERMINATED: 'terminated'
};

export const REMARK_CATEGORIES = {
  EXCELLENT: 'excellent',
  GOOD: 'good',
  PROBATION: 'probation',
  WITHDRAWN: 'withdrawn',
  TERMINATED: 'terminated'
};

export const BATCH_SIZE = 100;
export const NOTIFICATION_BATCH_SIZE = 100;

// New constants for grade system
export const GRADES = {
  A: 'A',
  B: 'B', 
  C: 'C',
  D: 'D',
  E: 'E',
  F: 'F'
};

export const PASSING_GRADES = ['A', 'B', 'C', 'D', 'E']; // E is a passing grade
export const FAILING_GRADE = 'F';