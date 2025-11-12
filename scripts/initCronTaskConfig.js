#!/usr/bin/env node

/**
 * Script de inicialización de configuración de cron tasks
 * Crea o actualiza la configuración del grace-period-processor
 */

require('dotenv').config();
const mongoose = require('mongoose');
const logger = require('../utils/logger');
const CronTaskConfig = require('../models/CronTaskConfig');

/**
 * Configuración inicial del grace-period-processor
 */
const GRACE_PERIOD_CONFIG = {
  taskName: 'grace-period-processor',
  taskDescription: 'Procesa períodos de gracia vencidos, envía recordatorios y archiva contenido excedente',
  cronExpression: '0 23 * * *', // Todos los días a las 11 PM (23:00)
  timezone: 'America/Argentina/Buenos_Aires', // Zona horaria de Buenos Aires, Argentina
  enabled: true,
  priority: 8,
  config: {
    timeout: 600000, // 10 minutos
    retryOnError: false,
    maxRetries: 0,
    retryDelay: 60000,
    gracePeriod: {
      defaultDays: 15,
      reminderDays: [3, 1],
      enableAutoArchive: true,
      cleanupAfterDays: 30
    },
    customSettings: {
      // Límites de planes
      planLimits: {
        free: {
          maxFolders: 5,
          maxCalculators: 3,
          maxContacts: 10
        },
        standard: {
          maxFolders: 50,
          maxCalculators: 20,
          maxContacts: 100
        },
        premium: {
          maxFolders: 999999,
          maxCalculators: 999999,
          maxContacts: 999999
        }
      },
      // Configuración de procesamiento
      processingConfig: {
        // Máximo de suscripciones a procesar por ejecución (0 = ilimitado)
        maxSubscriptionsPerRun: 0,
        // Retrasar procesamiento si hay más de N suscripciones pendientes
        batchSize: 10,
        // Delay entre lotes (en ms)
        batchDelay: 1000
      }
    }
  },
  notifications: {
    onSuccess: {
      enabled: false,
      recipients: []
    },
    onError: {
      enabled: true,
      recipients: process.env.ADMIN_EMAIL ? [process.env.ADMIN_EMAIL] : []
    },
    onTimeout: {
      enabled: true,
      recipients: process.env.ADMIN_EMAIL ? [process.env.ADMIN_EMAIL] : []
    }
  },
  createdBy: 'init-script',
  notes: 'Configuración inicial del procesador de períodos de gracia'
};

/**
 * Inicializar o actualizar configuración
 */
