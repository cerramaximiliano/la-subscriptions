#!/usr/bin/env node

const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs').promises;
const dotenv = require('dotenv');
const readline = require('readline');
const EmailTemplate = require('../models/EmailTemplate');
const User = require('../models/User');
const logger = require('../utils/logger');
const getSecrets = require('../config/env');
const connectDB = require('../config/db');
const emailService = require('../services/emailService');

// Función helper para hacer preguntas
function question(prompt) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

// Colores para la consola
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  underscore: '\x1b[4m',
  blink: '\x1b[5m',
  reverse: '\x1b[7m',
  hidden: '\x1b[8m',
  
  fg: {
    black: '\x1b[30m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
  },
  
  bg: {
    black: '\x1b[40m',
    red: '\x1b[41m',
    green: '\x1b[42m',
    yellow: '\x1b[43m',
    blue: '\x1b[44m',
    magenta: '\x1b[45m',
    cyan: '\x1b[46m',
    white: '\x1b[47m',
  }
};

// Templates disponibles agrupados por categoría
const templateCategories = {
  subscription: {
    name: 'Suscripciones',
    templates: [
      { name: 'subscriptionCreated', description: 'Bienvenida a nueva suscripción' },
      { name: 'subscriptionScheduledCancellation', description: 'Cancelación programada' },
      { name: 'subscriptionImmediateCancellation', description: 'Cancelación inmediata' },
      { name: 'gracePeriodReminderWithExcess', description: 'Recordatorio período de gracia (CON exceso)' },
      { name: 'gracePeriodReminderNoExcess', description: 'Recordatorio período de gracia (SIN exceso)' },
      { name: 'gracePeriodExpiredWithArchive', description: 'Período de gracia expirado (CON archivado)' },
      { name: 'gracePeriodExpiredNoArchive', description: 'Período de gracia expirado (SIN archivado)' },
      { name: 'planDowngraded', description: 'Downgrade de plan' },
      { name: 'planUpgraded', description: 'Upgrade de plan' }
    ]
  },
  payments: {
    name: 'Pagos',
    templates: [
      { name: 'paymentFailedFirst', description: 'Primer intento de pago fallido' },
      { name: 'paymentFailedSecond', description: 'Segundo intento de pago fallido' },
      { name: 'paymentFailedFinal', description: 'Último intento de pago fallido' },
      { name: 'paymentFailedSuspension', description: 'Suspensión por fallo de pago' },
      { name: 'paymentRecovered', description: 'Pago recuperado exitosamente' }
    ]
  }
};

// Datos de ejemplo para cada template
const templateExampleData = {
  subscriptionCreated: {
    userName: 'Juan Pérez',
    planName: 'Premium',
    maxFolders: 'Ilimitadas',
    maxCalculators: 'Ilimitadas',
    maxContacts: 'Ilimitados',
    nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('es-ES')
  },
  subscriptionScheduledCancellation: {
    userName: 'María García',
    previousPlan: 'Premium',
    cancelDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toLocaleDateString('es-ES')
  },
  subscriptionImmediateCancellation: {
    userName: 'Carlos López',
    previousPlan: 'Professional'
  },
  gracePeriodReminderWithExcess: {
    userName: 'Ana Martínez',
    daysRemaining: 3,
    gracePeriodEnd: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString('es-ES'),
    currentFolders: 15,
    currentCalculators: 8,
    currentContacts: 25,
    foldersToArchive: 10,
    calculatorsToArchive: 5,
    contactsToArchive: 15
  },
  gracePeriodReminderNoExcess: {
    userName: 'Pedro Sánchez',
    daysRemaining: 7,
    gracePeriodEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('es-ES'),
    currentFolders: 3,
    currentCalculators: 2,
    currentContacts: 8
  },
  gracePeriodExpiredWithArchive: {
    userName: 'Laura Rodríguez',
    targetPlan: 'Gratuito',
    totalArchived: 30,
    foldersArchived: 12,
    calculatorsArchived: 8,
    contactsArchived: 10,
    planLimits: {
      maxFolders: 5,
      maxCalculators: 3,
      maxContacts: 10,
      storageLimit: 50
    }
  },
  gracePeriodExpiredNoArchive: {
    userName: 'Miguel Fernández',
    targetPlan: 'Gratuito',
    planLimits: {
      maxFolders: 5,
      maxCalculators: 3,
      maxContacts: 10,
      storageLimit: 50
    }
  },
  planDowngraded: {
    userName: 'Isabel Gómez',
    previousPlan: 'Premium',
    newPlan: 'Professional',
    gracePeriodEnd: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toLocaleDateString('es-ES'),
    newLimits: {
      maxFolders: 50,
      maxCalculators: 20,
      maxContacts: 100
    }
  },
  planUpgraded: {
    userName: 'Roberto Díaz',
    previousPlan: 'Basic',
    newPlan: 'Premium',
    newLimits: {
      maxFolders: 999999,
      maxCalculators: 999999,
      maxContacts: 999999
    }
  },
  paymentFailedFirst: {
    userName: 'Carmen Ruiz',
    userEmail: 'carmen@example.com',
    amount: '29.99',
    currency: 'USD',
    planName: 'Professional',
    failureReason: 'Tarjeta rechazada por fondos insuficientes',
    nextRetryDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    updatePaymentUrl: 'https://www.lawanalytics.app/update-payment'
  },
  paymentFailedSecond: {
    userName: 'Diego Morales',
    userEmail: 'diego@example.com',
    daysUntilSuspension: 7,
    updatePaymentUrl: 'https://www.lawanalytics.app/update-payment'
  },
  paymentFailedFinal: {
    userName: 'Patricia Jiménez',
    userEmail: 'patricia@example.com',
    updatePaymentUrl: 'https://www.lawanalytics.app/update-payment'
  },
  paymentFailedSuspension: {
    userName: 'Francisco Hernández',
    userEmail: 'francisco@example.com',
    suspensionDate: new Date(),
    gracePeriodEnd: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
    updatePaymentUrl: 'https://www.lawanalytics.app/update-payment'
  },
  paymentRecovered: {
    userName: 'Lucía Castro',
    userEmail: 'lucia@example.com',
    amount: '49.99',
    currency: 'USD',
    planName: 'Premium',
    nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('es-ES')
  }
};

