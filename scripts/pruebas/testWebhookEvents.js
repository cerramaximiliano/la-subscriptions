#!/usr/bin/env node

// Cargar variables de entorno desde la raíz del proyecto
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const axios = require('axios');
const readline = require('readline');
const crypto = require('crypto');
const mongoose = require('mongoose');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Importar modelos
const Subscription = require('../../models/Subscription');
const User = require('../../models/User');

// Detectar capacidades del terminal
const isTTY = process.stdout.isTTY;
const isSSH = process.env.SSH_CLIENT || process.env.SSH_TTY;

// Parsear argumentos de línea de comandos
const args = process.argv.slice(2);
const cliMode = args.length > 0 || !isTTY;
const eventToSend = args[0];
const quietMode = args.includes('--quiet') || args.includes('-q');
const productionMode = args.includes('--production') || args.includes('-p');

// Configuración
const WEBHOOK_URL = process.env.WEBHOOK_URL_SUBSCRIPTION_API || 'http://localhost:5001/api/webhook';
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET_DEV || process.env.STRIPE_WEBHOOK_SECRET;
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
// Verificar variables de entorno requeridas
function checkEnvironmentVariables() {
  const requiredVars = {
    'MONGODB_URI': process.env.URLDB,
    'STRIPE_SECRET_KEY': process.env.STRIPE_API_KEY_DEV,
    'STRIPE_WEBHOOK_SECRET (DEV o PROD)': WEBHOOK_SECRET,
    'WEBHOOK_URL': WEBHOOK_URL,
    'BASE_URL': BASE_URL,
    'SUPPORT_EMAIL': process.env.EMAIL_MARKETING_DEFAULT_SENDER,
  };

  const missingVars = [];

  for (const [name, value] of Object.entries(requiredVars)) {
    if (!value || value === 'undefined') {
      missingVars.push(name);
    }
  }

  if (missingVars.length > 0) {
    console.error('\n❌ ERROR: Faltan las siguientes variables de entorno:');
    missingVars.forEach(varName => {
      console.error(`   - ${varName}`);
    });
    console.error('\n📝 Por favor, configúralas en tu archivo .env');
    console.error('\n⚠️  IMPORTANTE: Asegúrate de configurar ADMIN_EMAIL con tu email real');
    console.error('   para recibir las notificaciones de prueba.\n');
    return false;
  }

  return true;
}
// Conectar a base de datos
async function connectDB() {
  try {
    await mongoose.connect(process.env.URLDB);
    console.log('✅ Conectado a MongoDB');
    return true;
  } catch (error) {
    console.error('❌ Error al conectar a MongoDB:', error.message);
    return false;
  }
}

// Buscar suscripción de prueba existente
async function findTestSubscription() {
  try {
    const testSubscription = await Subscription.findOne({
      stripeSubscriptionId: 'sub_test_existing_1'
    }).populate('user');

    return testSubscription;
  } catch (error) {
    console.error('Error al buscar suscripción de prueba:', error.message);
    return null;
  }
}

