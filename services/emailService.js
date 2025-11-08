const { SESClient, SendEmailCommand, GetIdentityVerificationAttributesCommand, GetSendQuotaCommand } = require('@aws-sdk/client-ses');
const logger = require('../utils/logger');
const EmailTemplate = require('../models/EmailTemplate');
const { fillTemplate, validateTemplateData } = require('../utils/templateHelper');

// Configurar cliente SES
const sesClient = new SESClient({
  region: process.env.AWS_REGION || 'us-east-1', // Cambiar a us-east-1 donde los emails están verificados
  credentials: {
    accessKeyId: process.env.AWS_SES_KEY_ID,
    secretAccessKey: process.env.AWS_SES_ACCESS_KEY,
  }
});

// Whitelist de emails para modo test
const TEST_EMAIL_WHITELIST = process.env.TEST_EMAIL_WHITELIST 
  ? process.env.TEST_EMAIL_WHITELIST.split(',').map(email => email.trim())
  : ['cerramaximiliano@gmail.com', 'cerramaximiliano@protonmail.com'];

// Función para verificar si debemos filtrar emails
const shouldFilterEmail = (toEmail) => {
  // Solo filtrar si estamos en modo test (global flag seteado por webhook controller)
  if (global.currentWebhookTestMode) {
    const isWhitelisted = TEST_EMAIL_WHITELIST.includes(toEmail);
    
    if (!isWhitelisted) {
      logger.warn(`📧 EMAIL BLOQUEADO (Modo Test) - Email original: ${toEmail}`);
      logger.info(`📋 Whitelist actual: ${TEST_EMAIL_WHITELIST.join(', ')}`);
      logger.info(`💡 Para recibir este email, agregue "${toEmail}" a TEST_EMAIL_WHITELIST en .env`);
      
      // Seleccionar un email de la whitelist para enviar en su lugar
      const replacementEmail = TEST_EMAIL_WHITELIST[0];
      logger.info(`✉️  Email será enviado a: ${replacementEmail} (en lugar de ${toEmail})`);
      
      return { shouldBlock: false, replacementEmail }; // No bloqueamos, redirigimos
    }
    
    return { shouldBlock: false, replacementEmail: toEmail };
  }
  
  // No estamos en modo test, enviar normalmente
  return { shouldBlock: false, replacementEmail: toEmail };
};

