// computation/services/BulkWriter.js
import mongoose from "mongoose";
import studentModel from "../../student/student.model.js";
import CarryoverCourse from "../../result/carryover.model.js";
import studentSemseterResultModel from "../../student/student.semseterResult.model.js";
import ComputationSummary from "../../result/computation.model.js";
import SummaryListBuilder from "./SummaryListBuilder.js";

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
        const carryoverResult = await CarryoverCourse.insertMany(
          this.carryoverBuffers,
          { ...options, ordered: false }
        );

        results.carryovers.inserted = carryoverResult.length;
        this.carryoverBuffers = [];
      }

      // Execute semester result updates
      if (this.semesterResultUpdates.length > 0) {
        console.log("There is semester results of length: ", this.semesterResultUpdates.length);
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
   * Update computation summary with level-based data
   * @param {string} summaryId - Summary ID
   * @param {Object} data - Update data including level-based organization
   * @returns {Promise<Object>} Updated summary
   */
  async updateComputationSummary(summaryId, data) {
    try {
      const summary = await ComputationSummary.findById(summaryId);
      if (!summary) {
        throw new Error(`Computation summary ${summaryId} not found`);
      }

      // Add department details
      if(data.departmentDetails !== undefined) summary.departmentDetails = data.departmentDetails;

      // Update overall statistics
      if (data.totalStudents !== undefined) summary.totalStudents = data.totalStudents;
      if (data.studentsWithResults !== undefined) summary.studentsWithResults = data.studentsWithResults;
      if (data.studentsProcessed !== undefined) summary.studentsProcessed = data.studentsProcessed;
      if (data.averageGPA !== undefined) summary.averageGPA = data.averageGPA;
      if (data.highestGPA !== undefined) summary.highestGPA = data.highestGPA;
      if (data.lowestGPA !== undefined) summary.lowestGPA = data.lowestGPA;
      
      // Update grade distribution
      if (data.gradeDistribution) {
        summary.gradeDistribution = data.gradeDistribution;
      }

      // Update student summaries by level
      if (data.studentSummariesByLevel) {
        // Ensure Map is initialized
        if (!summary.studentSummariesByLevel || !(summary.studentSummariesByLevel instanceof Map)) {
          summary.studentSummariesByLevel = new Map();
        }
        
        for (const [level, summaries] of Object.entries(data.studentSummariesByLevel)) {
          summary.studentSummariesByLevel.set(level, summaries);
        }
      }

      // Update key to courses by level
      if (data.keyToCoursesByLevel) {
        if (!summary.keyToCoursesByLevel || !(summary.keyToCoursesByLevel instanceof Map)) {
          summary.keyToCoursesByLevel = new Map();
        }
        
        for (const [level, courses] of Object.entries(data.keyToCoursesByLevel)) {
          summary.keyToCoursesByLevel.set(level, courses);
        }
      }

      // Update student lists by level
      if (data.studentListsByLevel) {
        if (!summary.studentListsByLevel || !(summary.studentListsByLevel instanceof Map)) {
          summary.studentListsByLevel = new Map();
        }
        
        for (const [level, lists] of Object.entries(data.studentListsByLevel)) {
          // Merge with existing lists for this level
          const existingLists = summary.studentListsByLevel.get(level) || {
            passList: [],
            probationList: [],
            withdrawalList: [],
            terminationList: [],
            carryoverStudents: []
          };
          
          if (lists.passList) existingLists.passList.push(...lists.passList);
          if (lists.probationList) existingLists.probationList.push(...lists.probationList);
          if (lists.withdrawalList) existingLists.withdrawalList.push(...lists.withdrawalList);
          if (lists.terminationList) existingLists.terminationList.push(...lists.terminationList);
          if (lists.carryoverStudents) existingLists.carryoverStudents.push(...lists.carryoverStudents);
          
          summary.studentListsByLevel.set(level, existingLists);
        }
      }

      // Update carryover stats by level
      if (data.carryoverStatsByLevel) {
        if (!summary.carryoverStatsByLevel || !(summary.carryoverStatsByLevel instanceof Map)) {
          summary.carryoverStatsByLevel = new Map();
        }
        
        for (const [level, stats] of Object.entries(data.carryoverStatsByLevel)) {
          summary.carryoverStatsByLevel.set(level, stats);
        }
      }

      // Update summary of results by level
      if (data.summaryOfResultsByLevel) {
        if (!summary.summaryOfResultsByLevel || !(summary.summaryOfResultsByLevel instanceof Map)) {
          summary.summaryOfResultsByLevel = new Map();
        }
        
        for (const [level, results] of Object.entries(data.summaryOfResultsByLevel)) {
          summary.summaryOfResultsByLevel.set(level, results);
        }
      }

      // Update backward compatible lists (deprecated but kept for compatibility)
      if (data.passList) {
        summary.passList = data.passList.slice(0, 100);
      }
      if (data.probationList) {
        summary.probationList = data.probationList.slice(0, 100);
      }
      if (data.withdrawalList) {
        summary.withdrawalList = data.withdrawalList.slice(0, 100);
      }
      if (data.terminationList) {
        summary.terminationList = data.terminationList.slice(0, 100);
      }

      // Update overall carryover stats
      if (data.carryoverStats) {
        summary.carryoverStats = {
          totalCarryovers: data.carryoverStats.totalCarryovers || 0,
          affectedStudentsCount: data.carryoverStats.affectedStudentsCount || 0,
          affectedStudents: (data.carryoverStats.affectedStudents || []).slice(0, 100)
        };
      }

      // Update failed students
      if (data.failedStudents) {
        summary.failedStudents = data.failedStudents.slice(0, 100);
      }

      // Update additional metrics
      if (data.additionalMetrics) {
        summary.additionalMetrics = data.additionalMetrics;
      }

      // Update status and completion time
      summary.completedAt = new Date();
      if (summary.startedAt) {
        summary.duration = Date.now() - summary.startedAt.getTime();
      }

      // Update final status
      if (data.status) {
        summary.status = data.status;
      } else if (data.failedStudents && data.failedStudents.length > 0) {
        summary.status = "completed_with_errors";
      } else {
        summary.status = "completed";
      }

      await summary.save();
      console.log(`✅ Updated computation summary ${summaryId} with level-based data`);
      return summary;
    } catch (error) {
      console.error("Failed to update computation summary:", error);
      throw error;
    }
  }

  /**
   * Helper method to prepare level-based data for computation summary
   * @param {Object} counters - Computation counters
   * @param {Object} buffers - Data buffers
   * @param {Object} gradeDistribution - Grade distribution
   * @param {Object} levelStats - Level statistics
   * @returns {Object} Formatted data for computation summary
   */
 prepareComputationSummaryData(counters, buffers, gradeDistribution, levelStats) {
    // FIXED: SummaryListBuilder is now imported properly
    const summaryListBuilder = SummaryListBuilder;
    
    // Group data by level
    const studentSummariesByLevel = summaryListBuilder.groupStudentSummariesByLevel(buffers.studentSummaries || []);
    const groupedLists = summaryListBuilder.groupListsByLevel(buffers.listEntries || []);
    
    // Build summary stats with level organization
    const summaryStats = summaryListBuilder.buildSummaryStatsByLevel(counters, gradeDistribution, levelStats);
    
    // Build backward compatible flat lists
    const flatLists = summaryListBuilder.buildBackwardCompatibleLists(groupedLists);
    
    // Prepare carryover stats by level
    const carryoverStatsByLevel = {};
    for (const [level, carryoverStudents] of Object.entries(groupedLists.carryoverStudents || {})) {
      carryoverStatsByLevel[level] = {
        totalCarryovers: carryoverStudents.reduce((sum, student) => sum + (student.courses?.length || 0), 0),
        affectedStudentsCount: carryoverStudents.length,
        affectedStudents: carryoverStudents.slice(0, 100)
      };
    }
    
    // Prepare student lists by level
    const studentListsByLevel = {};
    for (const [level] of Object.entries(studentSummariesByLevel)) {
      studentListsByLevel[level] = {
        passList: groupedLists.passList[level] || [],
        probationList: groupedLists.probationList[level] || [],
        withdrawalList: groupedLists.withdrawalList[level] || [],
        terminationList: groupedLists.terminationList[level] || [],
        carryoverStudents: groupedLists.carryoverStudents[level] || []
      };
    }
    
    return {
      ...summaryStats,
      studentSummariesByLevel,
      keyToCoursesByLevel: buffers.keyToCourses || {},
      studentListsByLevel,
      carryoverStatsByLevel,
      // Backward compatible data
      passList: flatLists.passList,
      probationList: flatLists.probationList,
      withdrawalList: flatLists.withdrawalList,
      terminationList: flatLists.terminationList,
      carryoverStats: {
        totalCarryovers: counters.totalCarryovers,
        affectedStudentsCount: counters.affectedStudentsCount,
        affectedStudents: buffers.carryoverStudents?.slice(0, 100) || []
      },
      failedStudents: buffers.failedStudents || [],
      additionalMetrics: {
        levelStats
      }
    };
  }
}

export default BulkWriter;