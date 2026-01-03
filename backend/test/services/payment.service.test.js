import PaymentService from '../../domain/payment/payment.service.js';
import Payment from '../../domain/payment/payment.model.js';
import PaymentFee from '../../domain/payment/payment-fee.model.js';
import { createTestStudent, createTestFeeStructure } from '../helpers/testData.js';

// Mock Paystack provider
jest.mock('../../domain/payment/providers/paystack.provider.js', () => {
  return jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue({
      authorizationUrl: 'https://paystack.com/pay/test',
      reference: 'test-ref-123',
      providerPaymentId: 'paystack-ref-123'
    }),
    verify: jest.fn().mockResolvedValue({
      status: 'SUCCESSFUL',
      amount: 5000
    })
  }));
});

describe('Payment Service', () => {
  beforeEach(async () => {
    // Create test fee structure
    await PaymentFee.create(createTestFeeStructure());
  });

  it('should get expected amount for student', async () => {
    const student = createTestStudent();
    const result = await PaymentService.getExpectedAmount({
      student,
      purpose: 'COURSE_REGISTRATION',
      session: '2023/2024'
    });
    
    expect(result.amount).toBe(5000);
    expect(result.currency).toBe('NGN');
  });

  it('should throw error for non-existent fee structure', async () => {
    const student = createTestStudent();
    student.level = 200; // No fee structure for level 200
    
    await expect(
      PaymentService.getExpectedAmount({
        student,
        purpose: 'COURSE_REGISTRATION',
        session: '2023/2024'
      })
    ).rejects.toThrow('No fee structure found');
  });

  it('should create payment successfully', async () => {
    const student = createTestStudent();
    
    const result = await PaymentService.createPayment({
      student,
      purpose: 'COURSE_REGISTRATION',
      session: '2023/2024',
      semester: 'first',
      provider: 'PAYSTACK'
    });
    
    expect(result.payment).toBeDefined();
    expect(result.providerResponse.authorizationUrl).toBeDefined();
    expect(result.payment.status).toBe('PENDING');
  });
});