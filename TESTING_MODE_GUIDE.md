# Guía de Modo TEST - Sistema de Webhooks y Suscripciones

Esta guía explica cómo funciona el sistema de testing end-to-end con eventos de Stripe en modo TEST.

---

## 🎯 Cómo Funciona

El sistema detecta automáticamente si un webhook proviene de Stripe TEST o Stripe LIVE usando `event.livemode`:

```javascript
const isTestMode = !event.livemode;  // true si es TEST, false si es LIVE
```

### ✅ Modo TEST (event.livemode = false)
- **Suscripciones marcadas**: `testMode: true` en MongoDB
- **Emails identificados**: Subject con prefijo `[TEST]`
- **Cron procesa**: Igual que LIVE, con logs `[TEST]`
- **Datos aislados**: Fácil de identificar y limpiar

### ✅ Modo LIVE (event.livemode = true)
- **Suscripciones normales**: `testMode: false` (default)
- **Emails normales**: Sin prefijo
- **Cron procesa**: Normal, con logs `[LIVE]`
- **Datos de producción**: Nunca se mezclan con TEST

---

## 📋 Qué se Testa Completamente

### 1. **Webhooks de Pago Fallido** (`invoice.payment_failed`)

✅ **Funciona igual en TEST y LIVE**:
- Incrementa `paymentFailures.count`
- Cambia `accountStatus` según número de fallos
- Envía emails en cada etapa
- Activa período de gracia (15 días)
- **Marca la suscripción con `testMode: true`**

**Comportamiento por fallo:**
```
Fallo 1: accountStatus → 'at_risk'
         Email: "Primer aviso de pago fallido"

Fallo 2: accountStatus → 'at_risk'
         Email: "Segunda advertencia"

Fallo 3: accountStatus → 'suspended'
         Email: "Advertencia final + Suspensión"
         Acción: Suspende características premium

Fallo 4+: accountStatus → 'grace_period'
          Email: "Período de gracia activado"
          Acción: Activa período de gracia de 15 días
```

### 2. **Webhooks de Pago Exitoso** (`invoice.paid`, `invoice.payment_succeeded`)

✅ **Funciona igual en TEST y LIVE**:
- Resetea `paymentFailures.count` a 0
- Cambia `accountStatus` a `active`
- Envía email de "pago recuperado"
- **Marca la suscripción con `testMode: true`**

### 3. **Procesamiento de Período de Gracia** (Cron)

✅ **El cron procesa suscripciones TEST igual que LIVE**:
- Auto-archiva recursos cuando expira el período
- Envía recordatorios (7 días, 3 días, 1 día antes)
- Crea alertas en el sistema
- **Identifica con logs `[TEST]` o `[LIVE]`**

### 4. **Envío de Emails**

✅ **Emails TEST son identificables**:
- Subject: `[TEST] Título del email`
- Banner amarillo en el cuerpo indicando modo TEST
- Redirigido a email de la whitelist
- Variable `global.currentWebhookTestMode` activa

---

## 🚀 Cómo Usar el Sistema de Testing

### Paso 1: Configurar Webhook en Stripe Dashboard

1. Ve a [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/test/webhooks)
2. **Asegúrate de estar en modo TEST** (esquina superior derecha)
3. Click en "Add endpoint"
4. URL: `https://server.lawanalytics.app:3500/api/webhook-dev`
5. Selecciona eventos:
   - `invoice.payment_failed`
   - `invoice.payment_succeeded`
   - `invoice.paid`
6. Guarda y **copia el webhook secret**

### Paso 2: Configurar Variables de Entorno

```bash
# Edita tu .env
nano /home/mcerra/www/la-subscriptions/.env
```

Agrega/actualiza:
```bash
# Webhook secret de TEST (el que acabas de copiar)
STRIPE_WEBHOOK_SECRET_DEV=whsec_TU_SECRET_DE_STRIPE_TEST

# Whitelist de emails para testing
TEST_EMAIL_WHITELIST=cerramaximiliano@gmail.com,otro@email.com

# Asegúrate de tener el modo correcto
NODE_ENV=development  # o production
```

### Paso 3: Reiniciar Servidor

```bash
cd /home/mcerra/www/la-subscriptions
pm2 restart stripe-webhooks
pm2 logs stripe-webhooks
```

