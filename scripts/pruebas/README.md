# 🧪 Scripts de Pruebas - Sistema de Webhooks

Esta carpeta contiene todos los scripts y documentación relacionados con las pruebas del sistema de webhooks y manejo de pagos.

## 📁 Estructura

```
scripts/pruebas/
├── README.md                      # Este archivo
├── testWebhookEvents.js          # Simulador principal de eventos webhook
├── testPaymentFailures.js        # Pruebas específicas de pagos fallidos
├── stripeWebhookListen.js        # Listener de webhooks usando Stripe CLI
├── stripeWebhookListenLocal.js   # Servidor local alternativo para webhooks
└── docs/                         # Documentación detallada
    ├── PRUEBAS_WEBHOOKS_GUIA.md
    ├── PRUEBAS_FASE1_IDEMPOTENCIA.md
    ├── FASE2_PAGOS_FALLIDOS_IMPLEMENTACION.md
    └── PLAN_IMPLEMENTACION_CASOS_CRITICOS.md
```

## 🚀 Uso Rápido

### 1. Simulador de Eventos Webhook
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

### 2. Pruebas de Pagos Fallidos
```bash
# Modo interactivo
node scripts/pruebas/testPaymentFailures.js

# Simular secuencia completa
node scripts/pruebas/testPaymentFailures.js seq

# Simular evento específico
node scripts/pruebas/testPaymentFailures.js 1  # Primer intento fallido
```

### 3. Listener de Webhooks (Stripe CLI)
```bash
# Escuchar webhooks reales de Stripe
node scripts/pruebas/stripeWebhookListen.js
```

### 4. Servidor Local de Webhooks
```bash
# Alternativa cuando hay problemas con Stripe CLI
node scripts/pruebas/stripeWebhookListenLocal.js

# En otra terminal, usar ngrok:
ngrok http 3001
```

## 📋 Prerrequisitos

1. **Variables de entorno** en `.env`:
   ```env
   # Base de datos (compartida con servidor principal)
   MONGODB_URI=mongodb://...
   
   # Stripe
   STRIPE_API_KEY_DEV=sk_test_...
   STRIPE_WEBHOOK_SECRET_DEV=whsec_...
   
   # URLs
   WEBHOOK_URL=http://localhost:5001/api/webhook
   FRONTEND_URL=http://localhost:3000
   
   # Emails
   SUPPORT_EMAIL=support@example.com
   ADMIN_EMAIL=tu-email@example.com  # ⚠️ IMPORTANTE: Email donde se recibirán las notificaciones de prueba
   ```

2. **Arquitectura del Sistema**:
   - Este es un microservicio especializado en pagos
   - Comparte base de datos con el servidor principal
   - Ver [ARQUITECTURA_MICROSERVICIO.md](../../ARQUITECTURA_MICROSERVICIO.md) para más detalles

2. **Servidor principal ejecutándose**:
   ```bash
   npm run dev
   # o
   pm2 start ecosystem.config.js
   ```

3. **Base de datos con suscripción de prueba**:
   ```bash
   node scripts/pruebas/testWebhookEvents.js create
   ```
   
   ⚠️ **Nota**: La suscripción de prueba se creará usando el email configurado en `ADMIN_EMAIL`.
   Todos los emails de notificación se enviarán a esta dirección.

## 📖 Documentación Detallada

Para información más detallada sobre cada fase de implementación y pruebas, consulta los documentos en la carpeta `docs/`:

- **[PRUEBAS_WEBHOOKS_GUIA.md](docs/PRUEBAS_WEBHOOKS_GUIA.md)**: Guía completa de pruebas
- **[PRUEBAS_FASE1_IDEMPOTENCIA.md](docs/PRUEBAS_FASE1_IDEMPOTENCIA.md)**: Pruebas de idempotencia
- **[FASE2_PAGOS_FALLIDOS_IMPLEMENTACION.md](docs/FASE2_PAGOS_FALLIDOS_IMPLEMENTACION.md)**: Sistema de pagos fallidos
- **[PLAN_IMPLEMENTACION_CASOS_CRITICOS.md](docs/PLAN_IMPLEMENTACION_CASOS_CRITICOS.md)**: Casos críticos y soluciones

## 🔧 Troubleshooting

### Error: "Cannot find module '../models/...'"
Los scripts ahora están en una subcarpeta. Asegúrate de ejecutarlos desde la raíz del proyecto:
```bash
cd /home/mcerra/www/la-subscriptions
node scripts/pruebas/testWebhookEvents.js
```

### Error: "No such subscription"
Primero crea la suscripción de prueba:
```bash
node scripts/pruebas/testWebhookEvents.js create
```

### Error con Stripe CLI
Usa el servidor local alternativo:
```bash
node scripts/pruebas/stripeWebhookListenLocal.js
```

## 🎯 Flujo de Pruebas Recomendado

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