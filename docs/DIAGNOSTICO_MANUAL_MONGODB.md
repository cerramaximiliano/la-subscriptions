# 🔍 Diagnóstico Manual en MongoDB

## Problema de Conectividad

El entorno actual no tiene acceso de red a MongoDB Atlas. Puedes ejecutar el diagnóstico manualmente de estas formas:

---

## Opción 1: Usar mongosh (CLI)

### 1. Conectar a MongoDB

```bash
mongosh "mongodb+srv://cerramaximiliano:hYN46M8PuHFl0oDa@cluster0.t9oxary.mongodb.net/law_analytics?retryWrites=true&w=majority"
```

### 2. Ejecutar el script de diagnóstico

```bash
load("scripts/mongoDBDiagnosis.js")
```

---

## Opción 2: Usar MongoDB Compass (GUI)

### 1. Conectar a MongoDB

- Abrir MongoDB Compass
- Pegar esta URL de conexión:
  ```
  mongodb+srv://cerramaximiliano:hYN46M8PuHFl0oDa@cluster0.t9oxary.mongodb.net/law_analytics
  ```
- Click en "Connect"

### 2. Ejecutar consultas manualmente

Ir a la pestaña "Aggregations" o "Shell" y ejecutar:

#### A) Buscar usuario

```javascript
db.users.findOne({ email: "maximilian@rumba-dev.com" })
```

**Copiar el `_id` del usuario** (ejemplo: `ObjectId("67309a8f7cb0b2ede2db30ee")`)

#### B) Contar carpetas activas

```javascript
db.folders.countDocuments({
  userId: ObjectId("67309a8f7cb0b2ede2db30ee"),  // ← Reemplazar con el ID del usuario
  archived: { $ne: true }
})
```

**Resultado esperado:** Número de carpetas (ej: 15)

#### C) Contar calculadoras activas

```javascript
db.calculators.countDocuments({
  userId: ObjectId("67309a8f7cb0b2ede2db30ee"),  // ← Reemplazar con el ID del usuario
  archived: { $ne: true }
})
```

**Resultado esperado:** Número de calculadoras (ej: 8)

#### D) Contar contactos activos

```javascript
db.contacts.countDocuments({
  userId: ObjectId("67309a8f7cb0b2ede2db30ee"),  // ← Reemplazar con el ID del usuario
  archived: { $ne: true }
})
```

**Resultado esperado:** Número de contactos (ej: 25)

#### E) Calcular elementos que exceden límites

**Límites del plan FREE:**
- Carpetas: 5
- Calculadoras: 3
- Contactos: 10

**Cálculo:**
- Carpetas a archivar = Max(0, carpetas_activas - 5)
- Calculadoras a archivar = Max(0, calculadoras_activas - 3)
- Contactos a archivar = Max(0, contactos_activos - 10)

**Ejemplo:**
- Si carpetas_activas = 15 → carpetas_a_archivar = 10
- Si calculadoras_activas = 8 → calculadoras_a_archivar = 5
- Si contactos_activos = 25 → contactos_a_archivar = 15

**Conclusión:**
- Si alguno de estos valores > 0 → Debería recibir **gracePeriodReminderWithExcess**
- Si todos son 0 → Debería recibir **gracePeriodReminderNoExcess**

---

## Opción 3: Verificar campo `archived`

Si el usuario **SÍ** excede límites pero recibió el template incorrecto, verificar:

### Ver si el campo `archived` existe

```javascript
// Ver una carpeta de ejemplo
db.folders.findOne({
  userId: ObjectId("67309a8f7cb0b2ede2db30ee")
})

// Si NO aparece el campo "archived" en el resultado, ejecutar:
db.folders.updateMany(
  { archived: { $exists: false } },
  { $set: { archived: false } }
)

// Repetir para calculators y contacts
db.calculators.updateMany(
  { archived: { $exists: false } },
  { $set: { archived: false } }
)

db.contacts.updateMany(
  { archived: { $exists: false } },
  { $set: { archived: false } }
)
```

### Verificar tipo de `userId`

```javascript
// Ver tipo de userId en carpetas
db.folders.aggregate([
  { $match: { userId: ObjectId("67309a8f7cb0b2ede2db30ee") } },
  { $limit: 1 },
  { $project: {
      userId: 1,
      userIdType: { $type: "$userId" }
  }}
])

// Debe ser "objectId", no "string"
```

---

## 📊 Interpretación de Resultados

### Escenario 1: Usuario excede límites

```
Carpetas activas: 15
Calculadoras activas: 8
Contactos activos: 25

Carpetas a archivar: 10 (15 - 5)
Calculadoras a archivar: 5 (8 - 3)
Contactos a archivar: 15 (25 - 10)

✅ Excede límites: SÍ
✉️  Template correcto: gracePeriodReminderWithExcess
```

**Si recibió gracePeriodReminderNoExcess:**
→ **PROBLEMA:** El campo `archived` probablemente no existe o los valores llegaron como 0

**Solución:**
1. Agregar campo `archived` a todos los documentos
2. Re-ejecutar el procesador de período de gracia

---

### Escenario 2: Usuario NO excede límites

```
Carpetas activas: 3
Calculadoras activas: 2
Contactos activos: 5

Carpetas a archivar: 0
Calculadoras a archivar: 0
Contactos a archivar: 0

❌ Excede límites: NO
✉️  Template correcto: gracePeriodReminderNoExcess
```

**Si recibió gracePeriodReminderNoExcess:**
→ **CORRECTO:** El template es el apropiado

---

## 🚀 Después del Diagnóstico

Una vez que sepas si el usuario excede límites:

### Si excede límites y recibió template incorrecto:

1. **Corregir campo `archived`:**
   ```javascript
   db.folders.updateMany(
     { archived: { $exists: false } },
     { $set: { archived: false } }
   )
   // Repetir para calculators y contacts
   ```

2. **Corregir templates:**
   ```bash
   URLDB="..." node scripts/fixTemplateVariables.js --apply
   ```

3. **Re-ejecutar procesador:**
   ```bash
   URLDB="..." node scripts/gracePeriodProcessor.js
   ```

### Si NO excede límites pero dice que sí:

Revisar los modelos en `law-analytics-server`:
- Ver `docs/LAW_ANALYTICS_SERVER_INVESTIGATION.md`
- Verificar middlewares de creación
- Revisar lógica de archivado automático

---

## 📞 Referencia Rápida

**Usuario a diagnosticar:** `maximilian@rumba-dev.com`

**Límites plan FREE:**
- Carpetas: 5
- Calculadoras: 3
- Contactos: 10

**Templates:**
- `gracePeriodReminderWithExcess` - cuando excede límites
- `gracePeriodReminderNoExcess` - cuando NO excede límites

---

**Última actualización:** 2025-11-10