// Función para limpiar la consola
function clearConsole() {
  console.clear();
}

// Función para imprimir el header
function printHeader() {
  console.log(colors.fg.cyan + colors.bright);
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║             PRUEBA INTERACTIVA DE TEMPLATES DE EMAIL           ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log(colors.reset);
}

// Función para seleccionar usuario
async function selectUser() {
  clearConsole();
  printHeader();
  
  console.log(colors.fg.yellow + '\n📧 SELECCIÓN DE DESTINATARIO\n' + colors.reset);
  
  // Buscar usuarios en la base de datos
  const users = await User.find({}).limit(10).select('email firstName lastName name');
  
  console.log('Usuarios disponibles:');
  console.log(colors.fg.cyan + '0. Ingresar email manualmente' + colors.reset);
  
  users.forEach((user, index) => {
    const displayName = user.firstName || user.name || user.email;
    console.log(`${index + 1}. ${displayName} (${user.email})`);
  });
  
  const choice = await question('\nSelecciona un usuario (número): ');
  
  if (choice === '0') {
    const email = await question('Ingresa el email: ');
    return { email, name: email.split('@')[0] };
  }
  
  const index = parseInt(choice) - 1;
  if (index >= 0 && index < users.length) {
    const user = users[index];
    return {
      email: user.email,
      name: user.firstName || user.name || user.email.split('@')[0]
    };
  }
  
  console.log(colors.fg.red + 'Opción inválida' + colors.reset);
  return null;
}

// Función para seleccionar categoría
async function selectCategory() {
  clearConsole();
  printHeader();
  
  console.log(colors.fg.yellow + '\n📁 CATEGORÍAS DE TEMPLATES\n' + colors.reset);
  
  const categories = Object.keys(templateCategories);
  categories.forEach((key, index) => {
    console.log(`${index + 1}. ${templateCategories[key].name}`);
  });
  
  const choice = await question('\nSelecciona una categoría (número): ');
  const index = parseInt(choice) - 1;
  
  if (index >= 0 && index < categories.length) {
    return categories[index];
  }
  
  return null;
}

// Función para seleccionar template
async function selectTemplate(category) {
  clearConsole();
  printHeader();
  
  console.log(colors.fg.yellow + `\n📄 TEMPLATES DE ${templateCategories[category].name.toUpperCase()}\n` + colors.reset);
  
  const templates = templateCategories[category].templates;
  templates.forEach((template, index) => {
    console.log(`${index + 1}. ${colors.fg.cyan}${template.description}${colors.reset}`);
    console.log(`   ${colors.dim}(${template.name})${colors.reset}`);
  });
  
  const choice = await question('\nSelecciona un template (número): ');
  const index = parseInt(choice) - 1;
  
  if (index >= 0 && index < templates.length) {
    return templates[index].name;
  }
  
  return null;
}

