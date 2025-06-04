  /**
   * Rutas de Webhook para el Microservicio de Pagos
   * 
   * Este microservicio SOLO maneja eventos de pago:
   * - invoice.payment_failed
   * - invoice.payment_succeeded
   * - invoice.paid
   * - charge.failed
   * 
   * NO procesa eventos de suscripción (create, update, delete)
   */
  const express = require('express');
  const router = express.Router();
  const webhookController = require('../controllers/webhookController');
  const emailTestController = require('../controllers/emailTestController');
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
            'invoice.payment_failed',
            'invoice.payment_succeeded',
            'invoice.paid',
            'charge.failed'
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
   * Endpoint de pruebas seguro (disponible en todos los entornos)
   * Requiere autenticación por token
   */
  router.post(
    '/webhook/test-secure',
    express.json(),
    (req, res, next) => {
      // Middleware de autenticación por token
      const authToken = req.headers['x-test-auth-token'];
      const expectedToken = process.env.WEBHOOK_TEST_TOKEN;
      
      if (!expectedToken) {
        logger.error('WEBHOOK_TEST_TOKEN no configurado');
        return res.status(500).json({ error: 'Endpoint de pruebas no configurado' });
      }
      
      if (!authToken || authToken !== expectedToken) {
        logger.warn('Intento de acceso no autorizado al endpoint de pruebas');
        return res.status(401).json({ error: 'No autorizado' });
      }
      
      // Si el token es válido, continuar
      logger.info('🔓 Acceso autorizado al endpoint de pruebas');
      next();
    },
    checkIdempotency,
    webhookController.testWebhook,
    markEventProcessed
  );

  /**
   * Health check para el webhook de pagos
   */
  router.get('/webhook/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'payment-webhook-microservice',
      webhook: 'active',
      environment: process.env.NODE_ENV,
      timestamp: new Date(),
      events: ['invoice.payment_failed', 'invoice.payment_succeeded', 'invoice.paid', 'charge.failed']
    });
  });

  /**
   * Información sobre el webhook (solo desarrollo)
   */
  if (process.env.NODE_ENV !== 'production') {
    router.get('/webhook/info', (req, res) => {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY_TEST);

      res.json({
        service: 'Payment Webhook Microservice',
        description: 'Microservicio especializado en manejo de pagos fallidos y recuperación',
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
          'invoice.payment_failed',
          'invoice.payment_succeeded',
          'invoice.paid',
          'charge.failed'
        ],
        ignoredEvents: [
          'customer.subscription.created',
          'customer.subscription.updated',
          'customer.subscription.deleted',
          'checkout.session.completed'
        ],
        testEndpoints: [
          'POST /api/webhook/test',
          'POST /api/webhook/simulate/:eventType'
        ],
        note: 'Este microservicio NO maneja eventos de suscripción. Solo procesa eventos de pago.'
      });
    });
  }

  /**
   * Función auxiliar para crear objetos simulados
   */
  function createSimulatedObject(eventType, customData = {}) {
    const baseObjects = {
      'invoice.payment_failed': {
        id: 'in_simulated_' + Date.now(),
        customer: 'cus_simulated_123',
        subscription: 'sub_simulated_123',
        amount_due: 1999,
        currency: 'usd',
        status: 'open',
        attempt_count: 1,
        next_payment_attempt: Math.floor(Date.now() / 1000) + 3 * 24 * 60 * 60
      },
      'invoice.payment_succeeded': {
        id: 'in_simulated_' + Date.now(),
        customer: 'cus_simulated_123',
        subscription: 'sub_simulated_123',
        amount_paid: 1999,
        currency: 'usd',
        status: 'paid',
        paid: true
      },
      'invoice.paid': {
        id: 'in_simulated_' + Date.now(),
        customer: 'cus_simulated_123',
        subscription: 'sub_simulated_123',
        amount_paid: 1999,
        currency: 'usd',
        status: 'paid'
      },
      'charge.failed': {
        id: 'ch_simulated_' + Date.now(),
        customer: 'cus_simulated_123',
        amount: 1999,
        currency: 'usd',
        status: 'failed',
        failure_code: 'card_declined',
        failure_message: 'Your card was declined.',
        invoice: 'in_simulated_123'
      }
    };

    return {
      ...baseObjects[eventType],
      ...customData
    };
  }

  /**
   * ===========================================
   * RUTAS DE TESTING DE TEMPLATES DE EMAIL
   * ===========================================
   */
  
  /**
   * GET /api/webhook/test/templates
   * Obtiene información sobre los templates disponibles
   * 
   * Query params:
   * - templateName: nombre específico del template
   * - category: 'subscription' o 'payment'
   */
  router.get('/webhook/test/templates', emailTestController.getTemplates);
  
  /**
   * POST /api/webhook/test/templates/send
   * Envía un email de prueba con el template especificado
   * 
   * Body:
   * - userId o userEmail (requerido)
   * - templateName (requerido)
   * - customData (opcional): datos personalizados para el template
   */
  router.post('/webhook/test/templates/send', express.json(), emailTestController.sendTestEmail);
  
  /**
   * POST /api/webhook/test/templates/send-all
   * Envía todos los templates a un usuario
   * 
   * Body:
   * - userId o userEmail (requerido)
   * - category (opcional): filtrar por categoría
   * - delay (opcional): milisegundos entre emails (default: 2000)
   */
  router.post('/webhook/test/templates/send-all', express.json(), emailTestController.sendAllTestEmails);

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