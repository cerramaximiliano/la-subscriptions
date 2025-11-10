# 🔧 Corrección de Variables en Templates de Email

## 📋 Problema Identificado

Has recibido un correo con variables sin reemplazar, mostrando literalmente `${daysRemaining}`, `${userName}`, etc.

### Causa Raíz

El sistema tiene una **incompatibilidad de sintaxis** entre:

1. **Templates en código** (`services/emailService.js`): Usan template literals de JavaScript `${variable}`
2. **Templates en base de datos**: Deben usar sintaxis Handlebars `{{variable}}`

La función `fillTemplate()` en `utils/templateHelper.js` está diseñada para reemplazar variables con la sintaxis `{{variable}}`, pero si los templates en la BD usan `${variable}`, **no se reemplazan**.

## 📧 Casos donde se envía el correo

El correo **"Tu período de gracia vence en ${daysRemaining} días"** se envía en estos casos:

### 1. Downgrade/Cancelación - Recordatorio a 3 días
- **Ubicación:** `gracePeriodProcessor.js:532-540`
- **Condición:** Faltan ≤3 días para que expire el período de gracia
- **daysRemaining:** `3`

### 2. Downgrade/Cancelación - Recordatorio a 1 día
- **Ubicación:** `gracePeriodProcessor.js:524-531`
- **Condición:** Falta ≤1 día para que expire el período de gracia
- **daysRemaining:** `1`

### 3. Pagos fallidos - Período de gracia activado
- **Ubicación:** `gracePeriodProcessor.js:541-589`
- **Condición:** Después de 4 intentos de pago fallidos
- **daysRemaining:** `15`

## ✅ Solución

Se ha creado el script `scripts/fixTemplateVariables.js` que:

1. Busca todos los templates activos en la base de datos
2. Detecta variables con sintaxis incorrecta `${...}`
3. Convierte automáticamente a la sintaxis correcta `{{...}}`

## 🚀 Ejecución del Script

### Opción 1: Con variable de entorno directa

```bash
# Verificar cambios sin aplicar (DRY RUN):
URLDB="mongodb://tu_url_de_conexion" node scripts/fixTemplateVariables.js --dry-run

# Aplicar las correcciones:
URLDB="mongodb://tu_url_de_conexion" node scripts/fixTemplateVariables.js --apply
```

### Opción 2: Usando archivo .env local

Si tienes un archivo `.env` con `URLDB` o `MONGODB_URI` configurado:

```bash
# Verificar cambios sin aplicar:
node scripts/fixTemplateVariables.js --dry-run

# Aplicar las correcciones:
node scripts/fixTemplateVariables.js --apply
```

### Opción 3: Desde la app en ejecución

Si la app está corriendo con PM2 y tiene acceso a las variables de entorno:

```bash
# Asegurarse de que las variables de entorno estén cargadas
pm2 list

# Ejecutar el script con las mismas variables de entorno
pm2 exec 'node scripts/fixTemplateVariables.js --dry-run'

# O ejecutar directamente si tienes acceso al entorno:
node scripts/fixTemplateVariables.js --apply
```

## 📊 Salida Esperada

### En modo DRY RUN:

```
🔍 Verificando templates de email...
   Modo: DRY RUN (solo verificación)

✅ Conectado a MongoDB

📊 Se encontraron X templates activos

📧 Template: gracePeriodReminderWithExcess
   Categoría: subscription
   Cambios necesarios:
   - subject: 1 variables a convertir
   - htmlBody: 15 variables a convertir
   - textBody: 12 variables a convertir
   ⏭️  DRY RUN - No se guardaron cambios

============================================================
📋 RESUMEN
============================================================
Templates verificados: 20
Templates con problemas: 5

Templates afectados:
  - gracePeriodReminderWithExcess: 3 cambios
  - gracePeriodReminderNoExcess: 3 cambios
  ...

⚠️  Para aplicar los cambios, ejecuta:
   node scripts/fixTemplateVariables.js --apply
```

### En modo APPLY:

```
🔍 Verificando templates de email...
   Modo: APLICAR CAMBIOS

✅ Conectado a MongoDB

📊 Se encontraron X templates activos

📧 Template: gracePeriodReminderWithExcess
   Categoría: subscription
   Cambios necesarios:
   - subject: 1 variables a convertir
   - htmlBody: 15 variables a convertir
   - textBody: 12 variables a convertir
   ✅ Template actualizado

============================================================
📋 RESUMEN
============================================================
Templates verificados: 20
Templates con problemas: 5

Templates afectados:
  - gracePeriodReminderWithExcess: 3 cambios
  - gracePeriodReminderNoExcess: 3 cambios
  ...

✅ Todos los cambios han sido aplicados
```

## 🔍 Verificación Post-Corrección

Después de aplicar las correcciones, puedes verificar que funcionan correctamente:

1. **Enviar un email de prueba:**
   ```bash
   node scripts/testEmailTemplatesInteractive.js
   ```

2. **Verificar que las variables se reemplacen correctamente** en el correo recibido

## 📝 Variables que deben estar presentes

Las siguientes variables deben estar disponibles en los datos del email:

- `userName` - Nombre del usuario
- `userEmail` - Email del usuario
- `daysRemaining` - Días restantes del período de gracia
- `gracePeriodEnd` - Fecha de fin del período de gracia
- `currentFolders` - Cantidad actual de carpetas
- `currentCalculators` - Cantidad actual de calculadoras
- `currentContacts` - Cantidad actual de contactos
- `foldersToArchive` - Carpetas a archivar
- `calculatorsToArchive` - Calculadoras a archivar
- `contactsToArchive` - Contactos a archivar
- `planLimits.maxFolders` - Límite de carpetas del plan
- `planLimits.maxCalculators` - Límite de calculadoras del plan
- `planLimits.maxContacts` - Límite de contactos del plan
- `targetPlan` - Plan objetivo (ej: "free")

## 🔧 Conversión de Sintaxis

El script convierte automáticamente:

| Antes (Incorrecto)      | Después (Correcto)      |
|-------------------------|-------------------------|
| `${userName}`           | `{{userName}}`          |
| `${daysRemaining}`      | `{{daysRemaining}}`     |
| `${gracePeriodEnd}`     | `{{gracePeriodEnd}}`    |
| `${currentFolders}`     | `{{currentFolders}}`    |
| `${planLimits.maxFolders}` | `{{planLimits.maxFolders}}` |

## ⚠️ Importante

- **Ejecuta primero en modo DRY RUN** para ver qué cambios se aplicarán
- **Haz un backup de la base de datos** antes de aplicar cambios masivos
- **Verifica los cambios** enviando emails de prueba después de la corrección

## 📞 Soporte

Si tienes problemas ejecutando el script, verifica:

1. ✅ Las variables de entorno están configuradas (`URLDB` o `MONGODB_URI`)
2. ✅ Tienes conexión a la base de datos MongoDB
3. ✅ El usuario tiene permisos de escritura en la colección `emailtemplates`

---

**Última actualización:** 2025-11-10
