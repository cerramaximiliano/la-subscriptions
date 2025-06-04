# Configuración de Whitelist para Emails de Prueba

## Descripción

Este sistema permite redirigir emails durante las pruebas para evitar enviar notificaciones a usuarios reales.

## Configuración

### 1. Variables de Entorno

En tu archivo `.env`, configura:

```env
# Lista de emails autorizados para recibir notificaciones de prueba
# Separados por comas, sin espacios extras
TEST_EMAIL_WHITELIST=cerramaximiliano@gmail.com,cerramaximiliano@protonmail.com
```

### 2. Comportamiento

Cuando se detecta un evento en modo test:

1. **Si el email destinatario está en la whitelist**: Se envía normalmente
2. **Si el email NO está en la whitelist**: 
   - Se redirige al primer email de la whitelist
   - Se registra en los logs el email original
   - El email incluye una notificación visible indicando el destinatario original

### 3. Identificación de Modo Test

El sistema detecta modo test cuando:
- El evento tiene `livemode: false` (eventos de Stripe)
- Se usa el endpoint `/api/webhook/test-secure`
- No hay firma de webhook válida (solo en desarrollo)

### 4. Logs Generados

Cuando se filtra un email, verás en los logs:

```
📧 EMAIL BLOQUEADO (Modo Test) - Email original: julieta.bombora@gmail.com
📋 Whitelist actual: cerramaximiliano@gmail.com, cerramaximiliano@protonmail.com
💡 Para recibir este email, agregue "julieta.bombora@gmail.com" a TEST_EMAIL_WHITELIST en .env
✉️  Email será enviado a: cerramaximiliano@gmail.com (en lugar de julieta.bombora@gmail.com)
```

### 5. Formato del Email Redirigido

Los emails redirigidos incluyen:

**En el asunto:**
```
[TEST] Asunto original (para: email.original@ejemplo.com)
```

**En el cuerpo:**
```
⚠️ MODO TEST: Este email estaba destinado a email.original@ejemplo.com
Fue redirigido a tu email porque está en la whitelist de pruebas.
```

## Ejemplos de Uso

### Con Stripe CLI
```bash
# Los eventos de test serán filtrados automáticamente
stripe trigger invoice.payment_failed
```

### Con el script de pruebas
```bash
# Usar el flag --production para activar el endpoint seguro
node scripts/pruebas/testWebhookEvents.js 1 --production
```

## Desactivar el Filtro

Para desactivar temporalmente el filtro:

1. **Opción 1**: Agregar todos los emails necesarios a la whitelist
2. **Opción 2**: Dejar `TEST_EMAIL_WHITELIST` vacío (no recomendado)

## Seguridad

- La whitelist solo aplica en modo test
- Los eventos de producción reales (`livemode: true`) no son afectados
- Siempre verifica los logs para confirmar a dónde se enviaron los emails