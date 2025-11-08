require('dotenv').config();
const mongoose = require('mongoose');
const logger = require('../utils/logger');
const subscriptionService = require('../services/subscriptionService');
const emailService = require('../services/emailService');
const loadEnv = require('../config/env');

/**
 * Script para verificar y procesar períodos de gracia
 * Diseñado para ejecutarse como tarea programada o manualmente
 */
async function checkGracePeriods() {
  const startTime = Date.now();
  let dbConnection = null;

  try {
    logger.info('========================================');
    logger.info('🔍 VERIFICACIÓN DE PERÍODOS DE GRACIA');
    logger.info(`Fecha/Hora: ${new Date().toISOString()}`);
    logger.info('========================================');

    // Cargar variables de entorno desde AWS Secrets Manager
    logger.info('🔑 Cargando configuración desde AWS Secrets Manager...');
    const envVars = await loadEnv();
    
    // Parsear las variables de entorno
    envVars.split('\n').forEach(line => {
      if (line) {
        const [key, value] = line.split('=');
        if (key && value) {
          process.env[key] = value;
        }
      }
    });
    logger.info('✅ Variables de entorno cargadas exitosamente');

    // Verificar variables de entorno críticas
    if (!process.env.URLDB) {
      throw new Error('URLDB no está configurada después de cargar desde Secrets Manager');
    }

    // Conectar a MongoDB si no está conectado
    if (mongoose.connection.readyState !== 1) {
      logger.info('📊 Conectando a MongoDB...');
      
      // Limpiar URL de MongoDB - eliminar parámetros vacíos
      let mongoUrl = process.env.URLDB;
      
      // Log para debug - ocultar credenciales
      const urlParts = mongoUrl.split('@');
      const safePart = urlParts.length > 1 ? urlParts[1] : mongoUrl;
      logger.info(`URL MongoDB original (sin credenciales): ...@${safePart}`);
      
      // Solución definitiva: eliminar TODOS los parámetros de query si hay problemas
      const urlBase = mongoUrl.split('?')[0];
      const queryString = mongoUrl.split('?')[1];
      
      if (queryString) {
        logger.info(`Query string detectado: ${queryString}`);
        
        // Si hay retryWrites vacío, eliminar TODOS los parámetros
        if (queryString.includes('retryWrites=')) {
          logger.warn('Detectado retryWrites vacío - eliminando todos los parámetros de query');
          mongoUrl = urlBase;
        } else {
          // Parsear parámetros y eliminar los vacíos
          const params = new URLSearchParams(queryString);
          const validParams = [];
          
          for (const [key, value] of params) {
            if (value && value.trim() !== '') {
              validParams.push(`${key}=${value}`);
            }
          }
          
          // Reconstruir URL solo con parámetros válidos
          mongoUrl = validParams.length > 0 ? `${urlBase}?${validParams.join('&')}` : urlBase;
        }
      }
      
      const safePartClean = mongoUrl.split('@')[1] || mongoUrl;
      logger.info(`URL MongoDB limpia: ...@${safePartClean}`);
      
      dbConnection = await mongoose.connect(mongoUrl, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        retryWrites: true // Especificar explícitamente
      });
      logger.info('✅ Conectado a MongoDB exitosamente');
    } else {
      logger.info('✅ Usando conexión MongoDB existente');
    }

    // Obtener estadísticas previas
    const stats = await getSubscriptionStats();
    logger.info('📈 Estadísticas actuales:');

    logger.info(`   - Suscripciones activas: ${stats.active}`);
    if (stats.activeList.length > 0) {
      stats.activeList.forEach(s => logger.info(`     • ${s.id} - ${s.email}`));
    }

    logger.info(`   - Suscripciones con cancelación programada: ${stats.pendingCancellation}`);
    if (stats.pendingCancellationList.length > 0) {
      stats.pendingCancellationList.forEach(s => logger.info(`     • ${s.id} - ${s.email}`));
    }

    logger.info(`   - Suscripciones en período de gracia: ${stats.inGracePeriod}`);
    if (stats.inGracePeriodList.length > 0) {
      stats.inGracePeriodList.forEach(s => logger.info(`     • ${s.id} - ${s.email}`));
    }

    logger.info(`   - Períodos de gracia por vencer (3 días): ${stats.gracePeriodExpiringSoon}`);
    if (stats.gracePeriodExpiringSoonList.length > 0) {
      stats.gracePeriodExpiringSoonList.forEach(s => logger.info(`     • ${s.id} - ${s.email}`));
    }

    // PASO 1: Verificar suscripciones expiradas que necesitan período de gracia
    logger.info('\n📋 PASO 1: Verificando suscripciones expiradas...');
    const expiredCount = await checkAndActivateExpiredSubscriptions();

    // PASO 2: Procesar períodos de gracia vencidos
    logger.info('\n📋 PASO 2: Procesando períodos de gracia vencidos...');
    const processedCount = await processExpiredGracePeriods();

    // PASO 3: Enviar recordatorios de períodos próximos a vencer
    logger.info('\n📋 PASO 3: Enviando recordatorios de período de gracia...');
    const remindersCount = await sendGracePeriodReminders();

    // PASO 4: Limpiar datos obsoletos
    logger.info('\n📋 PASO 4: Limpiando datos obsoletos...');
    const cleanedCount = await cleanupObsoleteData();

    // Resumen final
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.info('\n========================================');
    logger.info('✅ VERIFICACIÓN COMPLETADA');
    logger.info(`⏱️  Duración: ${duration} segundos`);
    logger.info('📊 Resumen:');
    logger.info(`   - Nuevos períodos de gracia activados: ${expiredCount}`);
    logger.info(`   - Períodos de gracia procesados: ${processedCount}`);
    logger.info(`   - Recordatorios enviados: ${remindersCount}`);
    logger.info(`   - Registros obsoletos limpiados: ${cleanedCount}`);
    logger.info('========================================\n');

    return {
      success: true,
      duration,
      stats: {
        expiredCount,
        processedCount,
        remindersCount,
        cleanedCount
      }
    };

  } catch (error) {
    logger.error('❌ ERROR CRÍTICO en verificación de períodos de gracia:', error);
    logger.error('Stack trace:', error.stack);

    // Intentar enviar notificación de error si está configurado
    if (process.env.ADMIN_EMAIL) {
      try {
        await notifyAdminError(error);
      } catch (emailError) {
        logger.error('Error enviando notificación al admin:', emailError);
      }
    }

    throw error;

  } finally {
    // Cerrar conexión solo si la abrimos en este script
    if (dbConnection && mongoose.connection.readyState === 1) {
      try {
        await mongoose.connection.close();
        logger.info('🔌 Conexión a MongoDB cerrada');
      } catch (error) {
        logger.error('Error cerrando conexión MongoDB:', error);
      }
    }
  }
}

