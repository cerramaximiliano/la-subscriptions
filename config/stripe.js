const dotenv = require('dotenv');
const logger = require('../utils/logger');
dotenv.config();

// Seleccionar la clave de API según el entorno
const stripeSecretKey = process.env.NODE_ENV === 'production'
  ? process.env.STRIPE_SECRET_KEY
  : process.env.STRIPE_API_KEY_DEV;

// Inicializar la instancia de Stripe con la clave apropiada
const stripe = require('stripe')(stripeSecretKey);

// Planes de suscripción
const SUBSCRIPTION_PLANS = {
  FREE: 'free',
  STANDARD: 'standard',
  PREMIUM: 'premium'
};

// Configuración de productos y precios para Stripe
const getStripeProductConfigs = () => {
  return [
    {
      id: SUBSCRIPTION_PLANS.STANDARD,
      name: 'Plan Estándar',
      description: 'Plan con funcionalidades adicionales para profesionales',
      default_price_data: {
        currency: 'usd',
        unit_amount: 1999, // $19.99 (en centavos)
        recurring: {
          interval: 'month'
        }
      }
    },
    {
      id: SUBSCRIPTION_PLANS.PREMIUM,
      name: 'Plan Premium',
      description: 'Plan completo con todas las funcionalidades',
      default_price_data: {
        currency: 'usd',
        unit_amount: 4999, // $49.99 (en centavos)
        recurring: {
          interval: 'month'
        }
      }
    }
  ];
};

// Función para inicializar los productos y precios en Stripe si no existen
const initializeStripeProducts = async () => {
  try {
    const products = getStripeProductConfigs();
    
    // Verificar y crear productos si no existen
    for (const productConfig of products) {
      const existingProducts = await stripe.products.list({
        active: true
      });

      const product = existingProducts.data.find(p => p.id === productConfig.id);
      
      if (!product) {
        logger.info(`Creando producto Stripe: ${productConfig.name}`);
        await stripe.products.create(productConfig);
      } else {
        // Si el producto existe pero necesita actualizarse
        logger.info(`Actualizando producto Stripe: ${productConfig.name}`);
        
        // Actualizar el producto (nombre, descripción, etc.)
        await stripe.products.update(product.id, {
          name: productConfig.name,
          description: productConfig.description,
        });
        
        // Verificar si hay cambios en el precio
        if (product.default_price) {
          const price = await stripe.prices.retrieve(product.default_price);
          
          // Si hay diferencias en el precio, crear un nuevo precio predeterminado
          if (price.unit_amount !== productConfig.default_price_data.unit_amount || 
              price.currency !== productConfig.default_price_data.currency) {
            
            logger.info(`Actualizando precio de ${productConfig.name}: ${price.unit_amount/100} a ${productConfig.default_price_data.unit_amount/100} ${productConfig.default_price_data.currency}`);
            
            // Crear un nuevo precio
            const newPrice = await stripe.prices.create({
              product: product.id,
              currency: productConfig.default_price_data.currency,
              unit_amount: productConfig.default_price_data.unit_amount,
              recurring: productConfig.default_price_data.recurring
            });
            
            // Establecer el nuevo precio como predeterminado
            await stripe.products.update(product.id, {
              default_price: newPrice.id
            });
          }
        }
      }
    }

    logger.info('Configuración de Stripe inicializada correctamente');
    return true;
  } catch (error) {
    logger.error('Error al inicializar productos de Stripe:', error);
    throw error;
  }
};

