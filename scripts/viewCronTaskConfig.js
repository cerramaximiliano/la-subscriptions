#!/usr/bin/env node

/**
 * Script para visualizar la configuración de cron tasks
 * Muestra el estado actual y estadísticas
 */

require('dotenv').config();
const mongoose = require('mongoose');
const logger = require('../utils/logger');
const CronTaskConfig = require('../models/CronTaskConfig');

/**
 * Visualizar configuración de cron tasks
 */
async function viewCronTaskConfig(taskName = null) {
  try {
    logger.info('========================================');
    logger.info('👀 VISUALIZACIÓN DE CONFIGURACIÓN DE CRON TASKS');
    logger.info(`Fecha/Hora: ${new Date().toISOString()}`);
    logger.info('========================================\n');

    // Conectar a MongoDB
    if (mongoose.connection.readyState !== 1) {
      logger.info('📊 Conectando a MongoDB...');
      await mongoose.connect(process.env.MONGODB_URI || process.env.URLDB);
      logger.info('✅ Conectado a MongoDB exitosamente\n');
    }

    let configs;

    if (taskName) {
      // Buscar tarea específica
      const config = await CronTaskConfig.findOne({ taskName: taskName });
      if (!config) {
        logger.warn(`⚠️  No se encontró la tarea: ${taskName}`);
        return;
      }
      configs = [config];
    } else {
      // Obtener todas las tareas
      configs = await CronTaskConfig.find().sort({ priority: -1, taskName: 1 });
      if (configs.length === 0) {
        logger.warn('⚠️  No hay tareas configuradas');
        logger.info('\n💡 Para crear la configuración inicial, ejecuta:');
        logger.info('   node scripts/initCronTaskConfig.js');
        return;
      }
    }

    logger.info(`📋 Encontradas ${configs.length} tarea(s) configurada(s)\n`);

    // Mostrar cada configuración
    for (const config of configs) {
      displayTaskConfig(config);
      logger.info('\n' + '─'.repeat(80) + '\n');
    }

    // Resumen general
    if (configs.length > 1) {
      displaySummary(configs);
    }

    logger.info('✅ Visualización completada');

  } catch (error) {
    logger.error('❌ ERROR en visualización:', error);
    throw error;

  } finally {
    // Cerrar conexión
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      logger.info('\n🔌 Conexión a MongoDB cerrada');
    }
  }
}

/**
 * Mostrar configuración de una tarea
 */
