🎓 Post-JAMB Payment Module (Node.js + Express + Paystack)

This module provides a production-ready payment system for Post-UTME (Post-JAMB) application fees within the AFUED result processing package.

It integrates Paystack for secure online payments and aligns with the project’s existing architecture — using:

✅ authenticate middleware for access control

✅ auditLogger for request logging

✅ buildResponse for uniform API responses

✅ mongoose models for persistence

📁 Folder Structure
/modules/payment/
│
├── payment.model.js              # Payment records (applicant & student)
├── paymentSetting.model.js       # Admin-defined Post-JAMB fee config
├── payment.controller.js         # Payment logic & Paystack integration
└── payment.routes.js             # Express routes for admin & applicant

⚙️ Setup
1️⃣ Install Dependencies

Make sure these packages exist in your project:

npm install axios mongoose express dotenv


If you already use them globally, you can skip this step.

2️⃣ Environment Variables

Add the following keys to your .env file:

PAYSTACK_SECRET_KEY=sk_test_your_secret_key_here
APP_URL=https://yourdomain.com

Variable	Description
PAYSTACK_SECRET_KEY	Your Paystack secret key from dashboard.paystack.com

APP_URL	Your base domain or local dev URL (e.g., http://localhost:4000)
🧱 Mongoose Models
1️⃣ PaymentSetting

Defines and stores the current Post-UTME/Post-JAMB fee configured by an admin.

Field	Type	Description
type	String	"postjamb"
amount	Number	Fee amount (₦)
updatedBy	ObjectId	Admin user ID who made the change
updatedAt	Date	Last update timestamp
2️⃣ Payment

Represents a single applicant or student payment record.

Field	Type	Description
payer	ObjectId	Linked to User (applicant or student)
type	String	"postjamb", "acceptance", "school_fees", etc.
amount	Number	Fee paid (₦)
status	Enum	"pending", "successful", "failed"
reference	String	Unique Paystack transaction reference
paidAt	Date	When payment was confirmed
🔌 Integration

In your main Express app (app.js or server.js):

import paymentRoutes from "./modules/payment/payment.routes.js";
app.use("/api/payment", paymentRoutes);


💡 Ensure you have the middlewares authenticate, auditLogger, and your MongoDB connection configured globally.

🧭 API Endpoints
Endpoint	Method	Access	Description
/api/payment/postjamb/fee	PATCH	Admin	Create or update Post-JAMB fee
/api/payment/postjamb/initiate	POST	Applicant	Initialize Paystack payment
/api/payment/verify	GET	Public	Verify payment after transaction
/api/payment/webhook/paystack	POST	System	Handle Paystack webhook events (optional)
💰 Payment Flow
1️⃣ Admin sets Post-JAMB fee
PATCH /api/payment/postjamb/fee
Headers: Authorization: Bearer <admin_token>
Body: { "amount": 2500 }


✅ Response:

{
  "status": "success",
  "message": "Post-JAMB fee updated successfully",
  "data": { "amount": 2500 }
}

2️⃣ Applicant initiates payment
POST /api/payment/postjamb/initiate
Headers: Authorization: Bearer <applicant_token>


✅ Response:

{
  "status": "success",
  "message": "Payment initialized",
  "data": {
    "authorization_url": "https://checkout.paystack.com/...",
    "reference": "PJ-1698234432",
    "amount": 2500
  }
}


Redirect the user to the returned authorization_url for payment.

3️⃣ Verify payment

After Paystack redirects the applicant back to your callback URL:

GET /api/payment/verify?reference=PJ-1698234432


✅ On success:

Payment record marked as successful

Applicant’s record updated with hasPaidPostJamb: true

Example response:

{
  "status": "success",
  "message": "Payment verified successfully",
  "data": {
    "reference": "PJ-1698234432",
    "status": "successful",
    "amount": 2500
  }
}

🧩 Optional: Webhook Integration

You can enable asynchronous verification using Paystack’s webhook system.

In payment.routes.js:

router.post("/webhook/paystack", handlePaystackWebhook);


Follow the official Paystack webhook setup guide:
👉 https://paystack.com/docs/payments/webhooks

This ensures your database updates automatically even if the callback redirect is missed.

🧠 Notes & Best Practices

Always store amounts in kobo (multiply ₦ by 100) to avoid float rounding issues.

Verify all transactions server-side using Paystack’s /transaction/verify/:reference endpoint.

Protect admin routes with:

authenticate(['admin', 'superuser'])


All responses and errors use your centralized buildResponse() util for consistency.

Each transaction is logged automatically using auditLogger("Payment action").

✅ Summary
Feature	Status
Admin fee setup	✅ Implemented
Applicant Paystack payment	✅ Implemented
Server-side verification	✅ Implemented
Webhook support	⚙️ Optional
Role-based access	✅ Integrated with authenticate
Centralized responses/logs	✅ Uses buildResponse + auditLogger