const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const WebhookEventSchema = new Schema({
  stripeEventId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  eventType: {
    type: String,
    required: true,
    index: true
  },
  processedAt: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['processing', 'processed', 'failed', 'skipped'],
    default: 'processing'
  },
  error: {
    message: String,
    stack: String,
    code: String
  },
  retryCount: { 
    type: Number, 
    default: 0 
  },
  lastRetryAt: Date,
  payload: Schema.Types.Mixed,
  metadata: {
    customerId: String,
    subscriptionId: String,
    invoiceId: String
  }
}, { 
  timestamps: true
});

// Índices para búsquedas eficientes
WebhookEventSchema.index({ eventType: 1, processedAt: -1 });
WebhookEventSchema.index({ 'metadata.customerId': 1 });
WebhookEventSchema.index({ status: 1, retryCount: 1 });

// TTL Index - Auto-eliminar eventos después de 90 días
WebhookEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });

module.exports = mongoose.model('WebhookEvent', WebhookEventSchema);