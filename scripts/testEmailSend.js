const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs').promises;
const dotenv = require('dotenv');
const logger = require('../utils/logger');
const getSecrets = require('../config/env');
const connectDB = require('../config/db');
const emailService = require('../services/emailService');

async function testEmailSend() {
  try {
    // Obtener configuración
    const secretsString = await getSecrets();
    await fs.writeFile(path.join(__dirname, '../.env'), secretsString);
    dotenv.config({ path: path.join(__dirname, '../.env') });
    
    // Conectar a MongoDB
    await connectDB();
    logger.info('Conectado a MongoDB');
    
    // Email de prueba
    const testEmail = process.argv[2] || 'test@example.com';
    const templateName = process.argv[3] || 'subscriptionCreated';
    
    console.log(`\n🚀 Enviando email de prueba...`);
    console.log(`📧 Destinatario: ${testEmail}`);
    console.log(`📄 Template: ${templateName}`);
    
    // Datos de prueba
    const testData = {
      userName: 'Usuario de Prueba',
      userEmail: testEmail,
      planName: 'Premium',
      maxFolders: 'Ilimitadas',
      maxCalculators: 'Ilimitadas', 
      maxContacts: 'Ilimitados',
      nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('es-ES'),
      previousPlan: 'Professional',
      cancelDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toLocaleDateString('es-ES'),
      immediate: false,
      gracePeriodEnd: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toLocaleDateString('es-ES'),
      daysRemaining: 7,
      currentFolders: 10,
      currentCalculators: 5,
      currentContacts: 20,
      exceedsLimits: true,
      foldersToArchive: 5,
      calculatorsToArchive: 2,
      contactsToArchive: 10,
      totalArchived: 17,
      foldersArchived: 5,
      calculatorsArchived: 2,
      contactsArchived: 10,
      targetPlan: 'Gratuito',
      planLimits: {
        maxFolders: 5,
        maxCalculators: 3,
        maxContacts: 10,
        storageLimit: 50
      },
      newPlan: 'Premium',
      newLimits: {
        maxFolders: 999999,
        maxCalculators: 999999,
        maxContacts: 999999
      }
    };
    
    try {
      const result = await emailService.sendEmail(testEmail, templateName, testData);
      console.log('\n✅ Email enviado exitosamente!');
      console.log(`📬 Message ID: ${result.MessageId}`);
    } catch (error) {
      console.error('\n❌ Error enviando email:');
      console.error(error.message);
      if (error.stack) {
        console.error('\nStack trace:');
        console.error(error.stack);
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('\n👋 Conexión cerrada');
    process.exit(0);
  }
}

// Ejecutar
testEmailSend();