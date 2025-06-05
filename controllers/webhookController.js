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
const Subscription = require('../models/Subscription');
const PlanConfig = require('../models/PlanConfig');
const { generateUpdatePaymentUrl } = require('../utils/stripeCustomerPortal');

/**
 * Maneja webhooks de prueba (solo desarrollo o con autenticación)
 */
exports.testWebhook = async (req, res) => {
  // Este endpoint puede ser usado en producción si tiene autenticación (test-secure)
  const event = req.body;
  
  // Marcar como modo test
  global.currentWebhookTestMode = true;
  logger.info('🧪 Procesando webhook en MODO TEST');
  
  // Validar estructura básica del evento
  if (!event || !event.id || !event.type) {
    return res.status(400).json({ 
      error: 'Invalid event structure',
      required: ['id', 'type', 'data']
    });
  }

  logger.info(`Test webhook received: ${event.type} - ID: ${event.id}`);
  
  // Procesar el evento usando la misma lógica que handleStripeWebhook
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event);
        break;
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event);
        break;
      case 'invoice.paid':
        await handleInvoicePaid(event);
        break;
      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event);
        break;
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event);
        break;
      default:
        logger.warn(`Test webhook - Evento no manejado: ${event.type}`);
    }

    res.json({ received: true, type: event.type, test: true });

  } catch (error) {
    logger.error(`Error procesando test webhook ${event.type}:`, error);
    res.json({
      received: true,
      error: true,
      message: error.message,
      test: true
    });
  }
};

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
      logger.info(`Webhook verificado: ${event.type} - ID: ${event.id}`);
      
      // Detectar modo de prueba
      if (!event.livemode) {
        logger.info('🧪 Evento en modo TEST detectado');
        global.currentWebhookTestMode = true;
      } else {
        global.currentWebhookTestMode = false;
      }
    } else {
      // Solo en desarrollo sin firma
      if (process.env.NODE_ENV !== 'production') {
        logger.warn('⚠️  Procesando webhook sin verificación de firma (solo desarrollo)');
        event = JSON.parse(req.body.toString());
        // También marcar como modo test si no hay firma
        global.currentWebhookTestMode = true;
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
  logger.info(`Event ID: ${event.id}, Livemode: ${event.livemode}`);
  
  // IMPORTANTE: Este microservicio solo maneja eventos de pagos fallidos/recuperación
  const PAYMENT_EVENTS = [
    'invoice.payment_failed',
    'invoice.payment_succeeded',
    'invoice.paid',
    'charge.failed'
  ];

  // Si no es un evento de pagos, lo dejamos pasar al servidor principal
  if (!PAYMENT_EVENTS.includes(event.type)) {
    logger.info(`[SKIP] Evento ${event.type} no es de pagos - ignorando en este servicio`);
    return res.status(200).json({ received: true, processed: false });
  }

  // Log más detallado del objeto principal
  const obj = event.data.object;
  logger.info(`Procesando ${event.type}:`);
  logger.info(`- Invoice ID: ${obj.id}`);
  logger.info(`- Customer: ${obj.customer}`);
  logger.info(`- Subscription: ${obj.subscription || 'N/A'}`);
  logger.info(`- Amount: ${obj.amount_paid || obj.amount_due} ${obj.currency}`);
  
  logger.debug('Datos completos del evento:', JSON.stringify(event.data.object, null, 2));

  // Procesar solo eventos de pagos
  try {
    switch (event.type) {
      // Eventos de facturación y pagos
      case 'invoice.paid':
        await handleInvoicePaid(event);
        break;

      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event);
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event);
        break;

      case 'charge.failed':
        logger.warn(`[CHARGE_FAILED] Cargo fallido: ${event.data.object.id}`);
        // Podemos agregar lógica específica si es necesario
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
 * NOTA: Los siguientes handlers están comentados porque este microservicio
 * solo maneja eventos de pagos. La gestión de suscripciones se hace en el
 * servidor principal.
 */

/*
// Handler comentado - No usado en microservicio de pagos
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
    // Obtener límites dinámicamente desde PlanConfig
    const newPlanId = newPlanName.toLowerCase().replace('í', 'i').replace('á', 'a');
    const newLimits = await getPlanLimitsFromConfig(newPlanId === 'gratuito' ? 'free' : newPlanId);
    
    await emailService.sendSubscriptionEmail(user, 'planDowngraded', {
      previousPlan: oldPlanName,
      newPlan: newPlanName,
      gracePeriodEnd: new Date(Date.now() + 15 * 24 * 60 * 60 *
        1000).toLocaleDateString('es-ES'),
      newLimits,
      isDowngrade: true
    });

  } else if (newValue > oldValue) {
    // Es un upgrade
    logger.info(`Upgrade detectado: ${oldPlanName} → ${newPlanName}`);

    // Obtener límites dinámicamente desde PlanConfig
    const newPlanId = newPlanName.toLowerCase().replace('í', 'i').replace('á', 'a');
    const newLimits = await getPlanLimitsFromConfig(newPlanId === 'gratuito' ? 'free' : newPlanId);

    await emailService.sendSubscriptionEmail(user, 'planUpgraded', {
      previousPlan: oldPlanName,
      newPlan: newPlanName,
      newLimits,
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
    
    // Verificar que items existe antes de acceder
    let previousPlan = 'Desconocido';
    if (subscription.items && subscription.items.data && subscription.items.data[0] && subscription.items.data[0].price) {
      previousPlan = getPlanNameFromPriceId(subscription.items.data[0].price.id);
    } else {
      logger.warn('subscription.items no está definido en el evento deleted');
      // Intentar obtener el plan de la base de datos
      const dbSubscription = await Subscription.findOne({ stripeSubscriptionId: subscription.id });
      if (dbSubscription) {
        previousPlan = dbSubscription.plan || 'Desconocido';
      }
    }
    
    await emailService.sendSubscriptionEmail(user, 'canceled', {
      previousPlan,
      immediate: true,
      gracePeriodEnd,
      foldersLimit: 5,
      calculatorsLimit: 3,
      contactsLimit: 10
    });
  }
}

/**
 * Maneja el evento invoice.paid
 */
async function handleInvoicePaid(event) {
  const invoice = event.data.object;

  logger.info(`Factura pagada: ${invoice.id}`);
  logger.info(`Monto: ${invoice.amount_paid / 100} ${invoice.currency.toUpperCase()}`);
  logger.info(`Cliente: ${invoice.customer}`);
  
  // Debugging adicional
  if (invoice.subscription) {
    logger.info(`Factura asociada a suscripción: ${invoice.subscription}`);
    
    // Los webhooks de invoice normalmente incluyen información limitada sobre la suscripción
    // En producción, Stripe puede expandir automáticamente ciertos campos
    // Para desarrollo, trabajamos con los datos que tenemos
    
    try {
      // Buscar la suscripción en nuestra base de datos
      const dbSubscription = await Subscription.findOne({ 
        stripeSubscriptionId: invoice.subscription 
      });
      
      if (dbSubscription) {
        logger.info(`Suscripción encontrada en BD: ${dbSubscription._id}`);
        logger.info(`Estado actual: ${dbSubscription.status}, accountStatus: ${dbSubscription.accountStatus}`);
        logger.info(`Fallos de pago previos: ${dbSubscription.paymentFailures?.count || 0}`);
        
        // IMPORTANTE: Solo procesar si es una recuperación de pago fallido
        if (dbSubscription.paymentFailures && dbSubscription.paymentFailures.count > 0) {
          logger.info(`[PAYMENT_RECOVERY] Pago recuperado para suscripción: ${invoice.subscription}`);
          
          // Verificar que la suscripción no esté cancelada
          if (dbSubscription.status === 'canceled') {
            logger.warn(`[SKIP] Suscripción ${invoice.subscription} está cancelada - ignorando recuperación`);
            return;
          }
          
          // Resetear contadores de fallo
          dbSubscription.paymentFailures.count = 0;
          dbSubscription.paymentFailures.lastFailedAt = null;
          dbSubscription.paymentFailures.lastFailureReason = null;
          dbSubscription.paymentFailures.lastFailureCode = null;
          
          // Solo actualizar accountStatus, NO tocar status ni plan
          if (dbSubscription.accountStatus !== 'active') {
            const previousStatus = dbSubscription.accountStatus;
            dbSubscription.accountStatus = 'active';
            
            // Agregar al historial
            dbSubscription.statusHistory.push({
              status: 'payment_recovered',
              changedAt: new Date(),
              reason: `Pago recuperado después de ${previousStatus}`,
              triggeredBy: 'payment_webhook'
            });
            
            // Resetear estado de recuperación
            if (dbSubscription.paymentRecovery) {
              dbSubscription.paymentRecovery.inRecovery = false;
              dbSubscription.paymentRecovery.recoveredAt = new Date();
            }
          }
          
          await dbSubscription.save();
          logger.info(`Suscripción actualizada a estado activo`);
          
          // Enviar email de recuperación de pago
          const user = await dbSubscription.populate('user');
          if (user && user.user) {
            try {
              await emailService.sendPaymentEmail(user.user, 'paymentRecovered', {
                planName: dbSubscription.plan || 'standard',
                nextBillingDate: new Date(dbSubscription.currentPeriodEnd).toLocaleDateString('es-ES')
              });
              logger.info(`Email de recuperación de pago enviado a ${user.user.email}`);
            } catch (emailError) {
              logger.error('Error enviando email de recuperación:', emailError);
            }
          } else {
            logger.warn(`No se encontró usuario para la suscripción ${dbSubscription._id}`);
          }
        } else {
          logger.info(`[SKIP] Pago normal (no es recuperación) - No hay fallos previos para procesar`);
        }
      } else {
        logger.warn(`[NOT_FOUND] Suscripción ${invoice.subscription} no encontrada en la base de datos`);
        
        // Intentar buscar por customerId
        const byCustomer = await Subscription.findOne({ stripeCustomerId: invoice.customer });
        if (byCustomer) {
          logger.info(`Encontrada suscripción por customerId: ${byCustomer._id}, pero el ID de suscripción no coincide`);
          logger.info(`Expected: ${invoice.subscription}, Found: ${byCustomer.stripeSubscriptionId}`);
        }
      }
    } catch (error) {
      logger.error('Error procesando pago de factura:', error);
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
  const Subscription = require('../models/Subscription');
  const User = require('../models/User');
  const Folder = require('../models/Folder');
  const Calculator = require('../models/Calculator');
  const Contact = require('../models/Contact');

  logger.error(`Pago de factura fallido: ${invoice.id}`);
  logger.error(`Razón: ${invoice.last_payment_error?.message || 'Desconocida'}`);

  try {
    // Obtener la suscripción asociada
    const subscription = await Subscription.findOne({ 
      stripeSubscriptionId: invoice.subscription 
    });
    
    if (!subscription) {
      logger.error(`Subscription not found for invoice ${invoice.id}`);
      return;
    }

    // IMPORTANTE: No procesar si la suscripción ya está cancelada
    if (subscription.status === 'canceled') {
      logger.info(`[SKIP] Suscripción ${invoice.subscription} ya está cancelada`);
      return;
    }
    
    // IMPORTANTE: No interferir si hay un período de gracia de downgrade activo
    if (subscription.downgradeGracePeriod && subscription.downgradeGracePeriod.expiresAt > new Date()) {
      logger.info(`[SKIP] Suscripción tiene período de gracia de downgrade activo hasta ${subscription.downgradeGracePeriod.expiresAt}`);
      return;
    }
    
    // NUEVO: Validar que no sea un plan gratuito
    const planConfig = await PlanConfig.findOne({ planId: subscription.plan });
    if (planConfig && planConfig.pricingInfo.basePrice === 0) {
      logger.warn(`[SKIP] Ignorando pago fallido para plan gratuito: ${subscription.plan}`);
      return;
    }
    
    // Incrementar contador de fallos
    subscription.paymentFailures.count += 1;
    
    // Registrar detalles del fallo
    if (!subscription.paymentFailures.firstFailedAt) {
      subscription.paymentFailures.firstFailedAt = new Date();
    }
    subscription.paymentFailures.lastFailedAt = new Date();
    subscription.paymentFailures.lastFailureReason = invoice.last_payment_error?.message || 'Unknown error';
    subscription.paymentFailures.lastFailureCode = invoice.last_payment_error?.code;
    subscription.paymentFailures.nextRetryAt = invoice.next_payment_attempt ? new Date(invoice.next_payment_attempt * 1000) : null;

    // Obtener usuario
    const user = await User.findById(subscription.user);
    
    // Lógica basada en número de intentos fallidos
    switch (subscription.paymentFailures.count) {
      case 1:
        // Primer fallo - Email informativo
        subscription.accountStatus = 'at_risk';
        
        if (!subscription.paymentFailures.notificationsSent.firstWarning.sent) {
          // Generar URL dinámica del Customer Portal de Stripe
          const updatePaymentUrl = await generateUpdatePaymentUrl(
            subscription.stripeCustomerId,
            `${process.env.BASE_URL}/billing/payment-updated`
          );

          await emailService.sendPaymentFailedEmail(user.email, {
            userName: user.firstName || user.name || user.email.split('@')[0],
            planName: getPlanNameFromPriceId(subscription.stripePriceId),
            amount: invoice.amount_due / 100,
            currency: invoice.currency.toUpperCase(),
            nextRetryDate: subscription.paymentFailures.nextRetryAt,
            failureReason: subscription.paymentFailures.lastFailureReason,
            updatePaymentUrl
          }, 'first');
          
          subscription.paymentFailures.notificationsSent.firstWarning = {
            sent: true,
            sentAt: new Date()
          };
        }
        break;

      case 2:
        // Segundo fallo - Advertencia
        if (!subscription.paymentFailures.notificationsSent.secondWarning.sent) {
          const currentUsage = await calculateCurrentUsage(user._id);
          
          await emailService.sendPaymentFailedEmail(user.email, {
            userName: user.firstName || user.name || user.email.split('@')[0],
            planName: getPlanNameFromPriceId(subscription.stripePriceId),
            daysUntilSuspension: 3,
            currentUsage,
            updatePaymentUrl: await generateUpdatePaymentUrl(
              subscription.stripeCustomerId,
              `${process.env.BASE_URL}/billing/payment-updated`
            )
          }, 'second');
          
          subscription.paymentFailures.notificationsSent.secondWarning = {
            sent: true,
            sentAt: new Date()
          };
        }
        break;

      case 3:
        // Tercer fallo - Advertencia final + Suspensión parcial
        subscription.accountStatus = 'suspended';
        
        if (!subscription.paymentFailures.notificationsSent.finalWarning.sent) {
          // Obtener características dinámicamente desde PlanConfig
          const affectedFeatures = await getPremiumFeaturesFromConfig(subscription.plan);
          
          await emailService.sendPaymentFailedEmail(user.email, {
            userName: user.firstName || user.name || user.email.split('@')[0],
            planName: getPlanNameFromPriceId(subscription.stripePriceId),
            suspensionDate: new Date(),
            affectedFeatures,
            updatePaymentUrl: await generateUpdatePaymentUrl(
              subscription.stripeCustomerId,
              `${process.env.BASE_URL}/billing/payment-updated`
            )
          }, 'final');
          
          subscription.paymentFailures.notificationsSent.finalWarning = {
            sent: true,
            sentAt: new Date()
          };
        }

        // Suspender características premium pero mantener acceso básico
        await suspendPremiumFeatures(user._id);
        break;

      case 4:
      default:
        // Cuarto fallo o más - Activar período de gracia
        subscription.accountStatus = 'grace_period';
        
        // Activar período de gracia similar a una cancelación
        subscription.downgradeGracePeriod = {
          previousPlan: subscription.plan,
          targetPlan: 'free',
          expiresAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 días
          autoArchiveScheduled: true,
          reminderSent: false,
          reminder3DaysSent: false,
          reminder1DaySent: false,
          immediateCancel: false,
          calculatedFrom: 'payment_failed'
        };

        if (!subscription.paymentFailures.notificationsSent.suspensionNotice.sent) {
          const itemsToArchive = await calculateItemsToArchive(user._id, subscription.plan);
          
          // Generar URL del portal para actualizar pago
          const updatePaymentUrl = await generateUpdatePaymentUrl(
            subscription.stripeCustomerId,
            `${process.env.BASE_URL}/billing/payment-updated`
          );
          
          await emailService.sendPaymentFailedEmail(user.email, {
            userName: user.firstName || user.name || user.email.split('@')[0],
            planName: getPlanNameFromPriceId(subscription.stripePriceId),
            gracePeriodEndDate: subscription.downgradeGracePeriod.expiresAt,
            itemsToArchive,
            updatePaymentUrl,
            supportEmail: process.env.SUPPORT_EMAIL || 'support@company.com'
          }, 'suspension');
          
          subscription.paymentFailures.notificationsSent.suspensionNotice = {
            sent: true,
            sentAt: new Date()
          };
        }
        break;
    }

    // Agregar al histórico
    subscription.statusHistory.push({
      status: subscription.accountStatus,
      reason: `Payment failed - Attempt ${subscription.paymentFailures.count}`,
      triggeredBy: 'webhook'
    });

    // Guardar cambios
    await subscription.save();

    // Log para monitoreo
    logger.warn(`Payment failed for subscription ${subscription._id}`, {
      userId: user._id,
      attemptNumber: subscription.paymentFailures.count,
      newStatus: subscription.accountStatus,
      failureCode: subscription.paymentFailures.lastFailureCode
    });

  } catch (error) {
    logger.error('Error handling payment failed webhook:', error);
    throw error;
  }
}

// Funciones auxiliares para manejo de pagos fallidos
async function calculateCurrentUsage(userId) {
  const Folder = require('../models/Folder');
  const Calculator = require('../models/Calculator');
  const Contact = require('../models/Contact');
  
  const [folders, calculators, contacts] = await Promise.all([
    Folder.countDocuments({ userId, archived: false }),
    Calculator.countDocuments({ userId, archived: false }),
    Contact.countDocuments({ userId, archived: false })
  ]);

  return { folders, calculators, contacts };
}

// Obtener características del plan desde PlanConfig
async function getPremiumFeaturesFromConfig(planId) {
  try {
    const planConfig = await PlanConfig.findOne({ planId: planId.toLowerCase() });
    
    if (!planConfig) {
      logger.warn(`PlanConfig no encontrado para planId: ${planId}`);
      return [];
    }
    
    // Retornar solo las características habilitadas
    return planConfig.features
      .filter(feature => feature.enabled)
      .map(feature => feature.description || feature.name);
      
  } catch (error) {
    logger.error('Error obteniendo características del plan:', error);
    return [];
  }
}

// Mantener función legacy para compatibilidad
function getPremiumFeatures(planName) {
  // Esta función se mantiene por compatibilidad pero se recomienda usar getPremiumFeaturesFromConfig
  const features = {
    'standard': [
      'Exportación de reportes',
      'Operaciones masivas',
      'Gestor de agenda',
      'Gestor de citas',
      'Vinculación de causas'
    ],
    'premium': [
      'Análisis avanzados',
      'Exportación de reportes',
      'Automatización de tareas',
      'Operaciones masivas',
      'Soporte prioritario',
      'Gestor de agenda',
      'Gestor de citas',
      'Vinculación de causas'
    ]
  };
  
  return features[planName] || [];
}

async function suspendPremiumFeatures(userId) {
  const User = require('../models/User');
  
  // Marcar al usuario con acceso limitado
  await User.findByIdAndUpdate(userId, {
    'subscription.suspended': true,
    'subscription.suspendedAt': new Date()
  });
}

async function calculateItemsToArchive(userId, currentPlan) {
  const Folder = require('../models/Folder');
  const Calculator = require('../models/Calculator');
  const Contact = require('../models/Contact');
  
  // Obtener límites del plan FREE desde PlanConfig
  const freeLimits = await getPlanLimitsFromConfig('free');
  
  // Contar elementos activos
  const [activeFolders, activeCalculators, activeContacts] = await Promise.all([
    Folder.countDocuments({ userId, archived: false }),
    Calculator.countDocuments({ userId, archived: false }),
    Contact.countDocuments({ userId, archived: false })
  ]);
  
  return {
    folders: Math.max(0, activeFolders - freeLimits.maxFolders),
    calculators: Math.max(0, activeCalculators - freeLimits.maxCalculators),
    contacts: Math.max(0, activeContacts - freeLimits.maxContacts)
  };
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

// Obtener límites del plan desde PlanConfig
async function getPlanLimitsFromConfig(planId) {
  try {
    const planConfig = await PlanConfig.findOne({ planId: planId.toLowerCase() });
    
    if (!planConfig) {
      logger.warn(`PlanConfig no encontrado para planId: ${planId}`);
      // Retornar límites por defecto (free)
      return { maxFolders: 5, maxCalculators: 3, maxContacts: 10, maxStorage: 50 };
    }
    
    const limits = {};
    planConfig.resourceLimits.forEach(limit => {
      switch(limit.name) {
        case 'folders':
          limits.maxFolders = limit.limit;
          break;
        case 'calculators':
          limits.maxCalculators = limit.limit;
          break;
        case 'contacts':
          limits.maxContacts = limit.limit;
          break;
        case 'storage':
          limits.maxStorage = limit.limit;
          break;
      }
    });
    
    return limits;
  } catch (error) {
    logger.error('Error obteniendo límites del plan:', error);
    // Retornar límites por defecto en caso de error
    return { maxFolders: 5, maxCalculators: 3, maxContacts: 10, maxStorage: 50 };
  }
}

// Mantener función legacy para compatibilidad
function getPlanLimits(planName) {
  // Esta función se mantiene por compatibilidad pero se recomienda usar getPlanLimitsFromConfig
  const limits = {
    'Gratuito': {
      maxFolders: 5, maxCalculators: 3, maxContacts: 10
    },
    'Estándar': {
      maxFolders: 50, maxCalculators: 20, maxContacts: 100
    },
    'Premium': {
      maxFolders: 500, maxCalculators: 200, maxContacts: 1000
    }
  };

  return limits[planName] || limits['Gratuito'];
}

// La función testWebhook ya está definida arriba en la línea 15