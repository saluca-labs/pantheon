#!/bin/bash
# SoulAuth Manager - 15-minute Telegram update loop
# Kill this PID when executor finishes

BOT_TOKEN="8457546903:AAG0leHRDkFcRj2DRoVs-ZNcn7vkwh-kQ-E"
CHAT_ID="-5122251755"
PIDFILE="/tmp/soulauth_monitor.pid"
echo $$ > "$PIDFILE"

send_telegram() {
    local msg="$1"
    curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
        -d chat_id="${CHAT_ID}" \
        -d text="${msg}" \
        -d parse_mode="Markdown" > /dev/null 2>&1
}

while true; do
    PHASE="unknown"
    STATUS="RUNNING"
    LAST_ACTIVITY="monitoring"

    if [ -f /home/cris/soulAuth/.planning/STATE.md ]; then
        PHASE=$(grep "Phase Progress" -A 10 /home/cris/soulAuth/.planning/STATE.md | grep "\[x\]" | tail -1 | sed 's/.*Phase \([0-9]\).*/\1/' || echo "0")
        LAST_ACTIVITY=$(grep "Last:" /home/cris/soulAuth/.planning/STATE.md 2>/dev/null | tail -1 | sed 's/.*Last: //' || echo "building...")
    fi

    if [ -f /tmp/soulauth_complete ]; then
        STATUS="COMPLETE"
    fi

    TIME=$(date -u +"%H:%M UTC")

    send_telegram "$(cat <<EOF
🦇 soulAuth — Manager Update
Status: ${STATUS}
Phase: ${PHASE} of 5
Last activity: ${LAST_ACTIVITY}
Node: gemini-cli | ${TIME}
EOF
)"

    if [ "$STATUS" = "COMPLETE" ]; then
        rm -f "$PIDFILE"
        exit 0
    fi

    sleep 900  # 15 minutes
done
