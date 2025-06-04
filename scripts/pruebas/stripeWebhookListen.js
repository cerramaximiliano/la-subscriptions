#!/usr/bin/env node

// Cargar variables de entorno desde la raíz del proyecto
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { spawn } = require('child_process');
const readline = require('readline');

// Crear un objeto chalk compatible
const chalk = {
  level: 1,
  cyan: (text) => `\x1b[36m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  blue: (text) => `\x1b[34m${text}\x1b[0m`,
  gray: (text) => `\x1b[90m${text}\x1b[0m`,
  white: (text) => `\x1b[37m${text}\x1b[0m`
};

// Detectar capacidades del terminal
const isTTY = process.stdout.isTTY;
const isSSH = process.env.SSH_CLIENT || process.env.SSH_TTY;
const supportsColor = process.stdout.hasColors?.() || true;

// Parsear argumentos
const args = process.argv.slice(2);
const noColor = args.includes('--no-color') || args.includes('-nc') || !supportsColor;
const quietMode = args.includes('--quiet') || args.includes('-q');
const helpMode = args.includes('--help') || args.includes('-h');

// Deshabilitar colores si es necesario
if (noColor) {
  chalk.level = 0;
  // Redefinir funciones para que no añadan códigos de color
  Object.keys(chalk).forEach(key => {
    if (typeof chalk[key] === 'function') {
      chalk[key] = (text) => text;
    }
  });
}

// Mostrar ayuda
if (helpMode) {
  console.log('Uso: node stripeWebhookListen.js [flags]');
  console.log('\nFlags:');
  console.log('  --no-color, -nc    Deshabilitar colores');
  console.log('  --quiet, -q        Modo silencioso (menos output)');
  console.log('  --help, -h         Mostrar esta ayuda');
  process.exit(0);
}

// Configuración
const WEBHOOK_URL = process.env.WEBHOOK_URL_SUBSCRIPTION_API || 'http://localhost:5001/api/webhook';
const STRIPE_CLI_PATH = 'stripe'; // Asume que Stripe CLI está en PATH

// Eventos a escuchar
const EVENTS_TO_LISTEN = [
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
  'invoice.payment_action_required',
  'payment_intent.succeeded',
  'payment_intent.payment_failed'
];

if (!quietMode) {
  console.log(chalk.cyan('=== STRIPE WEBHOOK LISTENER ===\n'));
  console.log(chalk.yellow('Configuración:'));
  console.log(`URL del webhook: ${chalk.green(WEBHOOK_URL)}`);
  console.log(`Eventos a escuchar: ${chalk.green(EVENTS_TO_LISTEN.length)}`);
  if (isSSH) {
    console.log(`Ejecutando a través de SSH: ${chalk.gray('Sí')}`);
  }
  console.log('');
}

// Verificar si Stripe CLI está instalado
const checkStripe = spawn(STRIPE_CLI_PATH, ['--version']);

checkStripe.on('error', (err) => {
  console.error(chalk.red('❌ Error: Stripe CLI no está instalado o no está en PATH'));
  console.log(chalk.yellow('\nPara instalar Stripe CLI:'));
  console.log('1. Visita: https://stripe.com/docs/stripe-cli');
  console.log('2. O instala con: brew install stripe/stripe-cli/stripe (Mac)');
  console.log('3. O descarga desde: https://github.com/stripe/stripe-cli/releases\n');
  process.exit(1);
});

checkStripe.on('close', (code) => {
  if (code === 0) {
    if (!quietMode) {
      console.log(chalk.green('✓ Stripe CLI detectado\n'));
    }
    startListening();
  }
});

function startListening() {
  if (!quietMode) {
    console.log(chalk.yellow('Iniciando escucha de webhooks...\n'));
  }
  
  // Construir comando
  const args = [
    'listen',
    '--forward-to', WEBHOOK_URL,
    '--events', EVENTS_TO_LISTEN.join(',')
  ];
  
  // Forzar modo test para evitar problemas con claves restringidas
  if (!quietMode) {
    console.log(chalk.yellow('ℹ️  Forzando modo test para desarrollo local\n'));
  }
  
  // Agregar flag de prueba si está configurado
  if (process.env.STRIPE_TEST_MODE === 'true') {
    args.push('--skip-verify');
  }
  
  if (!quietMode) {
    console.log(chalk.gray(`Ejecutando: ${STRIPE_CLI_PATH} ${args.join(' ')}\n`));
  }
  
  // Iniciar proceso con variables de entorno que fuerzan el modo test
  const stripeProcess = spawn(STRIPE_CLI_PATH, args, {
    stdio: 'pipe',
    env: { 
      ...process.env,
      STRIPE_CLI_TELEMETRY_OPTOUT: '1', // Desactivar telemetría
      STRIPE_DEVICE_NAME: 'la-subscriptions-dev',
      STRIPE_CLI_MODE: 'test' // Forzar modo test
    }
  });
  
  // Crear interfaz readline para el output
  const rlOut = readline.createInterface({
    input: stripeProcess.stdout,
    terminal: false
  });
  
  const rlErr = readline.createInterface({
    input: stripeProcess.stderr,
    terminal: false
  });
  
  // Procesar salida línea por línea
  rlOut.on('line', (line) => {
    if (quietMode) {
      // En modo silencioso, solo mostrar eventos importantes
      if (line.includes('Ready!') || line.includes('-->') || line.includes('ERROR')) {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] ${line}`);
      }
    } else {
      // Detectar diferentes tipos de mensajes
      if (line.includes('-->')) {
        // Evento enviado
        const timestamp = new Date().toLocaleTimeString();
        console.log(chalk.blue(`[${timestamp}] `) + chalk.yellow('→ ') + line);
      } else if (line.includes('[200]') || line.includes('[OK]')) {
        // Respuesta exitosa
        console.log(chalk.green('   ✓ ' + line));
      } else if (line.includes('[404]') || line.includes('[500]') || line.includes('ERROR')) {
        // Error
        console.log(chalk.red('   ✗ ' + line));
      } else if (line.includes('customer.subscription') || line.includes('invoice.payment')) {
        // Destacar eventos importantes
        console.log(chalk.cyan('   📌 ' + line));
      } else {
        // Otros mensajes
        console.log(chalk.gray('   ' + line));
      }
    }
  });
  
  // Procesar stderr (Stripe CLI envía algunos mensajes normales aquí también)
  rlErr.on('line', (line) => {
    // Stripe CLI envía mensajes normales a stderr, no todos son errores
    if (line.includes('Ready!') || line.includes('Getting ready') || line.includes('Checking for')) {
      if (!quietMode) {
        console.log(chalk.green('✅ ' + line));
        if (line.includes('Ready!') && line.includes('whsec_')) {
          // Extraer el webhook secret si está presente
          const secretMatch = line.match(/whsec_\w+/);
          if (secretMatch) {
            console.log(chalk.cyan(`\n🔑 Webhook Secret: ${secretMatch[0]}`));
            console.log(chalk.yellow('💡 Guarda este secret en tu archivo .env como STRIPE_WEBHOOK_SECRET\n'));
          }
        }
      }
    } else if (line.includes('ERROR') || line.includes('error')) {
      console.error(chalk.red('❌ Error: ' + line));
    } else {
      // Otros mensajes de stderr
      if (!quietMode) {
        console.log(chalk.gray('   ' + line));
      }
    }
  });
  
  // Manejar cierre del proceso
  stripeProcess.on('close', (code) => {
    if (code !== 0) {
      console.log(chalk.red(`\n❌ Stripe CLI terminó con código: ${code}`));
    } else {
      console.log(chalk.yellow('\n👋 Stripe CLI cerrado'));
    }
  });
  
  // Manejar SIGINT (Ctrl+C)
  process.on('SIGINT', () => {
    console.log(chalk.yellow('\n\n🛑 Deteniendo Stripe CLI...'));
    stripeProcess.kill('SIGTERM');
    setTimeout(() => {
      process.exit(0);
    }, 1000);
  });
  
  // Instrucciones para el usuario
  if (!quietMode) {
    console.log(chalk.green('Instrucciones:'));
    console.log('• Los eventos de Stripe serán reenviados a:', chalk.cyan(WEBHOOK_URL));
    console.log('• Puedes generar eventos de prueba desde el dashboard de Stripe');
    console.log('• O usar el script testWebhookEvents.js en otra terminal');
    console.log('• Presiona Ctrl+C para detener\n');
    console.log(chalk.yellow('─'.repeat(60) + '\n'));
  }
}