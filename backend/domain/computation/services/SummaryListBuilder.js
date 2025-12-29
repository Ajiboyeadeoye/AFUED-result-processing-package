// services/SummaryListBuilder.js
import { REMARK_CATEGORIES, GRADES } from "../utils/computationConstants.js";
import GPACalculator from "./GPACalculator.js";

class SummaryListBuilder {
  /**
   * Build student summary for master sheet - organized by level
   * @param {Object} student - Student data
   * @param {Object} gpaData - GPA calculation data
   * @param {Object} cgpaData - CGPA calculation data with TCP/TNU
   * @param {Object} academicStanding - Academic standing
   * @param {Array} outstandingCourses - Outstanding courses
   * @param {Array} academicHistory - Academic history for MMS2
   * @returns {Object} Student summary organized by level
   */
  buildStudentSummary(student, gpaData, cgpaData, academicStanding, outstandingCourses = [], academicHistory = []) {
    const studentLevel = student.level || "100";

    return {
      level: studentLevel,
      summary: {
        studentId: student._id,
        matricNumber: student.matricNumber,
        name: student.name,
        level: studentLevel,

        // Current semester performance (MMS1)
        currentSemester: {
          tcp: gpaData.totalCreditPoints || 0,
          tnu: gpaData.totalUnits || 0,
          gpa: gpaData.semesterGPA || 0
        },

        // Previous performance (MMS2 Previous column)
        previousPerformance: {
          cumulativeTCP: cgpaData.previousCumulativeTCP || 0,
          cumulativeTNU: cgpaData.previousCumulativeTNU || 0,
          cumulativeGPA: cgpaData.cgpa || 0,
          previousSemesterGPA: student.gpa || 0
        },

        // Cumulative performance (MMS2 Cumulative column)
        cumulativePerformance: {
          totalTCP: cgpaData.cumulativeTCP || 0,
          totalTNU: cgpaData.cumulativeTNU || 0,
          cgpa: cgpaData.cgpa || 0
        },

        // Course-by-course results for MMS1
        courseResults: gpaData.courseResults || [],

        // Outstanding courses for master sheet
        outstandingCourses: outstandingCourses,

        // Academic status
        academicStatus: this.mapRemarkToStatus(academicStanding.remark),

        // For MMS2 tracking
        academicHistory: academicHistory
      }
    };
  }

  /**
   * Build student list entries organized by level
   * @param {Object} student - Student data
   * @param {Object} academicStanding - Academic standing
   * @param {number} semesterGPA - Semester GPA
   * @param {number} carryoverCount - Number of carryovers
   * @param {Array} failedCourses - Failed courses
   * @returns {Object} Lists organized by level
   */

  addStudentToLists(student, academicStanding, semesterGPA, cgpa, carryoverCount, failedCourses = []) {
    const studentLevel = student.level || "100";
    const lists = {
      level: studentLevel,
      passList: null,
      probationList: null,
      withdrawalList: null,
      terminationList: null,
      carryoverList: null
    };

    const studentListEntry = {
      studentId: student._id,
      matricNumber: student.matricNumber,
      name: student.name,
      level: studentLevel,
      gpa: semesterGPA,      // Semester GPA
      cgpa: cgpa,            // ADDED: Cumulative GPA
      department: student.department?.name || student.department
    };

    // Determine which lists to add to
    switch (academicStanding.remark) {
      case REMARK_CATEGORIES.EXCELLENT:
      case REMARK_CATEGORIES.GOOD:
        if (carryoverCount === 0) {
          lists.passList = {
            ...studentListEntry,
            remark: academicStanding.remark
          };
        }
        break;

      case REMARK_CATEGORIES.PROBATION:
        lists.probationList = {
          ...studentListEntry,
          remarks: academicStanding.actionTaken || "Placed on academic probation",
          previousStatus: student.probationStatus,
          // ✅ Now includes both gpa and cgpa from studentListEntry
        };
        break;

      case REMARK_CATEGORIES.WITHDRAWN:
        lists.withdrawalList = {
          ...studentListEntry,
          reason: "Poor academic performance",
          remarks: academicStanding.actionTaken || "Withdrawn due to low CGPA",
          // ✅ Now uses cgpa from studentListEntry (calculated CGPA)
        };
        break;

      case REMARK_CATEGORIES.TERMINATED:
        lists.terminationList = {
          ...studentListEntry,
          reason: academicStanding.reason || "Excessive carryovers or poor performance",
          remarks: academicStanding.actionTaken || "Terminated due to academic standing",
          totalCarryovers: carryoverCount
        };
        break;
    }

    // Add to carryover list if applicable
    if (carryoverCount > 0) {
      lists.carryoverList = {
        ...studentListEntry,
        courses: failedCourses.map(fc => ({
          courseId: fc.courseId,
          courseCode: fc.courseCode || 'N/A',
          grade: fc.grade || 'F',
          score: fc.score || 0
        })),
        carryoverCount: carryoverCount,
        notes: `Failed ${carryoverCount} course(s)`
      };
    }

    return lists;
  }

