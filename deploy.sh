#!/bin/bash

# Safe deployment script - doesn't handle secrets

set -e

echo "Starting deployment..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed. Please install Node.js 16+."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "Error: npm is not installed. Please install npm."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d 'v' -f 2 | cut -d '.' -f 1)
if [ "$NODE_VERSION" -lt 16 ]; then
    echo "Error: Node.js version 16 or higher is required. Current version: $(node -v)"
    exit 1
fi

# Install dependencies
echo "Installing dependencies..."
npm ci --only=production

# Create necessary directories
echo "Creating directories..."
mkdir -p logs
mkdir -p temp
mkdir -p backups

# Set permissions
echo "Setting permissions..."
chmod 755 logs
chmod 755 temp
chmod 755 backups

# Check environment variables
echo "Checking environment variables..."
if [ ! -f .env ]; then
    echo "Warning: .env file not found. Please create it from .env.example"
    echo "cp .env.example .env"
    echo "Then edit .env with your configuration"
fi

# Build the application (if needed)
echo "Building application..."
npm run build

# Run security checks if available
if [ -f scripts/verify-security-setup.js ]; then
    echo "Running security checks..."
    node scripts/verify-security-setup.js
fi

# Run tests if available
if [ -f test/test.js ]; then
    echo "Running tests..."
    npm test
fi

echo "Deployment completed successfully!"
echo "To start the application, run:"
echo "npm start"