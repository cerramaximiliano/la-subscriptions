#!/usr/bin/env node

// Cargar variables de entorno
require('dotenv').config();

const mongoose = require('mongoose');
const Table = require('cli-table3');
const clear = require('clear');
const figlet = require('figlet');

// Crear un objeto chalk compatible
const chalk = {
  level: 1,
  cyan: (text) => `\x1b[36m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  blue: (text) => `\x1b[34m${text}\x1b[0m`,
  gray: (text) => `\x1b[90m${text}\x1b[0m`,
  white: (text) => `\x1b[37m${text}\x1b[0m`,
  supportsColor: true
};

// Importar modelos
const WebhookEvent = require('../models/WebhookEvent');
const Subscription = require('../models/Subscription');
const User = require('../models/User');

// Configuración de MongoDB
const connectDB = require('../config/db');

// Detectar capacidades del terminal
const isTTY = process.stdout.isTTY;
const isSSH = process.env.SSH_CLIENT || process.env.SSH_TTY;
const supportsColor = process.stdout.hasColors?.() || chalk.supportsColor;
const terminalWidth = process.stdout.columns || 80;

// Parsear argumentos
const args = process.argv.slice(2);
const noClear = args.includes('--no-clear') || args.includes('-nc') || !isTTY;
const simpleMode = args.includes('--simple') || args.includes('-s');
const jsonMode = args.includes('--json') || args.includes('-j');
const continuousMode = args.includes('--continuous') || args.includes('-c');
const helpMode = args.includes('--help') || args.includes('-h');

// Variables para estadísticas
let stats = {
  total: 0,
  processed: 0,
  failed: 0,
  retrying: 0,
  eventTypes: {}
};

// Deshabilitar colores si no son soportados
if (!supportsColor || jsonMode) {
  chalk.level = 0;
  // Redefinir funciones para que no añadan códigos de color
  Object.keys(chalk).forEach(key => {
    if (typeof chalk[key] === 'function') {
      chalk[key] = (text) => text;
    }
  });
}

// Mostrar ayuda
if (helpMode) {
  console.log('Uso: node monitorWebhooks.js [flags]');
  console.log('\nFlags:');
  console.log('  --no-clear, -nc     No limpiar pantalla');
  console.log('  --simple, -s        Modo simple (sin tablas)');
  console.log('  --json, -j          Salida en formato JSON');
  console.log('  --continuous, -c    Modo continuo (logs en tiempo real)');
  console.log('  --help, -h          Mostrar esta ayuda');
  process.exit(0);
}

// Función para formatear fecha
function formatDate(date) {
  return new Date(date).toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

// Función para mostrar estadísticas en modo simple
function displayStatsSimple() {
  const timestamp = new Date().toISOString();
  console.log(`\n[${timestamp}] === ESTADÍSTICAS DE WEBHOOKS ===`);
  console.log(`Total: ${stats.total} | Procesados: ${stats.processed} | Fallidos: ${stats.failed} | Reintentando: ${stats.retrying}`);
  console.log(`Tasa de éxito: ${stats.total > 0 ? ((stats.processed / stats.total) * 100).toFixed(2) : 0}%`);
  
  if (Object.keys(stats.eventTypes).length > 0) {
    console.log('\nEventos por tipo:');
    for (const [type, count] of Object.entries(stats.eventTypes)) {
      console.log(`  ${type}: ${count}`);
    }
  }
}

// Función para mostrar estadísticas en modo JSON
function displayStatsJSON() {
  const output = {
    timestamp: new Date().toISOString(),
    stats: {
      ...stats,
      successRate: stats.total > 0 ? ((stats.processed / stats.total) * 100).toFixed(2) : 0
    }
  };
  console.log(JSON.stringify(output));
}

// Función para mostrar estadísticas con tablas
function displayStats() {
  if (!noClear && isTTY) {
    clear();
  }
  
  if (!simpleMode && isTTY) {
    try {
      console.log(chalk.cyan(figlet.textSync('Webhook Monitor', { horizontalLayout: 'fitted' })));
    } catch (e) {
      console.log(chalk.cyan('=== WEBHOOK MONITOR ==='));
    }
  }
  
  console.log(chalk.yellow('\n=== MONITOREO EN TIEMPO REAL ===\n'));
  
  // Tabla de estadísticas generales
  if (!simpleMode && isTTY) {
    const statsTable = new Table({
      head: [chalk.white('Métrica'), chalk.white('Valor')],
      colWidths: [30, 20]
    });
    
    statsTable.push(
      ['Total de eventos', chalk.blue(stats.total)],
      ['Procesados exitosamente', chalk.green(stats.processed)],
      ['Fallidos', chalk.red(stats.failed)],
      ['En reintento', chalk.yellow(stats.retrying)],
      ['Tasa de éxito', stats.total > 0 ? chalk.cyan(`${((stats.processed / stats.total) * 100).toFixed(2)}%`) : '-']
    );
    
    console.log(statsTable.toString());
    
    // Tabla de eventos por tipo
    if (Object.keys(stats.eventTypes).length > 0) {
      console.log(chalk.yellow('\n=== EVENTOS POR TIPO ===\n'));
      
      const eventTable = new Table({
        head: [chalk.white('Tipo de Evento'), chalk.white('Cantidad'), chalk.white('Porcentaje')],
        colWidths: [40, 15, 15]
      });
      
      for (const [type, count] of Object.entries(stats.eventTypes)) {
        const percentage = ((count / stats.total) * 100).toFixed(2);
        eventTable.push([type, count, `${percentage}%`]);
      }
      
      console.log(eventTable.toString());
    }
  } else {
    displayStatsSimple();
  }
}

// Función para mostrar eventos recientes
async function displayRecentEvents() {
  try {
    const recentEvents = await WebhookEvent.find()
      .sort({ createdAt: -1 })
      .limit(10);
    
    if (recentEvents.length > 0 && !jsonMode) {
      if (!simpleMode && isTTY) {
        console.log(chalk.yellow('\n=== ÚLTIMOS 10 EVENTOS ===\n'));
        
        const eventTable = new Table({
          head: [
            chalk.white('Hora'),
            chalk.white('Tipo'),
            chalk.white('ID Stripe'),
            chalk.white('Estado'),
            chalk.white('Intentos')
          ],
          colWidths: [20, 35, 25, 15, 10]
        });
        
        for (const event of recentEvents) {
          let statusColor = chalk.gray;
          switch (event.status) {
            case 'processed':
              statusColor = chalk.green;
              break;
            case 'failed':
              statusColor = chalk.red;
              break;
            case 'retrying':
              statusColor = chalk.yellow;
              break;
            case 'pending':
              statusColor = chalk.blue;
              break;
          }
          
          eventTable.push([
            formatDate(event.createdAt),
            event.type,
            event.stripeEventId.substring(0, 20) + '...',
            statusColor(event.status),
            event.attempts
          ]);
        }
        
        console.log(eventTable.toString());
      } else {
        console.log('\nÚltimos eventos:');
        for (const event of recentEvents) {
          console.log(`[${formatDate(event.createdAt)}] ${event.type} - ${event.status} (intentos: ${event.attempts})`);
        }
      }
    }
  } catch (error) {
    console.error(chalk.red('Error al obtener eventos recientes:', error));
  }
}

// Función para actualizar estadísticas
async function updateStats() {
  try {
    const [total, processed, failed, retrying] = await Promise.all([
      WebhookEvent.countDocuments(),
      WebhookEvent.countDocuments({ status: 'processed' }),
      WebhookEvent.countDocuments({ status: 'failed' }),
      WebhookEvent.countDocuments({ status: 'retrying' })
    ]);
    
    stats.total = total;
    stats.processed = processed;
    stats.failed = failed;
    stats.retrying = retrying;
    
    // Contar por tipo de evento
    const eventTypeCounts = await WebhookEvent.aggregate([
      { $group: { _id: '$type', count: { $sum: 1 } } }
    ]);
    
    stats.eventTypes = {};
    eventTypeCounts.forEach(item => {
      stats.eventTypes[item._id] = item.count;
    });
    
  } catch (error) {
    console.error(chalk.red('Error al actualizar estadísticas:', error));
  }
}

// Función para mostrar cambios en tiempo real
async function watchChanges() {
  if (!continuousMode) {
    console.log(chalk.green('\n✓ Conectado a MongoDB. Monitoreando cambios...\n'));
  }
  
  // Watch para cambios en WebhookEvents
  const changeStream = WebhookEvent.watch();
  
  changeStream.on('change', async (change) => {
    if (continuousMode) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] Cambio detectado: ${change.operationType}`);
      
      if (change.operationType === 'insert') {
        const event = change.fullDocument;
        console.log(`  → Nuevo evento: ${event.type} | ID: ${event.stripeEventId} | Estado: ${event.status}`);
      }
    } else if (!jsonMode) {
      console.log(chalk.yellow(`\n🔔 Nuevo cambio detectado: ${change.operationType}`));
      
      if (change.operationType === 'insert') {
        const event = change.fullDocument;
        console.log(chalk.cyan(`   → Nuevo evento: ${event.type}`));
        console.log(chalk.cyan(`   → ID: ${event.stripeEventId}`));
        console.log(chalk.cyan(`   → Estado: ${event.status}`));
      }
    }
    
    // Actualizar estadísticas
    await updateStats();
    
    if (!continuousMode) {
      if (jsonMode) {
        displayStatsJSON();
      } else {
        displayStats();
        await displayRecentEvents();
      }
    }
  });
}

// Función principal
async function main() {
  try {
    // Mostrar información de conexión
    if (!jsonMode) {
      console.log(chalk.yellow('Conectando a MongoDB...'));
      if (isSSH) {
        console.log(chalk.gray('Ejecutando a través de SSH'));
      }
    }
    
    // Conectar a MongoDB
    await connectDB();
    
    // Actualizar estadísticas iniciales
    await updateStats();
    
    // Mostrar interfaz inicial
    if (jsonMode) {
      displayStatsJSON();
    } else {
      displayStats();
      await displayRecentEvents();
    }
    
    // Iniciar monitoreo en tiempo real
    await watchChanges();
    
    // Actualizar periódicamente
    if (!continuousMode) {
      setInterval(async () => {
        await updateStats();
        if (jsonMode) {
          displayStatsJSON();
        } else {
          displayStats();
          await displayRecentEvents();
        }
      }, 5000);
    }
    
    // Manejar salida
    process.on('SIGINT', () => {
      if (!jsonMode) {
        console.log(chalk.yellow('\n\n👋 Cerrando monitor...\n'));
      }
      process.exit(0);
    });
    
  } catch (error) {
    if (jsonMode) {
      console.error(JSON.stringify({ error: error.message }));
    } else {
      console.error(chalk.red('Error al iniciar monitor:', error));
    }
    process.exit(1);
  }
}

// Ejecutar
main();