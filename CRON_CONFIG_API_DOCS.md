# API de Configuración de Tareas Cron

Documentación completa de las rutas para gestionar la configuración de tareas cron.

**Base URL:** `/api/cron-config`

---

## Índice
1. [Obtener todas las configuraciones](#1-obtener-todas-las-configuraciones)
2. [Obtener configuración específica](#2-obtener-configuración-específica)
3. [Actualizar configuración](#3-actualizar-configuración)
4. [Alternar estado habilitado/deshabilitado](#4-alternar-estado-habilitadodeshabilitado)
5. [Obtener estadísticas](#5-obtener-estadísticas)
6. [Obtener historial de ejecuciones](#6-obtener-historial-de-ejecuciones)

---

## 1. Obtener todas las configuraciones

### Endpoint
```
GET /api/cron-config
```

### Descripción
Obtiene toda la configuración de tareas cron, con opciones de filtrado.

### Query Parameters (Opcionales)

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `taskName` | string | Filtrar por nombre de tarea específica |
| `enabled` | boolean | Filtrar por estado (true/false) |
| `includeHistory` | boolean | Incluir historial de ejecuciones (default: false) |

### Ejemplos de Request

**Frontend (Fetch API):**
```javascript
// Obtener todas las configuraciones
const response = await fetch('http://localhost:5000/api/cron-config');
const data = await response.json();

// Obtener solo tareas habilitadas
const response = await fetch('http://localhost:5000/api/cron-config?enabled=true');
const data = await response.json();

// Obtener configuración específica con historial
const response = await fetch('http://localhost:5000/api/cron-config?taskName=grace-period-processor&includeHistory=true');
const data = await response.json();
```

**Frontend (Axios):**
```javascript
import axios from 'axios';

// Obtener todas las configuraciones
const { data } = await axios.get('/api/cron-config');

// Con parámetros
const { data } = await axios.get('/api/cron-config', {
  params: {
    enabled: true,
    includeHistory: false
  }
});
```

### Respuesta Exitosa (200)

```json
{
  "success": true,
  "count": 2,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "taskName": "grace-period-processor",
      "taskDescription": "Procesa suscripciones en período de gracia",
      "cronExpression": "0 23 * * *",
      "timezone": "America/Argentina/Buenos_Aires",
      "enabled": true,
      "priority": 8,
      "lastExecution": {
        "startedAt": "2025-11-14T23:00:00.000Z",
        "completedAt": "2025-11-14T23:05:30.000Z",
        "status": "success",
        "duration": 330,
        "details": {
          "processedSubscriptions": 25,
          "emailsSent": 10
        }
      },
      "nextExecution": "2025-11-15T23:00:00.000Z",
      "config": {
        "timeout": 600000,
        "retryOnError": true,
        "maxRetries": 3,
        "retryDelay": 60000,
        "gracePeriod": {
          "defaultDays": 15,
          "reminderDays": [3, 1],
          "enableAutoArchive": true,
          "cleanupAfterDays": 30
        }
      },
      "notifications": {
        "onSuccess": {
          "enabled": false,
          "recipients": []
        },
        "onError": {
          "enabled": true,
          "recipients": ["admin@example.com"]
        },
        "onTimeout": {
          "enabled": true,
          "recipients": ["admin@example.com"]
        }
      },
      "statistics": {
        "totalExecutions": 120,
        "successfulExecutions": 118,
        "failedExecutions": 2,
        "averageDuration": 285.5,
        "lastSuccessAt": "2025-11-14T23:05:30.000Z",
        "lastFailureAt": "2025-11-10T23:00:15.000Z"
      },
      "createdBy": "system",
      "updatedBy": "admin",
      "notes": "Última actualización: ajuste de días de recordatorio",
      "createdAt": "2025-09-01T12:00:00.000Z",
      "updatedAt": "2025-11-14T15:30:00.000Z"
    }
  ]
}
```

### Respuesta de Error (500)

```json
{
  "success": false,
  "error": "Error al obtener configuraciones",
  "message": "Database connection failed"
}
```

---

## 2. Obtener configuración específica

### Endpoint
```
GET /api/cron-config/:taskName
```

### Descripción
Obtiene la configuración de una tarea específica por su nombre.

### Path Parameters

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `taskName` | string | Nombre de la tarea (requerido) |

### Query Parameters (Opcionales)

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `includeHistory` | boolean | Incluir historial completo (default: false) |

### Ejemplos de Request

**Frontend (Fetch API):**
```javascript
// Obtener configuración sin historial
const response = await fetch('http://localhost:5000/api/cron-config/grace-period-processor');
const data = await response.json();

// Obtener configuración con historial
const response = await fetch('http://localhost:5000/api/cron-config/grace-period-processor?includeHistory=true');
const data = await response.json();
```

**Frontend (Axios):**
```javascript
// Obtener configuración específica
const { data } = await axios.get('/api/cron-config/grace-period-processor');

// Con historial
const { data } = await axios.get('/api/cron-config/grace-period-processor', {
  params: { includeHistory: true }
});
```

### Respuesta Exitosa (200)

```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "taskName": "grace-period-processor",
    "taskDescription": "Procesa suscripciones en período de gracia",
    "cronExpression": "0 23 * * *",
    "timezone": "America/Argentina/Buenos_Aires",
    "enabled": true,
    "priority": 8,
    "lastExecution": {
      "startedAt": "2025-11-14T23:00:00.000Z",
      "completedAt": "2025-11-14T23:05:30.000Z",
      "status": "success",
      "duration": 330,
      "details": {
        "processedSubscriptions": 25,
        "emailsSent": 10
      }
    },
    "nextExecution": "2025-11-15T23:00:00.000Z",
    "config": {
      "timeout": 600000,
      "retryOnError": true,
      "maxRetries": 3,
      "retryDelay": 60000,
      "gracePeriod": {
        "defaultDays": 15,
        "reminderDays": [3, 1],
        "enableAutoArchive": true,
        "cleanupAfterDays": 30
      },
      "customSettings": {}
    },
    "notifications": {
      "onSuccess": {
        "enabled": false,
        "recipients": []
      },
      "onError": {
        "enabled": true,
        "recipients": ["admin@example.com"]
      },
      "onTimeout": {
        "enabled": true,
        "recipients": ["admin@example.com"]
      }
    },
    "statistics": {
      "totalExecutions": 120,
      "successfulExecutions": 118,
      "failedExecutions": 2,
      "averageDuration": 285.5,
      "lastSuccessAt": "2025-11-14T23:05:30.000Z",
      "lastFailureAt": "2025-11-10T23:00:15.000Z"
    },
    "createdBy": "system",
    "updatedBy": "admin",
    "notes": "Última actualización: ajuste de días de recordatorio",
    "createdAt": "2025-09-01T12:00:00.000Z",
    "updatedAt": "2025-11-14T15:30:00.000Z"
  }
}
```

### Respuesta Tarea No Encontrada (404)

```json
{
  "success": false,
  "error": "Tarea no encontrada",
  "taskName": "non-existent-task"
}
```

### Respuesta de Error (500)

```json
{
  "success": false,
  "error": "Error al obtener configuración",
  "message": "Database error message"
}
```

---

## 3. Actualizar configuración

### Endpoint
```
PUT /api/cron-config/:taskName
```

### Descripción
Actualiza la configuración de una tarea específica. Solo se actualizan los campos enviados.

### Path Parameters

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `taskName` | string | Nombre de la tarea a actualizar (requerido) |

### Request Body (Todos opcionales)

```typescript
{
  taskDescription?: string;
  cronExpression?: string;
  timezone?: string;
  enabled?: boolean;
  priority?: number; // 1-10
  config?: {
    timeout?: number;
    retryOnError?: boolean;
    maxRetries?: number;
    retryDelay?: number;
    gracePeriod?: {
      defaultDays?: number;
      reminderDays?: number[];
      enableAutoArchive?: boolean;
      cleanupAfterDays?: number;
    };
    customSettings?: object;
  };
  notifications?: {
    onSuccess?: {
      enabled: boolean;
      recipients: string[];
    };
    onError?: {
      enabled: boolean;
      recipients: string[];
    };
    onTimeout?: {
      enabled: boolean;
      recipients: string[];
    };
  };
  updatedBy?: string;
  notes?: string;
}
```

### Ejemplos de Request

**Frontend (Fetch API):**
```javascript
// Actualizar solo la expresión cron
const response = await fetch('http://localhost:5000/api/cron-config/grace-period-processor', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    cronExpression: '0 22 * * *', // Cambiar a 10 PM
    updatedBy: 'admin@example.com',
    notes: 'Ajuste de horario de ejecución'
  })
});
const data = await response.json();

// Actualizar configuración de período de gracia
const response = await fetch('http://localhost:5000/api/cron-config/grace-period-processor', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    config: {
      gracePeriod: {
        defaultDays: 20,
        reminderDays: [5, 3, 1],
        enableAutoArchive: true
      }
    },
    updatedBy: 'admin@example.com',
    notes: 'Extender período de gracia y agregar recordatorio en día 5'
  })
});
const data = await response.json();

// Actualizar notificaciones
const response = await fetch('http://localhost:5000/api/cron-config/grace-period-processor', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    notifications: {
      onError: {
        enabled: true,
        recipients: ['admin@example.com', 'dev@example.com']
      }
    },
    updatedBy: 'admin@example.com'
  })
});
const data = await response.json();
```

**Frontend (Axios):**
```javascript
// Actualizar múltiples campos
const { data } = await axios.put('/api/cron-config/grace-period-processor', {
  enabled: true,
  priority: 9,
  config: {
    timeout: 900000, // 15 minutos
    gracePeriod: {
      reminderDays: [7, 3, 1]
    }
  },
  updatedBy: 'admin@example.com',
  notes: 'Aumentar timeout y agregar recordatorio en día 7'
});

// Deshabilitar una tarea
const { data } = await axios.put('/api/cron-config/grace-period-processor', {
  enabled: false,
  updatedBy: 'admin@example.com',
  notes: 'Deshabilitado temporalmente para mantenimiento'
});
```

### Respuesta Exitosa (200)

```json
{
  "success": true,
  "message": "Configuración actualizada exitosamente",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "taskName": "grace-period-processor",
    "taskDescription": "Procesa suscripciones en período de gracia",
    "cronExpression": "0 22 * * *",
    "timezone": "America/Argentina/Buenos_Aires",
    "enabled": true,
    "priority": 8,
    "config": {
      "timeout": 600000,
      "retryOnError": true,
      "maxRetries": 3,
      "retryDelay": 60000,
      "gracePeriod": {
        "defaultDays": 15,
        "reminderDays": [3, 1],
        "enableAutoArchive": true,
        "cleanupAfterDays": 30
      }
    },
    "notifications": {
      "onSuccess": {
        "enabled": false,
        "recipients": []
      },
      "onError": {
        "enabled": true,
        "recipients": ["admin@example.com"]
      },
      "onTimeout": {
        "enabled": true,
        "recipients": ["admin@example.com"]
      }
    },
    "nextExecution": "2025-11-15T22:00:00.000Z",
    "updatedBy": "admin@example.com",
    "notes": "Ajuste de horario de ejecución",
    "updatedAt": "2025-11-14T16:30:00.000Z"
  },
  "updated": {
    "fields": ["cronExpression", "updatedBy", "notes"],
    "timestamp": "2025-11-14T16:30:00.000Z"
  }
}
```

### Respuesta Error de Validación (400)

```json
{
  "success": false,
  "error": "Error de validación",
  "message": "Validation failed: timezone: America/Invalid is not a valid timezone",
  "details": [
    {
      "field": "timezone",
      "message": "America/Invalid no es una zona horaria válida"
    }
  ]
}
```

### Respuesta Tarea No Encontrada (404)

```json
{
  "success": false,
  "error": "Tarea no encontrada",
  "taskName": "non-existent-task"
}
```

---

## 4. Alternar estado habilitado/deshabilitado

### Endpoint
```
PATCH /api/cron-config/:taskName/toggle
```

### Descripción
Alterna el estado `enabled` de una tarea (habilitar/deshabilitar). Si no se especifica el estado, se alterna automáticamente.

### Path Parameters

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `taskName` | string | Nombre de la tarea (requerido) |

### Request Body (Opcional)

```typescript
{
  enabled?: boolean;  // Si no se envía, se alterna el estado actual
  updatedBy?: string;
}
```

### Ejemplos de Request

**Frontend (Fetch API):**
```javascript
// Alternar estado (de habilitado a deshabilitado o viceversa)
const response = await fetch('http://localhost:5000/api/cron-config/grace-period-processor/toggle', {
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    updatedBy: 'admin@example.com'
  })
});
const data = await response.json();

// Deshabilitar explícitamente
const response = await fetch('http://localhost:5000/api/cron-config/grace-period-processor/toggle', {
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    enabled: false,
    updatedBy: 'admin@example.com'
  })
});
const data = await response.json();

// Habilitar explícitamente
const response = await fetch('http://localhost:5000/api/cron-config/grace-period-processor/toggle', {
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    enabled: true,
    updatedBy: 'admin@example.com'
  })
});
const data = await response.json();
```

**Frontend (Axios):**
```javascript
// Alternar estado
const { data } = await axios.patch('/api/cron-config/grace-period-processor/toggle', {
  updatedBy: 'admin@example.com'
});

// Deshabilitar
const { data } = await axios.patch('/api/cron-config/grace-period-processor/toggle', {
  enabled: false,
  updatedBy: 'admin@example.com'
});
```

### Respuesta Exitosa (200)

```json
{
  "success": true,
  "message": "Tarea habilitada exitosamente",
  "data": {
    "taskName": "grace-period-processor",
    "enabled": true,
    "previousState": false,
    "nextExecution": "2025-11-15T23:00:00.000Z"
  }
}
```

### Respuesta Tarea No Encontrada (404)

```json
{
  "success": false,
  "error": "Tarea no encontrada",
  "taskName": "non-existent-task"
}
```

---

## 5. Obtener estadísticas

### Endpoint
```
GET /api/cron-config/:taskName/statistics
```

### Descripción
Obtiene las estadísticas de ejecución de una tarea específica.

### Path Parameters

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `taskName` | string | Nombre de la tarea (requerido) |

### Ejemplos de Request

**Frontend (Fetch API):**
```javascript
const response = await fetch('http://localhost:5000/api/cron-config/grace-period-processor/statistics');
const data = await response.json();
```

**Frontend (Axios):**
```javascript
const { data } = await axios.get('/api/cron-config/grace-period-processor/statistics');
```

### Respuesta Exitosa (200)

```json
{
  "success": true,
  "data": {
    "taskName": "grace-period-processor",
    "enabled": true,
    "statistics": {
      "totalExecutions": 120,
      "successfulExecutions": 118,
      "failedExecutions": 2,
      "averageDuration": 285.5,
      "lastSuccessAt": "2025-11-14T23:05:30.000Z",
      "lastFailureAt": "2025-11-10T23:00:15.000Z"
    },
    "lastExecution": {
      "startedAt": "2025-11-14T23:00:00.000Z",
      "completedAt": "2025-11-14T23:05:30.000Z",
      "status": "success",
      "duration": 330,
      "details": {
        "processedSubscriptions": 25,
        "emailsSent": 10
      }
    },
    "nextExecution": "2025-11-15T23:00:00.000Z"
  }
}
```

### Respuesta Tarea No Encontrada (404)

```json
{
  "success": false,
  "error": "Tarea no encontrada",
  "taskName": "non-existent-task"
}
```

---

## 6. Obtener historial de ejecuciones

### Endpoint
```
GET /api/cron-config/:taskName/history
```

### Descripción
Obtiene el historial de ejecuciones de una tarea, ordenado de más reciente a más antiguo.

### Path Parameters

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `taskName` | string | Nombre de la tarea (requerido) |

### Query Parameters (Opcionales)

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `limit` | number | Número máximo de ejecuciones (default: 50, max: 50) |
| `status` | string | Filtrar por estado: success, error, running, timeout |

### Ejemplos de Request

**Frontend (Fetch API):**
```javascript
// Obtener últimas 20 ejecuciones
const response = await fetch('http://localhost:5000/api/cron-config/grace-period-processor/history?limit=20');
const data = await response.json();

// Obtener solo ejecuciones fallidas
const response = await fetch('http://localhost:5000/api/cron-config/grace-period-processor/history?status=error');
const data = await response.json();

// Obtener últimas 10 ejecuciones exitosas
const response = await fetch('http://localhost:5000/api/cron-config/grace-period-processor/history?limit=10&status=success');
const data = await response.json();
```

**Frontend (Axios):**
```javascript
// Obtener historial completo
const { data } = await axios.get('/api/cron-config/grace-period-processor/history');

// Con filtros
const { data } = await axios.get('/api/cron-config/grace-period-processor/history', {
  params: {
    limit: 20,
    status: 'error'
  }
});
```

### Respuesta Exitosa (200)

```json
{
  "success": true,
  "taskName": "grace-period-processor",
  "count": 50,
  "data": [
    {
      "startedAt": "2025-11-14T23:00:00.000Z",
      "completedAt": "2025-11-14T23:05:30.000Z",
      "status": "success",
      "duration": 330,
      "details": {
        "processedSubscriptions": 25,
        "emailsSent": 10
      }
    },
    {
      "startedAt": "2025-11-13T23:00:00.000Z",
      "completedAt": "2025-11-13T23:04:15.000Z",
      "status": "success",
      "duration": 255,
      "details": {
        "processedSubscriptions": 18,
        "emailsSent": 7
      }
    },
    {
      "startedAt": "2025-11-12T23:00:00.000Z",
      "completedAt": "2025-11-12T23:00:45.000Z",
      "status": "error",
      "duration": 45,
      "details": {},
      "errorMessage": "Database connection timeout"
    }
  ]
}
```

### Respuesta Tarea No Encontrada (404)

```json
{
  "success": false,
  "error": "Tarea no encontrada",
  "taskName": "non-existent-task"
}
```

---

## Ejemplo Completo de Integración Frontend

### React Component con Hooks

```javascript
import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE_URL = 'http://localhost:5000/api/cron-config';

const CronConfigManager = () => {
  const [configs, setConfigs] = useState([]);
  const [selectedTask, setSelectedTask] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Cargar todas las configuraciones
  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    try {
      setLoading(true);
      const { data } = await axios.get(API_BASE_URL);
      setConfigs(data.data);
      setError(null);
    } catch (err) {
      setError('Error al cargar configuraciones: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Obtener configuración específica
  const loadTaskDetails = async (taskName) => {
    try {
      setLoading(true);
      const { data } = await axios.get(`${API_BASE_URL}/${taskName}?includeHistory=true`);
      setSelectedTask(data.data);
      setError(null);
    } catch (err) {
      setError('Error al cargar detalles: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Actualizar configuración
  const updateTaskConfig = async (taskName, updates) => {
    try {
      setLoading(true);
      const { data } = await axios.put(`${API_BASE_URL}/${taskName}`, {
        ...updates,
        updatedBy: 'admin@example.com'
      });

      // Recargar configuraciones
      await loadConfigs();
      setError(null);
      return data;
    } catch (err) {
      setError('Error al actualizar: ' + err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Alternar estado habilitado/deshabilitado
  const toggleTask = async (taskName) => {
    try {
      setLoading(true);
      const { data } = await axios.patch(`${API_BASE_URL}/${taskName}/toggle`, {
        updatedBy: 'admin@example.com'
      });

      // Recargar configuraciones
      await loadConfigs();
      setError(null);
      return data;
    } catch (err) {
      setError('Error al alternar estado: ' + err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Obtener estadísticas
  const getStatistics = async (taskName) => {
    try {
      const { data } = await axios.get(`${API_BASE_URL}/${taskName}/statistics`);
      return data.data;
    } catch (err) {
      setError('Error al obtener estadísticas: ' + err.message);
      throw err;
    }
  };

  // Obtener historial
  const getHistory = async (taskName, limit = 20, status = null) => {
    try {
      const params = { limit };
      if (status) params.status = status;

      const { data } = await axios.get(`${API_BASE_URL}/${taskName}/history`, { params });
      return data.data;
    } catch (err) {
      setError('Error al obtener historial: ' + err.message);
      throw err;
    }
  };

  return (
    <div>
      {loading && <p>Cargando...</p>}
      {error && <div className="error">{error}</div>}

      <div className="config-list">
        {configs.map(config => (
          <div key={config._id} className="config-item">
            <h3>{config.taskName}</h3>
            <p>{config.taskDescription}</p>
            <p>Estado: {config.enabled ? 'Habilitado' : 'Deshabilitado'}</p>
            <p>Próxima ejecución: {new Date(config.nextExecution).toLocaleString()}</p>

            <button onClick={() => loadTaskDetails(config.taskName)}>
              Ver detalles
            </button>
            <button onClick={() => toggleTask(config.taskName)}>
              {config.enabled ? 'Deshabilitar' : 'Habilitar'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CronConfigManager;
```

---

## Notas Importantes

1. **CORS**: Asegúrate de que tu frontend esté en la lista de orígenes permitidos en el servidor.

2. **Manejo de Errores**: Todas las respuestas de error incluyen:
   - `success: false`
   - `error`: descripción general del error
   - `message`: mensaje específico del error

3. **Validación**: El servidor valida:
   - Expresiones cron válidas
   - Zonas horarias válidas (formato IANA)
   - Valores de prioridad (1-10)
   - Campos requeridos

4. **Merge de Configuraciones**: Al actualizar `config` o `notifications`, se hace un merge con la configuración existente, no un reemplazo completo.

5. **Recálculo Automático**: Al cambiar `cronExpression` o habilitar una tarea deshabilitada, se recalcula automáticamente `nextExecution`.

6. **Historial Limitado**: El historial está limitado a las últimas 50 ejecuciones automáticamente.

7. **Timestamps**: Todos los timestamps están en formato ISO 8601 (UTC).
