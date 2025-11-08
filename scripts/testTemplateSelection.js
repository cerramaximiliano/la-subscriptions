const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs').promises;
const dotenv = require('dotenv');
const logger = require('../utils/logger');
const getSecrets = require('../config/env');
const connectDB = require('../config/db');
const emailService = require('../services/emailService');

async function testTemplateSelection() {
  try {
    // Obtener configuración
    const secretsString = await getSecrets();
    await fs.writeFile(path.join(__dirname, '../.env'), secretsString);
    dotenv.config({ path: path.join(__dirname, '../.env') });
    
    // Conectar a MongoDB
    await connectDB();
    logger.info('Conectado a MongoDB');
    
    const testEmail = 'cerramaximiliano@gmail.com';
    const testUser = {
      email: testEmail,
      firstName: 'Test',
      name: 'Test User'
    };
    
    console.log('\n🧪 PROBANDO SELECCIÓN AUTOMÁTICA DE TEMPLATES\n');
    
    // Test 1: Grace Period Reminder CON exceso
    console.log('1️⃣ Grace Period Reminder CON exceso de límites:');
    try {
      await emailService.sendSubscriptionEmail(testUser, 'gracePeriodReminder', {
        daysRemaining: 3,
        gracePeriodEnd: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString('es-ES'),
        currentFolders: 15,
        currentCalculators: 8,
        currentContacts: 25,
        exceedsLimits: true,
        foldersToArchive: 10,
        calculatorsToArchive: 5,
        contactsToArchive: 15
      });
      console.log('   ✅ Enviado - Debería usar: gracePeriodReminderWithExcess\n');
    } catch (error) {
      console.log('   ❌ Error:', error.message, '\n');
    }
    
    // Test 2: Grace Period Reminder SIN exceso
    console.log('2️⃣ Grace Period Reminder SIN exceso de límites:');
    try {
      await emailService.sendSubscriptionEmail(testUser, 'gracePeriodReminder', {
        daysRemaining: 7,
        gracePeriodEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('es-ES'),
        currentFolders: 3,
        currentCalculators: 2,
        currentContacts: 8,
        exceedsLimits: false,
        foldersToArchive: 0,
        calculatorsToArchive: 0,
        contactsToArchive: 0
      });
      console.log('   ✅ Enviado - Debería usar: gracePeriodReminderNoExcess\n');
    } catch (error) {
      console.log('   ❌ Error:', error.message, '\n');
    }
    
    // Test 3: Grace Period Expired CON archivado
    console.log('3️⃣ Grace Period Expired CON archivado:');
    try {
      await emailService.sendSubscriptionEmail(testUser, 'gracePeriodExpired', {
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
      });
      console.log('   ✅ Enviado - Debería usar: gracePeriodExpiredWithArchive\n');
    } catch (error) {
      console.log('   ❌ Error:', error.message, '\n');
    }
    
    // Test 4: Grace Period Expired SIN archivado
    console.log('4️⃣ Grace Period Expired SIN archivado:');
    try {
      await emailService.sendSubscriptionEmail(testUser, 'gracePeriodExpired', {
        targetPlan: 'Gratuito',
        totalArchived: 0,
        planLimits: {
          maxFolders: 5,
          maxCalculators: 3,
          maxContacts: 10,
          storageLimit: 50
        }
      });
      console.log('   ✅ Enviado - Debería usar: gracePeriodExpiredNoArchive\n');
    } catch (error) {
      console.log('   ❌ Error:', error.message, '\n');
    }
    
    // Test 5: Cancelación inmediata
    console.log('5️⃣ Cancelación inmediata:');
    try {
      await emailService.sendSubscriptionEmail(testUser, 'canceled', {
        previousPlan: 'Premium',
        immediate: true,
        gracePeriodEnd: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toLocaleDateString('es-ES')
      });
      console.log('   ✅ Enviado - Debería usar: subscriptionImmediateCancellation\n');
    } catch (error) {
      console.log('   ❌ Error:', error.message, '\n');
    }
    
    // Test 6: Cancelación programada
    console.log('6️⃣ Cancelación programada:');
    try {
      await emailService.sendSubscriptionEmail(testUser, 'canceled', {
        previousPlan: 'Professional',
        immediate: false,
        cancelDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('es-ES')
      });
      console.log('   ✅ Enviado - Debería usar: subscriptionScheduledCancellation\n');
    } catch (error) {
      console.log('   ❌ Error:', error.message, '\n');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('👋 Pruebas completadas');
    process.exit(0);
  }
}

// Ejecutar
testTemplateSelection();