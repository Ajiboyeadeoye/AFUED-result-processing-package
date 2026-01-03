// test/domain/payment/simple-payment.test.js
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import mongoose from 'mongoose';

describe('Simple Payment Test', () => {
  beforeAll(() => {
    console.log('Test starting...');
  });
  
  afterAll(() => {
    console.log('Test complete.');
  });
  
  test('should connect to database', () => {
    // 1 = connected, 2 = connecting, 0 = disconnected
    const isConnected = mongoose.connection.readyState === 1;
    expect(isConnected).toBe(true);
  });
  
  test('basic test without database', () => {
    expect(1 + 1).toBe(2);
  });
});