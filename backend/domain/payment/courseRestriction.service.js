// domain/payment/courseRestriction.service.js
import Payment from './payment.model.js';
import User from '../user/user.model.js';


export class CourseRestrictionService {
  isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}
    constructor() {
    // Define payment requirements for different academic activities
    this.requirements = {
      // COURSE REGISTRATION - Strict requirement
      COURSE_REGISTRATION: {
        strict: true,
        requiredPayments: ['SCHOOL_FEES'],
        message: 'Course registration requires school fees payment',
        validate: async (studentId, session) => {
            return await this.hasPaidSchoolFees(studentId, session);
        if (!this.isValidObjectId(studentId)) {
    console.warn(`Invalid studentId: ${studentId}`);
    return false;
}
        }
        
      },
      
      // EXAM REGISTRATION - Strict requirement
      EXAM_REGISTRATION: {
        strict: true,
        requiredPayments: ['SCHOOL_FEES', 'EXAMINATION_FEE'],
        message: 'Exam registration requires school fees and examination fee',
        validate: async (studentId, session) => {
          return await this.hasPaidExamFees(studentId, session);
        }
      },
      
      // HOSTEL ALLOCATION - Optional
      HOSTEL_ALLOCATION: {
        strict: false,
        requiredPayments: ['SCHOOL_FEES', 'HOSTEL_FEE'],
        message: 'Hostel allocation requires school fees and hostel fee',
        validate: async (studentId, session) => {
          return await this.hasPaidHostelFees(studentId, session);
        }
      },
      
      // TRANSCRIPT REQUEST
      TRANSCRIPT_REQUEST: {
        strict: true,
        requiredPayments: ['SCHOOL_FEES', 'TRANSCRIPT_FEE'],
        message: 'Transcript requires school fees and transcript fee',
        validate: async (studentId, session) => {
          return await this.hasPaidTranscriptFees(studentId, session);
        }
      },
      
      // LIBRARY ACCESS
      LIBRARY_ACCESS: {
        strict: false,
        requiredPayments: ['SCHOOL_FEES', 'LIBRARY_FEE'],
        message: 'Library access requires school fees and library fee',
        validate: async (studentId, session) => {
          return await this.hasPaidLibraryFees(studentId, session);
        }
      },
      
      // MEDICAL ACCESS
      MEDICAL_ACCESS: {
        strict: false,
        requiredPayments: ['SCHOOL_FEES', 'MEDICAL_FEE'],
        message: 'Medical access requires school fees and medical fee',
        validate: async (studentId, session) => {
          return await this.hasPaidMedicalFees(studentId, session);
        }
      },
      
      // CERTIFICATE COLLECTION
      CERTIFICATE_COLLECTION: {
        strict: true,
        requiredPayments: ['SCHOOL_FEES', 'EXAMINATION_FEE', 'CERTIFICATE_FEE'],
        message: 'Certificate collection requires school fees, examination fee, and certificate fee',
        validate: async (studentId, session) => {
          return await this.hasPaidCertificateFees(studentId, session);
        }
      }
    };
  }

  /**
   * Check if student can perform an academic activity
   * @param {string} studentId - Student's ID
   * @param {string} activity - Activity type (e.g., 'COURSE_REGISTRATION')
   * @param {string} session - Academic session (optional)
   * @returns {Object} - Permission result
   */
  async checkPermission(studentId, activity, session = null) {
    try {
      const requirement = this.requirements[activity];
      
      if (!requirement) {
        return {
          allowed: true,
          message: 'No restrictions for this activity'
        };
      }

      // Get current session if not provided
      const currentSession = session || await this.getCurrentAcademicSession();
      
      // Validate payment requirements
      const isValid = await requirement.validate(studentId, currentSession);
      
      if (!isValid && requirement.strict) {
        return {
          allowed: false,
          type: 'PAYMENT_RESTRICTION',
          message: requirement.message,
          requiredPayments: requirement.requiredPayments,
          restrictionLevel: 'STRICT'
        };
      } else if (!isValid && !requirement.strict) {
        return {
          allowed: true, // Relaxed restrictions allow access
          type: 'WARNING',
          message: `${requirement.message} - Proceeding with limited access`,
          requiredPayments: requirement.requiredPayments,
          restrictionLevel: 'RELAXED'
        };
      }

      return {
        allowed: true,
        type: 'PERMISSION_GRANTED',
        message: 'All payment requirements satisfied'
      };

    } catch (error) {
      console.error('Permission check error:', error);
      return {
        allowed: false,
        type: 'ERROR',
        message: 'Failed to verify permissions',
        error: error.message
      };
    }
  }

  /**
   * Check if student has paid school fees
   */
  async hasPaidSchoolFees(studentId, session) {
    try {
      const payment = await Payment.findOne({
        payer: studentId,
        feeType: 'SCHOOL_FEES',
        status: 'SUCCEEDED',
        academicSession: session
      });
      
      return !!payment;
    } catch (error) {
      console.error('School fees check error:', error);
      return false;
    }
  }

  /**
   * Check if student has paid exam fees
   */
  async hasPaidExamFees(studentId, session) {
    try {
      const schoolFees = await this.hasPaidSchoolFees(studentId, session);
      if (!schoolFees) return false;

      const examPayment = await Payment.findOne({
        payer: studentId,
        feeType: 'EXAMINATION_FEE',
        status: 'SUCCEEDED',
        academicSession: session
      });
      
      return !!examPayment;
    } catch (error) {
      console.error('Exam fees check error:', error);
      return false;
    }
  }

  /**
   * Check if student has paid hostel fees
   */
  async hasPaidHostelFees(studentId, session) {
    try {
      const schoolFees = await this.hasPaidSchoolFees(studentId, session);
      if (!schoolFees) return false;

      const hostelPayment = await Payment.findOne({
        payer: studentId,
        feeType: 'HOSTEL_FEE',
        status: 'SUCCEEDED',
        academicSession: session
      });
      
      return !!hostelPayment;
    } catch (error) {
      console.error('Hostel fees check error:', error);
      return false;
    }
  }

  /**
   * Check if student has paid transcript fees
   */
  async hasPaidTranscriptFees(studentId, session) {
    try {
      const examFees = await this.hasPaidExamFees(studentId, session);
      if (!examFees) return false;

      const transcriptPayment = await Payment.findOne({
        payer: studentId,
        feeType: 'TRANSCRIPT_FEE',
        status: 'SUCCEEDED',
        academicSession: session
      });
      
      return !!transcriptPayment;
    } catch (error) {
      console.error('Transcript fees check error:', error);
      return false;
    }
  }

  /**
   * Check if student has paid library fees
   */
  async hasPaidLibraryFees(studentId, session) {
    try {
      const schoolFees = await this.hasPaidSchoolFees(studentId, session);
      if (!schoolFees) return false;

      const libraryPayment = await Payment.findOne({
        payer: studentId,
        feeType: 'LIBRARY_FEE',
        status: 'SUCCEEDED',
        academicSession: session
      });
      
      return !!libraryPayment;
    } catch (error) {
      console.error('Library fees check error:', error);
      return false;
    }
  }

  /**
   * Check if student has paid medical fees
   */
  async hasPaidMedicalFees(studentId, session) {
    try {
      const schoolFees = await this.hasPaidSchoolFees(studentId, session);
      if (!schoolFees) return false;

      const medicalPayment = await Payment.findOne({
        payer: studentId,
        feeType: 'MEDICAL_FEE',
        status: 'SUCCEEDED',
        academicSession: session
      });
      
      return !!medicalPayment;
    } catch (error) {
      console.error('Medical fees check error:', error);
      return false;
    }
  }

  /**
   * Check if student has paid certificate fees
   */
  async hasPaidCertificateFees(studentId, session) {
    try {
      const examFees = await this.hasPaidExamFees(studentId, session);
      if (!examFees) return false;

      const certificatePayment = await Payment.findOne({
        payer: studentId,
        feeType: 'CERTIFICATE_FEE',
        status: 'SUCCEEDED',
        academicSession: session
      });
      
      return !!certificatePayment;
    } catch (error) {
      console.error('Certificate fees check error:', error);
      return false;
    }
  }

  /**
   * Get student's payment summary
   */
  async getPaymentSummary(studentId, session = null) {
    try {
      const currentSession = session || await this.getCurrentAcademicSession();
      const student = await User.findById(studentId).select('matricNumber firstName lastName department level');
      
      if (!student) {
        throw new Error('Student not found');
      }

      const payments = await Payment.find({
        payer: studentId,
        status: 'SUCCEEDED',
        academicSession: currentSession
      }).sort({ createdAt: -1 });

      // Define all fee types
      const feeTypes = [
        'SCHOOL_FEES',
        'ACCEPTANCE_FEE',
        'HOSTEL_FEE',
        'MEDICAL_FEE',
        'LIBRARY_FEE',
        'EXAMINATION_FEE',
        'SPORTS_FEE',
        'ICT_FEE',
        'DEVELOPMENT_LEVY',
        'TRANSCRIPT_FEE',
        'CERTIFICATE_FEE'
      ];

      const summary = feeTypes.map(feeType => {
        const payment = payments.find(p => p.feeType === feeType);
        return {
          feeType,
          paid: !!payment,
          amount: payment?.amount || 0,
          paidAt: payment?.paidAt,
          transactionRef: payment?.transactionRef,
          receiptNumber: payment?.receiptNumber
        };
      });

      // Check permissions
      const permissions = {};
      for (const [activity, requirement] of Object.entries(this.requirements)) {
        const permission = await this.checkPermission(studentId, activity, currentSession);
        permissions[activity] = permission;
      }

      // Calculate totals
      const paidFees = summary.filter(item => item.paid);
      const unpaidFees = summary.filter(item => !item.paid);
      
      const totalAmount = paidFees.reduce((sum, item) => sum + item.amount, 0);
      const totalRequired = summary.reduce((sum, item) => sum + item.amount, 0);

      return {
        student: {
          id: student._id,
          matricNumber: student.matricNumber,
          name: `${student.firstName} ${student.lastName}`,
          department: student.department,
          level: student.level
        },
        session: currentSession,
        summary,
        permissions,
        totals: {
          paidAmount: totalAmount,
          totalRequired: totalRequired,
          outstanding: totalRequired - totalAmount,
          paidCount: paidFees.length,
          unpaidCount: unpaidFees.length
        },
        restrictions: unpaidFees
          .filter(item => ['SCHOOL_FEES', 'EXAMINATION_FEE', 'MEDICAL_FEE', 'LIBRARY_FEE'].includes(item.feeType))
          .map(item => ({
            feeType: item.feeType,
            message: `${item.feeType.replace('_', ' ').toLowerCase()} not paid`,
            impact: this.getFeeImpact(item.feeType),
            priority: this.getFeePriority(item.feeType)
          })),
        lastUpdated: new Date()
      };

    } catch (error) {
      console.error('Payment summary error:', error);
      throw error;
    }
  }

  /**
   * Get impact of unpaid fee
   */
  getFeeImpact(feeType) {
    const impacts = {
      'SCHOOL_FEES': ['Course registration', 'Exam registration', 'Result processing'],
      'EXAMINATION_FEE': ['Exam registration', 'Result processing', 'Transcript request'],
      'HOSTEL_FEE': ['Hostel allocation'],
      'MEDICAL_FEE': ['Medical services access'],
      'LIBRARY_FEE': ['Library access'],
      'TRANSCRIPT_FEE': ['Transcript request'],
      'CERTIFICATE_FEE': ['Certificate collection']
    };
    
    return impacts[feeType] || ['General academic activities'];
  }

  /**
   * Get fee priority (for ordering)
   */
  getFeePriority(feeType) {
    const priorities = {
      'SCHOOL_FEES': 1,
      'EXAMINATION_FEE': 2,
      'MEDICAL_FEE': 3,
      'LIBRARY_FEE': 4,
      'HOSTEL_FEE': 5,
      'TRANSCRIPT_FEE': 6,
      'CERTIFICATE_FEE': 7
    };
    
    return priorities[feeType] || 99;
  }

  /**
   * Get current academic session
   */
  async getCurrentAcademicSession() {
    // Implementation depends on your system
    // This is a placeholder - implement based on your semester model
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    
    // Assuming session runs from October to September
    if (month >= 10) {
      return `${year}/${year + 1}`;
    } else {
      return `${year - 1}/${year}`;
    }
  }

  /**
   * Batch check permissions for multiple activities
   */
  async batchCheckPermissions(studentId, activities, session = null) {
    const results = {};
    for (const activity of activities) {
      results[activity] = await this.checkPermission(studentId, activity, session);
    }
    return results;
  }

  /**
   * Check course registration eligibility
   */
  async checkCourseRegistrationEligibility(studentId, courseIds = [], session = null) {
    try {
      const permission = await this.checkPermission(studentId, 'COURSE_REGISTRATION', session);
      
      if (!permission.allowed) {
        return {
          eligible: false,
          reason: permission.message,
          requiredPayments: permission.requiredPayments || ['SCHOOL_FEES'],
          suggestedAction: 'Pay school fees to proceed',
          restrictionLevel: 'STRICT'
        };
      }

      // Check additional course-specific requirements if needed
      if (courseIds.length > 0) {
        const courseEligibility = courseIds.map(courseId => ({
          courseId,
          eligible: true,
          requirements: []
        }));

        return {
          eligible: true,
          reason: 'All payment requirements satisfied',
          courseEligibility,
          canProceed: true,
          restrictionLevel: 'NONE'
        };
      }

      return {
        eligible: true,
        reason: 'All payment requirements satisfied',
        canProceed: true,
        restrictionLevel: 'NONE'
      };

    } catch (error) {
      console.error('Course registration eligibility error:', error);
      return {
        eligible: false,
        reason: 'Error checking eligibility',
        error: error.message,
        restrictionLevel: 'ERROR'
      };
    }
  }

  /**
   * Check if student has paid all mandatory fees
   */
  async hasPaidAllMandatoryFees(studentId, session = null) {
    try {
      const currentSession = session || await this.getCurrentAcademicSession();
      const mandatoryFees = ['SCHOOL_FEES', 'EXAMINATION_FEE', 'MEDICAL_FEE', 'LIBRARY_FEE'];
      
      for (const feeType of mandatoryFees) {
        const hasPaid = await this.hasPaidFee(studentId, feeType, currentSession);
        if (!hasPaid) {
          return {
            paid: false,
            missingFee: feeType,
            message: `${feeType.replace('_', ' ')} not paid`
          };
        }
      }
      
      return {
        paid: true,
        message: 'All mandatory fees paid'
      };
    } catch (error) {
      console.error('Check mandatory fees error:', error);
      return {
        paid: false,
        message: 'Error checking mandatory fees',
        error: error.message
      };
    }
  }

  /**
   * Generic fee check
   */
  async hasPaidFee(studentId, feeType, session) {
    try {
      const payment = await Payment.findOne({
        payer: studentId,
        feeType: feeType,
        status: 'SUCCEEDED',
        academicSession: session
      });
      
      return !!payment;
    } catch (error) {
      console.error(`Fee check error (${feeType}):`, error);
      return false;
    }
  }
}

export default CourseRestrictionService;