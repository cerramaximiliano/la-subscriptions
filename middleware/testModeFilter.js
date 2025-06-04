/**
 * Middleware para filtrar eventos de prueba y controlar a quién se envían emails
 */

const logger = require('../utils/logger');

// Lista de emails autorizados para recibir notificaciones de prueba
const TEST_EMAIL_WHITELIST = process.env.TEST_EMAIL_WHITELIST 
  ? process.env.TEST_EMAIL_WHITELIST.split(',').map(email => email.trim())
  : ['test@example.com', 'admin@company.com'];

/**
 * Middleware para manejar eventos de prueba
 */
const testModeFilter = async (req, res, next) => {
  try {
    // Solo aplicar a webhooks
    if (!req.originalUrl.includes('/webhook')) {
      return next();
    }

    // Parsear el evento (si aún no está parseado)
    let event;
    if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) {
      event = JSON.parse(req.body.toString());
    } else {
      event = req.body;
    }

    // Detectar si es un evento de prueba
    const isTestMode = !event.livemode;
    const isProduction = process.env.NODE_ENV === 'production';

    // Guardar información en req para uso posterior
    req.webhookTestMode = isTestMode;
    req.webhookEvent = event;

    // Log del modo
    if (isTestMode) {
      logger.info('🧪 Evento de PRUEBA detectado', {
        eventId: event.id,
        type: event.type,
        livemode: event.livemode
      });
    }

    // Opción 1: Bloquear completamente eventos de prueba en producción
    if (isProduction && isTestMode && process.env.BLOCK_TEST_EVENTS === 'true') {
      logger.warn('⚠️  Evento de prueba bloqueado en producción');
      return res.json({ 
        received: true, 
        message: 'Test events blocked in production',
        test_mode: true 
      });
    }

    // Opción 2: Marcar el evento para procesamiento especial
    if (isTestMode) {
      req.isTestWebhook = true;
    }

    next();
  } catch (error) {
    logger.error('Error en testModeFilter:', error);
    next(); // Continuar aunque falle el filtro
  }
};

/**
 * Middleware para filtrar emails en eventos de prueba
 */
const testEmailFilter = (emailService) => {
  const originalSend = emailService.sendEmail;
  const originalSendPaymentEmail = emailService.sendPaymentFailedEmail;
  const originalSendSubscriptionEmail = emailService.sendSubscriptionEmail;

  // Wrapper para filtrar emails
  const filterTestEmails = async (to, ...args) => {
    // Si es un evento de prueba y el email no está en la whitelist
    if (global.currentWebhookTestMode && !TEST_EMAIL_WHITELIST.includes(to)) {
      logger.info(`📧 Email de prueba BLOQUEADO para: ${to}`);
      logger.info(`Solo se permiten emails a: ${TEST_EMAIL_WHITELIST.join(', ')}`);
      return { 
        success: true, 
        message: 'Test email blocked',
        wouldHaveSentTo: to,
        allowedEmails: TEST_EMAIL_WHITELIST
      };
    }
    
    // Enviar normalmente
    return originalSend.call(emailService, to, ...args);
  };

  // Reemplazar métodos de email
  if (emailService.sendEmail) {
    emailService.sendEmail = filterTestEmails;
  }
  
  if (emailService.sendPaymentFailedEmail) {
    emailService.sendPaymentFailedEmail = async (to, data, type) => {
      if (global.currentWebhookTestMode && !TEST_EMAIL_WHITELIST.includes(to)) {
        logger.info(`📧 Email de pago fallido BLOQUEADO para: ${to}`);
        return { success: true, message: 'Test email blocked' };
      }
      return originalSendPaymentEmail.call(emailService, to, data, type);
    };
  }

  if (emailService.sendSubscriptionEmail) {
    emailService.sendSubscriptionEmail = async (user, type, data) => {
      const email = user.email || user;
      if (global.currentWebhookTestMode && !TEST_EMAIL_WHITELIST.includes(email)) {
        logger.info(`📧 Email de suscripción BLOQUEADO para: ${email}`);
        return { success: true, message: 'Test email blocked' };
      }
      return originalSendSubscriptionEmail.call(emailService, user, type, data);
    };
  }

  return emailService;
};

/**
 * Helper para verificar si un customer ID es de prueba
 */
const isTestCustomer = (customerId) => {
  return customerId && (
    customerId.startsWith('cus_test_') || 
    customerId.includes('_test_')
  );
};

/**
 * Helper para obtener usuarios de prueba específicos
 */
const getTestUserMapping = () => {
  // Mapeo de customer IDs de prueba a emails específicos
  return {
    'cus_test_123': 'test@example.com',
    'cus_test_admin': 'admin@company.com',
    // Agregar más mappings según necesites
  };
};

module.exports = {
  testModeFilter,
  testEmailFilter,
  isTestCustomer,
  getTestUserMapping,
  TEST_EMAIL_WHITELIST
};