async function initializeCronTaskConfig() {
  const startTime = Date.now();

  try {
    logger.info('========================================');
    logger.info('🚀 INICIALIZACIÓN DE CONFIGURACIÓN DE CRON TASKS');
    logger.info(`Fecha/Hora: ${new Date().toISOString()}`);
    logger.info('========================================\n');

    // Conectar a MongoDB
    if (mongoose.connection.readyState !== 1) {
      logger.info('📊 Conectando a MongoDB...');
      await mongoose.connect(process.env.MONGODB_URI || process.env.URLDB);
      logger.info('✅ Conectado a MongoDB exitosamente\n');
    }

    // Verificar si ya existe la configuración
    let existingConfig = await CronTaskConfig.findOne({
      taskName: GRACE_PERIOD_CONFIG.taskName
    });

    if (existingConfig) {
      logger.info(`📝 Configuración existente encontrada para: ${GRACE_PERIOD_CONFIG.taskName}`);
      logger.info('   Estado actual:');
      logger.info(`   - Habilitado: ${existingConfig.enabled ? 'Sí' : 'No'}`);
      logger.info(`   - Expresión cron: ${existingConfig.cronExpression}`);
      logger.info(`   - Última ejecución: ${existingConfig.lastExecution?.startedAt || 'Nunca'}`);
      logger.info(`   - Próxima ejecución: ${existingConfig.nextExecution || 'No calculada'}`);
      logger.info(`   - Total ejecuciones: ${existingConfig.statistics.totalExecutions}`);
      logger.info(`   - Ejecuciones exitosas: ${existingConfig.statistics.successfulExecutions}`);
      logger.info(`   - Ejecuciones fallidas: ${existingConfig.statistics.failedExecutions}\n`);

      // Preguntar si desea actualizar
      logger.info('💡 ¿Desea actualizar la configuración?');
      logger.info('   Por seguridad, mantendremos el estado enabled y las estadísticas existentes\n');

      // Actualizar solo campos específicos, manteniendo estado y estadísticas
      existingConfig.taskDescription = GRACE_PERIOD_CONFIG.taskDescription;
      existingConfig.cronExpression = GRACE_PERIOD_CONFIG.cronExpression;
      existingConfig.priority = GRACE_PERIOD_CONFIG.priority;
      existingConfig.config = GRACE_PERIOD_CONFIG.config;
      existingConfig.notifications = GRACE_PERIOD_CONFIG.notifications;
      existingConfig.updatedBy = 'init-script';
      existingConfig.notes = `Actualizado: ${new Date().toISOString()}`;

      // Recalcular próxima ejecución
      existingConfig.nextExecution = existingConfig.calculateNextExecution();

      await existingConfig.save();

      logger.info('✅ Configuración actualizada exitosamente');

    } else {
      logger.info(`📝 Creando nueva configuración para: ${GRACE_PERIOD_CONFIG.taskName}`);

      // Calcular próxima ejecución
      const newConfig = new CronTaskConfig(GRACE_PERIOD_CONFIG);
      newConfig.nextExecution = newConfig.calculateNextExecution();

      await newConfig.save();

      logger.info('✅ Configuración creada exitosamente');
    }

    // Mostrar configuración final
    const finalConfig = await CronTaskConfig.findOne({
      taskName: GRACE_PERIOD_CONFIG.taskName
    });

    logger.info('\n========================================');
    logger.info('📋 CONFIGURACIÓN FINAL');
    logger.info('========================================');
    logger.info(`Nombre: ${finalConfig.taskName}`);
    logger.info(`Descripción: ${finalConfig.taskDescription}`);
    logger.info(`Expresión cron: ${finalConfig.cronExpression}`);
    logger.info(`Zona horaria: ${finalConfig.timezone}`);
    logger.info(`Habilitado: ${finalConfig.enabled ? 'Sí' : 'No'}`);
    logger.info(`Prioridad: ${finalConfig.priority}`);
    logger.info(`Próxima ejecución: ${finalConfig.nextExecution}`);
    logger.info(`Timeout: ${finalConfig.config.timeout}ms`);
    logger.info(`Reintentos: ${finalConfig.config.maxRetries}`);
    logger.info('\nConfiguración de período de gracia:');
    logger.info(`  - Días por defecto: ${finalConfig.config.gracePeriod.defaultDays}`);
    logger.info(`  - Días de recordatorios: ${finalConfig.config.gracePeriod.reminderDays.join(', ')}`);
    logger.info(`  - Auto-archivado: ${finalConfig.config.gracePeriod.enableAutoArchive ? 'Habilitado' : 'Deshabilitado'}`);
    logger.info(`  - Limpieza después de: ${finalConfig.config.gracePeriod.cleanupAfterDays} días`);
    logger.info('\nNotificaciones:');
    logger.info(`  - En error: ${finalConfig.notifications.onError.enabled ? 'Habilitado' : 'Deshabilitado'}`);
    if (finalConfig.notifications.onError.recipients.length > 0) {
      logger.info(`  - Destinatarios: ${finalConfig.notifications.onError.recipients.join(', ')}`);
    }
    logger.info('\nEstadísticas:');
    logger.info(`  - Total ejecuciones: ${finalConfig.statistics.totalExecutions}`);
    logger.info(`  - Exitosas: ${finalConfig.statistics.successfulExecutions}`);
    logger.info(`  - Fallidas: ${finalConfig.statistics.failedExecutions}`);
    logger.info(`  - Duración promedio: ${finalConfig.statistics.averageDuration.toFixed(2)}s`);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.info(`\n⏱️  Tiempo total: ${duration} segundos`);
    logger.info('========================================\n');

    logger.info('✅ Inicialización completada exitosamente');
    logger.info('\n💡 Comandos útiles:');
    logger.info('   - Ver configuración: node scripts/viewCronTaskConfig.js');
    logger.info('   - Habilitar/deshabilitar: Editar directamente en MongoDB');
    logger.info('   - Ejecutar manualmente: node scripts/gracePeriodProcessor.js');

    return {
      success: true,
      config: finalConfig
    };

  } catch (error) {
    logger.error('❌ ERROR CRÍTICO en inicialización:', error);
    logger.error('Stack trace:', error.stack);
    throw error;

  } finally {
    // Cerrar conexión
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      logger.info('\n🔌 Conexión a MongoDB cerrada');
    }
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  initializeCronTaskConfig()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      logger.error('❌ Script falló:', error);
      process.exit(1);
    });
}

module.exports = initializeCronTaskConfig;
