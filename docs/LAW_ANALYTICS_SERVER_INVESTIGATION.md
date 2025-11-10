# 🔍 Investigación: Middlewares y Recursos en law-analytics-server

## 📋 Objetivo

Investigar cómo se crean y gestionan los recursos (folders, calculators, contacts) en el repositorio `law-analytics-server` para entender:

1. ¿Qué middlewares se ejecutan antes de crear estos recursos?
2. ¿Se verifica el campo `archived` al crear/listar recursos?
3. ¿Cómo se maneja el `userId` en las operaciones?
4. ¿Hay alguna lógica que pueda interferir con el conteo de recursos activos?

---

## 🔎 Archivos a Revisar

### 1. **Routes de Folders**

**Ubicación probable:** `routes/folders.js` o `routes/folder.js`

**Buscar:**

```javascript
// POST /api/folders - Crear carpeta
router.post('/', authMiddleware, ...otherMiddlewares, createFolder);

// GET /api/folders - Listar carpetas
router.get('/', authMiddleware, ...otherMiddlewares, getFolders);
```

**Preguntas:**
- ✅ ¿Qué middlewares se ejecutan antes de `createFolder`?
- ✅ ¿Hay un middleware que verifique límites del plan?
- ✅ ¿Se establece `archived: false` al crear una carpeta?
- ✅ ¿Cómo se obtiene el `userId` del request?

**Buscar en el código:**

```bash
# En law-analytics-server
cd law-analytics-server

# Buscar rutas de folders
grep -r "router.post.*folder" routes/
grep -r "createFolder" controllers/

# Buscar middlewares
grep -r "checkPlanLimits\|verifyPlan\|planMiddleware" middleware/

# Buscar campo archived
grep -r "archived.*false\|archived.*true" models/Folder.js
```

---

### 2. **Model de Folder**

**Ubicación probable:** `models/Folder.js`

**Buscar:**

```javascript
const FolderSchema = new mongoose.Schema({
  userId: { type: ..., ref: 'User', required: true },
  archived: { type: Boolean, default: false },  // ¿Existe este campo?
  // otros campos...
});
```

**Verificar:**
- ✅ ¿El campo `archived` tiene un valor por defecto?
- ✅ ¿El tipo de `userId` es `ObjectId` o `String`?
- ✅ ¿Hay un índice en `userId` y `archived`?

**Comando:**

```bash
# Ver el modelo completo
cat models/Folder.js

# Buscar campo archived
grep -A5 -B5 "archived" models/Folder.js

# Buscar tipo de userId
grep -A3 "userId" models/Folder.js
```

---

### 3. **Controller de Folders**

**Ubicación probable:** `controllers/folderController.js`

**Buscar la función `createFolder`:**

```javascript
exports.createFolder = async (req, res) => {
  try {
    const userId = req.user._id; // ¿De dónde viene req.user?

    // ¿Se verifica límite del plan aquí?
    const subscription = await Subscription.findOne({ user: userId });
    const limit = getPlanLimits(subscription.plan).maxFolders;

    const currentCount = await Folder.countDocuments({
      userId: userId,
      archived: { $ne: true } // ¿Se usa este filtro?
    });

    if (currentCount >= limit) {
      return res.status(403).json({ error: 'Plan limit exceeded' });
    }

    const folder = new Folder({
      ...req.body,
      userId: userId,
      archived: false // ¿Se establece explícitamente?
    });

    await folder.save();
    res.status(201).json(folder);
  } catch (error) {
    // ...
  }
};
```

**Preguntas:**
- ✅ ¿Se establece `archived: false` al crear?
- ✅ ¿Se verifica el límite del plan antes de crear?
- ✅ ¿Se usa el filtro `archived: { $ne: true }` al contar?

**Comando:**

```bash
# Ver el controller completo
cat controllers/folderController.js

# Buscar función createFolder
grep -A50 "createFolder\|exports.create" controllers/folderController.js

# Buscar countDocuments
grep -B5 -A5 "countDocuments" controllers/folderController.js
```

---

### 4. **Middleware de Autenticación**

**Ubicación probable:** `middleware/auth.js` o `middleware/authMiddleware.js`

**Buscar:**

```javascript
module.exports = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.userId); // ¿O decoded.id?

    if (!user) {
      throw new Error();
    }

    req.user = user; // ¿Qué se guarda aquí?
    req.userId = user._id; // ¿Se guarda el ID por separado?

    next();
  } catch (error) {
    res.status(401).json({ error: 'Please authenticate' });
  }
};
```

**Verificar:**
- ✅ ¿Cómo se establece `req.user`?
- ✅ ¿`req.user._id` es un ObjectId o String?
- ✅ ¿Hay un `req.userId` separado?

**Comando:**

```bash
# Ver el middleware de autenticación
cat middleware/auth.js

# Buscar dónde se establece req.user
grep -A10 "req.user.*=" middleware/auth.js
```

---

### 5. **Modelos de Calculator y Contact**

**Verificar la misma estructura:**

```bash
# Ver modelo de Calculator
cat models/Calculator.js | grep -A5 "userId\|archived"

# Ver modelo de Contact
cat models/Contact.js | grep -A5 "userId\|archived"
```

**Verificar:**
- ✅ ¿Los tres modelos tienen la misma estructura para `userId` y `archived`?
- ✅ ¿Todos usan el mismo tipo de dato para `userId`?

---

## 🚨 Posibles Problemas Identificados

### Problema A: Campo `archived` no existe o no tiene default

