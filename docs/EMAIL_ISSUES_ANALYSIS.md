# 🔍 Análisis de Problemas en Emails de Período de Gracia

## 📋 Problemas Identificados

### Problema 1: Variables sin reemplazar (${variable})

**Síntoma:** El usuario recibe correos con variables literales como `${daysRemaining}`, `${userName}`, etc.

**Causa Raíz:** Incompatibilidad de sintaxis entre templates de BD y sistema de reemplazo

- **Templates en código:** Usan template literals `${variable}`
- **Templates en BD:** Deben usar sintaxis Handlebars `{{variable}}`
- **Sistema fillTemplate:** Solo reemplaza `{{variable}}`

**Solución:** Ejecutar `scripts/fixTemplateVariables.js --apply`

---

### Problema 2: URL incorrecta en botones

**Síntoma:** Los correos contienen enlaces a una página que no existe

**URL Incorrecta:** `https://lawanalytics.app/subscription`
**URL Correcta:** `https://lawanalytics.app/apps/profiles/account/settings`

**Solución:** El script `fixTemplateVariables.js` ahora también corrige estas URLs

---

### Problema 3: Template incorrecto enviado al usuario

**Síntoma:** El usuario `maximilian@rumba-dev.com` tiene elementos que exceden los límites del plan gratuito, pero recibió el template **"gracePeriodReminderNoExcess"** en lugar de **"gracePeriodReminderWithExcess"**

**Lógica de selección de template** (`services/emailService.js:991-1000`):

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

**Posibles causas:**

1. ❌ Los valores `foldersToArchive`, `calculatorsToArchive`, `contactsToArchive` están llegando como `0` o `undefined`
2. ❌ La función `calculateUserResources()` no está calculando correctamente
3. ❌ Los modelos `Folder`, `Calculator`, `Contact` no tienen datos para el usuario
4. ❌ El campo `archived` no existe o tiene un valor incorrecto
5. ❌ El `userId` no coincide entre las colecciones

---

## 🔧 Herramientas de Diagnóstico

### Script 1: Diagnóstico de Usuario Específico

```bash
# Diagnosticar usuario específico
URLDB="tu_mongodb_url" node scripts/diagnoseEmailIssue.js maximilian@rumba-dev.com

# Usar usuario por defecto (maximilian@rumba-dev.com)
URLDB="tu_mongodb_url" node scripts/diagnoseEmailIssue.js
```

**Qué hace:**
1. ✅ Busca al usuario en la BD
2. ✅ Muestra su suscripción y estado
3. ✅ Cuenta sus recursos actuales (carpetas, calculadoras, contactos)
4. ✅ Calcula cuántos elementos exceden los límites del plan FREE
5. ✅ Determina qué template debería recibir
6. ✅ Verifica URLs incorrectas en todos los templates

**Salida esperada:**

```
🔍 DIAGNÓSTICO DE PROBLEMAS DE EMAIL
=====================================

✅ Conectado a MongoDB

============================================================
PARTE 1: VERIFICAR RECURSOS DEL USUARIO
============================================================

👤 Usuario encontrado: maximilian@rumba-dev.com
   ID: 507f1f77bcf86cd799439011
   Nombre: Maximilian

📋 Suscripción:
   Plan: premium
   Estado: active
   Estado de cuenta: grace_period

⏰ Período de gracia (downgrade):
   Expira: 2025-11-13T00:00:00.000Z
   Plan objetivo: free
   Auto-archive: true
   Reminder 3 días: false
   Reminder 1 día: false

📊 Recursos actuales:
   Carpetas activas: 15
   Calculadoras activas: 8
   Contactos activos: 25

🗂️  Elementos que exceden límites del plan FREE:
   Carpetas a archivar: 10  (15 - 5)
   Calculadoras a archivar: 5  (8 - 3)
   Contactos a archivar: 15  (25 - 10)

🔍 Análisis:
   ¿Excede límites?: ✅ SÍ
   ✉️  Debería recibir: gracePeriodReminderWithExcess

============================================================
PARTE 2: VERIFICAR URLs EN TEMPLATES
============================================================

⚠️  Template 'gracePeriodReminderWithExcess' tiene URLs incorrectas
⚠️  Template 'gracePeriodReminderNoExcess' tiene URLs incorrectas
⚠️  Template 'subscriptionCanceled' tiene URLs incorrectas

📋 Resumen de URLs incorrectas:
   - gracePeriodReminderWithExcess (htmlBody): 2 ocurrencia(s)
   - gracePeriodReminderNoExcess (htmlBody): 1 ocurrencia(s)
   - subscriptionCanceled (htmlBody): 1 ocurrencia(s)

💡 URL incorrecta: lawanalytics.app/subscription
   URL correcta: lawanalytics.app/apps/profiles/account/settings

============================================================
RESUMEN
============================================================

👤 Usuario: maximilian@rumba-dev.com
   Excede límites: SÍ
   Template correcto: gracePeriodReminderWithExcess

🔗 URLs incorrectas encontradas: 4
   Acción requerida: Ejecutar script de corrección de URLs

✅ Diagnóstico completado
```

