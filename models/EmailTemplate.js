const mongoose = require('mongoose');

const EmailTemplateSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      required: true,
      enum: [
        'subscription', 'auth', 'support', 'tasks', 'documents', 'notification', 'welcome',
        'calculadora', 'gestionTareas', 'gestionCausas', 'gestionContactos', 'gestionCalendario', 'secuenciaOnboarding',
        'promotional', 'booking'
      ],
      index: true
    },
    name: {
      type: String,
      required: true
    },
    subject: {
      type: String,
      required: true
    },
    htmlBody: {
      type: String,
      required: true
    },
    textBody: {
      type: String,
      required: true
    },
    description: {
      type: String,
      default: ''
    },
    variables: {
      type: [String],
      default: []
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },
    lastModifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  {
    timestamps: true
  }
);

// Crear índice compuesto para búsqueda eficiente por categoría y nombre
EmailTemplateSchema.index({ category: 1, name: 1 }, { unique: true });

const EmailTemplate = mongoose.model('EmailTemplate', EmailTemplateSchema);

module.exports = EmailTemplate;