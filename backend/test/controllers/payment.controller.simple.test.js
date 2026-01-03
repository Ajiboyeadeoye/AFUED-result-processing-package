// test/controllers/payment.controller.simple.test.js
import { describe, test, expect, jest } from '@jest/globals';
import { PaymentController } from '../../../controllers/payment.controller.js';

// Mock PaymentService
jest.mock('../../../domain/payment/payment.service.js', () => ({
  getExpectedAmount: jest.fn(),
  createPayment: jest.fn(),
  verifyPayment: jest.fn(),
  getStudentPayments: jest.fn(),
  getPaymentByRef: jest.fn(),
  getAvailableProviders: jest.fn(),
  hasPaid: jest.fn(),
}));

import PaymentService from '../../../domain/payment/payment.service.js';

describe('Payment Controller - Unit Tests', () => {
  let mockReq, mockRes;
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create mock request and response
    mockReq = {
      user: {
        _id: '65a1b2c3d4e5f67890123456',
        email: 'test@student.edu',
        level: 100,
        department: { _id: 'dept123' },
        currentSession: '2023/2024',
        currentSemester: 'first',
      },
      query: {},
      body: {},
      params: {},
    };
    
    mockRes = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    };
  });
  
  test('getExpectedAmount should call service with correct parameters', async () => {
    mockReq.query.purpose = 'COURSE_REGISTRATION';
    
    PaymentService.getExpectedAmount.mockResolvedValue({
      amount: 5000,
      currency: 'NGN',
    });
    
    await PaymentController.getExpectedAmount(mockReq, mockRes);
    
    expect(PaymentService.getExpectedAmount).toHaveBeenCalledWith({
      student: mockReq.user,
      purpose: 'COURSE_REGISTRATION',
      session: '2023/2024',
    });
    
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          amount: 5000,
        }),
      })
    );
  });
  
  test('getExpectedAmount should return error if purpose missing', async () => {
    mockReq.query = {}; // No purpose
    
    await PaymentController.getExpectedAmount(mockReq, mockRes);
    
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Purpose is required',
      })
    );
  });
  
  test('getProviders should return available providers', async () => {
    const mockProviders = [
      { code: 'PAYSTACK', name: 'Paystack' },
      { code: 'REMITA', name: 'Remita' },
    ];
    
    PaymentService.getAvailableProviders.mockReturnValue(mockProviders);
    
    await PaymentController.getProviders(mockReq, mockRes);
    
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: mockProviders,
      })
    );
  });
  
  test('getPaymentHistory should call service with student ID', async () => {
    const mockPayments = [
      { transactionRef: 'PAY-123', purpose: 'COURSE_REGISTRATION' },
    ];
    
    PaymentService.getStudentPayments.mockResolvedValue(mockPayments);
    
    await PaymentController.getPaymentHistory(mockReq, mockRes);
    
    expect(PaymentService.getStudentPayments).toHaveBeenCalledWith(
      '65a1b2c3d4e5f67890123456',
      {}
    );
    
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: mockPayments,
      })
    );
  });
  
  test('getPaymentHistory should apply filters from query', async () => {
    mockReq.query.purpose = 'COURSE_REGISTRATION';
    mockReq.query.status = 'SUCCESSFUL';
    
    await PaymentController.getPaymentHistory(mockReq, mockRes);
    
    expect(PaymentService.getStudentPayments).toHaveBeenCalledWith(
      '65a1b2c3d4e5f67890123456',
      { purpose: 'COURSE_REGISTRATION', status: 'SUCCESSFUL' }
    );
  });
});