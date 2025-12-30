AFUED Payment System with Course Restrictions
📋 Quick Overview
Payment processing system with integrated course access restrictions for Adeyemi Federal University of Education.

🚀 Key Features
Multi-provider support: Stripe & Remita

Course restrictions: Block course registration without school fees

Reusable middleware: Easy payment requirement checks

Financial verification: School financial system integration

📁 Project Structure
text
backend/domain/payment/
├── payment.controller.js      # Main payment logic
├── payment.model.js          # Payment schema
├── courseRestriction.service.js  # Payment requirement checks
├── remita.service.js         # Remita integration
└── payment.routes.js         # Payment API endpoints
🔧 Installation
bash
cd backend
npm install
cp .env.example .env
# Add your Stripe, Remita, and DB credentials to .env
npm run dev
🛠️ Quick Setup
1. Add Course Restriction Service
Create domain/payment/courseRestriction.service.js with the provided code.

2. Update Course Controller
Add the payment check section at the start of your registerCourses function.

3. Add Payment Restriction Middleware
Create middlewares/paymentRestriction.js with the provided middleware functions.

4. Update Course Routes
Apply requireSchoolFeesForCourses() middleware to course registration routes.

🔒 How It Works
For Course Registration:
javascript
// Routes automatically check payment
router.post("/register", 
  authenticate("student"),
  requireSchoolFeesForCourses(),  // ← Blocks if no school fees
  registerCourses
);
Manual Checks:
javascript
import { CourseRestrictionService } from './courseRestriction.service.js';

const restrictionService = new CourseRestrictionService();
const canRegister = await restrictionService.checkPermission(
  studentId, 
  'COURSE_REGISTRATION'
);
📚 API Endpoints
Payment Operations
POST /api/payments/create-intent - Create payment (Stripe/Remita)

POST /api/payments/check-course-eligibility - Check if student can register courses

GET /api/payments/summary - Get student payment status

Course Registration with Restrictions
POST /api/courses/register - Register courses (requires school fees)

GET /api/courses/available - View available courses (shows payment status)

💡 Example Usage
Frontend Flow:
Student tries to register courses

System checks: "Has school fees been paid?"

If NO → Returns 403 error with payment instructions

If YES → Allows course registration

Admin View:
Finance staff can verify payments and generate reports through the payment portal.

🧪 Testing
bash
npm test
# Test payment restrictions
curl -X POST http://localhost:3000/api/payments/check-course-eligibility \
  -H "Authorization: Bearer <student_token>" \
  -d '{"courseIds": ["course1", "course2"]}'
⚙️ Environment Variables
env
STRIPE_SECRET_KEY=sk_test_...
REMITA_MERCHANT_ID=27768931
MONGODB_URI=mongodb://localhost:27017/afued
🚨 Important Notes
School fees payment is required for course registration

Payment status is automatically checked via middleware

Students see clear error messages if payment is missing

Finance department can verify all payments