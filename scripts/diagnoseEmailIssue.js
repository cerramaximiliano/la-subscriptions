#!/usr/bin/env node

/**
 * Script de diagnóstico para verificar problemas con emails
 * - Verifica recursos del usuario
 * - Verifica templates en base de datos
 * - Verifica URLs en templates
 */

require('dotenv').config();
const mongoose = require('mongoose');
const logger = require('../utils/logger');
const EmailTemplate = require('../models/EmailTemplate');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const Folder = require('../models/Folder');
const Calculator = require('../models/Calculator');
const Contact = require('../models/Contact');

/**
 * Verifica recursos de un usuario
 */
async function checkUserResources(email) {
  try {
    const user = await User.findOne({ email });

    if (!user) {
      logger.error(`❌ Usuario no encontrado: ${email}`);
      return null;
    }

    logger.info(`\n👤 Usuario encontrado: ${user.email}`);
    logger.info(`   ID: ${user._id}`);
    logger.info(`   Nombre: ${user.firstName || user.name || 'N/A'}`);

    // Buscar suscripción
    const subscription = await Subscription.findOne({ user: user._id });

    if (!subscription) {
      logger.warn(`⚠️  No se encontró suscripción para el usuario`);
    } else {
      logger.info(`\n📋 Suscripción:`);
      logger.info(`   Plan: ${subscription.plan}`);
      logger.info(`   Estado: ${subscription.status}`);
      logger.info(`   Estado de cuenta: ${subscription.accountStatus || 'N/A'}`);

      if (subscription.downgradeGracePeriod?.expiresAt) {
        logger.info(`\n⏰ Período de gracia (downgrade):`);
        logger.info(`   Expira: ${subscription.downgradeGracePeriod.expiresAt}`);
        logger.info(`   Plan objetivo: ${subscription.downgradeGracePeriod.targetPlan}`);
        logger.info(`   Auto-archive: ${subscription.downgradeGracePeriod.autoArchiveScheduled}`);
        logger.info(`   Reminder 3 días: ${subscription.downgradeGracePeriod.reminder3DaysSent || false}`);
        logger.info(`   Reminder 1 día: ${subscription.downgradeGracePeriod.reminder1DaySent || false}`);
      }

      if (subscription.paymentFailures?.count > 0) {
        logger.info(`\n💳 Fallos de pago:`);
        logger.info(`   Cantidad: ${subscription.paymentFailures.count}`);
        logger.info(`   Primer fallo: ${subscription.paymentFailures.firstFailedAt}`);
        logger.info(`   Último fallo: ${subscription.paymentFailures.lastFailedAt}`);
      }
    }

    // Contar recursos actuales
    const activeFolders = await Folder.countDocuments({
      userId: user._id,
      archived: { $ne: true }
    });

    const activeCalculators = await Calculator.countDocuments({
      userId: user._id,
      archived: { $ne: true }
    });

    const activeContacts = await Contact.countDocuments({
      userId: user._id,
      archived: { $ne: true }
    });

    logger.info(`\n📊 Recursos actuales:`);
    logger.info(`   Carpetas activas: ${activeFolders}`);
    logger.info(`   Calculadoras activas: ${activeCalculators}`);
    logger.info(`   Contactos activos: ${activeContacts}`);

    // Límites del plan free
    const freeLimits = {
      maxFolders: 5,
      maxCalculators: 3,
      maxContacts: 10
    };

    const toArchive = {
      folders: Math.max(0, activeFolders - freeLimits.maxFolders),
      calculators: Math.max(0, activeCalculators - freeLimits.maxCalculators),
      contacts: Math.max(0, activeContacts - freeLimits.maxContacts)
    };

    logger.info(`\n🗂️  Elementos que exceden límites del plan FREE:`);
    logger.info(`   Carpetas a archivar: ${toArchive.folders}`);
    logger.info(`   Calculadoras a archivar: ${toArchive.calculators}`);
    logger.info(`   Contactos a archivar: ${toArchive.contacts}`);

    const hasExcess = toArchive.folders > 0 || toArchive.calculators > 0 || toArchive.contacts > 0;

    logger.info(`\n🔍 Análisis:`);
    logger.info(`   ¿Excede límites?: ${hasExcess ? '✅ SÍ' : '❌ NO'}`);

    if (hasExcess) {
      logger.info(`   ✉️  Debería recibir: gracePeriodReminderWithExcess`);
    } else {
      logger.info(`   ✉️  Debería recibir: gracePeriodReminderNoExcess`);
    }

    return {
      user,
      subscription,
      resources: {
        activeFolders,
        activeCalculators,
        activeContacts
      },
      toArchive,
      hasExcess
    };

  } catch (error) {
    logger.error('Error verificando recursos del usuario:', error);
    return null;
  }
}

