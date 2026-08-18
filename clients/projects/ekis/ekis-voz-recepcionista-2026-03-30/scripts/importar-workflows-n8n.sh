#!/bin/bash
# Script para importar workflows de n8n actualizados
# Ekis Recepcionista - HAT3X

N8N_BASE="https://hat3xia.app.n8n.cloud"
N8N_API_KEY="${N8N_API_KEY:?Falta N8N_API_KEY. Exportala antes de ejecutar este script.}"

# IDs de workflows existentes en n8n
WORKFLOW_CREAR="QTEkPUTUb4lLI6Tm"

# Colores para output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}=== Importar Workflows Ekis en n8n ===${NC}"

# Función para añadir settings requeridos por la API de n8n
add_n8n_settings() {
    local json=$1
    # Añadir settings antes del último }
    echo "$json" | sed 's/}$/, "settings": {"executionOrder": "v1", "binaryMode": "separate", "callerPolicy": "workflowsFromSameOwner", "availableInMCP": false}}/'
}

# Función para importar/actualizar workflow
import_workflow() {
    local file=$1
    local workflow_id=$2
    local name=$3

    echo -e "\n${YELLOW}Importando: ${name}${NC}"

    if [ ! -f "$file" ]; then
        echo -e "${RED}Error: Archivo no encontrado: $file${NC}"
        return 1
    fi

    # Leer el JSON del workflow y añadir settings requeridos
    local workflow_json=$(cat "$file" | tr '\n' ' ' | sed 's/  }/}/g')
    workflow_json=$(add_n8n_settings "$workflow_json")

    # Si hay workflow_id, actualizamos; si no, creamos uno nuevo
    if [ -n "$workflow_id" ]; then
        echo "Actualizando workflow existente: $workflow_id"
        response=$(curl -s -X PUT "${N8N_BASE}/api/v1/workflows/${workflow_id}" \
            -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
            -H "Content-Type: application/json" \
            -d "$workflow_json")
    else
        echo "Creando workflow nuevo"
        response=$(curl -s -X POST "${N8N_BASE}/api/v1/workflows" \
            -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
            -H "Content-Type: application/json" \
            -d "$workflow_json")
    fi

    # Verificar respuesta
    if echo "$response" | grep -q '"id"'; then
        echo -e "${GREEN}✓ Éxito${NC}"
        echo "$response" | grep -o '"id":"[^"]*"' | head -1
    else
        echo -e "${RED}✗ Error${NC}"
        echo "$response" | head -c 500
    fi
}

# Directorio de workflows
WORKFLOW_DIR="$(dirname "$0")/../webhooks"

# Importar cada workflow
echo -e "\n--- Workflows a importar ---"

# 1. Crear Reserva (actualizar existente)
import_workflow "${WORKFLOW_DIR}/crear-reserva.json" "$WORKFLOW_CREAR" "Ekis — Crear Reserva"

# 2. Verificar Disponibilidad (crear nuevo si no existe)
import_workflow "${WORKFLOW_DIR}/verificar-disponibilidad.json" "" "Ekis — Verificar Disponibilidad"

# 3. Modificar Reserva
import_workflow "${WORKFLOW_DIR}/modificar-reserva.json" "" "Ekis — Modificar Reserva"

# 4. Cancelar Reserva
import_workflow "${WORKFLOW_DIR}/cancelar-reserva.json" "" "Ekis — Cancelar Reserva"

echo -e "\n${GREEN}=== Importación completada ===${NC}"
echo -e "${YELLOW}Nota: Los IDs de calendario y spreadsheet ya están configurados:${NC}"
echo "  - Spreadsheet: 1MIKvRUbl47Q8hctGrOuV4e_c3t0Ei9hSPldkxQo48Q8"
echo "  - Calendar: ekis.recepcionista@gmail.com"
echo -e "${YELLOW}Siguiente paso: Activar los workflows en el dashboard de n8n${NC}"