**Síntoma:**
```javascript
// En gracePeriodProcessor.js
const activeCount = await Folder.countDocuments({
  userId: userId,
  archived: { $ne: true }  // Si 'archived' no existe, este filtro no funciona
});
```

**Solución:**

Si el campo `archived` no existe en los documentos:

```javascript
// Agregar campo a documentos existentes
db.folders.updateMany(
  { archived: { $exists: false } },
  { $set: { archived: false } }
);

// Verificar
db.folders.findOne({ userId: ObjectId("...") });
```

---

### Problema B: Inconsistencia en tipo de `userId`

**Síntoma:**

```javascript
// Usuario tiene userId como String
{ _id: "507f1f77bcf86cd799439011" }

// Folder tiene userId como ObjectId
{ userId: ObjectId("507f1f77bcf86cd799439011") }

// El conteo falla porque los tipos no coinciden
await Folder.countDocuments({
  userId: "507f1f77bcf86cd799439011"  // String
});
// Resultado: 0 (no encuentra nada)
```

**Verificación:**

```javascript
// En MongoDB
db.users.findOne({ email: "maximilian@rumba-dev.com" })
// Ver tipo de _id

db.folders.findOne({}, { userId: 1 })
// Ver tipo de userId
```

**Solución:**

Convertir consistentemente a ObjectId:

```javascript
const mongoose = require('mongoose');
const userId = mongoose.Types.ObjectId(user._id);

const activeCount = await Folder.countDocuments({
  userId: userId,
  archived: { $ne: true }
});
```

---

### Problema C: Middleware que modifica el conteo

**Síntoma:**

Puede haber un middleware o hook que:
- Marca elementos como archivados automáticamente
- Filtra resultados antes de contarlos
- Modifica el `userId` en los documentos

**Verificar:**

```bash
# Buscar hooks en modelos
grep -r "pre.*save\|post.*save" models/

# Buscar middleware global
grep -r "mongoose.plugin" .

# Buscar filtros automáticos
grep -r "schema.query" models/
```

---

## 📝 Checklist de Investigación

### Verificar en law-analytics-server:

- [ ] Revisar `routes/folders.js` - identificar middlewares
- [ ] Revisar `controllers/folderController.js` - ver función `createFolder`
- [ ] Revisar `models/Folder.js` - verificar schema y defaults
- [ ] Revisar `middleware/auth.js` - ver cómo se establece `req.user`
- [ ] Repetir para `Calculator` y `Contact`
- [ ] Buscar middlewares de verificación de límites
- [ ] Verificar hooks de Mongoose en los modelos

### Verificar en MongoDB:

- [ ] Verificar existencia del campo `archived` en documentos
- [ ] Verificar tipo de `userId` en Users vs Folders/Calculators/Contacts
- [ ] Contar documentos manualmente para el usuario afectado
- [ ] Verificar índices en las colecciones

---

## 🛠️ Comandos de MongoDB para Debugging

```javascript
// Conectar a MongoDB
mongo "tu_mongodb_url"

// 1. Buscar usuario
db.users.findOne({ email: "maximilian@rumba-dev.com" })

// Copiar el _id del usuario (ejemplo: ObjectId("507f1f77bcf86cd799439011"))

// 2. Verificar carpetas
db.folders.find({
  userId: ObjectId("507f1f77bcf86cd799439011")
}).count()

// 3. Verificar carpetas NO archivadas
db.folders.find({
  userId: ObjectId("507f1f77bcf86cd799439011"),
  archived: { $ne: true }
}).count()

// 4. Ver una carpeta de ejemplo
db.folders.findOne({
  userId: ObjectId("507f1f77bcf86cd799439011")
})

// 5. Verificar si el campo archived existe
db.folders.find({
  userId: ObjectId("507f1f77bcf86cd799439011"),
  archived: { $exists: true }
}).count()

// 6. Verificar tipo de userId
db.folders.aggregate([
  { $match: { userId: ObjectId("507f1f77bcf86cd799439011") } },
  { $limit: 1 },
  { $project: { userId: 1, userIdType: { $type: "$userId" } } }
])

// 7. Repetir para calculators
db.calculators.find({
  userId: ObjectId("507f1f77bcf86cd799439011"),
  archived: { $ne: true }
}).count()

// 8. Repetir para contacts
db.contacts.find({
  userId: ObjectId("507f1f77bcf86cd799439011"),
  archived: { $ne: true }
}).count()
```

---

## 🎯 Resultado Esperado

Después de esta investigación deberías poder responder:

1. ✅ ¿Por qué `foldersToArchive`, `calculatorsToArchive`, `contactsToArchive` llegaron como 0?
2. ✅ ¿Existe el campo `archived` en los documentos?
3. ✅ ¿El tipo de `userId` es consistente entre colecciones?
4. ✅ ¿Hay algún middleware interfiriendo con el conteo?
5. ✅ ¿Qué cambios necesitas hacer en el código o en la BD?

---

## 📞 Próximos Pasos

Una vez completada la investigación:

1. **Si el campo `archived` no existe:**
   - Agregarlo a todos los documentos existentes
   - Actualizar los modelos para incluir default value

2. **Si hay inconsistencia de tipos:**
   - Convertir todos los `userId` al mismo tipo (ObjectId recomendado)
   - Actualizar el código para hacer la conversión

3. **Si hay middlewares interferentes:**
   - Documentar su comportamiento
   - Ajustar la lógica de conteo en `gracePeriodProcessor.js`

4. **Ejecutar diagnóstico nuevamente:**
   ```bash
   URLDB="..." node scripts/diagnoseEmailIssue.js maximilian@rumba-dev.com
   ```

---

**Última actualización:** 2025-11-10
