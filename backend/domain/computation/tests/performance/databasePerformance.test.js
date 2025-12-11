// test/performance/databasePerformance.test.js
import mongoose from "mongoose";

describe("Database Performance Tests", () => {
  test("MongoDB query performance", async () => {
    const queryTimes = [];
    
    // Test different query patterns
    const queries = [
      {
        name: "Find students by department",
        query: async () => {
          await studentModel.find({ departmentId: testDepartmentId }).limit(1000).lean();
        }
      },
      {
        name: "Aggregate results",
        query: async () => {
          await Result.aggregate([
            { $match: { departmentId: testDepartmentId } },
            { $group: { _id: "$studentId", count: { $sum: 1 } } }
          ]);
        }
      },
      {
        name: "Bulk write 1000 students",
        query: async () => {
          const updates = Array.from({ length: 1000 }, (_, i) => ({
            updateOne: {
              filter: { _id: new mongoose.Types.ObjectId() },
              update: { $set: { gpa: 3.5 } }
            }
          }));
          await studentModel.bulkWrite(updates, { ordered: false });
        }
      }
    ];
    
    for (const { name, query } of queries) {
      const start = Date.now();
      await query();
      const duration = Date.now() - start;
      queryTimes.push({ query: name, time: duration + 'ms' });
    }
    
    console.table(queryTimes);
    
    // Assert queries complete within reasonable time
    expect(queryTimes[0].time).toBeLessThan(100); // Find should be <100ms
    expect(queryTimes[1].time).toBeLessThan(500); // Aggregate should be <500ms
    expect(queryTimes[2].time).toBeLessThan(1000); // Bulk write should be <1s
  });
});