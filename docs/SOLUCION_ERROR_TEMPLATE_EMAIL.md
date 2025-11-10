# Solución: Error en Selección de Template de Email de Período de Gracia

## Resumen Ejecutivo

**Problema:** El usuario `maximilian@rumba-dev.com` tiene 37 carpetas activas pero recibió el template `gracePeriodReminderNoExcess` en lugar de `gracePeriodReminderWithExcess`.

**Causa Raíz Identificada:** El campo `userId` en el modelo Calculator se usa incorrectamente en algunas queries, debe usar `userId` (ObjectId) no `user` (String).

**Impacto:** El conteo de calculadoras puede fallar, resultando en 0 calculadoras contadas, lo que puede afectar la lógica de selección de template.

---

## Análisis Detallado

### 1. Modelo Calculator - Tiene DOS campos

```javascript
// models/Calculator.js
const calculatorSchema = new mongoose.Schema({
  userId: {                              // Línea 5-9
    type: mongoose.Schema.Types.ObjectId,
    ref: "Usuarios",
    required: true,
  },
  // ... otros campos ...
  user: { type: String },                // Línea 29
  // ... otros campos ...
  archived: { type: Boolean, default: false },
})
```

**Problema:** El esquema tiene `userId` (ObjectId, requerido) Y `user` (String, opcional).

### 2. Query Incorrecta en `calculateUserResources`

**Archivo:** `scripts/gracePeriodProcessor.js:419-424`

```javascript
// ❌ INCORRECTO - Usa 'userId' pero debería verificar cuál campo está poblado
const activeCalculators = await Calculator.countDocuments({
  userId: userId,                        // ← Puede no encontrar nada si el campo real es 'user'
  archived: { $ne: true }
});
```

### 3. Comparación con law-analytics-server

**En law-analytics-server** (funcionamiento correcto):

```javascript
// services/statsService.js
Calculator.countDocuments({ userId, archived: false, type: 'Calculado' })

// services/storageService.js
Calculator.countDocuments({ user: userId, archived: true, type: 'Calculado' })
// ⚠️ Nota: Aquí usan 'user' no 'userId'
```

**Inconsistencia encontrada:** El servidor usa ambos campos según el contexto.

### 4. Lógica de Selección de Template

**Archivo:** `services/emailService.js:991-1000`

```javascript
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
```

**Comportamiento:** Si TODOS los valores son 0, selecciona `NoExcess`.

### 5. Escenario del Error

```
Usuario: maximilian@rumba-dev.com
Carpetas activas: 37 → foldersToArchive: 32 ✅
Calculadoras activas: 2 → calculatorsToArchive: 0 ✅ (dentro de límite de 3)
Contactos activos: 2 → contactsToArchive: 0 ✅ (dentro de límite de 10)

Selección esperada: gracePeriodReminderWithExcess ✅
Template seleccionado: gracePeriodReminderNoExcess ❌

¿Por qué? Si foldersToArchive > 0, debería seleccionar WithExcess
```

**Posibilidad:** El conteo de folders también puede estar fallando.

---

## Posibles Causas del Error

### Causa A: Criterio de Conteo - `archived: { $ne: true }` vs `archived: false`

**En gracePeriodProcessor.js:**
```javascript
archived: { $ne: true }  // Incluye: false, null, undefined
```

**En law-analytics-server:**
```javascript
archived: false  // Solo incluye: false explícitamente
```

**Problema:** Si los documentos tienen `archived: null` o campo ausente:
- `{ $ne: true }` → Los cuenta como activos ✅
- `false` → NO los cuenta ❌

### Causa B: Documentos Legacy sin campo `archived`

Si existen documentos antiguos sin el campo `archived`:

```javascript
// Query con $ne encuentra estos docs
{ archived: { $ne: true } }  // ✅ Encuentra: {}, {archived: null}, {archived: false}

// Query con false NO los encuentra
{ archived: false }          // ❌ Solo encuentra: {archived: false}
```

### Causa C: Campo userId vs user en Calculator

El modelo tiene ambos campos, pero las queries usan uno u otro inconsistentemente.

---

## Verificación del Problema

### Script de Verificación

