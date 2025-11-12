# Sistema de Configuración de Cron Tasks (Dinámico)

## Descripción General

Este sistema permite configurar y controlar **completamente** la ejecución de tareas programadas (cron tasks) mediante documentos en MongoDB, **sin necesidad de modificar código o reiniciar servicios**.

## Características Principales

- 🔄 **100% Dinámico**: Cambia horarios, habilita/deshabilita tareas sin reiniciar
- 📊 **Estadísticas automáticas**: Registra ejecuciones, tiempos, éxitos y errores
- 📧 **Notificaciones**: Alertas automáticas en caso de errores o timeouts
- 🔄 **Historial**: Mantiene registro de las últimas 50 ejecuciones
- ⚙️ **Flexible**: Configuración específica por tarea
- ⚡ **Sincronización automática**: Lee cambios de MongoDB cada 5 minutos
- 🎯 **Scheduler inteligente**: Usa `node-cron` para programación precisa

## Estructura del Sistema

### Componentes

1. **Modelo**: `models/CronTaskConfig.js`
   - Define la estructura de configuración en MongoDB
   - Métodos para registrar ejecuciones
   - Cálculo automático de próxima ejecución

2. **Scheduler Dinámico**: `scripts/cronScheduler.js` ⭐ **NUEVO**
   - Corre constantemente como proceso de PM2
   - Lee configuraciones de MongoDB cada 5 minutos
   - Programa/reprograma tareas automáticamente
   - Detecta cambios en horarios y los aplica sin reiniciar
   - Ejecuta tareas en procesos separados

3. **Scripts de gestión**:
   - `scripts/initCronTaskConfig.js` - Inicializa/actualiza configuración
   - `scripts/viewCronTaskConfig.js` - Visualiza configuración y estadísticas
   - `scripts/gracePeriodProcessor.js` - Procesador con soporte de configuración

## Instalación y Configuración Inicial

### 1. Crear la configuración inicial

```bash
node scripts/initCronTaskConfig.js
```

Esto creará el documento de configuración en MongoDB con los valores por defecto.

### 2. Verificar la configuración

```bash
# Ver todas las tareas configuradas
node scripts/viewCronTaskConfig.js

# Ver una tarea específica
node scripts/viewCronTaskConfig.js grace-period-processor
```

## Uso del Sistema

### Iniciar el Scheduler (Producción)

El scheduler debe estar corriendo constantemente en producción:

```bash
# Iniciar con PM2
pm2 start ecosystem.config.js --only grace-period-cron-scheduler --env production
pm2 save

# Ver estado
pm2 list

# Ver logs en tiempo real
pm2 logs grace-period-cron-scheduler
```

El scheduler:
1. Se conecta a MongoDB
2. Carga todas las tareas configuradas
3. Programa cada tarea habilitada según su `cronExpression`
4. Sincroniza con MongoDB cada 5 minutos
5. Detecta cambios (horarios, habilitación) y los aplica automáticamente
6. Ejecuta las tareas en el horario programado

### Ejecutar el procesador manualmente (Desarrollo/Testing)

```bash
node scripts/gracePeriodProcessor.js
```

El procesador:
1. Verificará si existe configuración en MongoDB
2. Comprobará si la tarea está habilitada
3. Registrará el inicio de la ejecución
4. Ejecutará los 4 pasos del procesamiento
5. Registrará el resultado (éxito o error) con estadísticas

### Habilitar/Deshabilitar la tarea

#### Opción 1: Desde MongoDB Compass o mongosh

```javascript
db.crontaskconfigs.updateOne(
  { taskName: 'grace-period-processor' },
  { $set: { enabled: false } }
)
```

#### Opción 2: Actualizar y re-ejecutar el script de inicialización

```bash
# Editar scripts/initCronTaskConfig.js y cambiar enabled: true/false
node scripts/initCronTaskConfig.js
```

### Modificar horario de ejecución ⭐ DINÁMICO

Con el scheduler dinámico, los cambios se aplican automáticamente:

```javascript
db.crontaskconfigs.updateOne(
  { taskName: 'grace-period-processor' },
  {
    $set: {
      cronExpression: '0 3 * * *', // Cambiar a las 3 AM
      updatedBy: 'admin',
      notes: 'Cambiado horario a las 3 AM'
    }
  }
)
```

**El scheduler detectará el cambio en máximo 5 minutos** y reprogramará la tarea automáticamente. No necesitas reiniciar nada.

Formatos de expresión cron comunes:
- `0 2 * * *` - Todos los días a las 2 AM
- `0 */6 * * *` - Cada 6 horas
- `0 0 * * 0` - Todos los domingos a medianoche
- `0 2 1 * *` - El día 1 de cada mes a las 2 AM
- `*/30 * * * *` - Cada 30 minutos
- `0 8-18 * * 1-5` - Cada hora de 8 AM a 6 PM, lunes a viernes

### Modificar configuración de período de gracia

