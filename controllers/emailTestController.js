const logger = require('../utils/logger');
const emailService = require('../services/emailService');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const { generateUpdatePaymentUrl } = require('../utils/stripeCustomerPortal');

/**
 * Lista de todos los templates disponibles con sus datos de ejemplo
 */
const getTemplateExamples = () => {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const supportEmail = process.env.SUPPORT_EMAIL || 'support@example.com';
  
  return {
    // Templates de suscripción
    subscriptionCreated: {
      category: 'subscription',
      description: 'Bienvenida a nueva suscripción',
      data: {
        userName: 'Juan Pérez',
        planName: 'Premium',
        nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('es-ES'),
        maxFolders: 999999,
        maxCalculators: 999999,
        maxContacts: 999999
      }
    },
    
    subscriptionCanceled: {
      category: 'subscription',
      description: 'Suscripción cancelada (con período de gracia)',
      data: {
        userName: 'María García',
        previousPlan: 'Premium',
        immediate: false,
        cancelDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('es-ES'),
        gracePeriodEnd: new Date(Date.now() + 22 * 24 * 60 * 60 * 1000).toLocaleDateString('es-ES')
      }
    },
    
    immediatelyCanceled: {
      category: 'subscription',
      description: 'Suscripción cancelada inmediatamente',
      data: {
        userName: 'Carlos López',
        previousPlan: 'Standard',
        immediate: true,
        gracePeriodEnd: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toLocaleDateString('es-ES'),
        foldersLimit: 5,
        calculatorsLimit: 3,
        contactsLimit: 10
      }
    },
    
    scheduledCancellation: {
      category: 'subscription',
      description: 'Cancelación programada',
      data: {
        userName: 'Ana Martínez',
        previousPlan: 'Premium',
        cancelDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('es-ES'),
        gracePeriodStart: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('es-ES'),
        gracePeriodEnd: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toLocaleDateString('es-ES')
      }
    },
    
    planDowngraded: {
      category: 'subscription',
      description: 'Downgrade de plan',
      data: {
        userName: 'Pedro Sánchez',
        previousPlan: 'Premium',
        newPlan: 'Standard',
        gracePeriodEnd: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toLocaleDateString('es-ES'),
        newLimits: {
          maxFolders: 50,
          maxCalculators: 20,
          maxContacts: 100
        },
        isDowngrade: true
      }
    },
    
    planUpgraded: {
      category: 'subscription',
      description: 'Upgrade de plan',
      data: {
        userName: 'Laura Rodríguez',
        previousPlan: 'Free',
        newPlan: 'Premium',
        newLimits: {
          maxFolders: 999999,
          maxCalculators: 999999,
          maxContacts: 999999
        },
        isUpgrade: true
      }
    },
    
    gracePeriodReminder: {
      category: 'subscription',
      description: 'Recordatorio de período de gracia',
      data: {
        userName: 'Roberto Díaz',
        daysRemaining: 3,
        gracePeriodEnd: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString('es-ES'),
        previousPlan: 'Premium',
        currentFolders: 75,
        currentCalculators: 25,
        currentContacts: 150,
        exceedsLimits: true,
        foldersToArchive: 25,
        calculatorsToArchive: 5,
        contactsToArchive: 50
      }
    },
    
    gracePeriodExpired: {
      category: 'subscription',
      description: 'Período de gracia expirado',
      data: {
        userName: 'Elena Fernández',
        targetPlan: 'free',
        totalArchived: 80,
        foldersArchived: 25,
        calculatorsArchived: 5,
        contactsArchived: 50,
        planLimits: {
          maxFolders: 5,
          maxCalculators: 3,
          maxContacts: 10,
          storageLimit: 50
        }
      }
    },
    
    // Templates de pagos fallidos
    paymentFailedFirst: {
      category: 'payment',
      description: 'Primer intento de pago fallido',
      data: {
        userName: 'Miguel Ruiz',
        userEmail: 'miguel@example.com',
        planName: 'Standard',
        amount: 29,
        currency: 'USD',
        nextRetryDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        failureReason: 'Tarjeta rechazada por fondos insuficientes',
        updatePaymentUrl: `${baseUrl}/update-payment-demo`
      }
    },
    
    paymentFailedSecond: {
      category: 'payment',
      description: 'Segundo intento de pago fallido',
      data: {
        userName: 'Isabel Torres',
        userEmail: 'isabel@example.com',
        daysUntilSuspension: 3,
        currentUsage: {
          folders: 45,
          calculators: 18,
          contacts: 95
        },
        updatePaymentUrl: `${baseUrl}/update-payment-demo`
      }
    },
    
    paymentFailedFinal: {
      category: 'payment',
      description: 'Último aviso - Suspensión de características',
      data: {
        userName: 'Francisco Moreno',
        userEmail: 'francisco@example.com',
        suspensionDate: new Date(),
        affectedFeatures: [
          'Calculadoras ilimitadas',
          'Exportación avanzada',
          'Soporte prioritario',
          'Carpetas vinculadas',
          'Sistema de reservas'
        ],
        updatePaymentUrl: `${baseUrl}/update-payment-demo`
      }
    },
    
    paymentFailedSuspension: {
      category: 'payment',
      description: 'Período de gracia por pagos fallidos',
      data: {
        userName: 'Carmen Jiménez',
        userEmail: 'carmen@example.com',
        planName: 'Premium',
        gracePeriodEndDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        itemsToArchive: {
          folders: 45,
          calculators: 17,
          contacts: 90
        },
        updatePaymentUrl: `${baseUrl}/update-payment-demo`,
        supportEmail: supportEmail
      }
    },
    
    paymentRecovered: {
      category: 'payment',
      description: 'Pago recuperado exitosamente',
      data: {
        userName: 'David Gómez',
        userEmail: 'david@example.com',
        planName: 'Standard',
        nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('es-ES')
      }
    }
  };
};

