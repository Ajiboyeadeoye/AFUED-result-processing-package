// test/controllers/payment.controller.test.js
import { describe, test, expect, jest } from '@jest/globals';

// Mock PaymentService BEFORE importing controller
jest.mock('../../domain/payment/payment.service.js', () => ({
  getExpectedAmount: jest.fn(),
  createPayment: jest.fn(),
  verifyPayment: jest.fn(),
  getStudentPayments: jest.fn(),
  getPaymentByRef: jest.fn(),
  getAvailableProviders: jest.fn(),
  hasPaid: jest.fn(),
  cancelPayment: jest.fn(),
}));

// Import after mocking - CORRECT PATH
import { PaymentController } from '../../domain/payment/payment.controller.js';
import PaymentService from '../../domain/payment/payment.service.js';

// Also mock buildResponse if your controller uses it
jest.mock('../../utils/responseBuilder.js', () => ({
  success: jest.fn((res, message, data) => res.json({ success: true, message, data })),
  error: jest.fn((res, error, status = 400) => {
    res.status(status).json({ success: false, error });
  }),
}));

import buildResponse from '../../utils/responseBuilder.js';

describe('Payment Controller Tests', () => {
  let mockReq, mockRes;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    mockReq = {
      user: {
        _id: '65a1b2c3d4e5f67890123456',
        email: 'test@student.edu',
        firstName: 'John',
        lastName: 'Doe',
        level: 100,
        department: { _id: 'dept123', name: 'Computer Science' },
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
      redirect: jest.fn(),
    };
  });
  
  describe('getExpectedAmount', () => {
    test('should call service with correct parameters and return success', async () => {
      mockReq.query.purpose = 'COURSE_REGISTRATION';
      
      PaymentService.getExpectedAmount.mockResolvedValue({
        amount: 5000,
        currency: 'NGN',
        description: 'Course registration fee',
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
            currency: 'NGN',
          }),
        })
      );
    });
    
    test('should return error if purpose is missing', async () => {
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
    
    test('should handle service errors', async () => {
      mockReq.query.purpose = 'COURSE_REGISTRATION';
      
      PaymentService.getExpectedAmount.mockRejectedValue(
        new Error('No fee structure found')
      );
      
      await PaymentController.getExpectedAmount(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'No fee structure found',
        })
      );
    });
  });
  
  describe('initializePayment', () => {
    test('should create payment successfully', async () => {
      mockReq.body = {
        purpose: 'COURSE_REGISTRATION',
        provider: 'PAYSTACK',
      };
      
      const mockPayment = {
        _id: 'payment123',
        transactionRef: 'PAY-1234567890-ABC123',
        provider: 'PAYSTACK',
        expectedAmount: 5000,
      };
      
      const mockProviderResponse = {
        authorizationUrl: 'https://paystack.com/pay/test-ref',
        requiresRedirect: true,
      };
      
      PaymentService.createPayment.mockResolvedValue({
        payment: mockPayment,
        providerResponse: mockProviderResponse,
      });
      
      await PaymentController.initializePayment(mockReq, mockRes);
      
      expect(PaymentService.createPayment).toHaveBeenCalledWith({
        student: mockReq.user,
        purpose: 'COURSE_REGISTRATION',
        session: '2023/2024',
        semester: 'first',
        provider: 'PAYSTACK',
      });
      
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            paymentId: 'payment123',
            transactionRef: 'PAY-1234567890-ABC123',
            provider: 'PAYSTACK',
            expectedAmount: 5000,
            providerResponse: mockProviderResponse,
          }),
        })
      );
    });
    
    test('should return error if purpose is missing', async () => {
      mockReq.body = { provider: 'PAYSTACK' }; // Missing purpose
      
      await PaymentController.initializePayment(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Purpose is required',
        })
      );
    });
  });
  
  describe('getProviders', () => {
    test('should return available providers', async () => {
      const mockProviders = [
        { code: 'PAYSTACK', name: 'Paystack', isActive: true },
        { code: 'REMITA', name: 'Remita', isActive: true },
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
  });
  
  describe('getPaymentHistory', () => {
    test('should return student payment history', async () => {
      const mockPayments = [
        {
          _id: 'payment1',
          transactionRef: 'PAY-123',
          purpose: 'COURSE_REGISTRATION',
          status: 'SUCCESSFUL',
          expectedAmount: 5000,
          paidAmount: 5000,
          paidAt: new Date(),
        },
        {
          _id: 'payment2',
          transactionRef: 'PAY-456',
          purpose: 'EXAM_REGISTRATION',
          status: 'SUCCESSFUL',
          expectedAmount: 3000,
          paidAmount: 3000,
          paidAt: new Date(),
        },
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
    
    test('should apply filters from query parameters', async () => {
      mockReq.query = {
        purpose: 'COURSE_REGISTRATION',
        status: 'SUCCESSFUL',
        session: '2023/2024',
      };
      
      await PaymentController.getPaymentHistory(mockReq, mockRes);
      
      expect(PaymentService.getStudentPayments).toHaveBeenCalledWith(
        '65a1b2c3d4e5f67890123456',
        {
          purpose: 'COURSE_REGISTRATION',
          status: 'SUCCESSFUL',
          session: '2023/2024',
        }
      );
    });
  });
  
  describe('checkPaymentStatus', () => {
    test('should return payment status', async () => {
      mockReq.params.transactionRef = 'PAY-1234567890-ABC123';
      
      const mockPayment = {
        _id: 'payment123',
        transactionRef: 'PAY-1234567890-ABC123',
        purpose: 'COURSE_REGISTRATION',
        status: 'SUCCESSFUL',
        expectedAmount: 5000,
        paidAmount: 5000,
        paidAt: new Date(),
      };
      
      PaymentService.getPaymentByRef.mockResolvedValue(mockPayment);
      
      await PaymentController.checkPaymentStatus(mockReq, mockRes);
      
      expect(PaymentService.getPaymentByRef).toHaveBeenCalledWith(
        'PAY-1234567890-ABC123'
      );
      
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: mockPayment,
        })
      );
    });
    
    test('should return 404 if payment not found', async () => {
      mockReq.params.transactionRef = 'NON-EXISTENT-REF';
      
      PaymentService.getPaymentByRef.mockResolvedValue(null);
      
      await PaymentController.checkPaymentStatus(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Payment not found',
        })
      );
    });
  });
  
  describe('paymentCallback', () => {
    test('should verify payment and redirect to success', async () => {
      mockReq.query.reference = 'PAY-1234567890-ABC123';
      
      const mockPayment = {
        transactionRef: 'PAY-1234567890-ABC123',
        status: 'SUCCESSFUL',
      };
      
      PaymentService.verifyPayment.mockResolvedValue(mockPayment);
      
      await PaymentController.paymentCallback(mockReq, mockRes);
      
      expect(PaymentService.verifyPayment).toHaveBeenCalledWith(
        'PAY-1234567890-ABC123'
      );
      
      expect(mockRes.redirect).toHaveBeenCalledWith(
        '/dashboard/payment/success?reference=PAY-1234567890-ABC123'
      );
    });
    
    test('should redirect to failed if payment failed', async () => {
      mockReq.query.reference = 'PAY-1234567890-ABC123';
      
      const mockPayment = {
        transactionRef: 'PAY-1234567890-ABC123',
        status: 'FAILED',
      };
      
      PaymentService.verifyPayment.mockResolvedValue(mockPayment);
      
      await PaymentController.paymentCallback(mockReq, mockRes);
      
      expect(mockRes.redirect).toHaveBeenCalledWith(
        '/dashboard/payment/failed?reference=PAY-1234567890-ABC123'
      );
    });
    
    test('should redirect to error if verification fails', async () => {
      mockReq.query.reference = 'PAY-1234567890-ABC123';
      
      PaymentService.verifyPayment.mockRejectedValue(
        new Error('Verification failed')
      );
      
      await PaymentController.paymentCallback(mockReq, mockRes);
      
      expect(mockRes.redirect).toHaveBeenCalledWith(
        expect.stringContaining('/dashboard/payment/error?message=')
      );
    });
  });
});