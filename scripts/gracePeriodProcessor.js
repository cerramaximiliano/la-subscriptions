#!/usr/bin/env node

/**
 * Grace Period Processor
 * Maneja el auto-archivado y procesamiento de períodos de gracia
 * Parte del microservicio de webhooks
 */

require('dotenv').config();
const mongoose = require('mongoose');
const logger = require('../utils/logger');
const emailService = require('../services/emailService');
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const Folder = require('../models/Folder');
const Calculator = require('../models/Calculator');
const Contact = require('../models/Contact');
const Alert = require('../models/Alert');

/**
 * Función principal que procesa períodos de gracia
 */
async function processGracePeriods() {
  const startTime = Date.now();
  
  try {
    logger.info('========================================');
    logger.info('🔄 PROCESADOR DE PERÍODOS DE GRACIA');
    logger.info(`Fecha/Hora: ${new Date().toISOString()}`);
    logger.info('========================================');
    
    // Conectar a MongoDB si no está conectado
    if (mongoose.connection.readyState !== 1) {
      logger.info('📊 Conectando a MongoDB...');
      await mongoose.connect(process.env.MONGODB_URI || process.env.URLDB);
      logger.info('✅ Conectado a MongoDB exitosamente');
    }
    
    // PASO 1: Procesar períodos de gracia vencidos (auto-archivado)
    logger.info('\n📋 PASO 1: Procesando períodos de gracia vencidos...');
    const archivedCount = await processExpiredGracePeriods();
    
    // PASO 2: Procesar períodos de gracia de pagos fallidos
    logger.info('\n📋 PASO 2: Procesando períodos de gracia por pagos fallidos...');
    const paymentGraceCount = await processPaymentGracePeriods();
    
    // PASO 3: Enviar recordatorios
    logger.info('\n📋 PASO 3: Enviando recordatorios...');
    const remindersCount = await sendGracePeriodReminders();
    
    // PASO 4: Limpiar datos obsoletos
    logger.info('\n📋 PASO 4: Limpiando datos obsoletos...');
    const cleanedCount = await cleanupObsoleteData();
    
    // Resumen final
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.info('\n========================================');
    logger.info('✅ PROCESAMIENTO COMPLETADO');
    logger.info(`⏱️  Duración: ${duration} segundos`);
    logger.info('📊 Resumen:');
    logger.info(`   - Períodos vencidos procesados: ${archivedCount}`);
    logger.info(`   - Períodos de pago procesados: ${paymentGraceCount}`);
    logger.info(`   - Recordatorios enviados: ${remindersCount}`);
    logger.info(`   - Registros obsoletos limpiados: ${cleanedCount}`);
    logger.info('========================================\n');
    
    return {
      success: true,
      duration,
      stats: {
        archivedCount,
        paymentGraceCount,
        remindersCount,
        cleanedCount
      }
    };
    
  } catch (error) {
    logger.error('❌ ERROR CRÍTICO en procesamiento de períodos de gracia:', error);
    throw error;
  }
}

/**
 * Procesar períodos de gracia vencidos por downgrade
 */
async function processExpiredGracePeriods() {
  try {
    const now = new Date();
    
    // Buscar suscripciones con período de gracia de downgrade vencido
    const expiredSubscriptions = await Subscription.find({
      'downgradeGracePeriod.expiresAt': { $lt: now },
      'downgradeGracePeriod.autoArchiveScheduled': true
    }).populate('user');
    
    logger.info(`Encontradas ${expiredSubscriptions.length} suscripciones con período vencido`);
    
    let processedCount = 0;
    
    for (const subscription of expiredSubscriptions) {
      try {
        const user = subscription.user;
        if (!user) continue;
        
        logger.info(`[AUTO-ARCHIVE] Procesando usuario ${user.email}`);
        
        // Realizar auto-archivado
        const archiveResult = await performAutoArchiving(user._id, subscription.plan);
        
        // Marcar como procesado
        subscription.downgradeGracePeriod.autoArchiveScheduled = false;
        subscription.downgradeGracePeriod.processedAt = new Date();
        await subscription.save();
        
        // Calcular totales
        const totalArchived = 
          (archiveResult.folders?.archived || 0) +
          (archiveResult.calculators?.archived || 0) +
          (archiveResult.contacts?.archived || 0);
        
        logger.info(`[AUTO-ARCHIVE] Completado - ${totalArchived} elementos archivados`);
        
        // Enviar notificación
        if (user.email) {
          await emailService.sendPaymentEmail(user, 'gracePeriodExpired', {
            planName: subscription.plan,
            archivedFolders: archiveResult.folders?.archived || 0,
            archivedCalculators: archiveResult.calculators?.archived || 0,
            archivedContacts: archiveResult.contacts?.archived || 0,
            totalArchived
          });
        }
        
        // Crear alerta en el sistema
        await Alert.create({
          user: user._id,
          type: 'info',
          title: 'Auto-archivado completado',
          message: `Se han archivado ${totalArchived} elementos que excedían los límites de tu plan.`,
          icon: 'Archive',
          action: 'Ver archivados',
          route: '/archived'
        });
        
        processedCount++;
        
      } catch (error) {
        logger.error(`Error procesando suscripción ${subscription._id}:`, error);
      }
    }
    
    return processedCount;
    
  } catch (error) {
    logger.error('Error en processExpiredGracePeriods:', error);
    throw error;
  }
}

