const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Modelo para configuración de tareas programadas (cron tasks)
 * Permite controlar la ejecución de tareas programadas sin modificar código
 */
const CronTaskConfigSchema = new Schema({
  // Identificación de la tarea
  taskName: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },

  taskDescription: {
    type: String,
    required: true
  },

  // Configuración de ejecución
  cronExpression: {
    type: String,
    required: true,
    default: '0 23 * * *' // Por defecto: todos los días a las 11 PM
  },

  // Zona horaria para la expresión cron
  timezone: {
    type: String,
    default: 'America/Argentina/Buenos_Aires',
    validate: {
      validator: function(v) {
        // Validar que sea una zona horaria válida de IANA
        try {
          Intl.DateTimeFormat(undefined, { timeZone: v });
          return true;
        } catch (e) {
          return false;
        }
      },
      message: props => `${props.value} no es una zona horaria válida`
    }
  },

  // Estado de habilitación
  enabled: {
    type: Boolean,
    required: true,
    default: true
  },

  // Prioridad de ejecución (mayor número = mayor prioridad)
  priority: {
    type: Number,
    default: 5,
    min: 1,
    max: 10
  },

  // Control de ejecución
  lastExecution: {
    startedAt: {
      type: Date
    },
    completedAt: {
      type: Date
    },
    status: {
      type: String,
      enum: ['success', 'error', 'running', 'timeout'],
      default: null
    },
    duration: {
      type: Number, // Duración en segundos
      default: 0
    },
    details: {
      type: Schema.Types.Mixed, // Puede contener cualquier información relevante
      default: {}
    },
    errorMessage: {
      type: String
    },
    errorStack: {
      type: String
    }
  },

  // Próxima ejecución calculada
  nextExecution: {
    type: Date
  },

  // Historial de ejecuciones (limitado a las últimas N ejecuciones)
  executionHistory: [{
    startedAt: {
      type: Date,
      required: true
    },
    completedAt: {
      type: Date
    },
    status: {
      type: String,
      enum: ['success', 'error', 'running', 'timeout'],
      required: true
    },
    duration: {
      type: Number // Duración en segundos
    },
    details: {
      type: Schema.Types.Mixed
    },
    errorMessage: {
      type: String
    }
  }],

  // Configuración específica de la tarea
  config: {
    // Timeout en milisegundos (0 = sin timeout)
    timeout: {
      type: Number,
      default: 0
    },

    // Reintentos en caso de error
    retryOnError: {
      type: Boolean,
      default: false
    },

    maxRetries: {
      type: Number,
      default: 0
    },

    retryDelay: {
      type: Number, // En milisegundos
      default: 60000 // 1 minuto
    },

    // Configuración de períodos de gracia (específico para grace-period-processor)
    gracePeriod: {
      // Días de período de gracia por defecto
      defaultDays: {
        type: Number,
        default: 15
      },

      // Días para enviar recordatorios
      reminderDays: {
        type: [Number],
        default: [3, 1]
      },

      // Activar auto-archivado al vencer
      enableAutoArchive: {
        type: Boolean,
        default: true
      },

      // Días para limpiar datos obsoletos
      cleanupAfterDays: {
        type: Number,
        default: 30
      }
    },

    // Otras configuraciones específicas
    customSettings: {
      type: Schema.Types.Mixed,
      default: {}
    }
  },

  // Configuración de notificaciones
  notifications: {
    // Notificar cuando termine exitosamente
    onSuccess: {
      enabled: {
        type: Boolean,
        default: false
      },
      recipients: [{
        type: String // Emails
      }]
    },

    // Notificar cuando falle
    onError: {
      enabled: {
        type: Boolean,
        default: true
      },
      recipients: [{
        type: String // Emails
      }]
    },

    // Notificar cuando exceda el tiempo
    onTimeout: {
      enabled: {
        type: Boolean,
        default: true
      },
      recipients: [{
        type: String // Emails
      }]
    }
  },

  // Estadísticas
  statistics: {
    totalExecutions: {
      type: Number,
      default: 0
    },
    successfulExecutions: {
      type: Number,
      default: 0
    },
    failedExecutions: {
      type: Number,
      default: 0
    },
    averageDuration: {
      type: Number, // En segundos
      default: 0
    },
    lastSuccessAt: {
      type: Date
    },
    lastFailureAt: {
      type: Date
    }
  },

  // Metadata
  createdBy: {
    type: String,
    default: 'system'
  },

  updatedBy: {
    type: String
  },

  notes: {
    type: String
  }

}, {
  timestamps: true,
  collection: 'crontaskconfigs'
});

