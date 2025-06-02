#!/bin/bash

# Script para probar el nuevo procesador de períodos de gracia

echo "🔄 Test del Procesador de Períodos de Gracia - Microservicio"
echo "==========================================================="
echo ""

# Colores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Verificar que estamos en el directorio correcto
if [ ! -f "scripts/gracePeriodProcessor.js" ]; then
    echo -e "${RED}❌ Error: No se encuentra el procesador. Asegúrate de estar en el directorio correcto.${NC}"
    exit 1
fi

echo "1️⃣  Probando ejecución directa del procesador..."
echo "------------------------------------------------"
node scripts/gracePeriodProcessor.js
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Ejecución directa exitosa${NC}"
else
    echo -e "${RED}❌ Error en ejecución directa${NC}"
fi

echo ""
echo "2️⃣  Probando ejecución a través de scheduleTasks..."
echo "------------------------------------------------"
node scripts/scheduleTasks.js processGracePeriods
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Ejecución vía scheduleTasks exitosa${NC}"
else
    echo -e "${RED}❌ Error en ejecución vía scheduleTasks${NC}"
fi

echo ""
echo "3️⃣  Verificando configuración PM2..."
echo "------------------------------------------------"
if pm2 list | grep -q "grace-period-processor"; then
    echo -e "${YELLOW}⚠️  El procesador ya está en PM2. Para actualizarlo:${NC}"
    echo "   pm2 delete grace-period-processor"
    echo "   pm2 start ecosystem.config.js --only grace-period-processor"
else
    echo -e "${GREEN}✅ Procesador no está en PM2. Para agregarlo:${NC}"
    echo "   pm2 start ecosystem.config.js --only grace-period-processor"
fi

echo ""
echo "4️⃣  Comandos útiles:"
echo "------------------------------------------------"
echo "Ver logs del procesador:"
echo "  pm2 logs grace-period-processor"
echo ""
echo "Ver próxima ejecución:"
echo "  pm2 desc grace-period-processor | grep cron"
echo ""
echo "Ejecutar manualmente:"
echo "  node scripts/gracePeriodProcessor.js"
echo ""
echo "Monitorear webhooks:"
echo "  node scripts/monitorWebhooks.js"
echo ""
echo -e "${GREEN}✅ Test completado${NC}"