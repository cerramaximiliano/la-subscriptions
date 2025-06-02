const WebhookEvent = require('../models/WebhookEvent');
const logger = require('../utils/logger');

const checkIdempotency = async (req, res, next) => {
  // Si el body es un Buffer (de express.raw()), parsearlo
  let event;
  if (Buffer.isBuffer(req.body)) {
    try {
      event = JSON.parse(req.body.toString());
    } catch (error) {
      logger.error('Failed to parse webhook body:', error);
      return res.status(400).json({ error: 'Invalid JSON payload' });
    }
  } else {
    event = req.body;
  }
  
  const eventId = event?.id;
  
  if (!eventId) {
    logger.error('Webhook event missing ID');
    return res.status(400).json({ error: 'Event ID is required' });
  }

  try {
    // Buscar si el evento ya fue procesado
    const existingEvent = await WebhookEvent.findOne({ 
      stripeEventId: eventId 
    });

    if (existingEvent) {
      // Si ya fue procesado exitosamente, retornar OK
      if (existingEvent.status === 'processed') {
        logger.info(`Webhook event ${eventId} already processed, skipping`);
        return res.status(200).json({ 
          received: true, 
          message: 'Event already processed' 
        });
      }

      // Si falló y superó los reintentos, retornar error
      if (existingEvent.status === 'failed' && existingEvent.retryCount >= 3) {
        logger.error(`Webhook event ${eventId} permanently failed`);
        return res.status(400).json({ 
          error: 'Event processing permanently failed' 
        });
      }

      // Si está en proceso, esperar o rechazar
      if (existingEvent.status === 'processing') {
        const processingTime = Date.now() - existingEvent.processedAt;
        if (processingTime < 30000) { // 30 segundos
          return res.status(409).json({ 
            error: 'Event is currently being processed' 
          });
        }
      }
    }

    // Crear o actualizar el registro del evento
    req.webhookEvent = await WebhookEvent.findOneAndUpdate(
      { stripeEventId: eventId },
      {
        stripeEventId: eventId,
        eventType: event.type,
        status: 'processing',
        payload: event,
        metadata: extractMetadata(event),
        $inc: { retryCount: existingEvent ? 1 : 0 }
      },
      { upsert: true, new: true }
    );

    next();
  } catch (error) {
    logger.error('Idempotency check failed:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const extractMetadata = (event) => {
  const metadata = {};
  
  if (event.data?.object?.customer) {
    metadata.customerId = event.data.object.customer;
  }
  if (event.data?.object?.subscription) {
    metadata.subscriptionId = event.data.object.subscription;
  }
  if (event.data?.object?.id && event.type.includes('invoice')) {
    metadata.invoiceId = event.data.object.id;
  }

  return metadata;
};

const markEventProcessed = async (req, res, next) => {
  if (req.webhookEvent) {
    await WebhookEvent.findByIdAndUpdate(
      req.webhookEvent._id,
      { status: 'processed' }
    );
  }
  next();
};

const markEventFailed = async (error, req, res, next) => {
  if (req.webhookEvent) {
    await WebhookEvent.findByIdAndUpdate(
      req.webhookEvent._id,
      { 
        status: 'failed',
        error: {
          message: error.message,
          stack: error.stack,
          code: error.code
        },
        lastRetryAt: new Date()
      }
    );
  }
  next(error);
};

module.exports = {
  checkIdempotency,
  markEventProcessed,
  markEventFailed
};