```javascript
db.crontaskconfigs.updateOne(
  { taskName: 'grace-period-processor' },
  {
    $set: {
      'config.gracePeriod.defaultDays': 20,
      'config.gracePeriod.reminderDays': [7, 3, 1],
      updatedBy: 'admin'
    }
  }
)
```

### Modificar límites de planes

```javascript
db.crontaskconfigs.updateOne(
  { taskName: 'grace-period-processor' },
  {
    $set: {
      'config.customSettings.planLimits.free': {
        maxFolders: 10,
        maxCalculators: 5,
        maxContacts: 20
      }
    }
  }
)
```

## Configuración Disponible

### Campos principales

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `taskName` | String | Identificador único de la tarea |
| `taskDescription` | String | Descripción de la tarea |
| `cronExpression` | String | Expresión cron para programación |
| `enabled` | Boolean | Si la tarea está habilitada |
| `priority` | Number | Prioridad (1-10) |

### Configuración de ejecución

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `config.timeout` | Number | Timeout en ms (0 = sin límite) |
| `config.retryOnError` | Boolean | Reintentar en caso de error |
| `config.maxRetries` | Number | Máximo de reintentos |
| `config.retryDelay` | Number | Delay entre reintentos (ms) |

### Configuración de período de gracia

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `config.gracePeriod.defaultDays` | Number | Días de período de gracia |
| `config.gracePeriod.reminderDays` | Array | Días antes para enviar recordatorios |
| `config.gracePeriod.enableAutoArchive` | Boolean | Habilitar auto-archivado |
| `config.gracePeriod.cleanupAfterDays` | Number | Días para limpiar datos obsoletos |

### Límites de planes

```javascript
config.customSettings.planLimits: {
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
}
```

### Notificaciones

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `notifications.onSuccess.enabled` | Boolean | Notificar en éxito |
| `notifications.onError.enabled` | Boolean | Notificar en error |
| `notifications.onTimeout.enabled` | Boolean | Notificar en timeout |
| `notifications.*.recipients` | Array | Lista de emails |

## Estadísticas y Monitoreo

### Ver estadísticas

```bash
node scripts/viewCronTaskConfig.js grace-period-processor
```

Muestra:
- Estado actual (habilitado/deshabilitado/en ejecución)
- Próxima ejecución programada
- Total de ejecuciones
- Tasa de éxito/fallo
- Duración promedio
- Última ejecución exitosa/fallida
- Historial reciente (últimas 5 ejecuciones)

### Consultar historial en MongoDB

```javascript
// Ver historial de ejecuciones
db.crontaskconfigs.findOne(
  { taskName: 'grace-period-processor' },
  { executionHistory: 1 }
)

// Ver estadísticas
db.crontaskconfigs.findOne(
  { taskName: 'grace-period-processor' },
  { statistics: 1, lastExecution: 1 }
)
```

## Integración con PM2

El scheduler dinámico está configurado en `ecosystem.config.js`:

```javascript
{
  name: 'grace-period-cron-scheduler',
  script: './scripts/cronScheduler.js',
  instances: 1,
  exec_mode: 'fork',
  autorestart: true,  // Mantener corriendo siempre
  // ...
}
```

**Cambios importantes**:
- ✅ **NO se usa `cron_restart`**: El scheduler corre constantemente
- ✅ **Horarios 100% en MongoDB**: Todo se controla desde la base de datos
- ✅ **Sin reinicios**: Los cambios se aplican automáticamente

Para gestionar el scheduler:

```bash
# Ver estado
pm2 list

# Ver logs
pm2 logs grace-period-cron-scheduler

# Reiniciar solo si es necesario (por actualización de código)
pm2 restart grace-period-cron-scheduler

# Detener
pm2 stop grace-period-cron-scheduler

# Iniciar
pm2 start grace-period-cron-scheduler
```

## Cómo Funciona el Sistema Dinámico

### Arquitectura

