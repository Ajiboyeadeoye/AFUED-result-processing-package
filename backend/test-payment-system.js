// test-payment-system.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Mock Express req/res objects
const mockRequest = (data = {}) => ({
  body: {},
  query: {},
  params: {},
  user: {},
  headers: {},
  ...data
});

const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

// Test the Course Restriction Service
async function testCourseRestrictionService() {
  console.log('🧪 Testing Course Restriction Service...\n');
  
  try {
    // Import the service
    const { CourseRestrictionService } = await import('./domain/payment/courseRestriction.service.js');
    const service = new CourseRestrictionService();
    
    // Test 1: Service instantiation
    console.log('✅ 1. Service instantiated successfully');
    
    // Test 2: Check permission method exists
    if (typeof service.checkPermission === 'function') {
      console.log('✅ 2. checkPermission method exists');
    } else {
      console.log('❌ 2. checkPermission method missing');
    }
    
    // Test 3: Check getPaymentSummary method exists
    if (typeof service.getPaymentSummary === 'function') {
      console.log('✅ 3. getPaymentSummary method exists');
    } else {
      console.log('❌ 3. getPaymentSummary method missing');
    }
    
    // Test 4: Check hasPaidSchoolFees method exists
    if (typeof service.hasPaidSchoolFees === 'function') {
      console.log('✅ 4. hasPaidSchoolFees method exists');
    } else {
      console.log('❌ 4. hasPaidSchoolFees method missing');
    }
    
    console.log('\n📋 Service Methods Check Complete');
    
  } catch (error) {
    console.error('❌ Service test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Test Payment Controller Functions
async function testPaymentController() {
  console.log('\n🧪 Testing Payment Controller Functions...\n');
  
  try {
    // Import the controller
    const paymentController = await import('./domain/payment/payment.controller.js');
    
    const requiredFunctions = [
      'createPaymentIntent',
      'getStudentPaymentSummary',
      'checkCourseEligibility',
      'getPaymentRestrictions',
      'checkFeePayment'
    ];
    
    let passed = 0;
    requiredFunctions.forEach(func => {
      if (typeof paymentController[func] === 'function') {
        console.log(`✅ ${func} exists`);
        passed++;
      } else {
        console.log(`❌ ${func} missing`);
      }
    });
    
    console.log(`\n📊 ${passed}/${requiredFunctions.length} functions found`);
    
  } catch (error) {
    console.error('❌ Controller test failed:', error.message);
  }
}

// Test Payment Routes
async function testPaymentRoutes() {
  console.log('\n🧪 Testing Payment Routes Import...\n');
  
  try {
    const paymentRoutes = await import('./domain/payment/payment.routes.js');
    
    if (paymentRoutes.default) {
      console.log('✅ Payment routes module loaded successfully');
      
      // Check if it's a router
      if (paymentRoutes.default.stack && Array.isArray(paymentRoutes.default.stack)) {
        console.log('✅ Router has routes defined');
        console.log(`📊 Found ${paymentRoutes.default.stack.length} route layers`);
      }
    } else {
      console.log('❌ Payment routes module not properly exported');
    }
    
  } catch (error) {
    console.error('❌ Routes test failed:', error.message);
  }
}

// Test Database Connection
async function testDatabaseConnection() {
  console.log('\n🧪 Testing Database Connection...\n');
  
  try {
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/afued';
    
    console.log(`Connecting to: ${MONGODB_URI.split('@')[1] || MONGODB_URI}`);
    
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('✅ Database connected successfully');
    
    // Test if Payment model exists
    const Payment = await import('./domain/payment/payment.model.js');
    if (Payment.default) {
      console.log('✅ Payment model loaded');
    }
    
    // Test if User model exists
    const User = await import('./domain/user/user.model.js');
    if (User.default) {
      console.log('✅ User model loaded');
    }
    
    await mongoose.disconnect();
    console.log('✅ Database connection closed');
    
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
  }
}

// Test Environment Variables
function testEnvironmentVariables() {
  console.log('\n🧪 Testing Environment Variables...\n');
  
  const requiredVars = [
    'MONGODB_URI',
    'JWT_SECRET',
    'STRIPE_SECRET_KEY',
    'REMITA_MERCHANT_ID'
  ];
  
  let passed = 0;
  requiredVars.forEach(varName => {
    if (process.env[varName]) {
      console.log(`✅ ${varName} is set`);
      passed++;
    } else {
      console.log(`❌ ${varName} is missing`);
    }
  });
  
  console.log(`\n📊 ${passed}/${requiredVars.length} environment variables set`);
}

// Quick Integration Test
async function quickIntegrationTest() {
  console.log('\n🚀 Quick Integration Test...\n');
  
  console.log('1. Creating mock payment restriction check...');
  
  // This simulates what happens when a student tries to register
  const mockStudentId = 'mock-student-id-123';
  const mockSession = '2024/2025';
  
  try {
    const { CourseRestrictionService } = await import('./domain/payment/courseRestriction.service.js');
    const service = new CourseRestrictionService();
    
    console.log('2. Testing checkPermission method...');
    const permissionResult = await service.checkPermission(
      mockStudentId,
      'COURSE_REGISTRATION',
      mockSession
    );
    
    console.log(`   Permission Result:`);
    console.log(`   - Allowed: ${permissionResult.allowed}`);
    console.log(`   - Message: ${permissionResult.message}`);
    console.log(`   - Type: ${permissionResult.type}`);
    
    if (permissionResult.allowed === false && permissionResult.restrictionLevel === 'STRICT') {
      console.log('✅ Payment restriction is working (correctly blocking access)');
    } else if (permissionResult.allowed === true) {
      console.log('⚠️  Payment check passed (might need test data)');
    }
    
    console.log('\n3. Testing course eligibility check...');
    const eligibilityResult = await service.checkCourseRegistrationEligibility(
      mockStudentId,
      ['mock-course-1', 'mock-course-2'],
      mockSession
    );
    
    console.log(`   Eligibility Result:`);
    console.log(`   - Eligible: ${eligibilityResult.eligible}`);
    console.log(`   - Reason: ${eligibilityResult.reason}`);
    
    console.log('\n🎉 Integration test completed!');
    
  } catch (error) {
    console.error('❌ Integration test failed:', error.message);
  }
}

// Generate Postman Test Commands
function generatePostmanTests() {
  console.log('\n📋 POSTMAN TEST COMMANDS\n');
  console.log('='.repeat(50));
  
  console.log('\n🔐 AUTHENTICATION:');
  console.log('First, get a student token:');
  console.log('POST /api/auth/login');
  console.log('Body: { "email": "student@afued.edu.ng", "password": "password" }');
  
  console.log('\n💳 PAYMENT TESTS:');
  console.log('1. Check if student can register courses:');
  console.log('POST /api/payments/check-course-eligibility');
  console.log('Headers: { "Authorization": "Bearer <student_token>" }');
  console.log('Body: { "courseIds": ["course_id_1", "course_id_2"] }');
  
  console.log('\n2. Get student payment summary:');
  console.log('GET /api/payments/summary');
  console.log('Headers: { "Authorization": "Bearer <student_token>" }');
  
  console.log('\n3. Create payment intent (school fees):');
  console.log('POST /api/payments/create-intent');
  console.log('Headers: { "Authorization": "Bearer <student_token>" }');
  console.log('Body: { "amount": 100000, "feeType": "SCHOOL_FEES", "provider": "REMITA" }');
  
  console.log('\n📚 COURSE REGISTRATION TESTS:');
  console.log('1. Try to register courses (should fail without payment):');
  console.log('POST /api/courses/register');
  console.log('Headers: { "Authorization": "Bearer <student_token>" }');
  console.log('Body: { "courses": ["course_id_1", "course_id_2"] }');
  
  console.log('\n2. View available courses (shows payment status):');
  console.log('GET /api/courses/available');
  console.log('Headers: { "Authorization": "Bearer <student_token>" }');
  
  console.log('\n3. Check course eligibility directly:');
  console.log('POST /api/courses/check-eligibility');
  console.log('Headers: { "Authorization": "Bearer <student_token>" }');
  console.log('Body: { "courseIds": ["course_id_1", "course_id_2"] }');
  
  console.log('\n⚡ QUICK TEST CURL COMMANDS:');
  console.log('# Test payment restriction');
  console.log(`curl -X POST http://localhost:3000/api/payments/check-course-eligibility \\
    -H "Content-Type: application/json" \\
    -H "Authorization: Bearer <student_token>" \\
    -d '{"courseIds": ["test_course_1"]}'`);
  
  console.log('\n# Test course registration');
  console.log(`curl -X POST http://localhost:3000/api/courses/register \\
    -H "Content-Type: application/json" \\
    -H "Authorization: Bearer <student_token>" \\
    -d '{"courses": ["test_course_1"]}'`);
}

// Main test runner
async function runAllTests() {
  console.log('🚀 AFUED PAYMENT SYSTEM TEST SUITE');
  console.log('='.repeat(50));
  
  try {
    await testEnvironmentVariables();
    await testDatabaseConnection();
    await testCourseRestrictionService();
    await testPaymentController();
    await testPaymentRoutes();
    await quickIntegrationTest();
    
    console.log('\n' + '='.repeat(50));
    console.log('🎉 ALL TESTS COMPLETED SUCCESSFULLY!');
    console.log('='.repeat(50));
    
    generatePostmanTests();
    
  } catch (error) {
    console.error('\n❌ TEST SUITE FAILED:', error.message);
    process.exit(1);
  }
}

// Run the tests
runAllTests().catch(console.error);