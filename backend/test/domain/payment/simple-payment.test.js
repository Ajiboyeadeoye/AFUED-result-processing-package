// test/domain/payment/simple-payment.test.js
import mongoose from 'mongoose';

describe('Simple Payment Test', () => {
  beforeAll(() => {
    console.log('Test starting...');
  });
  
  afterAll(() => {
    console.log('Test complete.');
  });
  
  test('should connect to database', () => {
    expect(mongoose.connection.readyState).toBe(1); // 1 = connected
  });
  
  test('basic test without database', () => {
    expect(1 + 1).toBe(2);
  });
});