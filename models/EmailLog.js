const mongoose = require('mongoose');
const { Schema } = mongoose;

const emailLogSchema = new Schema({
  to: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    index: true
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'Usuarios',
    default: null,
    index: true
  },
  subject: {
    type: String,
    required: true
  },
  templateCategory: {
    type: String,
    default: null,
    index: true
  },
  templateName: {
    type: String,
    default: null,
    index: true
  },
  sesMessageId: {
    type: String,
    default: null
  },
  status: {
    type: String,
    enum: ['sent', 'failed', 'bounced', 'complained', 'delivered'],
    default: 'sent',
    index: true
  },
  errorMessage: {
    type: String,
    default: null
  },
  metadata: {
    type: Schema.Types.Mixed,
    default: {}
  },
  source: {
    type: String,
    default: 'la-subscriptions'
  }
}, {
  timestamps: true
});

emailLogSchema.index({ to: 1, templateCategory: 1, createdAt: -1 });
emailLogSchema.index({ sesMessageId: 1 });
emailLogSchema.index({ createdAt: -1 });

const EmailLog = mongoose.model('EmailLog', emailLogSchema);

module.exports = EmailLog;
