#!/usr/bin/env node

/**
 * Script para corregir específicamente el template gracePeriodReminderWithExcess
 * Convierte ${variable} a {{variable}} y corrige la URL
 */

require('dotenv').config();
const mongoose = require('mongoose');
const EmailTemplate = require('../models/EmailTemplate');
const logger = require('../utils/logger');

/**
 * Convierte ${variable} a {{variable}} en un texto
 */
function convertVariableSyntax(text) {
  if (!text || typeof text !== 'string') return text;
  return text.replace(/\$\{([^}]+)\}/g, '{{$1}}');
}

/**
 * Corrige URLs incorrectas en templates
 */
function fixIncorrectURLs(text) {
  if (!text || typeof text !== 'string') return text;

  let result = text;

  // Reemplazar todas las variaciones de la URL incorrecta
  result = result.replace(/https?:\/\/www\.lawanalytics\.app\/subscription/gi,
                          'https://lawanalytics.app/apps/profiles/account/settings');

  result = result.replace(/https?:\/\/lawanalytics\.app\/subscription/gi,
                          'https://lawanalytics.app/apps/profiles/account/settings');

  return result;
}

async function main() {
  try {
    const dryRun = process.argv.includes('--dry-run');

    logger.info('🔧 Corrigiendo template gracePeriodReminderWithExcess...');
    logger.info(`   Modo: ${dryRun ? 'DRY RUN (solo verificación)' : 'APLICAR CAMBIOS'}\n`);

    const mongoUrl = process.env.MONGODB_URI || process.env.URLDB;
    if (!mongoUrl) {
      throw new Error('MONGODB_URI o URLDB no está definido en las variables de entorno');
    }

    await mongoose.connect(mongoUrl);
    logger.info('✅ Conectado a MongoDB\n');

    // Buscar el template específico
    const template = await EmailTemplate.findOne({
      name: 'gracePeriodReminderWithExcess'
    });

    if (!template) {
      throw new Error('Template gracePeriodReminderWithExcess no encontrado');
    }

    logger.info('📧 Template encontrado:');
    logger.info(`   ID: ${template._id}`);
    logger.info(`   Name: ${template.name}`);
    logger.info(`   Category: ${template.category}\n`);

    // Mostrar estado actual
    logger.info('📊 Estado ANTES de las correcciones:');
    logger.info(`   Subject: ${template.subject}`);

    const varsInSubject = (template.subject.match(/\$\{[^}]+\}/g) || []).length;
    const varsInHtml = (template.htmlBody.match(/\$\{[^}]+\}/g) || []).length;
    const varsInText = (template.textBody.match(/\$\{[^}]+\}/g) || []).length;

    logger.info(`   Variables con sintaxis \${}: ${varsInSubject + varsInHtml + varsInText}`);
    logger.info(`     - Subject: ${varsInSubject}`);
    logger.info(`     - HTML: ${varsInHtml}`);
    logger.info(`     - Text: ${varsInText}`);

    const urlsInHtml = (template.htmlBody.match(/lawanalytics\.app\/subscription/gi) || []).length;
    const urlsInText = (template.textBody.match(/lawanalytics\.app\/subscription/gi) || []).length;

    logger.info(`   URLs incorrectas: ${urlsInHtml + urlsInText}`);
    logger.info(`     - HTML: ${urlsInHtml}`);
    logger.info(`     - Text: ${urlsInText}\n`);

    if (!dryRun) {
      // Aplicar correcciones
      logger.info('🔧 Aplicando correcciones...\n');

      // Convertir variables
      const oldSubject = template.subject;
      template.subject = convertVariableSyntax(template.subject);
      template.htmlBody = convertVariableSyntax(template.htmlBody);
      template.textBody = convertVariableSyntax(template.textBody);

      // Corregir URLs
      template.htmlBody = fixIncorrectURLs(template.htmlBody);
      template.textBody = fixIncorrectURLs(template.textBody);

      await template.save();

      // Mostrar estado después
      logger.info('✅ Correcciones aplicadas!\n');
      logger.info('📊 Estado DESPUÉS de las correcciones:');
      logger.info(`   Subject ANTES: ${oldSubject}`);
      logger.info(`   Subject DESPUÉS: ${template.subject}`);

      const varsAfterSubject = (template.subject.match(/\{\{[^}]+\}\}/g) || []).length;
      const varsAfterHtml = (template.htmlBody.match(/\{\{[^}]+\}\}/g) || []).length;
      const varsAfterText = (template.textBody.match(/\{\{[^}]+\}\}/g) || []).length;

      logger.info(`   Variables con sintaxis {{}}: ${varsAfterSubject + varsAfterHtml + varsAfterText}`);
      logger.info(`     - Subject: ${varsAfterSubject}`);
      logger.info(`     - HTML: ${varsAfterHtml}`);
      logger.info(`     - Text: ${varsAfterText}`);

      const urlsAfterHtml = (template.htmlBody.match(/lawanalytics\.app\/apps\/profiles\/account\/settings/gi) || []).length;
      const urlsAfterText = (template.textBody.match(/lawanalytics\.app\/apps\/profiles\/account\/settings/gi) || []).length;

      logger.info(`   URLs correctas: ${urlsAfterHtml + urlsAfterText}`);
      logger.info(`     - HTML: ${urlsAfterHtml}`);
      logger.info(`     - Text: ${urlsAfterText}\n`);
    } else {
      logger.info('⏭️  DRY RUN - No se guardaron cambios\n');
      logger.info('Para aplicar los cambios, ejecuta:');
      logger.info('   node scripts/fixGracePeriodTemplate.js --apply\n');
    }

    await mongoose.disconnect();
    logger.info('✅ Proceso completado');
    process.exit(0);

  } catch (error) {
    logger.error('❌ Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

main();
