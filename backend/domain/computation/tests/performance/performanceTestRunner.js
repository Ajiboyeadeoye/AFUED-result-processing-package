// test/performance/performanceTestRunner.js
import mongoose from "mongoose";
import { processDepartmentJob } from "../../computation/workers/computation.controller.js";
import StudentService from "../../computation/services/StudentService.js";
import BulkWriter from "../../computation/services/BulkWriter.js";
import departmentModel from "../../models/department/department.model.js";
import studentModel from "../../models/student/student.model.js";
import Result from "../../models/result.model.js";

class PerformanceTestRunner {
  constructor() {
    this.testScenarios = [
      { students: 100, coursesPerStudent: 8, name: "Small Department" },
      { students: 1000, coursesPerStudent: 8, name: "Medium Department" },
      { students: 5000, coursesPerStudent: 8, name: "Large Department" },
      { students: 10000, coursesPerStudent: 8, name: "Very Large Department" },
      { students: 20000, coursesPerStudent: 8, name: "Extreme Department" }
    ];
    
    this.metrics = {
      memoryUsage: [],
      executionTime: [],
      databaseQueries: [],
      cpuUsage: []
    };
  }
  
  async runAllTests() {
    console.log("🚀 Starting Performance Tests...\n");
    
    for (const scenario of this.testScenarios) {
      await this.runTest(scenario);
    }
    
    this.generateReport();
  }
  
  async runTest(scenario) {
    const { students, coursesPerStudent, name } = scenario;
    
    console.log(`\n📊 Testing: ${name} (${students} students)`);
    console.log("=" .repeat(50));
    
    // 1. Setup Test Data
    const startSetup = Date.now();
    const { departmentId, semesterId } = await this.setupTestData(students, coursesPerStudent);
    const setupTime = Date.now() - startSetup;
    
    console.log(`✅ Test data setup: ${setupTime}ms`);
    
    // 2. Run Computation
    const startCompute = Date.now();
    const result = await this.runComputation(departmentId, semesterId, students);
    const computeTime = Date.now() - startCompute;
    
    // 3. Collect Metrics
    this.collectMetrics(scenario, computeTime, result);
    
    // 4. Cleanup
    await this.cleanupTestData(departmentId);
  }
  
  async setupTestData(studentCount, coursesPerStudent) {
    // Create test department
    const department = new departmentModel({
      name: `Test Department ${Date.now()}`,
      code: `TD${Math.random().toString(36).substr(2, 6)}`,
      status: "active"
    });
    await department.save();
    
    // Create test semester
    const semester = new Semester({
      name: "Test Semester",
      academicYear: "2024/2025",
      department: department._id,
      isActive: true,
      isLocked: false
    });
    await semester.save();
    
    // Create test courses
    const courses = [];
    for (let i = 1; i <= 20; i++) {
      const course = new courseModel({
        courseCode: `TEST${i}01`,
        title: `Test Course ${i}`,
        unit: 3,
        department: department._id,
        isCoreCourse: i <= 15, // 15 core, 5 elective
        level: 200,
        type: i <= 15 ? "core" : "elective"
      });
      await course.save();
      courses.push(course);
    }
    
    // Create test students with results
    const students = [];
    const results = [];
    
    for (let i = 1; i <= studentCount; i++) {
      // Create student
      const student = new studentModel({
        matricNumber: `TEST${department.code}${i.toString().padStart(6, '0')}`,
        name: `Test Student ${i}`,
        departmentId: department._id,
        level: 200,
        probationStatus: "none",
        terminationStatus: "none",
        totalCarryovers: 0
      });
      await student.save();
      students.push(student);
      
      // Create results for each student
      const studentCourses = courses.slice(0, coursesPerStudent);
      for (const course of studentCourses) {
        // Generate realistic scores (normal distribution around 55)
        const score = this.generateRealisticScore();
        
        const result = new Result({
          studentId: student._id,
          courseId: course._id,
          semester: semester._id,
          score: score,
          grade: this.calculateGrade(score),
          points: this.calculatePoints(score),
          courseUnit: course.unit,
          courseDepartmentId: department._id,
          deletedAt: null
        });
        results.push(result);
      }
    }
    
    // Bulk insert results for performance
    await Result.insertMany(results);
    
    console.log(`📝 Created: ${studentCount} students, ${results.length} results`);
    
    return {
      departmentId: department._id,
      semesterId: semester._id
    };
  }
  
  async runComputation(departmentId, semesterId, studentCount) {
    const mockJob = {
      data: {
        departmentId,
        masterComputationId: new mongoose.Types.ObjectId(),
        computedBy: new mongoose.Types.ObjectId(),
        jobId: `perf-test-${Date.now()}`,
        isRetry: false
      },
      progress: (progress) => {
        if (progress % 20 === 0) {
          console.log(`   Progress: ${progress.toFixed(1)}%`);
        }
      }
    };
    
    // Start memory tracking
    const startMemory = process.memoryUsage();
    
    // Start CPU tracking
    const startCpu = process.cpuUsage();
    
    // Run computation
    const result = await processDepartmentJob(mockJob);
    
    // End tracking
    const endMemory = process.memoryUsage();
    const endCpu = process.cpuUsage();
    
    return {
      ...result,
      memoryUsed: endMemory.heapUsed - startMemory.heapUsed,
      cpuUsed: endCpu.user - startCpu.user
    };
  }
  
