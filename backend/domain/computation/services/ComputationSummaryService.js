// computation/services/ComputationSummaryService.js
import SummaryListBuilder from "./SummaryListBuilder.js";

class ComputationSummaryService {
    constructor(isPreview = false, purpose = 'final') {
        this.isPreview = isPreview;
        this.purpose = purpose;
        this.summaryListBuilder = SummaryListBuilder;
    }

    /**
     * Build comprehensive computation summary
     */
    async buildComputationSummary(
        computationCore,
        computationSummary,
        department,
        activeSemester,
        departmentDetails = null
    ) {
        const { counters, buffers, gradeDistribution, levelStats } = computationCore;

        console.log('🔍 Service Input Check:', {
            buffersAvailable: {
                studentSummaries: buffers?.studentSummaries?.length || 0,
                studentSummariesByLevel: buffers?.studentSummariesByLevel
                    ? Object.keys(buffers.studentSummariesByLevel).length
                    : 0,
                listEntries: buffers?.listEntries?.length || 0,
                listEntriesByLevel: buffers?.listEntriesByLevel
                    ? Object.keys(buffers.listEntriesByLevel).length
                    : 0,
                allResults: buffers?.allResults?.length || 0,
                flatLists: buffers?.flatLists
                    ? Object.keys(buffers.flatLists).map(k => `${k}: ${buffers.flatLists[k]?.length || 0}`)
                    : []
            }
        });

        // ✅ FIX: Handle missing buffers
        if (!buffers || !buffers.studentSummaries) {
            console.warn('⚠️ Buffers are missing or empty, trying to rebuild...');

            // Try to get data from computationCore if it has the methods
            if (computationCore.prepareSummaryData) {
                const coreData = await computationCore.prepareSummaryData();
                Object.assign(buffers, coreData.buffers || {});
            }
        }

        // Get department details if not provided
        if (!departmentDetails) {
            departmentDetails = await this.getDepartmentLeadershipDetails(
                department._id,
                activeSemester._id
            );
        }

        // ✅ FIX: Build student summaries from multiple sources
        let studentSummariesByLevel = {};
        if (buffers.studentSummaries && Array.isArray(buffers.studentSummaries)) {
            // Use flat array
            studentSummariesByLevel = this.buildStudentSummariesByLevel(buffers.studentSummaries);
        } else if (buffers.studentSummaryDataByLevel) {
            // Use pre-grouped data
            studentSummariesByLevel = buffers.studentSummaryDataByLevel;
        } else if (buffers.studentSummariesByLevel) {
            // Extract from wrapper structure
            studentSummariesByLevel = {};
            for (const [level, summaries] of Object.entries(buffers.studentSummariesByLevel)) {
                if (Array.isArray(summaries)) {
                    studentSummariesByLevel[level] = summaries.map(s => s.summary || s);
                }
            }
        }

        console.log('📊 Built studentSummariesByLevel:', {
            levels: Object.keys(studentSummariesByLevel),
            totalStudents: Object.values(studentSummariesByLevel).reduce((sum, arr) => sum + (arr?.length || 0), 0)
        });

        // Build key to courses by level
        const keyToCoursesByLevel = await this.buildKeyToCoursesByLevel(
            buffers.allResults || []
        );

        // Group lists by level - try multiple sources
        let groupedLists = {};
        if (buffers.listEntries && Array.isArray(buffers.listEntries)) {
            groupedLists = this.summaryListBuilder.groupListsByLevel(buffers.listEntries);
        } else if (buffers.listEntriesByLevel) {
            // Convert listEntriesByLevel to the format groupListsByLevel expects
            const flatListEntries = [];
            for (const [level, entries] of Object.entries(buffers.listEntriesByLevel)) {
                if (Array.isArray(entries)) {
                    entries.forEach(entry => {
                        flatListEntries.push({ ...entry, level });
                    });
                }
            }
            groupedLists = this.summaryListBuilder.groupListsByLevel(flatListEntries);
        }

        console.log('📊 Grouped Lists:', {
            passListLevels: Object.keys(groupedLists.passList || {}),
            probationListLevels: Object.keys(groupedLists.probationList || {}),
            carryoverStudentsLevels: Object.keys(groupedLists.carryoverStudents || {})
        });

        // Build base summary data
        const summaryData = this.summaryListBuilder.buildSummaryStatsByLevel(
            counters,
            gradeDistribution,
            levelStats
        );

        // Build student lists by level
        const studentListsByLevel = this.buildStudentListsByLevel(groupedLists);

        // Build carryover stats by level
        const carryoverStatsByLevel = this.buildCarryoverStatsByLevel(groupedLists);

        // Build master sheet data
        const masterSheetData = this.summaryListBuilder.buildMasterSheetDataByLevel(
            studentSummariesByLevel,
            summaryData,
            keyToCoursesByLevel,
            departmentDetails
        );

        return {
            // Core summary data
            ...summaryData,
            departmentDetails,

            // Level-based organization
            studentSummariesByLevel,
            keyToCoursesByLevel,
            studentListsByLevel,
            carryoverStatsByLevel,

            // Master sheet structure
            masterSheetData,

            // Backward compatibility
            passList: this.extractFirst100(buffers.flatLists?.passList),
            probationList: this.extractFirst100(buffers.flatLists?.probationList),
            withdrawalList: this.extractFirst100(buffers.flatLists?.withdrawalList),
            terminationList: this.extractFirst100(buffers.flatLists?.terminationList),
            failedStudents: buffers.failedStudents || []
        };
    }