// Crear suscripción de prueba
async function createTestSubscription() {
  try {
    // Usar el email del administrador configurado
    const adminEmail = process.env.ADMIN_EMAIL || 'test@example.com';
    
    // Primero buscar o crear un usuario de prueba
    let testUser = await User.findOne({ email: adminEmail });

    if (!testUser) {
      console.log('📝 Creando usuario de prueba...');
      testUser = await User.create({
        email: adminEmail,
        password: 'Test123456!', // Password temporal para pruebas
        stripeCustomerId: 'cus_test_123',
        name: 'Usuario de Prueba',
        firstName: 'Usuario',
        lastName: 'Prueba',
        subscriptionPlan: 'standard',
        isVerified: true, // Para evitar problemas de verificación en pruebas
        isActive: true
      });
      console.log('✅ Usuario de prueba creado:', testUser.email);
    } else {
      // Actualizar el stripeCustomerId si no lo tiene
      if (testUser.stripeCustomerId !== 'cus_test_123') {
        testUser.stripeCustomerId = 'cus_test_123';
        await testUser.save();
        console.log('✅ Usuario actualizado con stripeCustomerId');
      }
    }

    // Buscar si ya existe la suscripción
    const existing = await Subscription.findOne({
      stripeSubscriptionId: 'sub_test_existing_1'
    });

    if (existing) {
      console.log('ℹ️  La suscripción de prueba ya existe');
      return existing;
    }

    // Crear nueva suscripción de prueba
    console.log('📝 Creando suscripción de prueba...');
    const subscription = await Subscription.create({
      user: testUser._id,
      stripeSubscriptionId: 'sub_test_existing_1',
      stripeCustomerId: 'cus_test_123',
      plan: 'standard',
      status: 'active',
      accountStatus: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 días
      cancelAtPeriodEnd: false,
      metadata: {
        userId: testUser._id.toString()
      },
      // Inicializar campos de manejo de pagos fallidos
      paymentFailures: {
        count: 0,
        notificationsSent: {}
      },
      paymentRecovery: {
        inRecovery: false
      },
      statusHistory: [{
        status: 'active',
        changedAt: new Date(),
        reason: 'Suscripción de prueba creada',
        triggeredBy: 'system'
      }]
    });

    console.log('✅ Suscripción de prueba creada con ID:', subscription.stripeSubscriptionId);
    return subscription;
  } catch (error) {
    console.error('❌ Error al crear suscripción de prueba:', error.message);
    return null;
  }
}

