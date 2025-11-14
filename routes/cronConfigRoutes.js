/**
 * Rutas para gestión de configuración de tareas cron
 */
const express = require('express');
const router = express.Router();
const cronConfigController = require('../controllers/cronConfigController');
const logger = require('../utils/logger');

/**
 * Middleware para logging de requests
 */
const requestLogger = (req, res, next) => {
  logger.info(`⚙️ Cron Config Request: ${req.method} ${req.originalUrl}`);
  next();
};

// Aplicar logging a todas las rutas
router.use(requestLogger);

/**
 * GET /api/cron-config
 * Obtiene toda la configuración de tareas cron
 *
 * Query params opcionales:
 * - taskName: filtrar por nombre de tarea
 * - enabled: filtrar por estado (true/false)
 * - includeHistory: incluir historial de ejecuciones (true/false)
 *
 * Respuesta exitosa (200):
 * {
 *   success: true,
 *   count: number,
 *   data: CronTaskConfig[]
 * }
 */
router.get('/', cronConfigController.getAllConfigs);

/**
 * GET /api/cron-config/:taskName
 * Obtiene la configuración de una tarea específica
 *
 * Params:
 * - taskName: nombre de la tarea
 *
 * Query params opcionales:
 * - includeHistory: incluir historial completo (true/false)
 *
 * Respuesta exitosa (200):
 * {
 *   success: true,
 *   data: CronTaskConfig
 * }
 *
 * Respuesta error (404):
 * {
 *   success: false,
 *   error: 'Tarea no encontrada',
 *   taskName: string
 * }
 */
router.get('/:taskName', cronConfigController.getConfigByName);

/**
 * GET /api/cron-config/:taskName/statistics
 * Obtiene estadísticas de ejecución de una tarea
 *
 * Params:
 * - taskName: nombre de la tarea
 *
 * Respuesta exitosa (200):
 * {
 *   success: true,
 *   data: {
 *     taskName: string,
 *     enabled: boolean,
 *     statistics: {
 *       totalExecutions: number,
 *       successfulExecutions: number,
 *       failedExecutions: number,
 *       averageDuration: number,
 *       lastSuccessAt: Date,
 *       lastFailureAt: Date
 *     },
 *     lastExecution: object,
 *     nextExecution: Date
 *   }
 * }
 */
router.get('/:taskName/statistics', cronConfigController.getStatistics);

/**
 * GET /api/cron-config/:taskName/history
 * Obtiene el historial de ejecuciones
 *
 * Params:
 * - taskName: nombre de la tarea
 *
 * Query params opcionales:
 * - limit: número máximo de ejecuciones (default: 50)
 * - status: filtrar por estado (success, error, running, timeout)
 *
 * Respuesta exitosa (200):
 * {
 *   success: true,
 *   taskName: string,
 *   count: number,
 *   data: Array<{
 *     startedAt: Date,
 *     completedAt: Date,
 *     status: string,
 *     duration: number,
 *     details: object,
 *     errorMessage: string
 *   }>
 * }
 */
router.get('/:taskName/history', cronConfigController.getExecutionHistory);

/**
 * PUT /api/cron-config/:taskName
 * Actualiza la configuración de una tarea
 *
 * Params:
 * - taskName: nombre de la tarea a actualizar
 *
 * Body (todos opcionales):
 * {
 *   taskDescription?: string,
 *   cronExpression?: string,
 *   timezone?: string,
 *   enabled?: boolean,
 *   priority?: number (1-10),
 *   config?: {
 *     timeout?: number,
 *     retryOnError?: boolean,
 *     maxRetries?: number,
 *     retryDelay?: number,
 *     gracePeriod?: {
 *       defaultDays?: number,
 *       reminderDays?: number[],
 *       enableAutoArchive?: boolean,
 *       cleanupAfterDays?: number
 *     },
 *     customSettings?: object
 *   },
 *   notifications?: {
 *     onSuccess?: { enabled: boolean, recipients: string[] },
 *     onError?: { enabled: boolean, recipients: string[] },
 *     onTimeout?: { enabled: boolean, recipients: string[] }
 *   },
 *   updatedBy?: string,
 *   notes?: string
 * }
 *
 * Respuesta exitosa (200):
 * {
 *   success: true,
 *   message: 'Configuración actualizada exitosamente',
 *   data: CronTaskConfig,
 *   updated: {
 *     fields: string[],
 *     timestamp: Date
 *   }
 * }
 *
 * Respuesta error validación (400):
 * {
 *   success: false,
 *   error: 'Error de validación',
 *   message: string,
 *   details: Array<{ field: string, message: string }>
 * }
 */
router.put('/:taskName', express.json(), cronConfigController.updateConfig);

/**
 * PATCH /api/cron-config/:taskName/toggle
 * Alterna el estado enabled de una tarea
 *
 * Params:
 * - taskName: nombre de la tarea
 *
 * Body (opcional):
 * {
 *   enabled?: boolean,  // si no se envía, se alterna el estado actual
 *   updatedBy?: string
 * }
 *
 * Respuesta exitosa (200):
 * {
 *   success: true,
 *   message: string,
 *   data: {
 *     taskName: string,
 *     enabled: boolean,
 *     previousState: boolean,
 *     nextExecution: Date
 *   }
 * }
 */
router.patch('/:taskName/toggle', express.json(), cronConfigController.toggleEnabled);

/**
 * Health check del servicio
 */
router.get('/health/check', (req, res) => {
  res.json({
    status: 'ok',
    service: 'cron-config-api',
    timestamp: new Date(),
    environment: process.env.NODE_ENV
  });
});

/**
 * Manejo de errores 404 para rutas no encontradas
 */
router.use('*', (req, res) => {
  logger.warn(`Cron config endpoint no encontrado: ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    error: 'Endpoint no encontrado',
    path: req.originalUrl
  });
});

module.exports = router;
