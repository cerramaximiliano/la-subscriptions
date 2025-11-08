// models/UserStats.js
const mongoose = require('mongoose');

const UserStatsSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuarios',
    required: true,
    index: true
  },
  counts: {
    // Contadores de elementos ACTIVOS (no archivados)
    calculators: { type: Number, default: 0 },
    folders: { type: Number, default: 0 },
    movements: { type: Number, default: 0 },
    notifications: { type: Number, default: 0 },
    events: { type: Number, default: 0 },
    contacts: { type: Number, default: 0 },
    alerts: { type: Number, default: 0 },

    // Contadores TOTALES (activos + archivados) para cálculo de storage
    calculatorsTotal: { type: Number, default: 0 },
    foldersTotal: { type: Number, default: 0 },
    contactsTotal: { type: Number, default: 0 }
  },

  // Información de almacenamiento usado (en bytes)
  storage: {
    total: { type: Number, default: 0 },        // Total usado en bytes
    contacts: { type: Number, default: 0 },     // Bytes usados por contactos
    folders: { type: Number, default: 0 },      // Bytes usados por folders
    calculators: { type: Number, default: 0 },  // Bytes usados por calculadoras
    files: { type: Number, default: 0 },        // Bytes usados por archivos adjuntos
    fileCount: { type: Number, default: 0 }     // Cantidad de archivos
  },
  lastUpdated: { type: Date, default: Date.now }
}, { timestamps: true });

// Índice para mejorar el rendimiento de las consultas por userId
UserStatsSchema.index({ userId: 1 });

module.exports = mongoose.model('UserStats', UserStatsSchema);