/**
 * Verificar y activar períodos de gracia para suscripciones expiradas
 */
async function checkAndActivateExpiredSubscriptions() {
  try {
    const expiredCount = await subscriptionService.checkExpiredSubscriptions();

    if (expiredCount > 0) {
      logger.info(`✅ Se activaron ${expiredCount} nuevos períodos de gracia`);
    } else {
      logger.info('ℹ️  No se encontraron suscripciones expiradas para procesar');
    }

    return expiredCount;
  } catch (error) {
    logger.error('Error en checkAndActivateExpiredSubscriptions:', error);
    throw error;
  }
}

/**
 * Procesar períodos de gracia que han vencido
 */
async function processExpiredGracePeriods() {
  try {
    const processedCount = await subscriptionService.processExpiredGracePeriods();

    if (processedCount > 0) {
      logger.info(`✅ Se procesaron ${processedCount} períodos de gracia vencidos`);
      logger.info('   Los elementos excedentes han sido archivados automáticamente');
    } else {
      logger.info('ℹ️  No hay períodos de gracia vencidos para procesar');
    }

    return processedCount;
  } catch (error) {
    logger.error('Error en processExpiredGracePeriods:', error);
    throw error;
  }
}

/**
 * Enviar recordatorios para períodos de gracia próximos a vencer
 */
