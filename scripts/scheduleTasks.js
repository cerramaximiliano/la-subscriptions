const cron = require('node-cron');
const logger = require('../utils/logger');
const subscriptionService =
  require('../services/subscriptionService');
const emailService = require('../services/emailService');

/**
 * Configurar todas las tareas programadas
 */
function setupScheduledTasks() {
  logger.info('⏰ Configurando tareas programadas...');

  // Tarea 1: Verificar suscripciones expiradas (diariamente a las 2:00 AM)
  cron.schedule('0 2 * * *', async () => {
    logger.info('===== INICIO: Verificación de suscripciones expiradas =====');
    try {
      const processedCount = await
        subscriptionService.checkExpiredSubscriptions();
      logger.info(`✅ Suscripciones expiradas procesadas: 
  ${processedCount}`);
    } catch (error) {
      logger.error('❌ Error verificando suscripciones expiradas:', error);
    }
    logger.info('===== FIN: Verificación de suscripciones expiradas =====');
  }, {
    scheduled: true,
    timezone: process.env.TZ || 'America/Sao_Paulo'
  });

  // Tarea 2: Procesar períodos de gracia vencidos (diariamente a las 2:30 AM)
  cron.schedule('30 2 * * *', async () => {
    logger.info('===== INICIO: Procesamiento de períodos de graciavencidos =====');
    try {
      const processedCount = await
        subscriptionService.processExpiredGracePeriods();
      logger.info(`✅ Períodos de gracia procesados: 
  ${processedCount}`);
    } catch (error) {
      logger.error('❌ Error procesando períodos de gracia:', error);
    }
    logger.info('===== FIN: Procesamiento de períodos de gracia vencidos =====');
  }, {
    scheduled: true,
    timezone: process.env.TZ || 'America/Sao_Paulo'
  });

  // Tarea 3: Enviar recordatorios de período de gracia (diariamente a las 10:00 AM)
  cron.schedule('0 10 * * *', async () => {
    logger.info('===== INICIO: Envío de recordatorios de período de gracia =====');
    try {
      await emailService.sendGracePeriodReminders();
      logger.info('✅ Recordatorios de período de gracia enviados');
    } catch (error) {
      logger.error('❌ Error enviando recordatorios:', error);
    }
    logger.info('===== FIN: Envío de recordatorios de período de gracia =====');
  }, {
    scheduled: true,
    timezone: process.env.TZ || 'America/Sao_Paulo'
  });

  // Tarea 4: Sincronización con Stripe (cada 6 horas)
  cron.schedule('0 */6 * * *', async () => {
    logger.info('===== INICIO: Sincronización con Stripe =====');
    try {
      await syncWithStripe();
      logger.info('✅ Sincronización con Stripe completada');
    } catch (error) {
      logger.error('❌ Error sincronizando con Stripe:', error);
    }
    logger.info('===== FIN: Sincronización con Stripe =====');
  }, {
    scheduled: true,
    timezone: process.env.TZ || 'America/Sao_Paulo'
  });

  // Tarea 5: Limpieza de logs antiguos (semanalmente los domingos a las 3:00 AM)
  cron.schedule('0 3 * * 0', async () => {
    logger.info('===== INICIO: Limpieza de logs antiguos =====');
    try {
      await cleanupOldLogs();
      logger.info('✅ Logs antiguos limpiados');
    } catch (error) {
      logger.error('❌ Error limpiando logs:', error);
    }
    logger.info('===== FIN: Limpieza de logs antiguos =====');
  }, {
    scheduled: true,
    timezone: process.env.TZ || 'America/Sao_Paulo'
  });

  // Tarea 6: Health check y monitoreo (cada 5 minutos)
  if (process.env.ENABLE_HEALTH_CHECK === 'true') {
    cron.schedule('*/5 * * * *', async () => {
      try {
        await performHealthCheck();
      } catch (error) {
        logger.error('❌ Health check falló:', error);
      }
    });
  }

  cron.schedule('0 * * * *', async () => {
    try {
      logger.info('Actualizando plan mapping...');
      const subscriptionService = require('../services/subscriptionService');
      await subscriptionService.loadPlanMapping();
      logger.info('✅ Plan mapping actualizado');
    } catch (error) {
      logger.error('Error actualizando plan mapping:', error);
    }
  });

  logger.info('✅ Todas las tareas programadas configuradas exitosamente');
  logScheduledTasks();
}

/**
 * Sincronizar suscripciones con Stripe
 */
async function syncWithStripe() {
  const stripe = require('stripe')(
    process.env.NODE_ENV === 'production'
      ? process.env.STRIPE_SECRET_KEY
      : process.env.STRIPE_SECRET_KEY_TEST
  );

  const Subscription = require('../models/Subscription');

  try {
    // Obtener suscripciones activas en la BD
    const activeSubscriptions = await Subscription.find({
      stripeSubscriptionId: { $exists: true, $ne: null },
      status: { $in: ['active', 'trialing', 'past_due'] }
    }).limit(100); // Limitar para evitar sobrecarga

    logger.info(`Sincronizando ${activeSubscriptions.length} 
  suscripciones con Stripe`);

    let syncedCount = 0;
    let errorCount = 0;

    for (const subscription of activeSubscriptions) {
      try {
        // Obtener datos actualizados de Stripe
        const stripeSubscription = await
          stripe.subscriptions.retrieve(
            subscription.stripeSubscriptionId
          );

        // Verificar si hay cambios importantes
        const needsUpdate =
          subscription.status !== stripeSubscription.status ||
          subscription.cancelAtPeriodEnd !==
          stripeSubscription.cancel_at_period_end ||
          subscription.currentPeriodEnd?.getTime() !==
          stripeSubscription.current_period_end * 1000;

        if (needsUpdate) {
          logger.info(`Actualizando suscripción 
  ${subscription._id} desde Stripe`);
          await
            subscriptionService.handleSubscriptionUpdated(stripeSubscription);
          syncedCount++;
        }

      } catch (error) {
        logger.error(`Error sincronizando suscripción 
  ${subscription._id}:`, error.message);
        errorCount++;
      }
    }

    logger.info(`Sincronización completada: ${syncedCount} 
  actualizadas, ${errorCount} errores`);

  } catch (error) {
    logger.error('Error en sincronización con Stripe:', error);
    throw error;
  }
}

