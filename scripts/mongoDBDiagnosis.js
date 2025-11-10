// Script de MongoDB para diagnosticar usuario maximilian@rumba-dev.com
// Ejecutar en MongoDB Compass o mongosh

// ============================================================
// PASO 1: Buscar usuario
// ============================================================

const userEmail = "maximilian@rumba-dev.com";
const user = db.users.findOne({ email: userEmail });

if (!user) {
  print("❌ Usuario no encontrado");
} else {
  print("✅ Usuario encontrado:");
  print("   Email:", user.email);
  print("   ID:", user._id);
  print("   Nombre:", user.firstName || user.name || "N/A");

  const userId = user._id;

  // ============================================================
  // PASO 2: Buscar suscripción
  // ============================================================

  const subscription = db.subscriptions.findOne({ user: userId });

  if (subscription) {
    print("\n📋 Suscripción:");
    print("   Plan:", subscription.plan);
    print("   Estado:", subscription.status);
    print("   Estado de cuenta:", subscription.accountStatus || "N/A");

    if (subscription.downgradeGracePeriod && subscription.downgradeGracePeriod.expiresAt) {
      print("\n⏰ Período de gracia (downgrade):");
      print("   Expira:", subscription.downgradeGracePeriod.expiresAt);
      print("   Plan objetivo:", subscription.downgradeGracePeriod.targetPlan);
      print("   Auto-archive:", subscription.downgradeGracePeriod.autoArchiveScheduled);
      print("   Reminder 3 días:", subscription.downgradeGracePeriod.reminder3DaysSent || false);
      print("   Reminder 1 día:", subscription.downgradeGracePeriod.reminder1DaySent || false);
    }

    if (subscription.paymentFailures && subscription.paymentFailures.count > 0) {
      print("\n💳 Fallos de pago:");
      print("   Cantidad:", subscription.paymentFailures.count);
      print("   Primer fallo:", subscription.paymentFailures.firstFailedAt);
      print("   Último fallo:", subscription.paymentFailures.lastFailedAt);
    }
  }

  // ============================================================
  // PASO 3: Contar recursos actuales
  // ============================================================

  const activeFolders = db.folders.countDocuments({
    userId: userId,
    archived: { $ne: true }
  });

  const activeCalculators = db.calculators.countDocuments({
    userId: userId,
    archived: { $ne: true }
  });

  const activeContacts = db.contacts.countDocuments({
    userId: userId,
    archived: { $ne: true }
  });

  print("\n📊 Recursos actuales:");
  print("   Carpetas activas:", activeFolders);
  print("   Calculadoras activas:", activeCalculators);
  print("   Contactos activos:", activeContacts);

  // ============================================================
  // PASO 4: Calcular elementos que exceden límites FREE
  // ============================================================

  const freeLimits = {
    maxFolders: 5,
    maxCalculators: 3,
    maxContacts: 10
  };

  const toArchive = {
    folders: Math.max(0, activeFolders - freeLimits.maxFolders),
    calculators: Math.max(0, activeCalculators - freeLimits.maxCalculators),
    contacts: Math.max(0, activeContacts - freeLimits.maxContacts)
  };

  print("\n🗂️  Elementos que exceden límites del plan FREE:");
  print("   Carpetas a archivar:", toArchive.folders);
  print("   Calculadoras a archivar:", toArchive.calculators);
  print("   Contactos a archivar:", toArchive.contacts);

  const hasExcess = toArchive.folders > 0 || toArchive.calculators > 0 || toArchive.contacts > 0;

  print("\n🔍 Análisis:");
  print("   ¿Excede límites?:", hasExcess ? "✅ SÍ" : "❌ NO");

  if (hasExcess) {
    print("   ✉️  Debería recibir: gracePeriodReminderWithExcess");
  } else {
    print("   ✉️  Debería recibir: gracePeriodReminderNoExcess");
  }

  // ============================================================
  // PASO 5: Verificar integridad de datos
  // ============================================================

  print("\n🔍 Verificación de integridad:");

  // Verificar campo archived
  const foldersWithArchived = db.folders.countDocuments({
    userId: userId,
    archived: { $exists: true }
  });

  const totalFolders = db.folders.countDocuments({ userId: userId });

  print("\n   Carpetas:");
  print("     Total:", totalFolders);
  print("     Con campo 'archived':", foldersWithArchived);

  if (totalFolders > 0 && foldersWithArchived < totalFolders) {
    print("     ⚠️  Algunas carpetas NO tienen el campo 'archived'");
    print("     Ejecutar: db.folders.updateMany({ archived: { $exists: false } }, { $set: { archived: false } })");
  }

  // Ver ejemplo de carpeta
  const sampleFolder = db.folders.findOne({ userId: userId });
  if (sampleFolder) {
    print("\n   Ejemplo de carpeta:");
    print("     userId:", sampleFolder.userId, "(tipo:", typeof sampleFolder.userId + ")");
    print("     archived:", sampleFolder.archived);
  }

  // Repetir para calculators
  const calculatorsWithArchived = db.calculators.countDocuments({
    userId: userId,
    archived: { $exists: true }
  });

  const totalCalculators = db.calculators.countDocuments({ userId: userId });

  print("\n   Calculadoras:");
  print("     Total:", totalCalculators);
  print("     Con campo 'archived':", calculatorsWithArchived);

  if (totalCalculators > 0 && calculatorsWithArchived < totalCalculators) {
    print("     ⚠️  Algunas calculadoras NO tienen el campo 'archived'");
    print("     Ejecutar: db.calculators.updateMany({ archived: { $exists: false } }, { $set: { archived: false } })");
  }

  // Repetir para contacts
  const contactsWithArchived = db.contacts.countDocuments({
    userId: userId,
    archived: { $exists: true }
  });

  const totalContacts = db.contacts.countDocuments({ userId: userId });

  print("\n   Contactos:");
  print("     Total:", totalContacts);
  print("     Con campo 'archived':", contactsWithArchived);

  if (totalContacts > 0 && contactsWithArchived < totalContacts) {
    print("     ⚠️  Algunos contactos NO tienen el campo 'archived'");
    print("     Ejecutar: db.contacts.updateMany({ archived: { $exists: false } }, { $set: { archived: false } })");
  }

  // ============================================================
  // RESUMEN FINAL
  // ============================================================

  print("\n" + "=".repeat(60));
  print("RESUMEN");
  print("=".repeat(60));
  print("\n👤 Usuario:", userEmail);
  print("   Carpetas activas:", activeFolders, "/ Límite FREE: 5");
  print("   Calculadoras activas:", activeCalculators, "/ Límite FREE: 3");
  print("   Contactos activos:", activeContacts, "/ Límite FREE: 10");
  print("\n   Excede límites:", hasExcess ? "✅ SÍ" : "❌ NO");
  print("   Template correcto:", hasExcess ? "gracePeriodReminderWithExcess" : "gracePeriodReminderNoExcess");

  if (!hasExcess && (activeFolders > 5 || activeCalculators > 3 || activeContacts > 10)) {
    print("\n⚠️  PROBLEMA DETECTADO:");
    print("   El usuario tiene recursos que exceden los límites,");
    print("   pero hasExcess es false. Posible causa:");
    print("   - Campo 'archived' no existe en algunos documentos");
    print("   - El conteo está incluyendo documentos archivados");
  }
}
