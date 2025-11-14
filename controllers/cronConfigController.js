/**
 * Controlador para gestión de configuración de tareas cron
 */
const CronTaskConfig = require('../models/CronTaskConfig');
const logger = require('../utils/logger');

/**
 * GET /api/cron-config
 * Obtiene toda la configuración de tareas cron
 *
 * Query params opcionales:
 * - taskName: filtrar por nombre de tarea
 * - enabled: filtrar por estado (true/false)
 * - includeHistory: incluir historial de ejecuciones (true/false)
 */
const getAllConfigs = async (req, res) => {
  try {
    const { taskName, enabled, includeHistory } = req.query;

    // Construir filtros
    const filters = {};
    if (taskName) {
      filters.taskName = taskName;
    }
    if (enabled !== undefined) {
      filters.enabled = enabled === 'true';
    }

    logger.info(`📋 Obteniendo configuración de tareas cron`, { filters });

    // Consulta base
    let query = CronTaskConfig.find(filters);

    // Si no se solicita historial, excluirlo para reducir tamaño de respuesta
    if (includeHistory !== 'true') {
      query = query.select('-executionHistory');
    }

    const configs = await query.sort({ taskName: 1 });

    logger.info(`✅ Se encontraron ${configs.length} configuraciones`);

    res.json({
      success: true,
      count: configs.length,
      data: configs
    });

  } catch (error) {
    logger.error('❌ Error al obtener configuraciones:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener configuraciones',
      message: error.message
    });
  }
};

/**
 * GET /api/cron-config/:taskName
 * Obtiene la configuración de una tarea específica por nombre
 *
 * Params:
 * - taskName: nombre de la tarea
 *
 * Query params opcionales:
 * - includeHistory: incluir historial completo (true/false)
 */
const getConfigByName = async (req, res) => {
  try {
    const { taskName } = req.params;
    const { includeHistory } = req.query;

    logger.info(`📋 Obteniendo configuración de tarea: ${taskName}`);

    let query = CronTaskConfig.findOne({ taskName });

    // Si no se solicita historial, excluirlo
    if (includeHistory !== 'true') {
      query = query.select('-executionHistory');
    }

    const config = await query;

    if (!config) {
      logger.warn(`⚠️ Tarea no encontrada: ${taskName}`);
      return res.status(404).json({
        success: false,
        error: 'Tarea no encontrada',
        taskName
      });
    }

    logger.info(`✅ Configuración encontrada: ${taskName}`);

    res.json({
      success: true,
      data: config
    });

  } catch (error) {
    logger.error('❌ Error al obtener configuración:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener configuración',
      message: error.message
    });
  }
};

/**
 * PUT /api/cron-config/:taskName
 * Actualiza la configuración de una tarea específica
 *
 * Params:
 * - taskName: nombre de la tarea a actualizar
 *
 * Body (todos opcionales, solo se actualizan los campos enviados):
 * - taskDescription: descripción de la tarea
 * - cronExpression: expresión cron
 * - timezone: zona horaria
 * - enabled: habilitar/deshabilitar tarea
 * - priority: prioridad (1-10)
 * - config: objeto con configuración específica
 *   - timeout: timeout en ms
 *   - retryOnError: reintentar en error
 *   - maxRetries: máximo de reintentos
 *   - retryDelay: delay entre reintentos
 *   - gracePeriod: configuración de período de gracia
 *     - defaultDays: días de gracia por defecto
 *     - reminderDays: array de días para recordatorios
 *     - enableAutoArchive: habilitar auto-archivado
 *     - cleanupAfterDays: días para limpiar datos obsoletos
 *   - customSettings: configuración personalizada
 * - notifications: configuración de notificaciones
 *   - onSuccess: { enabled, recipients[] }
 *   - onError: { enabled, recipients[] }
 *   - onTimeout: { enabled, recipients[] }
 * - updatedBy: usuario que realiza la actualización
 * - notes: notas sobre la actualización
 */
const updateConfig = async (req, res) => {
  try {
    const { taskName } = req.params;
    const updates = req.body;

    logger.info(`🔧 Actualizando configuración de tarea: ${taskName}`, {
      updates: Object.keys(updates)
    });

    // Buscar la tarea
    const config = await CronTaskConfig.findOne({ taskName });

    if (!config) {
      logger.warn(`⚠️ Tarea no encontrada: ${taskName}`);
      return res.status(404).json({
        success: false,
        error: 'Tarea no encontrada',
        taskName
      });
    }

    // Campos que se pueden actualizar directamente
    const allowedDirectUpdates = [
      'taskDescription',
      'cronExpression',
      'timezone',
      'enabled',
      'priority',
      'updatedBy',
      'notes'
    ];

    // Actualizar campos directos
    allowedDirectUpdates.forEach(field => {
      if (updates[field] !== undefined) {
        config[field] = updates[field];
      }
    });

    // Actualizar config anidado (merge)
    if (updates.config) {
      config.config = {
        ...config.config.toObject(),
        ...updates.config
      };

      // Si se actualiza gracePeriod, hacer merge profundo
      if (updates.config.gracePeriod) {
        config.config.gracePeriod = {
          ...config.config.gracePeriod,
          ...updates.config.gracePeriod
        };
      }
    }

    // Actualizar notifications anidado (merge)
    if (updates.notifications) {
      config.notifications = {
        onSuccess: {
          ...config.notifications.onSuccess,
          ...(updates.notifications.onSuccess || {})
        },
        onError: {
          ...config.notifications.onError,
          ...(updates.notifications.onError || {})
        },
        onTimeout: {
          ...config.notifications.onTimeout,
          ...(updates.notifications.onTimeout || {})
        }
      };
    }

    // Recalcular nextExecution si se cambió cronExpression o si se habilitó la tarea
    if (updates.cronExpression || (updates.enabled && !config.enabled)) {
      config.nextExecution = config.calculateNextExecution();
      logger.info(`📅 Próxima ejecución recalculada: ${config.nextExecution}`);
    }

    // Guardar cambios
    await config.save();

    logger.info(`✅ Configuración actualizada exitosamente: ${taskName}`);

    res.json({
      success: true,
      message: 'Configuración actualizada exitosamente',
      data: config,
      updated: {
        fields: Object.keys(updates),
        timestamp: new Date()
      }
    });

  } catch (error) {
    logger.error('❌ Error al actualizar configuración:', error);

    // Manejar errores de validación
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        error: 'Error de validación',
        message: error.message,
        details: Object.keys(error.errors).map(key => ({
          field: key,
          message: error.errors[key].message
        }))
      });
    }

    res.status(500).json({
      success: false,
      error: 'Error al actualizar configuración',
      message: error.message
    });
  }
};

