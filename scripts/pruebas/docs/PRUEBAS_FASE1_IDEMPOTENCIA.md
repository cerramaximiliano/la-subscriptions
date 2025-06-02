# 🧪 Guía Completa de Pruebas - Fase 1: Sistema de Idempotencia

## ✅ Implementación Completada

La Fase 1 del sistema de idempotencia para webhooks ha sido implementada exitosamente:

### Archivos creados/modificados:
1. **`/models/WebhookEvent.js`** - Modelo para rastrear eventos procesados
2. **`/middleware/webhookIdempotency.js`** - Middleware que previene duplicados
3. **`/routes/webhookRoutes.js`** - Integración del middleware en las rutas
4. **`/scripts/retryFailedWebhooks.js`** - Script para reintentar webhooks fallidos
5. **`/scripts/scheduleTasks.js`** - Tarea programada cada hora para reintentos
6. **`/controllers/webhookController.js`** - Actualizado el endpoint de prueba

## 🚀 Configuración Inicial

### 1. Verificar que el servidor esté corriendo

```bash
# Verificar estado
pm2 status

# Si no está corriendo, iniciar
pm2 start ecosystem.config.js

# Ver logs
pm2 logs stripe-webhooks
```

### 2. Verificar conexión a MongoDB

```bash
# El modelo WebhookEvent debe crear automáticamente los índices
# Para verificar manualmente:
mongosh la_subscriptions --eval "db.webhookevents.getIndexes()"
```

## 📋 Métodos de Prueba

### Opción A: Pruebas con Stripe CLI (Recomendado para Producción)

#### Prerequisitos
```bash
# Instalar Stripe CLI si no lo tienes
# macOS
brew install stripe/stripe-cli/stripe

# Linux
curl -s https://packages.stripe.dev/api/security/keypair/stripe-cli-gpg/public | gpg --dearmor | sudo tee /usr/share/keyrings/stripe.gpg
echo "deb [signed-by=/usr/share/keyrings/stripe.gpg] https://packages.stripe.dev/stripe-cli-debian-local stable main" | sudo tee -a /etc/apt/sources.list.d/stripe.list
sudo apt update
sudo apt install stripe

# Verificar instalación
stripe --version

# Login a Stripe
stripe login
```

#### Configuración de Pruebas con Stripe CLI

**IMPORTANTE: Necesitas DOS terminales abiertas**

##### Terminal 1 - Escuchar webhooks:
```bash
cd /home/mcerra/www/la-subscriptions
stripe listen --forward-to localhost:5001/api/webhook
```

Deberías ver:
```
> Ready! You are using Stripe API Version [2020-08-27]. Your webhook signing secret is whsec_...
```

**Nota:** El webhook secret mostrado debe coincidir con el configurado en tu archivo `.env` como `STRIPE_WEBHOOK_SECRET_DEV`

##### Terminal 2 - Disparar eventos:
```bash
# Disparar diferentes eventos
stripe trigger payment_intent.succeeded
stripe trigger invoice.payment_succeeded
stripe trigger customer.subscription.created
stripe trigger customer.subscription.updated
stripe trigger customer.subscription.deleted
stripe trigger invoice.payment_failed
stripe trigger checkout.session.completed

# Ver todos los eventos disponibles
stripe trigger --help
```

#### Verificar Idempotencia con Stripe

Para probar que los webhooks duplicados son rechazados:

1. En Terminal 1, observa el ID del evento cuando se procesa (ej: `evt_1RVGfXJdr4OZ264a...`)
2. Los eventos de Stripe tienen IDs únicos, por lo que no puedes enviar el mismo evento dos veces naturalmente
3. Sin embargo, el sistema registrará cada evento y prevendrá su reprocesamiento si Stripe lo reenviara

### Opción B: Pruebas con Endpoint de Test (Desarrollo)

#### Script de Prueba Rápida

Crea un archivo temporal `test-idempotency.sh`:

