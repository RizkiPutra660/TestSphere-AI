# Docker Executor Images

Pre-built Docker images for test execution with different dependency sets.

## Available Images

### python-basic
**Tag**: `genaiqa/python-basic:latest`  
**Use for**: Simple Python functions without external dependencies  
**Includes**:
- Python 3.11
- unittest (built-in)
- pytest 7.4.3
- pytest-cov 4.1.0

### python-web
**Tag**: `genaiqa/python-web:latest`  
**Use for**: Web applications and HTTP/API testing  
**Includes**:
- All from python-basic
- Flask 3.0.0
- requests 2.31.0
- httpx 0.25.2

### java-basic
**Tag**: `genaiqa/java-basic:latest`  
**Use for**: Java applications with JUnit and TestNG test frameworks  
**Includes**:
- Java 21 JDK (Eclipse Temurin, Alpine 3.23)
- Maven (latest)
- JUnit (configured via pom.xml)
- TestNG (configured via pom.xml)

### javascript-basic
**Tag**: `genaiqa/javascript-basic:latest`  
**Use for**: JavaScript/TypeScript applications with modern test frameworks  
**Includes**:
- Node.js 20 (Alpine)
- Jest 29.7.0
- Mocha 10.2.0
- Jasmine 5.1.0
- Chai 4.3.10 (assertion library)
- TypeScript 5.3.3
- ts-node 10.9.1
- Type definitions for Jest, Mocha, and Node

## Building Images

### Option 1: Build All Images (Automated)

**Windows (PowerShell):**
```powershell
cd backend/docker-executors
.\build-all.ps1
```

**Linux/Mac (Bash):**
```bash
cd backend/docker-executors
chmod +x build-all.sh
./build-all.sh
```

### Option 2: Build Individual Images

```bash
# Build all images
cd backend/docker-executors

# Python images
docker build -t genaiqa/python-basic:latest -f Dockerfile.python-basic .
docker build -t genaiqa/python-web:latest -f Dockerfile.python-web .

# Java image
docker build -t genaiqa/java-basic:latest -f Dockerfile.java-basic .

# JavaScript/TypeScript image
docker build -t genaiqa/javascript-basic:latest -f Dockerfile.javascript-basic .
```

## Usage

Images are automatically selected based on code analysis or user selection in the frontend.
