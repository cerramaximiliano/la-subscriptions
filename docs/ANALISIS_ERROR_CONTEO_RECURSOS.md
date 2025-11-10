# Análisis: Error en Conteo de Recursos para Emails de Período de Gracia

## Problema Identificado

El usuario `maximilian@rumba-dev.com` recibió un email de período de gracia con el template incorrecto (`gracePeriodReminderNoExcess`) en lugar de `gracePeriodReminderWithExcess`, a pesar de tener 37 carpetas activas (cuando el límite free es 5).

## Análisis de Código

### 1. Conteo en `la-subscriptions` (scripts/gracePeriodProcessor.js)

**Función `calculateUserResources` (líneas 392-439):**

```javascript
// Contar carpetas activas
const activeFolders = await Folder.countDocuments({
  userId: userId,
  archived: { $ne: true }
});

// Contar calculadoras activas
const activeCalculators = await Calculator.countDocuments({
  userId: userId,
  archived: { $ne: true }
});

// Contar contactos activos
const activeContacts = await Contact.countDocuments({
  userId: userId,
  archived: { $ne: true }
});
```

**Criterio usado:** `archived: { $ne: true }`
- Incluye documentos donde `archived !== true`
- Incluye documentos donde `archived` es `false`, `null`, o no existe

### 2. Conteo en `law-analytics-server`

**Múltiples servicios usan el mismo criterio:**

```javascript
// statsService.js, storageService.js, subscriptionService.js
Folder.countDocuments({ userId, archived: false })
Calculator.countDocuments({ user: userId, archived: false, type: 'Calculado' })
Contact.countDocuments({ userId, archived: false })
```

**Criterio usado:** `archived: false`
- **SOLO** incluye documentos donde `archived === false` explícitamente
- **NO** incluye documentos donde `archived` es `null` o no existe el campo

## Discrepancia Crítica

### Problema

La diferencia entre estos dos criterios es SIGNIFICATIVA:

1. **`archived: { $ne: true }`** → Incluye docs con `archived: false`, `null`, o campo ausente
2. **`archived: false`** → Solo incluye docs con `archived: false` explícitamente

### Impacto en la Base de Datos

Si en la colección `folders` existen documentos que:
- **NO tienen el campo `archived`** definido
- Tienen `archived: null`

Entonces:
- ✅ `law-analytics-server` los cuenta como activos (correcto)
- ❌ `la-subscriptions` también los cuenta pero con diferente query

### Inconsistencia Adicional: Campo `userId` vs `user`

**Calculators en `la-subscriptions`:**
```javascript
Calculator.countDocuments({ userId: userId, ... })
```

**Calculators en `law-analytics-server`:**
```javascript
Calculator.countDocuments({ user: userId, ... })
```

**¡Los modelos usan nombres de campo diferentes!**

## Evidencia del Error

```
Diagnóstico del usuario maximilian@rumba-dev.com:
- Carpetas activas: 37
- Calculadoras activas: 2
- Contactos activos: 2

Carpetas a archivar: 32 (37 - 5 límite free)
¿Excede límites?: SÍ
Template correcto: gracePeriodReminderWithExcess
```

Sin embargo, el email se envió con el template `gracePeriodReminderNoExcess`, sugiriendo que:
1. El conteo fue diferente al momento de enviar
2. O hay un bug en la lógica de selección del template

## Posibles Causas del Error

### Causa 1: Inconsistencia en Schema de Modelos

Los modelos pueden tener:
- Algunos documentos sin campo `archived`
- Algunos con `archived: false`
- Algunos con `archived: null`

**Verificar:**
```javascript
// ¿Qué documentos tienen qué valores?
db.folders.aggregate([
  { $match: { userId: ObjectId("6850300d153bccaac42b37db") } },
  { $group: {
    _id: "$archived",
    count: { $sum: 1 }
  }}
])
```

### Causa 2: Campo Incorrecto en Calculator

El modelo `Calculator` puede usar:
- `userId` en algunos lugares
- `user` en otros lugares

Esto causaría que el conteo devuelva 0 si se usa el campo incorrecto.

### Causa 3: Lógica de Selección de Template

**En emailService.js (sendSubscriptionEmail):**

Necesitamos verificar cómo se decide qué template usar:
- ¿Se basa en los valores de `foldersToArchive`, `calculatorsToArchive`, etc.?
- ¿O hay otra lógica?

## Solución Propuesta

### 1. Estandarizar Criterios de Conteo

**Opción A (Recomendada):** Usar `archived: { $ne: true }` en ambos proyectos
```javascript
// Más inclusivo, capta todos los documentos "activos"
{ archived: { $ne: true } }
```

**Ventaja:** Incluye documentos legacy sin campo `archived`

**Opción B:** Usar `archived: false` y asegurar esquema
```javascript
{ archived: false }
```

**Ventaja:** Más explícito
**Desventaja:** Requiere migración de datos

### 2. Estandarizar Nombres de Campos

**Calculator:**
- Verificar qué campo usa realmente el modelo
- Actualizar todas las queries para usar el mismo campo

### 3. Verificar Lógica de Selección de Template

Revisar `emailService.js` para asegurar que:
```javascript
const hasExcess =
  (foldersToArchive > 0 ||
   calculatorsToArchive > 0 ||
   contactsToArchive > 0);

const templateName = hasExcess
  ? 'gracePeriodReminderWithExcess'
  : 'gracePeriodReminderNoExcess';
```

### 4. Agregar Logging Detallado

```javascript
logger.info(`[TEMPLATE-SELECTION] Usuario ${user.email}:
  - Carpetas: ${currentFolders} (a archivar: ${foldersToArchive})
  - Calculadoras: ${currentCalculators} (a archivar: ${calculatorsToArchive})
  - Contactos: ${currentContacts} (a archivar: ${contactsToArchive})
  - ¿Tiene exceso?: ${hasExcess}
  - Template seleccionado: ${templateName}
`);
```

## Próximos Pasos

1. ✅ Verificar esquema de modelo `Calculator` (¿userId o user?)
2. ✅ Verificar esquema de campo `archived` en todas las colecciones
3. ✅ Revisar lógica de selección de template en `emailService.js`
4. ⬜ Implementar corrección en `calculateUserResources`
5. ⬜ Agregar tests unitarios para verificar conteo
6. ⬜ Agregar logging detallado en selección de template

## Comandos de Verificación

```bash
# 1. Verificar campos en Calculator
node -e "const Calculator = require('./models/Calculator'); console.log(Calculator.schema.paths)" | grep -E "user|userId"

# 2. Verificar distribución de valores de 'archived'
mongo $MONGODB_URI --eval "
  db.folders.aggregate([
    { \$group: { _id: '\$archived', count: { \$sum: 1 } } }
  ])
"

# 3. Test del conteo actual
export URLDB='...' && node scripts/diagnoseEmailIssue.js maximilian@rumba-dev.com
```
