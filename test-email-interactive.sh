#!/bin/bash

# Script para ejecutar prueba interactiva de templates de email

echo "🚀 Iniciando prueba interactiva de templates de email..."
echo ""

# Ejecutar el script
node scripts/testEmailTemplatesInteractive.js

# Si hay error, mostrar mensaje
if [ $? -ne 0 ]; then
    echo ""
    echo "❌ Error ejecutando el script de prueba"
    echo "Verifica que tengas las credenciales de AWS configuradas"
    exit 1
fi