function displayTaskConfig(config) {
  const now = new Date();
  const isEnabled = config.enabled;
  const isPending = config.nextExecution && config.nextExecution <= now;
  const isRunning = config.lastExecution?.status === 'running';

  // Encabezado con estado
  let statusEmoji = '⏸️';
  let statusText = 'Deshabilitado';

  if (isEnabled) {
    if (isRunning) {
      statusEmoji = '🔄';
      statusText = 'En ejecución';
    } else if (isPending) {
      statusEmoji = '⏰';
      statusText = 'Pendiente de ejecución';
    } else {
      statusEmoji = '✅';
      statusText = 'Habilitado';
    }
  }

  logger.info(`${statusEmoji} ${config.taskName.toUpperCase()}`);
  logger.info(`Estado: ${statusText}`);
  logger.info(`\nDescripción:`);
  logger.info(`  ${config.taskDescription}`);

  logger.info(`\n📅 Programación:`);
  logger.info(`  Expresión cron: ${config.cronExpression}`);
  logger.info(`  Zona horaria: ${config.timezone || 'No configurada (usando TZ del servidor)'}`);
  logger.info(`  Prioridad: ${config.priority}/10`);
  logger.info(`  Próxima ejecución: ${config.nextExecution ? config.nextExecution.toLocaleString('es-ES') : 'No calculada'}`);

  if (config.nextExecution) {
    const timeUntil = config.nextExecution - now;
    if (timeUntil > 0) {
      const hours = Math.floor(timeUntil / (1000 * 60 * 60));
      const minutes = Math.floor((timeUntil % (1000 * 60 * 60)) / (1000 * 60));
      logger.info(`  Tiempo restante: ${hours}h ${minutes}m`);
    } else {
      logger.info(`  ⚠️  Ejecución atrasada por: ${Math.abs(Math.floor(timeUntil / (1000 * 60)))} minutos`);
    }
  }

  logger.info(`\n⚙️  Configuración:`);
  logger.info(`  Timeout: ${config.config.timeout > 0 ? `${config.config.timeout / 1000}s` : 'Sin límite'}`);
  logger.info(`  Reintentos en error: ${config.config.retryOnError ? `Sí (máx ${config.config.maxRetries})` : 'No'}`);

  if (config.config.gracePeriod) {
    logger.info(`\n  Período de Gracia:`);
    logger.info(`    Días por defecto: ${config.config.gracePeriod.defaultDays}`);
    logger.info(`    Recordatorios: ${config.config.gracePeriod.reminderDays.join(', ')} días antes`);
    logger.info(`    Auto-archivado: ${config.config.gracePeriod.enableAutoArchive ? 'Habilitado' : 'Deshabilitado'}`);
    logger.info(`    Limpieza: Después de ${config.config.gracePeriod.cleanupAfterDays} días`);
  }

  logger.info(`\n📊 Estadísticas:`);
  logger.info(`  Total ejecuciones: ${config.statistics.totalExecutions}`);
  logger.info(`  Exitosas: ${config.statistics.successfulExecutions} (${config.statistics.totalExecutions > 0 ? ((config.statistics.successfulExecutions / config.statistics.totalExecutions) * 100).toFixed(1) : 0}%)`);
  logger.info(`  Fallidas: ${config.statistics.failedExecutions} (${config.statistics.totalExecutions > 0 ? ((config.statistics.failedExecutions / config.statistics.totalExecutions) * 100).toFixed(1) : 0}%)`);
  logger.info(`  Duración promedio: ${config.statistics.averageDuration > 0 ? config.statistics.averageDuration.toFixed(2) + 's' : 'N/A'}`);

  if (config.statistics.lastSuccessAt) {
    const timeSince = now - config.statistics.lastSuccessAt;
    const hoursSince = Math.floor(timeSince / (1000 * 60 * 60));
    logger.info(`  Último éxito: ${config.statistics.lastSuccessAt.toLocaleString('es-ES')} (hace ${hoursSince}h)`);
  }

  if (config.statistics.lastFailureAt) {
    const timeSince = now - config.statistics.lastFailureAt;
    const hoursSince = Math.floor(timeSince / (1000 * 60 * 60));
    logger.info(`  Último fallo: ${config.statistics.lastFailureAt.toLocaleString('es-ES')} (hace ${hoursSince}h)`);
  }

  logger.info(`\n📧 Notificaciones:`);
  logger.info(`  En éxito: ${config.notifications.onSuccess.enabled ? 'Habilitado' : 'Deshabilitado'}`);
  logger.info(`  En error: ${config.notifications.onError.enabled ? 'Habilitado' : 'Deshabilitado'}`);
  logger.info(`  En timeout: ${config.notifications.onTimeout.enabled ? 'Habilitado' : 'Deshabilitado'}`);

  const allRecipients = [
    ...config.notifications.onSuccess.recipients,
    ...config.notifications.onError.recipients,
    ...config.notifications.onTimeout.recipients
  ];
  const uniqueRecipients = [...new Set(allRecipients)];

  if (uniqueRecipients.length > 0) {
    logger.info(`  Destinatarios: ${uniqueRecipients.join(', ')}`);
  }

  if (config.lastExecution?.status) {
    logger.info(`\n📝 Última ejecución:`);
    logger.info(`  Estado: ${config.lastExecution.status}`);
    logger.info(`  Inicio: ${config.lastExecution.startedAt?.toLocaleString('es-ES') || 'N/A'}`);
    logger.info(`  Fin: ${config.lastExecution.completedAt?.toLocaleString('es-ES') || 'N/A'}`);
    logger.info(`  Duración: ${config.lastExecution.duration ? config.lastExecution.duration.toFixed(2) + 's' : 'N/A'}`);

    if (config.lastExecution.status === 'error' && config.lastExecution.errorMessage) {
      logger.info(`  Error: ${config.lastExecution.errorMessage}`);
    }

    if (config.lastExecution.details && Object.keys(config.lastExecution.details).length > 0) {
      logger.info(`  Detalles: ${JSON.stringify(config.lastExecution.details, null, 2)}`);
    }
  }

  // Historial reciente (últimas 5 ejecuciones)
  if (config.executionHistory && config.executionHistory.length > 0) {
    logger.info(`\n📜 Historial reciente (últimas 5 ejecuciones):`);
    const recentHistory = config.executionHistory.slice(-5).reverse();

    recentHistory.forEach((execution, index) => {
      const emoji = execution.status === 'success' ? '✅' : execution.status === 'error' ? '❌' : '⏱️';
      logger.info(`  ${emoji} ${execution.startedAt.toLocaleString('es-ES')} - ${execution.status} - ${execution.duration?.toFixed(2) || 'N/A'}s`);
    });
  }

  logger.info(`\n🗒️  Metadata:`);
  logger.info(`  Creado: ${config.createdAt.toLocaleString('es-ES')}`);
  logger.info(`  Actualizado: ${config.updatedAt.toLocaleString('es-ES')}`);
  logger.info(`  Creado por: ${config.createdBy}`);
  if (config.updatedBy) {
    logger.info(`  Actualizado por: ${config.updatedBy}`);
  }
  if (config.notes) {
    logger.info(`  Notas: ${config.notes}`);
  }
}

