// middlewares/paymentRestriction.js
import { CourseRestrictionService } from '../domain/payment/courseRestriction.service.js';
import buildResponse from '../utils/responseBuilder.js';

/**
 * Middleware to check payment requirements before allowing an action
 * @param {string} activity - The activity to check (e.g., 'COURSE_REGISTRATION')
 * @param {Object} options - Additional options
 * @returns {Function} Express middleware
 */
export const requirePayment = (activity, options = {}) => {
  return async (req, res, next) => {
    try {
      const studentId = req.user?._id;
      
      // Only apply to students
      if (!req.user || !req.user.roles?.includes('student')) {
        return next();
      }

      const restrictionService = new CourseRestrictionService();
      const session = req.query.session || req.body.session || options.session;
      
      // Check permission
      const permission = await restrictionService.checkPermission(studentId, activity, session);
      
      if (!permission.allowed && permission.restrictionLevel === 'STRICT') {
        return buildResponse.error(
          res,
          permission.message,
          403,
          {
            restrictionType: permission.type,
            requiredPayments: permission.requiredPayments,
            studentId,
            activity,
            timestamp: new Date().toISOString()
          }
        );
      }

      // For relaxed restrictions, add warning to request
      if (!permission.allowed && permission.restrictionLevel === 'RELAXED') {
        req.paymentWarning = permission;
      }

      // Store permission info for logging
      req.paymentPermission = permission;
      
      next();
    } catch (error) {
      console.error('Payment restriction middleware error:', error);
      
      // On error, decide based on fail-safe option
      if (options.failSafe !== false) {
        // Allow access on error (fail-safe)
        console.warn('Payment restriction check failed, allowing access as fail-safe');
        next();
      } else {
        // Block access on error
        return buildResponse.error(
          res,
          'Unable to verify payment status',
          500,
          { 
            error: error.message,
            activity,
            timestamp: new Date().toISOString()
          }
        );
      }
    }
  };
};

/**
 * Middleware specifically for course registration
 */
export const requireSchoolFeesForCourses = () => {
  return requirePayment('COURSE_REGISTRATION', {
    failSafe: false, // Strict - block if check fails
    message: 'School fees payment required for course registration'
  });
};

/**
 * Middleware for exam registration
 */
export const requireExamFees = () => {
  return requirePayment('EXAM_REGISTRATION', {
    failSafe: false,
    message: 'School fees and examination fee required for exam registration'
  });
};

/**
 * Middleware for hostel allocation
 */
export const requireHostelFees = () => {
  return requirePayment('HOSTEL_ALLOCATION', {
    failSafe: true, // Relaxed - allow even if check fails
    message: 'Hostel fees recommended for hostel allocation'
  });
};

/**
 * Middleware for transcript request
 */
export const requireTranscriptFees = () => {
  return requirePayment('TRANSCRIPT_REQUEST', {
    failSafe: false,
    message: 'School fees and transcript fee required for transcript request'
  });
};

/**
 * Middleware for certificate collection
 */
export const requireCertificateFees = () => {
  return requirePayment('CERTIFICATE_COLLECTION', {
    failSafe: false,
    message: 'All required fees must be paid for certificate collection'
  });
};

/**
 * Get student payment summary middleware
 */
export const getPaymentSummary = async (req, res, next) => {
  try {
    const studentId = req.user?._id;
    
    if (!studentId || !req.user.roles?.includes('student')) {
      return next();
    }

    const restrictionService = new CourseRestrictionService();
    const session = req.query.session || req.body.session;
    
    const summary = await restrictionService.getPaymentSummary(studentId, session);
    
    // Attach summary to request for use in controllers
    req.paymentSummary = summary;
    
    next();
  } catch (error) {
    console.error('Payment summary middleware error:', error);
    next(); // Continue without summary
  }
};

/**
 * Check course registration eligibility
 */
export const checkCourseEligibility = async (req, res, next) => {
  try {
    const studentId = req.user?._id;
    const { courseIds } = req.body;
    
    if (!studentId || !req.user.roles?.includes('student')) {
      return next();
    }

    const restrictionService = new CourseRestrictionService();
    const session = req.query.session || req.body.session;
    
    const eligibility = await restrictionService.checkCourseRegistrationEligibility(
      studentId,
      Array.isArray(courseIds) ? courseIds : [],
      session
    );
    
    req.courseEligibility = eligibility;
    
    // If not eligible, block the request
    if (!eligibility.eligible) {
      return buildResponse.error(
        res,
        eligibility.reason,
        403,
        {
          eligibility,
          suggestedAction: eligibility.suggestedAction || 'Contact bursary department',
          timestamp: new Date().toISOString()
        }
      );
    }
    
    next();
  } catch (error) {
    console.error('Course eligibility check error:', error);
    return buildResponse.error(
      res,
      'Unable to verify course registration eligibility',
      500,
      { 
        error: error.message,
        timestamp: new Date().toISOString()
      }
    );
  }
};

/**
 * Check if student has paid all mandatory fees
 */
export const requireAllMandatoryFees = async (req, res, next) => {
  try {
    const studentId = req.user?._id;
    
    if (!studentId || !req.user.roles?.includes('student')) {
      return next();
    }

    const restrictionService = new CourseRestrictionService();
    const session = req.query.session || req.body.session;
    
    const mandatoryCheck = await restrictionService.hasPaidAllMandatoryFees(studentId, session);
    
    if (!mandatoryCheck.paid) {
      return buildResponse.error(
        res,
        mandatoryCheck.message,
        403,
        {
          missingFee: mandatoryCheck.missingFee,
          requiredAction: `Pay ${mandatoryCheck.missingFee?.replace('_', ' ')?.toLowerCase()}`,
          timestamp: new Date().toISOString()
        }
      );
    }
    
    req.mandatoryFeesPaid = true;
    next();
  } catch (error) {
    console.error('Mandatory fees check error:', error);
    return buildResponse.error(
      res,
      'Unable to verify mandatory fees',
      500,
      { 
        error: error.message,
        timestamp: new Date().toISOString()
      }
    );
  }
};

/**
 * Batch check permissions middleware
 */
export const batchCheckPermissions = async (req, res, next) => {
  try {
    const studentId = req.user?._id;
    const { activities } = req.body;
    
    if (!studentId || !req.user.roles?.includes('student')) {
      return next();
    }

    if (!Array.isArray(activities) || activities.length === 0) {
      return buildResponse.error(
        res,
        'Please specify activities to check',
        400,
        { timestamp: new Date().toISOString() }
      );
    }

    const restrictionService = new CourseRestrictionService();
    const session = req.query.session || req.body.session;
    
    const permissions = await restrictionService.batchCheckPermissions(
      studentId,
      activities,
      session
    );
    
    req.batchPermissions = permissions;
    next();
  } catch (error) {
    console.error('Batch permissions check error:', error);
    return buildResponse.error(
      res,
      'Unable to check permissions',
      500,
      { 
        error: error.message,
        timestamp: new Date().toISOString()
      }
    );
  }
};

export default {
  requirePayment,
  requireSchoolFeesForCourses,
  requireExamFees,
  requireHostelFees,
  requireTranscriptFees,
  requireCertificateFees,
  getPaymentSummary,
  checkCourseEligibility,
  requireAllMandatoryFees,
  batchCheckPermissions
};