---

### Script 2: Corrección de Templates

```bash
# Verificar qué cambios se harían (DRY RUN - sin modificar)
URLDB="tu_mongodb_url" node scripts/fixTemplateVariables.js --dry-run

# Aplicar las correcciones
URLDB="tu_mongodb_url" node scripts/fixTemplateVariables.js --apply
```

**Qué corrige:**
1. ✅ Convierte `${variable}` → `{{variable}}`
2. ✅ Corrige URLs: `/subscription` → `/apps/profiles/account/settings`
3. ✅ Maneja múltiples variaciones de URLs incorrectas

**Salida esperada:**

```
🔍 Verificando templates de email...
   Modo: APLICAR CAMBIOS

✅ Conectado a MongoDB

📊 Se encontraron 20 templates activos

📧 Template: gracePeriodReminderWithExcess
   Categoría: subscription
   Cambios necesarios:
   - subject: 1 variables a convertir
   - htmlBody: 15 variables a convertir
   - htmlBody: 2 URLs incorrectas a corregir
   - textBody: 12 variables a convertir
   ✅ Template actualizado

📧 Template: gracePeriodReminderNoExcess
   Categoría: subscription
   Cambios necesarios:
   - subject: 1 variables a convertir
   - htmlBody: 10 variables a convertir
   - htmlBody: 1 URLs incorrectas a corregir
   - textBody: 8 variables a convertir
   ✅ Template actualizado

============================================================
📋 RESUMEN
============================================================
Templates verificados: 20
Templates con problemas: 8

Templates afectados:
  - gracePeriodReminderWithExcess: 4 cambios
  - gracePeriodReminderNoExcess: 4 cambios
  - subscriptionCanceled: 2 cambios
  ...

✅ Todos los cambios han sido aplicados

✅ Proceso completado
```

---

## 🔍 Investigación del Problema 3

### Paso 1: Ejecutar diagnóstico

```bash
URLDB="tu_mongodb_url" node scripts/diagnoseEmailIssue.js maximilian@rumba-dev.com
```

### Paso 2: Verificar resultados

Si el diagnóstico muestra:
- ✅ **Excede límites: SÍ** → El usuario tiene recursos que exceden el plan FREE
- ✅ **Template correcto: gracePeriodReminderWithExcess** → Debería recibir este template

Pero el usuario recibió **gracePeriodReminderNoExcess**, entonces hay un problema en:

### Posibles causas y verificaciones:

#### Causa A: Error en cálculo de recursos

**Verificar:** Revisar los logs del `gracePeriodProcessor.js` cuando se envió el email

```bash
# Buscar en logs
grep "maximilian@rumba-dev.com" logs/grace-processor-output.log
```

**Buscar:**
- `foldersToArchive: 0` (debería ser > 0)
- `calculatorsToArchive: 0` (debería ser > 0)
- `contactsToArchive: 0` (debería ser > 0)

#### Causa B: Campo `archived` no existe

**Verificar en MongoDB:**

