# Guía de Pruebas en Producción

## Descripción General

Esta guía explica cómo realizar pruebas seguras de webhooks en el entorno de producción usando el endpoint de pruebas protegido por token, y cómo simular el comportamiento de producción en tu entorno local.

## Configuración

### 1. Generar un Token Seguro

Primero, genera un token seguro para autenticación:

```bash
# Generar un token aleatorio
openssl rand -hex 32
# o
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. Configurar Variables de Entorno

Agrega las siguientes variables a tu archivo `.env` en producción:

```env
# Token de autenticación para pruebas (generado en el paso anterior)
WEBHOOK_TEST_TOKEN=tu_token_seguro_aqui

# Asegúrate de tener configurado NODE_ENV
NODE_ENV=production

# URL del webhook en producción
WEBHOOK_URL_SUBSCRIPTION_API=https://tu-dominio.com/api/webhook
```

### 3. Verificar el Endpoint

Primero, verifica que el endpoint de pruebas esté funcionando:

```bash
curl -X GET https://tu-dominio.com/api/webhook/health
```

## Uso del Script de Pruebas

### Simular Producción Localmente

Para probar el comportamiento de producción en tu entorno local, usa el flag `--production`:

```bash
# Configurar token en tu .env local
WEBHOOK_TEST_TOKEN=tu_token_de_prueba_local

# Simular modo producción con el flag
node scripts/pruebas/testWebhookEvents.js 1 --production

# Simular secuencia de pagos fallidos
node scripts/pruebas/testPaymentFailures.js seq --production

# Combinar con modo silencioso
node scripts/pruebas/testWebhookEvents.js 1 --production --quiet
```

### Ejecutar Pruebas en Producción Real

Con las variables configuradas en el servidor de producción:

```bash
# El script detectará automáticamente NODE_ENV=production
NODE_ENV=production node scripts/pruebas/testWebhookEvents.js 1

# O forzar con el flag
node scripts/pruebas/testWebhookEvents.js 1 --production

# Enviar secuencia de pagos fallidos
NODE_ENV=production node scripts/pruebas/testPaymentFailures.js seq

# Modo silencioso
NODE_ENV=production node scripts/pruebas/testWebhookEvents.js 1 --quiet
```

### Verificación de Seguridad

El script mostrará cuando esté usando el endpoint seguro:

```
🎭 Modo producción simulado activado
🔐 Usando endpoint de pruebas seguro
📤 Enviando evento: invoice.payment_failed
URL: http://localhost:5001/api/webhook/test-secure
✅ Respuesta: 200 OK
```

### Diferencias entre Modos

| Característica | Desarrollo Normal | Simulación Local | Producción Real |
|----------------|------------------|------------------|-----------------|
| Endpoint | `/api/webhook` | `/api/webhook/test-secure` | `/api/webhook/test-secure` |
| Autenticación | Firma Stripe | Token de prueba | Token de producción |
| URL | localhost:5001 | localhost:5001 | tu-dominio.com |
| Flag requerido | Ninguno | `--production` | Ninguno (auto-detecta) |

## Pruebas Manuales con cURL

También puedes probar manualmente usando cURL:

```bash
# Prueba de pago fallido
curl -X POST https://tu-dominio.com/api/webhook/test-secure \
  -H "Content-Type: application/json" \
  -H "x-test-auth-token: tu_token_seguro_aqui" \
  -d '{
    "id": "evt_test_manual",
    "type": "invoice.payment_failed",
    "data": {
      "object": {
        "id": "in_test_123",
        "customer": "cus_test_123",
        "subscription": "sub_test_123",
        "amount_due": 2900,
        "attempt_count": 1
      }
    }
  }'
```

## Seguridad

### Mejores Prácticas

1. **Token Único**: Usa un token diferente para cada ambiente (desarrollo, staging, producción)
2. **Rotación**: Cambia el token periódicamente
3. **Acceso Limitado**: Solo comparte el token con personas autorizadas
4. **Logs**: Revisa los logs regularmente para detectar accesos no autorizados
5. **Desactivación**: Elimina `WEBHOOK_TEST_TOKEN` del `.env` cuando no necesites pruebas

### Monitoreo de Accesos

Los intentos no autorizados se registran en los logs:

```
⚠️ Intento de acceso no autorizado al endpoint de pruebas
```

## Troubleshooting

### Error: "No autorizado"

- Verifica que `WEBHOOK_TEST_TOKEN` esté configurado en el servidor
- Asegúrate de que el token en tu `.env` local coincida con el del servidor

### Error: "Endpoint de pruebas no configurado"

- El servidor no tiene configurado `WEBHOOK_TEST_TOKEN`
- Contacta al administrador del sistema

### Error: "Firma de webhook requerida en producción"

- Estás intentando usar el endpoint normal `/webhook` en lugar de `/webhook/test-secure`
- Asegúrate de tener `NODE_ENV=production` y `WEBHOOK_TEST_TOKEN` configurados

## Alternativas Recomendadas

Para pruebas en producción, también considera:

1. **Stripe Dashboard**: Envía eventos de prueba desde el panel de Stripe
2. **Stripe CLI**: Usa `stripe trigger` con tu cuenta de producción
3. **Webhook Relay**: Configura un endpoint temporal para pruebas

## Notas Importantes

- El endpoint de pruebas `/webhook/test-secure` NO valida firmas de Stripe
- Los eventos enviados a este endpoint se procesan como reales
- Usa con precaución en producción para evitar afectar datos reales
- Siempre prueba primero en desarrollo antes de usar en producción