// Plantillas de email
const emailTemplates = {
  subscriptionCreated: {
    subject: 'Bienvenido a tu nueva suscripción',
    html: (data) => `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #5D5FEF; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background-color: #f4f4f4; }
            .button { display: inline-block; padding: 10px 20px; background-color: #5D5FEF; color: white; text-decoration: none; border-radius: 5px; }
            .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>¡Bienvenido!</h1>
            </div>
            <div class="content">
              <p>Hola ${data.userName || 'Usuario'},</p>
              <p>Tu suscripción al plan <strong>${data.planName}</strong> ha sido activada exitosamente.</p>
              <p>Ahora tienes acceso a:</p>
              <ul>
                <li>Máximo de carpetas: ${data.maxFolders}</li>
                <li>Máximo de cálculos: ${data.maxCalculators}</li>
                <li>Máximo de contactos: ${data.maxContacts}</li>
              </ul>
              <p>Tu próxima fecha de facturación es: <strong>${data.nextBillingDate}</strong></p>
              <p style="text-align: center; margin-top: 30px;">
                <a href="${process.env.BASE_URL}/dashboard" class="button">Ir al Dashboard</a>
              </p>
            </div>
            <div class="footer">
              <p>Si tienes alguna pregunta, no dudes en contactarnos.</p>
            </div>
          </div>
        </body>
        </html>
      `
  },
  subscriptionCanceled: {
    subject: 'Tu suscripción ha sido cancelada',
    html: (data) => `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #FF6B6B; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background-color: #f4f4f4; }
            .warning { background-color: #FFF3CD; border: 1px solid #FFEEBA; padding: 15px; margin: 20px 0; border-radius: 5px; }
            .button { display: inline-block; padding: 10px 20px; background-color: #5D5FEF; color: white; text-decoration: none; border-radius: 5px; }
            .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Suscripción Cancelada</h1>
            </div>
            <div class="content">
              <p>Hola ${data.userName || 'Usuario'},</p>
              <p>Tu suscripción al plan <strong>${data.previousPlan}</strong> ${data.immediate ? 'ha sido cancelada' : 'se cancelará el ' + data.cancelDate}.</p>
              
              <div class="warning">
                <h3>⚠️ Período de Gracia Activado</h3>
                <p>Tienes un período de gracia de 15 días hasta el <strong>${data.gracePeriodEnd}</strong> para:</p>
                <ul>
                  <li>Exportar tus datos</li>
                  <li>Archivar elementos que excedan los límites del plan gratuito</li>
                  <li>Reactivar tu suscripción si cambias de opinión</li>
                </ul>
              </div>
              
              <p><strong>Nuevos límites del plan gratuito:</strong></p>
              <ul>
                <li>Máximo de carpetas: 5</li>
                <li>Máximo de cálculos: 3</li>
                <li>Máximo de contactos: 10</li>
              </ul>
              
              <p style="text-align: center; margin-top: 30px;">
                <a href="${process.env.BASE_URL}/subscription" class="button">Gestionar Suscripción</a>
              </p>
            </div>
            <div class="footer">
              <p>Lamentamos verte partir. Si cambias de opinión, siempre puedes reactivar tu suscripción.</p>
            </div>
          </div>
        </body>
        </html>
      `
  },
  gracePeriodReminder: {
    subject: 'Recordatorio: Tu período de gracia está por vencer',
    html: (data) => `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #FFA500; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background-color: #f4f4f4; }
            .urgent { background-color: #FFE4E1; border: 2px solid #FF6B6B; padding: 15px; margin: 20px 0; border-radius: 5px; }
            .button { display: inline-block; padding: 10px 20px; background-color: #5D5FEF; color: white; text-decoration: none; border-radius: 5px; }
            .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>⏰ Período de Gracia por Vencer</h1>
            </div>
            <div class="content">
              <p>Hola ${data.userName || 'Usuario'},</p>
              
              <div class="urgent">
                <h3>🚨 Acción Requerida</h3>
                <p>Tu período de gracia vence en <strong>${data.daysRemaining} días</strong> (${data.gracePeriodEnd}).</p>
                <p>Después de esta fecha, los elementos que excedan los límites del plan gratuito serán archivados automáticamente.</p>
              </div>
              
              <p><strong>Estado actual de tus recursos:</strong></p>
              <ul>
                <li>Carpetas: ${data.currentFolders} / ${data.planLimits?.maxFolders || 5} (límite plan ${data.targetPlan || 'gratuito'})</li>
                <li>Cálculos: ${data.currentCalculators} / ${data.planLimits?.maxCalculators || 3} (límite plan ${data.targetPlan || 'gratuito'})</li>
                <li>Contactos: ${data.currentContacts} / ${data.planLimits?.maxContacts || 10} (límite plan ${data.targetPlan || 'gratuito'})</li>
              </ul>

              ${(data.foldersToArchive > 0 || data.calculatorsToArchive > 0 || data.contactsToArchive > 0) ? `
                <p><strong>⚠️ Elementos que serán archivados:</strong></p>
                <ul>
                  ${data.foldersToArchive > 0 ? `<li>${data.foldersToArchive} carpetas</li>` : ''}
                  ${data.calculatorsToArchive > 0 ? `<li>${data.calculatorsToArchive} cálculos</li>` : ''}
                  ${data.contactsToArchive > 0 ? `<li>${data.contactsToArchive} contactos</li>` : ''}
                </ul>
              ` : ''}

              <p style="text-align: center; margin-top: 30px;">
                <a href="https://lawanalytics.app/apps/profiles/account/settings" class="button">Reactivar Suscripción</a>
              </p>
            </div>
            <div class="footer">
              <p>No pierdas acceso a tus datos. Reactiva tu suscripción hoy.</p>
            </div>
          </div>
        </body>
        </html>
      `
  },
  gracePeriodExpired: {
    subject: 'Período de gracia finalizado - Archivado automático completado',
    html: (data) => `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #6C757D; color: white; padding: 20px; text-align: 
  center; }
          .content { padding: 20px; background-color: #f4f4f4; }
          .info { background-color: #E3F2FD; border: 1px solid #90CAF9; padding: 15px; 
  margin: 20px 0; border-radius: 5px; }
          .stats { background-color: #FFF3CD; border: 1px solid #FFEEBA; padding: 15px; 
  margin: 20px 0; border-radius: 5px; }
          .button { display: inline-block; padding: 10px 20px; background-color: 
  #5D5FEF; color: white; text-decoration: none; border-radius: 5px; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Período de Gracia Finalizado</h1>
          </div>
          <div class="content">
            <p>Hola ${data.userName || 'Usuario'},</p>
            <p>Tu período de gracia ha finalizado y hemos procedido con el archivado 
  automático de elementos que excedían los límites del plan ${data.targetPlan ||
      'gratuito'}.</p>
            
            ${data.totalArchived > 0 ? `
              <div class="info">
                <h3>📦 Resumen del Archivado</h3>
                <ul>
                  ${data.foldersArchived > 0 ? `<li>Carpetas archivadas: 
  ${data.foldersArchived}</li>` : ''}
                  ${data.calculatorsArchived > 0 ? `<li>Cálculos archivados: 
  ${data.calculatorsArchived}</li>` : ''}
                  ${data.contactsArchived > 0 ? `<li>Contactos archivados: 
  ${data.contactsArchived}</li>` : ''}
                </ul>
                <p><strong>Total de elementos archivados: 
  ${data.totalArchived}</strong></p>
                <p>Los elementos archivados no han sido eliminados. Puedes recuperarlos 
  en cualquier momento actualizando tu plan.</p>
              </div>
            ` : `
              <div class="info">
                <h3>✅ No se requirió archivado</h3>
                <p>Todos tus recursos estaban dentro de los límites del plan 
  ${data.targetPlan}.</p>
              </div>
            `}
            
            <div class="stats">
              <h3>📊 Límites actuales de tu plan ${data.targetPlan || 'gratuito'}:</h3>
              <ul>
                <li>Máximo de carpetas: ${data.planLimits?.maxFolders || 5}</li>
                <li>Máximo de cálculos: ${data.planLimits?.maxCalculators || 3}</li>
                <li>Máximo de contactos: ${data.planLimits?.maxContacts || 10}</li>
                <li>Almacenamiento: ${data.planLimits?.storageLimit || 50} MB</li>
              </ul>
            </div>
            
            <p style="text-align: center; margin-top: 30px;">
              <a href="${process.env.BASE_URL}/subscription" 
  class="button">Actualizar Plan</a>
            </p>
          </div>
          <div class="footer">
            <p>Recupera el acceso completo a tus datos actualizando tu plan.</p>
          </div>
        </div>
      </body>
      </html>
    `
  },
  scheduledCancellation: {
    subject: 'Cancelación programada de tu suscripción',
    html: (data) => `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          /* estilos... */
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Cancelación Programada</h1>
          </div>
          <div class="content">
            <p>Hola ${data.userName || 'Usuario'},</p>
            <p>Tu suscripción al plan <strong>${data.previousPlan}</strong> se cancelará el 
  <strong>${data.cancelDate}</strong>.</p>
            
            <div class="info">
              <h3>📅 Fechas importantes:</h3>
              <ul>
                <li><strong>Último día de servicio premium:</strong> ${data.cancelDate}</li>
                <li><strong>Inicio del período de gracia:</strong> ${data.gracePeriodStart}</li>
                <li><strong>Fin del período de gracia:</strong> ${data.gracePeriodEnd}</li>
              </ul>
              <p>Durante el período de gracia tendrás 15 días para ajustar tus datos a los límites del plan gratuito.</p>
            </div>
            
            <p>Puedes cancelar este cambio en cualquier momento antes del ${data.cancelDate} desde tu panel de control.</p>
            
            <p style="text-align: center; margin-top: 30px;">
              <a href="${process.env.BASE_URL}/subscription" class="button">Gestionar Suscripción</a>
            </p>
          </div>
        </div>
      </body>
      </html>
    `
  },
  immediatelyCanceled: {
    subject: '⚠️ Tu suscripción ha sido cancelada',
    html: (data) => `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          /* mismos estilos que las otras plantillas */
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header" style="background-color: #FF6B6B;">
            <h1>Suscripción Cancelada</h1>
          </div>
          <div class="content">
            <p>Hola ${data.userName || 'Usuario'},</p>
            <p>Tu suscripción al plan <strong>${data.previousPlan}</strong> ha sido cancelada inmediatamente.</p>
            
            <div class="warning" style="background-color: #FFE4E1; border: 2px solid #FF6B6B; padding: 15px; margin: 
  20px 0; border-radius: 5px;">
              <h3>⚠️ Acción Inmediata Requerida</h3>
              <p>Tu cuenta ha pasado al <strong>plan gratuito</strong> con efecto inmediato.</p>
              <p>Tienes un período de gracia hasta el <strong>${data.gracePeriodEnd}</strong> para ajustar tus 
  datos.</p>
            </div>
            
            <p><strong>Límites del plan gratuito:</strong></p>
            <ul>
              <li>Máximo ${data.foldersLimit} carpetas</li>
              <li>Máximo ${data.calculatorsLimit} cálculos</li>
              <li>Máximo ${data.contactsLimit} contactos</li>
            </ul>
            
            <p>Después del ${data.gracePeriodEnd}, los elementos que excedan estos límites serán archivados 
  automáticamente.</p>
            
            <p style="text-align: center; margin-top: 30px;">
              <a href="${process.env.BASE_URL}/subscription" class="button">Reactivar Suscripción</a>
            </p>
          </div>
          <div class="footer">
            <p>Si esto fue un error, puedes reactivar tu suscripción inmediatamente.</p>
          </div>
        </div>
      </body>
      </html>
    `
  },
  planDowngraded: {
    subject: 'Cambio de plan - Período de ajuste activado',
    html: (data) => `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          /* mismos estilos base */
          .comparison-table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
          }
          .comparison-table th, .comparison-table td {
            padding: 10px;
            border: 1px solid #ddd;
            text-align: left;
          }
          .comparison-table th {
            background-color: #f4f4f4;
          }
          .exceeded {
            color: #FF6B6B;
            font-weight: bold;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header" style="background-color: #FFA500;">
            <h1>Cambio de Plan</h1>
          </div>
          <div class="content">
            <p>Hola ${data.userName || 'Usuario'},</p>
            <p>Has cambiado del plan <strong>${data.previousPlan}</strong> al plan 
  <strong>${data.newPlan}</strong>.</p>
            
            <div class="info">
              <h3>📊 Comparación de límites:</h3>
              <table class="comparison-table">
                <tr>
                  <th>Recurso</th>
                  <th>Plan ${data.previousPlan}</th>
                  <th>Plan ${data.newPlan}</th>
                </tr>
                <tr>
                  <td>Carpetas</td>
                  <td>${data.previousPlan === 'Premium' ? 'Ilimitadas' : '50'}</td>
                  <td>${data.newLimits.maxFolders}</td>
                </tr>
                <tr>
                  <td>Cálculos</td>
                  <td>${data.previousPlan === 'Premium' ? 'Ilimitadas' : '20'}</td>
                  <td>${data.newLimits.maxCalculators}</td>
                </tr>
                <tr>
                  <td>Contactos</td>
                  <td>${data.previousPlan === 'Premium' ? 'Ilimitados' : '100'}</td>
                  <td>${data.newLimits.maxContacts}</td>
                </tr>
              </table>
            </div>
            
            <div class="warning">
              <h3>⏰ Período de ajuste de 15 días</h3>
              <p>Tienes hasta el <strong>${data.gracePeriodEnd}</strong> para ajustar tus 
  datos a los nuevos límites.</p>
              <p>Después de esta fecha, los elementos que excedan los límites serán 
  archivados automáticamente.</p>
            </div>
            
            <p style="text-align: center; margin-top: 30px;">
              <a href="${process.env.BASE_URL}/subscription" class="button">Gestionar 
  Datos</a>
            </p>
          </div>
        </div>
      </body>
      </html>
    `
  },
  planUpgraded: {
    subject: '🎉 ¡Plan mejorado exitosamente!',
    html: (data) => `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          /* mismos estilos base */
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header" style="background-color: #4CAF50;">
            <h1>¡Felicitaciones!</h1>
          </div>
          <div class="content">
            <p>Hola ${data.userName || 'Usuario'},</p>
            <p>Has mejorado exitosamente del plan <strong>${data.previousPlan}</strong> al 
  plan <strong>${data.newPlan}</strong>.</p>
            
            <div class="info" style="background-color: #E8F5E9; border-color: #4CAF50;">
              <h3>🚀 Tus nuevos límites:</h3>
              <ul>
                <li>Carpetas: ${data.newLimits.maxFolders === 999999 ? 'Ilimitadas' :
        data.newLimits.maxFolders}</li>
                <li>Cálculos: ${data.newLimits.maxCalculators === 999999 ? 'Ilimitados'
        : data.newLimits.maxCalculators}</li>
                <li>Contactos: ${data.newLimits.maxContacts === 999999 ? 'Ilimitados' :
        data.newLimits.maxContacts}</li>
              </ul>
            </div>
            
            <p>Todos tus datos archivados (si los hay) serán restaurados automáticamente 
  hasta los nuevos límites.</p>
            
            <p style="text-align: center; margin-top: 30px;">
              <a href="${process.env.BASE_URL}/dashboard" class="button">Ir al 
  Dashboard</a>
            </p>
          </div>
        </div>
      </body>
      </html>
    `
  },
  
  // Plantillas para pagos fallidos
  paymentFailedFirst: {
    subject: '⚠️ Problema con tu pago - {{planName}}',
    html: (data) => `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #FFA500; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f4f4f4; }
          .info { background-color: #f8f9fa; border: 1px solid #dee2e6; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .button { display: inline-block; padding: 12px 24px; background-color: #007bff; color: white; text-decoration: none; border-radius: 4px; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Problema con tu pago</h1>
          </div>
          <div class="content">
            <p>Hola ${data.userName || data.userEmail?.split('@')[0] || 'Usuario'},</p>
            
            <p>Tuvimos un problema al procesar tu pago de <strong>${data.amount} ${data.currency}</strong> 
            para tu suscripción ${data.planName.replace('{{planName}}', data.planName)}.</p>
            
            <div class="info">
              <p><strong>Razón del fallo:</strong> ${data.failureReason}</p>
              <p><strong>Próximo intento:</strong> ${data.nextRetryDate ? new Date(data.nextRetryDate).toLocaleDateString('es-ES') : 'No programado'}</p>
            </div>
            
            <p>No te preocupes, intentaremos procesar el pago nuevamente automáticamente. 
            Sin embargo, puedes actualizar tu método de pago ahora para evitar interrupciones:</p>
            
            <p style="text-align: center; margin-top: 30px;">
              <a href="${data.updatePaymentUrl}" class="button">
                Actualizar método de pago
              </a>
            </p>
            
            <p style="color: #6c757d; font-size: 14px; margin-top: 30px;">
              Tu acceso continúa activo mientras resolvemos este problema.
            </p>
          </div>
          <div class="footer">
            <p>Si tienes alguna pregunta, responde a este email.</p>
          </div>
        </div>
      </body>
      </html>
    `
  },
  
  paymentFailedSecond: {
    subject: '⚠️ Segundo intento de pago fallido - Acción requerida',
    html: (data) => `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #dc3545; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f4f4f4; }
          .warning { background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .button { display: inline-block; padding: 12px 24px; background-color: #dc3545; color: white; text-decoration: none; border-radius: 4px; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Segundo intento fallido</h1>
          </div>
          <div class="content">
            <p>Hola ${data.userName || data.userEmail?.split('@')[0] || 'Usuario'},</p>
            
            <p style="color: #dc3545;">No hemos podido procesar tu pago por segunda vez.</p>
            
            <div class="warning">
              <h3 style="color: #856404; margin-top: 0;">
                ⏰ Tienes ${data.daysUntilSuspension} días para actualizar tu método de pago
              </h3>
              <p>Después de este período, algunas características premium serán suspendidas.</p>
            </div>
            
            <h3>Tu uso actual:</h3>
            <ul>
              <li>Carpetas: ${data.currentUsage.folders}</li>
              <li>Cálculos: ${data.currentUsage.calculators}</li>
              <li>Contactos: ${data.currentUsage.contacts}</li>
            </ul>
            
            <p style="text-align: center; margin-top: 30px;">
              <a href="${data.updatePaymentUrl}" class="button">
                Actualizar método de pago ahora
              </a>
            </p>
            
            <p style="margin-top: 30px;">
              <strong>¿Necesitas ayuda?</strong><br>
              Responde a este email y nuestro equipo te asistirá inmediatamente.
            </p>
          </div>
          <div class="footer">
            <p>No pierdas acceso a tus características premium.</p>
          </div>
        </div>
      </body>
      </html>
    `
  },
  
  paymentFailedFinal: {
    subject: '🚨 Último aviso - Características premium suspendidas',
    html: (data) => `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #721c24; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f4f4f4; }
          .alert { background-color: #f8d7da; border: 1px solid #f5c6cb; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .button { display: inline-block; padding: 12px 24px; background-color: #28a745; color: white; text-decoration: none; border-radius: 4px; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Características suspendidas</h1>
          </div>
          <div class="content">
            <p>Hola ${data.userName || data.userEmail?.split('@')[0] || 'Usuario'},</p>
            
            <p style="color: #dc3545; font-weight: bold;">
              No hemos podido procesar tu pago después de múltiples intentos.
            </p>
            
            <div class="alert">
              <h3 style="color: #721c24; margin-top: 0;">
                Características suspendidas desde ${new Date(data.suspensionDate).toLocaleDateString('es-ES')}:
              </h3>
              <ul style="color: #721c24;">
                ${data.affectedFeatures.map(feature => `<li>${feature}</li>`).join('')}
              </ul>
            </div>
            
            <p><strong>Importante:</strong> Tus datos están seguros y podrás acceder a ellos 
            con las limitaciones del plan gratuito. Para recuperar el acceso completo, 
            actualiza tu método de pago:</p>
            
            <p style="text-align: center; margin-top: 30px;">
              <a href="${data.updatePaymentUrl}" class="button">
                Reactivar mi suscripción
              </a>
            </p>
            
            <p style="color: #6c757d; font-size: 14px; margin-top: 30px;">
              Si decides no continuar, tendrás 15 días para descargar tus datos antes 
              de que algunos elementos sean archivados automáticamente.
            </p>
          </div>
          <div class="footer">
            <p>Estamos aquí para ayudarte. Contacta a nuestro equipo de soporte si necesitas asistencia.</p>
          </div>
        </div>
      </body>
      </html>
    `
  },
  
  paymentFailedSuspension: {
    subject: '📋 Período de gracia activado - 15 días para ajustar tus recursos',
    html: (data) => `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #6c757d; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f4f4f4; }
          .info { background-color: #e9ecef; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          .table th, .table td { text-align: left; padding: 8px; border-bottom: 1px solid #ddd; }
          .table th { border-bottom: 2px solid #ddd; }
          .button { display: inline-block; padding: 12px 24px; background-color: #007bff; color: white; text-decoration: none; border-radius: 4px; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Período de gracia activado</h1>
          </div>
          <div class="content">
            <p>Hola ${data.userName || data.userEmail?.split('@')[0] || 'Usuario'},</p>
            
            <p>Debido a los problemas continuos con el pago de tu suscripción ${data.planName}, 
            hemos activado un período de gracia de 15 días.</p>
            
            <div class="info">
              <h3 style="margin-top: 0;">¿Qué significa esto?</h3>
              <ul>
                <li>Tu plan cambiará a FREE el <strong>${new Date(data.gracePeriodEndDate).toLocaleDateString('es-ES')}</strong></li>
                <li>Tienes 15 días para ajustar tus recursos a los límites del plan gratuito</li>
                <li>Después de esta fecha, archivaremos automáticamente el contenido excedente</li>
              </ul>
            </div>
            
            <h3>Elementos que serán archivados:</h3>
            <table class="table">
              <tr>
                <th>Tipo</th>
                <th style="text-align: right;">A archivar</th>
              </tr>
              <tr>
                <td>Carpetas</td>
                <td style="text-align: right;">${data.itemsToArchive.folders}</td>
              </tr>
              <tr>
                <td>Calculadoras</td>
                <td style="text-align: right;">${data.itemsToArchive.calculators}</td>
              </tr>
              <tr>
                <td>Contactos</td>
                <td style="text-align: right;">${data.itemsToArchive.contacts}</td>
              </tr>
            </table>
            
            <div style="margin: 30px 0;">
              <p><strong>¿Prefieres mantener tu plan actual?</strong></p>
              <p style="text-align: center;">
                <a href="${data.updatePaymentUrl}" class="button">
                  Actualizar método de pago
                </a>
              </p>
            </div>
            
            <p style="color: #6c757d; font-size: 14px;">
              Si necesitas ayuda o tienes alguna pregunta, no dudes en contactarnos en 
              <a href="mailto:${data.supportEmail}">${data.supportEmail}</a>
            </p>
          </div>
          <div class="footer">
            <p>Gracias por tu comprensión.</p>
          </div>
        </div>
      </body>
      </html>
    `
  },
  
  paymentRecovered: {
    subject: '✅ Pago procesado exitosamente - Suscripción reactivada',
    html: (data) => `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #28a745; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f4f4f4; }
          .success { background-color: #d4edda; border: 1px solid #c3e6cb; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .button { display: inline-block; padding: 12px 24px; background-color: #007bff; color: white; text-decoration: none; border-radius: 4px; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>¡Pago procesado!</h1>
          </div>
          <div class="content">
            <p>Hola ${data.userName || data.userEmail?.split('@')[0] || 'Usuario'},</p>
            
            <p>¡Excelentes noticias! Hemos procesado exitosamente tu pago y tu suscripción 
            al plan <strong>${data.planName}</strong> ha sido reactivada.</p>
            
            <div class="success">
              <h3 style="color: #155724; margin-top: 0;">✅ Todo está en orden</h3>
              <ul>
                <li>Tu acceso completo ha sido restaurado</li>
                <li>Todas las características premium están activas</li>
                <li>No se requiere ninguna acción adicional</li>
              </ul>
            </div>
            
            <p>Gracias por resolver este problema rápidamente. Apreciamos tu confianza en nuestro servicio.</p>
            
            <p style="text-align: center; margin-top: 30px;">
              <a href="${process.env.BASE_URL}/dashboard" class="button">
                Ir al Dashboard
              </a>
            </p>
          </div>
          <div class="footer">
            <p>Gracias por continuar con nosotros.</p>
          </div>
        </div>
      </body>
      </html>
    `
  }
};