async function sendGracePeriodReminders() {
  try {
    const Subscription = require('../models/Subscription');
    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const oneDayFromNow = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);

    // Buscar suscripciones con período de gracia que vence pronto
    const subscriptions = await Subscription.find({
      'downgradeGracePeriod.expiresAt': { $exists: true },
      'downgradeGracePeriod.autoArchiveScheduled': true,
      $or: [
        // Recordatorio de 3 días
        {
          'downgradeGracePeriod.expiresAt': { $gte: now, $lte: threeDaysFromNow },
          'downgradeGracePeriod.reminder3DaysSent': { $ne: true }
        },
        // Recordatorio de 1 día
        {
          'downgradeGracePeriod.expiresAt': { $gte: now, $lte: oneDayFromNow },
          'downgradeGracePeriod.reminder1DaySent': { $ne: true }
        }
      ]
    }).populate('user', 'email firstName lastName');

    logger.info(`📧 Encontradas ${subscriptions.length} suscripciones para recordatorio`);

    let sentCount = 0;

    for (const subscription of subscriptions) {
      try {
        const daysRemaining = Math.ceil(
          (subscription.downgradeGracePeriod.expiresAt - now) / (1000 * 60 * 60 * 24)
        );

        // Determinar qué tipo de recordatorio enviar
        let reminderType = null;
        if (daysRemaining <= 1 && !subscription.downgradeGracePeriod.reminder1DaySent) {
          reminderType = '1day';
        } else if (daysRemaining <= 3 && !subscription.downgradeGracePeriod.reminder3DaysSent) {
          reminderType = '3days';
        }

        if (reminderType && subscription.user) {
          // TODO: Obtener conteos reales de recursos del usuario
          const resourceCounts = await getResourceCounts(subscription.user._id);

          await emailService.sendSubscriptionEmail(subscription.user, 'gracePeriodReminder', {
            daysRemaining,
            gracePeriodEnd: subscription.downgradeGracePeriod.expiresAt.toLocaleDateString('es-ES'),
            previousPlan: subscription.downgradeGracePeriod.previousPlan,
            currentFolders: resourceCounts.folders,
            currentCalculators: resourceCounts.calculators,
            currentContacts: resourceCounts.contacts,
            exceedsLimits: resourceCounts.exceedsLimits,
            foldersToArchive: Math.max(0, resourceCounts.folders - 5),
            calculatorsToArchive: Math.max(0, resourceCounts.calculators - 3),
            contactsToArchive: Math.max(0, resourceCounts.contacts - 10)
          });

          // Marcar recordatorio como enviado
          if (reminderType === '1day') {
            subscription.downgradeGracePeriod.reminder1DaySent = true;
          } else if (reminderType === '3days') {
            subscription.downgradeGracePeriod.reminder3DaysSent = true;
          }

          await subscription.save();
          sentCount++;

          logger.info(`✅ Recordatorio de ${daysRemaining} día(s) enviado a ${subscription.user.email}`);
        }

      } catch (error) {
        logger.error(`Error enviando recordatorio para suscripción ${subscription._id}:`, error);
      }
    }

    if (sentCount > 0) {
      logger.info(`✅ Se enviaron ${sentCount} recordatorios de período de gracia`);
    } else {
      logger.info('ℹ️  No hay recordatorios pendientes de enviar');
    }

    return sentCount;
  } catch (error) {
    logger.error('Error en sendGracePeriodReminders:', error);
    throw error;
  }
}

/**
 * Limpiar datos obsoletos de períodos de gracia antiguos
 */
async function cleanupObsoleteData() {
  try {
    const Subscription = require('../models/Subscription');
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Limpiar períodos de gracia procesados hace más de 30 días
    const result = await Subscription.updateMany(
      {
        'downgradeGracePeriod.expiresAt': { $lt: thirtyDaysAgo },
        'downgradeGracePeriod.autoArchiveScheduled': false
      },
      {
        $unset: { downgradeGracePeriod: '' }
      }
    );

    const cleanedCount = result.modifiedCount || 0;

    if (cleanedCount > 0) {
      logger.info(`🧹 Se limpiaron ${cleanedCount} registros de períodos de gracia obsoletos`);
    } else {
      logger.info('ℹ️  No hay registros obsoletos para limpiar');
    }

    return cleanedCount;
  } catch (error) {
    logger.error('Error en cleanupObsoleteData:', error);
    throw error;
  }
}

/**
 * Obtener estadísticas de suscripciones
 */
