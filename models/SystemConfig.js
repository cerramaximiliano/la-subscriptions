const mongoose = require('mongoose');
const logger = require('../utils/logger');

/**
 * Modelo mínimo de SystemConfig para la-subscriptions.
 * Solo expone los campos necesarios para este microservicio.
 * La fuente de verdad es la colección en law-analytics-server.
 */
const systemConfigSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  isActive: { type: Boolean, default: true },
  gracePeriodSettings: {
    downgradeGraceDays: { type: Number, default: 15 },
    paymentGraceDays: { type: Number, default: 15 }
  }
}, { timestamps: true });

const GRACE_DEFAULTS = { downgradeGraceDays: 15, paymentGraceDays: 15 };

systemConfigSchema.statics.getGraceConfig = async function() {
  try {
    const config = await this.findOne({ key: 'grace_period', isActive: true });
    if (!config || !config.gracePeriodSettings) {
      logger.warn('[SystemConfig] grace_period config not found in DB, using hardcoded defaults (downgrade: 15d, payment: 15d). Insert a "grace_period" document in SystemConfig to override.');
      return GRACE_DEFAULTS;
    }
    return {
      downgradeGraceDays: config.gracePeriodSettings.downgradeGraceDays ?? GRACE_DEFAULTS.downgradeGraceDays,
      paymentGraceDays: config.gracePeriodSettings.paymentGraceDays ?? GRACE_DEFAULTS.paymentGraceDays
    };
  } catch (err) {
    logger.warn(`[SystemConfig] Error reading grace_period config, using hardcoded defaults: ${err.message}`);
    return GRACE_DEFAULTS;
  }
};

module.exports = mongoose.models.SystemConfig || mongoose.model('SystemConfig', systemConfigSchema);
