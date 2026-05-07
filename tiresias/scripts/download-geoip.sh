#!/bin/bash
# Download GeoLite2 Country database
# Requires MAXMIND_LICENSE_KEY environment variable
# Sign up at: https://www.maxmind.com/en/geolite2/signup

set -e

LICENSE_KEY="${MAXMIND_LICENSE_KEY:-}"
if [ -z "$LICENSE_KEY" ]; then
    echo "ERROR: MAXMIND_LICENSE_KEY environment variable not set"
    echo "Sign up at: https://www.maxmind.com/en/geolite2/signup"
    echo "Then export MAXMIND_LICENSE_KEY=your_key_here"
    exit 1
fi

DOWNLOAD_DIR="${GEOLITE2_DOWNLOAD_DIR:-./GeoIP}"
mkdir -p "$DOWNLOAD_DIR"

echo "Downloading GeoLite2-Country.tar.gz..."
curl -L "https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-Country&license_key=$LICENSE_KEY&suffix=tar.gz" \
    -o "$DOWNLOAD_DIR/GeoLite2-Country.tar.gz"

echo "Extracting..."
tar -xzf "$DOWNLOAD_DIR/GeoLite2-Country.tar.gz" -C "$DOWNLOAD_DIR"

# Find and rename the .mmdb file
MMDB_FILE=$(find "$DOWNLOAD_DIR" -name "GeoLite2-Country.mmdb" | head -1)
if [ -n "$MMDB_FILE" ]; then
    mv "$MMDB_FILE" "$DOWNLOAD_DIR/GeoLite2-Country.mmdb"
    rm -rf "$DOWNLOAD_DIR"/GeoLite2-Country_*
    echo "Done! Database at: $DOWNLOAD_DIR/GeoLite2-Country.mmdb"
else
    echo "ERROR: Could not find .mmdb file in archive"
    exit 1
fi