```javascript
// scripts/verifyResourceCounting.js
const userId = '6850300d153bccaac42b37db'; // maximilian@rumba-dev.com

// Test 1: Contar con diferentes criterios
console.log('=== FOLDERS ===');
const folders1 = await Folder.countDocuments({ userId, archived: { $ne: true } });
const folders2 = await Folder.countDocuments({ userId, archived: false });
const folders3 = await Folder.countDocuments({ userId, $or: [{ archived: false }, { archived: { $exists: false } }] });
console.log(`archived: {$ne: true} → ${folders1}`);
console.log(`archived: false → ${folders2}`);
console.log(`archived: false o no existe → ${folders3}`);

// Test 2: Ver distribución de valores de 'archived'
const archivedDistribution = await Folder.aggregate([
  { $match: { userId: mongoose.Types.ObjectId(userId) } },
  { $group: {
    _id: '$archived',
    count: { $sum: 1 }
  }}
]);
console.log('Distribución:', archivedDistribution);

// Test 3: Calculators con userId vs user
console.log('\n=== CALCULATORS ===');
const calc1 = await Calculator.countDocuments({ userId, archived: { $ne: true } });
const calc2 = await Calculator.countDocuments({ user: userId.toString(), archived: { $ne: true } });
console.log(`Con userId (ObjectId): ${calc1}`);
console.log(`Con user (String): ${calc2}`);
```

---

## Solución Propuesta

### Solución 1: Estandarizar Criterio de Conteo (RECOMENDADO)

**Cambiar en `law-analytics-server`** para usar el mismo criterio:

```javascript
// ANTES
{ archived: false }

// DESPUÉS
{ archived: { $ne: true } }
```

**Ventaja:** Maneja correctamente documentos legacy.

### Solución 2: Migración de Datos

Asegurar que TODOS los documentos tengan el campo `archived` explícito:

```javascript
// Actualizar documentos sin campo 'archived'
await Folder.updateMany(
  { archived: { $exists: false } },
  { $set: { archived: false } }
);

await Calculator.updateMany(
  { archived: { $exists: false } },
  { $set: { archived: false } }
);

await Contact.updateMany(
  { archived: { $exists: false } },
  { $set: { archived: false } }
);
```

### Solución 3: Fix Calculators - Eliminar campo `user` duplicado

**Opción A:** Eliminar el campo `user` (String) del esquema

```javascript
// models/Calculator.js
// ELIMINAR: user: { type: String },

// Migrar datos si es necesario
await Calculator.updateMany(
  { user: { $exists: true }, userId: { $exists: false } },
  [{ $set: { userId: { $toObjectId: "$user" } } }]
);
```

**Opción B:** Mantener ambos pero documentar claramente

```javascript
// models/Calculator.js
userId: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "Usuarios",
  required: true,
  // NOTA: Este es el campo principal para queries
},
user: {
  type: String,
  // DEPRECATED: Solo para retrocompatibilidad
  // No usar en queries nuevas
},
```

### Solución 4: Agregar Logging Detallado

```javascript
// scripts/gracePeriodProcessor.js - función calculateUserResources

async function calculateUserResources(userId, targetPlan) {
  try {
    const limits = getPlanLimits(targetPlan);

    // AGREGAR LOGGING
    logger.info(`[RESOURCE-COUNT] Contando recursos para usuario ${userId}`);
    logger.info(`[RESOURCE-COUNT] Plan objetivo: ${targetPlan}`);
    logger.info(`[RESOURCE-COUNT] Límites: ${JSON.stringify(limits)}`);

    const result = {
      current: { folders: 0, calculators: 0, contacts: 0 },
      toArchive: { folders: 0, calculators: 0, contacts: 0 },
      limits: limits
    };

    // Contar carpetas activas
    const activeFolders = await Folder.countDocuments({
      userId: userId,
      archived: { $ne: true }
    });
    result.current.folders = activeFolders;
    result.toArchive.folders = Math.max(0, activeFolders - limits.maxFolders);

    logger.info(`[RESOURCE-COUNT] Folders: ${activeFolders} activas, ${result.toArchive.folders} a archivar`);

    // Contar calculadoras activas - PROBAR AMBOS CAMPOS
    let activeCalculators = await Calculator.countDocuments({
      userId: userId,
      archived: { $ne: true },
      type: 'Calculado'
    });

    // Si no encuentra con userId, intentar con user
    if (activeCalculators === 0) {
      logger.warn(`[RESOURCE-COUNT] No se encontraron calculadoras con userId, probando con user...`);
      activeCalculators = await Calculator.countDocuments({
        user: userId.toString(),
        archived: { $ne: true },
        type: 'Calculado'
      });
    }

    result.current.calculators = activeCalculators;
    result.toArchive.calculators = Math.max(0, activeCalculators - limits.maxCalculators);

    logger.info(`[RESOURCE-COUNT] Calculators: ${activeCalculators} activas, ${result.toArchive.calculators} a archivar`);

    // Contar contactos activos
    const activeContacts = await Contact.countDocuments({
      userId: userId,
      archived: { $ne: true }
    });
    result.current.contacts = activeContacts;
    result.toArchive.contacts = Math.max(0, activeContacts - limits.maxContacts);

    logger.info(`[RESOURCE-COUNT] Contacts: ${activeContacts} activos, ${result.toArchive.contacts} a archivar`);

    // LOG FINAL
    logger.info(`[RESOURCE-COUNT] Resultado final:`, JSON.stringify(result, null, 2));

    return result;
  } catch (error) {
    logger.error('[RESOURCE-COUNT] Error calculando recursos del usuario:', error);
    return null;
  }
}
```