// Índices
CronTaskConfigSchema.index({ enabled: 1, nextExecution: 1 });
CronTaskConfigSchema.index({ 'statistics.lastFailureAt': -1 });

// Método para registrar inicio de ejecución
CronTaskConfigSchema.methods.startExecution = async function() {
  this.lastExecution = {
    startedAt: new Date(),
    status: 'running',
    details: {}
  };

  await this.save();

  return this.lastExecution.startedAt;
};

// Método para registrar fin de ejecución exitosa
CronTaskConfigSchema.methods.completeExecution = async function(details = {}) {
  const completedAt = new Date();
  const duration = (completedAt - this.lastExecution.startedAt) / 1000; // En segundos

  this.lastExecution.completedAt = completedAt;
  this.lastExecution.status = 'success';
  this.lastExecution.duration = duration;
  this.lastExecution.details = details;

  // Actualizar estadísticas
  this.statistics.totalExecutions++;
  this.statistics.successfulExecutions++;
  this.statistics.lastSuccessAt = completedAt;

  // Calcular duración promedio
  const totalSuccessful = this.statistics.successfulExecutions;
  const previousAvg = this.statistics.averageDuration || 0;
  this.statistics.averageDuration = ((previousAvg * (totalSuccessful - 1)) + duration) / totalSuccessful;

  // Agregar al historial (mantener últimas 50 ejecuciones)
  this.executionHistory.push({
    startedAt: this.lastExecution.startedAt,
    completedAt: completedAt,
    status: 'success',
    duration: duration,
    details: details
  });

  if (this.executionHistory.length > 50) {
    this.executionHistory = this.executionHistory.slice(-50);
  }

  // Calcular próxima ejecución (simplificado - en producción usar librería cron-parser)
  this.nextExecution = this.calculateNextExecution();

  await this.save();

  return duration;
};

// Método para registrar error en ejecución
CronTaskConfigSchema.methods.failExecution = async function(error, details = {}) {
  const completedAt = new Date();
  const duration = (completedAt - this.lastExecution.startedAt) / 1000; // En segundos

  this.lastExecution.completedAt = completedAt;
  this.lastExecution.status = 'error';
  this.lastExecution.duration = duration;
  this.lastExecution.details = details;
  this.lastExecution.errorMessage = error.message;
  this.lastExecution.errorStack = error.stack;

  // Actualizar estadísticas
  this.statistics.totalExecutions++;
  this.statistics.failedExecutions++;
  this.statistics.lastFailureAt = completedAt;

  // Agregar al historial
  this.executionHistory.push({
    startedAt: this.lastExecution.startedAt,
    completedAt: completedAt,
    status: 'error',
    duration: duration,
    details: details,
    errorMessage: error.message
  });

  if (this.executionHistory.length > 50) {
    this.executionHistory = this.executionHistory.slice(-50);
  }

  // Calcular próxima ejecución
  this.nextExecution = this.calculateNextExecution();

  await this.save();

  return duration;
};

// Método para calcular próxima ejecución (simplificado)
CronTaskConfigSchema.methods.calculateNextExecution = function() {
  // Nota: Para producción, usar librería 'cron-parser' para parsing preciso
  // Esta es una implementación simplificada para casos comunes

  const now = new Date();
  const next = new Date(now);

  // Parsear expresión cron simple (formato: minuto hora día mes día-semana)
  const parts = this.cronExpression.split(' ');

  // Caso simple: '0 2 * * *' (todos los días a las 2 AM)
  if (parts[0] === '0' && parts[2] === '*' && parts[3] === '*' && parts[4] === '*') {
    const hour = parseInt(parts[1], 10);
    next.setHours(hour, 0, 0, 0);

    // Si ya pasó la hora, programar para mañana
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }

    return next;
  }

  // Para casos más complejos, devolver 24 horas después
  next.setHours(next.getHours() + 24);
  return next;
};

// Método estático para obtener tareas habilitadas pendientes de ejecución
CronTaskConfigSchema.statics.getPendingTasks = async function() {
  const now = new Date();

  return this.find({
    enabled: true,
    $or: [
      { nextExecution: { $lte: now } },
      { nextExecution: { $exists: false } }
    ]
  }).sort({ priority: -1, nextExecution: 1 });
};

// Método estático para obtener tarea por nombre
CronTaskConfigSchema.statics.getTaskByName = async function(taskName) {
  return this.findOne({ taskName: taskName });
};

module.exports = mongoose.model('CronTaskConfig', CronTaskConfigSchema);
