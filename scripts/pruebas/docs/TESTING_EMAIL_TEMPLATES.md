# 📧 Testing de Templates de Email

Esta guía documenta cómo usar las nuevas rutas de testing para verificar y enviar templates de email.

## 🚀 Rutas Disponibles

### 1. Obtener Templates

```bash
# Listar todos los templates (sin HTML)
GET /api/webhook/test/templates

# Listar todos los templates con HTML incluido
GET /api/webhook/test/templates?includeHtml=true

# Obtener templates por categoría
GET /api/webhook/test/templates?category=subscription
GET /api/webhook/test/templates?category=payment&includeHtml=true

# Obtener un template específico (siempre incluye HTML)
GET /api/webhook/test/templates?templateName=paymentFailedFirst
```

**Respuesta ejemplo (template específico):**
```json
{
  "templateName": "paymentFailedFirst",
  "category": "payment",
  "description": "Primer intento de pago fallido",
  "subject": "⚠️ Problema con tu pago - {{planName}}",
  "html": "<!DOCTYPE html><html>...",
  "exampleData": {
    "userName": "Miguel Ruiz",
    "userEmail": "miguel@example.com",
    "planName": "Standard",
    "amount": 29,
    "currency": "USD",
    "nextRetryDate": "2024-01-16T10:30:00.000Z",
    "failureReason": "Tarjeta rechazada por fondos insuficientes",
    "updatePaymentUrl": "http://localhost:3000/update-payment-demo"
  }
}
```

### 2. Enviar un Template de Prueba

```bash
POST /api/webhook/test/templates/send
Content-Type: application/json

{
  "userEmail": "usuario@example.com",
  "templateName": "paymentFailedFirst"
}
```

**Con datos personalizados:**
```json
{
  "userId": "507f1f77bcf86cd799439011",
  "templateName": "gracePeriodReminder",
  "customData": {
    "daysRemaining": 1,
    "currentFolders": 100
  }
}
```

### 3. Enviar Todos los Templates

```bash
POST /api/webhook/test/templates/send-all
Content-Type: application/json

{
  "userEmail": "test@example.com",
  "category": "payment",    // opcional: filtrar por categoría
  "delay": 3000            // opcional: ms entre emails (default: 2000)
}
```

## 📋 Templates Disponibles

### Templates de Suscripción
- `subscriptionCreated` - Bienvenida a nueva suscripción
- `subscriptionCanceled` - Suscripción cancelada (con período de gracia)
- `immediatelyCanceled` - Suscripción cancelada inmediatamente
- `scheduledCancellation` - Cancelación programada
- `planDowngraded` - Downgrade de plan
- `planUpgraded` - Upgrade de plan
- `gracePeriodReminder` - Recordatorio de período de gracia
- `gracePeriodExpired` - Período de gracia expirado

### Templates de Pago
- `paymentFailedFirst` - Primer intento de pago fallido
- `paymentFailedSecond` - Segundo intento de pago fallido
- `paymentFailedFinal` - Último aviso - Suspensión
- `paymentFailedSuspension` - Período de gracia por pagos
- `paymentRecovered` - Pago recuperado exitosamente

## 🔧 Ejemplos con cURL

### Enviar template específico
```bash
curl -X POST http://localhost:5001/api/webhook/test/templates/send \
  -H "Content-Type: application/json" \
  -d '{
    "userEmail": "cerramaximiliano@gmail.com",
    "templateName": "paymentFailedSuspension"
  }'
```

### Enviar todos los templates de pago
```bash
curl -X POST http://localhost:5001/api/webhook/test/templates/send-all \
  -H "Content-Type: application/json" \
  -d '{
    "userEmail": "cerramaximiliano@gmail.com",
    "category": "payment",
    "delay": 5000
  }'
```

### Obtener HTML de un template
```bash
curl http://localhost:5001/api/webhook/test/templates?templateName=gracePeriodExpired
```

## ⚠️ Notas Importantes

1. **Whitelist de Email**: En modo test, solo se envían emails a las direcciones en `TEST_EMAIL_WHITELIST`:
   - cerramaximiliano@gmail.com
   - cerramaximiliano@protonmail.com

2. **URLs de Pago**: Si el usuario tiene `stripeCustomerId`, se generará una URL real del Customer Portal de Stripe. Si no, se usará una URL demo.

3. **Datos de Ejemplo**: Cada template tiene datos de ejemplo predefinidos que se pueden sobrescribir con `customData`.

4. **Modo Test**: Todos los emails enviados a través de estas rutas se marcan automáticamente como modo test y aplican el filtro de whitelist.

## 🧪 Script de Prueba Completa

```bash
#!/bin/bash
# test-all-templates.sh

EMAIL="cerramaximiliano@gmail.com"
BASE_URL="http://localhost:5001"

echo "🧪 Probando todos los templates de email..."

# 1. Listar templates disponibles
echo -e "\n📋 Templates disponibles:"
curl -s "$BASE_URL/api/webhook/test/templates" | jq .

# 2. Enviar template de prueba individual
echo -e "\n📧 Enviando template de prueba (paymentFailedFirst):"
curl -X POST "$BASE_URL/api/webhook/test/templates/send" \
  -H "Content-Type: application/json" \
  -d "{\"userEmail\": \"$EMAIL\", \"templateName\": \"paymentFailedFirst\"}" | jq .

# 3. Esperar un momento
sleep 3

# 4. Enviar todos los templates
echo -e "\n🚀 Enviando todos los templates:"
curl -X POST "$BASE_URL/api/webhook/test/templates/send-all" \
  -H "Content-Type: application/json" \
  -d "{\"userEmail\": \"$EMAIL\", \"delay\": 3000}" | jq .

echo -e "\n✅ Prueba completada!"
```

## 🔍 Obtener HTML de Templates

Para obtener el HTML renderizado de cualquier template:

```bash
# Un template específico
curl http://localhost:5001/api/webhook/test/templates?templateName=gracePeriodExpired | jq .

# Todos los templates con HTML
curl http://localhost:5001/api/webhook/test/templates?includeHtml=true | jq .

# Por categoría con HTML
curl "http://localhost:5001/api/webhook/test/templates?category=payment&includeHtml=true" | jq .
```

## 🐛 Troubleshooting

### Error: "Usuario no encontrado"
Asegúrate de que el email o userId existe en la base de datos.

### Los emails no llegan
1. Verifica que el email esté en la whitelist (TEST_EMAIL_WHITELIST)
2. Revisa los logs del servicio
3. Verifica la configuración de AWS SES

### Error al generar URL de Stripe
Esto es normal si el usuario no tiene `stripeCustomerId`. Se usará una URL demo en su lugar.