/**
 * Obtiene un template de la base de datos o del código como fallback
 */
async function getEmailTemplate(templateName) {
  try {
    // Intentar obtener de la base de datos
    const dbTemplate = await EmailTemplate.findOne({
      name: templateName,
      isActive: true
    });

    if (dbTemplate) {
      logger.info(`Template '${templateName}' obtenido de la base de datos`);
      return {
        subject: dbTemplate.subject,
        htmlBody: dbTemplate.htmlBody,
        textBody: dbTemplate.textBody,
        variables: dbTemplate.variables,
        fromDB: true
      };
    }
  } catch (error) {
    logger.warn(`Error obteniendo template '${templateName}' de BD:`, error.message);
  }

  // Fallback al template en código
  const codeTemplate = emailTemplates[templateName];
  if (codeTemplate) {
    logger.info(`Template '${templateName}' usando fallback del código`);
    return {
      subject: codeTemplate.subject,
      htmlBody: null, // Se generará dinámicamente
      textBody: null, // Se generará dinámicamente
      html: codeTemplate.html, // Función generadora del template en código
      fromDB: false
    };
  }

  return null;
}

/**
 * Envía un email usando AWS SES
 */
exports.sendEmail = async (to, templateName, data) => {
  try {
    const template = await getEmailTemplate(templateName);
    if (!template) {
      throw new Error(`Plantilla de email '${templateName}' no encontrada`);
    }

    // Aplicar filtro de whitelist si estamos en modo test
    const originalEmail = to;
    const filterResult = shouldFilterEmail(to);
    const actualRecipient = filterResult.replacementEmail;
    
    // Si el email fue cambiado, agregarlo al cuerpo del email para referencia
    let modifiedData = { ...data };
    if (originalEmail !== actualRecipient) {
      modifiedData._testMode = true;
      modifiedData._originalRecipient = originalEmail;
      modifiedData._notice = `[MODO TEST] Este email iba dirigido originalmente a: ${originalEmail}`;
    }

    // Generar el contenido del email
    let htmlContent, textContent, subjectContent;

    if (template.fromDB) {
      // Usar template de base de datos
      // Validar que tenemos todas las variables necesarias
      if (template.variables && template.variables.length > 0) {
        const validation = validateTemplateData(template.variables, modifiedData);
        if (!validation.isValid) {
          logger.warn(`Variables faltantes para template '${templateName}': ${validation.missing.join(', ')}`);
        }
      }

      // Rellenar las variables en el template
      htmlContent = fillTemplate(template.htmlBody, modifiedData);
      textContent = fillTemplate(template.textBody, modifiedData);
      subjectContent = fillTemplate(template.subject, modifiedData);
    } else {
      // Usar template del código (función generadora)
      htmlContent = template.html(modifiedData);
      textContent = ''; // Los templates en código no tienen versión texto por ahora
      subjectContent = template.subject;
    }

    // Agregar aviso de modo test si aplica
    if (originalEmail !== actualRecipient) {
      const testWarning = `<div style="background-color: #fffacd; border: 2px solid #ff6b6b; padding: 10px; margin-bottom: 20px;">
        <strong>⚠️ MODO TEST:</strong> Este email estaba destinado a <strong>${originalEmail}</strong><br>
        Fue redirigido a tu email porque está en la whitelist de pruebas.
      </div>`;
      htmlContent = testWarning + htmlContent;
      subjectContent = `[TEST] ${subjectContent} (para: ${originalEmail})`;
    }

    const params = {
      Source: process.env.EMAIL_MARKETING_DEFAULT_SENDER || 'noreply@tuapp.com',
      Destination: {
        ToAddresses: [actualRecipient]
      },
      Message: {
        Subject: {
          Data: subjectContent,
          Charset: 'UTF-8'
        },
        Body: {
          Html: {
            Data: htmlContent,
            Charset: 'UTF-8'
          }
        }
      },
      // Opcional: configuración adicional
      ConfigurationSetName: process.env.SES_CONFIGURATION_SET || undefined
    };

    // Agregar cuerpo de texto si está disponible
    if (textContent) {
      params.Message.Body.Text = {
        Data: textContent,
        Charset: 'UTF-8'
      };
    }

    const command = new SendEmailCommand(params);
    const response = await sesClient.send(command);

    logger.info(`Email enviado exitosamente via AWS SES`);
    logger.info(`MessageId: ${response.MessageId}`);
    logger.info(`Template: ${templateName} (${template.fromDB ? 'BD' : 'código'}), To: ${actualRecipient}${originalEmail !== actualRecipient ? ` (originalmente para: ${originalEmail})` : ''}`);

    return response;
  } catch (error) {
    logger.error(`Error enviando email via AWS SES: ${error.message}`);
    logger.error(`Template: ${templateName}, To: ${to}`);

    // Log específico para errores comunes de SES
    if (error.name === 'MessageRejected') {
      logger.error('Email rechazado por SES. Verifica que el email esté verificado.');
    } else if (error.name === 'ConfigurationSetDoesNotExist') {
      logger.error('Configuration Set no existe en SES.');
    }

    throw error;
  }
};

