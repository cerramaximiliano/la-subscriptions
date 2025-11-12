#!/usr/bin/env node

/**
 * Scheduler Dinámico de Tareas Cron
 * Lee configuración desde MongoDB y programa tareas dinámicamente
 * Permite control completo desde la base de datos sin reiniciar servicios
 */

require('dotenv').config();
const mongoose = require('mongoose');
const cron = require('node-cron');
const { fork } = require('child_process');
const logger = require('../utils/logger');
const CronTaskConfig = require('../models/CronTaskConfig');

// Mapa de tareas programadas activas
const scheduledTasks = new Map();

// Intervalo de sincronización con MongoDB (en minutos)
const SYNC_INTERVAL_MINUTES = 5;

// Tareas disponibles y sus scripts
const AVAILABLE_TASKS = {
  'grace-period-processor': './scripts/gracePeriodProcessor.js'
};

/**
 * Inicializar el scheduler
 */
async function initScheduler() {
  try {
    logger.info('========================================');
    logger.info('🚀 SCHEDULER DINÁMICO DE CRON TASKS');
    logger.info(`Fecha/Hora: ${new Date().toISOString()}`);
    logger.info('========================================\n');

    // Conectar a MongoDB
    if (mongoose.connection.readyState !== 1) {
      logger.info('📊 Conectando a MongoDB...');
      await mongoose.connect(process.env.MONGODB_URI || process.env.URLDB);
      logger.info('✅ Conectado a MongoDB exitosamente\n');
    }

    // Cargar y programar tareas iniciales
    await syncTasksFromDatabase();

    // Configurar sincronización periódica
    setInterval(async () => {
      logger.info(`\n🔄 Sincronizando tareas desde MongoDB...`);
      await syncTasksFromDatabase();
    }, SYNC_INTERVAL_MINUTES * 60 * 1000);

    logger.info(`\n✅ Scheduler iniciado exitosamente`);
    logger.info(`📅 Sincronización automática cada ${SYNC_INTERVAL_MINUTES} minutos\n`);
    logger.info('Presiona Ctrl+C para detener el scheduler\n');

  } catch (error) {
    logger.error('❌ ERROR CRÍTICO al inicializar scheduler:', error);
    process.exit(1);
  }
}

/**
 * Sincronizar tareas desde MongoDB
 */
async function syncTasksFromDatabase() {
  try {
    // Obtener todas las tareas configuradas
    const tasks = await CronTaskConfig.find().sort({ priority: -1 });

    logger.info(`📋 Encontradas ${tasks.length} tarea(s) configurada(s)`);

    // Procesar cada tarea
    for (const task of tasks) {
      const taskKey = task.taskName;

      // Verificar si el script existe
      if (!AVAILABLE_TASKS[taskKey]) {
        logger.warn(`⚠️  Tarea "${taskKey}" no tiene script asociado`);
        continue;
      }

      // Si la tarea está habilitada
      if (task.enabled) {
        // Si ya está programada, verificar si cambió la expresión cron o timezone
        if (scheduledTasks.has(taskKey)) {
          const existingTask = scheduledTasks.get(taskKey);

          // Si cambió la expresión cron o timezone, reprogramar
          if (existingTask.cronExpression !== task.cronExpression ||
              existingTask.timezone !== task.timezone) {
            const tzInfo = existingTask.timezone !== task.timezone
              ? ` (timezone: ${existingTask.timezone} → ${task.timezone})`
              : '';
            logger.info(`🔄 Reprogramando "${taskKey}": ${existingTask.cronExpression} → ${task.cronExpression}${tzInfo}`);
            existingTask.task.stop();
            scheduledTasks.delete(taskKey);
            scheduleTask(task);
          } else {
            logger.info(`✅ "${taskKey}" ya está programado: ${task.cronExpression} (${task.timezone})`);
          }
        } else {
          // Programar nueva tarea
          scheduleTask(task);
        }
      } else {
        // Si está deshabilitada pero estaba programada, detenerla
        if (scheduledTasks.has(taskKey)) {
          logger.info(`⏸️  Deteniendo tarea deshabilitada: "${taskKey}"`);
          const existingTask = scheduledTasks.get(taskKey);
          existingTask.task.stop();
          scheduledTasks.delete(taskKey);
        } else {
          logger.info(`⏸️  Tarea deshabilitada: "${taskKey}"`);
        }
      }
    }

    // Limpiar tareas que ya no existen en la base de datos
    const dbTaskNames = tasks.map(t => t.taskName);
    for (const [taskKey, taskData] of scheduledTasks.entries()) {
      if (!dbTaskNames.includes(taskKey)) {
        logger.info(`🗑️  Eliminando tarea que ya no existe: "${taskKey}"`);
        taskData.task.stop();
        scheduledTasks.delete(taskKey);
      }
    }

    logger.info(`\n📊 Estado actual: ${scheduledTasks.size} tarea(s) activa(s)`);

  } catch (error) {
    logger.error('❌ Error sincronizando tareas:', error);
  }
}

