// computation/services/BulkWriter.js
import mongoose from "mongoose";
import studentModel from "../../student/student.model.js";
import CarryoverCourse from "../../result/carryover.model.js";
import studentSemseterResultModel from "../../student/student.semseterResult.model.js";
import ComputationSummary from "../../result/computation.model.js";

class BulkWriter {
  constructor() {
    this.studentUpdates = [];
    this.carryoverBuffers = [];
    this.semesterResultUpdates = [];
    this.batchSize = 100;
  }

  /**
   * Add student update to buffer
   * @param {string} studentId - Student ID
   * @param {Object} updates - Update operations
   */
  addStudentUpdate(studentId, updates) {
    this.studentUpdates.push({
      updateOne: {
        filter: { _id: studentId },
        update: {
          $set: updates.set || {},
          $inc: updates.increment || {}
        }
      }
    });
  }

  /**
   * Add carryover to buffer
   * @param {Object} carryoverData - Carryover data
   */
  addCarryover(carryoverData) {
    this.carryoverBuffers.push(carryoverData);
  }

  /**
   * Add semester result update to buffer
   * @param {string} resultId - Result ID (for update) or null (for insert)
   * @param {Object} resultData - Result data
   */
  addSemesterResultUpdate(resultId, resultData) {
    const operation = resultId
      ? {
          updateOne: {
            filter: { _id: resultId },
            update: { $set: resultData },
            upsert: false
          }
        }
      : {
          insertOne: {
            document: resultData
          }
        };

    this.semesterResultUpdates.push(operation);
  }

  /**
   * Execute all buffered write operations
   * @param {Object} options - Write options
   * @returns {Promise<Object>} Write results
   */
  async executeBulkWrites(options = { ordered: false }) {
    const results = {
      students: { modified: 0, inserted: 0 },
      carryovers: { inserted: 0 },
      semesterResults: { modified: 0, inserted: 0 }
    };

    try {
      // Execute student updates
      if (this.studentUpdates.length > 0) {
        const studentResult = await studentModel.bulkWrite(this.studentUpdates, options);
        results.students.modified = studentResult.modifiedCount;
        results.students.inserted = studentResult.insertedCount;
        this.studentUpdates = [];
      }

      // Execute carryover inserts
      if (this.carryoverBuffers.length > 0) {
        const carryoverResult = await CarryoverCourse.insertMany(this.carryoverBuffers, options);
        results.carryovers.inserted = carryoverResult.length;
        this.carryoverBuffers = [];
      }

      // Execute semester result updates
      if (this.semesterResultUpdates.length > 0) {
        console.log("There is semester results of length: ", this.semesterResultUpdates.length)
        const semesterResult = await studentSemseterResultModel.bulkWrite(
          this.semesterResultUpdates,
          options
        );
        results.semesterResults.modified = semesterResult.modifiedCount;
        results.semesterResults.inserted = semesterResult.insertedCount;
        this.semesterResultUpdates = [];
      }

      return results;
    } catch (error) {
      console.error("Bulk write operations failed:", error);
      
      // Clear buffers on error to prevent data inconsistency
      this.clearBuffers();
      
      throw error;
    }
  }

  /**
   * Clear all buffers
   */
  clearBuffers() {
    this.studentUpdates = [];
    this.carryoverBuffers = [];
    this.semesterResultUpdates = [];
  }

  /**
   * Get buffer sizes
   * @returns {Object} Buffer sizes
   */
  getBufferSizes() {
    return {
      studentUpdates: this.studentUpdates.length,
      carryoverBuffers: this.carryoverBuffers.length,
      semesterResultUpdates: this.semesterResultUpdates.length
    };
  }

  /**
   * Check if buffers need to be flushed
   * @param {number} threshold - Threshold for flushing
   * @returns {boolean} True if buffers need flushing
   */
  shouldFlush(threshold = this.batchSize) {
    return (
      this.studentUpdates.length >= threshold ||
      this.carryoverBuffers.length >= threshold ||
      this.semesterResultUpdates.length >= threshold
    );
  }

  /**
   * Update computation summary
   * @param {string} summaryId - Summary ID
   * @param {Object} data - Update data
   * @returns {Promise<Object>} Updated summary
   */
  async updateComputationSummary(summaryId, data) {
    try {
      const summary = await ComputationSummary.findById(summaryId);
      if (!summary) {
        throw new Error(`Computation summary ${summaryId} not found`);
      }

      // Update summary fields
      Object.keys(data).forEach(key => {
        if (key === 'passList' || key === 'probationList' || 
            key === 'withdrawalList' || key === 'terminationList') {
          // Limit list sizes
          summary[key] = data[key].slice(0, 100);
        } else if (key === 'carryoverStats') {
          summary.carryoverStats = {
            totalCarryovers: data.carryoverStats.totalCarryovers || 0,
            affectedStudentsCount: data.carryoverStats.affectedStudentsCount || 0,
            affectedStudents: (data.carryoverStats.affectedStudents || []).slice(0, 100)
          };
        } else {
          summary[key] = data[key];
        }
      });

      summary.completedAt = new Date();
      summary.duration = Date.now() - summary.startedAt.getTime();

      await summary.save();
      return summary;
    } catch (error) {
      console.error("Failed to update computation summary:", error);
      throw error;
    }
  }
}

export default BulkWriter;