/**
 * Mostrar resumen general
 */
function displaySummary(configs) {
  logger.info('📈 RESUMEN GENERAL');
  logger.info('─'.repeat(80));

  const totalTasks = configs.length;
  const enabledTasks = configs.filter(c => c.enabled).length;
  const disabledTasks = totalTasks - enabledTasks;
  const runningTasks = configs.filter(c => c.lastExecution?.status === 'running').length;

  const now = new Date();
  const pendingTasks = configs.filter(c => c.enabled && c.nextExecution && c.nextExecution <= now).length;

  const totalExecutions = configs.reduce((sum, c) => sum + c.statistics.totalExecutions, 0);
  const totalSuccess = configs.reduce((sum, c) => sum + c.statistics.successfulExecutions, 0);
  const totalFailures = configs.reduce((sum, c) => sum + c.statistics.failedExecutions, 0);

  logger.info(`Total de tareas: ${totalTasks}`);
  logger.info(`  Habilitadas: ${enabledTasks}`);
  logger.info(`  Deshabilitadas: ${disabledTasks}`);
  logger.info(`  En ejecución: ${runningTasks}`);
  logger.info(`  Pendientes: ${pendingTasks}`);

  logger.info(`\nEjecuciones totales: ${totalExecutions}`);
  logger.info(`  Exitosas: ${totalSuccess} (${totalExecutions > 0 ? ((totalSuccess / totalExecutions) * 100).toFixed(1) : 0}%)`);
  logger.info(`  Fallidas: ${totalFailures} (${totalExecutions > 0 ? ((totalFailures / totalExecutions) * 100).toFixed(1) : 0}%)`);

  logger.info('\n');
}

// Ejecutar si se llama directamente
if (require.main === module) {
  // Obtener nombre de tarea de argumentos
  const taskName = process.argv[2];

  viewCronTaskConfig(taskName)
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      logger.error('❌ Script falló:', error);
      process.exit(1);
    });
}

module.exports = viewCronTaskConfig;
