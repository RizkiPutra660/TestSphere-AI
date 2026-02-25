#!/bin/bash
# GenAI-QA CLI Installation Script

echo "GenAI-QA CLI Installation"
echo "========================="
echo ""

# Check Python version
python_version=$(python3 --version 2>&1 | awk '{print $2}')
echo "✓ Python version: $python_version"

# Check if in CLI directory
if [ ! -f "setup.py" ]; then
    echo "✗ Error: setup.py not found. Please run this script from the CLI directory."
    exit 1
fi

echo ""
echo "Installing dependencies..."
pip install -r requirements.txt

echo ""
echo "Installing GenAI-QA CLI..."
pip install -e .

echo ""
echo "✓ Installation complete!"
echo ""
echo "Quick start:"
echo "  1. Login:   genai-qa auth login"
echo "  2. Help:    genai-qa --help"
echo "  3. Status:  genai-qa auth status"
echo ""
