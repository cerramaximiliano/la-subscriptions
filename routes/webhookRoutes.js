  const express = require('express');
  const router = express.Router();
  const webhookController = require('../controllers/webhookController');
  const logger = require('../utils/logger');
  const { checkIdempotency, markEventProcessed, markEventFailed } = require('../middleware/webhookIdempotency');

  /**
   * Middleware para logging de webhooks
   */
  const webhookLogger = (req, res, next) => {
    const startTime = Date.now();

    // Log de entrada
    logger.info(`🔔 Webhook recibido: ${req.method} ${req.originalUrl}`);
    logger.info(`Headers: ${JSON.stringify({
      'stripe-signature': req.headers['stripe-signature'] ? 'presente' : 'ausente',
      'content-type': req.headers['content-type'],
      'user-agent': req.headers['user-agent']
    })}`);

    // Interceptar respuesta para logging
    const originalSend = res.send;
    res.send = function(data) {
      const duration = Date.now() - startTime;
      logger.info(`✅ Webhook procesado en ${duration}ms - Status: ${res.statusCode}`);
      originalSend.call(this, data);
    };

    next();
  };

  /**
   * Ruta principal del webhook de Stripe
   * IMPORTANTE: Debe usar express.raw() para mantener el body como Buffer
   */
  router.post(
    '/webhook',
    webhookLogger,
    express.raw({ type: 'application/json' }),
    checkIdempotency,
    webhookController.handleStripeWebhook,
    markEventProcessed
  );
  
  // Manejo de errores para marcar eventos fallidos
  router.use('/webhook', markEventFailed);

  /**
   * Ruta alternativa para webhook (por si necesitas múltiples endpoints)
   */
  router.post(
    '/webhook/stripe',
    webhookLogger,
    express.raw({ type: 'application/json' }),
    checkIdempotency,
    webhookController.handleStripeWebhook,
    markEventProcessed
  );
  
  // Manejo de errores para marcar eventos fallidos
  router.use('/webhook/stripe', markEventFailed);

  /**
   * Endpoint de prueba para desarrollo
   * Solo disponible en entorno de desarrollo
   */
  logger.info(`NODE_ENV actual: ${process.env.NODE_ENV}`);
  if (process.env.NODE_ENV !== 'production') {
    logger.info('Registrando endpoints de desarrollo...');
    router.post(
      '/webhook/test',
      express.json(),
      checkIdempotency,
      webhookController.testWebhook,
      markEventProcessed
    );

    // Endpoint para simular eventos específicos
    router.post(
      '/webhook/simulate/:eventType',
      express.json(),
      async (req, res) => {
        try {
          const { eventType } = req.params;
          const validEvents = [
            'customer.subscription.created',
            'customer.subscription.updated',
            'customer.subscription.deleted',
            'invoice.paid',
            'checkout.session.completed'
          ];

          if (!validEvents.includes(eventType)) {
            return res.status(400).json({
              error: 'Tipo de evento inválido',
              validEvents
            });
          }

          logger.info(`🧪 Simulando evento: ${eventType}`);

          // Crear evento simulado
          const simulatedEvent = {
            id: `evt_simulated_${Date.now()}`,
            type: eventType,
            created: Math.floor(Date.now() / 1000),
            data: {
              object: createSimulatedObject(eventType, req.body)
            }
          };

          // Procesar con el controlador
          req.body = Buffer.from(JSON.stringify(simulatedEvent));
          req.headers['stripe-signature'] = 'simulated';

          await webhookController.handleStripeWebhook(req, res);

        } catch (error) {
          logger.error('Error en simulación:', error);
          res.status(500).json({ error: error.message });
        }
      }
    );
  }

  /**
   * Health check para el webhook
   */
  router.get('/webhook/health', (req, res) => {
    res.json({
      status: 'ok',
      webhook: 'active',
      environment: process.env.NODE_ENV,
      timestamp: new Date()
    });
  });

  /**
   * Información sobre el webhook (solo desarrollo)
   */
  if (process.env.NODE_ENV !== 'production') {
    router.get('/webhook/info', (req, res) => {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY_TEST);

      res.json({
        endpoints: {
          production: process.env.WEBHOOK_URL || 'https://tu-dominio.com/api/webhook',
          development: `http://localhost:${process.env.PORT || 5000}/api/webhook`
        },
        configuration: {
          hasWebhookSecret: !!process.env.STRIPE_WEBHOOK_SECRET,
          hasStripeKey: !!process.env.STRIPE_SECRET_KEY_TEST,
          environment: process.env.NODE_ENV
        },
        supportedEvents: [
          'checkout.session.completed',
          'customer.subscription.created',
          'customer.subscription.updated',
          'customer.subscription.deleted',
          'invoice.paid',
          'invoice.payment_succeeded',
          'invoice.payment_failed'
        ],
        testEndpoints: [
          'POST /api/webhook/test',
          'POST /api/webhook/simulate/:eventType'
        ]
      });
    });
  }

  /**
   * Función auxiliar para crear objetos simulados
   */
  function createSimulatedObject(eventType, customData = {}) {
    const baseObjects = {
      'customer.subscription.created': {
        id: 'sub_simulated_' + Date.now(),
        customer: 'cus_simulated_123',
        status: 'active',
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        items: {
          data: [{
            price: {
              id: process.env.STRIPE_PRICE_STANDARD || 'price_standard'
            }
          }]
        }
      },
      'customer.subscription.updated': {
        id: 'sub_simulated_' + Date.now(),
        customer: 'cus_simulated_123',
        status: 'active',
        cancel_at_period_end: true,
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        items: {
          data: [{
            price: {
              id: process.env.STRIPE_PRICE_STANDARD || 'price_standard'
            }
          }]
        }
      },
      'customer.subscription.deleted': {
        id: 'sub_simulated_' + Date.now(),
        customer: 'cus_simulated_123',
        status: 'canceled',
        canceled_at: Math.floor(Date.now() / 1000)
      },
      'invoice.paid': {
        id: 'in_simulated_' + Date.now(),
        customer: 'cus_simulated_123',
        subscription: 'sub_simulated_123',
        amount_paid: 1999,
        currency: 'usd',
        status: 'paid'
      },
      'checkout.session.completed': {
        id: 'cs_simulated_' + Date.now(),
        mode: 'subscription',
        payment_status: 'paid',
        subscription: 'sub_simulated_123',
        customer: 'cus_simulated_123'
      }
    };

    return {
      ...baseObjects[eventType],
      ...customData
    };
  }

  /**
   * Manejo de errores 404 para rutas no encontradas
   */
  router.use('/webhook/*', (req, res) => {
    logger.warn(`Webhook endpoint no encontrado: ${req.originalUrl}`);
    res.status(404).json({
      error: 'Webhook endpoint no encontrado',
      path: req.originalUrl
    });
  });

  module.exports = router;