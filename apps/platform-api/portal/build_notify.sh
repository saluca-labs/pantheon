#!/bin/bash
# Tiresias Portal Build — Telegram Notifier
BOT_TOKEN="${TELEGRAM_BOT_TOKEN:?set TELEGRAM_BOT_TOKEN}"
CHAT_ID="-5122251755"

send_telegram() {
  local msg="$1"
  curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
    -d "chat_id=${CHAT_ID}" \
    -d "parse_mode=HTML" \
    -d "text=${msg}" > /dev/null 2>&1
}

# Called with: ./build_notify.sh "message"
send_telegram "$1"
