export const createTestStudent = () => ({
  _id: '65a1b2c3d4e5f67890123456',
  firstName: 'John',
  lastName: 'Doe',
  email: 'john.doe@test.com',
  matricNumber: 'U2023/123456',
  level: 100,
  department: {
    _id: '65a1b2c3d4e5f67890123457',
    name: 'Computer Science',
    code: 'CSC'
  },
  currentSession: '2023/2024',
  currentSemester: 'first'
});

export const createTestFeeStructure = () => ({
  purpose: 'COURSE_REGISTRATION',
  department: '65a1b2c3d4e5f67890123457',
  level: 100,
  session: '2023/2024',
  amount: 5000,
  currency: 'NGN',
  isActive: true
});

export const createTestPayment = () => ({
  student: '65a1b2c3d4e5f67890123456',
  purpose: 'COURSE_REGISTRATION',
  session: '2023/2024',
  semester: 'first',
  expectedAmount: 5000,
  paidAmount: 0,
  provider: 'PAYSTACK',
  transactionRef: 'PAY-1234567890-ABC123',
  status: 'PENDING'
});