// // computation/controllers/computation.controller.js
// import mongoose from "mongoose";
// import buildResponse from "../../../utils/responseBuilder.js";
// import { processPreviewDepartmentJob } from "./previewComputation.controller.js";
// import { processFinalDepartmentJob } from "./finalComputation.controller.js";
// import { 
//   getDepartmentsToProcess,
//   updateMasterComputationStats 
// } from "../utils/computation.utils.js";
// import MasterComputation from "../../result/masterComputation.model.js";
// import { addDepartmentJob, queueNotification } from "../../../workers/department.queue.js";
// import { randomUUID } from "crypto";

// /**
//  * Unified department job processor - routes to appropriate handler
//  */
// export const processDepartmentJob = async (job) => {
//   const {
//     departmentId,
//     masterComputationId,
//     computedBy,
//     jobId,
//     isPreview = false,
//     purpose = 'final',
//     isFinal = true
//   } = job.data;

//   console.log(`Processing department job: ${jobId}`);
//   console.log(`Job type: ${isPreview ? 'PREVIEW' : 'FINAL'}, Purpose: ${purpose}, isFinal: ${isFinal}`);

//   const isPreviewJob = isPreview || purpose === 'preview' || purpose === 'simulation' || !isFinal;

//   if (isPreviewJob) {
//     return await processPreviewDepartmentJob(job);
//   } else {
//     return await processFinalDepartmentJob(job);
//   }
// };

// /**
//  * Compute all results (final computation)
//  */
// export const computeAllResults = async (req, res) => {
//   const session = await mongoose.startSession();

//   try {
//     await session.startTransaction();
//     const computedBy = req.user._id;
//     const { isRetry = false, isPreview = false, purpose = 'final', isFinal = true } = req.body;

//     // Get departments to process
//     const departmentsToProcess = await getDepartmentsToProcess(null, session);

//     if (departmentsToProcess.length === 0) {
//       await session.abortTransaction();
//       return buildResponse(res, 400, "No departments have results in their active semesters");
//     }

//     // Get active academic semester
//     const activeSemester = await SemesterService.getActiveAcademicSemester();
//     if (!activeSemester) {
//       await session.abortTransaction();
//       return buildResponse(res, 400, "No active academic semester found");
//     }

//     // Create master computation record
//     const masterComputation = new MasterComputation({
//       semester: activeSemester._id,
//       totalDepartments: departmentsToProcess.length,
//       status: "processing",
//       computedBy,
//       startedAt: new Date(),
//       metadata: {
//         departments: departmentsToProcess,
//         initiatedBy: {
//           userId: computedBy,
//           timestamp: new Date().toISOString()
//         }
//       }
//     });

//     await masterComputation.save({ session });
//     await session.commitTransaction();

//     // Add each department to processing queue
//     for (const dept of departmentsToProcess) {
//       const uniqueJobId = `dept-${dept.departmentId}-${masterComputation._id}-${Date.now()}-${randomUUID()}`;
//       await addDepartmentJob({
//         departmentId: dept.departmentId,
//         masterComputationId: masterComputation._id,
//         computedBy,
//         jobId: uniqueJobId,
//         priority: 1,
//         isRetry,
//         isPreview,
//         purpose,
//         isFinal,
//       });
//     }

//     // Start monitoring
//     setTimeout(() => monitorMasterCompletion(masterComputation._id, computedBy), 10000);

//     return buildResponse(res, 202, "Results computation started", {
//       masterComputationId: masterComputation._id,
//       totalDepartments: departmentsToProcess.length,
//       message: "Computation has been queued. Check status using the computation ID.",
//       statusEndpoint: `/api/computation/status/${masterComputation._id}`
//     });

//   } catch (error) {
//     if (session.inTransaction()) {
//       await session.abortTransaction();
//     }
//     console.error("Error starting computation:", error);
//     return buildResponse(res, 500, "Failed to start results computation", null, true, error);
//   } finally {
//     session.endSession();
//   }
// };

// // Export other functions from the original file that are still needed
// export {
//   computePreviewResults,
// //   getComputationStatus,

// //   cancelComputation,
// //   retryFailedDepartments,
// //   getDepartmentCarryoverStats,
// //   getStudentCarryovers,
// //   clearCarryover,
// //   getComputationHistory,
// //   calculateSemesterGPA,
// //   calculateStudentCGPA
// } from './previewComputation.controller.js';

