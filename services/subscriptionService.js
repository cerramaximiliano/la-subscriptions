const Subscription = require('../models/Subscription');
const User = require('../models/User');
const logger = require('../utils/logger');
const emailService = require('./emailService');

let planMapping = {};

/**
 * Cargar mapping de planes desde la base de datos
 */
async function loadPlanMapping() {
  try {
    const PlanConfig = require('../models/PlanConfig');
    const configs = await PlanConfig.find({ isActive: true });

    planMapping = {};
    configs.forEach(config => {
      planMapping[config.stripePriceId] = config.planId;
    });

    logger.info('Plan mapping cargado:', planMapping);
    return planMapping;
  } catch (error) {
    logger.error('Error cargando plan mapping:', error);
    // Fallback a valores por defecto si falla
    planMapping = {
      [process.env.STRIPE_PRICE_FREE || 'price_free']: SUBSCRIPTION_PLANS.FREE,
      [process.env.STRIPE_PRICE_STANDARD || 'price_standard']:
        SUBSCRIPTION_PLANS.STANDARD,
      [process.env.STRIPE_PRICE_PREMIUM || 'price_premium']:
        SUBSCRIPTION_PLANS.PREMIUM
    };
    return planMapping;
  }
}

/**
 * Obtener el plan desde un price ID
 */
async function getPlanFromPriceId(priceId) {
  // Si el mapping está vacío, cargarlo
  if (Object.keys(planMapping).length === 0) {
    await loadPlanMapping();
  }

  return planMapping[priceId] || SUBSCRIPTION_PLANS.FREE;
}

/**
 * Actualizar el mapping cuando se detecte un nuevo price ID
 */
async function updatePlanMapping(priceId, planId) {
  try {
    planMapping[priceId] = planId;
    logger.info(`Plan mapping actualizado: ${priceId} → ${planId}`);
  } catch (error) {
    logger.error('Error actualizando plan mapping:', error);
  }
}


const SUBSCRIPTION_PLANS = {
  FREE: 'free',
  STANDARD: 'standard',
  PREMIUM: 'premium'
};




/**
 * Obtener límites según el plan
 */
function getPlanLimits(plan) {
  const limits = {
    [SUBSCRIPTION_PLANS.FREE]: {
      maxFolders: 5,
      maxCalculators: 3,
      maxContacts: 10,
      storageLimit: 50
    },
    [SUBSCRIPTION_PLANS.STANDARD]: {
      maxFolders: 50,
      maxCalculators: 20,
      maxContacts: 100,
      storageLimit: 1024
    },
    [SUBSCRIPTION_PLANS.PREMIUM]: {
      maxFolders: 999999,
      maxCalculators: 999999,
      maxContacts: 999999,
      storageLimit: 10240
    }
  };

  return limits[plan] || limits[SUBSCRIPTION_PLANS.FREE];
}


/**
 * Contar recursos activos de un usuario
 */
async function getResourceCounts(userId) {
  const Folder = require('../models/Folder');
  const Calculator = require('../models/Calculator');
  const Contact = require('../models/Contact');

  const [folders, calculators, contacts] = await Promise.all([
    Folder.countDocuments({ userId: userId, archived: false }),
    Calculator.countDocuments({ userId: userId, archived: false }),
    Contact.countDocuments({ userId: userId, archived: false })
  ]);

  return { folders, calculators, contacts };
}


/**
* Archivar carpetas excedentes
*/
async function archiveFolders(userId, maxAllowed) {
  const Folder = require('../models/Folder');

  try {
    // Contar carpetas activas
    const activeCount = await Folder.countDocuments({
      userId: userId,
      archived: false
    });

    if (activeCount <= maxAllowed) {
      return 0; // No hay exceso
    }

    const toArchive = activeCount - maxAllowed;

    // Obtener las carpetas más antiguas para archivar
    const foldersToArchive = await Folder.find({
      userId: userId,
      archived: false
    })
      .sort({ createdAt: 1 }) // Más antiguas primero
      .limit(toArchive)
      .select('_id');

    // Archivar las carpetas
    const result = await Folder.updateMany(
      { _id: { $in: foldersToArchive.map(f => f._id) } },
      {
        $set: {
          archived: true,
          archivedAt: new Date(),
          archivedReason: 'Plan downgrade - automatic archiving'
        }
      }
    );

    logger.info(`Archivadas ${result.modifiedCount} carpetas para usuario ${userId}`);
    return result.modifiedCount;

  } catch (error) {
    logger.error(`Error archivando carpetas para usuario ${userId}:`, error);
    throw error;
  }
}

