# Sistema de Configuración de Cron Tasks

## Descripción General

Este sistema permite configurar y controlar la ejecución de tareas programadas (cron tasks) mediante documentos en MongoDB, sin necesidad de modificar código o reiniciar servicios.

## Características Principales

- ✅ **Configuración dinámica**: Controla horarios, habilitación y parámetros desde la base de datos
- 📊 **Estadísticas automáticas**: Registra ejecuciones, tiempos, éxitos y errores
- 📧 **Notificaciones**: Alertas automáticas en caso de errores o timeouts
- 🔄 **Historial**: Mantiene registro de las últimas 50 ejecuciones
- ⚙️ **Flexible**: Configuración específica por tarea

## Estructura del Sistema

### Componentes

1. **Modelo**: `models/CronTaskConfig.js`
   - Define la estructura de configuración en MongoDB
   - Métodos para registrar ejecuciones
   - Cálculo automático de próxima ejecución

2. **Scripts de gestión**:
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

### Ejecutar el procesador manualmente

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

### Modificar horario de ejecución

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

Formatos de expresión cron comunes:
- `0 2 * * *` - Todos los días a las 2 AM
- `0 */6 * * *` - Cada 6 horas
- `0 0 * * 0` - Todos los domingos a medianoche
- `0 2 1 * *` - El día 1 de cada mes a las 2 AM

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

El procesador está configurado en `ecosystem.config.js`:

```javascript
{
  name: 'grace-period-processor',
  script: './scripts/gracePeriodProcessor.js',
  cron_restart: '0 2 * * *',
  autorestart: false,
  // ...
}
```

Para aplicar cambios en el horario de PM2:

```bash
pm2 delete grace-period-processor
pm2 start ecosystem.config.js --only grace-period-processor
pm2 save
```

**Nota importante**: El horario en `ecosystem.config.js` debe coincidir con el `cronExpression` en MongoDB para mantener consistencia.

## Solución de Problemas

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