// // Export helper functions
// export { 
// //   monitorMasterCompletion,
//   handleJobFailure,
// //   handlePreviewJobFailure 
// } from '../workers copy2/computation.controller.js';
// computation/controllers/computation.controller.js
import mongoose from "mongoose";
import buildResponse from "../../../utils/responseBuilder.js";
import { processPreviewDepartmentJob } from "./previewComputation.controller.js";
import { processFinalDepartmentJob } from "./finalComputation.controller.js";
import { 
  getDepartmentsToProcess,
  updateMasterComputationStats 
} from "../utils/computation.utils.js";
import MasterComputation from "../../result/masterComputation.model.js";
import { addDepartmentJob, queueNotification } from "../../../workers/department.queue.js";
import { randomUUID } from "crypto";
import SemesterService from "../../semester/semester.service.js";

/**
 * Unified department job processor - routes to appropriate handler
 */
export const processDepartmentJob = async (job) => {
  const {
    departmentId,
    masterComputationId,
    computedBy,
    jobId,
    isPreview = false,
    purpose = 'final',
    isFinal = true
  } = job.data;

  console.log(`Processing department job: ${jobId}`);
  console.log(`Job type: ${isPreview ? 'PREVIEW' : 'FINAL'}, Purpose: ${purpose}, isFinal: ${isFinal}`);

  const isPreviewJob = isPreview || purpose === 'preview' || purpose === 'simulation' || !isFinal;

  if (isPreviewJob) {
    return await processPreviewDepartmentJob(job);
  } else {
    return await processFinalDepartmentJob(job);
  }
};

/**
 * Compute all results (final computation)
 */
export const computeAllResults = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    await session.startTransaction();
    const computedBy = req.user._id;
    const { isRetry = false, isPreview = false, purpose = 'final', isFinal = true } = req.body;

    // Get departments to process
    const departmentsToProcess = await getDepartmentsToProcess(null, session);

    if (departmentsToProcess.length === 0) {
      await session.abortTransaction();
      return buildResponse(res, 400, "No departments have results in their active semesters");
    }

    // Get active academic semester
    const activeSemester = await SemesterService.getActiveAcademicSemester();
    if (!activeSemester) {
      await session.abortTransaction();
      return buildResponse(res, 400, "No active academic semester found");
    }

    // Create master computation record
    const masterComputation = new MasterComputation({
      semester: activeSemester._id,
      totalDepartments: departmentsToProcess.length,
      status: "processing",
      computedBy,
      startedAt: new Date(),
      metadata: {
        departments: departmentsToProcess,
        initiatedBy: {
          userId: computedBy,
          timestamp: new Date().toISOString()
        }
      }
    });

    await masterComputation.save({ session });
    await session.commitTransaction();

    // Add each department to processing queue
    for (const dept of departmentsToProcess) {
      const uniqueJobId = `dept-${dept.departmentId}-${masterComputation._id}-${Date.now()}-${randomUUID()}`;
      await addDepartmentJob({
        departmentId: dept.departmentId,
        masterComputationId: masterComputation._id,
        computedBy,
        jobId: uniqueJobId,
        priority: 1,
        isRetry,
        isPreview,
        purpose,
        isFinal,
      });
    }

    // Start monitoring
    setTimeout(() => monitorMasterCompletion(masterComputation._id, computedBy), 10000);

    return buildResponse(res, 202, "Results computation started", {
      masterComputationId: masterComputation._id,
      totalDepartments: departmentsToProcess.length,
      message: "Computation has been queued. Check status using the computation ID.",
      statusEndpoint: `/api/computation/status/${masterComputation._id}`
    });

  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    console.error("Error starting computation:", error);
    return buildResponse(res, 500, "Failed to start results computation", null, true, error);
  } finally {
    session.endSession();
  }
};

/**
 * Monitor master computation completion
 */
export const monitorMasterCompletion = async (masterComputationId, computedBy) => {
  try {
    const masterComp = await MasterComputation.findById(masterComputationId);
    if (!masterComp) return;

    const checkInterval = setInterval(async () => {
      const updatedMaster = await MasterComputation.findById(masterComputationId);
      
      if (updatedMaster.status !== 'processing') {
        clearInterval(checkInterval);
        
        // Send notification if needed
        if (updatedMaster.status === 'completed_with_errors') {
          await queueNotification(
            "admin",
            computedBy,
            "computation_completed_with_errors",
            `Computation completed with errors for ${updatedMaster._id}`,
            { masterComputationId: updatedMaster._id }
          );
        }
      }
    }, 30000); // Check every 30 seconds
  } catch (error) {
    console.error("Error monitoring master computation:", error);
  }
};

// Export helper functions
export { 
  handleJobFailure
} from './finalComputation.controller.js';

// Re-export preview functions
export { computePreviewResults } from './previewComputation.controller.js';