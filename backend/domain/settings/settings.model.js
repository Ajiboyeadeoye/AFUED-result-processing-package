import mongoose from "mongoose";

const settingsSchema = new mongoose.Schema(
  {
    // 🏛️ GENERAL INFORMATION
    universityName: {
      type: String,
      required: true,
      default: "Adeyemi Federal University of Education",
    },
    motto: { type: String, default: "Learning and Service" },
    schoolEmail: { type: String, default: "info@adeyemi.edu.ng" },
    schoolPhone: { type: String, default: "+234-800-000-0000" },
    address: { type: String, default: "Ondo State, Nigeria" },
    websiteUrl: { type: String, default: "https://adeyemi.edu.ng" },
    logoUrl: { type: String },
    themeColor: { type: String, default: "#006400" }, // deep green vibes 🇳🇬

    // 📘 SESSION CONTROL
    currentSession: {
      type: String,
      required: true,
      default: "2025/2026",
    },
    currentSemester: {
      type: String,
      enum: ["First Semester", "Second Semester", "Summer Semester"],
      required: true,
      default: "First Semester",
    },
    activeSemesterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Semester",
    },
    sessionStartDate: Date,
    sessionEndDate: Date,
    isSemesterActive: { type: Boolean, default: true },

    // 🎓 COURSE & LECTURER MANAGEMENT
    courseAssignmentOpen: { type: Boolean, default: false },
    maxCoursesPerLecturer: { type: Number, default: 4 },
    allowCrossDepartmentAssignment: { type: Boolean, default: false },
    requireHodApprovalForAssignment: { type: Boolean, default: true },

    // 🧾 STUDENT REGISTRATION SETTINGS
    registrationOpen: { type: Boolean, default: false },
    registrationDeadline: { type: Date },
    lateRegistrationFee: { type: Number, default: 5000 },
    autoLockAfterDeadline: { type: Boolean, default: true },
    maxCreditUnitsPerSemester: { type: Number, default: 24 },
    requireDepartmentalClearance: { type: Boolean, default: true },
    requirePaymentBeforeRegistration: { type: Boolean, default: true },

    // 💰 PAYMENT & FINANCE
    enablePaymentPortal: { type: Boolean, default: true },
    acceptedPaymentMethods: {
      type: [String],
      default: ["Remita", "Paystack", "Flutterwave"],
    },
    currency: { type: String, default: "NGN" },
    autoGenerateInvoice: { type: Boolean, default: true },
    requireReceiptVerification: { type: Boolean, default: true },

    // 🧮 GRADING SYSTEM
    gradingSystem: {
      A: { min: { type: Number, default: 70 }, points: { type: Number, default: 5 } },
      B: { min: { type: Number, default: 60 }, points: { type: Number, default: 4 } },
      C: { min: { type: Number, default: 50 }, points: { type: Number, default: 3 } },
      D: { min: { type: Number, default: 45 }, points: { type: Number, default: 2 } },
      E: { min: { type: Number, default: 40 }, points: { type: Number, default: 1 } },
      F: { min: { type: Number, default: 0 }, points: { type: Number, default: 0 } },
    },
    cgpaScale: { type: Number, default: 5.0 },
    allowHodToEditResults: { type: Boolean, default: false },
    requireExaminerApproval: { type: Boolean, default: true },
    maxResultCorrectionDays: { type: Number, default: 7 },
    resultPublicationOpen: { type: Boolean, default: false },

    // 🧑‍💻 ACCESS & SECURITY
    enable2FAForAdmins: { type: Boolean, default: false },
    allowHodToCreateCourses: { type: Boolean, default: true },
    superAdminEmails: { type: [String], default: ["vc@adeyemi.edu.ng"] },
    autoAssignDefaultRoles: { type: Boolean, default: true },

    // 📚 ACADEMIC OPERATIONS
    enableElectives: { type: Boolean, default: true },
    minStudentsForCourseActivation: { type: Number, default: 10 },
    autoGenerateExamTimetable: { type: Boolean, default: false },
    attendanceMode: { type: String, enum: ["QR", "Biometric", "Manual"], default: "QR" },
    examMode: { type: String, enum: ["CBT", "Written"], default: "CBT" },
    enableProjectSupervisionTracking: { type: Boolean, default: true },

    // 🏠 HOSTEL & FACILITIES
    hostelAllocationOpen: { type: Boolean, default: false },
    maxOccupantsPerRoom: { type: Number, default: 4 },
    maintenanceRequestEnabled: { type: Boolean, default: true },
    electricityBillPolicy: { type: String, enum: ["included", "separate"], default: "included" },

    // 🕹️ SYSTEM SETTINGS
    backupFrequency: { type: String, enum: ["daily", "weekly", "manual"], default: "weekly" },
    autoLogoutTimeout: { type: Number, default: 30 }, // minutes
    maintenanceMode: { type: Boolean, default: false },
    auditLogsRetentionDays: { type: Number, default: 180 },
    sendEmailNotifications: { type: Boolean, default: true },
    smsGatewayEnabled: { type: Boolean, default: false },

    notificationSettings: {
      emailEnabled: { type: Boolean, default: true },
      whatsappEnabled: { type: Boolean, default: false },
      inAppNotifications: { type: Boolean, default: true },
      smsEnabled: { type: Boolean, default: false },
      senderEmail: { type: String, default: "noreply@afue.edu.ng" },
      senderPhone: { type: String, default: "+2348000000000" },
    },

    messageTemplates: {
      registrationOpen: { type: String, default: "Registration is now open for the current semester." },
      resultPublished: { type: String, default: "Results have been published. Kindly log in to check yours." },
      feeReminder: { type: String, default: "Please pay your school fees before the deadline to avoid penalties." },
    },
    // 🧑‍💼 TRACKING
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

const Settings = mongoose.model("Settings", settingsSchema);
export default Settings;
