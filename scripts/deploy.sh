#!/usr/bin/env bash
# Tiresias SOC — Deploy LGTM stack
# Usage: ./scripts/deploy.sh [up|down|restart|status|logs]

set -euo pipefail

COMPOSE_FILE="docker-compose.lgtm.yaml"
PROJECT_NAME="tiresias-soc"

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "ERROR: .env not found. Copy .env.example to .env and fill in values."
  exit 1
fi

case "${1:-up}" in
  up)
    echo "Starting Tiresias SOC stack..."
    docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" --env-file .env up -d
    echo ""
    echo "Grafana: $(grep GRAFANA_ROOT_URL .env | cut -d= -f2)"
    docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" ps
    ;;
  down)
    docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" down
    ;;
  restart)
    docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" --env-file .env restart
    ;;
  status)
    docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" ps
    ;;
  logs)
    docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" logs -f --tail=100 "${2:-}"
    ;;
  pull)
    docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" pull
    ;;
  *)
    echo "Usage: $0 {up|down|restart|status|logs|pull}"
    exit 1
    ;;
esac