async function getSubscriptionStats() {
  try {
    const Subscription = require('../models/Subscription');
    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    const [activeList, pendingCancellationList, inGracePeriodList, gracePeriodExpiringSoonList] = await Promise.all([
      Subscription.find({ status: 'active', plan: { $ne: 'free' } }).populate('user', 'email'),
      Subscription.find({ cancelAtPeriodEnd: true }).populate('user', 'email'),
      Subscription.find({ 'downgradeGracePeriod.expiresAt': { $gte: now } }).populate('user', 'email'),
      Subscription.find({
        'downgradeGracePeriod.expiresAt': { $gte: now, $lte: threeDaysFromNow }
      }).populate('user', 'email')
    ]);

    return {
      active: activeList.length,
      activeList: activeList.map(s => ({ id: s._id, email: s.user?.email || 'N/A' })),
      pendingCancellation: pendingCancellationList.length,
      pendingCancellationList: pendingCancellationList.map(s => ({ id: s._id, email: s.user?.email || 'N/A' })),
      inGracePeriod: inGracePeriodList.length,
      inGracePeriodList: inGracePeriodList.map(s => ({ id: s._id, email: s.user?.email || 'N/A' })),
      gracePeriodExpiringSoon: gracePeriodExpiringSoonList.length,
      gracePeriodExpiringSoonList: gracePeriodExpiringSoonList.map(s => ({ id: s._id, email: s.user?.email || 'N/A' }))
    };
  } catch (error) {
    logger.error('Error obteniendo estadísticas:', error);
    return {
      active: 0,
      activeList: [],
      pendingCancellation: 0,
      pendingCancellationList: [],
      inGracePeriod: 0,
      inGracePeriodList: [],
      gracePeriodExpiringSoon: 0,
      gracePeriodExpiringSoonList: []
    };
  }
}

/**
 * Obtener conteos de recursos de un usuario
 */
async function getResourceCounts(userId) {
  try {
    const Folder = require('../models/Folder');
    const Calculator = require('../models/Calculator');
    const Contact = require('../models/Contact');

    const [folders, calculators, contacts] = await Promise.all([
      Folder.countDocuments({ user: userId, archived: false }),
      Calculator.countDocuments({ user: userId, archived: false }),
      Contact.countDocuments({ user: userId, archived: false })
    ]);

    const limits = { folders: 5, calculators: 3, contacts: 10 }; // Límites FREE

    return {
      folders,
      calculators,
      contacts,
      exceedsLimits: folders > limits.folders ||
        calculators > limits.calculators ||
        contacts > limits.contacts
    };
  } catch (error) {
    logger.error('Error obteniendo conteos de recursos:', error);
    return {
      folders: 0,
      calculators: 0,
      contacts: 0,
      exceedsLimits: false
    };
  }
}

/**
 * Notificar error al administrador
 */
async function notifyAdminError(error) {
  if (!process.env.ADMIN_EMAIL) return;

  try {
    const AWS = require('@aws-sdk/client-ses');
    const sesClient = new AWS.SESClient({ region: process.env.AWS_REGION || 'sa-east-1' });

    const params = {
      Source: process.env.EMAIL_MARKETING_DEFAULT_SENDER || 'noreply@tuapp.com',
      Destination: {
        ToAddresses: [process.env.ADMIN_EMAIL]
      },
      Message: {
        Subject: {
          Data: '🚨 Error en verificación de períodos de gracia',
          Charset: 'UTF-8'
        },
        Body: {
          Text: {
            Data: `Se ha producido un error crítico en la verificación de períodos de 
  gracia:\n\n${error.message}\n\nStack trace:\n${error.stack}\n\nFecha: ${new Date().toISOString()}`,
            Charset: 'UTF-8'
          }
        }
      }
    };

    await sesClient.send(new AWS.SendEmailCommand(params));
    logger.info('Notificación de error enviada al administrador');
  } catch (emailError) {
    logger.error('Error enviando notificación:', emailError);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  // Cargar variables de entorno
  require('dotenv').config();

  // Configurar proceso
  process.on('unhandledRejection', (error) => {
    logger.error('Unhandled rejection:', error);
    process.exit(1);
  });

  // Ejecutar verificación
  checkGracePeriods()
    .then((result) => {
      logger.info('✅ Script completado exitosamente');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('❌ Script falló:', error);
      process.exit(1);
    });
}

// Exportar para uso en otros módulos
module.exports = checkGracePeriods;