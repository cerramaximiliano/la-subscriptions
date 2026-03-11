# 📚 Documentación Completa - Microservicio de Webhooks y Pagos

## 📋 Índice

1. [Descripción General](#descripción-general)
2. [Arquitectura del Sistema](#arquitectura-del-sistema)
3. [Responsabilidades del Microservicio](#responsabilidades-del-microservicio)
4. [Procesador de Períodos de Gracia](#procesador-de-períodos-de-gracia)
5. [Configuración](#configuración)
6. [Instalación y Despliegue](#instalación-y-despliegue)
7. [Pruebas](#pruebas)
8. [Monitoreo y Logs](#monitoreo-y-logs)
9. [Troubleshooting](#troubleshooting)
10. [Referencias](#referencias)

---

## 📋 Descripción General

Este es un microservicio especializado en el manejo de eventos de pago de Stripe y gestión de períodos de gracia. Sus responsabilidades principales son:

- **Procesar webhooks de pagos**: Maneja fallos de pago, recuperaciones y notificaciones
- **Gestionar períodos de gracia**: Auto-archivado de contenido cuando expiran los períodos
- **Mantener el estado de cuenta**: Actualiza `accountStatus` según el estado de los pagos

El microservicio complementa al servidor principal, compartiendo la misma base de datos MongoDB pero con responsabilidades claramente separadas.

---

## 🏗️ Arquitectura del Sistema

### Componentes Principales

```
Microservicio de Webhooks
├── Server (server.js)
│   └── Webhook Controller (webhookController.js)
│       ├── Procesa eventos de pago
│       ├── Actualiza accountStatus
│       └── Envía notificaciones
│
├── Grace Period Processor (gracePeriodProcessor.js)
│   ├── processExpiredGracePeriods() - Downgrades
│   ├── processPaymentGracePeriods() - Pagos fallidos
│   ├── performAutoArchiving() - Archivado de contenido + grupos
│   ├── performGroupDowngrade() - Suspensión de grupos/miembros
│   ├── calculateGroupImpact() - Cálculo de impacto (solo lectura)
│   └── sendGracePeriodReminders() - Notificaciones con info de grupos
│
└── Scheduled Tasks (scheduleTasks.js)
    ├── Grace Period Processor (2:00 AM)
    ├── Retry Failed Webhooks (cada hora)
    └── Payment Recovery Check (cada 4 horas)
```

### Flujo de Integración

```mermaid
graph TD
    A[Stripe Webhook] -->|Todos los eventos| B[Microservicio]
    B -->|Eventos de Pagos| C[Procesa y Actualiza BD]
    B -->|Otros eventos| D[Responde 200 OK sin procesar]
    
    E[Servidor Principal] -->|Maneja| F[Suscripciones/Planes/Cancelaciones]
    
    G[Grace Period Processor] -->|Cron Job| H[Auto-archivado y Notificaciones]
    
    C -.->|Comparte BD| F
    H -.->|Comparte BD| F
```

---

## 🎯 Responsabilidades del Microservicio

### ✅ Este Microservicio MANEJA:

#### 1. **Pagos Fallidos** (`invoice.payment_failed`)
- Contador de intentos fallidos
- Notificaciones escalonadas (1°, 2°, 3° y 4° intento)
- Cambio de estado a `at_risk`, `suspended`, `grace_period`
- Solo actualiza `accountStatus`, NO `status` ni `plan`
- **NUEVO**: Valida que no sea plan gratuito antes de procesar
- **NUEVO**: Obtiene límites y características dinámicamente desde PlanConfig

#### 2. **Recuperación de Pagos** (`invoice.payment_succeeded`, `invoice.paid`)
- SOLO procesa pagos de suscripciones (ignora pagos únicos)
- SOLO cuando hay fallos previos (`paymentFailures.count > 0`)
- Resetea contadores y restaura acceso
- Envía email de confirmación de recuperación
- **IGNORA**: Pagos sin ID de suscripción (one-time payments)

#### 3. **Gestión de Períodos de Gracia y Auto-archivado**
- Procesa períodos de gracia vencidos por downgrade
- Procesa períodos de gracia por pagos fallidos (15 días)
- Auto-archiva contenido que excede límites del plan (carpetas, calculadoras, contactos)
- **Maneja grupos del owner**: suspende el grupo completo (downgrade a free) o suspende miembros excedentes ordenados por menor actividad (downgrade entre planes de pago)
- Envía recordatorios antes del vencimiento (3 días y 1 día) con información predictiva del impacto sobre el grupo
- Limpia registros obsoletos de más de 30 días
- **NUEVO**: Usa PlanConfig para determinar límites de archivado

#### 4. **Campos que Gestiona**:
```javascript
{
  // Gestión de pagos
  accountStatus: 'active' | 'at_risk' | 'suspended' | 'grace_period' | 'archived',
  paymentFailures: {
    count, firstFailedAt, lastFailedAt, 
    lastFailureReason, lastFailureCode,
    notificationsSent: { firstWarning, secondWarning, ... }
  },
  paymentRecovery: {
    inRecovery, recoveredAt
  },
  statusHistory: [], // Solo agrega entradas de tipo 'payment_*'
  
  // Gestión de archivado (cuando procesa grace periods)
  plan: 'free', // SOLO al expirar grace period por pagos
  status: 'canceled' // SOLO al expirar grace period por pagos
}
```

### ❌ Este Microservicio NO MANEJA:

1. **Creación/Actualización de Suscripciones**
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`

2. **Cambios de Plan Normales**
   - Upgrades/Downgrades iniciados por usuario
   - Cambios de precio
   - Actualizaciones de características

3. **Campos que NO Modifica (excepto en grace period expirado)**
   - `status` (solo lo cambia a 'canceled' cuando expira grace period)
   - `plan` (solo lo cambia a 'free' cuando expira grace period)
   - `stripeSubscriptionId` - Solo lo lee
   - `stripePriceId` - Solo lo lee

---

## 🔄 Procesador de Períodos de Gracia

### Funcionalidades

#### 1. Auto-archivado por Downgrade
Cuando un usuario baja de plan (ej: Premium → Standard o Free):

```javascript
// Límites por plan (recursos)
const limits = {
  free:     { maxFolders: 5,   maxCalculators: 3,   maxContacts: 10  },
  standard: { maxFolders: 50,  maxCalculators: 20,  maxContacts: 100 },
  premium:  { maxFolders: 500, maxCalculators: 200, maxContacts: 1000 }
};

// Límites por plan (miembros de grupo, total incluyendo owner)
const groupLimits = { free: 0, standard: 5, premium: 10 };

// Se archivan automáticamente los elementos más antiguos que excedan el límite
// Se actúa sobre el grupo del owner según el plan destino
```

#### 2. Manejo de Grupos al Vencer el Período

Al ejecutar `performAutoArchiving(userId, targetPlan)`, se llama al final a `performGroupDowngrade(userId, targetPlan)`:

**Downgrade a `free`:**
- El grupo pasa a `status: "suspended"`
- Todas las invitaciones `pending` pasan a `"expired"`
- Se registra en `group.history`: `{ action: "group_updated", reason: "grace_period_expired" }`

**Downgrade entre planes de pago (ej: Premium → Standard):**
- Si `miembros activos + 1 (owner) > límite del plan`:
  - Se suspenden los miembros con menor `lastActivityAt` (nulls primero)
  - Cada suspensión registra en `group.history`: `{ action: "member_removed", reason: "grace_period_expired" }`
  - Las invitaciones `pending` pasan a `"expired"`

**Sin exceso:** No se toma ninguna acción sobre el grupo.

#### 3. Auto-archivado por Pagos Fallidos
Después de 15 días en `grace_period` por pagos fallidos:
- La suscripción cambia a plan FREE
- Se archiva todo el contenido que exceda los límites FREE
- El grupo se suspende completamente (plan free no permite equipos)
- Se actualiza el estado a `archived`

#### 4. Recordatorios Automatizados
- **3 días antes**: Primer recordatorio con info predictiva del grupo
- **1 día antes**: Recordatorio urgente con info predictiva del grupo
- **Recordatorio de pago**: Durante el período de gracia por pagos

Los emails de recordatorio incluyen las siguientes variables de grupo:

| Variable | Descripción |
|----------|-------------|
| `groupHasTeam` | Si el usuario tiene un equipo activo |
| `groupWillBeSuspended` | Si el equipo será suspendido (plan free) |
| `groupMembersToSuspend` | Miembros que serán suspendidos |
| `groupCurrentMembers` | Miembros activos actuales |
| `groupMaxMembersAllowed` | Máximo permitido en el plan destino |

#### 5. Limpieza de Datos
- Elimina registros de períodos de gracia procesados hace más de 30 días
- Limpia notificaciones antiguas

#### 6. Modelo `Group.js` en `la-subscriptions`

Para operar sobre la colección `groups` sin depender del servidor principal, el microservicio incluye un esquema Mongoose mínimo propio en `models/Group.js`. Comparte la misma base de datos MongoDB y usa `mongoose.models.Group || mongoose.model('Group', groupSchema)` para evitar conflictos de re-registro.

Campos relevantes que utiliza:
- `owner` (ObjectId): identifica al propietario del equipo
- `status` (String): `active` | `suspended` | `archived`
- `members[]`: array con `{ userId, role, status, joinedAt, lastActivityAt }`
- `invitations[]`: array con `{ status: pending | accepted | expired | ... }`
- `history[]`: log de acciones `{ action, performedBy, targetUser, details, timestamp }`

### Ejecución Manual

```bash
# Opción 1: Ejecutar directamente
node scripts/gracePeriodProcessor.js

# Opción 2: A través de scheduleTasks
node scripts/scheduleTasks.js processGracePeriods

# Script de prueba completo
./scripts/test-grace-periods.sh
```

---

## 🔧 Configuración

### Variables de Entorno

```env
# Base de datos (compartida con servidor principal)
MONGODB_URI=mongodb://...
URLDB=mongodb://...

# Webhooks
STRIPE_WEBHOOK_SECRET_DEV=whsec_...
WEBHOOK_URL=http://localhost:5001/api/webhook

# Stripe
STRIPE_API_KEY_DEV=sk_test_...

# Emails
ADMIN_EMAIL=admin@example.com
SUPPORT_EMAIL=support@example.com

# AWS (para notificaciones)
AWS_REGION=sa-east-1
EMAIL_MARKETING_DEFAULT_SENDER=noreply@tuapp.com

# URLs
BASE_URL=http://localhost:3000
BASE_URL=https://www.lawanalytics.app
```

### Eventos de Stripe Configurados

Solo estos eventos deben estar activos en el webhook de Stripe:
- `invoice.payment_failed`
- `invoice.payment_succeeded`
- `invoice.paid`
- `charge.failed` (opcional)

### Tareas Programadas (Cron Jobs)

- **Grace Period Processor**: Diariamente a las 2:00 AM
- **Retry Failed Webhooks**: Cada hora
- **Payment Recovery Check**: Cada 4 horas
- **Sync with Stripe**: Cada 6 horas

---

## 🚀 Instalación y Despliegue

### Instalación

```bash
# Clonar repositorio
git clone [repository-url]
cd la-subscriptions

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus valores
```

### Desarrollo

```bash
# Ejecutar en modo desarrollo
npm run dev

# O usar PM2
pm2 start ecosystem.config.js --env development
```

### Producción

```bash
# Iniciar el microservicio completo
pm2 start ecosystem.config.js --env production

# O iniciar componentes individuales
pm2 start ecosystem.config.js --only stripe-webhooks
pm2 start ecosystem.config.js --only grace-period-processor

# Guardar configuración PM2
pm2 save
pm2 startup
```

---

## 🧪 Pruebas

### Scripts de Prueba

Los scripts de prueba están en `scripts/pruebas/`:

#### 1. Simulador de Eventos Webhook
```bash
# Modo interactivo
node scripts/pruebas/testWebhookEvents.js

# Crear suscripción de prueba
node scripts/pruebas/testWebhookEvents.js create

# Enviar secuencia de pagos fallidos
node scripts/pruebas/testWebhookEvents.js seq

# Enviar evento específico
node scripts/pruebas/testWebhookEvents.js 5  # Pago fallido
```

#### 2. Pruebas de Pagos Fallidos
```bash
# Modo interactivo
node scripts/pruebas/testPaymentFailures.js

# Simular secuencia completa
node scripts/pruebas/testPaymentFailures.js seq

# Simular evento específico
node scripts/pruebas/testPaymentFailures.js 1  # Primer intento fallido
```

#### 3. Listener de Webhooks (Stripe CLI)
```bash
# Escuchar webhooks reales de Stripe
node scripts/pruebas/stripeWebhookListen.js
```

#### 4. Servidor Local de Webhooks
```bash
# Alternativa cuando hay problemas con Stripe CLI
node scripts/pruebas/stripeWebhookListenLocal.js

# En otra terminal, usar ngrok:
ngrok http 3001
```

### Flujo de Pruebas Recomendado

1. **Configurar entorno**:
   ```bash
   npm run dev  # Terminal 1
   ```

2. **Crear datos de prueba**:
   ```bash
   node scripts/pruebas/testWebhookEvents.js create  # Terminal 2
   ```

3. **Probar eventos individuales**:
   ```bash
   node scripts/pruebas/testWebhookEvents.js  # Terminal 2
   # Seleccionar eventos del menú
   ```

4. **Probar secuencia de pagos fallidos**:
   ```bash
   node scripts/pruebas/testPaymentFailures.js seq  # Terminal 2
   ```

5. **Monitorear logs**:
   ```bash
   pm2 logs stripe-webhooks  # Terminal 3
   ```

---

## 📊 Monitoreo y Logs

### Prefijos de Log

- `[PAYMENT_FAILED]` - Fallo de pago procesado
- `[PAYMENT_RECOVERY]` - Pago recuperado
- `[SKIP]` - Evento ignorado (no es de pagos o hay conflicto)
- `[ERROR]` - Error en procesamiento
- `[AUTO-ARCHIVE]` - Auto-archivado ejecutado
- `[PAYMENT-GRACE]` - Período de gracia por pagos procesado
- `🔄 PROCESADOR DE PERÍODOS DE GRACIA` - Ejecución del processor

### Comandos de Monitoreo

```bash
# Ver logs en tiempo real
pm2 logs stripe-webhooks
pm2 logs grace-period-processor

# Ver logs del procesador
pm2 logs stripe-webhooks | grep "PROCESADOR DE PERÍODOS"

# Ver archivados
grep "AUTO-ARCHIVE" logs/combined.log

# Ver recordatorios enviados
grep "gracePeriod.*Sent" logs/combined.log

# Ver errores
grep "ERROR.*grace" logs/error.log

# Monitorear webhooks
node scripts/monitorWebhooks.js
```

### Ejemplo de Log del Procesador

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

### Métricas Clave

1. Tasa de fallos por período
2. Tiempo promedio de recuperación
3. Efectividad de cada tipo de email
4. Suscripciones en cada estado
5. Elementos archivados por período
6. Recordatorios enviados

---

## 🔧 Troubleshooting

### Errores Comunes

#### Error: "Cannot find module '../models/...'"
Los scripts ahora están en una subcarpeta. Asegúrate de ejecutarlos desde la raíz del proyecto:
```bash
cd /home/mcerra/www/la-subscriptions
node scripts/pruebas/testWebhookEvents.js
```

#### Error: "No such subscription"
Primero crea la suscripción de prueba:
```bash
node scripts/pruebas/testWebhookEvents.js create
```

#### Error con Stripe CLI
Usa el servidor local alternativo:
```bash
node scripts/pruebas/stripeWebhookListenLocal.js
```

#### Error: "ADMIN_EMAIL no configurado"
Asegúrate de tener configurada la variable:
```bash
export ADMIN_EMAIL=tu-email@example.com
# O agrégala al archivo .env
```

### Debugging en MongoDB

```javascript
// Verificar suscripciones con período de gracia
db.subscriptions.find({
  'downgradeGracePeriod.expiresAt': { $exists: true },
  'downgradeGracePeriod.autoArchiveScheduled': true
})

// Suscripciones en grace_period por pagos
db.subscriptions.find({
  accountStatus: 'grace_period',
  'paymentFailures.count': { $gte: 4 }
})

// Ver eventos de webhook procesados
db.webhookevents.find().sort({ createdAt: -1 }).limit(10)
```

---

## 🚨 Reglas Importantes

### 1. Procesamiento de Webhooks

```javascript
// No interferir con períodos de gracia
if (subscription.downgradeGracePeriod?.expiresAt > new Date()) {
  return; // NO procesar pagos fallidos durante período de gracia
}

// No procesar suscripciones canceladas
if (subscription.status === 'canceled') {
  return; // Ignorar eventos de pago
}
```

### 2. Actualización de Campos

**Webhooks - Solo actualizar accountStatus**:
- ✅ `subscription.accountStatus = 'at_risk'`
- ❌ `subscription.status = 'active'` (NO hacer esto en webhooks)
- ❌ `subscription.plan = 'free'` (NO hacer esto en webhooks)

**Grace Period Processor - PUEDE modificar plan y status**:
```javascript
// SOLO cuando expira grace period por pagos
if (gracePeriodExpired && paymentFailures.count >= 4) {
  subscription.plan = 'free';
  subscription.status = 'canceled';
  subscription.accountStatus = 'archived';
}
```

### 3. Historial Específico

```javascript
statusHistory.push({
  status: 'payment_failed_1', // Usar prefijo 'payment_'
  triggeredBy: 'payment_webhook' // Para webhooks
  // o
  triggeredBy: 'grace_period_processor' // Para processor
});
```

---

## 🔧 Integración con PlanConfig

### Nuevas Funciones Dinámicas

El microservicio ahora utiliza la colección `PlanConfig` para obtener información actualizada de los planes:

#### 1. **getPlanLimitsFromConfig(planId)**
```javascript
// Obtiene límites dinámicamente desde la base de datos
const limits = await getPlanLimitsFromConfig('standard');
// Retorna: { maxFolders: 50, maxCalculators: 20, maxContacts: 100, maxStorage: 1024 }
```

#### 2. **getPremiumFeaturesFromConfig(planId)**
```javascript
// Obtiene características habilitadas del plan
const features = await getPremiumFeaturesFromConfig('premium');
// Retorna: ['Análisis avanzados', 'Exportación de reportes', ...]
```

#### 3. **Validación de Plan Gratuito**
```javascript
// Antes de procesar pagos fallidos
const planConfig = await PlanConfig.findOne({ planId: subscription.plan });
if (planConfig && planConfig.pricingInfo.basePrice === 0) {
  logger.warn('[SKIP] Ignorando pago fallido para plan gratuito');
  return;
}
```

### Estructura de PlanConfig Esperada
```javascript
{
  planId: 'standard',
  stripePriceId: 'price_1RC96RJdr4OZ264aKCFlWorm',
  displayName: 'Plan Estándar',
  pricingInfo: {
    basePrice: 9.99,
    currency: 'USD',
    billingPeriod: 'monthly'
  },
  resourceLimits: [
    { name: 'folders', limit: 50 },
    { name: 'calculators', limit: 20 },
    { name: 'contacts', limit: 100 },
    { name: 'storage', limit: 1024 }
  ],
  features: [
    { name: 'exportReports', enabled: true, description: 'Exportación de reportes' },
    { name: 'bulkOperations', enabled: true, description: 'Operaciones masivas' },
    // ...
  ]
}
```

### Ventajas de la Integración
1. **Flexibilidad**: Los límites y características se pueden cambiar sin modificar código
2. **Consistencia**: Una única fuente de verdad para la información de planes
3. **Mantenibilidad**: Menos código hardcodeado
4. **Escalabilidad**: Fácil agregar nuevos planes o modificar existentes

---

## 📚 Referencias

### Archivos Principales

- **Server**: `server.js`
- **Webhook Controller**: `controllers/webhookController.js`
- **Grace Period Processor**: `scripts/gracePeriodProcessor.js`
- **Scheduled Tasks**: `scripts/scheduleTasks.js`
- **Email Service**: `services/emailService.js`
- **Subscription Service**: `services/subscriptionService.js`

### Modelos

- `models/Subscription.js`
- `models/User.js`
- `models/WebhookEvent.js`
- `models/Alert.js`

### Scripts de Utilidad

- `scripts/monitorWebhooks.js` - Monitoreo en tiempo real
- `scripts/retryFailedWebhooks.js` - Reintentar webhooks fallidos
- `scripts/checkPaymentRecovery.js` - Verificar recuperación de pagos
- `scripts/test-grace-periods.sh` - Test del procesador de grace periods

### Documentación de Pruebas

En `scripts/pruebas/docs/`:
- `PRUEBAS_WEBHOOKS_GUIA.md` - Guía completa de pruebas
- `PRUEBAS_FASE1_IDEMPOTENCIA.md` - Pruebas de idempotencia
- `FASE2_PAGOS_FALLIDOS_IMPLEMENTACION.md` - Sistema de pagos fallidos

---

## 📈 Estados del Sistema

### Estados de Account (gestionados por este servicio)
- `active`: Pagos al día
- `at_risk`: 1-2 fallos de pago
- `suspended`: 3 fallos, características premium deshabilitadas
- `grace_period`: 4+ fallos, 15 días para resolver
- `archived`: Grace period expirado, contenido archivado

### Estados de Subscription (NO modificar)
- `active`: Suscripción activa
- `canceled`: Suscripción cancelada
- `incomplete`: Pago inicial pendiente
- etc.

---

## ⚠️ Consideraciones Importantes

1. **Base de Datos Compartida**: El microservicio comparte la misma base de datos que el servidor principal
2. **No Interferencia**: Solo modifica campos específicos sin interferir con la lógica principal
3. **Idempotencia**: Todos los procesos son idempotentes - se pueden ejecutar múltiples veces sin efectos adversos
4. **Notificaciones**: Todos los emails se envían al usuario afectado y se registran en el sistema
5. **Migración**: Al migrar desde el servidor principal, desactivar el procesamiento de grace periods allí

---

## 🔄 Migración desde Servidor Principal

Para desactivar el procesamiento en el servidor principal:

1. Comentar o eliminar el cron job de `checkGracePeriods` en el servidor principal
2. Verificar que el microservicio esté ejecutando el nuevo procesador:
   ```bash
   pm2 start ecosystem.config.js --only grace-period-processor
   pm2 save
   ```
3. Monitorear durante 24-48 horas para asegurar funcionamiento correcto:
   ```bash
   pm2 logs grace-period-processor --lines 100
   ```

---

**Última actualización**: Febrero 2025  
**Versión**: 1.1.0 - Microservicio con Grace Period Processor integrado