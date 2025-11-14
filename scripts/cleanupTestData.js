#!/usr/bin/env node

/**
 * Script para limpiar datos de TEST
 * Elimina todas las suscripciones marcadas con testMode: true
 * y resetea contadores de testing
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Subscription = require('../models/Subscription');

async function cleanupTestData() {
  try {
    console.log('🧹 LIMPIEZA DE DATOS DE TEST');
    console.log('======================================\n');

    // Conectar a MongoDB
    console.log('📊 Conectando a MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || process.env.URLDB);
    console.log('✅ Conectado a MongoDB\n');

    // Contar suscripciones TEST antes de limpiar
    const testSubscriptions = await Subscription.find({ testMode: true });
    console.log(`📋 Suscripciones TEST encontradas: ${testSubscriptions.length}\n`);

    if (testSubscriptions.length === 0) {
      console.log('✅ No hay datos de TEST para limpiar\n');
      await mongoose.disconnect();
      return;
    }

    // Mostrar detalles de las suscripciones TEST
    console.log('📝 Detalle de suscripciones TEST:');
    for (const sub of testSubscriptions) {
      const user = await sub.populate('user');
      console.log(`   - ${user.user?.email || 'Usuario no encontrado'}`);
      console.log(`     Plan: ${sub.plan}`);
      console.log(`     Status: ${sub.status}`);
      console.log(`     AccountStatus: ${sub.accountStatus}`);
      console.log(`     Payment Failures: ${sub.paymentFailures?.count || 0}`);
      console.log(`     Grace Period: ${sub.downgradeGracePeriod?.expiresAt ? 'Activo' : 'Inactivo'}`);
      console.log('');
    }

    // Confirmar limpieza
    console.log('\n⚠️  ATENCIÓN: Esta acción eliminará todos los datos de TEST');
    console.log('¿Deseas continuar? (y/n)');

    // En modo no interactivo, mostrar lo que se haría
    if (process.argv.includes('--dry-run')) {
      console.log('\n[DRY RUN] Modo simulación activado - No se modificarán datos\n');
      console.log('Operaciones que se realizarían:');
      console.log(`✓ Eliminar ${testSubscriptions.length} suscripciones TEST`);
      console.log('✓ Los datos de usuarios NO se eliminarán (solo la relación con Stripe TEST)');
      await mongoose.disconnect();
      return;
    }

    // Si se pasa --force, ejecutar sin confirmación
    if (!process.argv.includes('--force')) {
      console.log('\n💡 Para ejecutar sin confirmación usa: --force');
      console.log('💡 Para simular sin cambios usa: --dry-run\n');
      await mongoose.disconnect();
      return;
    }

    // Ejecutar limpieza
    console.log('\n🗑️  Eliminando suscripciones TEST...');

    // Opción 1: Eliminar completamente las suscripciones TEST
    // const deleteResult = await Subscription.deleteMany({ testMode: true });
    // console.log(`✅ Eliminadas ${deleteResult.deletedCount} suscripciones TEST\n`);

    // Opción 2: Solo resetear los campos (RECOMENDADO para mantener historial)
    const updateResult = await Subscription.updateMany(
      { testMode: true },
      {
        $set: {
          testMode: false,
          'paymentFailures.count': 0,
          'paymentFailures.firstFailedAt': null,
          'paymentFailures.lastFailedAt': null,
          'paymentFailures.lastFailureReason': null,
          'paymentFailures.lastFailureCode': null,
          'paymentFailures.nextRetryAt': null,
          'paymentFailures.notificationsSent.firstWarning.sent': false,
          'paymentFailures.notificationsSent.secondWarning.sent': false,
          'paymentFailures.notificationsSent.finalWarning.sent': false,
          'paymentFailures.notificationsSent.suspensionNotice.sent': false,
          accountStatus: 'active',
          downgradeGracePeriod: null
        }
      }
    );

    console.log(`✅ Reseteadas ${updateResult.modifiedCount} suscripciones TEST`);
    console.log('   - paymentFailures.count → 0');
    console.log('   - accountStatus → active');
    console.log('   - downgradeGracePeriod → null');
    console.log('   - testMode → false\n');

    console.log('======================================');
    console.log('✅ LIMPIEZA COMPLETADA\n');

    await mongoose.disconnect();
    console.log('👋 Desconectado de MongoDB');

  } catch (error) {
    console.error('❌ Error en limpieza:', error);
    process.exit(1);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  cleanupTestData()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = cleanupTestData;