/**
 * Archivar calculadoras excedentes
 */
async function archiveCalculators(userId, maxAllowed) {
  const Calculator = require('../models/Calculator');

  try {
    const activeCount = await Calculator.countDocuments({
      userId: userId,
      archived: false
    });

    if (activeCount <= maxAllowed) {
      return 0;
    }

    const toArchive = activeCount - maxAllowed;

    const calculatorsToArchive = await Calculator.find({
      userId: userId,
      archived: false
    })
      .sort({ createdAt: 1 })
      .limit(toArchive)
      .select('_id');

    const result = await Calculator.updateMany(
      { _id: { $in: calculatorsToArchive.map(c => c._id) } },
      {
        $set: {
          archived: true,
          archivedAt: new Date(),
          archivedReason: 'Plan downgrade - automatic archiving'
        }
      }
    );

    logger.info(`Archivadas ${result.modifiedCount} calculadoras para usuario 
  ${userId}`);
    return result.modifiedCount;

  } catch (error) {
    logger.error(`Error archivando calculadoras para usuario ${userId}:`, error);
    throw error;
  }
}

/**
 * Archivar contactos excedentes
 */
async function archiveContacts(userId, maxAllowed) {
  const Contact = require('../models/Contact');

  try {
    const activeCount = await Contact.countDocuments({
      userId: userId,
      archived: false
    });

    if (activeCount <= maxAllowed) {
      return 0;
    }

    const toArchive = activeCount - maxAllowed;

    const contactsToArchive = await Contact.find({
      userId: userId,
      archived: false
    })
      .sort({ createdAt: 1 })
      .limit(toArchive)
      .select('_id');

    const result = await Contact.updateMany(
      { _id: { $in: contactsToArchive.map(c => c._id) } },
      {
        $set: {
          archived: true,
          archivedAt: new Date(),
          archivedReason: 'Plan downgrade - automatic archiving'
        }
      }
    );

    logger.info(`Archivados ${result.modifiedCount} contactos para usuario 
  ${userId}`);
    return result.modifiedCount;

  } catch (error) {
    logger.error(`Error archivando contactos para usuario ${userId}:`, error);
    throw error;
  }
}



/**
  * Realizar archivado automático para un usuario
  */
async function performAutoArchiving(userId, targetPlan) {
  try {
    const limits = getPlanLimits(targetPlan);

    logger.info(`Iniciando archivado automático para usuario ${userId}`);
    logger.info(`Plan destino: ${targetPlan}, Límites: ${JSON.stringify(limits)}`);

    // Obtener conteos actuales
    const currentCounts = await getResourceCounts(userId);
    logger.info(`Recursos actuales: ${JSON.stringify(currentCounts)}`);

    // Archivar excedentes
    const [foldersArchived, calculatorsArchived, contactsArchived] = await
      Promise.all([
        archiveFolders(userId, limits.maxFolders),
        archiveCalculators(userId, limits.maxCalculators),
        archiveContacts(userId, limits.maxContacts)
      ]);

    const totalArchived = foldersArchived + calculatorsArchived + contactsArchived;

    logger.info(`Archivado completado para usuario ${userId}:`);
    logger.info(`- Carpetas: ${foldersArchived}`);
    logger.info(`- Calculadoras: ${calculatorsArchived}`);
    logger.info(`- Contactos: ${contactsArchived}`);
    logger.info(`- Total: ${totalArchived} elementos`);

    return {
      foldersArchived,
      calculatorsArchived,
      contactsArchived,
      totalArchived,
      targetPlan,
      limits
    };

  } catch (error) {
    logger.error(`Error en archivado automático para usuario ${userId}:`, error);
    throw error;
  }
}


/**
 * Maneja eventos de suscripción de Stripe
 */
exports.handleSubscriptionEvent = async (event) => {
  const stripeSubscription = event.data.object;

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(stripeSubscription);
        break;

      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(stripeSubscription);
        break;

      default:
        logger.warn(`Evento de suscripción no manejado: ${event.type}`);
    }
  } catch (error) {
    logger.error(`Error handling subscription event ${event.type}:`, error);
    throw error;
  }
};

/**
 * Maneja la creación o actualización de una suscripción
 */
