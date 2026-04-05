#!/bin/bash
# Tiresias GA - Telegram Status Reporter
BOT_TOKEN="8457546903:AAG0leHRDkFcRj2DRoVs-ZNcn7vkwh-kQ-E"
CHAT_ID="6898834067"

send_telegram() {
    curl -s "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
        -d "chat_id=${CHAT_ID}" \
        -d "parse_mode=Markdown" \
        -d "text=$1" > /dev/null 2>&1
}

# Called with: bash telegram_report.sh "message here"
send_telegram "$1"