  collectMetrics(scenario, computeTime, result) {
    const metrics = {
      scenario: scenario.name,
      studentCount: scenario.students,
      executionTime: computeTime,
      timePerStudent: computeTime / scenario.students,
      memoryUsedMB: (result.memoryUsed / 1024 / 1024).toFixed(2),
      cpuUsedMs: result.cpuUsed / 1000,
      success: result.success
    };
    
    this.metrics.executionTime.push(metrics);
    console.log(`⏱️  Execution Time: ${computeTime}ms (${metrics.timePerStudent.toFixed(2)}ms/student)`);
    console.log(`💾 Memory Used: ${metrics.memoryUsedMB} MB`);
    console.log(`⚡ CPU Used: ${metrics.cpuUsedMs.toFixed(2)}ms`);
  }
  
  generateReport() {
    console.log("\n" + "=".repeat(60));
    console.log("📈 PERFORMANCE TEST REPORT");
    console.log("=".repeat(60));
    
    console.log("\nExecution Time Analysis:");
    console.log("-".repeat(40));
    console.log("Scenario                | Students | Time (ms) | Time/Student");
    console.log("-".repeat(40));
    
    this.metrics.executionTime.forEach(metric => {
      console.log(
        `${metric.scenario.padEnd(22)} | ` +
        `${metric.studentCount.toString().padEnd(8)} | ` +
        `${metric.executionTime.toString().padEnd(9)} | ` +
        `${metric.timePerStudent.toFixed(2)}ms`
      );
    });
    
    // Generate scalability chart
    this.generateScalabilityChart();
    
    // Generate recommendations
    this.generateRecommendations();
  }
  
  generateScalabilityChart() {
    console.log("\n📊 Scalability Analysis:");
    console.log("-".repeat(40));
    
    const data = this.metrics.executionTime;
    
    // Calculate O(n) complexity
    const small = data.find(d => d.studentCount === 100);
    const large = data.find(d => d.studentCount === 10000);
    
    if (small && large) {
      const ratio = large.executionTime / small.executionTime;
      const expectedRatio = large.studentCount / small.studentCount;
      
      console.log(`Time ratio (10k/100): ${ratio.toFixed(2)}x`);
      console.log(`Expected ratio (linear): ${expectedRatio}x (100x)`);
      console.log(`Scalability factor: ${(ratio / expectedRatio * 100).toFixed(1)}% of linear`);
      
      if (ratio < expectedRatio * 0.8) {
        console.log("✅ EXCELLENT: Sub-linear scaling (better than expected)");
      } else if (ratio < expectedRatio * 1.2) {
        console.log("✅ GOOD: Near-linear scaling (as expected)");
      } else {
        console.log("⚠️  WARNING: Super-linear scaling (performance degrades with size)");
      }
    }
  }
  
  generateRecommendations() {
    console.log("\n🎯 Performance Recommendations:");
    console.log("-".repeat(40));
    
    const lastTest = this.metrics.executionTime[this.metrics.executionTime.length - 1];
    
    if (lastTest.timePerStudent > 100) {
      console.log("❌ CRITICAL: Processing time per student is too high (>100ms)");
      console.log("   → Consider increasing batch size from 100 to 500");
      console.log("   → Implement Redis caching for CGPA calculations");
      console.log("   → Review database indexes on student and result collections");
    } else if (lastTest.timePerStudent > 50) {
      console.log("⚠️  MODERATE: Processing time could be optimized");
      console.log("   → Enable parallel processing within batches");
      console.log("   → Consider using MongoDB aggregation for CGPA");
      console.log("   → Implement connection pooling for database");
    } else {
      console.log("✅ EXCELLENT: Processing time is optimal");
      console.log("   → Current configuration handles scale well");
    }
    
    // Memory recommendations
    const maxMemory = Math.max(...this.metrics.executionTime.map(m => parseFloat(m.memoryUsedMB)));
    if (maxMemory > 500) {
      console.log("\n💾 Memory Usage High:");
      console.log(`   → Peak memory: ${maxMemory}MB`);
      console.log("   → Reduce batch size to 50");
      console.log("   → Implement streaming for large datasets");
    }
  }
  
  generateRealisticScore() {
    // Generate scores with normal distribution (mean: 55, std: 15)
    let score = 0;
    for (let i = 0; i < 12; i++) {
      score += Math.random();
    }
    score = (score - 6) * 15 + 55;
    
    // Clamp between 0 and 100
    score = Math.max(0, Math.min(100, Math.round(score)));
    
    // Ensure some failures (scores < 45)
    if (Math.random() < 0.15) { // 15% failure rate
      score = Math.floor(Math.random() * 45);
    }
    
    return score;
  }
  
  calculateGrade(score) {
    if (score >= 70) return "A";
    if (score >= 60) return "B";
    if (score >= 50) return "C";
    if (score >= 45) return "D";
    return "F";
  }
  
  calculatePoints(score) {
    if (score >= 70) return 5;
    if (score >= 60) return 4;
    if (score >= 50) return 3;
    if (score >= 45) return 2;
    return 0;
  }
  
  async cleanupTestData(departmentId) {
    // Cleanup in reverse order to avoid foreign key constraints
    await Result.deleteMany({ courseDepartmentId: departmentId });
    await studentModel.deleteMany({ departmentId });
    await courseModel.deleteMany({ department: departmentId });
    await Semester.deleteMany({ department: departmentId });
    await departmentModel.findByIdAndDelete(departmentId);
    
    console.log("🧹 Test data cleaned up");
  }
}

// Run tests
const runner = new PerformanceTestRunner();
runner.runAllTests().catch(console.error);