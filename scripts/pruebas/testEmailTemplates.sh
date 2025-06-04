#!/bin/bash

# Script para probar templates de email
# Uso: ./testEmailTemplates.sh [comando] [opciones]

BASE_URL="${BASE_URL:-http://localhost:5001}"
EMAIL="${TEST_EMAIL:-cerramaximiliano@gmail.com}"

# Colores para output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

function show_help() {
    echo -e "${BLUE}📧 Email Template Tester${NC}"
    echo ""
    echo "Uso: $0 [comando] [opciones]"
    echo ""
    echo "Comandos:"
    echo "  list                    - Listar todos los templates disponibles"
    echo "  list-html               - Listar todos los templates con HTML"
    echo "  get <template>          - Obtener un template específico"
    echo "  send <template>         - Enviar un template específico"
    echo "  send-all                - Enviar todos los templates"
    echo "  send-category <cat>     - Enviar todos los templates de una categoría"
    echo ""
    echo "Ejemplos:"
    echo "  $0 list"
    echo "  $0 get paymentFailedFirst"
    echo "  $0 send gracePeriodReminder"
    echo "  $0 send-category payment"
    echo ""
    echo "Variables de entorno:"
    echo "  BASE_URL    - URL base del servicio (default: http://localhost:5001)"
    echo "  TEST_EMAIL  - Email de destino (default: cerramaximiliano@gmail.com)"
}

function list_templates() {
    echo -e "${BLUE}📋 Listando templates disponibles...${NC}"
    curl -s "$BASE_URL/api/webhook/test/templates" | jq .
}

function list_templates_html() {
    echo -e "${BLUE}📋 Listando templates con HTML...${NC}"
    curl -s "$BASE_URL/api/webhook/test/templates?includeHtml=true" | jq .
}

function get_template() {
    local template=$1
    echo -e "${BLUE}🔍 Obteniendo template: $template${NC}"
    curl -s "$BASE_URL/api/webhook/test/templates?templateName=$template" | jq .
}

function send_template() {
    local template=$1
    echo -e "${BLUE}📤 Enviando template: $template a $EMAIL${NC}"
    
    response=$(curl -s -X POST "$BASE_URL/api/webhook/test/templates/send" \
        -H "Content-Type: application/json" \
        -d "{\"userEmail\": \"$EMAIL\", \"templateName\": \"$template\"}")
    
    success=$(echo "$response" | jq -r '.success')
    
    if [ "$success" = "true" ]; then
        echo -e "${GREEN}✅ Email enviado exitosamente${NC}"
        echo "$response" | jq .
    else
        echo -e "${RED}❌ Error al enviar email${NC}"
        echo "$response" | jq .
    fi
}

function send_all_templates() {
    echo -e "${BLUE}🚀 Enviando todos los templates a $EMAIL${NC}"
    echo -e "${YELLOW}⏱️  Esto puede tomar varios minutos...${NC}"
    
    response=$(curl -s -X POST "$BASE_URL/api/webhook/test/templates/send-all" \
        -H "Content-Type: application/json" \
        -d "{\"userEmail\": \"$EMAIL\", \"delay\": 3000}")
    
    success=$(echo "$response" | jq -r '.success')
    
    if [ "$success" = "true" ]; then
        echo -e "${GREEN}✅ Proceso completado${NC}"
        echo "$response" | jq .
    else
        echo -e "${RED}❌ Error en el proceso${NC}"
        echo "$response" | jq .
    fi
}

function send_category() {
    local category=$1
    echo -e "${BLUE}📤 Enviando todos los templates de categoría: $category${NC}"
    
    response=$(curl -s -X POST "$BASE_URL/api/webhook/test/templates/send-all" \
        -H "Content-Type: application/json" \
        -d "{\"userEmail\": \"$EMAIL\", \"category\": \"$category\", \"delay\": 3000}")
    
    success=$(echo "$response" | jq -r '.success')
    
    if [ "$success" = "true" ]; then
        echo -e "${GREEN}✅ Proceso completado${NC}"
        echo "$response" | jq .
    else
        echo -e "${RED}❌ Error en el proceso${NC}"
        echo "$response" | jq .
    fi
}

# Verificar que jq esté instalado
if ! command -v jq &> /dev/null; then
    echo -e "${RED}❌ Error: jq no está instalado${NC}"
    echo "Instálalo con: sudo apt-get install jq (Ubuntu) o brew install jq (Mac)"
    exit 1
fi

# Procesar comandos
case "$1" in
    "list")
        list_templates
        ;;
    "list-html")
        list_templates_html
        ;;
    "get")
        if [ -z "$2" ]; then
            echo -e "${RED}❌ Error: Debes especificar un template${NC}"
            echo "Ejemplo: $0 get paymentFailedFirst"
            exit 1
        fi
        get_template "$2"
        ;;
    "send")
        if [ -z "$2" ]; then
            echo -e "${RED}❌ Error: Debes especificar un template${NC}"
            echo "Ejemplo: $0 send gracePeriodReminder"
            exit 1
        fi
        send_template "$2"
        ;;
    "send-all")
        send_all_templates
        ;;
    "send-category")
        if [ -z "$2" ]; then
            echo -e "${RED}❌ Error: Debes especificar una categoría${NC}"
            echo "Opciones: subscription, payment"
            exit 1
        fi
        send_category "$2"
        ;;
    *)
        show_help
        ;;
esac