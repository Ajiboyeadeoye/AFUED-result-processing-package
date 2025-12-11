// test/performance/servicePerformance.test.js
import StudentService from "../../computation/services/StudentService.js";
import GPACalculator from "../../computation/services/GPACalculator.js";
import BulkWriter from "../../computation/services/BulkWriter.js";

describe("Service Performance Tests", () => {
  describe("StudentService", () => {
    test("getStudentsWithDetails - 1000 students", async () => {
      const start = Date.now();
      // Mock 1000 student IDs
      const studentIds = Array.from({ length: 1000 }, (_, i) => 
        new mongoose.Types.ObjectId()
      );
      
      const result = await StudentService.getStudentsWithDetails(studentIds);
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(500); // Should complete in <500ms
      console.log(`StudentService: ${duration}ms for 1000 students`);
    });
  });
  
  describe("GPACalculator", () => {
    test("calculateSemesterGPA - 1000 results", () => {
      const results = Array.from({ length: 1000 }, (_, i) => ({
        score: Math.floor(Math.random() * 100),
        courseUnit: 3,
        courseId: { _id: new mongoose.Types.ObjectId(), type: "core" }
      }));
      
      const start = Date.now();
      const gpaData = GPACalculator.calculateSemesterGPA(results);
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(50); // Should complete in <50ms
      console.log(`GPACalculator: ${duration}ms for 1000 results`);
    });
  });
  
  describe("BulkWriter", () => {
    test("executeBulkWrites - 5000 operations", async () => {
      const bulkWriter = new BulkWriter();
      
      // Add 5000 student updates
      for (let i = 0; i < 5000; i++) {
        bulkWriter.addStudentUpdate(
          new mongoose.Types.ObjectId(),
          {
            set: { gpa: 3.5 },
            increment: { totalCarryovers: 0 }
          }
        );
      }
      
      const start = Date.now();
      const result = await bulkWriter.executeBulkWrites();
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(2000); // Should complete in <2s
      console.log(`BulkWriter: ${duration}ms for 5000 operations`);
    });
  });
});