# Configuración de Webhook para Testing (Modo TEST de Stripe)

Esta guía explica cómo configurar un webhook separado para recibir eventos de Stripe en **modo TEST** en tu servidor de producción.

## Problema que Resuelve

Cuando quieres testear webhooks de Stripe sin afectar producción:
- ❌ No puedes usar localhost (Stripe necesita URL pública)
- ❌ Los webhooks de producción usan modo LIVE y no quieres interferir
- ❌ Necesitas testear con eventos reales de Stripe sin afectar datos de producción

**Solución**: Crear un endpoint `/api/webhook-dev` que:
- ✅ Corre en el mismo servidor de producción (URL pública válida)
- ✅ Usa un webhook secret diferente (`STRIPE_WEBHOOK_SECRET_DEV`)
- ✅ Recibe eventos de Stripe en modo TEST (no modo LIVE)
- ✅ No interfiere con el webhook de producción (`/api/webhook`)
- ✅ Está disponible en todos los entornos (development y production)

---

## Paso 1: Configurar Webhook en Stripe Dashboard

### 1.1 Ir a Stripe Dashboard
1. Ve a [Stripe Dashboard → Developers → Webhooks](https://dashboard.stripe.com/webhooks)
2. Click en **"Add endpoint"**

### 1.2 Configurar el Endpoint
```
Endpoint URL: https://tu-servidor-produccion.com/api/webhook-dev
Descripción: Webhook para Testing (Modo TEST)
```

**Importante**:
- Usa la URL de tu servidor en **producción** (ej: `https://server.lawanalytics.app/api/webhook-dev`)
- Este webhook recibirá eventos de Stripe en **modo TEST** solamente
- Los eventos en modo LIVE seguirán yendo a `/api/webhook` (producción)

### 1.3 Seleccionar Eventos
Selecciona los mismos eventos que tu webhook de producción:
- `invoice.payment_failed`
- `invoice.payment_succeeded`
- `invoice.paid`
- `charge.failed`

O selecciona **"Recibir todos los eventos"** si prefieres.

### 1.4 Guardar y Copiar el Secret
1. Click en **"Add endpoint"**
2. Stripe te mostrará el **"Signing secret"** (formato: `whsec_...`)
3. **Cópialo** - lo necesitarás en el siguiente paso

---

## Paso 2: Configurar Variables de Entorno

### 2.1 En tu archivo `.env` de producción
```bash
# Webhook secret para TESTING (el que acabas de crear en Stripe Dashboard)
STRIPE_WEBHOOK_SECRET_DEV=whsec_TU_NUEVO_SECRET_AQUI

# Webhook secret de PRODUCCIÓN (el que ya tienes para eventos LIVE)
STRIPE_WEBHOOK_SECRET=whsec_LcFZnuHVQQU2dyOucEuv2kn6xRRY83ab

# Otros secretos
STRIPE_SECRET_KEY_TEST=sk_test_...  # Para procesar eventos de test
STRIPE_SECRET_KEY=sk_live_...       # Para procesar eventos de producción
```

**Nota importante**:
- `STRIPE_WEBHOOK_SECRET_DEV` se usa para eventos de Stripe en modo TEST
- `STRIPE_WEBHOOK_SECRET` se usa para eventos de Stripe en modo LIVE
- Ambos endpoints funcionan en el mismo servidor de producción

### 2.2 Verificar que las variables se carguen correctamente
El servidor debe mostrar al iniciar:
```
✅ Registrando ruta de webhook para testing: /api/webhook-dev
📝 Webhook de testing configurado:
   Endpoint: https://tu-servidor.com:3500/api/webhook-dev
   Secret: Configurado ✅
```

---

## Paso 3: Testear el Webhook

### 3.1 Verificar que el servidor esté corriendo
```bash
# Con PM2
pm2 list

# Verificar que stripe-webhooks esté online
# Si no está corriendo:
pm2 start ecosystem.config.js --env production
pm2 logs stripe-webhooks
```

### 3.2 Disparar Evento de Prueba desde Stripe

**Opción A: Desde Stripe Dashboard**
1. Ve a [Stripe Dashboard → Developers → Events](https://dashboard.stripe.com/test/events)
2. Click en cualquier evento (ej: `invoice.payment_failed`)
3. Click en **"Send test webhook"**
4. Selecciona tu webhook de desarrollo
5. Click en **"Send test webhook"**

**Opción B: Desde Stripe CLI**
```bash
# Disparar evento específico
stripe trigger invoice.payment_failed --webhook-endpoint-id we_XXXXX

# Reenviar evento existente
stripe events resend evt_XXXXX --webhook-endpoint we_XXXXX
```

### 3.3 Verificar los Logs
```bash
# Ver logs en tiempo real
pm2 logs stripe-webhooks

# O ver archivos de log directamente
tail -f /home/mcerra/www/la-subscriptions/logs/output.log

# Buscar logs específicos de testing
grep "\[DEV\]" /home/mcerra/www/la-subscriptions/logs/output.log
```

Deberías ver (cuando recibas un evento de Stripe en modo TEST):
```
🔧 [DEV] Webhook verificado: invoice.payment_failed - ID: evt_test_xxxxx
🧪 [DEV] Evento en modo TEST detectado
📨 [DEV] Evento Stripe recibido: invoice.payment_failed
🔍 [DEV] Procesando invoice.payment_failed:
   - Invoice ID: in_test_xxxxx
   - Customer: cus_test_xxxxx
   - Subscription: sub_test_xxxxx
✅ [DEV] Webhook procesado exitosamente: invoice.payment_failed
```

**Nota**: Los IDs de Stripe en modo TEST contienen `_test_` en el nombre.

---

## Paso 4: Verificar Funcionamiento

### 4.1 Health Check del Webhook
```bash
curl http://localhost:3000/api/webhook/health
```

Respuesta esperada:
```json
{
  "status": "ok",
  "service": "payment-webhook-microservice",
  "webhook": "active",
  "environment": "development"
}
```

### 4.2 Verificar Endpoint Root
```bash
curl http://localhost:3000/
```

Respuesta esperada (en desarrollo):
```json
{
  "message": "Stripe Webhooks & Cron Service",
  "version": "1.0.0",
  "endpoints": {
    "health": "/health",
    "webhook": "/api/webhook",
    "webhookDev": "/api/webhook-dev",
    "cronConfig": "/api/cron-config"
  }
}
```

---

## Diferencias entre Endpoints

| Característica | `/api/webhook` | `/api/webhook-dev` |
|---------------|----------------|-------------------|
| **Secret usado** | `STRIPE_WEBHOOK_SECRET` (producción) o `STRIPE_WEBHOOK_SECRET_DEV` (desarrollo) | Solo `STRIPE_WEBHOOK_SECRET_DEV` |
| **Disponible en** | Producción y Desarrollo | Producción y Desarrollo |
| **Modo de Stripe** | LIVE (eventos reales con dinero real) | TEST (eventos de prueba) |
| **URL en Stripe** | URL de producción | URL de producción (mismo servidor) |
| **Logs** | Estándar | Prefijo `[DEV]` |
| **Propósito** | Webhooks de producción (modo LIVE) | Testing con modo TEST de Stripe |
| **Base de datos** | Producción | Producción (pero con datos de test) |

---

## Troubleshooting

### Error: "STRIPE_WEBHOOK_SECRET_DEV no está configurado"
**Solución**: Verifica que el secret esté en tu `.env`:
```bash
grep STRIPE_WEBHOOK_SECRET_DEV .env
```

### Error: "Webhook Error: No signatures found matching the expected signature"
**Causa**: El secret en `.env` no coincide con el secret en Stripe Dashboard.

**Solución**:
1. Ve a Stripe Dashboard → Webhooks
2. Click en tu webhook de desarrollo
3. Click en **"Reveal"** en "Signing secret"
4. Copia el secret y actualiza tu `.env`
5. Reinicia el servidor

### Error: Status 409 (Duplicate event)
**Causa**: Estás reenviando el mismo evento múltiples veces.

**Solución**: Esto es normal, el middleware de idempotencia está funcionando. Para testear con nuevos eventos:
- Dispara un nuevo evento desde Stripe CLI
- O limpia la colección `webhookevents` en MongoDB

### El endpoint `/api/webhook-dev` devuelve 404
**Causa**: El servidor no se reinició después de agregar la ruta.

**Solución**: Reinicia el servidor:
```bash
pm2 restart stripe-webhooks
pm2 logs stripe-webhooks
```

---

## Ventajas de esta Solución

✅ **Sin túneles**: No necesitas ngrok, localtunnel ni Stripe CLI
✅ **Mismo servidor**: Usa tu infraestructura de producción
✅ **Testing aislado**: Usa modo TEST de Stripe, no afecta datos de producción
✅ **Disponible siempre**: Funciona en producción y desarrollo
✅ **Logs claros**: Prefijo `[DEV]` en todos los logs
✅ **Seguro**: Requiere firma de Stripe obligatoriamente
✅ **URL pública válida**: Stripe puede alcanzarlo sin problemas

---

## Notas de Seguridad

1. **El endpoint usa un webhook secret diferente (`STRIPE_WEBHOOK_SECRET_DEV`)**
2. **Solo procesa eventos de Stripe en modo TEST (livemode=false)**
3. **Ambos endpoints corren en producción pero con secrets diferentes**
4. **Los eventos TEST no afectan datos de producción**
5. **Revisa los logs regularmente para detectar accesos no autorizados**

---

## Arquitectura

```
Servidor de Producción (https://server.lawanalytics.app)
│
├── /api/webhook
│   ├── Secret: STRIPE_WEBHOOK_SECRET
│   ├── Recibe: Eventos LIVE de Stripe (dinero real)
│   └── Propósito: Producción
│
└── /api/webhook-dev
    ├── Secret: STRIPE_WEBHOOK_SECRET_DEV
    ├── Recibe: Eventos TEST de Stripe (dinero falso)
    └── Propósito: Testing sin afectar producción
```

---

## Referencias

- [Stripe Webhooks Documentation](https://stripe.com/docs/webhooks)
- [Testing Webhooks](https://stripe.com/docs/webhooks/test)
- Documentación del proyecto: `/home/mcerra/www/la-subscriptions/CRON_CONFIG_API_DOCS.md`
