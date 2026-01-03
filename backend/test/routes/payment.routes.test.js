import request from 'supertest';
import app from '../../app.js'; // Your Express app
import Payment from '../../domain/payment/payment.model.js';
import PaymentFee from '../../domain/payment/payment-fee.model.js';
import User from '../../domain/user/user.model.js';
import { createTestStudent, createTestFeeStructure } from '../helpers/testData.js';

let authToken;
let testStudent;

beforeAll(async () => {
  // Create test user and get token
  testStudent = createTestStudent();
  const user = await User.create({
    ...testStudent,
    password: 'password123',
    role: 'student'
  });
  
  // Login to get token (simplified)
  authToken = 'mock-jwt-token';
});

describe('Payment API Endpoints', () => {
  beforeEach(async () => {
    await PaymentFee.create(createTestFeeStructure());
  });

  describe('GET /api/payments/expected-amount', () => {
    it('should return expected amount', async () => {
      const response = await request(app)
        .get('/api/payments/expected-amount?purpose=COURSE_REGISTRATION')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.amount).toBe(5000);
    });

    it('should require purpose parameter', async () => {
      const response = await request(app)
        .get('/api/payments/expected-amount')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/payments/initialize', () => {
    it('should initialize payment', async () => {
      const response = await request(app)
        .post('/api/payments/initialize')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          purpose: 'COURSE_REGISTRATION',
          provider: 'PAYSTACK'
        });
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.transactionRef).toBeDefined();
      expect(response.body.data.providerResponse.authorizationUrl).toBeDefined();
    });

    it('should prevent duplicate successful payments', async () => {
      // Create a successful payment first
      await Payment.create({
        ...createTestPayment(),
        status: 'SUCCESSFUL'
      });
      
      const response = await request(app)
        .post('/api/payments/initialize')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          purpose: 'COURSE_REGISTRATION',
          provider: 'PAYSTACK'
        });
      
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });
});