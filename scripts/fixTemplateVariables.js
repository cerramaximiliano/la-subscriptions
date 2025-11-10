#!/usr/bin/env node

/**
 * Script para corregir la sintaxis de variables en templates de email
 * Convierte ${variable} a {{variable}}
 */

require('dotenv').config();
const mongoose = require('mongoose');
const EmailTemplate = require('../models/EmailTemplate');
const logger = require('../utils/logger');

// Mapa de conversión de variables
const variableMap = {
  'daysRemaining': 'daysRemaining',
  'userName': 'userName',
  'userEmail': 'userEmail',
  'gracePeriodEnd': 'gracePeriodEnd',
  'currentFolders': 'currentFolders',
  'currentCalculators': 'currentCalculators',
  'currentContacts': 'currentContacts',
  'foldersToArchive': 'foldersToArchive',
  'calculatorsToArchive': 'calculatorsToArchive',
  'contactsToArchive': 'contactsToArchive',
  'planLimits.maxFolders': 'planLimits.maxFolders',
  'planLimits.maxCalculators': 'planLimits.maxCalculators',
  'planLimits.maxContacts': 'planLimits.maxContacts',
  'targetPlan': 'targetPlan',
  'planName': 'planName',
  'previousPlan': 'previousPlan'
};

/**
 * Convierte ${variable} a {{variable}} en un texto
 */
function convertVariableSyntax(text) {
  if (!text || typeof text !== 'string') return text;

  // Reemplazar ${variable} por {{variable}}
  // Usar regex para encontrar todas las ocurrencias
  return text.replace(/\$\{([^}]+)\}/g, '{{$1}}');
}

/**
 * Corrige URLs incorrectas en templates
 */
function fixIncorrectURLs(text) {
  if (!text || typeof text !== 'string') return text;

  // Reemplazar URLs incorrectas por la correcta
  // Manejar diferentes variaciones de la URL
  let result = text;

  // Caso 1: https://www.lawanalytics.app/subscription
  result = result.replace(/https?:\/\/www\.lawanalytics\.app\/subscription/gi,
                          'https://lawanalytics.app/apps/profiles/account/settings');

  // Caso 2: https://lawanalytics.app/subscription
  result = result.replace(/https?:\/\/lawanalytics\.app\/subscription/gi,
                          'https://lawanalytics.app/apps/profiles/account/settings');

  // Caso 3: ${process.env.BASE_URL}/subscription (en templates de código)
  result = result.replace(/\$\{process\.env\.BASE_URL\}\/subscription/gi,
                          'https://lawanalytics.app/apps/profiles/account/settings');

  // Caso 4: {{BASE_URL}}/subscription (si se usa esta sintaxis)
  result = result.replace(/\{\{BASE_URL\}\}\/subscription/gi,
                          'https://lawanalytics.app/apps/profiles/account/settings');

  return result;
}

/**
 * Verifica si un template tiene URLs incorrectas
 */
function hasIncorrectURLs(text) {
  if (!text || typeof text !== 'string') return false;
  return /lawanalytics\.app\/subscription/i.test(text) ||
         /BASE_URL.*\/subscription/i.test(text);
}

/**
 * Verifica si un template tiene variables con sintaxis incorrecta
 */
function hasIncorrectSyntax(text) {
  if (!text || typeof text !== 'string') return false;
  return /\$\{[^}]+\}/.test(text);
}

/**
 * Procesa y corrige un template
 */