// Función para sincronizar PlanConfig con los productos de Stripe
const syncStripePlansWithDatabase = async () => {
  try {
    // Importamos aquí para evitar dependencias cíclicas
    const PlanConfig = require('../models/PlanConfig');
    
    // Obtener todos los productos activos de Stripe
    const stripeProducts = await stripe.products.list({
      active: true
    });
    
    const results = [];
    
    // Para cada producto de pago en Stripe
    for (const product of stripeProducts.data) {
      // Solo sincronizar productos que correspondan a nuestros planes
      const validPlanId = Object.values(SUBSCRIPTION_PLANS).includes(product.id);
      if (validPlanId && product.id !== SUBSCRIPTION_PLANS.FREE) {
        logger.info(`Sincronizando producto Stripe: ${product.name} (${product.id})`);
        
        // Obtener el precio predeterminado del producto
        if (product.default_price) {
          const price = await stripe.prices.retrieve(product.default_price);
          
          // Buscar la configuración del plan en la base de datos
          let planConfig = await PlanConfig.findOne({ planId: product.id });
          
          if (planConfig) {
            logger.info(`Actualizando configuración del plan: ${planConfig.displayName}`);
            
            // Actualizar información de precios en el PlanConfig
            planConfig.displayName = product.name;
            planConfig.description = product.description;
            planConfig.pricingInfo.basePrice = price.unit_amount / 100; // Convertir centavos a unidades
            planConfig.pricingInfo.currency = price.currency.toUpperCase();
            planConfig.pricingInfo.stripePriceId = price.id;
            planConfig.pricingInfo.billingPeriod = price.recurring.interval === 'month' ? 'monthly' : 'annual';
            
            await planConfig.save();
            logger.info(`Plan ${product.id} sincronizado correctamente con Stripe`);
            
            results.push({
              planId: product.id, 
              displayName: product.name,
              synced: true
            });
          } else {
            // Si no existe en la base de datos pero existe en Stripe, crearlo
            logger.info(`Creando nueva configuración de plan para: ${product.name} (${product.id})`);
            
            planConfig = new PlanConfig({
              planId: product.id,
              displayName: product.name,
              description: product.description || `Plan ${product.name}`,
              isActive: true,
              isDefault: false,
              resourceLimits: product.id === SUBSCRIPTION_PLANS.STANDARD ? [
                { name: 'folders', limit: 50, description: 'Número máximo de carpetas' },
                { name: 'calculators', limit: 20, description: 'Número máximo de calculadoras' },
                { name: 'contacts', limit: 100, description: 'Número máximo de contactos' },
                { name: 'storage', limit: 1024, description: 'Almacenamiento máximo en MB' }
              ] : [
                { name: 'folders', limit: 999999, description: 'Número máximo de carpetas' },
                { name: 'calculators', limit: 999999, description: 'Número máximo de calculadoras' },
                { name: 'contacts', limit: 999999, description: 'Número máximo de contactos' },
                { name: 'storage', limit: 10240, description: 'Almacenamiento máximo en MB' }
              ],
              features: product.id === SUBSCRIPTION_PLANS.STANDARD ? [
                { name: 'advancedAnalytics', enabled: false, description: 'Análisis avanzados' },
                { name: 'exportReports', enabled: true, description: 'Exportación de reportes' },
                { name: 'taskAutomation', enabled: false, description: 'Automatización de tareas' },
                { name: 'bulkOperations', enabled: true, description: 'Operaciones masivas' },
                { name: 'prioritySupport', enabled: false, description: 'Soporte prioritario' }
              ] : [
                { name: 'advancedAnalytics', enabled: true, description: 'Análisis avanzados' },
                { name: 'exportReports', enabled: true, description: 'Exportación de reportes' },
                { name: 'taskAutomation', enabled: true, description: 'Automatización de tareas' },
                { name: 'bulkOperations', enabled: true, description: 'Operaciones masivas' },
                { name: 'prioritySupport', enabled: true, description: 'Soporte prioritario' }
              ],
              pricingInfo: {
                basePrice: price.unit_amount / 100,
                currency: price.currency.toUpperCase(),
                billingPeriod: price.recurring.interval === 'month' ? 'monthly' : 'annual',
                stripePriceId: price.id
              }
            });
            
            await planConfig.save();
            logger.info(`Nuevo plan ${product.id} creado en base de datos desde Stripe`);
            
            results.push({
              planId: product.id, 
              displayName: product.name,
              synced: true,
              created: true
            });
          }
        } else {
          results.push({
            planId: product.id,
            displayName: product.name,
            synced: false,
            error: 'El producto no tiene un precio predeterminado'
          });
        }
      } else if (!validPlanId) {
        results.push({
          planId: product.id,
          displayName: product.name,
          synced: false,
          error: 'ID de producto no reconocido en la configuración de planes'
        });
      }
    }

    return results;
  } catch (error) {
    logger.error('Error al sincronizar planes con Stripe:', error);
    throw error;
  }
};

module.exports = {
  stripe,
  SUBSCRIPTION_PLANS,
  initializeStripeProducts,
  syncStripePlansWithDatabase,
  getStripeProductConfigs
};