exports.handleSubscriptionUpdated = async (stripeSubscription) => {
  try {
    // Buscar suscripción existente
    let subscription = await Subscription.findOne({
      stripeCustomerId: stripeSubscription.customer
    });

    if (!subscription) {
      // Buscar usuario por stripeCustomerId o email
      let user = await User.findOne({ stripeCustomerId: stripeSubscription.customer });

      if (!user && stripeSubscription.customer_email) {
        user = await User.findOne({ email: stripeSubscription.customer_email });
        if (user) {
          // Actualizar el stripeCustomerId del usuario
          user.stripeCustomerId = stripeSubscription.customer;
          await user.save();
        }
      }

      if (!user) {
        throw new Error(`Usuario no encontrado para cliente Stripe: ${stripeSubscription.customer}`);
      }

      // Crear nueva suscripción
      subscription = new Subscription({
        user: user._id,
        stripeCustomerId: stripeSubscription.customer
      });
    }

    // Obtener el plan del primer item de la suscripción
    const priceId = stripeSubscription.items.data[0]?.price?.id;
    const plan = await getPlanFromPriceId(priceId);

    // Guardar el plan anterior para detectar cambios
    const previousPlan = subscription.plan;
    const previousStatus = subscription.status;

    // Actualizar datos de la suscripción
    subscription.stripeSubscriptionId = stripeSubscription.id;
    subscription.stripePriceId = priceId;
    subscription.plan = plan;
    subscription.status = stripeSubscription.status;
    subscription.currentPeriodStart = new Date(stripeSubscription.current_period_start * 1000);
    subscription.currentPeriodEnd = new Date(stripeSubscription.current_period_end * 1000);
    subscription.cancelAtPeriodEnd = stripeSubscription.cancel_at_period_end || false;

    // Si hay fecha de cancelación
    if (stripeSubscription.canceled_at) {
      subscription.canceledAt = new Date(stripeSubscription.canceled_at * 1000);
    }

    // Si se programó cancelación al final del período
    if (stripeSubscription.cancel_at_period_end && !subscription.canceledAt) {
      subscription.canceledAt = new Date(); // Marcar cuando se solicitó la cancelación
    }

    // Actualizar características del plan
    subscription.updatePlanFeatures();

    // Detectar cambios de plan para manejar downgrades
    if (previousPlan !== plan && previousPlan && plan) {
      const planHierarchy = {
        [SUBSCRIPTION_PLANS.FREE]: 0,
        [SUBSCRIPTION_PLANS.STANDARD]: 1,
        [SUBSCRIPTION_PLANS.PREMIUM]: 2
      };

      const isDowngrade = planHierarchy[plan] < planHierarchy[previousPlan];

      if (isDowngrade && plan !== SUBSCRIPTION_PLANS.FREE) {
        // Downgrade entre planes pagos (ej: Premium → Standard)
        logger.info(`Downgrade detectado: ${previousPlan} → ${plan}`);

        subscription.downgradeGracePeriod = {
          previousPlan: previousPlan,
          targetPlan: plan, // Plan destino (no siempre FREE)
          expiresAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
          autoArchiveScheduled: true,
          immediateCancel: false
        };

        logger.info(`Período de gracia activado para downgrade a ${plan}`);
      }
    }


    // Guardar cambios
    await subscription.save();

    // Actualizar usuario
    await User.findByIdAndUpdate(subscription.user, {
      subscriptionPlan: plan,
      subscriptionId: subscription._id
    });

    // Log de cambios importantes
    if (previousPlan !== plan) {
      logger.info(`Plan cambiado para usuario 
  ${subscription.user}: ${previousPlan} → ${plan}`);
    }

    if (previousStatus !== subscription.status) {
      logger.info(`Estado cambiado para usuario 
  ${subscription.user}: ${previousStatus} → 
  ${subscription.status}`);
    }

    if (subscription.cancelAtPeriodEnd) {
      logger.info(`Suscripción programada para cancelar el 
  ${subscription.currentPeriodEnd} para usuario 
  ${subscription.user}`);
    }

    logger.info(`Suscripción actualizada: ${subscription._id} - Plan: ${plan} - Estado: ${subscription.status}`);

    return subscription;
  } catch (error) {
    logger.error('Error en handleSubscriptionUpdated:', error);
    throw error;
  }
};

/**
 * Maneja la eliminación/cancelación inmediata de una suscripción
 */
