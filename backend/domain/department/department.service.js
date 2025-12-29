// domain/department/department.service.js
import Department from './department.model.js';
import { logger } from '../../utils/logger.js'; // Adjust based on your logging setup

class DepartmentService {
  /**
   * Get department by ID with optional population and session
   * @param {string|ObjectId} id - Department ID
   * @param {Object} options - { session, lean, populate }
   * @returns {Promise<Department>}
   */
  async getDepartmentById(id, options = {}) {
    try {
      let query = Department.findById(id);

      if (options.session) {
        query = query.session(options.session);
      }

      if (options.populate) {
        query = query.populate(options.populate);
      }

      if (options.lean) {
        query = query.lean();
      }

      const department = await query;

      if (!department && options.throwIfNotFound !== false) {
        throw new Error(`Department with id ${id} not found`);
      }

      return department;
    } catch (error) {
      logger.error(`DepartmentService.getDepartmentById failed: ${error.message}`, {
        departmentId: id,
        options,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Get department by HOD user ID or by Dean user ID
   * @param {string|ObjectId} hodId - HOD user ID or dean ID
   * @param {Object} options - { session, lean, populate }
   * @returns {Promise<Department>}
   */
  async getDepartmentByHod(hodId, options = {}) {
    try {
      let query = Department.findOne({
        $or: [
          { hod: hodId },
          { dean: hodId }
        ]
      });

      if (options.session) {
        query = query.session(options.session);
      }

      if (options.populate) {
        query = query.populate(options.populate);
      }

      if (options.lean) {
        query = query.lean();
      }

      return await query;
    } catch (error) {
      logger.error(`DepartmentService.getDepartmentByHod failed: ${error.message}`, {
        hodId,
        options,
        stack: error.stack
      });
      throw error;
    }
  }


  /**
   * Get departments by faculty ID
   * @param {string|ObjectId} facultyId - Faculty ID
   * @param {Object} options - { session, lean, populate }
   * @returns {Promise<Department[]>}
   */
  async getDepartmentsByFaculty(facultyId, options = {}) {
    try {
      let query = Department.find({ faculty: facultyId });

      if (options.session) {
        query = query.session(options.session);
      }

      if (options.populate) {
        query = query.populate(options.populate);
      }

      if (options.lean) {
        query = query.lean();
      }

      if (options.sort) {
        query = query.sort(options.sort);
      }

      return await query;
    } catch (error) {
      logger.error(`DepartmentService.getDepartmentsByFaculty failed: ${error.message}`, {
        facultyId,
        options,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Check if department exists (lightweight)
   * @param {string|ObjectId} id - Department ID
   * @returns {Promise<boolean>}
   */
  async departmentExists(id) {
    try {
      const count = await Department.countDocuments({ _id: id });
      return count > 0;
    } catch (error) {
      logger.error(`DepartmentService.departmentExists failed: ${error.message}`, {
        departmentId: id,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Get department IDs by faculty (for counting/aggregation)
   * @param {string|ObjectId} facultyId - Faculty ID
   * @returns {Promise<ObjectId[]>}
   */
  async getDepartmentIdsByFaculty(facultyId, options = {}) {
    try {
      const departmentIds = await Department.find({ faculty: facultyId }).distinct('_id');

      // Log migration if context provided
      if (options._migrationContext) {
        logger.migration(
          `Department.find({ faculty: ${facultyId} }).distinct('_id')`,
          `DepartmentService.getDepartmentIdsByFaculty(${facultyId})`,
          options._migrationContext.file,
          { facultyId, count: departmentIds.length }
        );
      }

      return departmentIds;
    } catch (error) {
      logger.error(`DepartmentService.getDepartmentIdsByFaculty failed: ${error.message}`, {
        facultyId,
        stack: error.stack,
        options
      });
      throw error;
    }
  }

  /**
   * Get department by name
   * @param {string} name - Department name
   * @param {Object} options - { session, lean, populate }
   * @returns {Promise<Department>}
   */
  async getDepartmentByName(name, options = {}) {
    try {
      let query = Department.findOne({ name });

      if (options.session) {
        query = query.session(options.session);
      }

      if (options.populate) {
        query = query.populate(options.populate);
      }

      if (options.lean) {
        query = query.lean();
      }

      return await query;
    } catch (error) {
      logger.error(`DepartmentService.getDepartmentByName failed: ${error.message}`, {
        name,
        options,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * LEGACY ACCESS WRAPPER - For gradual migration
   * Logs when legacy direct model access patterns are used
   */
  static logLegacyAccess(callerFile, operation, details = {}) {
    logger.warn(`LEGACY DEPARTMENT MODEL ACCESS DETECTED`, {
      caller: callerFile,
      operation,
      timestamp: new Date().toISOString(),
      recommendation: 'Use DepartmentService instead',
      ...details
    });
  }
}

// Export singleton instance
export default new DepartmentService();