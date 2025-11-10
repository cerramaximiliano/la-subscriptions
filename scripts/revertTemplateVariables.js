#!/usr/bin/env node

/**
 * Script para revertir la corrección de sintaxis de variables en templates de email
 * Convierte {{variable}} de vuelta a ${variable}
 */

require('dotenv').config();
const mongoose = require('mongoose');
const EmailTemplate = require('../models/EmailTemplate');
const logger = require('../utils/logger');

/**
 * Revierte {{variable}} a ${variable} en un texto
 */
function revertVariableSyntax(text) {
  if (!text || typeof text !== 'string') return text;

  // Reemplazar {{variable}} por ${variable}
  // Usar regex para encontrar todas las ocurrencias
  return text.replace(/\{\{([^}]+)\}\}/g, '\${$1}');
}

/**
 * Revierte URLs corregidas a la versión anterior
 */
function revertURLs(text) {
  if (!text || typeof text !== 'string') return text;

  // Revertir la URL corregida a la anterior
  return text.replace(/https:\/\/lawanalytics\.app\/apps\/profiles\/account\/settings/gi,
                      'https://lawanalytics.app/subscription');
}

/**
 * Verifica si un template tiene variables con sintaxis {{variable}}
 */
function hasHandlebarsSyntax(text) {
  if (!text || typeof text !== 'string') return false;
  return /\{\{[^}]+\}\}/.test(text);
}

/**
 * Verifica si un template tiene la URL corregida
 */
function hasCorrectedURL(text) {
  if (!text || typeof text !== 'string') return false;
  return /lawanalytics\.app\/apps\/profiles\/account\/settings/i.test(text);
}

/**
 * Procesa y revierte un template
 */
async function revertTemplate(template, dryRun = true) {
  const changes = [];
  let needsUpdate = false;

  // Verificar sintaxis de variables en subject
  if (hasHandlebarsSyntax(template.subject)) {
    changes.push({
      type: 'variables',
      field: 'subject',
      before: template.subject.substring(0, 100),
      after: revertVariableSyntax(template.subject).substring(0, 100)
    });
    needsUpdate = true;
  }

  // Verificar URL corregida en subject
  if (hasCorrectedURL(template.subject)) {
    changes.push({
      type: 'urls',
      field: 'subject',
      issue: 'URL corregida encontrada'
    });
    needsUpdate = true;
  }

  // Verificar sintaxis de variables en htmlBody
  if (hasHandlebarsSyntax(template.htmlBody)) {
    changes.push({
      type: 'variables',
      field: 'htmlBody',
      variablesFound: (template.htmlBody.match(/\{\{[^}]+\}\}/g) || []).length
    });
    needsUpdate = true;
  }

  // Verificar URL corregida en htmlBody
  if (hasCorrectedURL(template.htmlBody)) {
    const urlMatches = (template.htmlBody.match(/lawanalytics\.app\/apps\/profiles\/account\/settings/gi) || []).length;
    changes.push({
      type: 'urls',
      field: 'htmlBody',
      urlsFound: urlMatches
    });
    needsUpdate = true;
  }

  // Verificar sintaxis de variables en textBody
  if (hasHandlebarsSyntax(template.textBody)) {
    changes.push({
      type: 'variables',
      field: 'textBody',
      variablesFound: (template.textBody.match(/\{\{[^}]+\}\}/g) || []).length
    });
    needsUpdate = true;
  }

  // Verificar URL corregida en textBody
  if (hasCorrectedURL(template.textBody)) {
    const urlMatches = (template.textBody.match(/lawanalytics\.app\/apps\/profiles\/account\/settings/gi) || []).length;
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
    logger.info(`   Cambios a revertir:`);

    changes.forEach(change => {
      if (change.type === 'variables') {
        if (change.before) {
          logger.info(`   - ${change.field} (variables):`);
          logger.info(`     ANTES: ${change.before}`);
          logger.info(`     DESPUÉS: ${change.after}`);
        } else {
          logger.info(`   - ${change.field}: ${change.variablesFound} variables a revertir`);
        }
      } else if (change.type === 'urls') {
        if (change.urlsFound) {
          logger.info(`   - ${change.field}: ${change.urlsFound} URLs a revertir`);
        } else {
          logger.info(`   - ${change.field}: ${change.issue}`);
        }
      }
    });

    if (!dryRun) {
      // Aplicar reversión de sintaxis de variables
      template.subject = revertVariableSyntax(template.subject);
      template.htmlBody = revertVariableSyntax(template.htmlBody);
      template.textBody = revertVariableSyntax(template.textBody);

      // Aplicar reversión de URLs
      template.subject = revertURLs(template.subject);
      template.htmlBody = revertURLs(template.htmlBody);
      template.textBody = revertURLs(template.textBody);

      await template.save();
      logger.info(`   ✅ Template revertido\n`);
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

    logger.info('🔄 Revirtiendo cambios en templates de email...');
    logger.info(`   Modo: ${dryRun ? 'DRY RUN (solo verificación)' : 'APLICAR REVERSIÓN'}\n`);

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
      const result = await revertTemplate(template, dryRun);
      if (result) {
        results.push(result);
      }
    }

    // Resumen
    logger.info('\n' + '='.repeat(60));
    logger.info('📋 RESUMEN DE REVERSIÓN');
    logger.info('='.repeat(60));
    logger.info(`Templates verificados: ${templates.length}`);
    logger.info(`Templates a revertir: ${results.length}`);

    if (results.length > 0) {
      logger.info('\nTemplates afectados:');
      results.forEach(r => {
        logger.info(`  - ${r.template}: ${r.changes} cambios a revertir`);
      });

      if (dryRun) {
        logger.info('\n⚠️  Para aplicar la reversión, ejecuta:');
        logger.info('   node scripts/revertTemplateVariables.js --apply');
      } else {
        logger.info('\n✅ Todos los cambios han sido revertidos');
      }
    } else {
      logger.info('\n✅ No hay cambios para revertir');
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
