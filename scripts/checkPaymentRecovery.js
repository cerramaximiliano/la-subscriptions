const Subscription = require('../models/Subscription');
const User = require('../models/User');
const stripe = require('../config/stripe');
const logger = require('../utils/logger');
const { sendPaymentRecoveredEmail } = require('../services/emailService');

/**
 * Verifica y procesa la recuperación de pagos fallidos
 */
const checkPaymentRecovery = async () => {
  try {
    // Buscar suscripciones con pagos fallidos
    const subscriptionsAtRisk = await Subscription.find({
      accountStatus: { $in: ['at_risk', 'suspended'] },
      'paymentFailures.count': { $gt: 0 }
    }).populate('user');

    logger.info(`Checking payment recovery for ${subscriptionsAtRisk.length} subscriptions`);

    for (const subscription of subscriptionsAtRisk) {
      try {
        // Verificar el estado actual en Stripe
        const stripeSubscription = await stripe.subscriptions.retrieve(
          subscription.stripeSubscriptionId
        );

        // Si el estado en Stripe es activo, el pago se recuperó
        if (stripeSubscription.status === 'active') {
          // Resetear contadores de fallo
          subscription.paymentFailures = {
            count: 0,
            notificationsSent: {
              firstWarning: { sent: false },
              secondWarning: { sent: false },
              finalWarning: { sent: false },
              suspensionNotice: { sent: false }
            }
          };

          // Actualizar estado
          subscription.accountStatus = 'active';
          
          // Registrar recuperación
          subscription.paymentRecovery = {
            inRecovery: false,
            recoveredAt: new Date(),
            recoveryEndedAt: new Date()
          };

          // Agregar al histórico
          subscription.statusHistory.push({
            status: 'active',
            reason: 'Payment recovered',
            triggeredBy: 'system'
          });

          await subscription.save();

          // Reactivar características premium si estaban suspendidas
          const user = await User.findById(subscription.user);
          if (user && user.subscription?.suspended) {
            user.subscription.suspended = false;
            user.subscription.suspendedAt = null;
            await user.save();
          }

          // Enviar email de confirmación
          if (user) {
            await sendPaymentRecoveredEmail(user.email, {
              userName: user.firstName || user.name || user.email.split('@')[0],
              planName: subscription.plan === 'premium' ? 'Premium' : 
                       subscription.plan === 'standard' ? 'Estándar' : 'Gratuito'
            });
          }

          logger.info(`Payment recovered for subscription ${subscription._id}`);
        }
      } catch (error) {
        logger.error(`Error checking recovery for subscription ${subscription._id}:`, error);
      }
    }
  } catch (error) {
    logger.error('Error in payment recovery check:', error);
  }
};

// Si se ejecuta directamente
if (require.main === module) {
  logger.info('Running payment recovery check manually...');
  checkPaymentRecovery()
    .then(() => {
      logger.info('Payment recovery check completed');
      process.exit(0);
    })
    .catch(error => {
      logger.error('Payment recovery check failed:', error);
      process.exit(1);
    });
}

module.exports = { checkPaymentRecovery };