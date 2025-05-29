const mongoose = require('mongoose');
const { Schema } = mongoose;
const { SUBSCRIPTION_PLANS } = require('../config/stripe');

const SubscriptionSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'Usuarios',
    required: true
  },
  stripeCustomerId: {
    type: String
  },
  stripeSubscriptionId: {
    type: String
  },
  stripePriceId: {
    type: String
  },
  plan: {
    type: String,
    enum: Object.values(SUBSCRIPTION_PLANS),
    default: SUBSCRIPTION_PLANS.FREE
  },
  status: {
    type: String,
    enum: ['active', 'canceled', 'incomplete', 'incomplete_expired', 'past_due', 'paused', 'trialing', 'unpaid'],
    default: 'active'
  },
  currentPeriodStart: {
    type: Date
  },
  currentPeriodEnd: {
    type: Date
  },
  cancelAtPeriodEnd: {
    type: Boolean,
    default: false
  },
  trialStart: {
    type: Date
  },
  trialEnd: {
    type: Date
  },
  canceledAt: {
    type: Date
  },
  paymentMethod: {
    type: String
  },
  notifiedCancellation: {
    type: Boolean,
    default: false
  },
  // Campo para programación de cambio de plan
  scheduledPlanChange: {
    targetPlan: {
      type: String,
      enum: Object.values(SUBSCRIPTION_PLANS)
    },
    effectiveDate: {
      type: Date
    },
    notified: {
      type: Boolean,
      default: false
    }
  },
  // Nuevo campo para período de gracia por downgrade
  downgradeGracePeriod: {
    previousPlan: {
      type: String,
      enum: Object.values(SUBSCRIPTION_PLANS)
    },
    targetPlan: { type: String, default: 'free' },
    expiresAt: {
      type: Date
    },
    autoArchiveScheduled: {
      type: Boolean,
      default: false
    },
    reminderSent: { type: Boolean, default: false },
    reminder3DaysSent: { type: Boolean, default: false },
    reminder1DaySent: { type: Boolean, default: false },
    processedAt: Date,
    immediateCancel: { type: Boolean, default: false },
    calculatedFrom: String
  },
  // Límites y funcionalidades según el plan
  limits: {
    maxFolders: {
      type: Number,
      default: 5 // Para cuentas FREE
    },
    maxCalculators: {
      type: Number,
      default: 3 // Para cuentas FREE
    },
    maxContacts: {
      type: Number,
      default: 10 // Para cuentas FREE
    },
    storageLimit: {
      type: Number,
      default: 50 // MB - Para cuentas FREE
    }
  },
  // Funcionalidades habilitadas según el plan
  features: {
    advancedAnalytics: {
      type: Boolean,
      default: false // Solo para Premium
    },
    exportReports: {
      type: Boolean,
      default: false // Solo para Standard y Premium
    },
    taskAutomation: {
      type: Boolean,
      default: false // Solo para Premium
    },
    bulkOperations: {
      type: Boolean,
      default: false // Solo para Standard y Premium
    },
    prioritySupport: {
      type: Boolean,
      default: false // Solo para Premium
    },
    vinculateFolders: {
      type: Boolean,
      default: false // Solo para Standard y Premium
    },
    booking: {
      type: Boolean,
      default: false // Solo para Standard y Premium
    }
  }
}, { timestamps: true });

// Método para actualizar límites y funcionalidades según el plan
SubscriptionSchema.methods.updatePlanFeatures = function () {
  switch (this.plan) {
    case SUBSCRIPTION_PLANS.FREE:
      this.limits = {
        maxFolders: 5,
        maxCalculators: 3,
        maxContacts: 10,
        storageLimit: 50 // MB
      };
      this.features = {
        advancedAnalytics: false,
        exportReports: false,
        taskAutomation: false,
        bulkOperations: false,
        prioritySupport: false,
        vinculateFolders: false,
        booking: false
      };
      break;

    case SUBSCRIPTION_PLANS.STANDARD:
      this.limits = {
        maxFolders: 50,
        maxCalculators: 20,
        maxContacts: 100,
        storageLimit: 1024 // 1GB
      };
      this.features = {
        advancedAnalytics: false,
        exportReports: true,
        taskAutomation: false,
        bulkOperations: true,
        prioritySupport: false,
        vinculateFolders: true,
        booking: true
      };
      break;

    case SUBSCRIPTION_PLANS.PREMIUM:
      this.limits = {
        maxFolders: 999999, // Ilimitado efectivamente
        maxCalculators: 999999, // Ilimitado efectivamente
        maxContacts: 999999, // Ilimitado efectivamente
        storageLimit: 10240 // 10GB
      };
      this.features = {
        advancedAnalytics: true,
        exportReports: true,
        taskAutomation: true,
        bulkOperations: true,
        prioritySupport: true,
        vinculateFolders: true,
        booking: true
      };
      break;
  }

  return this;
};

// Middleware para actualizar automáticamente límites y funcionalidades al cambiar el plan
SubscriptionSchema.pre('save', function (next) {
  if (this.isModified('plan')) {
    this.updatePlanFeatures();
  }
  next();
});

module.exports = mongoose.model('Subscription', SubscriptionSchema);