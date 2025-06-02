#!/usr/bin/env node

// Cargar variables de entorno
require('dotenv').config();

const axios = require('axios');
const readline = require('readline');
const crypto = require('crypto');

// Detectar capacidades del terminal
const isTTY = process.stdout.isTTY;
const isSSH = process.env.SSH_CLIENT || process.env.SSH_TTY;

// Parsear argumentos de línea de comandos
const args = process.argv.slice(2);
const cliMode = args.length > 0 || !isTTY;
const eventToSend = args[0];
const quietMode = args.includes('--quiet') || args.includes('-q');

// Configuración
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'http://localhost:5001/api/webhook';
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET_DEV || process.env.STRIPE_WEBHOOK_SECRET;

// Crear readline solo si estamos en modo interactivo
let rl;
if (!cliMode) {
  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

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

// Generar un ID de invoice único para todos los intentos de la misma secuencia
const invoiceId = 'in_test_' + Date.now();

// Eventos de prueba para pagos fallidos
const testEvents = {
  1: {
    name: 'invoice.payment_failed - Primer intento',
    description: 'Simula el primer fallo de pago',
    data: {
      id: 'evt_test_' + Date.now() + '_payment_failed_1',
      type: 'invoice.payment_failed',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: invoiceId,
          object: 'invoice',
          customer: 'cus_test_123',
          subscription: 'sub_test_existing_1',
          amount_due: 2900,
          currency: 'usd',
          attempt_count: 1,
          next_payment_attempt: Math.floor(Date.now() / 1000) + 86400, // 1 día después
          last_payment_error: {
            code: 'card_declined',
            message: 'Your card was declined.',
            type: 'card_error'
          }
        }
      }
    }
  },
  2: {
    name: 'invoice.payment_failed - Segundo intento',
    description: 'Simula el segundo fallo de pago',
    data: {
      id: 'evt_test_' + Date.now() + '_payment_failed_2',
      type: 'invoice.payment_failed',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: invoiceId,
          object: 'invoice',
          customer: 'cus_test_123',
          subscription: 'sub_test_existing_1',
          amount_due: 2900,
          currency: 'usd',
          attempt_count: 2,
          next_payment_attempt: Math.floor(Date.now() / 1000) + 259200, // 3 días después
          last_payment_error: {
            code: 'insufficient_funds',
            message: 'Your card has insufficient funds.',
            type: 'card_error'
          }
        }
      }
    }
  },
  3: {
    name: 'invoice.payment_failed - Tercer intento',
    description: 'Simula el tercer fallo (suspensión)',
    data: {
      id: 'evt_test_' + Date.now() + '_payment_failed_3',
      type: 'invoice.payment_failed',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: invoiceId,
          object: 'invoice',
          customer: 'cus_test_123',
          subscription: 'sub_test_existing_1',
          amount_due: 2900,
          currency: 'usd',
          attempt_count: 3,
          next_payment_attempt: Math.floor(Date.now() / 1000) + 432000, // 5 días después
          last_payment_error: {
            code: 'card_declined',
            message: 'Your card was declined.',
            type: 'card_error'
          }
        }
      }
    }
  },
  4: {
    name: 'invoice.payment_failed - Cuarto intento',
    description: 'Simula el cuarto fallo (período de gracia)',
    data: {
      id: 'evt_test_' + Date.now() + '_payment_failed_4',
      type: 'invoice.payment_failed',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: invoiceId,
          object: 'invoice',
          customer: 'cus_test_123',
          subscription: 'sub_test_existing_1',
          amount_due: 2900,
          currency: 'usd',
          attempt_count: 4,
          next_payment_attempt: null, // No más intentos
          last_payment_error: {
            code: 'generic_decline',
            message: 'Your card was declined for an unknown reason.',
            type: 'card_error'
          }
        }
      }
    }
  },
  5: {
    name: 'invoice.payment_succeeded - Pago recuperado',
    description: 'Simula un pago exitoso después de fallos',
    data: {
      id: 'evt_test_' + Date.now() + '_payment_recovered',
      type: 'invoice.payment_succeeded',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: invoiceId,
          object: 'invoice',
          customer: 'cus_test_123',
          subscription: 'sub_test_existing_1',
          amount_paid: 2900,
          currency: 'usd',
          payment_intent: 'pi_test_' + Date.now(),
          status: 'paid',
          paid: true
        }
      }
    }
  },
  6: {
    name: 'invoice.payment_failed - Error exótico',
    description: 'Simula un error de pago poco común',
    data: {
      id: 'evt_test_' + Date.now() + '_payment_failed_exotic',
      type: 'invoice.payment_failed',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: invoiceId,
          object: 'invoice',
          customer: 'cus_test_123',
          subscription: 'sub_test_existing_1',
          amount_due: 2900,
          currency: 'usd',
          attempt_count: 1,
          next_payment_attempt: Math.floor(Date.now() / 1000) + 86400,
          last_payment_error: {
            code: 'processing_error',
            message: 'An error occurred while processing your card. Try again later.',
            type: 'api_error'
          }
        }
      }
    }
  }
};