/**
 * PATCH /api/cron-config/:taskName/toggle
 * Alterna el estado enabled de una tarea (habilitar/deshabilitar)
 *
 * Params:
 * - taskName: nombre de la tarea
 *
 * Body opcional:
 * - enabled: true/false (si no se envía, se alterna el estado actual)
 * - updatedBy: usuario que realiza el cambio
 */
const toggleEnabled = async (req, res) => {
  try {
    const { taskName } = req.params;
    const { enabled, updatedBy } = req.body;

    logger.info(`🔄 Alternando estado de tarea: ${taskName}`);

    const config = await CronTaskConfig.findOne({ taskName });

    if (!config) {
      logger.warn(`⚠️ Tarea no encontrada: ${taskName}`);
      return res.status(404).json({
        success: false,
        error: 'Tarea no encontrada',
        taskName
      });
    }

    const previousState = config.enabled;
    config.enabled = enabled !== undefined ? enabled : !config.enabled;

    if (updatedBy) {
      config.updatedBy = updatedBy;
    }

    // Si se habilita, recalcular nextExecution
    if (config.enabled && !previousState) {
      config.nextExecution = config.calculateNextExecution();
      logger.info(`📅 Tarea habilitada. Próxima ejecución: ${config.nextExecution}`);
    }

    await config.save();

    logger.info(`✅ Estado cambiado: ${previousState} → ${config.enabled}`);

    res.json({
      success: true,
      message: `Tarea ${config.enabled ? 'habilitada' : 'deshabilitada'} exitosamente`,
      data: {
        taskName: config.taskName,
        enabled: config.enabled,
        previousState,
        nextExecution: config.nextExecution
      }
    });

  } catch (error) {
    logger.error('❌ Error al alternar estado:', error);
    res.status(500).json({
      success: false,
      error: 'Error al alternar estado',
      message: error.message
    });
  }
};

/**
 * GET /api/cron-config/:taskName/statistics
 * Obtiene las estadísticas de ejecución de una tarea
 *
 * Params:
 * - taskName: nombre de la tarea
 */
const getStatistics = async (req, res) => {
  try {
    const { taskName } = req.params;

    logger.info(`📊 Obteniendo estadísticas de tarea: ${taskName}`);

    const config = await CronTaskConfig.findOne({ taskName })
      .select('taskName statistics lastExecution nextExecution enabled');

    if (!config) {
      logger.warn(`⚠️ Tarea no encontrada: ${taskName}`);
      return res.status(404).json({
        success: false,
        error: 'Tarea no encontrada',
        taskName
      });
    }

    logger.info(`✅ Estadísticas obtenidas: ${taskName}`);

    res.json({
      success: true,
      data: {
        taskName: config.taskName,
        enabled: config.enabled,
        statistics: config.statistics,
        lastExecution: config.lastExecution,
        nextExecution: config.nextExecution
      }
    });

  } catch (error) {
    logger.error('❌ Error al obtener estadísticas:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener estadísticas',
      message: error.message
    });
  }
};

/**
 * GET /api/cron-config/:taskName/history
 * Obtiene el historial de ejecuciones de una tarea
 *
 * Params:
 * - taskName: nombre de la tarea
 *
 * Query params opcionales:
 * - limit: número máximo de ejecuciones a retornar (default: 50)
 * - status: filtrar por estado (success, error, running, timeout)
 */
const getExecutionHistory = async (req, res) => {
  try {
    const { taskName } = req.params;
    const { limit = 50, status } = req.query;

    logger.info(`📜 Obteniendo historial de ejecuciones: ${taskName}`);

    const config = await CronTaskConfig.findOne({ taskName })
      .select('taskName executionHistory');

    if (!config) {
      logger.warn(`⚠️ Tarea no encontrada: ${taskName}`);
      return res.status(404).json({
        success: false,
        error: 'Tarea no encontrada',
        taskName
      });
    }

    let history = config.executionHistory || [];

    // Filtrar por status si se especifica
    if (status) {
      history = history.filter(exec => exec.status === status);
    }

    // Limitar resultados
    history = history.slice(-parseInt(limit));

    logger.info(`✅ Historial obtenido: ${history.length} ejecuciones`);

    res.json({
      success: true,
      taskName: config.taskName,
      count: history.length,
      data: history.reverse() // Más recientes primero
    });

  } catch (error) {
    logger.error('❌ Error al obtener historial:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener historial',
      message: error.message
    });
  }
};

module.exports = {
  getAllConfigs,
  getConfigByName,
  updateConfig,
  toggleEnabled,
  getStatistics,
  getExecutionHistory
};
