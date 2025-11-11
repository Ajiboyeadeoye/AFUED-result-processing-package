// const mongoose = require('mongoose');
import mongoose from "mongoose";

const templateSchema = new mongoose.Schema({
  name: { type: String, required: true }, // e.g. "welcome_message"
  channel: { type: String, enum: ['email', 'whatsapp', 'both'], default: 'both' },
  email_template: { type: String }, // HTML body
  whatsapp_template: { type: String }, // Text with variables {{user.name}}, {{course.title}}
  variables: [String], // Optional: store expected variables like ['user.name', 'course.title']
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

export const Template = mongoose.model('Template', templateSchema);
