#!/bin/bash

# Script para ejecutar diagnóstico después de que la app esté corriendo
# Usa las variables de entorno que la app cargó desde AWS Secrets Manager

echo "🔍 DIAGNÓSTICO DE EMAILS - USUARIO: maximilian@rumba-dev.com"
echo "============================================================"
echo ""

# Verificar que URLDB esté disponible
if [ -z "$URLDB" ]; then
    echo "❌ Error: URLDB no está definido"
    echo ""
    echo "Por favor, ejecuta este script de una de estas formas:"
    echo ""
    echo "Opción 1: Exportar la variable manualmente"
    echo "  export URLDB='mongodb://tu_url_aqui'"
    echo "  ./scripts/runDiagnosisAfterAppStart.sh"
    echo ""
    echo "Opción 2: Ejecutar con la variable inline"
    echo "  URLDB='mongodb://tu_url_aqui' ./scripts/runDiagnosisAfterAppStart.sh"
    echo ""
    echo "Opción 3: Usar PM2 para obtener las variables"
    echo "  pm2 env stripe-webhooks | grep URLDB"
    echo "  export URLDB='valor_obtenido'"
    echo "  ./scripts/runDiagnosisAfterAppStart.sh"
    echo ""
    exit 1
fi

echo "✅ URLDB encontrado"
echo ""

# Paso 1: Ejecutar diagnóstico del usuario
echo "PASO 1: Diagnosticando usuario maximilian@rumba-dev.com..."
echo "-----------------------------------------------------------"
node scripts/diagnoseEmailIssue.js maximilian@rumba-dev.com

if [ $? -ne 0 ]; then
    echo "❌ Error ejecutando diagnóstico"
    exit 1
fi

echo ""
echo "============================================================"
echo ""

# Paso 2: Verificar templates
echo "PASO 2: Verificando templates (DRY RUN)..."
echo "-----------------------------------------------------------"
node scripts/fixTemplateVariables.js --dry-run

if [ $? -ne 0 ]; then
    echo "❌ Error verificando templates"
    exit 1
fi

echo ""
echo "============================================================"
echo "✅ DIAGNÓSTICO COMPLETADO"
echo "============================================================"
echo ""
echo "Siguiente paso:"
echo "  Si los cambios en templates se ven correctos, ejecuta:"
echo "  URLDB='$URLDB' node scripts/fixTemplateVariables.js --apply"
echo ""
