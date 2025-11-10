#!/bin/bash

# Script para obtener URLDB desde PM2 si la app está corriendo

echo "🔍 Buscando URLDB en procesos PM2..."
echo ""

# Verificar si PM2 está instalado
if ! command -v pm2 &> /dev/null; then
    echo "❌ PM2 no está instalado"
    echo ""
    echo "Instala PM2 con: npm install -g pm2"
    exit 1
fi

# Verificar si hay procesos corriendo
PM2_PROCESSES=$(pm2 list | grep -c "online")

if [ "$PM2_PROCESSES" -eq 0 ]; then
    echo "⚠️  No hay procesos PM2 corriendo"
    echo ""
    echo "Inicia la app con:"
    echo "  pm2 start ecosystem.config.js --env production"
    echo ""
    exit 1
fi

echo "✅ PM2 está corriendo con $PM2_PROCESSES proceso(s)"
echo ""

# Listar procesos
echo "Procesos PM2:"
pm2 list
echo ""

# Intentar obtener URLDB del proceso stripe-webhooks
echo "Buscando variables de entorno en 'stripe-webhooks'..."
echo ""

# Obtener el ID del proceso
PROCESS_ID=$(pm2 id stripe-webhooks 2>/dev/null)

if [ -z "$PROCESS_ID" ]; then
    echo "⚠️  Proceso 'stripe-webhooks' no encontrado"
    echo ""
    echo "Procesos disponibles:"
    pm2 list
    echo ""
    echo "Usa: pm2 env <nombre_proceso> para ver variables de entorno"
    exit 1
fi

echo "✅ Proceso encontrado: stripe-webhooks (ID: $PROCESS_ID)"
echo ""

# Intentar obtener URLDB
echo "Variables de entorno del proceso:"
echo "-----------------------------------"
pm2 env $PROCESS_ID 2>/dev/null | grep -i "URLDB\|MONGODB"

echo ""
echo "-----------------------------------"
echo ""
echo "💡 Para usar URLDB en los scripts, copia el valor y ejecuta:"
echo ""
echo "   export URLDB='valor_de_urldb_aqui'"
echo "   node scripts/diagnoseEmailIssue.js maximilian@rumba-dev.com"
echo ""
echo "O directamente:"
echo ""
echo "   URLDB='valor_aqui' node scripts/diagnoseEmailIssue.js maximilian@rumba-dev.com"
echo ""
