#!/bin/bash

# Auto-generated script to load API keys from .env file
# Generated on: 2025-09-18T05:09:24.431Z

# Load environment variables
if [ -f ".env" ]; then
  export $(grep -v "^#" .env | xargs)
  echo "Loaded environment variables from .env"
else
  echo "Error: .env file not found"
  exit 1
fi

# Display loaded keys (masked for security)
echo "Loaded API keys:"
echo "  OpenRouter: sk-o***20d7"
echo "  ImageRouter: 7bdd***1f7a"
echo "  Pollinations_Text: D6iv***1F7r"
echo "  Pollinations_Image: D6iv***1F7r"
echo "  GitHub_Models: gith***7F3q"
echo "  Zuki_Journey: bc1d***4153"
echo "  HelixMind: heli***aZdo"
echo "  VoidAI: sk-v***R4Wp"
echo "  MNNAI: mnn-***db4d"
echo "  Z.ai: f082***7h4d"
echo "  Bigmodel.cn: 2394***t9zh"
echo "  ElectronHub: ek-u***FuOU"
echo "  NavyAI: sk-n***uLlQ"