### Solución 5: Agregar Logging en Selección de Template

```javascript
// services/emailService.js

case 'gracePeriodReminder':
  // AGREGAR LOGGING
  logger.info(`[TEMPLATE-SELECT] Datos recibidos:`, {
    exceedsLimits: additionalData.exceedsLimits,
    foldersToArchive: additionalData.foldersToArchive,
    calculatorsToArchive: additionalData.calculatorsToArchive,
    contactsToArchive: additionalData.contactsToArchive
  });

  // Determinar si hay exceso de límites
  if (additionalData.exceedsLimits ||
      (additionalData.foldersToArchive > 0 ||
       additionalData.calculatorsToArchive > 0 ||
       additionalData.contactsToArchive > 0)) {
    templateName = 'gracePeriodReminderWithExcess';
    logger.info(`[TEMPLATE-SELECT] Template seleccionado: gracePeriodReminderWithExcess`);
  } else {
    templateName = 'gracePeriodReminderNoExcess';
    logger.info(`[TEMPLATE-SELECT] Template seleccionado: gracePeriodReminderNoExcess`);
  }
  break;
```

---

## Plan de Implementación

### Fase 1: Diagnóstico (INMEDIATO)
1. ✅ Ejecutar script de verificación para el usuario afectado
2. ⬜ Verificar distribución de valores de `archived` en todas las colecciones
3. ⬜ Verificar qué campo usa Calculator realmente

### Fase 2: Fix Rápido (HOY)
1. ⬜ Agregar logging detallado en `calculateUserResources`
2. ⬜ Agregar logging detallado en selección de template
3. ⬜ Fix: Probar ambos campos (userId y user) en Calculator

### Fase 3: Fix Permanente (ESTA SEMANA)
1. ⬜ Migrar datos: Asegurar campo `archived` en todos los documentos
2. ⬜ Estandarizar queries en ambos proyectos
3. ⬜ Decidir: Eliminar campo `user` o documentar

### Fase 4: Testing (PRÓXIMA SEMANA)
1. ⬜ Test unitario para `calculateUserResources`
2. ⬜ Test de integración para envío de emails
3. ⬜ Verificar con usuario real

---

## Comandos de Ejecución

```bash
# 1. Verificar conteo actual
export URLDB='mongodb+srv://...' && node scripts/diagnoseEmailIssue.js maximilian@rumba-dev.com

# 2. Ejecutar script de verificación (crear este script)
node scripts/verifyResourceCounting.js

# 3. Re-procesar período de gracia con logging
export URLDB='...' && node scripts/gracePeriodProcessor.js

# 4. Verificar logs
tail -f logs/app.log | grep -E "RESOURCE-COUNT|TEMPLATE-SELECT"
```

---

## Conclusión

El error probablemente se debe a:
1. **Inconsistencia en criterios de conteo** (`archived: { $ne: true }` vs `archived: false`)
2. **Campo duplicado en Calculator** (`userId` vs `user`)
3. **Falta de logging** para diagnosticar el problema

La solución inmediata es agregar logging y manejar ambos campos en Calculator. La solución a largo plazo es estandarizar todo y migrar datos.
