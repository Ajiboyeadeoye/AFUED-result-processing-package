// test/performance/memoryPerformance.test.js
import { processStudentBatch } from "../../computation/workers/computation.controller.js";

describe("Memory Performance Tests", () => {
  beforeEach(() => {
    if (global.gc) {
      global.gc(); // Force garbage collection if available (Node.js --expose-gc)
    }
  });
  
  test("Memory usage per 1000 students", async () => {
    const memoryUsage = [];
    
    for (let batchSize of [100, 500, 1000]) {
      const startMemory = process.memoryUsage().heapUsed;
      
      // Simulate processing batch
      await simulateStudentBatchProcessing(batchSize);
      
      const endMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = endMemory - startMemory;
      
      memoryUsage.push({
        batchSize,
        memoryMB: (memoryIncrease / 1024 / 1024).toFixed(2),
        perStudent: (memoryIncrease / batchSize / 1024).toFixed(2) + "KB"
      });
    }
    
    console.table(memoryUsage);
    
    // Assert memory grows linearly or sub-linearly
    const growthRate = memoryUsage[2].memoryMB / memoryUsage[0].memoryMB;
    expect(growthRate).toBeLessThan(15); // 10x students should use <15x memory
  });
  
  async function simulateStudentBatchProcessing(batchSize) {
    // Create mock data for batch processing
    const mockStudents = Array.from({ length: batchSize }, (_, i) => ({
      _id: `student${i}`,
      matricNumber: `TEST${i}`,
      name: `Student ${i}`,
      level: 200,
      probationStatus: "none",
      terminationStatus: "none",
      totalCarryovers: 0,
      cgpa: 3.0
    }));
    
    // Process as controller would
    // ...simulation code...
  }
});