  /**
   * Build complete summary statistics organized by level
   * @param {Object} counters - Various counters
   * @param {Object} gradeDistribution - Grade distribution
   * @param {Object} levelStats - Statistics by level
   * @returns {Object} Complete summary object organized by level
   */
  buildSummaryStatsByLevel(counters, gradeDistribution, levelStats) {
    const {
      totalStudents,
      studentsWithResults,
      totalGPA,
      highestGPA,
      lowestGPA,
      totalCarryovers,
      affectedStudentsCount
    } = counters;

    // Calculate overall averages
    const averageGPA = studentsWithResults > 0 ? totalGPA / studentsWithResults : 0;

    // Build level-wise summary
    const summaryOfResultsByLevel = new Map();

    if (levelStats && typeof levelStats === 'object') {
      Object.keys(levelStats).forEach(level => {
        const levelData = levelStats[level];
        if (levelData && levelData.totalStudents > 0) {
          levelData.averageGPA = levelData.totalGPA / levelData.totalStudents;

          summaryOfResultsByLevel.set(level, {
            totalStudents: levelData.totalStudents,
            studentsWithResults: levelData.studentsWithResults || levelData.totalStudents,

            gpaStatistics: {
              average: parseFloat(levelData.averageGPA.toFixed(2)),
              highest: parseFloat(levelData.highestGPA.toFixed(2)),
              lowest: parseFloat(levelData.lowestGPA.toFixed(2)),
              standardDeviation: 0 // Can be calculated if needed
            },

            classDistribution: levelData.gradeDistribution || {
              firstClass: 0,
              secondClassUpper: 0,
              secondClassLower: 0,
              thirdClass: 0,
              pass: 0,
              fail: 0
            }
          });
        }
      });
    }

    // Overall grade distribution (convert from old format to new)
    const overallGradeDistribution = {
      firstClass: gradeDistribution?.firstClass || 0,
      secondClassUpper: gradeDistribution?.secondClassUpper || 0,
      secondClassLower: gradeDistribution?.secondClassLower || 0,
      thirdClass: gradeDistribution?.thirdClass || 0,
      pass: Object.values(gradeDistribution || {}).reduce((sum, val) => sum + (val || 0), 0) - (gradeDistribution?.fail || 0),
      fail: gradeDistribution?.fail || 0
    };

    return {
      totalStudents: totalStudents || 0,
      studentsWithResults: studentsWithResults || 0,
      studentsProcessed: studentsWithResults || 0,
      averageGPA: parseFloat((averageGPA || 0).toFixed(2)),
      highestGPA: parseFloat((highestGPA || 0).toFixed(2)),
      lowestGPA: parseFloat((lowestGPA || 5.0).toFixed(2)),
      gradeDistribution: overallGradeDistribution,
      summaryOfResultsByLevel: Object.fromEntries(summaryOfResultsByLevel),
      levelStats: levelStats || {},
      totalCarryovers: totalCarryovers || 0,
      affectedStudentsCount: affectedStudentsCount || 0
    };
  }

  /**
   * Map remark to academic status for master sheet
   * @param {string} remark - Remark from academic standing
   * @returns {string} Academic status
   */
  mapRemarkToStatus(remark) {
    switch (remark) {
      case REMARK_CATEGORIES.EXCELLENT:
      case REMARK_CATEGORIES.GOOD:
        return "good";
      case REMARK_CATEGORIES.PROBATION:
        return "probation";
      case REMARK_CATEGORIES.WITHDRAWN:
        return "withdrawal";
      case REMARK_CATEGORIES.TERMINATED:
        return "terminated";
      default:
        return "good";
    }
  }

