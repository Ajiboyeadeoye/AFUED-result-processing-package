import axios from "axios";
import crypto from "crypto";

export class RemitaProvider {
  constructor() {
    this.merchantId = process.env.REMITA_MERCHANT_ID;
    this.serviceTypeId = process.env.REMITA_SERVICE_TYPE_ID;
    this.apiKey = process.env.REMITA_API_KEY;
    this.secretKey = process.env.REMITA_SECRET_KEY;
    this.environment = process.env.REMITA_ENVIRONMENT || "demo";

    this.baseUrl =
      this.environment === "live"
        ? "https://login.remita.net/remita/exapp/api/v1/send/api"
        : "https://remitademo.net/remita/exapp/api/v1/send/api";

    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        "Content-Type": "application/json",
        Authorization: `remitaConsumerKey=${this.apiKey},remitaConsumerSecret=${this.secretKey}`,
      },
    });
  }

  generateHash(data) {
    return crypto
      .createHmac("sha512", this.secretKey)
      .update(data)
      .digest("hex")
      .toUpperCase();
  }

  /**
   * Initialize Remita payment
   * ❌ NO DB writes here
   */
  async initialize(payment, student) {
    const payload = {
      serviceTypeId: this.serviceTypeId,
      amount: payment.amount.toString(),
      orderId: payment.transactionRef,
      payerName: `${student.firstName} ${student.lastName}`,
      payerEmail: student.email,
      payerPhone: student.phone || "08000000000",
      description: `AFUED Payment: ${payment.purpose}`,
      responseUrl: `${process.env.APP_URL}/api/payments/webhook/remita`,
    };

    const hashString = `${this.merchantId}${this.serviceTypeId}${payment.transactionRef}${payment.amount}${this.apiKey}`;
    const hash = this.generateHash(hashString);

    // Demo mode
    if (this.environment === "demo") {
      return {
        success: true,
        provider: "REMITA",
        paymentUrl: `https://remitademo.net/pay/${payment.transactionRef}`,
        transactionRef: payment.transactionRef,
        status: "PENDING",
        environment: "demo",
      };
    }

    const response = await this.httpClient.post(
      "/echannels/merchant/api/paymentinit",
      { ...payload, hash }
    );

    if (response.data?.status !== "00") {
      throw new Error(response.data?.message || "Remita initialization failed");
    }

    return {
      success: true,
      provider: "REMITA",
      paymentUrl: response.data.paymentUrl || response.data.remitaTransRef,
      transactionRef: payment.transactionRef,
      status: "PENDING",
      environment: "live",
    };
  }

  /**
   * Verify payment status
   * ❌ NO DB writes here
   */
  async verify(payment) {
    if (this.environment === "demo") {
      return {
        success: true,
        providerStatus: "00",
        status: "SUCCEEDED",
        raw: {
          message: "DEMO verification successful",
        },
      };
    }

    const hashString = `${this.merchantId}${payment.transactionRef}${this.apiKey}`;
    const hash = this.generateHash(hashString);

    const response = await this.httpClient.get(
      `/echannels/${payment.transactionRef}/${hash}/status.reg`
    );

    const remitaStatus = response.data?.status;

    if (remitaStatus === "00") {
      return {
        success: true,
        providerStatus: remitaStatus,
        status: "SUCCEEDED",
        raw: response.data,
      };
    }

    return {
      success: false,
      providerStatus: remitaStatus,
      status: "FAILED",
      raw: response.data,
    };
  }

  /**
   * Normalize webhook payload
   */
  async handleWebhook(data) {
    const ref = data.transactionRef || data.orderId;

    if (!ref) {
      throw new Error("Invalid Remita webhook payload");
    }

    return {
      transactionRef: ref,
      providerStatus: data.status,
      status: data.status === "00" ? "SUCCEEDED" : "FAILED",
      raw: data,
    };
  }
}

export default RemitaProvider;
