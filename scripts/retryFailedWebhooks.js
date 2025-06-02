const mongoose = require('mongoose');
const WebhookEvent = require('../models/WebhookEvent');
const logger = require('../utils/logger');
const stripe = require('../config/stripe');

const retryFailedWebhooks = async () => {
  try {
    // Buscar eventos fallidos que pueden reintentarse
    const failedEvents = await WebhookEvent.find({
      status: 'failed',
      retryCount: { $lt: 3 },
      $or: [
        { lastRetryAt: { $lt: new Date(Date.now() - 3600000) } }, // Hace más de 1 hora
        { lastRetryAt: { $exists: false } }
      ]
    }).limit(10);

    logger.info(`Found ${failedEvents.length} failed webhooks to retry`);

    for (const event of failedEvents) {
      try {
        logger.info(`Retrying webhook ${event.stripeEventId} (attempt ${event.retryCount + 1})`);
        
        // Importar el controlador dinámicamente para evitar dependencias circulares
        const webhookController = require('../controllers/webhookController');
        
        // Crear un objeto de request simulado
        const fakeReq = {
          body: event.payload,
          webhookEvent: event,
          headers: {
            'stripe-signature': 'retry-signature'
          }
        };
        
        // Crear un objeto de response simulado
        const fakeRes = {
          status: (code) => ({
            json: (data) => {
              logger.info(`Retry response: ${code} - ${JSON.stringify(data)}`);
            }
          }),
          json: (data) => {
            logger.info(`Retry response: ${JSON.stringify(data)}`);
          }
        };
        
        // Reprocesar el evento
        await new Promise((resolve, reject) => {
          // Llamar al webhook handler
          webhookController.handleWebhook(fakeReq, fakeRes, (error) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          });
        });
        
        // Marcar como procesado
        event.status = 'processed';
        event.processedAt = new Date();
        await event.save();
        
        logger.info(`Successfully retried webhook ${event.stripeEventId}`);
      } catch (error) {
        // Incrementar contador de reintentos
        event.retryCount += 1;
        event.lastRetryAt = new Date();
        event.error = {
          message: error.message,
          stack: error.stack,
          code: error.code
        };
        
        // Si alcanzó el máximo de reintentos, marcar como permanentemente fallido
        if (event.retryCount >= 3) {
          event.status = 'failed';
          logger.error(`Webhook ${event.stripeEventId} permanently failed after ${event.retryCount} attempts`);
        }
        
        await event.save();
        
        logger.error(`Failed to retry webhook ${event.stripeEventId}:`, error);
      }
    }
    
    // Limpiar eventos muy antiguos (más de 90 días)
    const deletedCount = await WebhookEvent.deleteMany({
      createdAt: { $lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) }
    });
    
    if (deletedCount.deletedCount > 0) {
      logger.info(`Cleaned up ${deletedCount.deletedCount} old webhook events`);
    }
    
  } catch (error) {
    logger.error('Failed to run webhook retry job:', error);
  }
};

// Función para ejecutar manualmente si se llama directamente
const runRetryJob = async () => {
  try {
    // Cargar configuración si es necesario
    if (!mongoose.connection.readyState) {
      const dbConfig = require('../config/db');
      await dbConfig();
    }
    
    await retryFailedWebhooks();
    
    logger.info('Webhook retry job completed');
  } catch (error) {
    logger.error('Error running retry job:', error);
    process.exit(1);
  }
};

// Si se ejecuta directamente, correr el job
if (require.main === module) {
  runRetryJob().then(() => {
    process.exit(0);
  });
}

module.exports = { retryFailedWebhooks };