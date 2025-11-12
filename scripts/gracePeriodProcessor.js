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
const PlanConfig = require('../models/PlanConfig');
const CronTaskConfig = require('../models/CronTaskConfig');

/**
 * Función principal que procesa períodos de gracia
 */
async function processGracePeriods() {
  const startTime = Date.now();
  let taskConfig = null;

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

    // Verificar configuración de la tarea
    logger.info('\n📋 Verificando configuración de la tarea...');
    taskConfig = await CronTaskConfig.findOne({ taskName: 'grace-period-processor' });

    if (!taskConfig) {
      logger.warn('⚠️  No se encontró configuración de la tarea');
      logger.warn('   Ejecutando con configuración por defecto');
      logger.warn('   Para crear la configuración, ejecuta: node scripts/initCronTaskConfig.js');
    } else if (!taskConfig.enabled) {
      logger.warn('⚠️  La tarea está DESHABILITADA en la configuración');
      logger.warn('   Para habilitarla, actualiza el campo "enabled" en la base de datos');
      logger.warn('   o ejecuta: node scripts/initCronTaskConfig.js');
      return {
        success: false,
        skipped: true,
        reason: 'Task is disabled in configuration'
      };
    } else {
      logger.info('✅ Configuración encontrada y habilitada');
      logger.info(`   Expresión cron: ${taskConfig.cronExpression}`);
      logger.info(`   Última ejecución: ${taskConfig.lastExecution?.startedAt || 'Nunca'}`);

      // Registrar inicio de ejecución
      await taskConfig.startExecution();
      logger.info('📝 Ejecución registrada en el sistema');
    }
    
    // PASO 1: Procesar períodos de gracia vencidos (auto-archivado)
    logger.info('\n📋 PASO 1: Procesando períodos de gracia vencidos...');
    const archivedCount = await processExpiredGracePeriods(taskConfig);

    // PASO 2: Procesar períodos de gracia de pagos fallidos
    logger.info('\n📋 PASO 2: Procesando períodos de gracia por pagos fallidos...');
    const paymentGraceCount = await processPaymentGracePeriods(taskConfig);

    // PASO 3: Enviar recordatorios
    logger.info('\n📋 PASO 3: Enviando recordatorios...');
    const remindersCount = await sendGracePeriodReminders(taskConfig);
    
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

    const resultStats = {
      archivedCount,
      paymentGraceCount,
      remindersCount,
      cleanedCount
    };

    // Registrar ejecución exitosa
    if (taskConfig) {
      await taskConfig.completeExecution(resultStats);
      logger.info('✅ Ejecución registrada exitosamente en el sistema');
    }

    return {
      success: true,
      duration,
      stats: resultStats
    };

  } catch (error) {
    logger.error('❌ ERROR CRÍTICO en procesamiento de períodos de gracia:', error);

    // Registrar error en configuración
    if (taskConfig) {
      try {
        await taskConfig.failExecution(error, {
          errorType: error.name,
          errorCode: error.code,
          timestamp: new Date().toISOString()
        });
        logger.info('📝 Error registrado en el sistema');
      } catch (configError) {
        logger.error('Error registrando fallo en configuración:', configError);
      }
    }

    throw error;
  }
}

/**
 * Procesar períodos de gracia vencidos por downgrade
 */