/**
 * Limpiar logs antiguos
 */
async function cleanupOldLogs() {
  const fs = require('fs').promises;
  const path = require('path');

  try {
    const logsDir = path.join(process.cwd(), 'logs');
    const files = await fs.readdir(logsDir);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    let deletedCount = 0;

    for (const file of files) {
      const filePath = path.join(logsDir, file);
      const stats = await fs.stat(filePath);

      if (stats.mtime < thirtyDaysAgo) {
        await fs.unlink(filePath);
        deletedCount++;
        logger.info(`Log eliminado: ${file}`);
      }
    }

    logger.info(`${deletedCount} archivos de log antiguos 
  eliminados`);

  } catch (error) {
    // Si no existe el directorio de logs, no es un error crítico
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

/**
 * Realizar health check del sistema
 */
async function performHealthCheck() {
  const mongoose = require('mongoose');
  const checks = {
    database: false,
    stripe: false,
    ses: false
  };

  // Check MongoDB
  try {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.db.admin().ping();
      checks.database = true;
    }
  } catch (error) {
    logger.error('Health check - MongoDB falló:', error.message);
  }

  // Check Stripe
  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY
      || process.env.STRIPE_SECRET_KEY_TEST);
    await stripe.customers.list({ limit: 1 });
    checks.stripe = true;
  } catch (error) {
    logger.error('Health check - Stripe falló:', error.message);
  }

  // Check AWS SES
  try {
    const sesStats = await emailService.getSESStats();
    if (sesStats) {
      checks.ses = true;
    }
  } catch (error) {
    logger.error('Health check - AWS SES falló:', error.message);
  }

  // Log resultados
  const allHealthy = Object.values(checks).every(check => check
    === true);
  if (allHealthy) {
    logger.debug('✅ Health check: Todos los servicios funcionando correctamente');
  } else {
    logger.warn('⚠️  Health check: Algunos servicios no  responden', checks);
  }

  return checks;
}

/**
 * Mostrar las tareas programadas configuradas
 */
function logScheduledTasks() {
  const tasks = [
    {
      name: 'Verificar suscripciones expiradas', schedule:
        'Diariamente a las 2:00 AM'
    },
    {
      name: 'Procesar períodos de gracia vencidos', schedule:
        'Diariamente a las 2:30 AM'
    },
    {
      name: 'Enviar recordatorios de período de gracia', schedule:
        'Diariamente a las 10:00 AM'
    },
    {
      name: 'Sincronización con Stripe', schedule: 'Cada 6 horas'
    },
    { name: 'Limpieza de logs antiguos', schedule: 'Domingos a las 3:00 AM' },
    {
      name: 'Health check', schedule:
        process.env.ENABLE_HEALTH_CHECK === 'true' ? 'Cada 5 minutos' :
          'Deshabilitado'
    }
  ];

  logger.info('📋 Tareas programadas configuradas:');
  tasks.forEach(task => {
    logger.info(`   - ${task.name}: ${task.schedule}`);
  });
}

/**
 * Ejecutar una tarea manualmente (útil para testing)
 */
async function runTaskManually(taskName) {
  logger.info(`Ejecutando tarea manualmente: ${taskName}`);

  try {
    switch (taskName) {
      case 'checkExpiredSubscriptions':
        await subscriptionService.checkExpiredSubscriptions();
        break;
      case 'processExpiredGracePeriods':
        await subscriptionService.processExpiredGracePeriods();
        break;
      case 'sendGracePeriodReminders':
        await emailService.sendGracePeriodReminders();
        break;
      case 'syncWithStripe':
        await syncWithStripe();
        break;
      case 'cleanupOldLogs':
        await cleanupOldLogs();
        break;
      case 'healthCheck':
        await performHealthCheck();
        break;
      default:
        throw new Error(`Tarea desconocida: ${taskName}`);
    }

    logger.info(`✅ Tarea ${taskName} completada exitosamente`);
  } catch (error) {
    logger.error(`❌ Error ejecutando tarea ${taskName}:`, error);
    throw error;
  }
}

// Exportar funciones
module.exports = {
  setupScheduledTasks,
  runTaskManually,
  syncWithStripe,
  performHealthCheck
};

// Si se ejecuta directamente, permitir ejecutar tareas manualmente
if (require.main === module) {
  const taskName = process.argv[2];

  if (!taskName) {
    console.log('Uso: node scheduleTasks.js <nombreTarea>');
    console.log('Tareas disponibles:');
    console.log('  - checkExpiredSubscriptions');
    console.log('  - processExpiredGracePeriods');
    console.log('  - sendGracePeriodReminders');
    console.log('  - syncWithStripe');
    console.log('  - cleanupOldLogs');
    console.log('  - healthCheck');
    process.exit(1);
  }

  // Cargar configuración
  require('dotenv').config();

  // Conectar a MongoDB
  const mongoose = require('mongoose');
  mongoose.connect(process.env.URLDB)
    .then(() => {
      logger.info('Conectado a MongoDB');
      return runTaskManually(taskName);
    })
    .then(() => {
      logger.info('Tarea completada');
      process.exit(0);
    })
    .catch(error => {
      logger.error('Error:', error);
      process.exit(1);
    });
}