/**
 * Verifica URLs en templates
 */
async function checkTemplateURLs() {
  try {
    logger.info('\n🔍 Verificando URLs en templates...\n');

    const templates = await EmailTemplate.find({ isActive: true });

    const incorrectURLs = [];
    const oldURL = /lawanalytics\.app\/subscription/g;
    const correctURL = 'lawanalytics.app/apps/profiles/account/settings';

    for (const template of templates) {
      let hasIssue = false;

      // Verificar subject
      if (oldURL.test(template.subject)) {
        incorrectURLs.push({
          template: template.name,
          field: 'subject',
          matches: template.subject.match(oldURL)
        });
        hasIssue = true;
      }

      // Verificar htmlBody
      const htmlMatches = template.htmlBody.match(oldURL);
      if (htmlMatches) {
        incorrectURLs.push({
          template: template.name,
          field: 'htmlBody',
          count: htmlMatches.length
        });
        hasIssue = true;
      }

      // Verificar textBody
      const textMatches = template.textBody?.match(oldURL);
      if (textMatches) {
        incorrectURLs.push({
          template: template.name,
          field: 'textBody',
          count: textMatches.length
        });
        hasIssue = true;
      }

      if (hasIssue) {
        logger.warn(`⚠️  Template '${template.name}' tiene URLs incorrectas`);
      }
    }

    if (incorrectURLs.length > 0) {
      logger.info(`\n📋 Resumen de URLs incorrectas:`);
      incorrectURLs.forEach(issue => {
        logger.info(`   - ${issue.template} (${issue.field}): ${issue.count || 1} ocurrencia(s)`);
      });
      logger.info(`\n💡 URL incorrecta: lawanalytics.app/subscription`);
      logger.info(`   URL correcta: ${correctURL}`);
    } else {
      logger.info(`✅ No se encontraron URLs incorrectas en templates`);
    }

    return incorrectURLs;

  } catch (error) {
    logger.error('Error verificando URLs en templates:', error);
    return null;
  }
}

/**
 * Función principal
 */
async function main() {
  try {
    const userEmail = process.argv[2] || 'maximilian@rumba-dev.com';

    logger.info('🔍 DIAGNÓSTICO DE PROBLEMAS DE EMAIL');
    logger.info('=====================================\n');

    // Conectar a MongoDB
    const mongoUrl = process.env.MONGODB_URI || process.env.URLDB;
    if (!mongoUrl) {
      throw new Error('MONGODB_URI o URLDB no está definido en las variables de entorno');
    }

    await mongoose.connect(mongoUrl);
    logger.info('✅ Conectado a MongoDB\n');

    // Verificar recursos del usuario
    logger.info(`\n${'='.repeat(60)}`);
    logger.info('PARTE 1: VERIFICAR RECURSOS DEL USUARIO');
    logger.info('='.repeat(60));

    const userDiagnosis = await checkUserResources(userEmail);

    // Verificar URLs en templates
    logger.info(`\n${'='.repeat(60)}`);
    logger.info('PARTE 2: VERIFICAR URLs EN TEMPLATES');
    logger.info('='.repeat(60));

    const urlIssues = await checkTemplateURLs();

    // Resumen final
    logger.info(`\n${'='.repeat(60)}`);
    logger.info('RESUMEN');
    logger.info('='.repeat(60));

    if (userDiagnosis) {
      logger.info(`\n👤 Usuario: ${userEmail}`);
      logger.info(`   Excede límites: ${userDiagnosis.hasExcess ? 'SÍ' : 'NO'}`);
      logger.info(`   Template correcto: ${userDiagnosis.hasExcess ? 'gracePeriodReminderWithExcess' : 'gracePeriodReminderNoExcess'}`);
    }

    if (urlIssues && urlIssues.length > 0) {
      logger.info(`\n🔗 URLs incorrectas encontradas: ${urlIssues.length}`);
      logger.info(`   Acción requerida: Ejecutar script de corrección de URLs`);
    }

    await mongoose.disconnect();
    logger.info('\n✅ Diagnóstico completado');
    process.exit(0);

  } catch (error) {
    logger.error('❌ Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Ejecutar
if (require.main === module) {
  main();
}

module.exports = { checkUserResources, checkTemplateURLs };
