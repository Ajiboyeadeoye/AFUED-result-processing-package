// test/domain/payment/payment.service.test.js
import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import mongoose from 'mongoose';
import PaymentService from '../../../domain/payment/payment.service.js';
import Payment from '../../../domain/payment/payment.model.js';
import PaymentFee from '../../../domain/payment/payment-fee.model.js';

// Mock the payment providers to avoid actual API calls
jest.mock('../../../domain/payment/providers/paystack.provider.js', () => {
  return jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue({
      authorizationUrl: 'https://paystack.com/pay/test-ref-123',
      reference: 'test-ref-123',
      providerPaymentId: 'paystack-ref-123',
      requiresRedirect: true,
    }),
    verify: jest.fn().mockResolvedValue({
      status: 'SUCCESSFUL',
      amount: 5000,
      paidAt: new Date(),
    }),
  }));
});

jest.mock('../../../domain/payment/providers/remita.provider.js', () => {
  return jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue({
      authorizationUrl: 'https://remita.net/pay/remita-ref-456',
      reference: 'remita-ref-456',
      providerPaymentId: 'remita-ref-456',
      requiresRedirect: true,
    }),
    verify: jest.fn().mockResolvedValue({
      status: 'SUCCESSFUL',
      amount: 5000,
      paidAt: new Date(),
    }),
  }));
});

describe('Payment Service Tests', () => {
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
      matricNumber: 'U2023/123456',
      level: 100,
      department: { _id: departmentId, name: 'Computer Science' },
      currentSession: '2023/2024',
      currentSemester: 'first',
    };
  });
  
  // Test the basic methods first
  describe('Basic Methods', () => {
    test('should get available providers', () => {
      const providers = PaymentService.getAvailableProviders();
      
      expect(Array.isArray(providers)).toBe(true);
      expect(providers.length).toBeGreaterThan(0);
      
      // Check that providers have required properties
      providers.forEach(provider => {
        expect(provider).toHaveProperty('code');
        expect(provider).toHaveProperty('name');
      });
    });
  });
  
  describe('getExpectedAmount', () => {
    test('should return correct amount for student level and department', async () => {
      // Create fee structure
      await PaymentFee.create({
        purpose: 'COURSE_REGISTRATION',
        department: departmentId,
        level: 100,
        session: '2023/2024',
        amount: 5000,
        currency: 'NGN',
        description: 'Course registration fee for Level 100',
        isActive: true,
      });
      
      const result = await PaymentService.getExpectedAmount({
        student: studentData,
        purpose: 'COURSE_REGISTRATION',
        session: '2023/2024',
      });
      
      expect(result.amount).toBe(5000);
      expect(result.currency).toBe('NGN');
      expect(result.feeStructure).toBeDefined();
    });
    
    test('should throw error if no fee structure found', async () => {
      await expect(
        PaymentService.getExpectedAmount({
          student: studentData,
          purpose: 'COURSE_REGISTRATION',
          session: '2023/2024',
        })
      ).rejects.toThrow('No fee structure found');
    });
  });
  
  describe('createPayment', () => {
    beforeEach(async () => {
      // Create fee structure
      await PaymentFee.create({
        purpose: 'COURSE_REGISTRATION',
        department: departmentId,
        level: 100,
        session: '2023/2024',
        amount: 5000,
        isActive: true,
      });
    });
    
    test('should create payment successfully with Paystack', async () => {
      const result = await PaymentService.createPayment({
        student: studentData,
        purpose: 'COURSE_REGISTRATION',
        session: '2023/2024',
        semester: 'first',
        provider: 'PAYSTACK',
      });
      
      expect(result.payment).toBeDefined();
      expect(result.payment.student.toString()).toBe(studentData._id.toString());
      expect(result.payment.purpose).toBe('COURSE_REGISTRATION');
      expect(result.payment.expectedAmount).toBe(5000);
      expect(result.payment.status).toBe('PENDING');
      expect(result.payment.provider).toBe('PAYSTACK');
      expect(result.payment.transactionRef).toBeDefined();
      expect(result.providerResponse.authorizationUrl).toBe('https://paystack.com/pay/test-ref-123');
    });
  });
  
  describe('hasPaid', () => {
    test('should return true if student has successful payment', async () => {
      // Create successful payment
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
    
    test('should return false if no successful payment', async () => {
      const hasPaid = await PaymentService.hasPaid({
        studentId: studentData._id,
        purpose: 'COURSE_REGISTRATION',
        session: '2023/2024',
        semester: 'first',
      });
      
      expect(hasPaid).toBe(false);
    });
  });
  
  describe('getStudentPayments', () => {
    test('should return all payments for student', async () => {
      // Create payments
      await Payment.create([
        {
          student: studentData._id,
          purpose: 'COURSE_REGISTRATION',
          session: '2023/2024',
          semester: 'first',
          expectedAmount: 5000,
          paidAmount: 5000,
          provider: 'PAYSTACK',
          transactionRef: 'REF-1',
          studentLevel: 100,
          studentDepartment: departmentId,
          status: 'SUCCESSFUL',
        },
        {
          student: studentData._id,
          purpose: 'EXAM_REGISTRATION',
          session: '2023/2024',
          semester: 'first',
          expectedAmount: 3000,
          paidAmount: 3000,
          provider: 'REMITA',
          transactionRef: 'REF-2',
          studentLevel: 100,
          studentDepartment: departmentId,
          status: 'SUCCESSFUL',
        },
      ]);
      
      const payments = await PaymentService.getStudentPayments(studentData._id);
      
      expect(Array.isArray(payments)).toBe(true);
      expect(payments.length).toBe(2);
    });
  });
});