exports.handleSubscriptionDeleted = async (stripeSubscription) => {
  try {
    const subscription = await Subscription.findOne({
      stripeCustomerId: stripeSubscription.customer
    });

    if (!subscription) {
      logger.error(`Suscripción no encontrada para cliente ${stripeSubscription.customer}`);
      return;
    }

    const previousPlan = subscription.plan;

    // Cambiar a plan FREE con período de gracia
    subscription.plan = SUBSCRIPTION_PLANS.FREE;
    subscription.status = 'canceled';
    subscription.canceledAt = new Date();

    // Para cancelación inmediata, el período de gracia SÍ debe ser desde ahora
    // porque el usuario ya no tiene acceso al servicio premium
    const gracePeriodEnd = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);

    subscription.downgradeGracePeriod = {
      previousPlan: previousPlan,
      expiresAt: gracePeriodEnd,
      autoArchiveScheduled: true,
      immediateCancel: true // Marcador para distinguir de cancelAtPeriodEnd
    };

    // Actualizar características del plan FREE
    subscription.updatePlanFeatures();
    await subscription.save();

    // Actualizar usuario
    await User.findByIdAndUpdate(subscription.user, {
      subscriptionPlan: SUBSCRIPTION_PLANS.FREE
    });

    logger.info(`Suscripción cancelada inmediatamente: ${subscription._id}`);
    logger.info(`Período de gracia hasta: ${gracePeriodEnd.toLocaleDateString('es-ES')}`);

    // Enviar email de notificación sobre cancelación inmediata
    try {
      // Obtener el usuario para el email
      const User = require('../models/User');
      const user = await User.findById(subscription.user);

      if (user) {
        await emailService.sendSubscriptionEmail(user, 'immediatelyCanceled', {
          previousPlan: previousPlan,
          immediate: true,
          gracePeriodEnd: gracePeriodEnd.toLocaleDateString('es-ES'),
          // Información adicional útil
          foldersLimit: 5,
          calculatorsLimit: 3,
          contactsLimit: 10
        });

        logger.info(`Email de cancelación inmediata enviado a ${user.email}`);
      }
    } catch (emailError) {
      logger.error('Error enviando email de cancelación inmediata:', emailError);
      // No lanzar error para no interrumpir el proceso principal
    }

    return subscription;

  } catch (error) {
    logger.error('Error en handleSubscriptionDeleted:', error);
    throw error;
  }
};

/**
 * Verifica y procesa suscripciones que han expirado 
(cancelAtPeriodEnd = true)
 * Esta función debe ejecutarse diariamente vía cron job
 */
exports.checkExpiredSubscriptions = async () => {
  try {
    const now = new Date();
    let processedCount = 0;

    // Buscar suscripciones que:
    // 1. Están programadas para cancelar (cancelAtPeriodEnd = true)
    // 2. Ya pasó su fecha de fin de período
    // 3. Todavía no son plan FREE
    // 4. No tienen un período de gracia activo
    const expiredSubscriptions = await Subscription.find({
      cancelAtPeriodEnd: true,
      currentPeriodEnd: { $lt: now },
      plan: { $ne: SUBSCRIPTION_PLANS.FREE },
      $or: [
        { 'downgradeGracePeriod.expiresAt': { $exists: false } },
        { 'downgradeGracePeriod.expiresAt': { $lt: now } }  // También incluir períodos expirados
      ]
    }).populate('user', 'email firstName lastName');

    logger.info(`Encontradas ${expiredSubscriptions.length} suscripciones expiradas para procesar`);

    for (const subscription of expiredSubscriptions) {
      try {
        const previousPlan = subscription.plan;

        // Cambiar a plan FREE
        subscription.plan = SUBSCRIPTION_PLANS.FREE;
        subscription.status = 'canceled';

        // Calcular período de gracia desde el fin del período de suscripción
        const gracePeriodStart = new Date(subscription.currentPeriodEnd);
        const gracePeriodEnd = new Date(gracePeriodStart.getTime() + 15 * 24 * 60 * 60 * 1000);

        // Si el período de gracia ya expiró, usar fecha actual + 15 días
        const now = new Date();
        const finalGracePeriodEnd = gracePeriodEnd > now ? gracePeriodEnd : new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);

        // Configurar período de gracia
        subscription.downgradeGracePeriod = {
          previousPlan: previousPlan,
          expiresAt: finalGracePeriodEnd, // ✅ 15 días desde el fin del período O desde hoy si ya pasó
          autoArchiveScheduled: true,
          calculatedFrom: gracePeriodEnd > now ? 'periodEnd' : 'today' // Para debugging
        };

        logger.info(`Período de gracia calculado desde: ${subscription.downgradeGracePeriod.calculatedFrom}`);

        // Actualizar características del plan
        subscription.updatePlanFeatures();
        await subscription.save();

        // Actualizar usuario
        await User.findByIdAndUpdate(subscription.user, {
          subscriptionPlan: SUBSCRIPTION_PLANS.FREE
        });

        processedCount++;

        logger.info(`Suscripción expirada procesada: 
  ${subscription._id}`);
        logger.info(`Usuario: ${subscription.user._id} 
  (${subscription.user.email})`);
        logger.info(`Plan anterior: ${previousPlan} → FREE`);
        logger.info(`Período de gracia hasta: 
  ${subscription.downgradeGracePeriod.expiresAt}`);

        // TODO: Enviar email de notificación

      } catch (error) {
        logger.error(`Error procesando suscripción expirada ${subscription._id}:`, error);
      }
    }

    logger.info(`Procesadas ${processedCount} suscripciones expiradas`);
    return processedCount;
  } catch (error) {
    logger.error('Error en checkExpiredSubscriptions:', error);
    throw error;
  }
};

