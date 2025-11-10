#!/usr/bin/env node

/**
 * Script de depuración para verificar qué pudo fallar en el conteo de recursos
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Folder = require('../models/Folder');
const Calculator = require('../models/Calculator');
const Contact = require('../models/Contact');

async function debugResourceCount() {
  try {
    const mongoUrl = process.env.MONGODB_URI || process.env.URLDB;
    await mongoose.connect(mongoUrl);
    console.log('✅ Conectado a MongoDB\n');

    const userEmail = 'maximilian@rumba-dev.com';
    const User = require('../models/User');
    const user = await User.findOne({ email: userEmail });

    if (!user) {
      console.error('❌ Usuario no encontrado');
      process.exit(1);
    }

    const userId = user._id;
    console.log('👤 Usuario:', userEmail);
    console.log('   ID:', userId);
    console.log('   ID tipo:', typeof userId, '\n');

    // ==========================================
    // TEST 1: FOLDERS
    // ==========================================
    console.log('='.repeat(60));
    console.log('📁 FOLDERS - Pruebas de conteo');
    console.log('='.repeat(60));

    // Diferentes criterios
    const foldersTest1 = await Folder.countDocuments({
      userId: userId,
      archived: { $ne: true }
    });
    console.log(`1. archived: { $ne: true } → ${foldersTest1}`);

    const foldersTest2 = await Folder.countDocuments({
      userId: userId,
      archived: false
    });
    console.log(`2. archived: false → ${foldersTest2}`);

    const foldersTest3 = await Folder.countDocuments({
      userId: userId,
      $or: [
        { archived: false },
        { archived: null },
        { archived: { $exists: false } }
      ]
    });
    console.log(`3. archived: false|null|no existe → ${foldersTest3}`);

    const foldersTest4 = await Folder.countDocuments({
      userId: userId
    });
    console.log(`4. Total (sin filtro archived) → ${foldersTest4}`);

    // Distribución de valores
    console.log('\n📊 Distribución de valores de archived:');
    const foldersDist = await Folder.aggregate([
      { $match: { userId: userId } },
      { $group: {
        _id: '$archived',
        count: { $sum: 1 }
      }},
      { $sort: { _id: 1 } }
    ]);
    foldersDist.forEach(d => {
      console.log(`   archived = ${d._id}: ${d.count} documentos`);
    });

    // ==========================================
    // TEST 2: CALCULATORS
    // ==========================================
    console.log('\n' + '='.repeat(60));
    console.log('🧮 CALCULATORS - Pruebas de conteo');
    console.log('='.repeat(60));

    // Con userId (ObjectId)
    const calcTest1 = await Calculator.countDocuments({
      userId: userId,
      archived: { $ne: true },
      type: 'Calculado'
    });
    console.log(`1. userId (ObjectId), archived: { $ne: true } → ${calcTest1}`);

    // Con user (String)
    const calcTest2 = await Calculator.countDocuments({
      user: userId.toString(),
      archived: { $ne: true },
      type: 'Calculado'
    });
    console.log(`2. user (String), archived: { $ne: true } → ${calcTest2}`);

    // Sin tipo
    const calcTest3 = await Calculator.countDocuments({
      userId: userId,
      archived: { $ne: true }
    });
    console.log(`3. userId, sin filtro type → ${calcTest3}`);

    // Con archived: false
    const calcTest4 = await Calculator.countDocuments({
      userId: userId,
      archived: false,
      type: 'Calculado'
    });
    console.log(`4. userId, archived: false → ${calcTest4}`);

    // Total
    const calcTest5 = await Calculator.countDocuments({
      userId: userId
    });
    console.log(`5. Total (sin filtros) → ${calcTest5}`);

    // Distribución
    console.log('\n📊 Distribución de valores:');
    const calcDist = await Calculator.aggregate([
      { $match: { userId: userId } },
      { $group: {
        _id: { archived: '$archived', type: '$type' },
        count: { $sum: 1 }
      }},
      { $sort: { '_id.archived': 1, '_id.type': 1 } }
    ]);
    calcDist.forEach(d => {
      console.log(`   archived = ${d._id.archived}, type = ${d._id.type}: ${d.count} documentos`);
    });

    // Verificar si existen docs con campo 'user'
    const calcWithUser = await Calculator.countDocuments({
      user: { $exists: true, $ne: null }
    });
    console.log(`\n⚠️  Calculators con campo 'user' poblado: ${calcWithUser}`);

    // ==========================================
    // TEST 3: CONTACTS
    // ==========================================
    console.log('\n' + '='.repeat(60));
    console.log('👥 CONTACTS - Pruebas de conteo');
    console.log('='.repeat(60));

    const contactsTest1 = await Contact.countDocuments({
      userId: userId,
      archived: { $ne: true }
    });
    console.log(`1. archived: { $ne: true } → ${contactsTest1}`);

    const contactsTest2 = await Contact.countDocuments({
      userId: userId,
      archived: false
    });
    console.log(`2. archived: false → ${contactsTest2}`);

    const contactsTest3 = await Contact.countDocuments({
      userId: userId
    });
    console.log(`3. Total (sin filtro archived) → ${contactsTest3}`);

    // Distribución
    console.log('\n📊 Distribución de valores de archived:');
    const contactsDist = await Contact.aggregate([
      { $match: { userId: userId } },
      { $group: {
        _id: '$archived',
        count: { $sum: 1 }
      }},
      { $sort: { _id: 1 } }
    ]);
    contactsDist.forEach(d => {
      console.log(`   archived = ${d._id}: ${d.count} documentos`);
    });

    // ==========================================
    // RESUMEN FINAL
    // ==========================================
    console.log('\n' + '='.repeat(60));
    console.log('📋 RESUMEN - Conteo usado en gracePeriodProcessor.js');
    console.log('='.repeat(60));
    console.log(`Folders: ${foldersTest1} activas (usando archived: { $ne: true })`);
    console.log(`Calculators: ${calcTest1} activas (usando userId y archived: { $ne: true })`);
    console.log(`Contacts: ${contactsTest1} activos (usando archived: { $ne: true })`);

    console.log('\n📦 Cálculo de exceso (plan FREE):');
    const limits = { maxFolders: 5, maxCalculators: 3, maxContacts: 10 };
    const foldersToArchive = Math.max(0, foldersTest1 - limits.maxFolders);
    const calculatorsToArchive = Math.max(0, calcTest1 - limits.maxCalculators);
    const contactsToArchive = Math.max(0, contactsTest1 - limits.maxContacts);

    console.log(`   Carpetas a archivar: ${foldersToArchive} (${foldersTest1} - ${limits.maxFolders})`);
    console.log(`   Calculadoras a archivar: ${calculatorsToArchive} (${calcTest1} - ${limits.maxCalculators})`);
    console.log(`   Contactos a archivar: ${contactsToArchive} (${contactsTest1} - ${limits.maxContacts})`);

    const hasExcess = (foldersToArchive > 0 || calculatorsToArchive > 0 || contactsToArchive > 0);
    console.log(`\n🎯 ¿Excede límites?: ${hasExcess ? '✅ SÍ' : '❌ NO'}`);
    console.log(`📧 Template correcto: ${hasExcess ? 'gracePeriodReminderWithExcess' : 'gracePeriodReminderNoExcess'}`);

    // ==========================================
    // POSIBLES PROBLEMAS
    // ==========================================
    console.log('\n' + '='.repeat(60));
    console.log('⚠️  ANÁLISIS DE POSIBLES PROBLEMAS');
    console.log('='.repeat(60));

    if (foldersTest1 !== foldersTest2) {
      console.log(`❌ FOLDERS: Diferencia entre archived: {$ne: true} (${foldersTest1}) y archived: false (${foldersTest2})`);
      console.log(`   → Hay ${foldersTest1 - foldersTest2} documentos con archived: null o sin campo`);
    }

    if (calcTest1 === 0 && calcTest3 > 0) {
      console.log(`❌ CALCULATORS: No encuentra con type: 'Calculado'`);
      console.log(`   → Sin filtro type hay ${calcTest3} documentos`);
    }

    if (calcTest1 === 0 && calcTest2 > 0) {
      console.log(`❌ CALCULATORS: Usa campo 'user' en lugar de 'userId'`);
      console.log(`   → Con 'user' encuentra ${calcTest2} documentos`);
    }

    if (contactsTest1 !== contactsTest2) {
      console.log(`❌ CONTACTS: Diferencia entre archived: {$ne: true} (${contactsTest1}) y archived: false (${contactsTest2})`);
      console.log(`   → Hay ${contactsTest1 - contactsTest2} documentos con archived: null o sin campo`);
    }

    if (foldersTest1 === foldersTest2 && calcTest1 === calcTest2 && contactsTest1 === contactsTest2) {
      console.log('✅ No se detectaron inconsistencias en los criterios de conteo');
      console.log('   El conteo debería funcionar correctamente');
    }

    await mongoose.disconnect();
    console.log('\n✅ Análisis completado');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

debugResourceCount();
