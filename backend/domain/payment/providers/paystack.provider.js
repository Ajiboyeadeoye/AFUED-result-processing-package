// domain/payment/providers/paystack.provider.js
import axios from 'axios';
import crypto from 'crypto';

export class PaystackProvider {
  constructor() {
    this.name = "PAYSTACK";
    this.secretKey = process.env.PAYSTACK_SECRET_KEY;
    this.publicKey = process.env.PAYSTACK_PUBLIC_KEY;
    this.baseUrl = process.env.PAYSTACK_BASE_URL || 'https://api.paystack.co';
    
    // Initialize axios instance with default headers
    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Authorization': `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
    });
    
    // Validate configuration
    if (!this.secretKey || !this.publicKey) {
      console.warn('⚠️ Paystack credentials not configured in environment variables');
    }
  }

  /**
   * Get provider display name
   */
  getDisplayName() {
    return "Paystack";
  }

  /**
   * Get supported currencies
   */
  getSupportedCurrencies() {
    return ['NGN', 'USD', 'GHS', 'ZAR'];
  }

  /**
   * Initialize payment with Paystack
   */
  async initialize({ payment, student, amount }) {
    try {
      console.log(`Initializing Paystack payment for transaction: ${payment.transactionRef}`);
      
      // Prepare callback URL
      const callbackUrl = `${process.env.APP_URL || 'http://localhost:3000'}/api/payments/callback?ref=${payment.transactionRef}`;
      
      // Prepare metadata
      const metadata = {
        studentId: student._id.toString(),
        studentName: `${student.firstName} ${student.lastName}`,
        studentEmail: student.email,
        studentMatric: student.matricNumber || 'N/A',
        studentLevel: student.level,
        paymentId: payment._id.toString(),
        paymentPurpose: payment.purpose,
        session: payment.session,
        semester: payment.semester,
      };

      // Make API call to Paystack
      const response = await this.axiosInstance.post('/transaction/initialize', {
        email: student.email,
        amount: Math.round(amount * 100), // Convert to kobo/pesewas
        reference: payment.transactionRef,
        callback_url: callbackUrl,
        metadata,
        channels: ['card', 'bank', 'ussd', 'qr', 'mobile_money', 'bank_transfer'],
      });

      const data = response.data.data;
      
      if (!response.data.status || !data.authorization_url) {
        throw new Error('Invalid response from Paystack');
      }

      console.log(`Paystack payment initialized: ${data.reference}`);
      
      return {
        authorizationUrl: data.authorization_url,
        accessCode: data.access_code,
        reference: data.reference,
        providerPaymentId: data.reference,
        amount: data.amount / 100,
        currency: data.currency,
        requiresRedirect: true,
      };
    } catch (error) {
      console.error('Paystack initialization error:', error.response?.data || error.message);
      throw new Error(`Paystack payment initialization failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Verify payment with Paystack
   */
  async verify(payment) {
    try {
      console.log(`Verifying Paystack payment: ${payment.transactionRef}`);
      
      const reference = payment.providerPaymentId || payment.transactionRef;
      
      const response = await this.axiosInstance.get(`/transaction/verify/${reference}`);
      const data = response.data.data;
      
      if (!response.data.status) {
        throw new Error('Invalid response from Paystack verification');
      }

      let status = "PENDING";
      if (data.status === "success") {
        status = "SUCCESSFUL";
      } else if (data.status === "failed") {
        status = "FAILED";
      }

      console.log(`Paystack verification result for ${reference}: ${status}`);
      
      return {
        status,
        amount: data.amount / 100, // Convert back from kobo
        currency: data.currency,
        paidAt: data.paid_at ? new Date(data.paid_at) : new Date(),
        paymentMethod: data.channel,
        authorizationCode: data.authorization?.authorization_code,
        bank: data.authorization?.bank,
        cardType: data.authorization?.card_type,
        last4: data.authorization?.last4,
        raw: data,
        providerPaymentId: data.reference,
      };
    } catch (error) {
      console.error('Paystack verification error:', error.response?.data || error.message);
      
      // If transaction not found, it might still be pending
      if (error.response?.status === 404) {
        return {
          status: "PENDING",
          raw: { message: "Transaction not found, may still be processing" },
        };
      }
      
      throw new Error(`Paystack verification failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Handle Paystack webhook
   */
  async handleWebhook(webhookData) {
    try {
      console.log('Processing Paystack webhook:', webhookData.event);
      
      const event = webhookData.event;
      const data = webhookData.data;
      
      let status = "PENDING";
      
      // Map Paystack events to our payment statuses
      if (event === "charge.success" || event === "transfer.success") {
        status = "SUCCESSFUL";
      } else if (event === "charge.failed" || event === "transfer.failed") {
        status = "FAILED";
      } else if (event === "charge.pending") {
        status = "PENDING";
      } else {
        // For other events, we might not want to update payment status
        console.log(`Ignoring Paystack webhook event: ${event}`);
        return {
          status: "IGNORED",
          transactionRef: data.reference,
          providerPaymentId: data.reference,
          raw: webhookData,
        };
      }

      return {
        status,
        transactionRef: data.reference,
        providerPaymentId: data.reference,
        amount: data.amount / 100,
        currency: data.currency,
        paidAt: data.paid_at ? new Date(data.paid_at) : new Date(),
        paymentMethod: data.channel,
        authorizationCode: data.authorization?.authorization_code,
        raw: webhookData,
      };
    } catch (error) {
      console.error('Paystack webhook handling error:', error);
      throw new Error(`Failed to process Paystack webhook: ${error.message}`);
    }
  }

  /**
   * Validate Paystack webhook signature
   */
  async validateWebhookSignature(req) {
    try {
      const hash = crypto
        .createHmac('sha512', this.secretKey)
        .update(JSON.stringify(req.body))
        .digest('hex');
      
      const signature = req.headers['x-paystack-signature'];
      
      if (!signature) {
        console.warn('No Paystack signature found in webhook request');
        return false;
      }
      
      const isValid = hash === signature;
      
      if (!isValid) {
        console.error('Invalid Paystack webhook signature');
      }
      
      return isValid;
    } catch (error) {
      console.error('Error validating Paystack webhook signature:', error);
      return false;
    }
  }

  /**
   * Refund a payment
   */
  async refund(payment, amount = null) {
    try {
      console.log(`Processing refund for Paystack payment: ${payment.providerPaymentId}`);
      
      const response = await this.axiosInstance.post('/refund', {
        transaction: payment.providerPaymentId,
        amount: amount ? Math.round(amount * 100) : undefined,
      });
      
      const data = response.data.data;
      
      return {
        success: response.data.status,
        refundId: data.id,
        amount: data.amount / 100,
        currency: data.currency,
        status: data.status,
        raw: data,
      };
    } catch (error) {
      console.error('Paystack refund error:', error.response?.data || error.message);
      throw new Error(`Paystack refund failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Check account balance
   */
  async getBalance() {
    try {
      const response = await this.axiosInstance.get('/balance');
      const data = response.data.data;
      
      return {
        success: response.data.status,
        balances: data.map(balance => ({
          currency: balance.currency,
          balance: balance.balance / 100,
          ledgerBalance: balance.ledger_balance / 100,
        })),
      };
    } catch (error) {
      console.error('Paystack balance check error:', error.response?.data || error.message);
      throw new Error(`Failed to get Paystack balance: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Create transfer recipient (for payouts)
   */
  async createTransferRecipient({ 
    name, 
    accountNumber, 
    bankCode, 
    currency = 'NGN',
    type = 'nuban',
    description = '',
    metadata = {} 
  }) {
    try {
      const response = await this.axiosInstance.post('/transferrecipient', {
        type,
        name,
        account_number: accountNumber,
        bank_code: bankCode,
        currency,
        description,
        metadata,
      });
      
      const data = response.data.data;
      
      return {
        success: response.data.status,
        recipientCode: data.recipient_code,
        details: data.details,
        raw: data,
      };
    } catch (error) {
      console.error('Paystack create recipient error:', error.response?.data || error.message);
      throw new Error(`Failed to create Paystack recipient: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Initiate transfer
   */
  async initiateTransfer({ 
    recipientCode, 
    amount, 
    reason, 
    currency = 'NGN',
    reference = null 
  }) {
    try {
      const response = await this.axiosInstance.post('/transfer', {
        source: 'balance',
        amount: Math.round(amount * 100),
        recipient: recipientCode,
        reason,
        currency,
        reference: reference || `transfer-${Date.now()}`,
      });
      
      const data = response.data.data;
      
      return {
        success: response.data.status,
        transferCode: data.transfer_code,
        reference: data.reference,
        amount: data.amount / 100,
        status: data.status,
        raw: data,
      };
    } catch (error) {
      console.error('Paystack transfer error:', error.response?.data || error.message);
      throw new Error(`Paystack transfer failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Verify bank account
   */
  async verifyBankAccount({ accountNumber, bankCode }) {
    try {
      const response = await this.axiosInstance.get(`/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`);
      const data = response.data.data;
      
      return {
        success: response.data.status,
        accountName: data.account_name,
        accountNumber: data.account_number,
        bankId: data.bank_id,
        raw: data,
      };
    } catch (error) {
      console.error('Paystack bank verification error:', error.response?.data || error.message);
      throw new Error(`Bank verification failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Get list of banks
   */
  async getBanks(country = 'nigeria') {
    try {
      const response = await this.axiosInstance.get(`/bank?country=${country}`);
      const data = response.data.data;
      
      return {
        success: response.data.status,
        banks: data.map(bank => ({
          name: bank.name,
          code: bank.code,
          country: bank.country,
          currency: bank.currency,
          type: bank.type,
        })),
      };
    } catch (error) {
      console.error('Paystack get banks error:', error.response?.data || error.message);
      throw new Error(`Failed to get banks: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Charge returning customer (for subscriptions)
   */
  async chargeAuthorization({
    email,
    amount,
    authorizationCode,
    reference = null,
    metadata = {}
  }) {
    try {
      const response = await this.axiosInstance.post('/transaction/charge_authorization', {
        email,
        amount: Math.round(amount * 100),
        authorization_code: authorizationCode,
        reference: reference || `charge-${Date.now()}`,
        metadata,
      });
      
      const data = response.data.data;
      
      return {
        success: response.data.status,
        reference: data.reference,
        amount: data.amount / 100,
        status: data.status,
        authorizationCode: data.authorization?.authorization_code,
        raw: data,
      };
    } catch (error) {
      console.error('Paystack charge authorization error:', error.response?.data || error.message);
      throw new Error(`Paystack charge failed: ${error.response?.data?.message || error.message}`);
    }
  }
}

export default PaystackProvider;