```
┌─────────────────────────────────────────────────────┐
│                  MongoDB                             │
│  ┌──────────────────────────────────────────────┐  │
│  │  CronTaskConfig Collection                   │  │
│  │  - taskName: "grace-period-processor"        │  │
│  │  - cronExpression: "0 2 * * *"               │  │
│  │  - enabled: true                             │  │
│  │  - config: { ... }                           │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
                      ↑  Cada 5 minutos
                      │  lee configuración
┌─────────────────────────────────────────────────────┐
│        Scheduler Dinámico (PM2 Process)             │
│  ┌──────────────────────────────────────────────┐  │
│  │  scripts/cronScheduler.js                    │  │
│  │  - Lee tareas de MongoDB                     │  │
│  │  - Programa con node-cron                    │  │
│  │  - Detecta cambios automáticamente           │  │
│  │  - Ejecuta tareas en horario                 │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
                      │  En horario programado
                      ↓  fork() proceso separado
┌─────────────────────────────────────────────────────┐
│           Tarea (Child Process)                     │
│  ┌──────────────────────────────────────────────┐  │
│  │  scripts/gracePeriodProcessor.js             │  │
│  │  - Ejecuta lógica de negocio                 │  │
│  │  - Registra inicio/fin en MongoDB            │  │
│  │  - Actualiza estadísticas                    │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### Flujo de Sincronización

1. **Inicio del Scheduler**:
   - Se conecta a MongoDB
   - Carga todas las tareas configuradas
   - Programa cada tarea habilitada con `node-cron`

2. **Sincronización Periódica** (cada 5 minutos):
   - Lee todas las tareas de MongoDB
   - Compara con tareas ya programadas
   - **Si cambia `cronExpression`**: Detiene y reprograma
   - **Si cambia `enabled`**: Activa o detiene tarea
   - **Si se elimina**: Detiene y limpia

3. **Ejecución de Tarea**:
   - Verifica que la tarea siga habilitada
   - Verifica que no haya otra ejecución corriendo
   - Registra inicio en MongoDB
   - Ejecuta script en proceso separado
   - Registra resultado y estadísticas

### Ventajas del Sistema Dinámico

✅ **Cambios sin downtime**: Modifica horarios sin reiniciar servicios
✅ **Configuración centralizada**: Todo en MongoDB
✅ **Múltiples tareas**: Escala fácilmente a N tareas
✅ **Sincronización automática**: Detecta cambios en máximo 5 minutos
✅ **Procesos aislados**: Cada ejecución en su propio proceso
✅ **Control de concurrencia**: Previene ejecuciones duplicadas

### Limitaciones

⚠️ **Latencia de sincronización**: Cambios tardan hasta 5 minutos en aplicarse
⚠️ **Zona horaria**: Se usa la zona configurada en `TZ` (env var)
⚠️ **Dependencia de MongoDB**: Si MongoDB no está disponible, no se ejecutan tareas

## Solución de Problemas

### El scheduler no está corriendo

1. Verificar que PM2 esté corriendo:
   ```bash
   pm2 list
   ```

2. Ver logs del scheduler:
   ```bash
   pm2 logs grace-period-cron-scheduler --lines 50
   ```

3. Reiniciar si es necesario:
   ```bash
   pm2 restart grace-period-cron-scheduler
   ```

### La tarea no se ejecuta

1. Verificar que esté habilitada:
   ```bash
   node scripts/viewCronTaskConfig.js grace-period-processor
   ```

2. Verificar logs de PM2:
   ```bash
   pm2 logs grace-period-processor
   ```

3. Ejecutar manualmente para ver errores:
   ```bash
   node scripts/gracePeriodProcessor.js
   ```

### La tarea falla constantemente

1. Ver detalles del último error:
   ```bash
   node scripts/viewCronTaskConfig.js grace-period-processor
   ```

2. Verificar logs detallados:
   ```bash
   tail -f logs/grace-processor-error.log
   ```

3. Deshabilitar temporalmente:
   ```javascript
   db.crontaskconfigs.updateOne(
     { taskName: 'grace-period-processor' },
     { $set: { enabled: false } }
   )
   ```

### Resetear estadísticas

```javascript
db.crontaskconfigs.updateOne(
  { taskName: 'grace-period-processor' },
  {
    $set: {
      'statistics.totalExecutions': 0,
      'statistics.successfulExecutions': 0,
      'statistics.failedExecutions': 0,
      'statistics.averageDuration': 0,
      executionHistory: []
    }
  }
)
```

## Mejores Prácticas

1. **Siempre probar cambios manualmente** antes de aplicarlos en producción:
   ```bash
   node scripts/gracePeriodProcessor.js
   ```

2. **Documentar cambios** en el campo `notes`:
   ```javascript
   {
     $set: {
       notes: 'Cambiado horario a las 3 AM - ticket #123',
       updatedBy: 'admin-name'
     }
   }
   ```

3. **Monitorear estadísticas** regularmente para detectar problemas

4. **Mantener sincronizado** el horario en PM2 y MongoDB

5. **Revisar logs** después de cambios importantes

## Extensión del Sistema

Para agregar nuevas tareas programadas:

1. Crear entrada en MongoDB con la configuración
2. Crear script del procesador
3. Integrar verificación de configuración en el script
4. Agregar a `ecosystem.config.js` si se usa PM2
5. Documentar en este archivo

## Comandos Rápidos

```bash
# Ver configuración
node scripts/viewCronTaskConfig.js

# Ver configuración específica
node scripts/viewCronTaskConfig.js grace-period-processor

# Ejecutar manualmente
node scripts/gracePeriodProcessor.js

# Reinicializar configuración
node scripts/initCronTaskConfig.js

# Ver logs en tiempo real
pm2 logs grace-period-processor --lines 100

# Ver estado de PM2
pm2 list

# Reiniciar tarea en PM2
pm2 restart grace-period-processor
```

## Referencias

- Documentación de expresiones cron: https://crontab.guru/
- Documentación de PM2: https://pm2.keymetrics.io/
- Mongoose Schema: https://mongoosejs.com/docs/guide.html