/**
 * Envía email de notificación de suscripción
 */
exports.sendSubscriptionEmail = async (user, event, additionalData = {}) => {
  try {
    const data = {
      userName: user.firstName || user.name || user.email.split('@')[0],
      userEmail: user.email,
      ...additionalData
    };

    let templateName;

    switch (event) {
      case 'created':
      case 'upgraded':
        templateName = 'subscriptionCreated';
        break;

      case 'canceled':
        // Si tiene immediate: true, usar template especial
        if (additionalData.immediate) {
          templateName = 'subscriptionImmediateCancellation';
        } else {
          templateName = 'subscriptionScheduledCancellation';
        }
        break;
        
      case 'downgraded':
        templateName = 'subscriptionCanceled';
        break;

      case 'gracePeriodReminder':
        // Determinar si hay exceso de límites
        if (additionalData.exceedsLimits || 
            (additionalData.foldersToArchive > 0 || 
             additionalData.calculatorsToArchive > 0 || 
             additionalData.contactsToArchive > 0)) {
          templateName = 'gracePeriodReminderWithExcess';
        } else {
          templateName = 'gracePeriodReminderNoExcess';
        }
        break;

      case 'gracePeriodExpired':
        // Determinar si hubo archivado
        if (additionalData.totalArchived > 0) {
          templateName = 'gracePeriodExpiredWithArchive';
        } else {
          templateName = 'gracePeriodExpiredNoArchive';
        }
        break;

      case 'scheduledCancellation':
        templateName = 'scheduledCancellation';
        break;

      case 'planDowngraded':
        templateName = 'planDowngraded';
        break;

      case 'planUpgraded':
        templateName = 'planUpgraded';
        break;

      default:
        logger.warn(`Evento de email no reconocido: ${event}`);
        return;
    }

    await this.sendEmail(user.email, templateName, data);
  } catch (error) {
    logger.error(`Error enviando email de suscripción: ${error.message}`);
    // No lanzar error para no interrumpir el flujo principal
  }
};

