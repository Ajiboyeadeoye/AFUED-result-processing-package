import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    // Payer Information
    payer: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User", 
      required: true 
    },
    
    // Payment Details
    amount: { 
      type: Number, 
      required: true 
    },
    currency: { 
      type: String, 
      default: "NGN" 
    },
    
    // AFUED Service Types
    feeType: {
      type: String,
      enum: [
        "RESULT_PROCESSING",      // New
        "ADMISSION_FORM",         // New
        "SCHOOL_FEES",            // Enhanced
        "TRANSCRIPT",             // New
        "CERTIFICATE",            // New
        "POST_UTME",              // Existing
        "ACCEPTANCE",             // Existing
        "OTHER"                   // Existing
      ],
      default: "OTHER",
    },
    
    description: String,
    
    // Payment Status (Enhanced)
    status: {
      type: String,
      enum: [
        "CREATED",           // Payment created
        "PENDING",           // Waiting for payment
        "PROCESSING",        // Payment being processed
        "SUCCEEDED",         // Payment successful
        "FAILED",            // Payment failed
        "REFUNDED",          // Payment refunded
        "EXPIRED",           // Payment expired
        "REQUIRES_ACTION"    // 3D Secure or additional action
      ],
      default: "CREATED",
    },
    
    // Payment Provider
    provider: { 
      type: String, 
      enum: ["STRIPE", "REMITA", "PAYSTACK", "MANUAL"],
      default: "STRIPE" 
    },
    
    // Provider-specific IDs
    providerPaymentId: String,     // Stripe: payment_intent_id, Remita: transaction_ref
    
    // Remita-specific Fields
    remita: {
      transactionRef: String,      // Remita transaction reference
      rrr: String,                 // Remita Retrieval Reference
      merchantId: String,
      serviceTypeId: String,
      paymentUrl: String,          // URL to redirect user for payment
      verificationResponse: mongoose.Schema.Types.Mixed
    },
    
    // Stripe-specific Fields
    stripe: {
      paymentIntentId: String,
      clientSecret: String,
      chargeId: String,
      receiptUrl: String
    },
    
    // Student Information (for easy access)
    studentInfo: {
      matricNumber: String,
      fullName: String,
      email: String,
      phone: String,
      department: String,
      level: String,
      session: String
    },
    
    // AFUED Context
    academicSession: String,
    semester: String,
    
    // Transaction Reference
    transactionRef: {
      type: String,
      unique: true
    },
    
    // Metadata
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    
    // Timestamps
    paidAt: Date,
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
    }
  },
  { timestamps: true }
);

// Indexes for performance
paymentSchema.index({ payer: 1, status: 1 });
paymentSchema.index({ transactionRef: 1 });
paymentSchema.index({ "remita.transactionRef": 1 });
paymentSchema.index({ "stripe.paymentIntentId": 1 });
paymentSchema.index({ status: 1, expiresAt: 1 });
paymentSchema.index({ feeType: 1, createdAt: -1 });

// Static method to generate transaction reference
paymentSchema.statics.generateTransactionRef = function(prefix = "AFUED") {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 9).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
};

// Instance method to check if payment is expired
paymentSchema.methods.isExpired = function() {
  return this.expiresAt < new Date();
};

// Instance method to get payment gateway name
paymentSchema.methods.getGatewayName = function() {
  const gatewayNames = {
    "STRIPE": "Stripe",
    "REMITA": "Remita",
    "PAYSTACK": "Paystack",
    "MANUAL": "Manual"
  };
  return gatewayNames[this.provider] || this.provider;
};

// Instance method to get readable status
paymentSchema.methods.getReadableStatus = function() {
  const statusMap = {
    "CREATED": "Created",
    "PENDING": "Pending",
    "PROCESSING": "Processing",
    "SUCCEEDED": "Successful",
    "FAILED": "Failed",
    "REFUNDED": "Refunded",
    "EXPIRED": "Expired",
    "REQUIRES_ACTION": "Requires Action"
  };
  return statusMap[this.status] || this.status;
};


// Static method to generate transaction reference
paymentSchema.statics.generateTransactionRef = function(prefix = "AFUED") {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 9).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
};

export default mongoose.models.Payment || mongoose.model("Payment", paymentSchema);
