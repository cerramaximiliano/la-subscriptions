const stripe = require('stripe')(
  process.env.NODE_ENV === 'production'
    ? process.env.STRIPE_SECRET_KEY
    : process.env.STRIPE_SECRET_KEY_TEST ||
    process.env.STRIPE_API_KEY_DEV
);
const logger = require('../utils/logger');
const subscriptionService =
  require('../services/subscriptionService');
const emailService = require('../services/emailService');

/**
 * Maneja los webhooks de Stripe
 */
exports.handleStripeWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.NODE_ENV === 'production'
    ? process.env.STRIPE_WEBHOOK_SECRET
    : process.env.STRIPE_WEBHOOK_SECRET_DEV ||
    process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    // Verificar la firma del webhook
    if (endpointSecret && sig) {
      event = stripe.webhooks.constructEvent(req.body, sig,
        endpointSecret);
      logger.info(`Webhook verificado: ${event.type} - ID: 
  ${event.id}`);
    } else {
      // Solo en desarrollo sin firma
      if (process.env.NODE_ENV !== 'production') {
        logger.warn('⚠️  Procesando webhook sin verificación de firma (solo desarrollo)');
        event = JSON.parse(req.body.toString());
      } else {
        throw new Error('Firma de webhook requerida en producción');
      }
    }
  } catch (err) {
    logger.error(`Error verificando webhook: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Log del tipo de evento recibido
  logger.info(`Evento Stripe recibido: ${event.type}`);
  logger.debug('Datos del evento:',
    JSON.stringify(event.data.object, null, 2));

  // Procesar el evento
  try {
    switch (event.type) {
      // Eventos de sesión de checkout
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event);
        break;

      // Eventos de suscripción
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event);
        break;

      // Eventos de facturación
      case 'invoice.paid':
        await handleInvoicePaid(event);
        break;

      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event);
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event);
        break;

      // Eventos de cliente
      case 'customer.created':
        logger.info(`Cliente creado: ${event.data.object.id}`);
        break;

      case 'customer.updated':
        logger.info(`Cliente actualizado: 
  ${event.data.object.id}`);
        break;

      // Eventos no manejados
      default:
        logger.warn(`Evento no manejado: ${event.type}`);
    }

    // Responder exitosamente
    res.json({ received: true, type: event.type });

  } catch (error) {
    logger.error(`Error procesando webhook ${event.type}:`,
      error);
    logger.error('Stack trace:', error.stack);

    // Responder con éxito para evitar reintentos de Stripe
    // pero loguear el error para investigación
    res.json({
      received: true,
      error: true,
      message: process.env.NODE_ENV !== 'production' ?
        error.message : 'Error processing webhook'
    });
  }
};

/**
 * Maneja el evento checkout.session.completed
 */
async function handleCheckoutSessionCompleted(event) {
  const session = event.data.object;

  logger.info(`Checkout session completado: ${session.id}`);
  logger.info(`Modo: ${session.mode}, Estado: 
  ${session.payment_status}`);

  // Solo procesar si es una suscripción
  if (session.mode === 'subscription' && session.subscription) {
    try {
      // Obtener la suscripción completa de Stripe
      const subscription = await
        stripe.subscriptions.retrieve(session.subscription);

      logger.info(`Procesando nueva suscripción desde checkout: 
  ${subscription.id}`);

      // Delegar al servicio de suscripciones
      await
        subscriptionService.handleSubscriptionCreated(subscription);

      // Obtener información del usuario para el email
      const user = await
        getUserFromCustomerId(subscription.customer);
      if (user) {
        const planName =
          getPlanNameFromPriceId(subscription.items.data[0].price.id);
        const nextBillingDate = new
          Date(subscription.current_period_end *
            1000).toLocaleDateString('es-ES');

        await emailService.sendSubscriptionEmail(user, 'created',
          {
            planName,
            nextBillingDate,
            maxFolders: getPlanLimits(planName).maxFolders,
            maxCalculators: getPlanLimits(planName).maxCalculators,
            maxContacts: getPlanLimits(planName).maxContacts
          });
      }

    } catch (error) {
      logger.error('Error procesando checkout session:', error);
      throw error;
    }
  }
}

/**
 * Maneja el evento customer.subscription.created
 */
async function handleSubscriptionCreated(event) {
  const subscription = event.data.object;

  logger.info(`Nueva suscripción creada: ${subscription.id}`);
  logger.info(`Cliente: ${subscription.customer}, Estado: 
  ${subscription.status}`);

  await subscriptionService.handleSubscriptionEvent(event);
}

/**
 * Maneja el evento customer.subscription.updated
 */
async function handleSubscriptionUpdated(event) {
  const subscription = event.data.object;
  const previousAttributes = event.data.previous_attributes || {};

  logger.info(`Suscripción actualizada: ${subscription.id}`);
  logger.info(`Cambios detectados:`, Object.keys(previousAttributes));

  // Primero, procesar la actualización en la BD
  await subscriptionService.handleSubscriptionEvent(event);

  // Detectar tipo de cambio para notificaciones
  const user = await getUserFromCustomerId(subscription.customer);
  if (!user) return;

  // 1. Detectar cancelación programada
  if (previousAttributes.cancel_at_period_end !== undefined) {
    if (subscription.cancel_at_period_end) {
      logger.info(`Suscripción programada para cancelar al final del período`);

      const cancelDate = new Date(subscription.current_period_end * 1000);
      const gracePeriodStart = cancelDate;
      const gracePeriodEnd = new Date(cancelDate.getTime() + 15 * 24 * 60 * 60 * 1000);

      await emailService.sendSubscriptionEmail(user, 'scheduledCancellation', {
        previousPlan: getPlanNameFromPriceId(subscription.items.data[0].price.id),
        cancelDate: cancelDate.toLocaleDateString('es-ES'),
        gracePeriodStart: gracePeriodStart.toLocaleDateString('es-ES'),
        gracePeriodEnd: gracePeriodEnd.toLocaleDateString('es-ES')
      });
    } else {
      logger.info(`Cancelación de suscripción revertida`);
    }
  }

  // 2. Detectar cambios de plan (nuevo código)
  if (previousAttributes.items) {
    const oldPriceId = previousAttributes.items?.data?.[0]?.price?.id;
    const newPriceId = subscription.items.data[0]?.price?.id;

    if (oldPriceId && newPriceId && oldPriceId !== newPriceId) {
      await handlePlanChange(subscription, oldPriceId, newPriceId, user);
    }
  }
}


// Nueva función para manejar cambios de plan
async function handlePlanChange(subscription, oldPriceId, newPriceId, user) {
  const planHierarchy = {
    [process.env.STRIPE_PRICE_FREE || 'price_free']: 0,
    [process.env.STRIPE_PRICE_STANDARD || 'price_standard']: 1,
    [process.env.STRIPE_PRICE_PREMIUM || 'price_premium']: 2
  };

  const oldValue = planHierarchy[oldPriceId] ?? -1;
  const newValue = planHierarchy[newPriceId] ?? -1;

  if (oldValue === -1 || newValue === -1) {
    logger.warn(`Price IDs no reconocidos: old=${oldPriceId}, new=${newPriceId}`);
    return;
  }

  const oldPlanName = getPlanNameFromPriceId(oldPriceId);
  const newPlanName = getPlanNameFromPriceId(newPriceId);

  if (newValue < oldValue) {
    // Es un downgrade
    logger.info(`Downgrade detectado: ${oldPlanName} → ${newPlanName}`);

    // El período de gracia se manejará en subscriptionService
    // Aquí solo enviamos la notificación
    await emailService.sendSubscriptionEmail(user, 'planDowngraded', {
      previousPlan: oldPlanName,
      newPlan: newPlanName,
      gracePeriodEnd: new Date(Date.now() + 15 * 24 * 60 * 60 *
        1000).toLocaleDateString('es-ES'),
      newLimits: getPlanLimits(newPlanName),
      isDowngrade: true
    });

  } else if (newValue > oldValue) {
    // Es un upgrade
    logger.info(`Upgrade detectado: ${oldPlanName} → ${newPlanName}`);

    await emailService.sendSubscriptionEmail(user, 'planUpgraded', {
      previousPlan: oldPlanName,
      newPlan: newPlanName,
      newLimits: getPlanLimits(newPlanName),
      isUpgrade: true
    });
  }
}
/**
 * Maneja el evento customer.subscription.deleted
 */
async function handleSubscriptionDeleted(event) {
  const subscription = event.data.object;

  logger.info(`Suscripción eliminada/cancelada: 
  ${subscription.id}`);
  logger.info(`Cliente: ${subscription.customer}`);

  await subscriptionService.handleSubscriptionEvent(event);

  // Enviar email de cancelación inmediata
  const user = await getUserFromCustomerId(subscription.customer);
  if (user) {
    const gracePeriodEnd = new Date(Date.now() + 15 * 24 * 60 * 60
      * 1000).toLocaleDateString('es-ES');
    await emailService.sendSubscriptionEmail(user, 'canceled', {
      previousPlan:
        getPlanNameFromPriceId(subscription.items.data[0].price.id),
      immediate: true,
      gracePeriodEnd
    });
  }
}

/**
 * Maneja el evento invoice.paid
 */
async function handleInvoicePaid(event) {
  const invoice = event.data.object;

  logger.info(`Factura pagada: ${invoice.id}`);
  logger.info(`Monto: ${invoice.amount_paid / 100} 
  ${invoice.currency.toUpperCase()}`);

  // Si la factura está asociada a una suscripción, actualizar el 
  estado
  if (invoice.subscription) {
    try {
      const subscription = await
        stripe.subscriptions.retrieve(invoice.subscription);

      // Si la suscripción estaba incompleta y ahora está activa
      if (subscription.status === 'active') {
        logger.info(`Actualizando suscripción ${subscription.id} a
   estado activo`);

        await
          subscriptionService.handleSubscriptionUpdated(subscription);
      }
    } catch (error) {
      logger.error('Error actualizando suscripción desde factura pagada:', error);
    }
  }
}

/**
 * Maneja el evento invoice.payment_succeeded
 */
async function handleInvoicePaymentSucceeded(event) {
  const invoice = event.data.object;

  logger.info(`Pago de factura exitoso: ${invoice.id}`);

  // Similar a invoice.paid
  await handleInvoicePaid(event);
}

/**
 * Maneja el evento invoice.payment_failed
 */
async function handleInvoicePaymentFailed(event) {
  const invoice = event.data.object;

  logger.error(`Pago de factura fallido: ${invoice.id}`);
  logger.error(`Razón: ${invoice.last_payment_error?.message || 'Desconocida'}`);

  // TODO: Implementar lógica para manejar pagos fallidos
  // Por ejemplo: enviar email al usuario, marcar suscripción como en riesgo, etc.
}

/**
 * Funciones auxiliares
 */

// Obtener usuario por customer ID de Stripe
async function getUserFromCustomerId(customerId) {
  try {
    const User = require('../models/User');
    const Subscription = require('../models/Subscription');

    // Buscar por suscripción
    const subscription = await Subscription.findOne({
      stripeCustomerId: customerId
    }).populate('user');

    if (subscription && subscription.user) {
      return subscription.user;
    }

    // Buscar directamente en usuarios (si tienes el campo)
    const user = await User.findOne({
      stripeCustomerId: customerId
    });
    return user;

  } catch (error) {
    logger.error(`Error obteniendo usuario para cliente 
  ${customerId}:`, error);
    return null;
  }
}

// Obtener nombre del plan desde price ID
function getPlanNameFromPriceId(priceId) {
  const planMapping = {
    [process.env.STRIPE_PRICE_FREE || 'price_free']: 'Gratuito',
    [process.env.STRIPE_PRICE_STANDARD || 'price_standard']:
      'Estándar',
    [process.env.STRIPE_PRICE_PREMIUM || 'price_premium']:
      'Premium'
  };

  return planMapping[priceId] || 'Desconocido';
}

// Obtener límites del plan
function getPlanLimits(planName) {
  const limits = {
    'Gratuito': {
      maxFolders: 5, maxCalculators: 3, maxContacts:
        10
    },
    'Estándar': {
      maxFolders: 50, maxCalculators: 20, maxContacts:
        100
    },
    'Premium': {
      maxFolders: 999999, maxCalculators: 999999,
      maxContacts: 999999
    }
  };

  return limits[planName] || limits['Gratuito'];
}

/**
 * Endpoint de prueba para desarrollo
 */
exports.testWebhook = async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    logger.info('Test webhook endpoint llamado');

    // Simular un evento
    const testEvent = {
      id: 'evt_test_' + Date.now(),
      type: req.body.type || 'customer.subscription.updated',
      data: {
        object: req.body.data || {
          id: 'sub_test_123',
          customer: 'cus_test_123',
          status: 'active'
        }
      }
    };

    logger.info('Evento de prueba:', testEvent);

    res.json({
      success: true,
      message: 'Test webhook procesado',
      event: testEvent
    });

  } catch (error) {
    logger.error('Error en test webhook:', error);
    res.status(500).json({ error: error.message });
  }
};