/**
 * Procesa períodos de gracia que han vencido
 * Esta función debe ejecutarse diariamente vía cron job
 */
exports.processExpiredGracePeriods = async () => {
  try {
    const now = new Date();
    let processedCount = 0;

    // Buscar suscripciones con períodos de gracia vencidos
    const expiredGracePeriods = await Subscription.find({
      'downgradeGracePeriod.expiresAt': { $lt: now },
      'downgradeGracePeriod.autoArchiveScheduled': true
    }).populate('user', 'email firstName lastName');

    logger.info(`Encontrados ${expiredGracePeriods.length} períodos de gracia vencidos`);

    for (const subscription of expiredGracePeriods) {
      try {
        // TODO: Implementar lógica de archivado automático aquí
        // Por ejemplo:
        // - Archivar carpetas excedentes
        // - Archivar calculadoras excedentes
        // - Archivar contactos excedentes

        const targetPlan = subscription.downgradeGracePeriod.targetPlan || SUBSCRIPTION_PLANS.FREE;

        logger.info(`Procesando período de gracia vencido para usuario ${subscription.user._id}`);
        logger.info(`Plan anterior: ${subscription.downgradeGracePeriod.previousPlan}`);


        const targetLimits = getPlanLimits(targetPlan);


        // Realizar archivado automático
        const archiveResult = await performAutoArchiving(subscription.user._id,
          targetPlan);

        // Marcar como procesado
        subscription.downgradeGracePeriod.autoArchiveScheduled = false;
        subscription.downgradeGracePeriod.processedAt = new Date();
        await subscription.save();

        // Enviar email de notificación
        if (subscription.user && archiveResult.totalArchived > 0) {
          await emailService.sendSubscriptionEmail(subscription.user,
            'gracePeriodExpired', {
            previousPlan: subscription.downgradeGracePeriod.previousPlan,
            targetPlan: targetPlan,
            foldersArchived: archiveResult.foldersArchived,
            calculatorsArchived: archiveResult.calculatorsArchived,
            contactsArchived: archiveResult.contactsArchived,
            totalArchived: archiveResult.totalArchived,
            planLimits: archiveResult.limits
          });

          logger.info(`Email de archivado enviado a ${subscription.user.email}`);
        }

        processedCount++;

        logger.info(`Período de gracia procesado para suscripción ${subscription._id}`);

      } catch (error) {
        logger.error(`Error procesando período de gracia para 
  ${subscription._id}:`, error);
      }
    }

    logger.info(`Procesados ${processedCount} períodos de gracia 
  vencidos`);
    return processedCount;
  } catch (error) {
    logger.error('Error en processExpiredGracePeriods:', error);
    throw error;
  }
};

/**
 * Obtiene la suscripción de un usuario
 */
exports.getUserSubscription = async (userId) => {
  try {
    const subscription = await Subscription.findOne({
      user: userId
    })
      .populate('user', 'email firstName lastName');

    if (!subscription) {
      // Crear suscripción FREE por defecto si no existe
      const newSubscription = new Subscription({
        user: userId,
        plan: SUBSCRIPTION_PLANS.FREE
      });

      newSubscription.updatePlanFeatures();
      await newSubscription.save();

      // Actualizar usuario
      await User.findByIdAndUpdate(userId, {
        subscriptionPlan: SUBSCRIPTION_PLANS.FREE,
        subscriptionId: newSubscription._id
      });

      return newSubscription;
    }

    return subscription;
  } catch (error) {
    logger.error('Error en getUserSubscription:', error);
    throw error;
  }
};

/**
 * Función helper para crear una suscripción desde checkout 
session
 */
exports.handleSubscriptionCreated = async (stripeSubscription) => {
  // Reutilizar la lógica de handleSubscriptionUpdated
  return this.handleSubscriptionUpdated(stripeSubscription);
};

// Exportar constantes útiles
exports.SUBSCRIPTION_PLANS = SUBSCRIPTION_PLANS;
exports.loadPlanMapping = loadPlanMapping;
exports.getPlanFromPriceId = getPlanFromPriceId;