/**
 * Obtiene el HTML renderizado de uno o todos los templates
 */
exports.getTemplates = async (req, res) => {
  try {
    const { templateName, category, includeHtml } = req.query;
    const templates = getTemplateExamples();
    const emailTemplates = require('../services/emailService').emailTemplates;
    
    // Si se solicita un template específico
    if (templateName) {
      if (!templates[templateName]) {
        return res.status(404).json({
          error: 'Template no encontrado',
          availableTemplates: Object.keys(templates)
        });
      }
      
      const template = templates[templateName];
      
      if (!emailTemplates[templateName]) {
        return res.status(404).json({
          error: 'Template no implementado en emailService'
        });
      }
      
      const html = emailTemplates[templateName].html(template.data);
      const subject = emailTemplates[templateName].subject;
      
      return res.json({
        templateName,
        category: template.category,
        description: template.description,
        subject,
        html,
        exampleData: template.data
      });
    }
    
    // Si se solicita por categoría
    if (category) {
      const filteredTemplates = {};
      for (const [name, template] of Object.entries(templates)) {
        if (template.category === category) {
          const response = {
            category: template.category,
            description: template.description,
            exampleData: template.data
          };
          
          // Incluir HTML si se solicita
          if (includeHtml === 'true' && emailTemplates[name]) {
            response.subject = emailTemplates[name].subject;
            response.html = emailTemplates[name].html(template.data);
          }
          
          filteredTemplates[name] = response;
        }
      }
      
      return res.json({
        category,
        templates: filteredTemplates
      });
    }
    
    // Devolver lista de todos los templates
    const templateList = {};
    for (const [name, template] of Object.entries(templates)) {
      const response = {
        category: template.category,
        description: template.description
      };
      
      // Incluir HTML si se solicita
      if (includeHtml === 'true' && emailTemplates[name]) {
        response.subject = emailTemplates[name].subject;
        response.html = emailTemplates[name].html(template.data);
        response.exampleData = template.data;
      }
      
      templateList[name] = response;
    }
    
    res.json({
      availableTemplates: templateList,
      categories: ['subscription', 'payment']
    });
    
  } catch (error) {
    logger.error('Error obteniendo templates:', error);
    res.status(500).json({ error: 'Error al obtener templates' });
  }
};

