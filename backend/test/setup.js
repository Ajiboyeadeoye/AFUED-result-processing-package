// test/setup.js
import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongoServer;

// Global setup before all tests
beforeAll(async () => {
  // Increase timeout for setup
  jest.setTimeout(30000);
  
  // Create in-memory MongoDB
  mongoServer = await MongoMemoryServer.create({
    instance: {
      dbName: 'payment_test_db',
    }
  });
  
  const mongoUri = mongoServer.getUri();
  
  // Connect mongoose with proper options
  await mongoose.connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  
  console.log('✅ Test MongoDB connected');
}, 30000);

// Clean up after all tests
afterAll(async () => {
  try {
    // Disconnect mongoose
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    
    // Stop MongoDB server
    if (mongoServer) {
      await mongoServer.stop();
    }
    
    console.log('✅ Test MongoDB disconnected');
  } catch (error) {
    console.error('Error cleaning up:', error);
  }
}, 30000);

// Clear all collections before each test
beforeEach(async () => {
  try {
    const collections = mongoose.connection.collections;
    
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
  } catch (error) {
    console.error('Error clearing collections:', error);
  }
});