    /**
     * Shared method for both preview and final to build student summaries by level
     */
    buildStudentSummariesByLevel(studentSummaries) {
        if (!Array.isArray(studentSummaries)) {
            return {};
        }

        const grouped = {};
        for (const summary of studentSummaries) {
            const level = summary.level || "100";
            if (!grouped[level]) {
                grouped[level] = [];
            }

            // Extract just the summary part if it's wrapped
            const cleanSummary = summary.summary || summary;
            grouped[level].push(cleanSummary);
        }

        return grouped;
    }

    /**
     * Shared method for building key to courses
     */
    async buildKeyToCoursesByLevel(results) {
        return await this.summaryListBuilder.buildKeyToCoursesByLevel(results);
    }

    /**
     * Build student lists by level from grouped lists
     */
    buildStudentListsByLevel(groupedLists) {
        const studentListsByLevel = {};

        // Collect all levels from all list types
        const allLevels = new Set();
        ['passList', 'probationList', 'withdrawalList', 'terminationList', 'carryoverStudents'].forEach(listType => {
            if (groupedLists[listType]) {
                Object.keys(groupedLists[listType]).forEach(level => allLevels.add(level));
            }
        });

        // Build structure for each level
        for (const level of allLevels) {
            studentListsByLevel[level] = {
                passList: (groupedLists.passList && groupedLists.passList[level]) || [],
                probationList: (groupedLists.probationList && groupedLists.probationList[level]) || [],
                withdrawalList: (groupedLists.withdrawalList && groupedLists.withdrawalList[level]) || [],
                terminationList: (groupedLists.terminationList && groupedLists.terminationList[level]) || [],
                carryoverStudents: (groupedLists.carryoverStudents && groupedLists.carryoverStudents[level]) || []
            };
        }

        return studentListsByLevel;
    }

    /**
     * Build carryover stats by level
     */
    buildCarryoverStatsByLevel(groupedLists) {
        const carryoverStatsByLevel = {};

        if (groupedLists.carryoverStudents) {
            for (const [level, students] of Object.entries(groupedLists.carryoverStudents)) {
                carryoverStatsByLevel[level] = {
                    totalCarryovers: students.reduce((sum, student) => sum + (student.courses?.length || 0), 0),
                    affectedStudentsCount: students.length,
                    affectedStudents: students.slice(0, 100)
                };
            }
        }

        return carryoverStatsByLevel;
    }

    /**
     * Helper method to extract first 100 items
     */
    extractFirst100(array) {
        if (!Array.isArray(array)) return [];
        return array.slice(0, 100);
    }

    /**
     * Get department leadership details (shared for both preview and final)
     */
    async getDepartmentLeadershipDetails(departmentId, semesterId) {
        // This should be moved from helpers.js to here
        const { getDepartmentLeadershipDetails } = await import("./helpers.js");
        return await getDepartmentLeadershipDetails(departmentId, semesterId);
    }
}

export default ComputationSummaryService;