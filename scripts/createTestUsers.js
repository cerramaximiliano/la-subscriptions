#!/usr/bin/env node

/**
 * Script para crear usuarios de prueba controlados
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const User = require('../models/User');
const Subscription = require('../models/Subscription');

// Usuarios de prueba predefinidos
const TEST_USERS = [
  {
    email: 'test.payments@example.com',
    nombre: 'Test Payments',
    password: 'Test123456!',
    stripeCustomerId: 'cus_test_payments_001',
    subscriptionPlan: 'premium',
    testUser: true
  },
  {
    email: 'test.admin@example.com',
    nombre: 'Test Admin',
    password: 'Test123456!',
    stripeCustomerId: 'cus_test_admin_001',
    subscriptionPlan: 'premium',
    testUser: true
  },
  {
    email: process.env.ADMIN_EMAIL || 'admin@company.com',
    nombre: 'Admin Real',
    password: 'Test123456!',
    stripeCustomerId: 'cus_test_admin_real',
    subscriptionPlan: 'premium',
    testUser: true
  }
];

async function createTestUsers() {
  try {
    // Conectar a MongoDB
    await mongoose.connect(process.env.MONGODB_URI || process.env.URLDB);
    console.log('✅ Conectado a MongoDB');

    for (const userData of TEST_USERS) {
      // Verificar si el usuario ya existe
      let user = await User.findOne({ email: userData.email });
      
      if (!user) {
        // Crear usuario
        user = await User.create({
          ...userData,
          isVerified: true,
          isActive: true,
          metadata: {
            isTestUser: true,
            createdForTesting: true,
            createdAt: new Date()
          }
        });
        console.log(`✅ Usuario de prueba creado: ${user.email}`);
      } else {
        // Actualizar metadata
        user.metadata = {
          ...user.metadata,
          isTestUser: true
        };
        user.stripeCustomerId = userData.stripeCustomerId;
        await user.save();
        console.log(`📝 Usuario actualizado: ${user.email}`);
      }

      // Crear o actualizar suscripción
      let subscription = await Subscription.findOne({ user: user._id });
      
      if (!subscription) {
        subscription = await Subscription.create({
          user: user._id,
          stripeSubscriptionId: `sub_test_${user._id}`,
          stripeCustomerId: user.stripeCustomerId,
          plan: userData.subscriptionPlan,
          status: 'active',
          accountStatus: 'active',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          metadata: {
            isTestSubscription: true
          }
        });
        console.log(`✅ Suscripción de prueba creada para: ${user.email}`);
      }
    }

    console.log('\n📧 Usuarios de prueba disponibles:');
    TEST_USERS.forEach(u => {
      console.log(`  - ${u.email} (Customer: ${u.stripeCustomerId})`);
    });

    console.log('\n💡 Usa estos customer IDs en tus pruebas con Stripe CLI:');
    console.log('stripe trigger invoice.payment_failed --customer cus_test_payments_001');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

// Ejecutar
createTestUsers();