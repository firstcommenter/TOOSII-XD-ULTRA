#!/bin/bash

# TOOSII-XD ULTRA Bot Startup Script
# For Panel Hosting (Pterodactyl, etc.)

echo "=================================="
echo "   TOOSII-XD ULTRA Bot"
echo "   by Toosii Tech"
echo "=================================="
echo ""
echo "Contact:"
echo "WhatsApp: +254748340864"
echo "Telegram: @toosiitech"
echo ""
echo "=================================="
echo ""

# Create necessary directories
mkdir -p tmp session database

# Check Node.js version
echo "Node.js version: $(node -v)"
echo "NPM version: $(npm -v)"
echo ""

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Start the bot
echo "Starting TOOSII-XD ULTRA..."
echo ""
node index.js
