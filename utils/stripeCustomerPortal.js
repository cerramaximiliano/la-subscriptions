/**
 * Utilidad para generar enlaces al Customer Portal de Stripe
 * El portal permite a los usuarios gestionar su suscripción y métodos de pago
 */

const stripe = require('stripe')(
  process.env.NODE_ENV === 'production'
    ? process.env.STRIPE_SECRET_KEY
    : process.env.STRIPE_SECRET_KEY_TEST || process.env.STRIPE_API_KEY_DEV
);

const logger = require('./logger');

/**
 * Genera una URL del Customer Portal de Stripe
 * @param {string} customerId - ID del customer en Stripe
 * @param {string} returnUrl - URL a donde regresar después de actualizar
 * @returns {Promise<string>} URL del portal
 */
async function generateCustomerPortalUrl(customerId, returnUrl) {
  try {
    // Crear sesión del portal
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl || process.env.BASE_URL || 'https://tuapp.com/dashboard',
      // Configuración opcional del portal
      configuration: process.env.STRIPE_PORTAL_CONFIG_ID, // Si tienes una configuración personalizada
    });

    logger.info(`Portal session creada para customer: ${customerId}`);
    return session.url;
  } catch (error) {
    logger.error('Error creando sesión del portal:', error);
    throw error;
  }
}

/**
 * Genera URL directa para actualizar método de pago
 * Usa el portal pero con flow_data para ir directo a métodos de pago
 */
async function generateUpdatePaymentUrl(customerId, returnUrl) {
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl || `${process.env.BASE_URL}/billing/success`,
      // Ir directamente a la sección de métodos de pago
      flow_data: {
        type: 'payment_method_update',
        payment_method_update: {
          subscription: 'latest' // Actualizar el método de pago de la última suscripción
        }
      }
    });

    return session.url;
  } catch (error) {
    logger.error('Error creando URL de actualización de pago:', error);
    // Fallback a URL genérica del portal
    return generateCustomerPortalUrl(customerId, returnUrl);
  }
}

module.exports = {
  generateCustomerPortalUrl,
  generateUpdatePaymentUrl
};