/**
 * Procesar períodos de gracia por pagos fallidos
 */
async function processPaymentGracePeriods() {
  try {
    const now = new Date();
    
    // Buscar suscripciones en grace_period que han pasado 15 días
    const expiredPaymentGrace = await Subscription.find({
      accountStatus: 'grace_period',
      'paymentFailures.count': { $gte: 4 },
      'paymentFailures.firstFailedAt': { 
        $lte: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000) 
      }
    }).populate('user');
    
    logger.info(`Encontradas ${expiredPaymentGrace.length} suscripciones con período de gracia de pago vencido`);
    
    let processedCount = 0;
    
    for (const subscription of expiredPaymentGrace) {
      try {
        const user = subscription.user;
        if (!user) continue;
        
        logger.info(`[PAYMENT-GRACE] Procesando usuario ${user.email}`);
        
        // Realizar auto-archivado
        const archiveResult = await performAutoArchiving(user._id, 'free');
        
        // Actualizar suscripción
        subscription.accountStatus = 'archived';
        subscription.plan = 'free';
        subscription.status = 'canceled';
        subscription.statusHistory.push({
          status: 'payment_grace_expired',
          changedAt: new Date(),
          reason: 'Período de gracia por pago fallido expirado',
          triggeredBy: 'grace_period_processor'
        });
        
        await subscription.save();
        
        // Actualizar usuario
        await User.findByIdAndUpdate(user._id, {
          subscriptionPlan: 'free'
        });
        
        processedCount++;
        
      } catch (error) {
        logger.error(`Error procesando suscripción de pago ${subscription._id}:`, error);
      }
    }
    
    return processedCount;
    
  } catch (error) {
    logger.error('Error en processPaymentGracePeriods:', error);
    throw error;
  }
}

/**
 * Realizar auto-archivado de contenido excedente
 */
async function performAutoArchiving(userId, targetPlan) {
  try {
    const limits = getPlanLimits(targetPlan);
    const result = {
      folders: { checked: 0, archived: 0 },
      calculators: { checked: 0, archived: 0 },
      contacts: { checked: 0, archived: 0 }
    };
    
    // 1. Archivar carpetas excedentes (más antiguas primero)
    const activeFolders = await Folder.find({ 
      user: userId, 
      archived: false 
    }).sort({ createdAt: 1 });
    
    result.folders.checked = activeFolders.length;
    
    if (activeFolders.length > limits.maxFolders) {
      const toArchive = activeFolders.slice(limits.maxFolders);
      
      for (const folder of toArchive) {
        folder.archived = true;
        folder.archivedAt = new Date();
        folder.archivedReason = 'auto_archived_limit_exceeded';
        await folder.save();
        result.folders.archived++;
      }
    }
    
    // 2. Archivar calculadoras excedentes
    const activeCalculators = await Calculator.find({ 
      user: userId, 
      archived: false 
    }).sort({ createdAt: 1 });
    
    result.calculators.checked = activeCalculators.length;
    
    if (activeCalculators.length > limits.maxCalculators) {
      const toArchive = activeCalculators.slice(limits.maxCalculators);
      
      for (const calculator of toArchive) {
        calculator.archived = true;
        calculator.archivedAt = new Date();
        calculator.archivedReason = 'auto_archived_limit_exceeded';
        await calculator.save();
        result.calculators.archived++;
      }
    }
    
    // 3. Archivar contactos excedentes
    const activeContacts = await Contact.find({ 
      userId, 
      archived: false 
    }).sort({ createdAt: 1 });
    
    result.contacts.checked = activeContacts.length;
    
    if (activeContacts.length > limits.maxContacts) {
      const toArchive = activeContacts.slice(limits.maxContacts);
      
      for (const contact of toArchive) {
        contact.archived = true;
        contact.archivedAt = new Date();
        contact.archivedReason = 'auto_archived_limit_exceeded';
        await contact.save();
        result.contacts.archived++;
      }
    }
    
    logger.info(`[AUTO-ARCHIVE] Resultado para usuario ${userId}:`, result);
    
    return result;
    
  } catch (error) {
    logger.error(`Error en auto-archivado para usuario ${userId}:`, error);
    throw error;
  }
}

/**
 * Enviar recordatorios de períodos próximos a vencer
 */