/**
 * Envía email de pago fallido
 */
exports.sendPaymentFailedEmail = async (to, data, type) => {
  try {
    const templateMap = {
      'first': 'paymentFailedFirst',
      'second': 'paymentFailedSecond',
      'final': 'paymentFailedFinal',
      'suspension': 'paymentFailedSuspension'
    };

    const templateName = templateMap[type];
    if (!templateName) {
      throw new Error(`Tipo de email de pago fallido no válido: ${type}`);
    }

    // Asegurar que los datos tengan el formato correcto para los templates
    const emailData = {
      ...data,
      // Para el template paymentFailedFirst
      nextRetryDate: data.nextRetryDate ? new Date(data.nextRetryDate).toLocaleDateString('es-ES') : 'No programado',
      // Para el template paymentFailedFinal
      suspensionDate: data.suspensionDate ? new Date(data.suspensionDate).toLocaleDateString('es-ES') : '',
      // Para el template paymentFailedSuspension
      gracePeriodEndDate: data.gracePeriodEndDate ? new Date(data.gracePeriodEndDate).toLocaleDateString('es-ES') : '',
      supportEmail: process.env.SUPPORT_EMAIL || 'soporte@tuapp.com'
    };

    await this.sendEmail(to, templateName, emailData);
    
    // Log adicional si estamos en modo test
    if (global.currentWebhookTestMode) {
      logger.info(`📧 [MODO TEST] Email de pago fallido tipo '${type}'`);
      logger.info(`   Email original: ${to}`);
      logger.info(`   Tipo de notificación: ${type}`);
    }
  } catch (error) {
    logger.error(`Error enviando email de pago fallido: ${error.message}`);
    throw error;
  }
};

