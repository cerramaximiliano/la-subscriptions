# 🚀 Guía Rápida de Diagnóstico

## Para ejecutar el diagnóstico del usuario maximilian@rumba-dev.com

### Opción 1: Si tienes URLDB disponible

```bash
# Ejecutar diagnóstico
URLDB="tu_mongodb_url" node scripts/diagnoseEmailIssue.js maximilian@rumba-dev.com

# Ver y aplicar correcciones de templates
URLDB="tu_mongodb_url" node scripts/fixTemplateVariables.js --dry-run
URLDB="tu_mongodb_url" node scripts/fixTemplateVariables.js --apply
```

### Opción 2: Si la app está corriendo con PM2

```bash
# 1. Obtener URLDB de PM2
./scripts/getURLDBFromPM2.sh

# 2. Exportar la variable (copia el valor del paso anterior)
export URLDB='mongodb://...'

# 3. Ejecutar diagnóstico completo
./scripts/runDiagnosisAfterAppStart.sh
```

### Opción 3: Iniciar la app primero

```bash
# 1. Iniciar app con PM2
pm2 start ecosystem.config.js --env production

# 2. Esperar a que cargue las variables de AWS Secrets Manager
pm2 logs stripe-webhooks --lines 20

# 3. Obtener URLDB
./scripts/getURLDBFromPM2.sh

# 4. Ejecutar diagnóstico
export URLDB='valor_obtenido'
./scripts/runDiagnosisAfterAppStart.sh
```

---

## 📋 Qué hace el diagnóstico

1. ✅ Verifica datos del usuario maximilian@rumba-dev.com
2. ✅ Cuenta sus recursos actuales (folders, calculators, contacts)
3. ✅ Calcula cuántos exceden los límites del plan FREE
4. ✅ Determina qué template debería recibir
5. ✅ Verifica URLs incorrectas en templates
6. ✅ Identifica problemas de sintaxis en variables

---

## 🔧 Si necesitas investigar law-analytics-server

Lee: `docs/LAW_ANALYTICS_SERVER_INVESTIGATION.md`

Este documento contiene:
- Qué archivos revisar en law-analytics-server
- Qué middlewares buscar
- Cómo verificar el campo `archived`
- Comandos de MongoDB para debugging
- Checklist completo de investigación

---

## 📞 Archivos de Referencia

- `docs/EMAIL_ISSUES_ANALYSIS.md` - Análisis completo de los 3 problemas
- `docs/FIX_EMAIL_VARIABLES.md` - Corrección de sintaxis de variables
- `docs/LAW_ANALYTICS_SERVER_INVESTIGATION.md` - Guía de investigación

---

## 🎯 Resultado Esperado

Después del diagnóstico sabrás:

1. ✅ Si el usuario excede límites del plan FREE
2. ✅ Qué template debería recibir (WithExcess o NoExcess)
3. ✅ Qué correcciones necesitan los templates
4. ✅ Si hay problemas con el campo `archived` o `userId`
