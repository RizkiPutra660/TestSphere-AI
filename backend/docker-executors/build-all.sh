#!/bin/bash
# Build all Docker executor images

set -e  # Exit on error

echo "Building GenAI-QA Docker Executor Images..."
echo "============================================"

cd "$(dirname "$0")"

# Find all Dockerfile.* files
dockerfiles=(Dockerfile.*)

if [ ${#dockerfiles[@]} -eq 0 ]; then
    echo "No Dockerfiles found!"
    exit 1
fi

total=${#dockerfiles[@]}
current=0

for dockerfile in "${dockerfiles[@]}"; do
    # Skip if it's just the pattern (no match)
    if [ ! -f "$dockerfile" ]; then
        continue
    fi
    
    current=$((current + 1))
    # Extract image name from filename (e.g., Dockerfile.python-basic -> python-basic)
    image_name="${dockerfile#Dockerfile.}"
    
    echo ""
    echo "[$current/$total] Building $image_name..."
    docker build -t "genaiqa/${image_name}:latest" -f "$dockerfile" .
done

echo ""
echo "============================================"
echo "✅ All $total images built successfully!"
echo ""
echo "Available images:"
docker images | grep genaiqa
