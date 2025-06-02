#!/bin/bash

# Script de utilidad para ejecutar pruebas de webhooks
# Uso: ./test-webhooks.sh [comando] [argumentos]

SCRIPT_DIR="scripts/pruebas"

case "$1" in
  "events"|"e")
    shift
    node "$SCRIPT_DIR/testWebhookEvents.js" "$@"
    ;;
  "failures"|"f")
    shift
    node "$SCRIPT_DIR/testPaymentFailures.js" "$@"
    ;;
  "listen"|"l")
    shift
    node "$SCRIPT_DIR/stripeWebhookListen.js" "$@"
    ;;
  "local"|"lo")
    shift
    node "$SCRIPT_DIR/stripeWebhookListenLocal.js" "$@"
    ;;
  "create"|"c")
    node "$SCRIPT_DIR/testWebhookEvents.js" create
    ;;
  "seq"|"s")
    node "$SCRIPT_DIR/testPaymentFailures.js" seq
    ;;
  "help"|"h"|"")
    echo "🧪 Utilidad de Pruebas de Webhooks"
    echo ""
    echo "Uso: ./test-webhooks.sh [comando] [argumentos]"
    echo ""
    echo "Comandos:"
    echo "  events, e     - Ejecutar simulador de eventos webhook"
    echo "  failures, f   - Ejecutar pruebas de pagos fallidos"
    echo "  listen, l     - Iniciar listener con Stripe CLI"
    echo "  local, lo     - Iniciar servidor local de webhooks"
    echo "  create, c     - Crear suscripción de prueba"
    echo "  seq, s        - Ejecutar secuencia de pagos fallidos"
    echo "  help, h       - Mostrar esta ayuda"
    echo ""
    echo "Ejemplos:"
    echo "  ./test-webhooks.sh create        # Crear datos de prueba"
    echo "  ./test-webhooks.sh events        # Menú interactivo"
    echo "  ./test-webhooks.sh events 5      # Enviar evento específico"
    echo "  ./test-webhooks.sh seq           # Secuencia de fallos"
    ;;
  *)
    echo "❌ Comando no reconocido: $1"
    echo "Usa './test-webhooks.sh help' para ver los comandos disponibles"
    exit 1
    ;;
esac