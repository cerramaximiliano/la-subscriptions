// utils/storageHelper.js
const logger = require('./logger');

/**
 * Tamaños estimados por tipo de documento (en bytes)
 * IMPORTANTE: Deben coincidir con los valores del servidor principal
 */
const DOCUMENT_SIZES = {
  contact: 2048,        // 2 KB - Contacto simple con datos básicos
  folder: 10240,        // 10 KB - Carpeta con múltiples campos y subdocumentos
  calculator: 5120,     // 5 KB - Calculadora con fórmulas y configuraciones
};

/**
 * Calcula el tamaño estimado de un documento según su tipo
 * @param {String} documentType - Tipo de documento (contact, folder, calculator)
 * @param {Object} document - El documento (opcional, para cálculos más precisos)
 * @returns {Number} Tamaño estimado en bytes
 */
const calculateDocumentSize = (documentType, document = null) => {
  try {
    // Si tenemos el documento, podemos hacer un cálculo más preciso
    if (document) {
      // Convertir a JSON y calcular el tamaño real
      const jsonString = JSON.stringify(document);
      const sizeInBytes = Buffer.byteLength(jsonString, 'utf8');

      // Agregar un 20% extra para metadatos de MongoDB e índices
      return Math.ceil(sizeInBytes * 1.2);
    }

    // Si no tenemos el documento, usar el tamaño estimado
    return DOCUMENT_SIZES[documentType] || 0;
  } catch (error) {
    logger.error(`Error calculando tamaño del documento: ${error.message}`);
    return DOCUMENT_SIZES[documentType] || 0;
  }
};

/**
 * Convierte bytes a megabytes
 * @param {Number} bytes - Cantidad de bytes
 * @returns {Number} Cantidad en megabytes
 */
const bytesToMB = (bytes) => {
  return bytes / (1024 * 1024);
};

/**
 * Actualiza el almacenamiento usado por un usuario al archivar/desarchivar
 * @param {String} userId - ID del usuario
 * @param {String} documentType - Tipo de documento (contact, folder, calculator)
 * @param {Number} change - Cambio en la cantidad (1 para archivar, -1 para desarchivar)
 * @param {Object} document - El documento (opcional, para tamaño real)
 * @returns {Promise<Boolean>} true si se actualizó correctamente
 */
const updateStorageUsage = async (userId, documentType, change = 1, document = null) => {
  try {
    const UserStats = require('../models/UserStats');

    const sizeInBytes = calculateDocumentSize(documentType, document);
    const totalChange = sizeInBytes * change;

    // Actualizar el campo de almacenamiento en UserStats
    const updateQuery = {
      $inc: {
        'storage.total': totalChange
      }
    };

    // También actualizar el contador específico del tipo
    updateQuery.$inc[`storage.${documentType}s`] = totalChange;

    await UserStats.findOneAndUpdate(
      { userId },
      updateQuery,
      { upsert: true, new: true }
    );

    logger.info(`[Storage] Actualizado para usuario ${userId}: ${change > 0 ? '+' : ''}${bytesToMB(totalChange).toFixed(2)} MB (${documentType})`);
    return true;
  } catch (error) {
    logger.error(`[Storage] Error actualizando almacenamiento para usuario ${userId}: ${error.message}`);
    return false;
  }
};

/**
 * Actualiza el almacenamiento para múltiples elementos archivados
 * @param {String} userId - ID del usuario
 * @param {String} documentType - Tipo de documento
 * @param {Number} count - Cantidad de elementos archivados
 * @returns {Promise<Boolean>} true si se actualizó correctamente
 */
const updateStorageBulk = async (userId, documentType, count) => {
  if (count === 0) return true;

  try {
    const UserStats = require('../models/UserStats');

    const sizeInBytes = DOCUMENT_SIZES[documentType];
    const totalChange = sizeInBytes * count;

    // Actualizar el campo de almacenamiento en UserStats
    const updateQuery = {
      $inc: {
        'storage.total': totalChange
      }
    };

    // También actualizar el contador específico del tipo
    updateQuery.$inc[`storage.${documentType}s`] = totalChange;

    await UserStats.findOneAndUpdate(
      { userId },
      updateQuery,
      { upsert: true, new: true }
    );

    logger.info(`[Storage] Actualización masiva para usuario ${userId}: +${bytesToMB(totalChange).toFixed(2)} MB (${count} ${documentType}s archivados)`);
    return true;
  } catch (error) {
    logger.error(`[Storage] Error en actualización masiva para usuario ${userId}: ${error.message}`);
    return false;
  }
};

module.exports = {
  DOCUMENT_SIZES,
  calculateDocumentSize,
  bytesToMB,
  updateStorageUsage,
  updateStorageBulk
};