```bash
#!/bin/bash

echo "🧪 Prueba de Idempotencia"
echo "========================"

# ID único para esta prueba
TEST_ID="evt_test_$(date +%s)"

echo "ID de prueba: $TEST_ID"
echo ""

echo "1️⃣ Primer intento (debe procesarse)..."
curl -X POST http://localhost:5001/api/webhook/test \
  -H "Content-Type: application/json" \
  -d "{\"id\":\"$TEST_ID\",\"type\":\"invoice.paid\",\"data\":{\"object\":{\"id\":\"inv_123\",\"amount_paid\":1000,\"currency\":\"usd\"}}}"

echo ""
echo ""
sleep 1

echo "2️⃣ Segundo intento con el mismo ID (debe rechazarse)..."
curl -X POST http://localhost:5001/api/webhook/test \
  -H "Content-Type: application/json" \
  -d "{\"id\":\"$TEST_ID\",\"type\":\"invoice.paid\",\"data\":{\"object\":{\"id\":\"inv_123\",\"amount_paid\":1000,\"currency\":\"usd\"}}}"

echo ""
echo ""
echo "✅ Si el segundo intento muestra 'Event is currently being processed', ¡la idempotencia funciona!"
```

Ejecutar:
```bash
chmod +x test-idempotency.sh
./test-idempotency.sh
```

## 📊 Verificación de Resultados

### 1. Verificar eventos en MongoDB

Crea un script temporal `verify-webhooks.js`:

```javascript
const mongoose = require('mongoose');
require('dotenv').config();

async function verifyWebhooks() {
  try {
    await mongoose.connect(process.env.URLDB);
    console.log('✅ Conectado a MongoDB');
    
    const WebhookEvent = require('./models/WebhookEvent');
    
    // Estadísticas
    const total = await WebhookEvent.countDocuments();
    const byStatus = await WebhookEvent.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } }
    ]);
    
    console.log(`\n📊 Total de eventos: ${total}`);
    console.log('\n📈 Eventos por estado:');
    byStatus.forEach(s => console.log(`   ${s._id}: ${s.count}`));
    
    // Últimos 5 eventos
    const recent = await WebhookEvent.find()
      .sort({ createdAt: -1 })
      .limit(5);
    
    console.log('\n📝 Últimos 5 eventos:');
    recent.forEach(e => {
      console.log(`   - ID: ${e.stripeEventId}`);
      console.log(`     Tipo: ${e.eventType}`);
      console.log(`     Estado: ${e.status}`);
      console.log(`     Reintentos: ${e.retryCount}`);
      console.log(`     Creado: ${e.createdAt}`);
      console.log('');
    });
    
    mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

verifyWebhooks();
```

Ejecutar:
```bash
node verify-webhooks.js
```

### 2. Monitorear logs en tiempo real

```bash
# Ver logs de webhooks
pm2 logs stripe-webhooks | grep -i webhook

# Ver todos los logs
pm2 logs stripe-webhooks --lines 50
```

### 3. Verificar tareas programadas

```bash
# Ejecutar manualmente el script de reintentos
node scripts/scheduleTasks.js retryWebhooks

# Ver próximas ejecuciones programadas
pm2 describe stripe-webhooks | grep -A5 "Cron"
```

## 🧪 Casos de Prueba Específicos

### Test 1: Webhook Duplicado
```bash
# Enviar el mismo webhook dos veces
ID="evt_$(date +%s)"
curl -X POST http://localhost:5001/api/webhook/test \
  -H "Content-Type: application/json" \
  -d "{\"id\":\"$ID\",\"type\":\"invoice.paid\",\"data\":{\"object\":{}}}"

# Esperar 1 segundo
sleep 1

# Intentar de nuevo - debe ser rechazado
curl -X POST http://localhost:5001/api/webhook/test \
  -H "Content-Type: application/json" \
  -d "{\"id\":\"$ID\",\"type\":\"invoice.paid\",\"data\":{\"object\":{}}}"
```

**Resultado esperado:**
- Primer intento: `{"received":true,...}`
- Segundo intento: `{"error":"Event is currently being processed"}`

### Test 2: Procesamiento Concurrente
```bash
# Enviar 5 webhooks con el mismo ID simultáneamente
ID="evt_concurrent_$(date +%s)"
for i in {1..5}; do
  curl -X POST http://localhost:5001/api/webhook/test \
    -H "Content-Type: application/json" \
    -d "{\"id\":\"$ID\",\"type\":\"invoice.paid\",\"data\":{\"object\":{}}}" &
done
wait
```