  // In SummaryListBuilder.js - FIXED buildKeyToCoursesByLevel

  /**
   * Build key to courses from results, organized by level - FIXED VERSION
   * @param {Array} results - All results in the semester
   * @returns {Promise<Object>} Key to courses organized by level {level: [courses]}
   */
  async buildKeyToCoursesByLevel(results) {
    try {
      console.log(`📊 [KeyToCourses] Building from ${results?.length || 0} results`);

      if (!Array.isArray(results) || results.length === 0) {
        console.warn('buildKeyToCoursesByLevel: No results or not an array');
        return {};
      }

      const coursesByLevel = {};
      const uniqueCourses = new Map(); // Track unique courses by level

      for (const result of results) {
        if (!result || typeof result !== 'object') {
          console.warn('Skipping invalid result:', result);
          continue;
        }

        // Get course data from result
        const course = result.courseId;
        if (!course) {
          console.warn('Result missing courseId:', result);
          continue;
        }

        // Get level from student or course
        let level;
        if (result.studentId && typeof result.studentId === 'object' && result.studentId.level) {
          level = result.studentId.level.toString();
        } else if (result.studentId && typeof result.studentId !== 'object' && result.student) {
          level = result.student?.level?.toString();
        } else if (course.level) {
          level = course.level.toString();
        } else {
          level = "100"; // Default
        }

        // ✅ CRITICAL FIX: Initialize courses array for this level
        if (!coursesByLevel[level]) {
          coursesByLevel[level] = [];  // ✅ Direct array, not nested object
          uniqueCourses.set(level, new Set());
        }

        // Create unique key for this course
        const courseKey = course._id?.toString() || JSON.stringify(course);
        const levelUniqueSet = uniqueCourses.get(level);

        // Skip if we've already added this course for this level
        if (levelUniqueSet.has(courseKey)) {
          continue;
        }
        levelUniqueSet.add(courseKey);

        // Handle borrowed courses
        let finalCourse = {
          courseId: course._id,
          courseCode: course.courseCode || 'N/A',
          title: course.title || 'N/A',
          unit: course.unit || 0,
          level: parseInt(level),
          type: course.type || 'core',
          isCoreCourse: course.isCoreCourse || false,
          isBorrowed: false
        };

        // If course has borrowedId and it's populated, use the original course data
        if (course.borrowedId && typeof course.borrowedId === 'object') {
          const originalCourse = course.borrowedId;
          finalCourse = {
            ...finalCourse,
            courseCode: originalCourse.courseCode || course.courseCode,
            title: originalCourse.title || course.title,
            unit: originalCourse.unit || course.unit,
            level: originalCourse.level || course.level || parseInt(level),
            type: originalCourse.type || course.type,
            isCoreCourse: originalCourse.isCoreCourse || course.isCoreCourse,
            isBorrowed: true
          };
        }

        // ✅ CORRECT: Direct array push
        coursesByLevel[level].push(finalCourse);
      }

      // Sort courses by courseCode within each level
      for (const level in coursesByLevel) {
        if (Array.isArray(coursesByLevel[level])) {
          coursesByLevel[level].sort((a, b) =>
            (a.courseCode || "").localeCompare(b.courseCode || "")
          );

          console.log(`  Level ${level}: ${coursesByLevel[level].length} unique courses`);
          if (coursesByLevel[level].length > 0) {
            console.log(`    Courses: ${coursesByLevel[level].map(c => c.courseCode).join(', ')}`);
          }
        }
      }

      const totalCourses = Object.values(coursesByLevel).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0);
      console.log(`📊 [KeyToCourses] Built ${totalCourses} courses across ${Object.keys(coursesByLevel).length} levels`);

      // ✅ FINAL VALIDATION: Ensure structure is correct
      console.log('🔍 [KeyToCourses] Structure validation:');
      for (const level in coursesByLevel) {
        const value = coursesByLevel[level];
        if (Array.isArray(value)) {
          console.log(`  ✅ Level ${level}: Array with ${value.length} items`);
        } else {
          console.log(`  ❌ Level ${level}: NOT ARRAY (${typeof value})`);
          // Fix it
          if (value && typeof value === 'object' && !Array.isArray(value)) {
            console.log(`    Fixing nested structure for level ${level}...`);
            // If it's nested like {"100": [...]}, extract the array
            if (value[level] && Array.isArray(value[level])) {
              coursesByLevel[level] = value[level];
              console.log(`    Fixed: Extracted ${coursesByLevel[level].length} courses`);
            } else {
              coursesByLevel[level] = [];
            }
          }
        }
      }

      return coursesByLevel;

    } catch (error) {
      console.error('❌ Error in buildKeyToCoursesByLevel:', error);
      return {};
    }
  }

  /**
   * Group student summaries by level
   * @param {Object|Array} studentSummariesData - Student summaries data
   * @returns {Object} Student summaries grouped by level {level: [summaryObjects]}
   */
  groupStudentSummariesByLevel(studentSummariesData) {
    // Handle empty or null input
    if (!studentSummariesData) {
      console.warn('groupStudentSummariesByLevel: No data provided');
      return {};
    }

    // If it's already in the correct grouped format {level: [{level, summary}]}
    if (typeof studentSummariesData === 'object' && !Array.isArray(studentSummariesData)) {
      const result = {};

      for (const [level, items] of Object.entries(studentSummariesData)) {
        if (!Array.isArray(items)) {
          result[level] = [];
          continue;
        }

        // Extract just the summary part from each wrapper object 
        result[level] = items.map(item => {
          if (item && typeof item === 'object') {
            // If it has a summary property, return that
            if (item.summary) {
              return item.summary;
            }
            // Otherwise return the item as-is
            return item;
          }
          return item;
        }).filter(item => item); // Remove null/undefined items
      }

      return result;
    }

    // If it's an array, group by level
    if (Array.isArray(studentSummariesData)) {
      const grouped = {};

      for (const item of studentSummariesData) {
        if (!item || typeof item !== 'object') continue;

        let level, summary;

        // Handle wrapper object structure: {level: "100", summary: {...}}
        if (item.level && item.summary) {
          level = item.level;
          summary = item.summary;
        } else if (item.level) {
          // Flat structure with level property
          level = item.level;
          summary = item;
        } else {
          // Default to level 100
          level = "100";
          summary = item;
        }

        if (!grouped[level]) {
          grouped[level] = [];
        }

        grouped[level].push(summary);
      }

      return grouped;
    }

    // Return empty object for any other input
    console.warn('groupStudentSummariesByLevel: Invalid input type', typeof studentSummariesData);
    return {};
  }

  /**
   * Group student lists by level
   * @param {Array|Object} listEntries - Array of list entries with level, or already grouped object
   * @returns {Object} Lists grouped by level
   */
  groupListsByLevel(listEntries) {
    // Handle empty or null input
    if (!listEntries) {
      console.warn('groupListsByLevel: No data provided');
      return {
        passList: {},
        probationList: {},
        withdrawalList: {},
        terminationList: {},
        carryoverStudents: {}
      };
    }

    // Initialize result structure
    const result = {
      passList: {},
      probationList: {},
      withdrawalList: {},
      terminationList: {},
      carryoverStudents: {}
    };

    // Handle different input formats
    if (Array.isArray(listEntries)) {
      // Input is array of list entries
      console.log(`groupListsByLevel: Processing ${listEntries.length} list entries`);

      for (const entry of listEntries) {
        if (!entry || typeof entry !== 'object') {
          console.warn('groupListsByLevel: Invalid entry', entry);
          continue;
        }

        const level = entry.level || "100";

        // Initialize arrays for this level if not exists
        if (!result.passList[level]) result.passList[level] = [];
        if (!result.probationList[level]) result.probationList[level] = [];
        if (!result.withdrawalList[level]) result.withdrawalList[level] = [];
        if (!result.terminationList[level]) result.terminationList[level] = [];
        if (!result.carryoverStudents[level]) result.carryoverStudents[level] = [];

        // Add entries to appropriate lists
        if (entry.passList && entry.passList !== null) {
          result.passList[level].push(entry.passList);
        }

        if (entry.probationList && entry.probationList !== null) {
          result.probationList[level].push(entry.probationList);
        }

        if (entry.withdrawalList && entry.withdrawalList !== null) {
          result.withdrawalList[level].push(entry.withdrawalList);
        }

        if (entry.terminationList && entry.terminationList !== null) {
          result.terminationList[level].push(entry.terminationList);
        }

        if (entry.carryoverList && entry.carryoverList !== null) {
          result.carryoverStudents[level].push(entry.carryoverList);
        }
      }
    } else if (typeof listEntries === 'object') {
      // Input might already be grouped
      console.log('groupListsByLevel: Input is already an object');

      // Check if it has our expected structure
      const expectedKeys = ['passList', 'probationList', 'withdrawalList', 'terminationList', 'carryoverStudents'];
      const hasAllKeys = expectedKeys.every(key => key in listEntries);

      if (hasAllKeys) {
        // Already in correct structure, just return
        return listEntries;
      } else {
        // Might be {level: [entries]} format
        for (const [level, entries] of Object.entries(listEntries)) {
          if (!Array.isArray(entries)) continue;

          // Initialize arrays for this level
          result.passList[level] = [];
          result.probationList[level] = [];
          result.withdrawalList[level] = [];
          result.terminationList[level] = [];
          result.carryoverStudents[level] = [];

          // Process each entry
          for (const entry of entries) {
            if (!entry || typeof entry !== 'object') continue;

            // Add based on entry type
            if (entry.passList) result.passList[level].push(entry.passList);
            if (entry.probationList) result.probationList[level].push(entry.probationList);
            if (entry.withdrawalList) result.withdrawalList[level].push(entry.withdrawalList);
            if (entry.terminationList) result.terminationList[level].push(entry.terminationList);
            if (entry.carryoverList) result.carryoverStudents[level].push(entry.carryoverList);
          }
        }
      }
    }

    // Log what we found
    console.log('groupListsByLevel Result:', {
      totalLevels: Object.keys(result.passList).length,
      passListCounts: Object.keys(result.passList).map(l => `${l}: ${result.passList[l].length}`),
      probationListCounts: Object.keys(result.probationList).map(l => `${l}: ${result.probationList[l].length}`),
      terminationListCounts: Object.keys(result.terminationList).map(l => `${l}: ${result.terminationList[l].length}`)
    });

    return result;
  }

  /**
   * Convert flat grouped structure to structured format
   * @param {Object} flatGroup - Object with levels as keys
   * @returns {Object} Structured grouped lists
   */
  _convertFlatGroupToStructured(flatGroup) {
    const structured = {
      passList: {},
      probationList: {},
      withdrawalList: {},
      terminationList: {},
      carryoverStudents: {}
    };

    for (const [level, entries] of Object.entries(flatGroup)) {
      if (!Array.isArray(entries)) continue;

      // Initialize all list types for this level
      structured.passList[level] = [];
      structured.probationList[level] = [];
      structured.withdrawalList[level] = [];
      structured.terminationList[level] = [];
      structured.carryoverStudents[level] = [];

      // Categorize each entry
      for (const entry of entries) {
        if (!entry || typeof entry !== 'object') continue;

        // Determine which list this entry belongs to
        if (entry.remark === 'excellent' || entry.remark === 'good' || entry.gpa >= 1.5) {
          structured.passList[level].push(entry);
        } else if (entry.remark === 'probation' || (entry.gpa >= 1.0 && entry.gpa < 1.5)) {
          structured.probationList[level].push(entry);
        } else if (entry.remark === 'withdrawn') {
          structured.withdrawalList[level].push(entry);
        } else if (entry.remark === 'terminated') {
          structured.terminationList[level].push(entry);
        }

        // Check for carryover list
        if (entry.carryoverCount > 0 || entry.courses) {
          structured.carryoverStudents[level].push(entry);
        }
      }
    }

    return structured;
  }
  /** Build department details with dean and HOD information
   * @param {Object} department - Department object
   * @param {Object} faculty - Faculty object (populated with dean)
   * @param {Object} hodLecturer - Lecturer object for HOD
   * @param {Object} deanLecturer - Lecturer object for Dean
   * @param {Object} activeSemester - Current semester
   * @returns {Object} Department details
   */
  buildDepartmentDetails(department, faculty, hodLecturer, deanLecturer, activeSemester) {
    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;

    return {
      name: department?.name || '',
      code: department?.code || '',
      faculty: {
        name: faculty?.name || '',
        code: faculty?.code || ''
      },
      dean: {
        name: deanLecturer?._id?.name || deanLecturer?.name || 'Dr. John Doe',
        title: 'Dean',
        rank: deanLecturer?.rank || 'Professor',
        staffId: deanLecturer?.staffId || '',
        signature: deanLecturer?.signature || '',
        isDean: deanLecturer?.isDean || true
      },
      hod: {
        name: hodLecturer?._id?.name || hodLecturer?.name || 'Prof. Jane Smith',
        title: 'Head of Department',
        rank: hodLecturer?.rank || 'Professor',
        staffId: hodLecturer?.staffId || '',
        signature: hodLecturer?.signature || '',
        isHOD: hodLecturer?.isHOD || true
      },
      academicYear: activeSemester?.academicYear || `${currentYear}/${nextYear}`,
      semester: activeSemester?.name || '',
      generatedDate: new Date().toISOString()
    };
  }

  /**
   * Build master sheet data structure organized by level with robust error handling
   * @param {Object|Map} studentSummariesByLevel - Student summaries grouped by level
   * @param {Object} summaryStats - Summary statistics
   * @param {Object|Map} keyToCoursesByLevel - Key to courses grouped by level
   * @returns {Object} Master sheet data organized by level
   */
  buildMasterSheetDataByLevel(studentSummariesByLevel, summaryStats, keyToCoursesByLevel, departmentDetails = {}) {
    try {
      // Convert Map to object if necessary
      const studentSummaries = this._convertToObject(studentSummariesByLevel);
      const keyToCourses = this._convertToObject(keyToCoursesByLevel);

      // Validate inputs
      if (!studentSummaries || typeof studentSummaries !== 'object') {
        console.error('buildMasterSheetDataByLevel: Invalid studentSummariesByLevel:', studentSummariesByLevel);
        return {
          masterSheetDataByLevel: {},
          overallSummary: summaryStats || {}
        };
      }

      const masterSheetDataByLevel = new Map();
      const levels = Object.keys(studentSummaries);

      // Process each level
      for (const level of levels) {
        const studentSummariesForLevel = studentSummaries[level];
        const coursesForLevel = keyToCourses[level] || [];

        if (!Array.isArray(studentSummariesForLevel)) {
          console.warn(`buildMasterSheetDataByLevel: Invalid student summaries for level ${level}:`, studentSummariesForLevel);
          continue;
        }

        // Pass List
        const passList = this._buildPassList(studentSummariesForLevel);

        // Courses Still Outstanding
        const outstandingCoursesList = this._buildOutstandingCoursesList(studentSummariesForLevel);

        // Probation List
        const probationList = this._buildProbationList(studentSummariesForLevel);

        // Withdrawal List
        const withdrawalList = this._buildWithdrawalList(studentSummariesForLevel);

        // Termination List
        const terminationList = this._buildTerminationList(studentSummariesForLevel);

        // Summary of Results for this level
        const levelSummary = summaryStats?.summaryOfResultsByLevel?.[level] || {};
        const summaryOfResults = this._buildSummaryOfResults(levelSummary);

        // MMS1 Format for this level
        const mms1 = this._buildMMS1(studentSummariesForLevel, coursesForLevel);

        // MMS2 Format for this level
        const mms2 = this._buildMMS2(studentSummariesForLevel);

        masterSheetDataByLevel.set(level, {
          keyToCourses: coursesForLevel,
          passList,
          outstandingCoursesList,
          probationList,
          withdrawalList,
          terminationList,
          summaryOfResults,
          mms1,
          mms2
        });
      }

      return {
        masterSheetDataByLevel: Object.fromEntries(masterSheetDataByLevel),
        overallSummary: summaryStats || {},
        // ADD DEPARTMENT DETAILS HERE:
        departmentDetails: departmentDetails || this._getDefaultDepartmentDetails()
      };

    } catch (error) {
      console.error('Error in buildMasterSheetDataByLevel:', error);
      return {
        masterSheetDataByLevel: {},
        overallSummary: summaryStats || {},
        departmentDetails: {
          name: '',
          dean: { name: '', title: 'Dean' },
          hod: { name: '', title: 'Head of Department' }
        }
      };
    }
  }

  /**
   * Helper method to convert Map to object
   */
  _convertToObject(input) {
    if (!input) return {};

    if (input instanceof Map) {
      return Object.fromEntries(input);
    }

    if (typeof input === 'object' && !Array.isArray(input)) {
      return input;
    }

    console.warn('_convertToObject: Invalid input type', typeof input);
    return {};
  }

  /**
   * Build pass list for a level
   */
  _buildPassList(studentSummaries) {
    if (!Array.isArray(studentSummaries)) return [];

    return studentSummaries
      .filter(s => s && s.academicStatus === "good" && s.currentSemester?.gpa >= 1.5)
      .map((s, index) => ({
        s_n: index + 1,
        matricNo: s.matricNumber || 'N/A',
        name: s.name || 'N/A',
        gpa: s.currentSemester?.gpa || 0
      }));
  }

  /**
   * Build outstanding courses list for a level
   */
  _buildOutstandingCoursesList(studentSummaries) {
    if (!Array.isArray(studentSummaries)) return [];

    return studentSummaries
      .filter(s => s && s.outstandingCourses && s.outstandingCourses.length > 0)
      .map((s, index) => ({
        s_n: index + 1,
        matricNo: s.matricNumber || 'N/A',
        name: s.name || 'N/A',
        courses: Array.isArray(s.outstandingCourses)
          ? s.outstandingCourses.map(c => c.courseCode || c.courseId || 'N/A').filter(Boolean)
          : []
      }));
  }

  /**
   * Build probation list for a level
   */
  _buildProbationList(studentSummaries) {
    if (!Array.isArray(studentSummaries)) return [];

    return studentSummaries
      .filter(s => s && s.academicStatus === "probation")
      .map((s, index) => ({
        s_n: index + 1,
        matricNo: s.matricNumber || 'N/A',
        name: s.name || 'N/A',
        gpa: s.currentSemester?.gpa || 0,
        remarks: "Placed on academic probation"
      }));
  }

  /**
   * Build withdrawal list for a level
   */
  _buildWithdrawalList(studentSummaries) {
    if (!Array.isArray(studentSummaries)) return [];

    return studentSummaries
      .filter(s => s && s.academicStatus === "withdrawal")
      .map((s, index) => ({
        s_n: index + 1,
        matricNo: s.matricNumber || 'N/A',
        name: s.name || 'N/A',
        reason: "Poor academic performance",
        remarks: "Withdrawn due to low CGPA"
      }));
  }

  /**
   * Build termination list for a level
   */
  _buildTerminationList(studentSummaries) {
    if (!Array.isArray(studentSummaries)) return [];

    return studentSummaries
      .filter(s => s && s.academicStatus === "terminated")
      .map((s, index) => ({
        s_n: index + 1,
        matricNo: s.matricNumber || 'N/A',
        name: s.name || 'N/A',
        reason: "Excessive carryovers or poor performance",
        remarks: "Terminated due to academic standing"
      }));
  }

  /**
   * Build summary of results for a level
   */
  _buildSummaryOfResults(levelSummary) {
    return {
      totalStudents: levelSummary.totalStudents || 0,
      studentsWithResults: levelSummary.studentsWithResults || 0,
      gpaStatistics: levelSummary.gpaStatistics || {
        average: 0,
        highest: 0,
        lowest: 0
      },
      classDistribution: levelSummary.classDistribution || {
        firstClass: 0,
        secondClassUpper: 0,
        secondClassLower: 0,
        thirdClass: 0,
        pass: 0,
        fail: 0
      }
    };
  }

  /**
   * Build MMS1 for a level
   */
  _buildMMS1(studentSummaries, keyToCourses) {
    if (!Array.isArray(studentSummaries) || !Array.isArray(keyToCourses)) {
      return [];
    }

    return studentSummaries.map((student, index) => {
      const courses = keyToCourses.map(course => {
        const studentCourse = student.courseResults?.find(cr => cr.courseCode === course.courseCode);
        return {
          courseCode: course.courseCode,
          result: studentCourse ? {
            score: studentCourse.score || 0,
            grade: studentCourse.grade || 'F',
            gradePoint: studentCourse.gradePoint || 0,
            creditPoint: studentCourse.creditPoint || 0
          } : {
            score: '-',
            grade: '-',
            gradePoint: 0,
            creditPoint: 0
          }
        };
      });

      return {
        s_n: index + 1,
        matricNo: student.matricNumber || 'N/A',
        courses: courses,
        current: {
          tcp: student.currentSemester?.tcp || 0,
          tnu: student.currentSemester?.tnu || 0,
          gpa: student.currentSemester?.gpa || 0
        }
      };
    });
  }

  /**
   * Build MMS2 for a level
   */
  _buildMMS2(studentSummaries) {
    if (!Array.isArray(studentSummaries)) return [];

    return studentSummaries.map((student, index) => ({
      s_n: index + 1,
      matricNo: student.matricNumber || 'N/A',
      current: {
        tcp: student.currentSemester?.tcp || 0,
        tnu: student.currentSemester?.tnu || 0,
        gpa: student.currentSemester?.gpa || 0
      },
      previous: {
        tcp: student.previousPerformance?.cumulativeTCP || 0,
        tnu: student.previousPerformance?.cumulativeTNU || 0,
        gpa: student.previousPerformance?.previousSemesterGPA || 0
      },
      cumulative: {
        tcp: student.cumulativePerformance?.totalTCP || 0,
        tnu: student.cumulativePerformance?.totalTNU || 0,
        gpa: student.cumulativePerformance?.cgpa || 0
      }
    }));
  }

  /**
   * Calculate grade distribution from student GPAs with error handling
   * @param {Array} studentSummaries - Student summaries with GPAs
   * @returns {Object} Grade distribution
   */
  calculateGradeDistribution(studentSummaries) {
    const distribution = {
      firstClass: 0,
      secondClassUpper: 0,
      secondClassLower: 0,
      thirdClass: 0,
      fail: 0
    };

    if (!Array.isArray(studentSummaries)) {
      console.warn('calculateGradeDistribution: studentSummaries is not an array:', studentSummaries);
      return distribution;
    }

    for (const student of studentSummaries) {
      if (!student || typeof student !== 'object') continue;

      try {
        const gpa = student.currentSemester?.gpa || student.gpa || 0;
        const classification = GPACalculator.getGradeClassification(gpa);

        if (distribution[classification] !== undefined) {
          distribution[classification]++;
        } else {
          distribution.fail++; // Default to fail if classification is invalid
        }
      } catch (error) {
        console.warn('Error calculating grade for student:', student, error);
        distribution.fail++;
      }
    }

    return distribution;
  }

  /**
   * Build backward compatible data (for old fields) with error handling
   * @param {Object} groupedLists - Lists grouped by level
   * @returns {Object} Flat lists for backward compatibility
   */
  buildBackwardCompatibleLists(groupedLists) {
    const flatLists = {
      passList: [],
      probationList: [],
      withdrawalList: [],
      terminationList: [],
      carryoverStudents: []
    };

    if (!groupedLists || typeof groupedLists !== 'object') {
      console.warn('buildBackwardCompatibleLists: groupedLists is invalid:', groupedLists);
      return flatLists;
    }

    // Helper function to safely flatten arrays
    const flattenArray = (arr) => {
      if (!arr || !Array.isArray(arr)) return [];
      return arr.filter(item => item !== null && item !== undefined);
    };

    // Flatten all lists with safety checks
    const listTypes = ['passList', 'probationList', 'withdrawalList', 'terminationList', 'carryoverStudents'];

    for (const listType of listTypes) {
      if (groupedLists[listType] && typeof groupedLists[listType] === 'object') {
        for (const level in groupedLists[listType]) {
          const levelList = groupedLists[listType][level];
          if (Array.isArray(levelList)) {
            flatLists[listType].push(...flattenArray(levelList));
          }
        }
      }
    }

    return flatLists;
  }
}

export default new SummaryListBuilder();