/**
 * Programar una tarea con node-cron
 */
function scheduleTask(taskConfig) {
  try {
    const taskName = taskConfig.taskName;
    const cronExpression = taskConfig.cronExpression;
    const timezone = taskConfig.timezone || process.env.TZ || 'America/Argentina/Buenos_Aires';
    const scriptPath = AVAILABLE_TASKS[taskName];

    // Validar expresión cron
    if (!cron.validate(cronExpression)) {
      logger.error(`❌ Expresión cron inválida para "${taskName}": ${cronExpression}`);
      return;
    }

    // Validar timezone
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
    } catch (e) {
      logger.error(`❌ Zona horaria inválida para "${taskName}": ${timezone}`);
      return;
    }

    logger.info(`➕ Programando "${taskName}": ${cronExpression} (${timezone})`);

    // Crear tarea programada
    const task = cron.schedule(cronExpression, async () => {
      await executeTask(taskConfig, scriptPath);
    }, {
      scheduled: true,
      timezone: timezone
    });

    // Guardar en el mapa
    scheduledTasks.set(taskName, {
      task: task,
      cronExpression: cronExpression,
      timezone: timezone,
      scriptPath: scriptPath,
      scheduledAt: new Date()
    });

    logger.info(`✅ Tarea "${taskName}" programada exitosamente`);

  } catch (error) {
    logger.error(`❌ Error programando tarea "${taskConfig.taskName}":`, error);
  }
}

/**
 * Ejecutar una tarea
 */
