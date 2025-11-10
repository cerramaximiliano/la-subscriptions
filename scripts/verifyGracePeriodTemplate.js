#!/usr/bin/env node

/**
 * Script para verificar el template gracePeriodReminderWithExcess en detalle
 */

require('dotenv').config();
const mongoose = require('mongoose');
const EmailTemplate = require('../models/EmailTemplate');

async function main() {
  try {
    const mongoUrl = process.env.MONGODB_URI || process.env.URLDB;
    await mongoose.connect(mongoUrl);

    console.log('✅ Conectado a MongoDB\n');

    const template = await EmailTemplate.findOne({
      name: 'gracePeriodReminderWithExcess'
    });

    if (!template) {
      throw new Error('Template no encontrado');
    }

    console.log('📧 Template: gracePeriodReminderWithExcess');
    console.log('   ID:', template._id);
    console.log('   Category:', template.category);
    console.log('\n📝 SUBJECT:');
    console.log('  ', template.subject);

    console.log('\n🔍 Variables en SUBJECT:');
    const varsSubject = template.subject.match(/\{\{[^}]+\}\}/g) || [];
    if (varsSubject.length > 0) {
      varsSubject.forEach(v => console.log('   ✅', v));
    } else {
      console.log('   ❌ No se encontraron variables {{}}');
    }

    console.log('\n🔍 Variables en HTML BODY:');
    const varsHtml = template.htmlBody.match(/\{\{[^}]+\}\}/g) || [];
    if (varsHtml.length > 0) {
      const uniqueVars = [...new Set(varsHtml)];
      uniqueVars.forEach(v => console.log('   ✅', v));
    } else {
      console.log('   ❌ No se encontraron variables {{}}');
    }

    console.log('\n🔍 Variables en TEXT BODY:');
    const varsText = template.textBody.match(/\{\{[^}]+\}\}/g) || [];
    if (varsText.length > 0) {
      const uniqueVars = [...new Set(varsText)];
      uniqueVars.forEach(v => console.log('   ✅', v));
    } else {
      console.log('   ❌ No se encontraron variables {{}}');
    }

    console.log('\n🔗 URLs en HTML BODY:');
    const urlsHtml = template.htmlBody.match(/https?:\/\/[^\s"'<>]+/g) || [];
    if (urlsHtml.length > 0) {
      const uniqueUrls = [...new Set(urlsHtml)];
      uniqueUrls.forEach(url => {
        if (url.includes('/apps/profiles/account/settings')) {
          console.log('   ✅', url);
        } else {
          console.log('   ⚠️ ', url);
        }
      });
    } else {
      console.log('   ❌ No se encontraron URLs');
    }

    console.log('\n🔗 URLs en TEXT BODY:');
    const urlsText = template.textBody.match(/https?:\/\/[^\s"'<>]+/g) || [];
    if (urlsText.length > 0) {
      const uniqueUrls = [...new Set(urlsText)];
      uniqueUrls.forEach(url => {
        if (url.includes('/apps/profiles/account/settings')) {
          console.log('   ✅', url);
        } else {
          console.log('   ⚠️ ', url);
        }
      });
    } else {
      console.log('   ❌ No se encontraron URLs');
    }

    // Verificar sintaxis incorrecta
    console.log('\n⚠️  VERIFICACIÓN DE SINTAXIS INCORRECTA:');
    const oldSyntaxSubject = template.subject.match(/\$\{[^}]+\}/g) || [];
    const oldSyntaxHtml = template.htmlBody.match(/\$\{[^}]+\}/g) || [];
    const oldSyntaxText = template.textBody.match(/\$\{[^}]+\}/g) || [];

    if (oldSyntaxSubject.length > 0) {
      console.log('   ❌ Subject tiene variables con sintaxis ${}: ', oldSyntaxSubject);
    }
    if (oldSyntaxHtml.length > 0) {
      console.log('   ❌ HTML Body tiene variables con sintaxis ${}: ', oldSyntaxHtml.length, 'ocurrencias');
    }
    if (oldSyntaxText.length > 0) {
      console.log('   ❌ Text Body tiene variables con sintaxis ${}: ', oldSyntaxText.length, 'ocurrencias');
    }

    if (oldSyntaxSubject.length === 0 && oldSyntaxHtml.length === 0 && oldSyntaxText.length === 0) {
      console.log('   ✅ No hay variables con sintaxis incorrecta ${}');
    }

    console.log('\n✅ Verificación completada');

    await mongoose.disconnect();
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

main();