// Crear readline solo si estamos en modo interactivo
let rl;
if (!cliMode) {
  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

// Variable global para almacenar la suscripción de prueba
let testSubscription = null;

// Función para obtener eventos de prueba con datos reales
function getTestEvents() {
  const subscriptionId = testSubscription?.stripeSubscriptionId || 'sub_test_existing_1';
  const customerId = testSubscription?.stripeCustomerId || 'cus_test_123';
  const userId = testSubscription?.user?._id?.toString() || '507f1f77bcf86cd799439011';

  return {
    1: {
      name: 'customer.subscription.created',
      description: 'Nueva suscripción creada',
      data: {
        id: 'evt_test_' + Date.now() + '_created',
        type: 'customer.subscription.created',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: 'sub_test_' + Date.now(),
            object: 'subscription',
            customer: customerId,
            status: 'active',
            current_period_start: Math.floor(Date.now() / 1000),
            current_period_end: Math.floor(Date.now() / 1000) + 2592000,
            items: {
              data: [{
                price: {
                  id: 'price_test_123',
                  product: 'prod_test_123'
                }
              }]
            },
            cancel_at_period_end: false,
            metadata: {
              userId: userId
            }
          }
        }
      }
    },
    2: {
      name: 'customer.subscription.updated',
      description: 'Suscripción actualizada',
      data: {
        id: 'evt_test_' + Date.now() + '_updated',
        type: 'customer.subscription.updated',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: subscriptionId,
            object: 'subscription',
            customer: customerId,
            status: 'active',
            current_period_start: Math.floor(Date.now() / 1000),
            current_period_end: Math.floor(Date.now() / 1000) + 2592000,
            items: {
              data: [{
                price: {
                  id: 'price_test_456',
                  product: 'prod_test_456'
                }
              }]
            },
            cancel_at_period_end: false,
            metadata: {
              userId: userId
            }
          },
          previous_attributes: {
            items: {
              data: [{
                price: {
                  id: 'price_test_123',
                  product: 'prod_test_123'
                }
              }]
            }
          }
        }
      }
    },
    3: {
      name: 'customer.subscription.deleted',
      description: 'Suscripción cancelada',
      data: {
        id: 'evt_test_' + Date.now() + '_deleted',
        type: 'customer.subscription.deleted',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: subscriptionId,
            object: 'subscription',
            customer: customerId,
            status: 'canceled',
            canceled_at: Math.floor(Date.now() / 1000),
            ended_at: Math.floor(Date.now() / 1000),
            items: {
              data: [{
                price: {
                  id: 'price_test_123',
                  product: 'prod_test_123'
                }
              }]
            },
            metadata: {
              userId: userId
            }
          }
        }
      }
    },
    4: {
      name: 'invoice.payment_succeeded',
      description: 'Pago exitoso',
      data: {
        id: 'evt_test_' + Date.now() + '_payment',
        type: 'invoice.payment_succeeded',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: 'in_test_' + Date.now(),
            object: 'invoice',
            customer: customerId,
            subscription: subscriptionId,
            amount_paid: 2900,
            currency: 'usd',
            payment_intent: 'pi_test_' + Date.now(),
            status: 'paid',
            paid: true
          }
        }
      }
    },
    5: {
      name: 'invoice.payment_failed',
      description: 'Pago fallido (Intento 1)',
      data: {
        id: 'evt_test_' + Date.now() + '_failed',
        type: 'invoice.payment_failed',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: 'in_test_' + Date.now(),
            object: 'invoice',
            customer: customerId,
            subscription: subscriptionId,
            amount_due: 2900,
            currency: 'usd',
            payment_intent: 'pi_test_' + Date.now(),
            status: 'open',
            paid: false,
            next_payment_attempt: Math.floor(Date.now() / 1000) + 86400,
            attempt_count: 1,
            payment_method_details: {
              card: {
                last4: '4242',
                decline_code: 'generic_decline'
              }
            }
          }
        }
      }
    },
    6: {
      name: 'invoice.payment_failed',
      description: 'Pago fallido (Intento 2)',
      data: {
        id: 'evt_test_' + Date.now() + '_failed_2',
        type: 'invoice.payment_failed',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: 'in_test_' + Date.now(),
            object: 'invoice',
            customer: customerId,
            subscription: subscriptionId,
            amount_due: 2900,
            currency: 'usd',
            payment_intent: 'pi_test_' + Date.now(),
            status: 'open',
            paid: false,
            next_payment_attempt: Math.floor(Date.now() / 1000) + 259200, // 3 días
            attempt_count: 2,
            payment_method_details: {
              card: {
                last4: '4242',
                decline_code: 'insufficient_funds'
              }
            }
          }
        }
      }
    },
    7: {
      name: 'invoice.payment_failed',
      description: 'Pago fallido (Intento 3)',
      data: {
        id: 'evt_test_' + Date.now() + '_failed_3',
        type: 'invoice.payment_failed',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: 'in_test_' + Date.now(),
            object: 'invoice',
            customer: customerId,
            subscription: subscriptionId,
            amount_due: 2900,
            currency: 'usd',
            payment_intent: 'pi_test_' + Date.now(),
            status: 'open',
            paid: false,
            next_payment_attempt: Math.floor(Date.now() / 1000) + 432000, // 5 días
            attempt_count: 3,
            payment_method_details: {
              card: {
                last4: '4242',
                decline_code: 'card_declined'
              }
            }
          }
        }
      }
    },
    8: {
      name: 'invoice.payment_failed',
      description: 'Pago fallido (Intento 4 - Período de gracia)',
      data: {
        id: 'evt_test_' + Date.now() + '_failed_4',
        type: 'invoice.payment_failed',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: 'in_test_' + Date.now(),
            object: 'invoice',
            customer: customerId,
            subscription: subscriptionId,
            amount_due: 2900,
            currency: 'usd',
            payment_intent: 'pi_test_' + Date.now(),
            status: 'open',
            paid: false,
            next_payment_attempt: null, // No más reintentos
            attempt_count: 4,
            payment_method_details: {
              card: {
                last4: '4242',
                decline_code: 'expired_card'
              }
            }
          }
        }
      }
    }
  };
}

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
    
    // Detectar si estamos en modo producción (real o simulado)
    const isProduction = productionMode || process.env.NODE_ENV === 'production';
    const testToken = process.env.WEBHOOK_TEST_TOKEN;
    
    if (productionMode && !quietMode) {
      console.log('🎭 Modo producción simulado activado');
    }
    
    let url = WEBHOOK_URL;
    let headers = {
      'Content-Type': 'application/json'
    };
    
    if (isProduction && testToken) {
      // En producción con token, usar el endpoint seguro
      url = url.replace('/webhook', '/webhook/test-secure');
      headers['x-test-auth-token'] = testToken;
      if (!quietMode) {
        console.log('🔐 Usando endpoint de pruebas seguro');
      }
    } else {
      // En desarrollo o sin token, usar firma normal
      const signature = generateStripeSignature(payload, WEBHOOK_SECRET);
      headers['stripe-signature'] = signature;
    }

    if (!quietMode) {
      console.log(`\n📤 Enviando evento: ${eventData.type}`);
      console.log(`ID: ${eventData.id}`);
      console.log(`URL: ${url}`);
    }

    const response = await axios.post(url, payload, { headers });

    if (!quietMode) {
      console.log(`✅ Respuesta: ${response.status} ${response.statusText}`);
      console.log(`Datos:`, response.data);
    } else {
      console.log(`OK: ${eventData.type}`);
    }

    return { success: true, status: response.status };

  } catch (error) {
    if (!quietMode) {
      console.error(`❌ Error al enviar evento:`, error.message || 'Error desconocido');
      
      if (error.response) {
        console.error(`Estado HTTP: ${error.response.status}`);
        console.error(`Respuesta del servidor:`, error.response.data);
        
        // Si es un error de webhook de Stripe, mostrar detalles
        if (error.response.data?.error) {
          console.error(`Tipo de error: ${error.response.data.error.type || 'No especificado'}`);
          console.error(`Mensaje: ${error.response.data.error.message || 'Sin mensaje'}`);
        }
      } else if (error.request) {
        console.error(`❌ No se recibió respuesta del servidor`);
        console.error(`URL intentada: ${WEBHOOK_URL}`);
      } else {
        console.error(`❌ Error de configuración:`, error.message);
      }
      
      // Verificar si el servidor está ejecutándose
      if (error.code === 'ECONNREFUSED') {
        console.error(`\n⚠️  Parece que el servidor no está ejecutándose en ${WEBHOOK_URL}`);
        console.error(`💡 Asegúrate de ejecutar 'npm run dev' en otra terminal`);
      }
    } else {
      console.error(`ERROR: ${eventData.type} - ${error.message || 'Error desconocido'}`);
    }
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

// Función para enviar todos los eventos
async function sendAllEvents() {
  const events = getTestEvents();
  console.log('\n🚀 Enviando todos los eventos...\n');

  for (const key in events) {
    const event = events[key];
    await sendWebhookEvent(event.data);

    // Esperar 1 segundo entre eventos
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n✅ Todos los eventos enviados\n');
}

// Función para enviar secuencia de pagos fallidos
async function sendPaymentFailureSequence() {
  const events = getTestEvents();
  console.log('\n🚀 Enviando secuencia de pagos fallidos...\n');

  // Enviar los 4 intentos de pago fallido
  for (let i = 5; i <= 8; i++) {
    console.log(`\n--- Intento ${i - 4} de 4 ---`);
    await sendWebhookEvent(events[i].data);
    await new Promise(resolve => setTimeout(resolve, 2000)); // 2 segundos entre intentos
  }

  console.log('\n✅ Secuencia de pagos fallidos completada\n');
}

// Menú principal
function showMenu() {
  const events = getTestEvents();
  console.log('\n=== SIMULADOR DE EVENTOS WEBHOOK ===\n');

  if (testSubscription) {
    console.log(`📌 Suscripción de prueba: ${testSubscription.stripeSubscriptionId}`);
    console.log(`👤 Usuario: ${testSubscription.user?.email || testSubscription.user?._id}`);
    console.log(`📊 Estado actual: ${testSubscription.accountStatus}`);
    console.log(`📧 Los emails se enviarán a: ${testSubscription.user?.email || process.env.ADMIN_EMAIL}\n`);
  }

  console.log('Eventos disponibles:');

  for (const key in events) {
    console.log(`${key}. ${events[key].name} - ${events[key].description}`);
  }

  console.log('\n--- Opciones especiales ---');
  console.log('0. Enviar todos los eventos');
  console.log('seq. Enviar secuencia completa de pagos fallidos (4 intentos)');
  console.log('create. Crear/buscar suscripción de prueba');
  console.log('q. Salir\n');

  rl.question('Seleccione una opción: ', async (answer) => {
    answer = answer.toLowerCase();

    if (answer === 'q') {
      console.log('👋 Adiós!');
      await mongoose.connection.close();
      rl.close();
      return;
    }

    if (answer === '0') {
      await sendAllEvents();
    } else if (answer === 'seq') {
      await sendPaymentFailureSequence();
    } else if (answer === 'create') {
      testSubscription = await createTestSubscription();
    } else if (events[answer]) {
      await sendWebhookEvent(events[answer].data);
    } else {
      console.log('❌ Opción inválida');
    }

    // Mostrar menú nuevamente
    setTimeout(showMenu, 1000);
  });
}

// Función principal para modo CLI
async function runCLI() {
  const events = getTestEvents();

  if (eventToSend === '--help' || eventToSend === '-h') {
    console.log('Uso: node testWebhookEvents.js [opción] [flags]');
    console.log('\nOpciones:');
    console.log('  1-8     Enviar evento específico');
    console.log('  all     Enviar todos los eventos');
    console.log('  seq     Enviar secuencia de pagos fallidos');
    console.log('  create  Crear/buscar suscripción de prueba');
    console.log('  list    Listar eventos disponibles');
    console.log('\nFlags:');
    console.log('  --quiet, -q        Modo silencioso (menos output)');
    console.log('  --production, -p   Simular modo producción (usar endpoint seguro)');
    console.log('  --help, -h         Mostrar esta ayuda');
    process.exit(0);
  }

  if (eventToSend === 'list') {
    console.log('Eventos disponibles:');
    for (const key in events) {
      console.log(`${key}: ${events[key].name} - ${events[key].description}`);
    }
    process.exit(0);
  }

  if (eventToSend === 'all') {
    await sendAllEvents();
    process.exit(0);
  }

  if (eventToSend === 'seq') {
    await sendPaymentFailureSequence();
    process.exit(0);
  }

  if (eventToSend === 'create') {
    const subscription = await createTestSubscription();
    if (subscription) {
      console.log('✅ Suscripción lista para pruebas');
    }
    process.exit(0);
  }

  if (events[eventToSend]) {
    const result = await sendWebhookEvent(events[eventToSend].data);
    process.exit(result.success ? 0 : 1);
  }

  console.error('Error: Opción no válida. Use --help para ver las opciones disponibles.');
  process.exit(1);
}

// Función principal asíncrona
async function main() {
  // Verificar variables de entorno
  if (!checkEnvironmentVariables()) {
    process.exit(1);
  }

  // Verificar configuración
  if (!quietMode) {
    console.log('\n🔧 Configuración:');
    console.log(`URL del webhook: ${WEBHOOK_URL}`);
    console.log(`Secret configurado: ${WEBHOOK_SECRET ? 'Sí' : 'No'}`);
    console.log(`MongoDB URI: ${process.env.MONGODB_URI ? 'Configurado' : 'No configurado'}`);
    if (isSSH) {
      console.log(`Ejecutando a través de SSH: Sí`);
    }

    // Verificar si se cargó el archivo .env
    const fs = require('fs');
    const envPath = path.resolve(__dirname, '../../.env');
    if (!fs.existsSync(envPath)) {
      console.warn('\n⚠️  No se encontró archivo .env');
      console.warn(`Buscando en: ${envPath}`);
    }
  }

  // Conectar a la base de datos
  console.log('\n🔄 Conectando a MongoDB...');
  const dbConnected = await connectDB();
  if (!dbConnected) {
    console.error('❌ No se pudo conectar a la base de datos');
    process.exit(1);
  }

  // Buscar o crear suscripción de prueba
  console.log('\n🔍 Buscando suscripción de prueba...');
  testSubscription = await findTestSubscription();

  if (!testSubscription && !cliMode) {
    console.log('\n⚠️  No se encontró suscripción de prueba');
    console.log('💡 Usa la opción "create" en el menú para crear una suscripción de prueba');
  } else if (testSubscription && !quietMode) {
    console.log('✅ Suscripción de prueba encontrada:', testSubscription.stripeSubscriptionId);
  }

  // Iniciar en modo CLI o interactivo
  if (cliMode) {
    await runCLI();
  } else {
    showMenu();
  }
}

// Ejecutar función principal
main().catch(error => {
  console.error('❌ Error fatal:', error.message);
  process.exit(1);
});