// Función para generar firma de Stripe
function generateStripeSignature(payload, secret) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${payload}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');
  
  return `t=${timestamp},v1=${signature}`;
}

// Función para enviar evento
async function sendWebhookEvent(eventData) {
  try {
    const payload = JSON.stringify(eventData);
    const signature = generateStripeSignature(payload, WEBHOOK_SECRET);
    
    if (!quietMode) {
      console.log(`\n${chalk.blue('📤')} Enviando evento: ${chalk.yellow(eventData.type)}`);
      console.log(`${chalk.gray('ID:')} ${eventData.id}`);
      if (eventData.data.object.attempt_count) {
        console.log(`${chalk.gray('Intento #')}${eventData.data.object.attempt_count}`);
      }
    }
    
    const response = await axios.post(WEBHOOK_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': signature
      }
    });
    
    if (!quietMode) {
      console.log(`${chalk.green('✅')} Respuesta: ${response.status} ${response.statusText}`);
      if (response.data) {
        console.log(`${chalk.gray('Datos:')}`, response.data);
      }
    } else {
      console.log(`OK: ${eventData.type}`);
    }
    
    return { success: true, status: response.status };
    
  } catch (error) {
    if (!quietMode) {
      console.error(`${chalk.red('❌')} Error al enviar evento:`, error.message);
      if (error.response) {
        console.error(`${chalk.red('Respuesta del servidor:')}`, error.response.data);
      }
    } else {
      console.error(`ERROR: ${eventData.type} - ${error.message}`);
    }
    return { success: false, error: error.message };
  }
}