async function fixTemplate(template, dryRun = true) {
  const changes = [];
  let needsUpdate = false;

  // Verificar sintaxis de variables en subject
  if (hasIncorrectSyntax(template.subject)) {
    changes.push({
      type: 'variables',
      field: 'subject',
      before: template.subject.substring(0, 100),
      after: convertVariableSyntax(template.subject).substring(0, 100)
    });
    needsUpdate = true;
  }

  // Verificar URLs incorrectas en subject
  if (hasIncorrectURLs(template.subject)) {
    changes.push({
      type: 'urls',
      field: 'subject',
      issue: 'URL incorrecta encontrada'
    });
    needsUpdate = true;
  }

  // Verificar sintaxis de variables en htmlBody
  if (hasIncorrectSyntax(template.htmlBody)) {
    changes.push({
      type: 'variables',
      field: 'htmlBody',
      variablesFound: (template.htmlBody.match(/\$\{[^}]+\}/g) || []).length
    });
    needsUpdate = true;
  }

  // Verificar URLs incorrectas en htmlBody
  if (hasIncorrectURLs(template.htmlBody)) {
    const urlMatches = (template.htmlBody.match(/lawanalytics\.app\/subscription/gi) || []).length;
    changes.push({
      type: 'urls',
      field: 'htmlBody',
      urlsFound: urlMatches
    });
    needsUpdate = true;
  }

  // Verificar sintaxis de variables en textBody
  if (hasIncorrectSyntax(template.textBody)) {
    changes.push({
      type: 'variables',
      field: 'textBody',
      variablesFound: (template.textBody.match(/\$\{[^}]+\}/g) || []).length
    });
    needsUpdate = true;
  }

  // Verificar URLs incorrectas en textBody
  if (hasIncorrectURLs(template.textBody)) {
    const urlMatches = (template.textBody.match(/lawanalytics\.app\/subscription/gi) || []).length;
    changes.push({
      type: 'urls',
      field: 'textBody',
      urlsFound: urlMatches
    });
    needsUpdate = true;
  }

  if (needsUpdate) {
    logger.info(`\n📧 Template: ${template.name}`);
    logger.info(`   Categoría: ${template.category}`);
    logger.info(`   Cambios necesarios:`);

    changes.forEach(change => {
      if (change.type === 'variables') {
        if (change.before) {
          logger.info(`   - ${change.field} (variables):`);
          logger.info(`     ANTES: ${change.before}`);
          logger.info(`     DESPUÉS: ${change.after}`);
        } else {
          logger.info(`   - ${change.field}: ${change.variablesFound} variables a convertir`);
        }
      } else if (change.type === 'urls') {
        if (change.urlsFound) {
          logger.info(`   - ${change.field}: ${change.urlsFound} URLs incorrectas a corregir`);
        } else {
          logger.info(`   - ${change.field}: ${change.issue}`);
        }
      }
    });

    if (!dryRun) {
      // Aplicar correcciones de sintaxis de variables
      template.subject = convertVariableSyntax(template.subject);
      template.htmlBody = convertVariableSyntax(template.htmlBody);
      template.textBody = convertVariableSyntax(template.textBody);

      // Aplicar correcciones de URLs
      template.subject = fixIncorrectURLs(template.subject);
      template.htmlBody = fixIncorrectURLs(template.htmlBody);
      template.textBody = fixIncorrectURLs(template.textBody);

      await template.save();
      logger.info(`   ✅ Template actualizado\n`);
    } else {
      logger.info(`   ⏭️  DRY RUN - No se guardaron cambios\n`);
    }

    return { template: template.name, changes: changes.length };
  }

  return null;
}

/**
 * Función principal
 */
async function main() {
  try {
    const dryRun = process.argv.includes('--dry-run') || !process.argv.includes('--apply');

    logger.info('🔍 Verificando templates de email...');
    logger.info(`   Modo: ${dryRun ? 'DRY RUN (solo verificación)' : 'APLICAR CAMBIOS'}\n`);

    // Conectar a MongoDB
    const mongoUrl = process.env.MONGODB_URI || process.env.URLDB;
    if (!mongoUrl) {
      throw new Error('MONGODB_URI o URLDB no está definido en las variables de entorno');
    }

    await mongoose.connect(mongoUrl);

    logger.info('✅ Conectado a MongoDB\n');

    // Buscar todos los templates activos
    const templates = await EmailTemplate.find({ isActive: true });

    logger.info(`📊 Se encontraron ${templates.length} templates activos\n`);

    const results = [];

    for (const template of templates) {
      const result = await fixTemplate(template, dryRun);
      if (result) {
        results.push(result);
      }
    }

    // Resumen
    logger.info('\n' + '='.repeat(60));
    logger.info('📋 RESUMEN');
    logger.info('='.repeat(60));
    logger.info(`Templates verificados: ${templates.length}`);
    logger.info(`Templates con problemas: ${results.length}`);

    if (results.length > 0) {
      logger.info('\nTemplates afectados:');
      results.forEach(r => {
        logger.info(`  - ${r.template}: ${r.changes} cambios`);
      });

      if (dryRun) {
        logger.info('\n⚠️  Para aplicar los cambios, ejecuta:');
        logger.info('   node scripts/fixTemplateVariables.js --apply');
      } else {
        logger.info('\n✅ Todos los cambios han sido aplicados');
      }
    } else {
      logger.info('\n✅ Todos los templates tienen la sintaxis correcta');
    }

    await mongoose.disconnect();
    logger.info('\n✅ Proceso completado');
    process.exit(0);

  } catch (error) {
    logger.error('❌ Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Ejecutar
main();
