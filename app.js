const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs').promises;
const logger = require('./utils/logger');
const retrieveSecrets = require('./config/env');

// Cargar variables de entorno
dotenv.config();

const app = express();

// Configuración de CORS
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.FRONTEND_URL?.split(',') ||
    ['https://server.lawanaltycs.app']
    : ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization',
    'stripe-signature']
}));

// Middleware para parsear JSON (excepto para webhook de Stripe)
app.use((req, res, next) => {
  if (req.originalUrl === '/api/webhook' || req.originalUrl === '/api/webhook/stripe') {
    // Skip JSON parsing for Stripe webhook
    next();
  } else {
    express.json({ limit: '10mb' })(req, res, next);
  }
});

// Middleware para logging de requests
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.originalUrl}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date(),
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Stripe Webhooks & Cron Service',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      webhook: '/api/webhook'
    }
  });
});

// Función de inicialización asíncrona
const initializeApp = async () => {
  try {

    const secretsString = await retrieveSecrets();
    await fs.writeFile(".env", secretsString);

    // Cargar variables de entorno
    dotenv.config();


    // Conectar a MongoDB
    const connectDB = require('./config/db');
    await connectDB();
    logger.info('✅ MongoDB connected successfully');

    const subscriptionService = require('./services/subscriptionService');
    await subscriptionService.loadPlanMapping();
    logger.info('✅ Plan mapping loaded successfully');
    
    // Configurar rutas
    const webhookRoutes = require('./routes/webhookRoutes');
    app.use('/api', webhookRoutes);

    logger.info('✅ Routes configured successfully');
    
    // Manejo de errores 404 - DEBE ir después de las rutas
    app.use((req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Cannot ${req.method} ${req.originalUrl}`,
        timestamp: new Date()
      });
    });

    // Middleware global de manejo de errores
    app.use((err, req, res, next) => {
      logger.error('Global error handler:', err);

      // Error de Stripe
      if (err.type === 'StripeError') {
        return res.status(400).json({
          error: 'Stripe Error',
          message: err.message,
          code: err.code
        });
      }

      // Error de validación de Mongoose
      if (err.name === 'ValidationError') {
        return res.status(400).json({
          error: 'Validation Error',
          message: err.message,
          errors: err.errors
        });
      }

      // Error genérico
      res.status(err.status || 500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'production'
          ? 'An error occurred processing your request'
          : err.message,
        ...(process.env.NODE_ENV !== 'production' && {
          stack: err.stack
        })
      });
    });
    
    logger.info('✅ App initialized successfully');
  } catch (error) {
    logger.error('❌ Error initializing app:', error);
    process.exit(1);
  }
};

// Inicializar la aplicación
initializeApp();

module.exports = app;