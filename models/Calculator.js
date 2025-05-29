 const mongoose = require("mongoose");

  const calculatorSchema = new mongoose.Schema(
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Usuarios",
        required: true,
      },
      date: {
        type: Date,
        default: Date.now
      },
      groupId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Group",
      },
      folderId: { type: mongoose.Schema.Types.ObjectId, ref: "Folder", default: null },
      folderName: { type: String },
      type: {
        type: String,
        required: true,
        enum: ["Calculado", "Ofertado", "Reclamado"],
      },
      classType: { type: String, enum: ["laboral", "civil", "intereses", "previsional"] },
      subClassType: { type: String },
      amount: { type: Number, required: true },
      capital: { type: Number }, // Nueva propiedad para el capital sin intereses
      user: { type: String },
      interest: { type: Number },
      variables: { type: Object },
      archived: { type: Boolean, default: false },
      active: { type: Boolean, default: true },
      keepUpdated: { type: Boolean, default: false },
      
      // Campos para verificación y autenticidad
      verificationHash: { 
        type: String, 
        unique: true,
        sparse: true // Permite valores null pero garantiza unicidad cuando existe
      },
      verificationCode: { 
        type: String,
        unique: true,
        sparse: true
      },
      isVerified: { 
        type: Boolean, 
        default: false 
      },
      verifiedAt: { 
        type: Date 
      },
      verificationUrl: { 
        type: String 
      },
      // Metadatos de verificación
      verificationMetadata: {
        createdBy: { type: String }, // Nombre del usuario que creó el cálculo
        createdByEmail: { type: String }, // Email del usuario
        organization: { type: String }, // Organización/Estudio jurídico
        notes: { type: String }, // Notas adicionales para la verificación
        ipAddress: { type: String }, // IP desde donde se creó
        userAgent: { type: String } // Navegador/dispositivo usado
      }
    },
    { timestamps: true }
  );

  module.exports = mongoose.model("Calculator", calculatorSchema);
