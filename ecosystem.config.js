  module.exports = {
    apps: [{
      // Configuración de la aplicación principal
      name: 'stripe-webhooks',
      script: './server.js',
      instances: process.env.PM2_INSTANCES || 1,
      exec_mode: 'fork', // Use 'cluster' para múltiples instancias

      // Variables de entorno
      env: {
        NODE_ENV: 'development',
        PORT: 5001,
        ENABLE_CRON: 'false'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || 5001,
        ENABLE_CRON: 'true'
      },
      env_staging: {
        NODE_ENV: 'staging',
        PORT: process.env.PORT || 5001,
        ENABLE_CRON: 'true'
      },

      // Configuración de logs
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/error.log',
      out_file: './logs/output.log',
      log_file: './logs/combined.log',
      time: true,

      // Configuración de reinicio
      watch: false, // No usar watch en producción
      ignore_watch: ['node_modules', 'logs', '.git', '*.log'],
      max_memory_restart: '512M',
      restart_delay: 4000,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',

      // Configuración de monitoreo
      instance_var: 'INSTANCE_ID',
      merge_logs: true,

      // Graceful shutdown
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 3000,

      // Configuración adicional
      node_args: '--max-old-space-size=512',

      // Post-deploy hooks
      post_deploy: 'npm install && pm2 reload ecosystem.config.js --env production',

      // Configuración de interpretador
      interpreter: 'node',
      interpreter_args: '',

      // Configuración de cron para reinicios programados (opcional)
      cron_restart: '0 2 * * 0', // Reiniciar cada domingo a las 2 AM
    },

    // Configuración del scheduler para grace period
    {
      name: 'grace-period-cron-scheduler',
      script: './scripts/cronScheduler.js',
      instances: 1,
      exec_mode: 'fork',

      // Mantener corriendo constantemente (no usar cron_restart)
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',

      env: {
        NODE_ENV: 'production',
        TZ: 'America/Argentina/Buenos_Aires'
      },

      // Logs específicos para el scheduler
      error_file: './logs/grace-period-scheduler-error.log',
      out_file: './logs/grace-period-scheduler-output.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // Configuración de memoria
      max_memory_restart: '512M',

      // Graceful shutdown
      kill_timeout: 10000,
      wait_ready: false
    }],

    // Configuración de deploy (opcional)
    deploy: {
      production: {
        user: process.env.DEPLOY_USER || 'ubuntu',
        host: process.env.DEPLOY_HOST || 'tu-servidor.com',
        ref: 'origin/main',
        repo: process.env.DEPLOY_REPO || 'git@github.com:tu-usuario/stripe-webhooks-cron.git',
        path: process.env.DEPLOY_PATH || '/home/ubuntu/stripe-webhooks',
        'pre-deploy': 'git fetch --all',
        'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production && pm2 save',
        'pre-setup': 'echo "Configurando servidor de producción..."',
        ssh_options: 'StrictHostKeyChecking=no',
        env: {
          NODE_ENV: 'production'
        }
      },

      staging: {
        user: process.env.DEPLOY_USER || 'ubuntu',
        host: process.env.STAGING_HOST || 'staging.tu-servidor.com',
        ref: 'origin/develop',
        repo: process.env.DEPLOY_REPO || 'git@github.com:tu-usuario/stripe-webhooks-cron.git',
        path: process.env.STAGING_PATH || '/home/ubuntu/stripe-webhooks-staging',
        'pre-deploy': 'git fetch --all',
        'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env staging && pm2 save',
        env: {
          NODE_ENV: 'staging'
        }
      }
    }
  };

  // Configuración adicional para diferentes entornos
  if (process.env.NODE_ENV === 'production') {
    // Ajustes específicos de producción
    module.exports.apps[0].instances = process.env.PM2_INSTANCES || 2;
    module.exports.apps[0].exec_mode = 'cluster';
  }

  // Script de configuración inicial
  if (require.main === module) {
    console.log('🚀 Configuración PM2 para Stripe Webhooks');
    console.log('=========================================');
    console.log('Aplicaciones configuradas:');
    module.exports.apps.forEach(app => {
      console.log(`- ${app.name} (${app.instances} instancia${app.instances > 1 ? 's' : ''})`);
    });
    console.log('\nComandos útiles:');
    console.log('  pm2 start ecosystem.config.js --env production');
    console.log('  pm2 stop all');
    console.log('  pm2 restart stripe-webhooks');
    console.log('  pm2 logs stripe-webhooks');
    console.log('  pm2 monit');
    console.log('  pm2 save');
    console.log('  pm2 startup');
    console.log('\nDeploy:');
    console.log('  pm2 deploy production setup');
    console.log('  pm2 deploy production');
    console.log('  pm2 deploy production --force');
  }
