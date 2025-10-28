// modules/payment/paymentSetting.model.js
import mongoose from "mongoose";

const paymentSettingSchema = new mongoose.Schema({
  type: { type: String, enum: ["postjamb"], required: true, unique: true },
  amount: { type: Number, required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  updatedAt: { type: Date, default: Date.now },
});

export const PaymentSetting = mongoose.model("PaymentSetting", paymentSettingSchema);