// Función para personalizar datos del template
async function customizeTemplateData(templateName) {
  clearConsole();
  printHeader();
  
  console.log(colors.fg.yellow + '\n⚙️  PERSONALIZACIÓN DE DATOS\n' + colors.reset);
  
  const defaultData = templateExampleData[templateName] || {};
  const customData = {};
  
  console.log('Datos de ejemplo disponibles:');
  console.log(colors.fg.green + JSON.stringify(defaultData, null, 2) + colors.reset);
  
  const useDefaults = await question('\n¿Usar datos de ejemplo? (s/n): ');
  
  if (useDefaults.toLowerCase() === 's') {
    Object.assign(customData, defaultData);
  }
  
  const customize = await question('¿Personalizar algún campo? (s/n): ');
  
  if (customize.toLowerCase() === 's') {
    console.log('\nDeja en blanco para mantener el valor actual');
    
    for (const [key, value] of Object.entries(defaultData)) {
      if (typeof value === 'object') {
        console.log(colors.fg.cyan + `\n${key}:` + colors.reset);
        customData[key] = {};
        for (const [subKey, subValue] of Object.entries(value)) {
          const newValue = await question(`  ${subKey} (${subValue}): `);
          customData[key][subKey] = newValue || subValue;
        }
      } else {
        const newValue = await question(`${key} (${value}): `);
        customData[key] = newValue || value;
      }
    }
  }
  
  return customData;
}

// Función para mostrar resumen antes de enviar
async function showSummary(user, templateName, data) {
  clearConsole();
  printHeader();
  
  console.log(colors.fg.yellow + '\n📋 RESUMEN DEL ENVÍO\n' + colors.reset);
  
  console.log(colors.fg.cyan + 'Destinatario:' + colors.reset);
  console.log(`  Email: ${user.email}`);
  console.log(`  Nombre: ${user.name}`);
  
  console.log(colors.fg.cyan + '\nTemplate:' + colors.reset);
  console.log(`  ${templateName}`);
  
  console.log(colors.fg.cyan + '\nDatos:' + colors.reset);
  console.log(colors.fg.green + JSON.stringify(data, null, 2) + colors.reset);
  
  // Verificar si el template existe en BD
  try {
    const dbTemplate = await EmailTemplate.findOne({ name: templateName });
    if (dbTemplate) {
      console.log(colors.fg.green + '\n✓ Template encontrado en base de datos' + colors.reset);
    } else {
      console.log(colors.fg.yellow + '\n⚠ Template no encontrado en BD, se usará fallback del código' + colors.reset);
    }
  } catch (error) {
    console.log(colors.fg.red + '\n✗ Error verificando template en BD' + colors.reset);
  }
  
  const confirm = await question('\n¿Enviar email? (s/n): ');
  return confirm.toLowerCase() === 's';
}

// Función principal
async function main() {
  try {
    // Obtener configuración
    const secretsString = await getSecrets();
    await fs.writeFile(path.join(__dirname, '../.env'), secretsString);
    dotenv.config({ path: path.join(__dirname, '../.env') });
    
    // Conectar a MongoDB
    await connectDB();
    logger.info('Conectado a MongoDB');
    
    let continuar = true;
    
    while (continuar) {
      // Seleccionar usuario
      const user = await selectUser();
      if (!user) {
        console.log(colors.fg.red + '\nError seleccionando usuario' + colors.reset);
        await question('\nPresiona Enter para continuar...');
        continue;
      }
      
      // Seleccionar categoría
      const category = await selectCategory();
      if (!category) {
        console.log(colors.fg.red + '\nError seleccionando categoría' + colors.reset);
        await question('\nPresiona Enter para continuar...');
        continue;
      }
      
      // Seleccionar template
      const templateName = await selectTemplate(category);
      if (!templateName) {
        console.log(colors.fg.red + '\nError seleccionando template' + colors.reset);
        await question('\nPresiona Enter para continuar...');
        continue;
      }
      
      // Personalizar datos
      const templateData = await customizeTemplateData(templateName);
      
      // Agregar datos del usuario
      const finalData = {
        userName: user.name,
        userEmail: user.email,
        ...templateData
      };
      
      // Mostrar resumen y confirmar
      const confirmed = await showSummary(user, templateName, finalData);
      
      if (confirmed) {
        try {
          console.log(colors.fg.yellow + '\n📤 Enviando email...' + colors.reset);
          
          await emailService.sendEmail(user.email, templateName, finalData);
          
          console.log(colors.fg.green + '\n✅ Email enviado exitosamente!' + colors.reset);
        } catch (error) {
          console.log(colors.fg.red + '\n❌ Error enviando email:' + colors.reset);
          console.log(colors.fg.red + error.message + colors.reset);
        }
      }
      
      const otra = await question('\n¿Enviar otro email? (s/n): ');
      continuar = otra.toLowerCase() === 's';
    }
    
  } catch (error) {
    console.error(colors.fg.red + 'Error:', error.message + colors.reset);
  } finally {
    await mongoose.connection.close();
    console.log(colors.fg.cyan + '\n👋 ¡Hasta luego!' + colors.reset);
    process.exit(0);
  }
}

// Manejar errores no capturados
process.on('uncaughtException', (error) => {
  console.error(colors.fg.red + 'Error no capturado:', error + colors.reset);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(colors.fg.red + 'Promesa rechazada:', reason + colors.reset);
  process.exit(1);
});

// Ejecutar
main();