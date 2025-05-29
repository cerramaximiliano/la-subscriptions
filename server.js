  const app = require('./app');
  const logger = require('./utils/logger');
  const { setupScheduledTasks } =
  require('./scripts/scheduleTasks');

  const PORT = process.env.PORT || 5002;

  // Manejar errores no capturados
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
  });

  process.on('unhandledRejection', (error) => {
    logger.error('Unhandled Rejection:', error);
    process.exit(1);
  });

  // Iniciar servidor
  const server = app.listen(PORT, async () => {
    logger.info(`🚀 Server running on port ${PORT} - ${process.env.NODE_ENV || 'development'}`);
    logger.info(`📝 Webhook endpoint:  http://localhost:${PORT}/api/webhook`);

    // Configurar tareas programadas solo en producción o si se especifica
    if (process.env.NODE_ENV === 'production' || process.env.ENABLE_CRON === 'true') {
      setupScheduledTasks();
      logger.info('⏰ Tareas programadas configuradas');
    } else {
      logger.info('⏰ Tareas programadas deshabilitadas en desarrollo');
    }
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('SIGTERM recibido, cerrando servidor...');
    server.close(() => {
      logger.info('Servidor cerrado');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    logger.info('SIGINT recibido, cerrando servidor...');
    server.close(() => {
      logger.info('Servidor cerrado');
      process.exit(0);
    });
  });

  module.exports = server;