```javascript
// Conectar a MongoDB
db.folders.findOne({ userId: ObjectId("507f1f77bcf86cd799439011") })
db.calculators.findOne({ userId: ObjectId("507f1f77bcf86cd799439011") })
db.contacts.findOne({ userId: ObjectId("507f1f77bcf86cd799439011") })
```

**Buscar:**
- ¿Existe el campo `archived`?
- ¿Es `true`, `false`, o está ausente?

**Solución:** Si el campo no existe, agregarlo:

```javascript
// Agregar campo archived a documentos que no lo tienen
db.folders.updateMany(
  { archived: { $exists: false } },
  { $set: { archived: false } }
)

db.calculators.updateMany(
  { archived: { $exists: false } },
  { $set: { archived: false } }
)

db.contacts.updateMany(
  { archived: { $exists: false } },
  { $set: { archived: false } }
)
```

#### Causa C: userId no coincide

**Verificar:**

```javascript
// Buscar usuario
db.users.findOne({ email: "maximilian@rumba-dev.com" })

// Verificar si hay carpetas con ese userId
db.folders.countDocuments({ userId: ObjectId("ID_DEL_USUARIO") })

// Verificar tipos de dato
db.folders.findOne({ /* algún filtro */ }, { userId: 1 })
```

**Problema común:**
- Usuario tiene `userId` como **String**
- Carpetas tienen `userId` como **ObjectId**
- O viceversa

**Solución:** Convertir todos a ObjectId o String consistentemente

---

## 📝 Checklist de Solución

### Para Problema 1 (Variables sin reemplazar):

- [ ] Ejecutar `fixTemplateVariables.js --dry-run`
- [ ] Revisar cambios propuestos
- [ ] Ejecutar `fixTemplateVariables.js --apply`
- [ ] Enviar email de prueba para verificar

### Para Problema 2 (URLs incorrectas):

- [ ] Ejecutar `fixTemplateVariables.js --dry-run` (ya incluye corrección de URLs)
- [ ] Ejecutar `fixTemplateVariables.js --apply`
- [ ] Verificar en un email de prueba que la URL es correcta

### Para Problema 3 (Template incorrecto):

- [ ] Ejecutar `diagnoseEmailIssue.js` con el email del usuario
- [ ] Verificar que el usuario SÍ excede límites
- [ ] Revisar logs del `gracePeriodProcessor.js`
- [ ] Verificar que el campo `archived` existe en todas las colecciones
- [ ] Verificar que `userId` coincide entre colecciones
- [ ] Agregar logging adicional si es necesario
- [ ] Re-ejecutar el procesador para el usuario afectado

---

## 🚀 Comandos Rápidos

```bash
# 1. Diagnosticar usuario
URLDB="tu_url" node scripts/diagnoseEmailIssue.js maximilian@rumba-dev.com

# 2. Ver cambios necesarios (sin aplicar)
URLDB="tu_url" node scripts/fixTemplateVariables.js --dry-run

# 3. Aplicar correcciones
URLDB="tu_url" node scripts/fixTemplateVariables.js --apply

# 4. Verificar logs del procesador
tail -100 logs/grace-processor-output.log | grep maximilian

# 5. Re-ejecutar procesador manualmente
URLDB="tu_url" node scripts/gracePeriodProcessor.js
```

---

## 📞 Siguiente Pasos Recomendados

1. **Corregir templates inmediatamente:**
   - Ejecutar `fixTemplateVariables.js --apply` para corregir sintaxis y URLs

2. **Diagnosticar el caso específico:**
   - Ejecutar `diagnoseEmailIssue.js` para el usuario afectado
   - Verificar por qué recibió el template incorrecto

3. **Agregar logging mejorado:**
   - Modificar `gracePeriodProcessor.js` para loguear los valores calculados
   - Agregar log cuando se elige un template

4. **Verificar integridad de datos:**
   - Asegurar que el campo `archived` existe en todas las colecciones
   - Verificar consistencia de tipos de dato para `userId`

5. **Testing:**
   - Enviar emails de prueba después de las correcciones
   - Verificar con usuarios reales que los correos son correctos

---

**Última actualización:** 2025-11-10
