// test/domain/payment/payment.service.simple.test.js
import { describe, test, expect, beforeEach } from '@jest/globals';
import mongoose from 'mongoose';
import PaymentService from '../../../domain/payment/payment.service.js';
import Payment from '../../../domain/payment/payment.model.js';
import PaymentFee from '../../../domain/payment/payment-fee.model.js';

describe('Payment Service - Simple Tests (No Mocks)', () => {
  let departmentId;
  let studentData;
  
  beforeEach(async () => {
    // Clear all data
    await Payment.deleteMany({});
    await PaymentFee.deleteMany({});
    
    // Create test data
    departmentId = new mongoose.Types.ObjectId();
    
    studentData = {
      _id: new mongoose.Types.ObjectId(),
      email: 'student.test@university.edu',
      firstName: 'John',
      lastName: 'Doe',
      level: 100,
      department: { _id: departmentId },
    };
  });
  
  test('should get available providers', () => {
    const providers = PaymentService.getAvailableProviders();
    
    console.log('Providers:', providers);
    
    expect(Array.isArray(providers)).toBe(true);
    expect(providers.length).toBeGreaterThan(0);
  });
  
  test('should have required methods', () => {
    // Check that all expected methods exist
    expect(typeof PaymentService.getExpectedAmount).toBe('function');
    expect(typeof PaymentService.createPayment).toBe('function');
    expect(typeof PaymentService.verifyPayment).toBe('function');
    expect(typeof PaymentService.hasPaid).toBe('function');
    expect(typeof PaymentService.getStudentPayments).toBe('function');
  });
  
  test('should get expected amount from fee structure', async () => {
    // Create fee structure
    await PaymentFee.create({
      purpose: 'COURSE_REGISTRATION',
      department: departmentId,
      level: 100,
      session: '2023/2024',
      amount: 5000,
      currency: 'NGN',
      isActive: true,
    });
    
    const result = await PaymentService.getExpectedAmount({
      student: studentData,
      purpose: 'COURSE_REGISTRATION',
      session: '2023/2024',
    });
    
    expect(result.amount).toBe(5000);
    expect(result.currency).toBe('NGN');
  });
  
  test('should check if student has paid', async () => {
    // Create a successful payment
    await Payment.create({
      student: studentData._id,
      purpose: 'COURSE_REGISTRATION',
      session: '2023/2024',
      semester: 'first',
      expectedAmount: 5000,
      paidAmount: 5000,
      provider: 'PAYSTACK',
      transactionRef: 'TEST-REF-123',
      studentLevel: 100,
      studentDepartment: departmentId,
      status: 'SUCCESSFUL',
    });
    
    const hasPaid = await PaymentService.hasPaid({
      studentId: studentData._id,
      purpose: 'COURSE_REGISTRATION',
      session: '2023/2024',
      semester: 'first',
    });
    
    expect(hasPaid).toBe(true);
  });
});
