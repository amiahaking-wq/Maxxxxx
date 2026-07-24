#!/bin/bash

###############################################################################
# MAX Phone Client Setup Script for Termux
# Sets up Ollama and Node.js environment on Android phone via Termux
#
# Usage:
#   bash setup.sh
#
# Requirements:
#   - Termux app installed on Android
#   - Internet connection
#   - At least 4GB free storage for Ollama and phi3:mini model
###############################################################################

set -e  # Exit on error

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  MAX Phone Client Setup for Termux"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Update package repositories
echo "📦 Updating package repositories..."
pkg update -y
pkg upgrade -y

# Install Node.js
echo ""
echo "📦 Installing Node.js..."
pkg install nodejs -y

# Verify Node.js installation
NODE_VERSION=$(node --version)
echo "✓ Node.js installed: $NODE_VERSION"

# Install curl (required for Ollama install)
echo ""
echo "📦 Installing curl..."
pkg install curl -y

# Install Ollama
echo ""
echo "📦 Installing Ollama..."
if command -v ollama &> /dev/null; then
    echo "⚠ Ollama already installed"
    ollama --version
else
    curl -fsSL https://ollama.com/install.sh | sh
    echo "✓ Ollama installed"
fi

# Install npm dependencies
echo ""
echo "📦 Installing npm dependencies..."
cd ~/phone-client || {
    echo "✗ Error: ~/phone-client directory not found"
    echo "  Please copy the phone-client directory to your Termux home first"
    exit 1
}

npm install

echo "✓ Dependencies installed"

# Pull phi3:mini model
echo ""
echo "📦 Pulling phi3:mini model (this may take several minutes)..."
echo "  Model size: ~2.3GB"
ollama pull phi3:mini

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✓ Setup Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Next steps:"
echo ""
echo "1. Set environment variables:"
echo "   export PHONE_SECRET='your-secret-key-here'"
echo "   export RAILWAY_URL='https://your-app.railway.app'"
echo ""
echo "2. Start Ollama server (in a separate session):"
echo "   ollama serve"
echo ""
echo "3. Start the inference client:"
echo "   cd ~/phone-client"
echo "   node inference-client.js"
echo ""
echo "Optional: Add to ~/.bashrc for persistence:"
echo "   echo 'export PHONE_SECRET=\"your-secret\"' >> ~/.bashrc"
echo "   echo 'export RAILWAY_URL=\"https://your-app.railway.app\"' >> ~/.bashrc"
echo ""
