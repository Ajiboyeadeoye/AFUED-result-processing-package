import axios from "axios";
import crypto from "crypto";
import Payment from "./payment.model.js";

export class RemitaService {
  constructor() {
    this.merchantId = process.env.REMITA_MERCHANT_ID || "27768931";
    this.serviceTypeId = process.env.REMITA_SERVICE_TYPE_ID || "4430731";
    this.apiKey = process.env.REMITA_API_KEY || "Q1dHREVNTzEyMzR8Q1dHREVNTzEyMzQ=";
    this.secretKey = process.env.REMITA_SECRET_KEY || "SGlQekMwM3ZQWk5kM1Z6b2tIY0VUTTNiQ25SUWJkc284OG5RMnhYS1Fhbw==";
    this.environment = process.env.REMITA_ENVIRONMENT || "demo";
    
    this.baseUrl = this.environment === "live"
      ? "https://login.remita.net/remita/exapp/api/v1/send/api"
      : "https://remitademo.net/remita/exapp/api/v1/send/api";
    
    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `remitaConsumerKey=${this.apiKey},remitaConsumerSecret=${this.secretKey}`
      }
    });
  }

  generateHash(dataString) {
    return crypto
      .createHmac("sha512", this.secretKey)
      .update(dataString)
      .digest("hex")
      .toUpperCase();
  }

  async initializePayment(paymentId, studentData) {
    try {
      const payment = await Payment.findById(paymentId);
      if (!payment) {
        throw new Error("Payment not found");
      }

      // Generate transaction reference if not exists
      if (!payment.transactionRef) {
        payment.transactionRef = Payment.generateTransactionRef();
      }

      // Prepare payload
      const payload = {
        serviceTypeId: this.serviceTypeId,
        amount: payment.amount.toString(),
        orderId: payment.transactionRef,
        payerName: studentData.fullName || `${studentData.firstName} ${studentData.lastName}`,
        payerEmail: studentData.email,
        payerPhone: studentData.phone || "08000000000",
        description: `AFUED Payment: ${payment.feeType}`,
        responseUrl: `${process.env.APP_URL}/api/payments/remita/callback`,
        customFields: [
          { name: "payment_id", value: payment._id.toString() },
          { name: "matric_number", value: studentData.matricNumber || "" },
          { name: "service_type", value: payment.feeType }
        ]
      };

      // Generate hash
      const hashString = `${this.merchantId}${this.serviceTypeId}${payment.transactionRef}${payment.amount}${this.apiKey}`;
      const hash = this.generateHash(hashString);

      // Demo mode
      if (this.environment === "demo") {
        return {
          success: true,
          paymentUrl: `https://remitademo.net/pay/${payment.transactionRef}`,
          transactionRef: payment.transactionRef,
          amount: payment.amount,
          status: "PENDING",
          environment: "demo",
          message: "Demo payment initialized"
        };
      }

      // Live API call
      const response = await this.httpClient.post("/echannels/merchant/api/paymentinit", {
        ...payload,
        hash
      });

      if (response.data.status === "00") {
        return {
          success: true,
          paymentUrl: response.data.remitaTransRef || response.data.paymentUrl,
          transactionRef: payment.transactionRef,
          amount: payment.amount,
          status: "PENDING",
          environment: "live",
          message: "Payment initialized successfully"
        };
      }

      throw new Error(response.data.message || "Payment initialization failed");

    } catch (error) {
      console.error("Remita payment initialization error:", error);
      throw error;
    }
  }

  async verifyPayment(transactionRef) {
    try {
      const payment = await Payment.findOne({ 
        $or: [
          { "remita.transactionRef": transactionRef },
          { transactionRef: transactionRef }
        ]
      });
      
      if (!payment) {
        throw new Error("Payment not found");
      }

      let verificationResponse;
      
      if (this.environment === "demo") {
        // Demo verification
        verificationResponse = {
          status: "00",
          amount: payment.amount.toString(),
          transactionRef,
          transactionDate: new Date().toISOString(),
          channel: "card",
          message: "DEMO: Payment verification successful"
        };
      } else {
        // Live verification
        const hashString = `${this.merchantId}${transactionRef}${this.apiKey}`;
        const hash = this.generateHash(hashString);

        const response = await this.httpClient.get(
          `/echannels/${transactionRef}/${hash}/status.reg`
        );
        verificationResponse = response.data;
      }

      // Map Remita status to our status
      const remitaStatus = verificationResponse.status;
      let paymentStatus = "PENDING";
      
      if (remitaStatus === "00") {
        paymentStatus = "SUCCEEDED";
        payment.paidAt = new Date();
        payment.status = paymentStatus;
        await payment.save();
        
        // Trigger post-payment actions
        await this.triggerPostPaymentActions(payment);
      } else if (["02", "03", "04"].includes(remitaStatus)) {
        paymentStatus = "FAILED";
        payment.status = paymentStatus;
        await payment.save();
      }

      return {
        success: true,
        paymentStatus,
        remitaStatus,
        data: verificationResponse,
        paymentId: payment._id,
        message: `Payment verification ${paymentStatus.toLowerCase()}`
      };

    } catch (error) {
      console.error("Remita verification error:", error);
      throw error;
    }
  }

  async handleWebhook(webhookData) {
    try {
      const { transactionRef, status, amount, rrr, orderId } = webhookData;
      
      const ref = transactionRef || orderId;
      if (!ref) {
        throw new Error("No transaction reference in webhook");
      }

      const payment = await Payment.findOne({ 
        $or: [
          { "remita.transactionRef": ref },
          { transactionRef: ref }
        ]
      });
      
      if (!payment) {
        throw new Error(`Payment not found for transaction: ${ref}`);
      }

      // Update payment based on webhook status
      if (status === "00") {
        payment.status = "SUCCEEDED";
        payment.paidAt = new Date();
        if (rrr) payment.remita.rrr = rrr;
        
        await payment.save();
        
        // Trigger post-payment actions
        await this.triggerPostPaymentActions(payment);
        
        return {
          success: true,
          message: "Payment completed via webhook",
          paymentId: payment._id,
          status: "SUCCEEDED"
        };
      }

      return {
        success: false,
        message: "Webhook processed but status not updated",
        paymentId: payment._id,
        status: payment.status
      };

    } catch (error) {
      console.error("Remita webhook error:", error);
      throw error;
    }
  }

  async triggerPostPaymentActions(payment) {
    try {
      console.log(`Triggering post-payment actions for payment: ${payment._id}`);
      
      // Here you would integrate with your existing result processing system
      // Example: Update student record, send email, etc.
      
      return {
        success: true,
        message: "Post-payment actions triggered"
      };
      
    } catch (error) {
      console.error("Post-payment actions error:", error);
      // Don't throw - allow payment to complete even if post-actions fail
    }
  }

  getAFUEDServices() {
    return {
      RESULT_PROCESSING: {
        id: "RESULT_PROCESSING",
        name: "Result Processing Fee",
        description: "Processing and verification of examination results",
        amount: 10000,
        category: "Academic",
        currency: "NGN"
      },
      ADMISSION_FORM: {
        id: "ADMISSION_FORM",
        name: "Admission Form",
        description: "Undergraduate admission application form",
        amount: 20000,
        category: "Admission",
        currency: "NGN"
      },
      SCHOOL_FEES: {
        id: "SCHOOL_FEES",
        name: "School Fees",
        description: "Tuition and academic fees",
        amount: null, // Variable amount
        category: "Tuition",
        currency: "NGN"
      },
      TRANSCRIPT: {
        id: "TRANSCRIPT",
        name: "Academic Transcript",
        description: "Official transcript processing and delivery",
        amount: 15000,
        category: "Document",
        currency: "NGN"
      },
      CERTIFICATE: {
        id: "CERTIFICATE",
        name: "Certificate Collection",
        description: "Collection of original certificate",
        amount: 10000,
        category: "Document",
        currency: "NGN"
      },
      POST_UTME: {
        id: "POST_UTME",
        name: "POST UTME Form",
        description: "Post-UTME screening form",
        amount: 2000,
        category: "Admission",
        currency: "NGN"
      },
      ACCEPTANCE: {
        id: "ACCEPTANCE",
        name: "Acceptance Fee",
        description: "Admission acceptance fee",
        amount: 50000,
        category: "Admission",
        currency: "NGN"
      }
    };
  }

  async testConnection() {
    try {
      if (this.environment === "demo") {
        return {
          success: true,
          message: "Remita demo mode active",
          environment: "demo"
        };
      }

      await this.httpClient.get("/echannels/ping");
      return {
        success: true,
        message: "Remita service connected",
        environment: "live"
      };
    } catch (error) {
      return {
        success: false,
        message: "Remita service unavailable",
        error: error.message,
        environment: this.environment
      };
    }
  }
}

export default RemitaService;