/**
 * Envía email de pago (genérico)
 */
exports.sendPaymentEmail = async (user, type, data) => {
  try {
    const emailData = {
      userName: user.firstName || user.name || user.email.split('@')[0],
      userEmail: user.email,
      ...data
    };

    if (type === 'paymentRecovered') {
      await this.sendEmail(user.email, 'paymentRecovered', emailData);
      logger.info(`Email de pago recuperado enviado a ${user.email}`);
    } else {
      logger.warn(`Tipo de email de pago no reconocido: ${type}`);
    }
  } catch (error) {
    logger.error(`Error enviando email de pago: ${error.message}`);
    throw error;
  }
};

/**
 * Envía email de pago recuperado
 */
exports.sendPaymentRecoveredEmail = async (to, data) => {
  try {
    await this.sendEmail(to, 'paymentRecovered', data);
    logger.info(`Email de pago recuperado enviado a ${to}`);
  } catch (error) {
    logger.error(`Error enviando email de pago recuperado: ${error.message}`);
    throw error;
  }
};

/**
 * Envía recordatorios de período de gracia
 */
exports.sendGracePeriodReminders = async () => {
  try {
    const Subscription = require('../models/Subscription');
    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    // Buscar suscripciones con período de gracia que vence en 3 
    días
    const subscriptions = await Subscription.find({
      'downgradeGracePeriod.expiresAt': {
        $gte: now,
        $lte: threeDaysFromNow
      },
      'downgradeGracePeriod.reminderSent': { $ne: true }
    }).populate('user');

    logger.info(`Enviando ${subscriptions.length} recordatorios de período de gracia`);

    for (const subscription of subscriptions) {
      try {
        const daysRemaining = Math.ceil(
          (subscription.downgradeGracePeriod.expiresAt - now) / (1000 * 60 * 60 * 24)
        );

        await this.sendSubscriptionEmail(subscription.user, 'gracePeriodReminder', {
          daysRemaining,
          gracePeriodEnd: subscription.downgradeGracePeriod.expiresAt.toLocaleDateString('es-ES'),
          previousPlan: subscription.downgradeGracePeriod.previousPlan,
          // TODO: Agregar conteos reales de recursos
          currentFolders: 0,
          currentCalculators: 0,
          currentContacts: 0,
          exceedsLimits: false
        });

        // Marcar recordatorio como enviado
        subscription.downgradeGracePeriod.reminderSent = true;
        await subscription.save();

      } catch (error) {
        logger.error(`Error enviando recordatorio para suscripción ${subscription._id}:`, error);
      }
    }
  } catch (error) {
    logger.error('Error en sendGracePeriodReminders:', error);
  }
};