async function sendGracePeriodReminders() {
  try {
    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const oneDayFromNow = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);
    
    // Buscar suscripciones con recordatorios pendientes
    const subscriptions = await Subscription.find({
      $or: [
        // Recordatorios de downgrade
        {
          'downgradeGracePeriod.expiresAt': { $gte: now },
          'downgradeGracePeriod.autoArchiveScheduled': true,
          $or: [
            {
              'downgradeGracePeriod.expiresAt': { $lte: threeDaysFromNow },
              'downgradeGracePeriod.reminder3DaysSent': { $ne: true }
            },
            {
              'downgradeGracePeriod.expiresAt': { $lte: oneDayFromNow },
              'downgradeGracePeriod.reminder1DaySent': { $ne: true }
            }
          ]
        },
        // Recordatorios de pagos fallidos
        {
          accountStatus: 'grace_period',
          'paymentFailures.count': { $gte: 4 },
          'paymentFailures.notificationsSent.gracePeriodReminder': { $ne: true }
        }
      ]
    }).populate('user');
    
    logger.info(`Encontradas ${subscriptions.length} suscripciones para recordatorio`);
    
    let sentCount = 0;
    
    for (const subscription of subscriptions) {
      try {
        const user = subscription.user;
        if (!user || !user.email) continue;
        
        // Determinar tipo de recordatorio
        if (subscription.downgradeGracePeriod?.expiresAt) {
          // Recordatorio de downgrade
          const daysRemaining = Math.ceil(
            (subscription.downgradeGracePeriod.expiresAt - now) / (1000 * 60 * 60 * 24)
          );
          
          if (daysRemaining <= 1 && !subscription.downgradeGracePeriod.reminder1DaySent) {
            await emailService.sendPaymentEmail(user, 'gracePeriod1Day', {
              planName: subscription.plan,
              daysRemaining: 1
            });
            subscription.downgradeGracePeriod.reminder1DaySent = true;
            sentCount++;
          } else if (daysRemaining <= 3 && !subscription.downgradeGracePeriod.reminder3DaysSent) {
            await emailService.sendPaymentEmail(user, 'gracePeriod3Days', {
              planName: subscription.plan,
              daysRemaining: 3
            });
            subscription.downgradeGracePeriod.reminder3DaysSent = true;
            sentCount++;
          }
        } else if (subscription.accountStatus === 'grace_period') {
          // Recordatorio de pago fallido
          if (!subscription.paymentFailures.notificationsSent.gracePeriodReminder) {
            await emailService.sendPaymentEmail(user, 'paymentGracePeriodReminder', {
              planName: subscription.plan,
              daysRemaining: 15
            });
            subscription.paymentFailures.notificationsSent.gracePeriodReminder = { 
              sent: true, 
              sentAt: new Date() 
            };
            sentCount++;
          }
        }
        
        await subscription.save();
        
      } catch (error) {
        logger.error(`Error enviando recordatorio para ${subscription._id}:`, error);
      }
    }
    
    return sentCount;
    
  } catch (error) {
    logger.error('Error en sendGracePeriodReminders:', error);
    throw error;
  }
}

/**
 * Limpiar datos obsoletos
 */
async function cleanupObsoleteData() {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    // Limpiar períodos de gracia procesados hace más de 30 días
    const result = await Subscription.updateMany(
      {
        $or: [
          {
            'downgradeGracePeriod.expiresAt': { $lt: thirtyDaysAgo },
            'downgradeGracePeriod.autoArchiveScheduled': false
          },
          {
            'paymentFailures.count': 0,
            'paymentFailures.lastFailedAt': { $lt: thirtyDaysAgo }
          }
        ]
      },
      {
        $unset: { 
          downgradeGracePeriod: '',
          'paymentFailures.notificationsSent': ''
        }
      }
    );
    
    return result.modifiedCount || 0;
    
  } catch (error) {
    logger.error('Error en cleanupObsoleteData:', error);
    throw error;
  }
}

/**
 * Obtener límites del plan
 */
function getPlanLimits(plan) {
  const limits = {
    free: { maxFolders: 5, maxCalculators: 3, maxContacts: 10 },
    standard: { maxFolders: 50, maxCalculators: 20, maxContacts: 100 },
    premium: { maxFolders: 999999, maxCalculators: 999999, maxContacts: 999999 }
  };
  
  return limits[plan] || limits.free;
}

// Ejecutar si se llama directamente
if (require.main === module) {
  processGracePeriods()
    .then((result) => {
      logger.info('✅ Procesamiento completado exitosamente');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('❌ Error en procesamiento:', error);
      process.exit(1);
    });
}

// Exportar para uso en otros módulos
module.exports = {
  processGracePeriods,
  processExpiredGracePeriods,
  processPaymentGracePeriods,
  performAutoArchiving,
  sendGracePeriodReminders,
  cleanupObsoleteData
};