async function processExpiredGracePeriods(taskConfig = null) {
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
        
        // Realizar auto-archivado al plan destino (free)
        const targetPlan = subscription.downgradeGracePeriod.targetPlan || 'free';
        const archiveResult = await performAutoArchiving(user._id, targetPlan, taskConfig);
        
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
          await emailService.sendSubscriptionEmail(user, 'gracePeriodExpired', {
            planName: subscription.downgradeGracePeriod.previousPlan,
            targetPlan: targetPlan,
            foldersArchived: archiveResult.folders?.archived || 0,
            calculatorsArchived: archiveResult.calculators?.archived || 0,
            contactsArchived: archiveResult.contacts?.archived || 0,
            totalArchived,
            planLimits: getPlanLimits(targetPlan, taskConfig)
          });
        }
        
        // Crear alerta en el sistema solo si se archivaron elementos
        if (totalArchived > 0) {
          try {
            // Buscar primera carpeta del usuario para asociar la alerta
            const firstFolder = await Folder.findOne({ userId: user._id });
            if (firstFolder) {
              await Alert.create({
                userId: user._id,
                folderId: firstFolder._id,
                secondaryText: `Se han archivado ${totalArchived} elementos que excedían los límites de tu plan.`,
                actionText: 'Ver archivados',
                avatarIcon: 'TaskSquare',
                avatarType: 'icon',
                avatarSize: 40,
                primaryText: 'Auto-archivado completado',
                primaryVariant: 'info'
              });
              logger.info('Alerta creada exitosamente');
            }
          } catch (alertError) {
            logger.error('Error creando alerta:', alertError);
            // No fallar el proceso por error en alerta
          }
        }
        
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
async function processPaymentGracePeriods(taskConfig = null) {
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
        const archiveResult = await performAutoArchiving(user._id, 'free', taskConfig);
        
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
async function performAutoArchiving(userId, targetPlan, taskConfig = null) {
  try {
    // Usar límites del plan (usar legacy porque PlanConfig no tiene features poblados)
    const limits = getPlanLimits(targetPlan, taskConfig);
    logger.info(`[DEBUG] Límites del plan ${targetPlan}:`, JSON.stringify(limits));
    
    const result = {
      folders: { checked: 0, archived: 0 },
      calculators: { checked: 0, archived: 0 },
      contacts: { checked: 0, archived: 0 }
    };
    
    // 1. Archivar carpetas excedentes (más antiguas primero)
    // Folder usa 'userId' según debug
    const activeFolders = await Folder.find({ 
      userId: userId, 
      archived: { $ne: true }  // Incluir documentos sin campo 'archived'
    }).sort({ createdAt: 1 });
    
    result.folders.checked = activeFolders.length;
    
    // Log para debug
    logger.info(`[DEBUG] Carpetas activas encontradas: ${activeFolders.length}`);
    if (activeFolders.length === 0) {
      const totalFolders = await Folder.countDocuments({ userId: userId });
      logger.info(`[DEBUG] Usuario ${userId} - Total carpetas: ${totalFolders}, Activas: 0`);
    }
    
    if (activeFolders.length > limits.maxFolders) {
      const toArchive = activeFolders.slice(limits.maxFolders);
      logger.info(`[DEBUG] Carpetas a archivar: ${toArchive.length} (${activeFolders.length} activas - ${limits.maxFolders} límite)`);
      
      for (const folder of toArchive) {
        try {
          // Usar updateOne para evitar problemas de validación con campos de fecha mal formateados
          await Folder.updateOne(
            { _id: folder._id },
            {
              $set: {
                archived: true,
                archivedAt: new Date(),
                archivedReason: 'auto_archived_limit_exceeded'
              }
            }
          );
          result.folders.archived++;
          logger.info(`[ARCHIVE] Carpeta archivada: ${folder._id}`);
        } catch (archiveError) {
          logger.error(`Error archivando carpeta ${folder._id}:`, archiveError.message);
        }
      }
    }
    
    // 2. Archivar calculadoras excedentes
    // Calculator usa 'userId' (no 'user' que es un campo de string)
    const activeCalculators = await Calculator.find({ 
      userId: userId, 
      archived: { $ne: true }  // Incluir documentos sin campo 'archived'
    }).sort({ createdAt: 1 });
    
    result.calculators.checked = activeCalculators.length;
    
    // Log para debug
    logger.info(`[DEBUG] Calculadoras activas encontradas: ${activeCalculators.length}`);
    if (activeCalculators.length === 0) {
      const totalCalculators = await Calculator.countDocuments({ userId: userId });
      logger.info(`[DEBUG] Usuario ${userId} - Total calculadoras: ${totalCalculators}, Activas: 0`);
    }
    
    if (activeCalculators.length > limits.maxCalculators) {
      const toArchive = activeCalculators.slice(limits.maxCalculators);
      logger.info(`[DEBUG] Calculadoras a archivar: ${toArchive.length} (${activeCalculators.length} activas - ${limits.maxCalculators} límite)`);
      
      for (const calculator of toArchive) {
        try {
          // Usar updateOne para evitar problemas de validación
          await Calculator.updateOne(
            { _id: calculator._id },
            {
              $set: {
                archived: true,
                archivedAt: new Date(),
                archivedReason: 'auto_archived_limit_exceeded'
              }
            }
          );
          result.calculators.archived++;
          logger.info(`[ARCHIVE] Calculadora archivada: ${calculator._id}`);
        } catch (archiveError) {
          logger.error(`Error archivando calculadora ${calculator._id}:`, archiveError.message);
        }
      }
    }
    
    // 3. Archivar contactos excedentes
    // Contact usa 'userId'
    const activeContacts = await Contact.find({ 
      userId: userId, 
      archived: { $ne: true }  // Incluir documentos sin campo 'archived'
    }).sort({ createdAt: 1 });
    
    result.contacts.checked = activeContacts.length;
    
    // Log para debug
    logger.info(`[DEBUG] Contactos activos encontrados: ${activeContacts.length}`);
    if (activeContacts.length === 0) {
      const totalContacts = await Contact.countDocuments({ userId: userId });
      logger.info(`[DEBUG] Usuario ${userId} - Total contactos: ${totalContacts}, Activos: 0`);
    }
    
    if (activeContacts.length > limits.maxContacts) {
      const toArchive = activeContacts.slice(limits.maxContacts);
      
      for (const contact of toArchive) {
        try {
          // Usar updateOne para evitar problemas de validación
          await Contact.updateOne(
            { _id: contact._id },
            {
              $set: {
                archived: true,
                archivedAt: new Date(),
                archivedReason: 'auto_archived_limit_exceeded'
              }
            }
          );
          result.contacts.archived++;
          logger.info(`[ARCHIVE] Contacto archivado: ${contact._id}`);
        } catch (archiveError) {
          logger.error(`Error archivando contacto ${contact._id}:`, archiveError.message);
        }
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
 * Calcular recursos del usuario sin archivar
 */
async function calculateUserResources(userId, targetPlan, taskConfig = null) {
  try {
    const limits = getPlanLimits(targetPlan, taskConfig);

    const result = {
      current: {
        folders: 0,
        calculators: 0,
        contacts: 0
      },
      toArchive: {
        folders: 0,
        calculators: 0,
        contacts: 0
      },
      limits: limits
    };

    // Contar carpetas activas
    const activeFolders = await Folder.countDocuments({
      userId: userId,
      archived: { $ne: true }
    });
    result.current.folders = activeFolders;
    result.toArchive.folders = Math.max(0, activeFolders - limits.maxFolders);

    // Contar calculadoras activas
    const activeCalculators = await Calculator.countDocuments({
      userId: userId,
      archived: { $ne: true }
    });
    result.current.calculators = activeCalculators;
    result.toArchive.calculators = Math.max(0, activeCalculators - limits.maxCalculators);

    // Contar contactos activos
    const activeContacts = await Contact.countDocuments({
      userId: userId,
      archived: { $ne: true }
    });
    result.current.contacts = activeContacts;
    result.toArchive.contacts = Math.max(0, activeContacts - limits.maxContacts);

    return result;
  } catch (error) {
    logger.error('Error calculando recursos del usuario:', error);
    return null;
  }
}

/**
 * Enviar recordatorios de períodos próximos a vencer
 */
async function sendGracePeriodReminders(taskConfig = null) {
  try {
    const now = new Date();

    // Calcular límites al FINAL del día (23:59:59) para capturar todo el día
    const threeDaysFromNow = new Date(now);
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
    threeDaysFromNow.setHours(23, 59, 59, 999);

    const oneDayFromNow = new Date(now);
    oneDayFromNow.setDate(oneDayFromNow.getDate() + 1);
    oneDayFromNow.setHours(23, 59, 59, 999);
    
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
          // Usar Math.floor para contar días completos transcurridos
          const daysRemaining = Math.floor(
            (subscription.downgradeGracePeriod.expiresAt - now) / (1000 * 60 * 60 * 24)
          );

          const targetPlan = subscription.downgradeGracePeriod.targetPlan || 'free';

          // Calcular recursos del usuario
          const resources = await calculateUserResources(user._id, targetPlan, taskConfig);

          if (!resources) {
            logger.error(`No se pudo calcular recursos para usuario ${user._id}`);
            continue;
          }

          // LOG DETALLADO DE RECURSOS CALCULADOS
          logger.info(`[RECURSOS] Usuario: ${user.email} (${user._id})`);
          logger.info(`[RECURSOS] Plan objetivo: ${targetPlan}`);
          logger.info(`[RECURSOS] Días restantes: ${daysRemaining}`);
          logger.info(`[RECURSOS] Recursos actuales: folders=${resources.current.folders}, calculators=${resources.current.calculators}, contacts=${resources.current.contacts}`);
          logger.info(`[RECURSOS] Límites del plan: folders=${resources.limits.maxFolders}, calculators=${resources.limits.maxCalculators}, contacts=${resources.limits.maxContacts}`);
          logger.info(`[RECURSOS] Recursos a archivar: folders=${resources.toArchive.folders}, calculators=${resources.toArchive.calculators}, contacts=${resources.toArchive.contacts}, total=${resources.toArchive.folders + resources.toArchive.calculators + resources.toArchive.contacts}`);

          const emailData = {
            planName: subscription.plan,
            targetPlan: targetPlan,
            daysRemaining: daysRemaining,
            gracePeriodEnd: subscription.downgradeGracePeriod.expiresAt.toLocaleDateString('es-ES'),
            // Recursos actuales
            currentFolders: resources.current.folders,
            currentCalculators: resources.current.calculators,
            currentContacts: resources.current.contacts,
            // Recursos a archivar
            foldersToArchive: resources.toArchive.folders,
            calculatorsToArchive: resources.toArchive.calculators,
            contactsToArchive: resources.toArchive.contacts,
            // Límites del plan objetivo
            planLimits: {
              maxFolders: resources.limits.maxFolders,
              maxCalculators: resources.limits.maxCalculators,
              maxContacts: resources.limits.maxContacts
            }
          };

          if (daysRemaining <= 1 && !subscription.downgradeGracePeriod.reminder1DaySent) {
            emailData.daysRemaining = 1;
            await emailService.sendSubscriptionEmail(user, 'gracePeriodReminder', emailData);

            logger.info(`[UPDATE FLAG] Actualizando reminder1DaysSent para subscription ${subscription._id}`);
            const updateResult = await Subscription.updateOne(
              { _id: subscription._id },
              { $set: { 'downgradeGracePeriod.reminder1DaySent': true } }
            );
            logger.info(`[UPDATE FLAG] Resultado: matchedCount=${updateResult.matchedCount}, modifiedCount=${updateResult.modifiedCount}`);

            sentCount++;
          } else if (daysRemaining <= 3 && !subscription.downgradeGracePeriod.reminder3DaysSent) {
            emailData.daysRemaining = 3;
            await emailService.sendSubscriptionEmail(user, 'gracePeriodReminder', emailData);

            logger.info(`[UPDATE FLAG] Actualizando reminder3DaysSent para subscription ${subscription._id}`);
            const updateResult = await Subscription.updateOne(
              { _id: subscription._id },
              { $set: { 'downgradeGracePeriod.reminder3DaysSent': true } }
            );
            logger.info(`[UPDATE FLAG] Resultado: matchedCount=${updateResult.matchedCount}, modifiedCount=${updateResult.modifiedCount}`);

            sentCount++;
          }
        } else if (subscription.accountStatus === 'grace_period') {
          // Recordatorio de pago fallido
          if (!subscription.paymentFailures.notificationsSent.gracePeriodReminder) {
            const targetPlan = 'free';

            // Calcular recursos del usuario
            const resources = await calculateUserResources(user._id, targetPlan, taskConfig);

            if (!resources) {
              logger.error(`No se pudo calcular recursos para usuario ${user._id}`);
              continue;
            }

            // Calcular fecha de expiración del período de gracia (15 días desde primer fallo)
            const gracePeriodEndDate = new Date(subscription.paymentFailures.firstFailedAt);
            gracePeriodEndDate.setDate(gracePeriodEndDate.getDate() + 15);

            await emailService.sendSubscriptionEmail(user, 'gracePeriodReminder', {
              planName: subscription.plan,
              targetPlan: targetPlan,
              daysRemaining: 15,
              gracePeriodEnd: gracePeriodEndDate.toLocaleDateString('es-ES'),
              // Recursos actuales
              currentFolders: resources.current.folders,
              currentCalculators: resources.current.calculators,
              currentContacts: resources.current.contacts,
              // Recursos a archivar
              foldersToArchive: resources.toArchive.folders,
              calculatorsToArchive: resources.toArchive.calculators,
              contactsToArchive: resources.toArchive.contacts,
              // Límites del plan objetivo
              planLimits: {
                maxFolders: resources.limits.maxFolders,
                maxCalculators: resources.limits.maxCalculators,
                maxContacts: resources.limits.maxContacts
              }
            });
            await Subscription.updateOne(
              { _id: subscription._id },
              {
                $set: {
                  'paymentFailures.notificationsSent.gracePeriodReminder': {
                    sent: true,
                    sentAt: new Date()
                  }
                }
              }
            );
            sentCount++;
          }
        }
        
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
 * Obtener límites del plan desde PlanConfig
 */
async function getPlanLimitsFromConfig(planId) {
  try {
    const planConfig = await PlanConfig.findOne({ planId: planId.toLowerCase() });
    
    if (!planConfig) {
      logger.warn(`PlanConfig no encontrado para planId: ${planId}`);
      // Retornar límites por defecto (free)
      return { maxFolders: 5, maxCalculators: 3, maxContacts: 10, maxStorage: 50 };
    }
    
    // Usar el campo 'features' en lugar de 'resourceLimits'
    const features = planConfig.features || {};
    const limits = {
      maxFolders: features.maxFolders || 5,
      maxCalculators: features.maxCalculators || 3,
      maxContacts: features.maxContacts || 10,
      maxStorage: features.maxStorage || 50
    };
    
    return limits;
  } catch (error) {
    logger.error('Error obteniendo límites del plan:', error);
    // Retornar límites por defecto en caso de error
    return { maxFolders: 5, maxCalculators: 3, maxContacts: 10, maxStorage: 50 };
  }
}

/**
 * Obtener límites del plan (legacy - mantener por compatibilidad)
 */
function getPlanLimits(plan, taskConfig = null) {
  // Intentar obtener límites de la configuración de la tarea
  if (taskConfig && taskConfig.config?.customSettings?.planLimits) {
    const configLimits = taskConfig.config.customSettings.planLimits[plan];
    if (configLimits) {
      logger.info(`[CONFIG] Usando límites de configuración para plan ${plan}`);
      return configLimits;
    }
  }

  // Límites por defecto (legacy)
  const limits = {
    free: { maxFolders: 5, maxCalculators: 3, maxContacts: 10 },
    standard: { maxFolders: 50, maxCalculators: 20, maxContacts: 100 },
    premium: { maxFolders: 500, maxCalculators: 200, maxContacts: 1000 }
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