/**
 * Envía un email de prueba con el template especificado
 */
exports.sendTestEmail = async (req, res) => {
  try {
    const { userId, userEmail, templateName, customData } = req.body;
    
    // Validar que venga userId o userEmail
    if (!userId && !userEmail) {
      return res.status(400).json({
        error: 'Se requiere userId o userEmail'
      });
    }
    
    if (!templateName) {
      return res.status(400).json({
        error: 'Se requiere templateName'
      });
    }
    
    // Obtener el usuario
    let user;
    if (userId) {
      user = await User.findById(userId);
    } else {
      user = await User.findOne({ email: userEmail });
    }
    
    if (!user) {
      return res.status(404).json({
        error: 'Usuario no encontrado'
      });
    }
    
    // Obtener datos de ejemplo para el template
    const templates = getTemplateExamples();
    if (!templates[templateName]) {
      return res.status(404).json({
        error: 'Template no encontrado',
        availableTemplates: Object.keys(templates)
      });
    }
    
    const templateExample = templates[templateName];
    let emailData = { ...templateExample.data };
    
    // Sobrescribir con datos del usuario real
    emailData.userName = user.firstName || user.name || user.email.split('@')[0];
    emailData.userEmail = user.email;
    
    // Si el template necesita updatePaymentUrl, generarlo real
    if (emailData.updatePaymentUrl && user.stripeCustomerId) {
      try {
        const subscription = await Subscription.findOne({ user: user._id });
        if (subscription && subscription.stripeCustomerId) {
          emailData.updatePaymentUrl = await generateUpdatePaymentUrl(
            subscription.stripeCustomerId,
            `${process.env.BASE_URL}/billing/payment-updated`
          );
        }
      } catch (error) {
        logger.warn('No se pudo generar URL real de Stripe, usando demo');
      }
    }
    
    // Sobrescribir con datos personalizados si se proporcionan
    if (customData) {
      emailData = { ...emailData, ...customData };
    }
    
    // Marcar como modo test para que se aplique el filtro de whitelist
    global.currentWebhookTestMode = true;
    
    // Determinar qué método usar según la categoría
    const category = templateExample.category;
    
    try {
      if (category === 'subscription') {
        // Para templates de suscripción
        const eventMap = {
          subscriptionCreated: 'created',
          subscriptionCanceled: 'canceled',
          immediatelyCanceled: 'canceled',
          scheduledCancellation: 'scheduledCancellation',
          planDowngraded: 'planDowngraded',
          planUpgraded: 'planUpgraded',
          gracePeriodReminder: 'gracePeriodReminder',
          gracePeriodExpired: 'gracePeriodExpired'
        };
        
        const event = eventMap[templateName];
        if (event) {
          await emailService.sendSubscriptionEmail(user, event, emailData);
        }
      } else if (category === 'payment') {
        // Para templates de pago
        if (templateName === 'paymentRecovered') {
          await emailService.sendPaymentEmail(user, 'paymentRecovered', emailData);
        } else if (templateName.startsWith('paymentFailed')) {
          const typeMap = {
            paymentFailedFirst: 'first',
            paymentFailedSecond: 'second',
            paymentFailedFinal: 'final',
            paymentFailedSuspension: 'suspension'
          };
          
          const type = typeMap[templateName];
          if (type) {
            await emailService.sendPaymentFailedEmail(user.email, emailData, type);
          }
        }
      }
      
      res.json({
        success: true,
        message: `Email de prueba enviado exitosamente`,
        template: templateName,
        recipient: user.email,
        testMode: true,
        data: emailData
      });
      
    } catch (emailError) {
      throw emailError;
    } finally {
      // Restaurar modo normal
      global.currentWebhookTestMode = false;
    }
    
  } catch (error) {
    logger.error('Error enviando email de prueba:', error);
    res.status(500).json({
      error: 'Error al enviar email de prueba',
      message: error.message
    });
  }
};