async function executeTask(taskConfig, scriptPath) {
  const taskName = taskConfig.taskName;
  const startTime = Date.now();

  logger.info('\n========================================');
  logger.info(`🔄 EJECUTANDO TAREA: ${taskName}`);
  logger.info(`Fecha/Hora: ${new Date().toISOString()}`);
  logger.info('========================================\n');

  try {
    // Verificar si hay una ejecución en curso
    const currentConfig = await CronTaskConfig.findOne({ taskName: taskName });

    if (!currentConfig) {
      logger.error(`❌ Configuración no encontrada para "${taskName}"`);
      return;
    }

    if (currentConfig.lastExecution?.status === 'running') {
      logger.warn(`⚠️  La tarea "${taskName}" ya está en ejecución. Saltando esta ejecución.`);
      return;
    }

    // Verificar si sigue habilitada
    if (!currentConfig.enabled) {
      logger.warn(`⚠️  La tarea "${taskName}" fue deshabilitada. Saltando ejecución.`);
      return;
    }

    // Registrar inicio de ejecución
    await currentConfig.startExecution();
    logger.info(`📝 Ejecución registrada en el sistema`);

    // Ejecutar script en proceso separado
    const child = fork(scriptPath, [], {
      cwd: process.cwd(),
      env: process.env,
      silent: false
    });

    // Configurar timeout si está definido
    let timeoutId = null;
    if (currentConfig.config.timeout > 0) {
      timeoutId = setTimeout(() => {
        logger.error(`⏱️  Timeout alcanzado para "${taskName}" (${currentConfig.config.timeout}ms)`);
        child.kill('SIGTERM');
      }, currentConfig.config.timeout);
    }

    // Esperar a que termine el proceso
    const exitCode = await new Promise((resolve, reject) => {
      child.on('exit', (code) => {
        if (timeoutId) clearTimeout(timeoutId);
        resolve(code);
      });

      child.on('error', (error) => {
        if (timeoutId) clearTimeout(timeoutId);
        reject(error);
      });
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    if (exitCode === 0) {
      logger.info(`\n✅ Tarea "${taskName}" completada exitosamente`);
      logger.info(`⏱️  Duración: ${duration} segundos\n`);

      // Registrar éxito
      const updatedConfig = await CronTaskConfig.findOne({ taskName: taskName });
      if (updatedConfig) {
        await updatedConfig.completeExecution({
          exitCode: exitCode,
          duration: parseFloat(duration)
        });
      }
    } else {
      throw new Error(`Proceso terminó con código de salida: ${exitCode}`);
    }

  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.error(`\n❌ Error ejecutando tarea "${taskName}":`, error.message);
    logger.error(`⏱️  Duración: ${duration} segundos\n`);

    // Registrar error
    try {
      const updatedConfig = await CronTaskConfig.findOne({ taskName: taskName });
      if (updatedConfig) {
        await updatedConfig.failExecution(error, {
          duration: parseFloat(duration),
          errorType: error.name,
          errorCode: error.code
        });
      }
    } catch (updateError) {
      logger.error('Error actualizando configuración:', updateError);
    }
  }
}

/**
 * Comando para ver el estado actual del scheduler
 */
function printStatus() {
  logger.info('\n========================================');
  logger.info('📊 ESTADO DEL SCHEDULER');
  logger.info('========================================\n');

  if (scheduledTasks.size === 0) {
    logger.info('⚠️  No hay tareas programadas actualmente\n');
    return;
  }

  logger.info(`Tareas activas: ${scheduledTasks.size}\n`);

  for (const [taskName, taskData] of scheduledTasks.entries()) {
    logger.info(`📋 ${taskName}`);
    logger.info(`   Expresión cron: ${taskData.cronExpression}`);
    logger.info(`   Script: ${taskData.scriptPath}`);
    logger.info(`   Programado desde: ${taskData.scheduledAt.toLocaleString('es-ES')}`);
    logger.info('');
  }

  logger.info('========================================\n');
}

/**
 * Manejo de señales para shutdown limpio
 */
process.on('SIGINT', async () => {
  logger.info('\n\n========================================');
  logger.info('🛑 Deteniendo scheduler...');
  logger.info('========================================\n');

  // Detener todas las tareas programadas
  for (const [taskName, taskData] of scheduledTasks.entries()) {
    logger.info(`⏹️  Deteniendo: ${taskName}`);
    taskData.task.stop();
  }

  scheduledTasks.clear();

  // Cerrar conexión a MongoDB
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.close();
    logger.info('🔌 Conexión a MongoDB cerrada');
  }

  logger.info('\n✅ Scheduler detenido correctamente\n');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('\n\n========================================');
  logger.info('🛑 SIGTERM recibido. Deteniendo scheduler...');
  logger.info('========================================\n');

  // Detener todas las tareas programadas
  for (const [taskName, taskData] of scheduledTasks.entries()) {
    logger.info(`⏹️  Deteniendo: ${taskName}`);
    taskData.task.stop();
  }

  scheduledTasks.clear();

  // Cerrar conexión a MongoDB
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.close();
    logger.info('🔌 Conexión a MongoDB cerrada');
  }

  logger.info('\n✅ Scheduler detenido correctamente\n');
  process.exit(0);
});

// Manejar errores no capturados
process.on('uncaughtException', (error) => {
  logger.error('❌ Excepción no capturada:', error);
});

process.on('unhandledRejection', (error) => {
  logger.error('❌ Promesa rechazada no manejada:', error);
});

// Iniciar scheduler si se ejecuta directamente
if (require.main === module) {
  initScheduler()
    .then(() => {
      // Mostrar estado cada 30 minutos
      setInterval(() => {
        printStatus();
      }, 30 * 60 * 1000);
    })
    .catch((error) => {
      logger.error('❌ Error fatal:', error);
      process.exit(1);
    });
}

module.exports = {
  initScheduler,
  syncTasksFromDatabase,
  printStatus
};
