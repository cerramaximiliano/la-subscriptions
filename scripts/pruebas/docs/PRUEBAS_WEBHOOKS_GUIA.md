# Guía de Pruebas de Webhooks

## Descripción General

Esta guía explica cómo utilizar los tres scripts de prueba para simular y monitorear webhooks de Stripe en el entorno de desarrollo.

## Scripts Disponibles

### 1. `stripeWebhookListen.js` - Conexión con Stripe CLI
**Terminal 1** - Escucha eventos reales de Stripe

```bash
# Modo interactivo (terminal local)
node scripts/stripeWebhookListen.js

# Modo SSH con menos output
node scripts/stripeWebhookListen.js --quiet

# Sin colores (para SSH básico)
node scripts/stripeWebhookListen.js --no-color

# Ver ayuda
node scripts/stripeWebhookListen.js --help
```

**Funciones:**
- Conecta con Stripe CLI para escuchar eventos reales
- Reenvía eventos al endpoint local configurado
- Muestra logs con colores para identificar tipos de eventos
- Valida que Stripe CLI esté instalado
- **Modo SSH**: Detecta automáticamente SSH y ajusta el output

**Requisitos:**
- Stripe CLI instalado ([Instrucciones](https://stripe.com/docs/stripe-cli))
- Variables de entorno configuradas

### 2. `monitorWebhooks.js` - Monitor de Actividad
**Terminal 2** - Visualiza estadísticas en tiempo real

```bash
# Modo interactivo con tablas (terminal local)
node scripts/monitorWebhooks.js

# Modo simple para SSH (sin tablas ni clear)
node scripts/monitorWebhooks.js --simple --no-clear

# Modo JSON para procesamiento automático
node scripts/monitorWebhooks.js --json

# Modo continuo (solo logs de cambios)
node scripts/monitorWebhooks.js --continuous

# Ver ayuda
node scripts/monitorWebhooks.js --help
```

**Funciones:**
- Muestra estadísticas en tiempo real de webhooks procesados
- Tabla con los últimos 10 eventos
- Contadores por tipo de evento
- Tasa de éxito/fallo
- Se actualiza automáticamente cada 5 segundos

**Modos SSH:**
- `--simple`: Sin tablas, output simple
- `--no-clear`: No limpia la pantalla
- `--json`: Output en JSON para scripts
- `--continuous`: Solo muestra cambios nuevos

### 3. `testWebhookEvents.js` - Simulador de Eventos
**Terminal 3** - Envía eventos de prueba

```bash
# Modo interactivo (terminal local)
node scripts/testWebhookEvents.js

# Modo CLI para SSH - enviar evento específico
node scripts/testWebhookEvents.js 1  # Envía "subscription.created"
node scripts/testWebhookEvents.js 2  # Envía "subscription.updated"

# Enviar todos los eventos
node scripts/testWebhookEvents.js all

# Listar eventos disponibles
node scripts/testWebhookEvents.js list

# Modo silencioso
node scripts/testWebhookEvents.js 1 --quiet

# Ver ayuda
node scripts/testWebhookEvents.js --help
```

**Funciones:**
- Menú interactivo para enviar eventos de prueba (modo local)
- Modo CLI para SSH con argumentos directos
- Simula eventos comunes de Stripe:
  1. Nueva suscripción creada
  2. Suscripción actualizada
  3. Suscripción cancelada
  4. Pago exitoso
  5. Pago fallido
- Opción para enviar todos los eventos en secuencia
- Genera firmas válidas de Stripe

## Configuración Requerida

### Variables de Entorno
Asegúrate de tener configuradas las siguientes variables en tu archivo `.env`:

```env
# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# URLs
WEBHOOK_URL_SUBSCRIPTION_API=http://localhost:5001/api/webhook  # URL del webhook (producción: usar URL real)
FRONTEND_URL=http://localhost:3000

# MongoDB
MONGO_URI=mongodb://localhost:27017/tu-base-de-datos

# Email del administrador (IMPORTANTE para pruebas)
ADMIN_EMAIL=tu-email@example.com  # Aquí recibirás todos los emails de prueba

# Opcional
STRIPE_TEST_MODE=true
```

### Dependencias Requeridas
Los scripts utilizan las siguientes dependencias:

**Ya instaladas en el proyecto:**
- `chalk` - Para colores en la terminal
- `mongoose` - Para conexión con MongoDB
- `stripe` - Para interactuar con la API de Stripe
- `dotenv` - Para variables de entorno
- `axios` - Para hacer peticiones HTTP (instalado con otras dependencias)
npm install chalk mongoose stripe dotenv axios

**Necesitas instalar adicionalmente:**
```bash
npm install cli-table3 clear figlet
```

**Dependencias opcionales (mejoran la experiencia):**
```bash
# Para el script de monitoreo
npm install cli-table3  # Tablas en terminal
npm install clear       # Limpiar pantalla
npm install figlet      # Texto ASCII art

# Si axios no está instalado
npm install axios
```

**Instalación completa de todas las dependencias:**
```bash
# Instalar todas las dependencias necesarias de una vez
npm install cli-table3 clear figlet axios
```

## Flujo de Pruebas Recomendado

### Paso 1: Preparar el Entorno
1. Asegúrate de que MongoDB esté ejecutándose
2. Inicia el servidor principal: `npm run dev`
3. Verifica que las variables de entorno estén configuradas

### Paso 2: Iniciar los Scripts

#### Opción A: Terminales Locales (4 terminales)

**Terminal 1 - Servidor Principal:**
```bash
npm run dev
```

**Terminal 2 - Stripe CLI Listener:**
```bash
node scripts/stripeWebhookListen.js
```

**Terminal 3 - Monitor:**
```bash
node scripts/monitorWebhooks.js
```

**Terminal 4 - Simulador:**
```bash
node scripts/testWebhookEvents.js
```

#### Opción B: A través de SSH (3 sesiones SSH)

**SSH 1 - Servidor Principal:**
```bash
npm run dev
```

**SSH 2 - Stripe CLI Listener (modo silencioso):**
```bash
node scripts/stripeWebhookListen.js --quiet
```

**SSH 3 - Monitor (modo simple):**
```bash
node scripts/monitorWebhooks.js --simple --no-clear
```

**SSH 4 - Enviar eventos (desde cualquier lugar):**
```bash
# Enviar un evento específico
node scripts/testWebhookEvents.js 1 --quiet

# Enviar todos los eventos
node scripts/testWebhookEvents.js all --quiet
```

### Paso 3: Ejecutar Pruebas

1. **Prueba Individual:**
   - En el simulador, selecciona un evento específico (1-5)
   - Observa en el monitor cómo se actualiza la estadística
   - Verifica en los logs del servidor el procesamiento

2. **Prueba en Lote:**
   - En el simulador, selecciona opción 0 para enviar todos los eventos
   - Observa el flujo completo en el monitor

3. **Prueba de Idempotencia:**
   - Envía el mismo evento múltiples veces
   - Verifica que no se procese duplicado

4. **Prueba de Fallos:**
   - Detén el servidor principal
   - Envía eventos desde el simulador
   - Observa cómo se marcan como fallidos en el monitor
   - Reinicia el servidor y verifica reintentos

## Casos de Prueba Específicos

### 1. Crear Nueva Suscripción
- Enviar evento `customer.subscription.created`
- Verificar que se crea en la base de datos
- Verificar que se actualiza el usuario

### 2. Actualizar Suscripción
- Enviar evento `customer.subscription.updated`
- Verificar cambios en el plan
- Verificar período de gracia si aplica

### 3. Cancelar Suscripción
- Enviar evento `customer.subscription.deleted`
- Verificar estado de cancelación
- Verificar período de gracia

### 4. Pagos
- Enviar evento `invoice.payment_succeeded`
- Enviar evento `invoice.payment_failed`
- Verificar actualizaciones de estado

## Solución de Problemas

### Error: "Stripe CLI no está instalado"
```bash
# Mac
brew install stripe/stripe-cli/stripe

# Linux/Windows
# Descargar desde: https://github.com/stripe/stripe-cli/releases
```

### Error: "Cannot connect to MongoDB"
```bash
# Verificar que MongoDB esté corriendo
sudo systemctl status mongod

# O iniciar MongoDB
sudo systemctl start mongod
```

### Error: "Invalid signature"
- Verifica que `STRIPE_WEBHOOK_SECRET` esté configurado correctamente
- El secret debe coincidir con el configurado en Stripe Dashboard

### Los eventos no aparecen en el monitor
- Verifica que el servidor principal esté ejecutándose
- Verifica la URL del webhook en las variables de entorno
- Revisa los logs del servidor para errores

## Uso a través de SSH

### Ejemplos de comandos SSH

```bash
# Ejecutar monitor en modo JSON y guardar resultados
ssh usuario@servidor "cd /path/to/project && node scripts/monitorWebhooks.js --json" > stats.json

# Ver logs continuos del monitor
ssh usuario@servidor "cd /path/to/project && node scripts/monitorWebhooks.js --continuous"

# Enviar un evento específico
ssh usuario@servidor "cd /path/to/project && node scripts/testWebhookEvents.js 1 --quiet"

# Ejecutar Stripe CLI listener sin colores
ssh usuario@servidor "cd /path/to/project && node scripts/stripeWebhookListen.js --no-color"
```

### Scripts automatizados

Puedes crear scripts bash para automatizar las pruebas:

```bash
#!/bin/bash
# test-webhooks.sh

# Enviar todos los eventos
ssh usuario@servidor "cd /path/to/project && node scripts/testWebhookEvents.js all --quiet"

# Esperar 5 segundos
sleep 5

# Obtener estadísticas
ssh usuario@servidor "cd /path/to/project && node scripts/monitorWebhooks.js --json" | jq .
```

## Notas Adicionales

- Los eventos de prueba tienen IDs únicos basados en timestamp para evitar duplicados
- El monitor se actualiza cada 5 segundos automáticamente
- Puedes modificar los eventos de prueba en `testWebhookEvents.js`
- Para pruebas de producción, usa eventos reales desde Stripe Dashboard
- Los scripts detectan automáticamente si están corriendo en SSH y ajustan su comportamiento