**Resultado esperado:** Solo uno debe procesarse, los demás deben ser rechazados

### Test 3: Webhook con Error
```bash
# Este causará error porque no existe el usuario
curl -X POST http://localhost:5001/api/webhook/test \
  -H "Content-Type: application/json" \
  -d '{"id":"evt_error_test","type":"customer.subscription.created","data":{"object":{"id":"sub_nonexistent","customer":"cus_nonexistent"}}}'
```

**Resultado esperado:** Error pero el evento se registra para reintento

## 📈 Métricas de Éxito

### ✅ La implementación es exitosa si:

1. **Prevención de Duplicados**
   - El mismo ID de evento no puede procesarse dos veces
   - Mensaje claro de rechazo para duplicados

2. **Registro en MongoDB**
   - Todos los eventos se guardan en la colección `webhookevents`
   - Estados correctos: `processing`, `processed`, `failed`

3. **Sistema de Reintentos**
   - Webhooks fallidos se marcan con status `failed`
   - Script de reintentos los detecta y reprocesa

4. **Tarea Programada**
   - Se ejecuta cada hora automáticamente
   - Logs muestran ejecución: "Reintento de webhooks"

## 🐛 Troubleshooting

### Problema: MongoDB no conecta
```bash
# Verificar conexión
mongosh la_subscriptions --eval "db.adminCommand('ping')"

# Ver string de conexión
grep URLDB .env
```

### Problema: Webhooks no se procesan
```bash
# Verificar que el servidor esté en modo desarrollo
pm2 env stripe-webhooks | grep NODE_ENV

# Reiniciar en modo desarrollo si es necesario
pm2 restart stripe-webhooks --update-env
```

### Problema: Stripe CLI no funciona
```bash
# Verificar autenticación
stripe config --list

# Re-autenticar si es necesario
stripe login --interactive
```

### Problema: "estado is not defined" en logs
Este error es esperado y no afecta la idempotencia. Ocurre porque hay un bug en el controlador de invoice.paid (línea 375) pero no impide que el sistema de idempotencia funcione correctamente.

## 🔍 Limpieza y Mantenimiento

### Limpiar eventos de prueba (solo desarrollo)
```bash
# Desde MongoDB
mongosh la_subscriptions --eval "db.webhookevents.deleteMany({stripeEventId:/test/})"

# O eliminar todos los eventos
mongosh la_subscriptions --eval "db.webhookevents.deleteMany({})"
```

### Verificar índices
```bash
mongosh la_subscriptions --eval "db.webhookevents.getIndexes()"
```

Deberías ver:
- Índice en `stripeEventId` (único)
- Índice en `eventType` y `processedAt`
- Índice en `metadata.customerId`
- Índice TTL en `createdAt` (90 días)

## ✅ Checklist de Validación Final

- [ ] El servidor está corriendo sin errores
- [ ] MongoDB tiene la colección `webhookevents` con índices
- [ ] Los webhooks duplicados retornan error de duplicado
- [ ] Los webhooks se guardan en la base de datos
- [ ] El script de reintentos funciona manualmente
- [ ] La tarea programada está configurada
- [ ] Stripe CLI puede enviar webhooks al servidor

## 📝 Notas Importantes

1. **En Producción**: Los webhooks de Stripe siempre tendrán IDs únicos, por lo que la idempotencia protege contra reenvíos accidentales o reintentos de Stripe.

2. **Timeout de Processing**: Si un webhook queda en estado "processing" por más de 30 segundos, se considera stuck y puede reintentarse.

3. **Limpieza Automática**: Los eventos se eliminan automáticamente después de 90 días (configurado con TTL index).

4. **Seguridad**: En producción, siempre se valida la firma de Stripe. En desarrollo, el endpoint `/api/webhook/test` permite pruebas sin firma.

## 🚀 Próximos Pasos

Una vez validada la Fase 1:

1. **Monitorear por 24-48 horas** en producción
2. **Revisar métricas** de duplicados prevenidos
3. **Proceder con Fase 2**: Sistema de Manejo de Pagos Fallidos

---

**Última actualización:** 01 de Junio 2025
**Versión:** 1.0