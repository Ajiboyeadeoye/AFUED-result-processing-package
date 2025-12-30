// middlewares/paymentGuard.js
import PaymentService from "../domain/payment/payment.service.js";
import AcademicSession from "../domain/semester/semester.model.js";
import Semester from "../domain/semester/semester.model.js";

export const paymentGuard = ({
  purpose,
  requireSession = true,
  requireSemester = true,
}) => {
  return async (req, res, next) => {
    try {
      const studentId = req.user?._id;

      if (!studentId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized: student not found",
        });
      }

      let session = null;
      let semester = null;

      // Resolve current academic session
      if (requireSession) {
        session = await AcademicSession.findOne({ isCurrent: true });
        if (!session) {
          return res.status(500).json({
            success: false,
            message: "Current academic session not configured",
          });
        }
      }

      // Resolve current semester
      if (requireSemester) {
        semester = await Semester.findOne({ isCurrent: true });
        if (!semester) {
          return res.status(500).json({
            success: false,
            message: "Current semester not configured",
          });
        }
      }

      const hasPaid = await PaymentService.hasPaid({
        studentId,
        purpose,
        session: session?._id || null,
        semester: semester?._id || null,
      });

      if (!hasPaid) {
        return res.status(403).json({
          success: false,
          message: `Payment required for ${purpose}`,
          requiredPayment: {
            purpose,
            session: session?._id || null,
            semester: semester?._id || null,
          },
        });
      }

      // Attach payment context for downstream handlers (optional)
      req.paymentContext = {
        purpose,
        session,
        semester,
      };

      next();
    } catch (error) {
      console.error("Payment guard error:", error);
      return res.status(500).json({
        success: false,
        message: "Payment verification failed",
        error: error.message,
      });
    }
  };
};

export default paymentGuard;