/**
 * Verifica la configuración de AWS SES
 */
exports.verifySESConfiguration = async () => {
  try {
    // Verificar identidad del remitente
    const verifyCommand = new GetIdentityVerificationAttributesCommand({
      Identities: [process.env.EMAIL_MARKETING_DEFAULT_SENDER || 'noreply@tuapp.com']
    });

    const response = await sesClient.send(verifyCommand);
    const verificationStatus = response.VerificationAttributes[process.env.EMAIL_MARKETING_DEFAULT_SENDER];

    if (!verificationStatus || verificationStatus.VerificationStatus !== 'Success') {
      logger.warn('Email remitente no verificado en AWS SES');
      return false;
    }

    logger.info('Configuración de AWS SES verificada exitosamente');
    return true;
  } catch (error) {
    logger.error('Error verificando configuración de AWS SES:', error);
    return false;
  }
};

/**
 * Obtiene las estadísticas de envío de SES
 */
exports.getSESStats = async () => {
  try {
    const command = new GetSendQuotaCommand({});
    const response = await sesClient.send(command);

    return {
      max24HourSend: response.Max24HourSend,
      sentLast24Hours: response.SentLast24Hours,
      maxSendRate: response.MaxSendRate
    };
  } catch (error) {
    logger.error('Error obteniendo estadísticas de SES:', error);
    return null;
  }
};

/**
 * Exportar las plantillas para uso en testing
 */
exports.emailTemplates = emailTemplates;
