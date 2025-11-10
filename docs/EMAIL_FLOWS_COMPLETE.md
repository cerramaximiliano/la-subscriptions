# Flujos Completos de Emails del Sistema de Suscripciones

## Índice
1. [Ciclo de Vida de Suscripción](#ciclo-de-vida-de-suscripción)
2. [Pagos Fallidos](#pagos-fallidos)
3. [Período de Gracia (Downgrade)](#período-de-gracia-downgrade)
4. [Resumen de Templates](#resumen-de-templates)
5. [Diagrama de Flujos](#diagrama-de-flujos)

---

## 1. Ciclo de Vida de Suscripción

### 1.1 Nueva Suscripción / Upgrade
**Trigger:** Usuario crea suscripción o hace upgrade
**Event:** `created` o `upgraded`
**Template:** `subscriptionCreated`
**Categoría:** `subscription`

**Variables:**
- `userName` - Nombre del usuario
- `planName` - Nombre del plan (free, standard, premium)
- `maxFolders` - Límite de carpetas
- `maxCalculators` - Límite de calculadoras
- `maxContacts` - Límite de contactos
- `nextBillingDate` - Próxima fecha de facturación

**Subject:** "¡Bienvenido a tu nueva suscripción!"

**Cuándo se envía:** Inmediatamente después de crear/actualizar suscripción

---

### 1.2 Cancelación Inmediata
**Trigger:** Usuario cancela sin período de gracia
**Event:** `canceled` con `immediate: true`
**Template:** `subscriptionImmediateCancellation`
**Categoría:** `subscription`

**Variables:**
- `userName`
- `previousPlan` - Plan que tenía
- `gracePeriodEnd` - Fecha fin de acceso
- `foldersLimit` - Límite de carpetas del plan free
- `calculatorsLimit` - Límite de calculadoras del plan free
- `contactsLimit` - Límite de contactos del plan free

**Subject:** "Tu suscripción ha sido cancelada"

**Cuándo se envía:** Al cancelar inmediatamente

---

### 1.3 Cancelación Programada
**Trigger:** Usuario cancela al final del período
**Event:** `canceled` con `immediate: false`
**Template:** `subscriptionScheduledCancellation`
**Categoría:** `subscription`

**Variables:**
- `userName`
- `previousPlan`
- `gracePeriodEnd` - Fin del período actual
- `foldersLimit`
- `calculatorsLimit`
- `contactsLimit`

**Subject:** "Tu suscripción será cancelada al final del período"

**Cuándo se envía:** Al programar cancelación

---

### 1.4 Plan Downgraded (Confirmación)
**Trigger:** Downgrade completado
**Event:** `planDowngraded`
**Template:** `planDowngraded`
**Categoría:** `subscription`

**Variables:**
- `userName`
- `previousPlan`
- `planName` - Nuevo plan
- `planLimits` - Límites del nuevo plan

**Subject:** "Tu plan ha sido cambiado"

**Cuándo se envía:** Después de completar downgrade

---

### 1.5 Plan Upgraded (Confirmación)
**Trigger:** Upgrade completado
**Event:** `planUpgraded`
**Template:** `planUpgraded`
**Categoría:** `subscription`

**Variables:**
- `userName`
- `previousPlan`
- `planName` - Nuevo plan
- `planLimits` - Límites del nuevo plan

**Subject:** "¡Tu plan ha sido actualizado!"

**Cuándo se envía:** Después de completar upgrade

---

## 2. Pagos Fallidos

### 2.1 Primera Advertencia de Pago Fallido
**Trigger:** Primer intento de pago falla
**Type:** `first`
**Template:** `paymentFailedFirst`
**Categoría:** `subscription`

**Variables:**
- `userName`
- `planName`
- `amount` - Monto que falló
- `nextRetryDate` - Fecha del próximo reintento
- `supportEmail`

**Subject:** "Problema con tu pago"

**Cuándo se envía:** Inmediatamente después del primer fallo

---

### 2.2 Segunda Advertencia de Pago Fallido
**Trigger:** Segundo intento de pago falla
**Type:** `second`
**Template:** `paymentFailedSecond`
**Categoría:** `subscription`

**Variables:**
- `userName`
- `planName`
- `amount`
- `nextRetryDate`
- `supportEmail`

**Subject:** "Segundo intento de pago fallido"

**Cuándo se envía:** Después del segundo fallo (aprox. 3 días después)

---

### 2.3 Advertencia Final de Pago Fallido
**Trigger:** Tercer intento de pago falla
**Type:** `final`
**Template:** `paymentFailedFinal`
**Categoría:** `subscription`

**Variables:**
- `userName`
- `planName`
- `amount`
- `suspensionDate` - Fecha de suspensión
- `supportEmail`

**Subject:** "Última advertencia - Pago pendiente"

**Cuándo se envía:** Después del tercer fallo (aprox. 7 días después)

---

### 2.4 Suspensión por Pago Fallido
**Trigger:** Cuarto intento de pago falla
**Type:** `suspension`
**Template:** `paymentFailedSuspension`
**Categoría:** `subscription`

**Variables:**
- `userName`
- `planName`
- `gracePeriodEndDate` - Fecha fin de período de gracia
- `supportEmail`

**Subject:** "Tu cuenta ha sido suspendida"

**Cuándo se envía:** Después del cuarto fallo (aprox. 10 días después)

---

### 2.5 Pago Recuperado
**Trigger:** Pago exitoso después de fallos
**Type:** `paymentRecovered`
**Template:** `paymentRecovered`
**Categoría:** `subscription`

**Variables:**
- `userName`
- `planName`
- `amount`

**Subject:** "¡Tu pago ha sido procesado exitosamente!"

**Cuándo se envía:** Cuando se recupera el pago

---

## 3. Período de Gracia (Downgrade)

### 3.1 Recordatorio de Grace Period - CON exceso
**Trigger:** Cron job cada hora, 3 días o 1 día antes de expiración
**Event:** `gracePeriodReminder`
**Template:** `gracePeriodReminderWithExcess`
**Categoría:** `subscription`

**Condición:** `foldersToArchive > 0 || calculatorsToArchive > 0 || contactsToArchive > 0`

**Variables:**
- `userName`
- `daysRemaining` - Días antes de expiración (3 o 1)
- `gracePeriodEnd` - Fecha de expiración
- `currentFolders` - Carpetas actuales
- `currentCalculators` - Calculadoras actuales
- `currentContacts` - Contactos actuales
- `foldersToArchive` - Carpetas que se archivarán
- `calculatorsToArchive` - Calculadoras que se archivarán
- `contactsToArchive` - Contactos que se archivarán
- `planLimits.maxFolders` - Límite del plan objetivo
- `planLimits.maxCalculators`
- `planLimits.maxContacts`
- `targetPlan` - Plan al que se moverá

**Subject:** "⚠️ Acción requerida - Tu período de gracia vence en {{daysRemaining}} días"

**Cuándo se envía:**
- 3 días antes de expiración (si `reminder3DaysSent: false`)
- 1 día antes de expiración (si `reminder1DaySent: false`)

---

### 3.2 Recordatorio de Grace Period - SIN exceso
**Trigger:** Cron job cada hora, 3 días o 1 día antes de expiración
**Event:** `gracePeriodReminder`
**Template:** `gracePeriodReminderNoExcess`
**Categoría:** `subscription`

**Condición:** `foldersToArchive === 0 && calculatorsToArchive === 0 && contactsToArchive === 0`

**Variables:**
- `userName`
- `daysRemaining`
- `gracePeriodEnd`
- `currentFolders`
- `currentCalculators`
- `currentContacts`
- `planLimits.maxFolders`
- `planLimits.maxCalculators`
- `planLimits.maxContacts`
- `targetPlan`

**Subject:** "Tu período de gracia vence en {{daysRemaining}} días"

**Cuándo se envía:** 3 días o 1 día antes, cuando el usuario NO excede límites

---

### 3.3 Grace Period Expirado - CON archivado
**Trigger:** Expiración del período de gracia
**Event:** `gracePeriodExpired`
**Template:** `gracePeriodExpiredWithArchive`
**Categoría:** `subscription`

**Condición:** `totalArchived > 0`

**Variables:**
- `userName`
- `planName` - Plan anterior
- `targetPlan` - Nuevo plan
- `foldersArchived` - Carpetas archivadas
- `calculatorsArchived` - Calculadoras archivadas
- `contactsArchived` - Contactos archivados
- `totalArchived` - Total de elementos archivados
- `planLimits` - Límites del nuevo plan

**Subject:** "Tus elementos han sido archivados automáticamente"

**Cuándo se envía:** Al expirar grace period y ejecutar auto-archivado

---

### 3.4 Grace Period Expirado - SIN archivado
**Trigger:** Expiración del período de gracia
**Event:** `gracePeriodExpired`
**Template:** `gracePeriodExpiredNoArchive`
**Categoría:** `subscription`

**Condición:** `totalArchived === 0`

**Variables:**
- `userName`
- `planName`
- `targetPlan`
- `planLimits`

**Subject:** "Tu período de gracia ha expirado"

**Cuándo se envía:** Al expirar grace period sin elementos a archivar

---

## 4. Resumen de Templates

### Templates de Suscripción (category: 'subscription')

| Template Name | Event | Condición | Cuándo |
|---------------|-------|-----------|--------|
| `subscriptionCreated` | created/upgraded | - | Al crear/actualizar suscripción |
| `subscriptionImmediateCancellation` | canceled | immediate: true | Cancelación inmediata |
| `subscriptionScheduledCancellation` | canceled | immediate: false | Cancelación programada |
| `planDowngraded` | planDowngraded | - | Después de downgrade |
| `planUpgraded` | planUpgraded | - | Después de upgrade |
| `paymentFailedFirst` | payment failed | 1er intento | Inmediato |
| `paymentFailedSecond` | payment failed | 2do intento | ~3 días |
| `paymentFailedThird` | payment failed | 3er intento | ~7 días |
| `paymentFailedFinal` | payment failed | 3er intento | ~7 días |
| `paymentFailedSuspension` | payment failed | 4to intento | ~10 días |
| `paymentRecovered` | payment recovered | - | Al recuperar pago |
| `gracePeriodReminderWithExcess` | grace period | excede límites | 3 días o 1 día antes |
| `gracePeriodReminderNoExcess` | grace period | no excede límites | 3 días o 1 día antes |
| `gracePeriodExpiredWithArchive` | grace expired | totalArchived > 0 | Al expirar + archivado |
| `gracePeriodExpiredNoArchive` | grace expired | totalArchived === 0 | Al expirar sin archivado |

---

## 5. Diagrama de Flujos

### 5.1 Flujo de Cancelación/Downgrade

```
Usuario Cancela/Downgrade
         |
         v
   ¿Inmediata?
    /         \
  SÍ           NO
   |            |
   v            v
Cancelación   Cancelación
Inmediata     Programada
   |            |
   |            v
   |      Período de Gracia Inicia
   |            |
   |            v
   |      [Cron: cada hora]
   |            |
   |            v
   |      ¿3 días antes?
   |        /        \
   |      SÍ          NO
   |       |           |
   |       v           v
   |   ¿Excede?    ¿1 día antes?
   |    /    \       /      \
   |  SÍ      NO    SÍ       NO
   |   |      |      |        |
   |   v      v      v        v
   | WithEx NoEx  WithEx   Esperar
   |   |      |      |
   |   +------+------+
   |          |
   v          v
   |    Expiración
   |          |
   |          v
   |      ¿Archivado?
   |       /      \
   |     SÍ        NO
   |      |         |
   |      v         v
   |  WithArchive NoArchive
   |      |         |
   +------+---------+
          |
          v
    Plan Downgraded
```

### 5.2 Flujo de Pagos Fallidos

```
Pago Falla
    |
    v
1er Intento
    |
    v
paymentFailedFirst
    |
    v
Esperar ~3 días
    |
    v
2do Intento
    |
    v
¿Exitoso?
  /    \
SÍ     NO
 |      |
 v      v
OK   paymentFailedSecond
      |
      v
Esperar ~4 días
      |
      v
3er Intento
      |
      v
¿Exitoso?
  /    \
SÍ     NO
 |      |
 v      v
OK   paymentFailedFinal
      |
      v
Esperar ~3 días
      |
      v
4to Intento
      |
      v
¿Exitoso?
  /    \
SÍ     NO
 |      |
 v      v
OK   paymentFailedSuspension
      |
      v
Grace Period (15 días)
      |
      v
Downgrade a Free
```

---

## 6. Variables Comunes en Todos los Templates

Todas las funciones de envío de email agregan automáticamente:

```javascript
{
  userName: user.firstName || user.name || user.email.split('@')[0],
  userEmail: user.email,
  ...additionalData // Datos específicos del template
}
```

---

## 7. Cron Jobs y Automatización

### Grace Period Processor
**Archivo:** `scripts/gracePeriodProcessor.js`
**Frecuencia:** Cada hora (configurado en `scheduleTasks.js`)
**Funciones:**
1. Procesar períodos vencidos (auto-archivado)
2. Procesar períodos de pago fallido
3. Enviar recordatorios (3 días y 1 día)
4. Limpiar datos obsoletos

### Schedule Tasks
**Archivo:** `scripts/scheduleTasks.js`
**Cron Jobs:**
- Grace Period Reminders: `0 * * * *` (cada hora en punto)
- Webhook Retries: `0 */6 * * *` (cada 6 horas)

---

## 8. Códigos de Referencia

### Archivo: `services/emailService.js`

**Función:** `sendSubscriptionEmail(user, event, additionalData)`

**Eventos soportados:**
- `created` / `upgraded`
- `canceled` (con `immediate: true/false`)
- `downgraded`
- `gracePeriodReminder`
- `gracePeriodExpired`
- `scheduledCancellation`
- `planDowngraded`
- `planUpgraded`

**Función:** `sendPaymentFailedEmail(to, data, type)`

**Tipos soportados:**
- `first`
- `second`
- `final`
- `suspension`

**Función:** `sendPaymentEmail(user, type, data)`

**Tipos soportados:**
- `paymentRecovered`

---

## 9. Testing

### Enviar Email de Prueba Manualmente

```javascript
// En node REPL o script
const emailService = require('./services/emailService');
const User = require('./models/User');

const testUser = await User.findOne({ email: 'test@example.com' });

// Test grace period reminder
await emailService.sendSubscriptionEmail(testUser, 'gracePeriodReminder', {
  daysRemaining: 3,
  gracePeriodEnd: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString('es-ES'),
  currentFolders: 37,
  currentCalculators: 2,
  currentContacts: 2,
  foldersToArchive: 32,
  calculatorsToArchive: 0,
  contactsToArchive: 0,
  planLimits: { maxFolders: 5, maxCalculators: 3, maxContacts: 10 },
  targetPlan: 'free'
});
```

### Resetear Notificaciones

```javascript
const Subscription = require('./models/Subscription');

await Subscription.updateOne(
  { user: userId },
  {
    $set: {
      'downgradeGracePeriod.reminder3DaysSent': false,
      'downgradeGracePeriod.reminder1DaySent': false,
      'downgradeGracePeriod.reminderSent': false
    }
  }
);
```

---

## 10. Notas Importantes

1. **Modo Test:** Si `global.currentWebhookTestMode` está activo, los emails se redirigen a la whitelist configurada en `TEST_EMAIL_WHITELIST`

2. **Templates en BD:** Todos los templates se almacenan en MongoDB en la colección `emailtemplates` y se obtienen dinámicamente

3. **Sintaxis de Variables:** Los templates usan sintaxis Handlebars `{{variable}}` (no `${variable}`)

4. **URL del Botón:** Siempre usar `https://lawanalytics.app/apps/profiles/account/settings` para gestión de cuenta

5. **Flags de Recordatorios:**
   - `reminder3DaysSent`: Se marca cuando se envía recordatorio de 3 días
   - `reminder1DaySent`: Se marca cuando se envía recordatorio de 1 día
   - Estos flags previenen envíos duplicados

6. **Grace Period End:** Las fechas deben formatearse con `.toLocaleDateString('es-ES')` para mostrar correctamente en español