/**
 * Envía todos los templates a un usuario (útil para revisión completa)
 */
exports.sendAllTestEmails = async (req, res) => {
  try {
    const { userId, userEmail, category, delay = 2000 } = req.body;
    
    // Validar que venga userId o userEmail
    if (!userId && !userEmail) {
      return res.status(400).json({
        error: 'Se requiere userId o userEmail'
      });
    }
    
    // Obtener el usuario
    let user;
    if (userId) {
      user = await User.findById(userId);
    } else {
      user = await User.findOne({ email: userEmail });
    }
    
    if (!user) {
      return res.status(404).json({
        error: 'Usuario no encontrado'
      });
    }
    
    // Marcar como modo test
    global.currentWebhookTestMode = true;
    
    const templates = getTemplateExamples();
    const results = [];
    const errors = [];
    
    // Filtrar por categoría si se especifica
    let templatesToSend = Object.entries(templates);
    if (category) {
      templatesToSend = templatesToSend.filter(([_, template]) => template.category === category);
    }
    
    // Enviar cada template con delay entre ellos
    for (const [templateName, templateExample] of templatesToSend) {
      try {
        // Preparar datos
        let emailData = { ...templateExample.data };
        emailData.userName = user.firstName || user.name || user.email.split('@')[0];
        emailData.userEmail = user.email;
        
        // Generar URL real si es necesario
        if (emailData.updatePaymentUrl && user.stripeCustomerId) {
          try {
            const subscription = await Subscription.findOne({ user: user._id });
            if (subscription && subscription.stripeCustomerId) {
              emailData.updatePaymentUrl = await generateUpdatePaymentUrl(
                subscription.stripeCustomerId,
                `${process.env.BASE_URL}/billing/payment-updated`
              );
            }
          } catch (error) {
            logger.warn('No se pudo generar URL real de Stripe para', templateName);
          }
        }
        
        // Enviar según categoría
        if (templateExample.category === 'subscription') {
          const eventMap = {
            subscriptionCreated: 'created',
            subscriptionCanceled: 'canceled',
            immediatelyCanceled: 'canceled',
            scheduledCancellation: 'scheduledCancellation',
            planDowngraded: 'planDowngraded',
            planUpgraded: 'planUpgraded',
            gracePeriodReminder: 'gracePeriodReminder',
            gracePeriodExpired: 'gracePeriodExpired'
          };
          
          const event = eventMap[templateName];
          if (event) {
            await emailService.sendSubscriptionEmail(user, event, emailData);
          }
        } else if (templateExample.category === 'payment') {
          if (templateName === 'paymentRecovered') {
            await emailService.sendPaymentEmail(user, 'paymentRecovered', emailData);
          } else if (templateName.startsWith('paymentFailed')) {
            const typeMap = {
              paymentFailedFirst: 'first',
              paymentFailedSecond: 'second',
              paymentFailedFinal: 'final',
              paymentFailedSuspension: 'suspension'
            };
            
            const type = typeMap[templateName];
            if (type) {
              await emailService.sendPaymentFailedEmail(user.email, emailData, type);
            }
          }
        }
        
        results.push({
          template: templateName,
          status: 'sent',
          description: templateExample.description
        });
        
        // Esperar entre emails
        if (delay > 0) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
      } catch (error) {
        errors.push({
          template: templateName,
          error: error.message
        });
      }
    }
    
    // Restaurar modo normal
    global.currentWebhookTestMode = false;
    
    res.json({
      success: true,
      message: `Proceso de envío completado`,
      recipient: user.email,
      totalTemplates: templatesToSend.length,
      sent: results.length,
      failed: errors.length,
      results,
      errors: errors.length > 0 ? errors : undefined
    });
    
  } catch (error) {
    global.currentWebhookTestMode = false;
    logger.error('Error enviando todos los emails:', error);
    res.status(500).json({
      error: 'Error al enviar emails de prueba',
      message: error.message
    });
  }
};