// Función para simular una secuencia de pagos fallidos
async function simulatePaymentFailureSequence() {
  console.log(`\n${chalk.cyan('🔄 Simulando secuencia completa de pagos fallidos...')}\n`);
  
  const subscriptionId = 'sub_test_sequence_' + Date.now();
  
  // Reemplazar el ID de suscripción en todos los eventos
  for (let i = 1; i <= 4; i++) {
    testEvents[i].data.data.object.subscription = subscriptionId;
  }
  
  // Enviar eventos en secuencia
  for (let i = 1; i <= 4; i++) {
    await sendWebhookEvent(testEvents[i].data);
    
    if (i < 4 && !quietMode) {
      console.log(`\n${chalk.yellow('⏳ Esperando 2 segundos antes del siguiente evento...')}`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log(`\n${chalk.green('✅ Secuencia completa enviada')}\n`);
}

// Función para enviar todos los eventos
async function sendAllEvents() {
  console.log(`\n${chalk.cyan('🚀 Enviando todos los eventos de prueba...')}\n`);
  
  for (const key in testEvents) {
    const event = testEvents[key];
    await sendWebhookEvent(event.data);
    
    // Esperar 1 segundo entre eventos
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log(`\n${chalk.green('✅ Todos los eventos enviados')}\n`);
}

// Menú principal
function showMenu() {
  console.log(`\n${chalk.cyan('=== SIMULADOR DE PAGOS FALLIDOS ===')}\n`);
  console.log('Eventos disponibles:');
  
  for (const key in testEvents) {
    console.log(`${chalk.yellow(key)}. ${testEvents[key].name} - ${chalk.gray(testEvents[key].description)}`);
  }
  
  console.log(`\n${chalk.yellow('0')}. Enviar todos los eventos`);
  console.log(`${chalk.yellow('s')}. Simular secuencia completa de fallos`);
  console.log(`${chalk.yellow('q')}. Salir\n`);
  
  rl.question('Seleccione una opción: ', async (answer) => {
    if (answer.toLowerCase() === 'q') {
      console.log(`\n${chalk.blue('👋 Adiós!')}`);
      rl.close();
      return;
    }
    
    if (answer === '0') {
      await sendAllEvents();
    } else if (answer.toLowerCase() === 's') {
      await simulatePaymentFailureSequence();
    } else if (testEvents[answer]) {
      await sendWebhookEvent(testEvents[answer].data);
    } else {
      console.log(`${chalk.red('❌ Opción inválida')}`);
    }
    
    // Mostrar menú nuevamente
    setTimeout(showMenu, 1000);
  });
}

// Función principal para modo CLI
async function runCLI() {
  if (eventToSend === '--help' || eventToSend === '-h') {
    console.log('Uso: node testPaymentFailures.js [opción] [flags]');
    console.log('\nOpciones:');
    console.log('  1-6     Enviar evento específico');
    console.log('  all     Enviar todos los eventos');
    console.log('  seq     Simular secuencia completa de fallos');
    console.log('  list    Listar eventos disponibles');
    console.log('\nFlags:');
    console.log('  --quiet, -q    Modo silencioso (menos output)');
    console.log('  --help, -h     Mostrar esta ayuda');
    process.exit(0);
  }

  if (eventToSend === 'list') {
    console.log('Eventos disponibles:');
    for (const key in testEvents) {
      console.log(`${key}: ${testEvents[key].name} - ${testEvents[key].description}`);
    }
    process.exit(0);
  }

  if (eventToSend === 'all') {
    await sendAllEvents();
    process.exit(0);
  }

  if (eventToSend === 'seq') {
    await simulatePaymentFailureSequence();
    process.exit(0);
  }

  if (testEvents[eventToSend]) {
    const result = await sendWebhookEvent(testEvents[eventToSend].data);
    process.exit(result.success ? 0 : 1);
  }

  console.error('Error: Opción no válida. Use --help para ver las opciones disponibles.');
  process.exit(1);
}

// Verificar configuración
if (!quietMode) {
  console.log(`${chalk.cyan('🔧 Configuración:')}`);
  console.log(`URL del webhook: ${chalk.green(WEBHOOK_URL)}`);
  console.log(`Secret configurado: ${WEBHOOK_SECRET ? chalk.green('Sí') : chalk.red('No')}`);
  if (isSSH) {
    console.log(`Ejecutando a través de SSH: ${chalk.gray('Sí')}`);
  }
  
  // Verificar si se cargó el archivo .env
  const fs = require('fs');
  const path = require('path');
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    console.warn(`\n${chalk.yellow('⚠️')}  No se encontró archivo .env en el directorio actual`);
    console.warn(`Buscando en: ${envPath}`);
  }
}

if (!WEBHOOK_SECRET && !quietMode) {
  console.warn(`\n${chalk.yellow('⚠️')}  ADVERTENCIA: No se ha configurado STRIPE_WEBHOOK_SECRET`);
  console.warn('Los eventos no tendrán firma válida');
  console.warn('Asegúrate de tener en tu archivo .env:');
  console.warn('STRIPE_WEBHOOK_SECRET_DEV=whsec_...');
  console.warn('o');
  console.warn('STRIPE_WEBHOOK_SECRET=whsec_...\n');
}

// Iniciar en modo CLI o interactivo
if (cliMode) {
  runCLI();
} else {
  showMenu();
}