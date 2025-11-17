#!/usr/bin/env node

/**
 * Script de diagnóstico para eventos invoice.payment_failed
 *
 * Este script ayuda a diagnosticar por qué no se está procesando
 * correctamente el evento de pago fallido.
 */

require('dotenv').config();
const mongoose = require('mongoose');

async function diagnosePaymentFailed() {
  try {
    // Conectar a MongoDB
    await mongoose.connect(process.env.URLDB);
    console.log('✅ Conectado a MongoDB');

    const Subscription = require('../models/Subscription');

    // Buscar la suscripción de TEST más reciente con status past_due
    console.log('\n🔍 Buscando suscripción en estado past_due...\n');

    const subscription = await Subscription.findOne({
      testMode: true,
      status: 'past_due'
    }).sort({ updatedAt: -1 });

    if (!subscription) {
      console.log('❌ No se encontró ninguna suscripción en estado past_due');
      process.exit(0);
    }

    console.log('📋 Suscripción encontrada:');
    console.log('   - _id:', subscription._id);
    console.log('   - user:', subscription.user);
    console.log('   - plan:', subscription.plan);
    console.log('   - status:', subscription.status);
    console.log('   - accountStatus:', subscription.accountStatus);
    console.log('   - testMode:', subscription.testMode);
    console.log('   - stripeSubscriptionId:', JSON.stringify(subscription.stripeSubscriptionId, null, 2));
    console.log('   - stripeCustomerId:', JSON.stringify(subscription.stripeCustomerId, null, 2));
    console.log('   - paymentFailures.count:', subscription.paymentFailures?.count || 0);
    console.log('   - canceledAt:', subscription.canceledAt);
    console.log('   - downgradeGracePeriod:', JSON.stringify(subscription.downgradeGracePeriod, null, 2));

    // Simular búsqueda como lo hace el webhook actual (INCORRECTA)
    console.log('\n🔧 Probando búsqueda INCORRECTA (actual):');
    const testSubId = subscription.stripeSubscriptionId?.test || subscription.stripeSubscriptionId;
    console.log('   - Buscando con stripeSubscriptionId:', testSubId);

    const wrongSearch = await Subscription.findOne({
      stripeSubscriptionId: testSubId
    });
    console.log('   - Resultado:', wrongSearch ? '✅ Encontrado' : '❌ NO encontrado');

    // Simular búsqueda CORRECTA
    console.log('\n✅ Probando búsqueda CORRECTA (con objeto):');
    console.log('   - Buscando con "stripeSubscriptionId.test":', testSubId);

    const correctSearch = await Subscription.findOne({
      'stripeSubscriptionId.test': testSubId
    });
    console.log('   - Resultado:', correctSearch ? '✅ Encontrado' : '❌ NO encontrado');

    // Verificar estructura del modelo
    console.log('\n📊 Análisis de estructura:');
    console.log('   - Tipo de stripeSubscriptionId:', typeof subscription.stripeSubscriptionId);
    console.log('   - Es objeto:', subscription.stripeSubscriptionId && typeof subscription.stripeSubscriptionId === 'object');
    console.log('   - Tiene clave "test":', subscription.stripeSubscriptionId?.hasOwnProperty('test'));
    console.log('   - Tiene clave "live":', subscription.stripeSubscriptionId?.hasOwnProperty('live'));

    // Recomendaciones
    console.log('\n💡 Recomendaciones:');
    if (subscription.stripeSubscriptionId && typeof subscription.stripeSubscriptionId === 'object') {
      console.log('   ⚠️  stripeSubscriptionId es un OBJETO, no un string');
      console.log('   ✅ Usar búsqueda: { "stripeSubscriptionId.test": invoiceSubscriptionId }');
      console.log('   ✅ O para LIVE: { "stripeSubscriptionId.live": invoiceSubscriptionId }');
    }

    // Verificar si está cancelada
    if (subscription.canceledAt) {
      console.log('\n⚠️  ADVERTENCIA: La suscripción tiene canceledAt:', subscription.canceledAt);
      console.log('   - El webhook puede estar saltando el procesamiento por esta razón');
      console.log('   - Revisar línea 698-701 en webhookController.js');
    }

    // Verificar estado
    if (subscription.status === 'canceled') {
      console.log('\n🛑 PROBLEMA: status es "canceled"');
      console.log('   - El webhook SKIP el procesamiento en línea 698-701');
      console.log('   - Necesita corregirse el flujo de cancelación vs. past_due');
    }

    await mongoose.connection.close();
    console.log('\n✅ Diagnóstico completado');

  } catch (error) {
    console.error('❌ Error en diagnóstico:', error);
    process.exit(1);
  }
}

diagnosePaymentFailed();
