#!/usr/bin/env node

/**
 * Script para encontrar el template de período de gracia
 */

require('dotenv').config();
const mongoose = require('mongoose');
const EmailTemplate = require('../models/EmailTemplate');

async function main() {
  try {
    const mongoUrl = process.env.MONGODB_URI || process.env.URLDB;
    await mongoose.connect(mongoUrl);

    console.log('✅ Conectado a MongoDB\n');

    // Buscar template con el subject que contiene "período de gracia vence"
    const template = await EmailTemplate.findOne({
      subject: { $regex: /período de gracia vence.*daysRemaining/i }
    });

    if (template) {
      console.log('📧 Template encontrado:');
      console.log('   ID:', template._id);
      console.log('   Name:', template.name);
      console.log('   Category:', template.category);
      console.log('   Subject:', template.subject);
      console.log('\n   HTML Body (primeros 500 caracteres):');
      console.log('   ', template.htmlBody.substring(0, 500));
      console.log('\n   Variables encontradas:');

      const vars = template.htmlBody.match(/\$\{[^}]+\}/g) || [];
      vars.forEach(v => console.log('   -', v));

      console.log('\n   URLs encontradas:');
      const urls = template.htmlBody.match(/https?:\/\/[^\s"'<>]+/g) || [];
      urls.forEach(u => console.log('   -', u));
    } else {
      console.log('❌ No se encontró el template');
    }

    await mongoose.disconnect();
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

main();
