// computation/controllers/previewComputation.controller.js
import mongoose from "mongoose";
import { ComputationCore } from "../core/computation.core.js";
import ComputationSummary from "../../result/computation.model.js";
import SemesterService from "../../semester/semester.service.js";
import { addDepartmentJob } from "../../../workers/department.queue.js";
import { randomUUID } from "crypto";
import buildResponse from "../../../utils/responseBuilder.js";
import StudentService from "../services/StudentService.js";
import { BATCH_SIZE } from "../utils/computationConstants.js";
import { updatePreviewMasterComputationStats } from "../utils/computation.utils.js";
import { ComputationHandler } from "./computation.handler.js";

/**
 * Preview computation - generates mastersheet without affecting students
 */
export const computePreviewResults = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    await session.startTransaction();
    const computedBy = req.user._id;
    const { purpose = 'preview', semesterId, departmentId } = req.body;

    // Validate purpose
    const validPurposes = ['preview', 'simulation'];
    if (!validPurposes.includes(purpose)) {
      return buildResponse(res, 400, `Invalid purpose. Must be one of: ${validPurposes.join(', ')}`);
    }

    // Get departments to process
    const departmentsToProcess = await getDepartmentsToProcess(departmentId, session);

    if (departmentsToProcess.length === 0) {
      await session.abortTransaction();
      return buildResponse(res, 400, "No departments have results in their active semesters");
    }

    // Create master computation record for preview
    const masterComputation = await createPreviewMasterComputation(
      departmentsToProcess,
      computedBy,
      purpose,
      session
    );

    await session.commitTransaction();

    // Add each department to processing queue
    for (const dept of departmentsToProcess) {
      const uniqueJobId = `preview-dept-${dept.departmentId}-${masterComputation._id}-${Date.now()}-${randomUUID()}`;
      await addDepartmentJob({
        departmentId: dept.departmentId,
        masterComputationId: masterComputation._id,
        computedBy,
        jobId: uniqueJobId,
        priority: 1,
        isPreview: true,
        purpose: purpose
      });
    }

    return buildResponse(res, 202, "Preview computation started", {
      masterComputationId: masterComputation._id,
      totalDepartments: departmentsToProcess.length,
      purpose: purpose,
      isPreview: true,
      message: "Preview computation has been queued. No student data will be modified.",
      statusEndpoint: `/api/computation/preview/status/${masterComputation._id}`
    });

  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    console.error("Error starting preview computation:", error);
    return buildResponse(res, 500, "Failed to start preview computation", null, true, error);
  } finally {
    session.endSession();
  }
};
/**
 * Process preview department job
 */
export const processPreviewDepartmentJob = async (job) => {
  const {
    departmentId,
    masterComputationId,
    computedBy,
    jobId,
    isPreview = true,
    purpose = 'preview'
  } = job.data;

  console.log(`Processing preview department job: ${jobId} for department ${departmentId}`);

  // Get department and semester
  const department = await StudentService.getDepartmentDetails(departmentId);
  if (!department) {
    throw new Error(`Department ${departmentId} not found`);
  }

  const activeSemester = await SemesterService.getActiveDepartmentSemester(departmentId);
  if (!activeSemester) {
    throw new Error(`No active semester found for department: ${department.name}`);
  }

  // Initialize computation summary
  let computationSummary = new ComputationSummary({
    department: departmentId,
    semester: activeSemester._id,
    masterComputationId,
    status: "processing",
    computedBy,
    isFinal: false,
    isPreview: true,
    purpose: purpose,
    startedAt: new Date()
  });

  await computationSummary.save();

  try {
    // Create core computation engine for preview
    const computationCore = new ComputationCore({
      isPreview: true,
      purpose: purpose,
      computedBy,
      computationSummary,
      department,
      activeSemester,
      masterComputationId
    });

    // Get student IDs for processing
    const studentIds = await StudentService.getStudentIds(departmentId);
    console.log(`Processing ${studentIds.length} students for preview in ${department.name}`);

    // Process students in batches
    for (let i = 0; i < studentIds.length; i += BATCH_SIZE) {
      const studentBatch = studentIds.slice(i, i + BATCH_SIZE);
      await computationCore.processStudentBatch(studentBatch);
    }

    // Finalize preview computation
    await finalizePreviewComputation(
      computationCore,
      computationSummary,
      department,
      activeSemester,
      computedBy,
      masterComputationId
    );


    console.log(`✅ Preview completed for department ${department.name}`);

    return {
      success: true,
      summaryId: computationSummary._id,
      department: department.name,
      studentsProcessed: computationCore.counters.studentsWithResults,
      isPreview: true,
      purpose: purpose
    };

  } catch (error) {
    console.error(`Preview department job failed:`, error);
    await handlePreviewJobFailure(computationSummary, department, activeSemester, error);
    throw error;
  }
};

/**
 * Finalize preview computation
 */
async function finalizePreviewComputation(
  computationCore,
  computationSummary,
  department,
  activeSemester,
  computedBy,
  masterComputationId
) {
  console.log('🏁 Starting finalizePreviewComputation...');

  const computationHandler = new ComputationHandler({
    isPreview: true,
    purpose: 'preview'
  });

  const summaryData = await computationHandler.finalizeComputation(
    computationCore,
    computationSummary,
    department,
    activeSemester,
    computedBy,
    masterComputationId,
    null
  );

  // Update master computation stats
  await updatePreviewMasterComputationStats(
    masterComputationId,
    department.name,
    computationCore.getMasterComputationStats()
  );

  console.log(`✅ Preview finalized for ${department.name}`);
  return summaryData;
}

/**
 * Handle preview job failure
 */
async function handlePreviewJobFailure(computationSummary, department, activeSemester, error) {
  if (computationSummary) {
    computationSummary.status = "failed";
    computationSummary.errorMessage = error.message;
    computationSummary.completedAt = new Date();
    await computationSummary.save();
  }

  console.error(`Preview computation failed for ${department.name}: ${error.message}`);
}


