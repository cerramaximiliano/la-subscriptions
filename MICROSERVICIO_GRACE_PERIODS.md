# 🔄 Procesador de Períodos de Gracia - Microservicio

## 📋 Descripción

El microservicio de webhooks ahora incluye un procesador unificado de períodos de gracia que maneja:

1. **Auto-archivado por downgrade**: Cuando un usuario baja de plan y excede los límites del nuevo plan
2. **Auto-archivado por pagos fallidos**: Cuando una suscripción en período de gracia por pagos llega a su fin
3. **Recordatorios automatizados**: Notificaciones antes de que expire el período de gracia
4. **Limpieza de datos obsoletos**: Eliminación de registros antiguos

## 🏗️ Arquitectura

```
Microservicio de Webhooks
├── Webhook Controller (solo eventos de pago)
├── Grace Period Processor (auto-archivado)
│   ├── processExpiredGracePeriods() - Downgrades
│   ├── processPaymentGracePeriods() - Pagos fallidos
│   ├── performAutoArchiving() - Archivado de contenido
│   └── sendGracePeriodReminders() - Notificaciones
└── Scheduled Tasks (cron jobs)
```

## 🔧 Configuración

### Variables de Entorno Requeridas

```env
# Base de datos (compartida con servidor principal)
MONGODB_URI=mongodb://...
URLDB=mongodb://...

# Email
ADMIN_EMAIL=admin@example.com
AWS_REGION=sa-east-1
EMAIL_MARKETING_DEFAULT_SENDER=noreply@tuapp.com
```

### Scheduled Tasks

El procesador se ejecuta automáticamente:

```javascript
// En scripts/scheduleTasks.js
// Diariamente a las 2:00 AM
cron.schedule('0 2 * * *', async () => {
  await processGracePeriods();
});
```

## 📝 Funcionalidades

### 1. Auto-archivado por Downgrade

Cuando un usuario baja de plan (ej: Premium → Standard o Free):

```javascript
// Límites por plan
const limits = {
  free: { maxFolders: 5, maxCalculators: 3, maxContacts: 10 },
  standard: { maxFolders: 50, maxCalculators: 20, maxContacts: 100 },
  premium: { maxFolders: 999999, maxCalculators: 999999, maxContacts: 999999 }
};

// Se archivan automáticamente los elementos más antiguos que excedan el límite
```

### 2. Auto-archivado por Pagos Fallidos

Después de 15 días en `grace_period` por pagos fallidos:

- La suscripción cambia a plan FREE
- Se archiva todo el contenido que exceda los límites FREE
- Se actualiza el estado a `archived`

### 3. Recordatorios Automatizados

- **3 días antes**: Primer recordatorio
- **1 día antes**: Recordatorio urgente
- **Recordatorio de pago**: Durante el período de gracia por pagos

### 4. Limpieza de Datos

- Elimina registros de períodos de gracia procesados hace más de 30 días
- Limpia notificaciones antiguas

## 🚀 Uso Manual

### Ejecutar el procesador manualmente:

```bash
# Opción 1: Ejecutar directamente
node scripts/gracePeriodProcessor.js

# Opción 2: A través de scheduleTasks
node scripts/scheduleTasks.js processGracePeriods
```

### Verificar estado:

```bash
# Ver logs del procesador
pm2 logs stripe-webhooks | grep "PROCESADOR DE PERÍODOS"

# Verificar suscripciones pendientes
node scripts/monitorWebhooks.js
```

## 📊 Monitoreo

El procesador genera logs detallados:

```
========================================
🔄 PROCESADOR DE PERÍODOS DE GRACIA
Fecha/Hora: 2024-01-15T02:00:00.000Z
========================================

📋 PASO 1: Procesando períodos de gracia vencidos...
Encontradas 3 suscripciones con período vencido
[AUTO-ARCHIVE] Procesando usuario user@example.com
[AUTO-ARCHIVE] Completado - 25 elementos archivados

📋 PASO 2: Procesando períodos de gracia por pagos fallidos...
Encontradas 2 suscripciones con período de gracia de pago vencido

📋 PASO 3: Enviando recordatorios...
Encontradas 5 suscripciones para recordatorio

📋 PASO 4: Limpiando datos obsoletos...
Se limpiaron 10 registros obsoletos

========================================
✅ PROCESAMIENTO COMPLETADO
⏱️  Duración: 12.34 segundos
📊 Resumen:
   - Períodos vencidos procesados: 3
   - Períodos de pago procesados: 2
   - Recordatorios enviados: 5
   - Registros obsoletos limpiados: 10
========================================
```

## 🔍 Debugging

### Verificar suscripciones con período de gracia:

```javascript
// En MongoDB
db.subscriptions.find({
  'downgradeGracePeriod.expiresAt': { $exists: true },
  'downgradeGracePeriod.autoArchiveScheduled': true
})

// Suscripciones en grace_period por pagos
db.subscriptions.find({
  accountStatus: 'grace_period',
  'paymentFailures.count': { $gte: 4 }
})
```

### Logs importantes:

```bash
# Ver archivados
grep "AUTO-ARCHIVE" logs/combined.log

# Ver recordatorios enviados
grep "gracePeriod.*Sent" logs/combined.log

# Ver errores
grep "ERROR.*grace" logs/error.log
```

## ⚠️ Consideraciones Importantes

1. **Compartir Base de Datos**: El microservicio comparte la misma base de datos que el servidor principal
2. **No Interferir**: Solo modifica campos específicos (accountStatus, archivado) sin tocar la lógica principal
3. **Idempotencia**: Los procesos son idempotentes - se pueden ejecutar múltiples veces sin efectos adversos
4. **Notificaciones**: Todos los emails se envían al usuario afectado y se registran en el sistema

## 🔄 Migración desde Servidor Principal

Para desactivar el procesamiento en el servidor principal:

1. Comentar o eliminar el cron job de `checkGracePeriods` en el servidor principal
2. Verificar que el microservicio esté ejecutando el nuevo procesador
3. Monitorear durante 24-48 horas para asegurar funcionamiento correcto

## 📚 Referencias

- [ARQUITECTURA_MICROSERVICIO.md](ARQUITECTURA_MICROSERVICIO.md)
- [scripts/gracePeriodProcessor.js](scripts/gracePeriodProcessor.js)
- [scripts/scheduleTasks.js](scripts/scheduleTasks.js)