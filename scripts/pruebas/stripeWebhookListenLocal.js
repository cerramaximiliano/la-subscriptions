#!/usr/bin/env node

// Script alternativo para escuchar webhooks sin Stripe CLI
// Útil cuando hay problemas con la autenticación del CLI

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const express = require('express');
const bodyParser = require('body-parser');
const stripe = require('stripe')(process.env.STRIPE_API_KEY_DEV);

const app = express();
const PORT = 3001; // Puerto diferente para no interferir

// Configuración
const WEBHOOK_URL = process.env.WEBHOOK_URL_SUBSCRIPTION_API || 'http://localhost:5001/api/webhook';
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET_DEV;

console.log('🚀 Iniciando servidor local de reenvío de webhooks...\n');
console.log(`📌 Este servidor recibirá webhooks en: http://localhost:${PORT}/stripe/webhook`);
console.log(`📤 Y los reenviará a: ${WEBHOOK_URL}`);
console.log('\n⚠️  IMPORTANTE: Configura este URL en tu dashboard de Stripe:');
console.log(`   https://[tu-ngrok-url]/stripe/webhook`);
console.log('   O usa ngrok: ngrok http 3001\n');

// Middleware para capturar el body raw
app.use('/stripe/webhook', bodyParser.raw({ type: 'application/json' }));

// Endpoint que recibe webhooks
app.post('/stripe/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const body = req.body;
  
  console.log(`\n📨 Webhook recibido: ${new Date().toLocaleTimeString()}`);
  
  try {
    // Verificar la firma si tenemos el secret
    let event;
    if (WEBHOOK_SECRET && sig) {
      event = stripe.webhooks.constructEvent(body, sig, WEBHOOK_SECRET);
      console.log(`✅ Firma verificada`);
    } else {
      event = JSON.parse(body);
      console.log(`⚠️  Sin verificación de firma`);
    }
    
    console.log(`📌 Tipo: ${event.type}`);
    console.log(`🆔 ID: ${event.id}`);
    
    // Reenviar al webhook real
    const axios = require('axios');
    const crypto = require('crypto');
    
    // Generar firma para el reenvío
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = body.toString();
    const signedPayload = `${timestamp}.${payload}`;
    const signature = crypto
      .createHmac('sha256', WEBHOOK_SECRET || 'test_secret')
      .update(signedPayload)
      .digest('hex');
    
    const newSig = `t=${timestamp},v1=${signature}`;
    
    console.log(`📤 Reenviando a: ${WEBHOOK_URL}`);
    
    const response = await axios.post(WEBHOOK_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': newSig
      }
    });
    
    console.log(`✅ Respuesta: ${response.status} ${response.statusText}`);
    res.json({ received: true });
    
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`✅ Servidor escuchando en puerto ${PORT}`);
  console.log('\n📝 Próximos pasos:');
  console.log('1. Instala ngrok: npm install -g ngrok');
  console.log('2. Ejecuta: ngrok http 3001');
  console.log('3. Copia la URL HTTPS de ngrok');
  console.log('4. Configura el webhook en Stripe Dashboard con: [ngrok-url]/stripe/webhook');
  console.log('5. O usa el script testWebhookEvents.js para pruebas locales\n');
  console.log('Presiona Ctrl+C para detener\n');
});

// Manejo de cierre
process.on('SIGINT', () => {
  console.log('\n👋 Cerrando servidor...');
  process.exit(0);
});