Verifica que muestre:
```
✅ Registrando ruta de webhook para testing: /api/webhook-dev
📝 Webhook de testing configurado:
   Endpoint: https://server.lawanalytics.app:3500/api/webhook-dev
   Secret: Configurado ✅
```

### Paso 4: Testear Webhooks

#### Opción A: Desde Stripe Dashboard (Recomendado)

1. Ve a [Stripe Dashboard → Developers → Events](https://dashboard.stripe.com/test/events)
2. **Asegúrate de estar en modo TEST**
3. Encuentra un evento (ej: `invoice.payment_failed`)
4. Click en el evento → "Send test webhook"
5. Selecciona tu webhook de desarrollo
6. Click "Send"

#### Opción B: Disparar Eventos con Stripe CLI

```bash
# Evento de pago fallido
stripe trigger invoice.payment_failed

# Evento de pago exitoso
stripe trigger invoice.payment_succeeded
```

### Paso 5: Monitorear Logs

```bash
# Ver logs en tiempo real
pm2 logs stripe-webhooks

# Buscar logs de TEST
pm2 logs stripe-webhooks | grep TEST

# Ver logs del cron
pm2 logs grace-period-cron-scheduler
```

**Logs esperados:**
```
[TEST] Pago de factura fallido: in_test_xxxxx
[TEST] Marcando suscripción como testMode
📧 EMAIL BLOQUEADO (Modo Test) - Email original: usuario@example.com
✉️  Email será enviado a: cerramaximiliano@gmail.com
[AUTO-ARCHIVE] [TEST] Procesando usuario test@example.com
🧪 Suscripciones TEST a procesar: 1
```

---

## 🧹 Limpieza de Datos TEST

Después de testear, limpia los datos con:

```bash
cd /home/mcerra/www/la-subscriptions

# Ver qué se eliminaría (simulación)
node scripts/cleanupTestData.js --dry-run

# Ejecutar limpieza
node scripts/cleanupTestData.js --force
```

**Qué hace el script:**
- Encuentra todas las suscripciones con `testMode: true`
- Resetea contadores: `paymentFailures.count → 0`
- Resetea status: `accountStatus → 'active'`
- Elimina período de gracia: `downgradeGracePeriod → null`
- Marca como limpio: `testMode → false`

---

## 📊 Verificar Estado en MongoDB

```javascript
// Buscar suscripciones TEST
db.subscriptions.find({ testMode: true })

// Contar TEST vs LIVE
db.subscriptions.aggregate([
  {
    $group: {
      _id: "$testMode",
      count: { $sum: 1 }
    }
  }
])

// Ver detalle de una suscripción TEST
db.subscriptions.findOne(
  { testMode: true },
  {
    user: 1,
    plan: 1,
    accountStatus: 1,
    'paymentFailures.count': 1,
    'downgradeGracePeriod.expiresAt': 1,
    testMode: 1
  }
)
```

---

## 🔍 Diferencias entre TEST y LIVE

| Aspecto | TEST (testMode: true) | LIVE (testMode: false) |
|---------|---------------------|----------------------|
| **Webhook** | `/api/webhook-dev` | `/api/webhook` |
| **Secret** | `STRIPE_WEBHOOK_SECRET_DEV` | `STRIPE_WEBHOOK_SECRET` |
| **event.livemode** | `false` | `true` |
| **Marca en BD** | `testMode: true` | `testMode: false` |
| **Emails** | Subject: `[TEST] ...` | Subject normal |
| **Email destino** | Redirigido a whitelist | Email real del usuario |
| **Logs** | `[TEST]` prefix | `[LIVE]` prefix |
| **Cron procesa** | ✅ Sí, igual que LIVE | ✅ Sí, normal |
| **Limpieza** | Fácil con script | No se toca |

---

## ⚠️ Notas Importantes

### 1. **Cron Procesa TODO**
El cron `grace-period-cron-scheduler` procesa **tanto TEST como LIVE**.

Esto significa:
- ✅ Puedes testear todo el flujo end-to-end
- ✅ Los recordatorios se envían
- ✅ El auto-archivado se ejecuta
- ⚠️  Usa datos REALES del usuario (folders, calculators, contacts)

### 2. **Emails van a la Whitelist**
```bash
TEST_EMAIL_WHITELIST=cerramaximiliano@gmail.com
```

Todos los emails TEST se redirigen a este email, sin importar el destinatario original.

### 3. **Datos TEST Identificables**
```javascript
// Fácil de filtrar
db.subscriptions.find({ testMode: false })  // Solo LIVE
db.subscriptions.find({ testMode: true })   // Solo TEST
```

### 4. **IDs de Stripe TEST**
Los eventos TEST de Stripe tienen IDs como:
- `evt_test_xxxxx`
- `in_test_xxxxx`
- `cus_test_xxxxx`
- `sub_test_xxxxx`

### 5. **Idempotencia**
Los webhooks usan idempotencia, así que:
- Reenviar el mismo evento → Status 409 (Duplicate)
- Para retestear: usa eventos diferentes o limpia `webhookevents` collection

---

## 🐛 Troubleshooting

### Problema: "Webhook Error: No signatures found"
**Causa**: El secret en `.env` no coincide con el de Stripe.

**Solución**:
```bash
# Verifica el secret en Stripe Dashboard
# Actualiza STRIPE_WEBHOOK_SECRET_DEV en .env
# Reinicia el servidor
pm2 restart stripe-webhooks
```

### Problema: "Status 409 - Duplicate event"
**Causa**: Estás reenviando el mismo evento.

**Solución**: Usa un evento diferente o limpia la colección:
```javascript
db.webhookevents.deleteMany({ eventType: 'invoice.payment_failed' })
```

### Problema: "No se marca como testMode"
**Causa**: El evento no tiene `livemode: false`.

**Solución**: Verifica que estés en modo TEST en Stripe Dashboard (esquina superior derecha debe decir "Test mode").

### Problema: "Emails no se redirigen"
**Causa**: `global.currentWebhookTestMode` no está activo.

**Solución**: Verifica que el evento tenga `livemode: false`. El webhook controller lo detecta automáticamente.

---

## 📚 Archivos Relevantes

```
la-subscriptions/
├── models/
│   └── Subscription.js                  # Campo testMode agregado
├── controllers/
│   └── webhookController.js             # Detección de event.livemode
├── services/
│   └── emailService.js                  # Prefijo [TEST] y redirección
├── scripts/
│   ├── gracePeriodProcessor.js          # Procesa TEST y LIVE
│   └── cleanupTestData.js               # Script de limpieza
├── routes/
│   └── webhookRoutes.js                 # /api/webhook-dev endpoint
└── TESTING_MODE_GUIDE.md                # Esta guía
```

---

## ✅ Checklist de Testing

Antes de testear:
- [ ] Webhook configurado en Stripe TEST mode
- [ ] `STRIPE_WEBHOOK_SECRET_DEV` actualizado en `.env`
- [ ] `TEST_EMAIL_WHITELIST` configurado
- [ ] Servidor reiniciado (`pm2 restart stripe-webhooks`)
- [ ] Logs monitoreados (`pm2 logs stripe-webhooks`)

Durante el testing:
- [ ] Verificar logs muestran `[TEST]`
- [ ] Verificar emails tienen prefijo `[TEST]`
- [ ] Verificar suscripción marcada con `testMode: true`
- [ ] Verificar cron procesa items TEST
- [ ] Verificar auto-archivado funciona

Después del testing:
- [ ] Ejecutar script de limpieza: `node scripts/cleanupTestData.js --force`
- [ ] Verificar en MongoDB: `db.subscriptions.find({ testMode: true }).count()` = 0
- [ ] Limpiar eventos duplicados si es necesario

---

## 🎓 Flujo Completo de Testing

```
1. Usuario TEST creado en Stripe TEST mode
   ↓
2. Webhook enviado a /api/webhook-dev
   ↓ (event.livemode = false)
3. Controller detecta modo TEST
   ↓
4. Suscripción marcada: testMode = true
   ↓
5. Email enviado con prefijo [TEST]
   ↓ (redirigido a whitelist)
6. Cron detecta período de gracia
   ↓ (logs muestran [TEST])
7. Auto-archivado ejecutado
   ↓
8. Limpieza con script
   ↓
9. testMode = false, datos reseteados
```

---

## 🆘 Soporte

Si encuentras problemas:
1. Revisa los logs: `pm2 logs stripe-webhooks --lines 100`
2. Verifica la configuración en MongoDB
3. Consulta esta guía
4. Ejecuta limpieza si es necesario

---

**Última actualización**: 2025-11-14
**Versión**: 1.0.0
