# GenAI-QA

A web app for QA to make their daily testing work easy.

## Prerequisites

Before you begin, ensure you have the following installed on your local machine:

### System Requirements
- **Windows 10/11**, **macOS 10.15+**, or **Linux** (Ubuntu 18.04+)
- **Minimum 4GB RAM** (8GB recommended for smooth development)
- **At least 5GB free disk space** (for Docker images and dependencies)

### Required Software
- **[Docker Desktop](https://www.docker.com/products/docker-desktop/)** - For PostgreSQL database
  - Windows: Download `.exe` installer
  - macOS: Download `.dmg` installer or use Homebrew: `brew install --cask docker`
  - Linux: Install via package manager (see [Docker docs](https://docs.docker.com/engine/install/ubuntu/))

- **[Python 3.9+](https://www.python.org/downloads/)** - For backend
  - **Windows**: Download installer and check "Add Python to PATH" during installation
  - **macOS/Linux**: Use Homebrew or system package manager
  - **Verify**: Run `python --version` in terminal

- **[Node.js 18+](https://nodejs.org/)** - For frontend
  - Includes npm (Node Package Manager) automatically
  - **Verify**: Run `node --version` and `npm --version` in terminal

- **[Git](https://git-scm.com/)** - For version control
  - **Windows**: Download from [git-scm.com](https://git-scm.com/download/win)
  - **Verify**: Run `git --version` in terminal

### Verification Checklist

Before proceeding, verify all tools are installed:

```bash
# Check Python version (should be 3.9 or higher)
python --version

# Check Node.js version (should be 18 or higher)
node --version

# Check npm version
npm --version

# Check Git version
git --version

# Check Docker installation
docker --version
docker ps  # Should show "Cannot connect to Docker daemon" if Docker isn't running, which is expected
```

**Note for Windows Users**: If you encounter issues running commands in PowerShell, try using Command Prompt (cmd.exe) instead, or ensure you're running PowerShell as Administrator.

## Project Setup - Complete Step-by-Step Guide

### Step 1: Clone the Repository

```bash
# Clone the project
git clone <repository-url>
cd GenAI-QA
```

### Step 2: Environment Variables Setup

**Windows (PowerShell - Run as Administrator):**
```powershell
Copy-Item example.env -Destination .env
```

**Windows (Command Prompt):**
```cmd
copy example.env .env
```

**macOS/Linux:**
```bash
cp example.env .env
```

✅ The `.env` file now contains default database credentials that work with the Docker setup:
- Database User: `admin`
- Database Password: `password`
- Database Name: `qa_automation`
- Database Port: `5432`
- Database Host: `localhost`

Open `.env` in your editor and fill in the keys described below. Everything under **Database** and **Cache** already has working defaults — only the keys marked ⚠️ need to be obtained before use.

### Step 2b: Obtaining API Keys & Secrets

#### 🔑 Security Keys (required to run the app)

These three keys must be set before starting the backend. Generate them once and keep them secret.

```bash
# SECRET_KEY — Flask session signing key
python -c "import secrets; print(secrets.token_hex(32))"

# JWT_SECRET_KEY — signs JWT access tokens
python -c "import secrets; print(secrets.token_hex(32))"

# SECRETS_ENCRYPTION_KEY — Fernet key for encrypting stored project secrets
# Must be installed first: pip install cryptography
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

# GITHUB_WEBHOOK_SECRET — arbitrary secret you choose; paste the same value into GitHub
python -c "import secrets; print(secrets.token_hex(20))"
```

Paste the output of each command into the corresponding line in `.env`.

---

#### 🤖 Google Gemini API Key (`GOOGLE_API_KEY`) ⚠️

Required when `LLM_PROVIDER=google` (the default).

1. Go to [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Click **Create API key** → select or create a project
4. Copy the key and paste it into `.env`:
   ```
   GOOGLE_API_KEY=AIzaSy...
   ```

---

#### 🐙 GitHub Personal Access Token (`GITHUB_TOKEN`) ⚠️

Required for cloning **private** GitHub repositories; also raises rate limits for public repos.

1. Go to [https://github.com/settings/tokens](https://github.com/settings/tokens)
2. Click **Generate new token (classic)**
3. Give it a descriptive name (e.g. `GenAI-QA local`)
4. Set expiration as desired
5. Under **Scopes**, check `repo` (full control of private repositories)
6. Click **Generate token** and copy it immediately (you won't see it again)
7. Paste into `.env`:
   ```
   GITHUB_TOKEN=ghp_...
   ```

---

#### 🦊 GitLab Personal Access Token (`GITLAB_TOKEN`) ⚠️

Required for cloning **private** GitLab repositories.

1. Go to your GitLab profile: **Edit Profile → Access Tokens** (or [https://gitlab.com/-/profile/personal_access_tokens](https://gitlab.com/-/profile/personal_access_tokens))
2. Give it a name and expiry date
3. Under **Scopes**, check `read_repository`
4. Click **Create personal access token** and copy it
5. Paste into `.env`:
   ```
   GITLAB_TOKEN=glpat-...
   ```

---

#### 🔐 GitHub OAuth App (`GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`) ⚠️

Required only if you want **"Login with GitHub"** on the login page. Skip if using email login only.

1. Go to [https://github.com/settings/developers](https://github.com/settings/developers)
2. Click **New OAuth App**
3. Fill in:
   - **Application name**: `GenAI-QA` (or anything)
   - **Homepage URL**: `http://localhost:5173`
   - **Authorization callback URL**: `http://localhost:5000/api/auth/github/callback`
4. Click **Register application**
5. Copy **Client ID** and click **Generate a new client secret**
6. Paste both into `.env`:
   ```
   GITHUB_CLIENT_ID=Ov23li...
   GITHUB_CLIENT_SECRET=abc123...
   ```

---

#### 🔔 GitHub Webhook Secret (`GITHUB_WEBHOOK_SECRET`) ⚠️

Required only if you want GitHub to **automatically trigger test generation** on push events.

1. Generate a random value (see the Security Keys section above):
   ```bash
   python -c "import secrets; print(secrets.token_hex(20))"
   ```
2. Paste it into `.env`:
   ```
   GITHUB_WEBHOOK_SECRET=<generated-value>
   ```
3. In your GitHub repository, go to **Settings → Webhooks → Add webhook**
4. Set:
   - **Payload URL**: `http://<your-server>:5000/api/queue/webhook/github`
   - **Content type**: `application/json`
   - **Secret**: the same value from step 1
   - **Events**: choose *Just the push event* or *Let me select individual events*
5. Click **Add webhook**

---

#### 🦙 Ollama (local LLM — optional)

No API key needed. Required only when `LLM_PROVIDER=ollama`.

1. Install Ollama from [https://ollama.com/download](https://ollama.com/download)
2. Pull a model:
   ```bash
   ollama pull llama3.1:8b
   ```
3. Update `.env`:
   ```
   LLM_PROVIDER=ollama
   OLLAMA_MODEL=llama3.1:8b
   OLLAMA_BASE_URL=http://localhost:11434
   ```

### Step 3: Start PostgreSQL Database (Docker)

**Ensure Docker Desktop is running before proceeding!**

```bash
# Navigate to project root (if not already there)
cd GenAI-QA

# Start PostgreSQL container
docker-compose up -d
```

**What this does:**
- Downloads PostgreSQL 15 image (~400MB) if not already on your machine
- Creates a Docker container named `qa_automation_db`
- Starts PostgreSQL on `localhost:5432`
- Creates the `qa_automation` database
- **Automatically runs initialization scripts:**
  - `backend/init.sql` - Creates core tables (users, projects, etc.)
  - `backend/seeds/01_initial_users.sql` - Populates test user accounts
  - These run only on first container creation via Docker's `docker-entrypoint-initdb.d` mechanism

**Note**: The consolidated migrations (`backend/migrations/000_init.sql`) will be applied separately in Step 4e after the backend is set up.

**Verify database is running:**

```bash
# Windows, macOS, and Linux:
docker ps
# You should see 'qa_automation_db' in the container list

# Test database connection
docker exec -it qa_automation_db psql -U admin -d qa_automation -c "SELECT 1"
# Should return: 1
```

**Troubleshooting Docker:**
- "Cannot connect to Docker daemon": Docker Desktop isn't running. Start Docker Desktop.
- "Port 5432 already in use": Another PostgreSQL instance is running. Stop it or change port in `.env`
- "Image pull errors": Check your internet connection

**View database logs:**
```bash
docker-compose logs postgres
```

### Step 4: Backend Setup (Python)

Navigate to the backend directory and create a Python virtual environment:

#### 4a. Create Virtual Environment

**Step into the backend folder:**
```bash
cd backend
```

**Create virtual environment:**

**Windows (PowerShell or Command Prompt):**
```powershell
python -m venv venv
```

**macOS/Linux:**
```bash
python3 -m venv venv
```

✅ This creates a `venv` folder with isolated Python dependencies (takes 30-60 seconds)

#### 4b. Activate Virtual Environment

**Important**: You must activate the virtual environment in every new terminal session!

**Windows (PowerShell):**
```powershell
.\venv\Scripts\Activate.ps1
```

If you get an execution policy error:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
.\venv\Scripts\Activate.ps1
```

**Windows (Command Prompt):**
```cmd
venv\Scripts\activate.bat
```

**macOS/Linux:**
```bash
source venv/bin/activate
```

✅ You should see `(venv)` prefix in your terminal when activated:
```
(venv) C:\Users\rizki\Documents\Kuliah\Internship\GenAI-QA\backend>
```

#### 4c. Upgrade pip (Recommended)

Ensure you have the latest pip version:

**Windows:**
```powershell
python -m pip install --upgrade pip
```

**macOS/Linux:**
```bash
pip install --upgrade pip
```

#### 4d: Install Dependencies from requirements.txt

**Important**: Virtual environment must be activated!

```bash
# This will install all Python libraries needed for the backend
pip install -r requirements.txt
```

**What gets installed:**
- Flask (web framework)
- SQLAlchemy (database ORM)
- Pydantic (data validation)
- python-dotenv (environment variables)
- psycopg2 (PostgreSQL driver) - **Note: Windows users may need Visual C++ build tools**
- PyJWT (authentication)
- And 20+ other dependencies (~400MB total)

**Important Note on Windows - psycopg2 Installation:**

The `psycopg2` package requires C++ build tools on Windows. If installation fails with "Microsoft Visual C++ 14.0 is required":

1. **Option A (Recommended)**: Install Microsoft Visual Studio C++ Build Tools
   - Download: [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
   - During installation, select "Desktop development with C++"
   - Restart your computer
   - Retry: `pip install -r requirements.txt`

2. **Option B**: Install Visual Studio Community (full IDE)
   - Download: [Visual Studio Community](https://visualstudio.microsoft.com/vs/community/)
   - Include C++ workload during installation
   - Restart and retry

3. **Option C**: Use pre-built wheel
   ```bash
   pip install psycopg2-binary
   # Then remove psycopg2 from requirements.txt
   ```

**Verify installation:**
```bash
pip list
# Should show Flask, SQLAlchemy, psycopg2, pydantic, python-dotenv, etc.
```

#### 4e. Run Database Migrations

**Important**: Run this after every `git pull` to sync schema changes!

```bash
# Make sure you're in backend folder and venv is activated
python run_migrations.py
```

**Expected output:**
```
Migration tracking table created
Migrating: 000_init.sql
Migration 000_init.sql completed successfully
```

**What this does:**
- Applies the consolidated database migration schema (backend/migrations/000_init.sql)
- Creates all additional tables: test_scenarios, test_queue_items, project_secrets, etc.
- Creates indexes for query performance
- Creates triggers for automatic timestamp updates
- Tracks which migrations have been applied to prevent re-running them

**Note**: This is separate from the initial database setup in Step 3:
- **Step 3** (init.sql + seeds): Runs once when Docker container first starts
- **Step 4e** (migrations): Must be run manually after backend setup is ready

#### 4f. Start the Backend Server

```bash
# Make sure you're in backend folder and venv is activated
python app.py
```

**Expected output:**
```
 * Running on http://127.0.0.1:5000
 * Debug mode: on
```

✅ Backend API is now running at `http://localhost:5000`

**Verify backend is working:**
```bash
# In a new terminal (keep backend running):
curl http://localhost:5000/api/health
# Should return: {"status": "healthy"}
```

**Common backend issues:**

| Problem | Solution |
|---------|----------|
| "Connection refused" to database | Check Docker is running: `docker ps` |
| "ModuleNotFoundError: No module named 'flask'" | `pip install -r requirements.txt` and verify venv is activated |
| "Port 5000 already in use" | Kill other process or change `FLASK_PORT` in `.env` |
| "Certificate verification failed" | Update pip: `pip install --upgrade pip` |
| "No such file or directory: requirements.txt" | Make sure you're in the `backend` folder |

**Keep this terminal open** - The backend needs to be running for the frontend to work

### Step 5: Frontend Setup (Node.js & React)

**Open a new terminal window** (keep the backend running in the previous terminal)

#### 5a: Navigate to Frontend Directory

```bash
# From project root
cd frontend
```

#### 5b: Install npm Dependencies

```bash
# This downloads and installs all Node.js packages
npm install
```

**What gets installed:**
- React 18 (UI library)
- TypeScript (type safety)
- Vite (fast build tool)
- TailwindCSS (styling)
- Axios (HTTP client)
- And 50+ other dependencies (~500MB total)

**Installation tips:**
- First install takes 2-5 minutes depending on internet speed
- Creates `node_modules` folder (~400MB) - normal size
- `.npmrc` file may be created - that's normal

**Verify installation:**
```bash
ls node_modules  # Windows: dir node_modules
# Should show react, vite, tailwindcss, etc.
```

**Installation troubleshooting:**

| Problem | Solution |
|---------|----------|
| "npm: command not found" | Node.js not installed. Install from [nodejs.org](https://nodejs.org/) |
| "ERR! code ERESOLVE" dependency conflicts | Try: `npm install --legacy-peer-deps` |
| "npm ERR! Response timeout" | Slow connection. Retry or use faster network |
| Permission errors on macOS/Linux | Don't use `sudo npm install` - it causes permission issues later |

#### 5c: Start the Frontend Development Server

```bash
# Make sure you're in the frontend folder
npm run dev
```

**Expected output:**
```
  VITE v5.0.0  ready in 500 ms

  ➜  Local:   http://localhost:5173/
  ➜  press h to show help
```

✅ Frontend is now running at `http://localhost:5173`

**Open in your browser:**
- Click the link or manually open: `http://localhost:5173`
- You should see the GenAI-QA login page

**Frontend features:**
- Hot reload: Changes appear instantly when you edit `.tsx` or `.css` files
- Type checking: TypeScript errors show as red squiggly lines
- CSS autocomplete: TailwindCSS class suggestions in editor

**Common frontend issues:**

| Problem | Solution |
|---------|----------|
| "Cannot GET /" - Shows 404 | Wait 30 seconds for server to fully start |
| "Vite server did not start" | Check port 5173 isn't in use: `npx kill-port 5173` |
| Blank white page | Open DevTools (F12) and check Console for errors |
| Can't connect to backend | Ensure backend is running on localhost:5000 |

**Keep this terminal open** - The frontend dev server must stay running

### Step 6: Build Docker Executor Images

Docker executor images are required for **integration testing** — generated test code runs inside these isolated containers. You only need to build them once (or after pulling updates to the Dockerfiles).

**Ensure Docker Desktop is running before proceeding!**

#### Option A: Build All Images (Recommended)

**Windows (PowerShell):**
```powershell
cd backend/docker-executors
.\build-all.ps1
```

**macOS/Linux:**
```bash
cd backend/docker-executors
chmod +x build-all.sh
./build-all.sh
```

#### Option B: Build Individual Images

```bash
cd backend/docker-executors

# Python (no external deps)
docker build -t genaiqa/python-basic:latest -f Dockerfile.python-basic .

# Python (web/API testing — Flask, requests, httpx)
docker build -t genaiqa/python-web:latest -f Dockerfile.python-web .

# Java 21 + Maven + JUnit/TestNG
docker build -t genaiqa/java-basic:latest -f Dockerfile.java-basic .

# Node.js 20 + Jest/Mocha/Jasmine + TypeScript
docker build -t genaiqa/javascript-basic:latest -f Dockerfile.javascript-basic .
```

**Verify images were built:**
```bash
docker images | grep genaiqa
# Should list: genaiqa/python-basic, genaiqa/python-web, genaiqa/java-basic, genaiqa/javascript-basic
```

| Image | Tag | Use For |
|-------|-----|---------|
| `genaiqa/python-basic` | `latest` | Python functions without external dependencies |
| `genaiqa/python-web` | `latest` | Python web/API testing (Flask, requests, httpx) |
| `genaiqa/java-basic` | `latest` | Java applications (JUnit, TestNG, Maven) |
| `genaiqa/javascript-basic` | `latest` | JavaScript/TypeScript (Jest, Mocha, Jasmine) |

> **Note**: Images are automatically selected based on code analysis or your language selection in the frontend. You do not need to run containers manually.

## Local Development URLs & Ports

| Service | URL | Port | Purpose |
|---------|-----|------|---------|
| Frontend | http://localhost:5173 | 5173 | React user interface |
| Backend API | http://localhost:5000 | 5000 | Python Flask backend |
| Backend Docs | http://localhost:5000/apidocs | 5000 | Interactive API documentation (Swagger UI) |
| Database | localhost:5432 | 5432 | PostgreSQL (use with database client) |
| Health Check | http://localhost:5000/api/health | 5000 | Backend status endpoint |

### Test Login Credentials

Use these accounts to test the application locally:

| Email | Password | Role |
|-------|----------|------|
| admin@example.com | admin123 | Administrator |
| john@example.com | john123 | User |
| jane@example.com | jane123 | Moderator |

### Terminal Management

You'll need **3 terminal windows/tabs open simultaneously** during development:

1. **Terminal 1: Docker & Database**
   ```bash
   # Keep PostgreSQL running (no active command needed)
   docker ps  # verify database is running
   ```

2. **Terminal 2: Backend (Python)**
   ```bash
   cd backend
   source venv/bin/activate  # or .\venv\Scripts\Activate.ps1 on Windows
   python app.py
   ```
   Keep this running - it serves the API

3. **Terminal 3: Frontend (Node.js)**
   ```bash
   cd frontend
   npm run dev
   ```
   Keep this running - it serves the UI and hot-reloads changes

### Quick Restart Guide

If you restart your machine or close terminals:

**Every development session, run in this order:**

1. **Start Docker:**
   ```bash
   docker-compose up -d  # Takes 5-10 seconds
   ```

2. **Start Backend** (in terminal 2, from `backend/` folder):
   ```bash
   source venv/bin/activate  # Windows: .\venv\Scripts\Activate.ps1
   python app.py
   ```

3. **Start Frontend** (in terminal 3, from `frontend/` folder):
   ```bash
   npm run dev
   ```

4. **Open browser:**
   ```
   http://localhost:5173
   ```

## Quick Codes / Cheatsheet

### Docker Commands

| Action | Command |
|--------|---------|
| Start Database | `docker-compose up -d` |
| Stop Database | `docker-compose down` |
| View Logs | `docker-compose logs -f` |
| Restart Database | `docker-compose restart` |
| Clean Start (Wipe Data) | `docker-compose down -v && docker-compose up -d` |

### Database Connection

You can connect to the database using any client (DBeaver, pgAdmin) with these credentials:
- **Host**: `localhost`
- **Port**: `5432`
- **User**: `admin`
- **Password**: `password`
- **Database**: `qa_automation`

To connect via command line inside the container:
```bash
docker exec -it qa_automation_db psql -U admin -d qa_automation
```

## Core Features

GenAI-QA provides automated test generation and execution across multiple test types:

### 🧪 Test Generation & Execution

- **Unit Tests** - Generate unit tests for individual functions and methods with AI assistance
- **Integration Tests** - Create integration tests for API endpoints and service interactions
- **API Tests** - Automated REST API testing with request/response validation
- **UI Tests** - Browser-based UI testing with Playwright integration (JavaScript/TypeScript support)
- **Multi-Language Support** - Generate tests for Python, JavaScript/TypeScript, and Java

### 🔌 Git Integration

- **GitHub Integration** - Webhook support for push events and pull requests
- **GitLab Support** - Multi-git provider support for enterprise environments
- **Automatic Test Generation** - Generate tests automatically when code is pushed
- **Commit-based Tracking** - Track test results per commit for historical analysis
- **Branch Management** - Test different branches and track coverage per branch

### 💻 CLI Integration

- **Command-Line Interface** - Standalone CLI for running test generation locally
- **Batch Operations** - Generate tests for multiple files in one command
- **Configuration Files** - Support for `.genai-qa.yml` configuration files
- **Plugin System** - Extensible architecture for custom test generators

### 🎯 Test Management

- **Test Scenarios** - Organize tests into scenarios (happy path, edge cases, error handling)
- **Test Queue** - Queue and schedule test generation jobs
- **Test Results Dashboard** - View test execution results and history
- **Coverage Tracking** - Monitor code coverage across projects
- **Test Comparison** - Compare test results between commits and branches

### 🔐 Security & Secrets

- **Secrets Management** - Securely store and manage API keys and credentials
- **Encrypted Storage** - Fernet encryption for sensitive data
- **Project Isolation** - Separate secrets per project
- **Audit Logging** - Track access to secrets for compliance

### 📊 Monitoring & Analytics

- **Health Checks** - Monitor backend status and database connectivity
- **Performance Metrics** - Track API performance and response times
- **Execution Logs** - Detailed logs of each test generation and execution
- **Progress Streaming** - Real-time progress updates via Server-Sent Events (SSE)
- **Test History** - Historical data for trend analysis

## Database Initialization Flow

To understand how the database gets set up, here's the complete flow:

### First Time Setup (Step 3)

When you run `docker-compose up -d` for the first time:

1. Docker creates a new PostgreSQL container
2. Container automatically executes files in `docker-entrypoint-initdb.d/`:
   - **01-init.sql** (from `backend/init.sql`): Creates initial tables
     - `users` table with test accounts
     - `user_credentials` table
     - `schema_migrations` table (for tracking migrations)
   - **02-initial-users.sql** (from `backend/seeds/01_initial_users.sql`): Inserts test user data
   
3. Database is now ready with core tables and test data

### After Backend Setup (Step 4e)

Once the backend virtual environment is activated and Python is ready:

```bash
python run_migrations.py
```

This command:
1. Checks the `schema_migrations` table to see which migrations have been applied
2. Reads the consolidated migration file (`backend/migrations/000_init.sql`)
3. Applies any new migrations that haven't been run yet
4. Creates additional tables and indexes:
   - `projects`, `ai_requests`, `generated_tests`
   - `test_scenarios`, `test_queue_items`, `project_secrets`
   - All supporting tables and performance indexes

### Schema Structure

**After Step 3 (init.sql only):**
- ✅ users, user_credentials, schema_migrations

**After Step 4e (migrations applied):**
- ✅ All basic tables + all test-related tables + performance optimizations

### Why Two Steps?

- **init.sql**: Runs automatically in Docker, provides foundational tables
- **migrations**: Runs via Python script, ensures all features are available and provides version control for schema changes
- **Separation of concerns**: Docker handles database startup, Python handles feature-specific schema

### Restarting or Clean Reset

**If you need a fresh database:**

```bash
# Stop and remove containers (WARNING: Deletes all data)
docker-compose down -v

# Start fresh (runs init.sql again)
docker-compose up -d

# Re-apply migrations
cd backend
python run_migrations.py
```



### Docker & Database Issues

**Problem: "docker: command not found" or "docker is not recognized"**
- Solution: Docker Desktop not installed or not in PATH
- Action: Download and install [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- Windows: Restart computer after installation
- Verify: `docker --version` in new terminal

**Problem: "Cannot connect to Docker daemon"**
- Solution: Docker Desktop isn't running
- Action: Open Docker Desktop application (takes 30-60 seconds to start)
- Windows: Check system tray for Docker icon
- Verify: `docker ps` should list containers

**Problem: "Database connection refused" or "Connection to server failed"**
- Solution: PostgreSQL container not running
- Check: `docker ps` - look for `qa_automation_db`
- Fix: `docker-compose up -d` from project root
- Restart: `docker-compose restart`

**Problem: "Port 5432 already in use"**
- Cause: Another PostgreSQL instance running
- Solution: 
  - Option 1: Stop other PostgreSQL: `docker-compose down`
  - Option 2: Change port in `.env` file
  - Check what's using port: 
    - Windows: `netstat -ano | findstr :5432`
    - macOS/Linux: `lsof -i :5432`

**Problem: "Database image pull timeout"**
- Cause: Slow internet or Docker Hub rate limiting
- Solution:
  1. Check internet connection
  2. Wait 10-15 minutes
  3. Try again: `docker-compose up -d`
  4. If persists: `docker pull postgres:15` directly

### Python & Backend Issues

**Problem: "python: command not found" or "python is not recognized"**
- Cause: Python not installed or not in PATH
- Solution: Download and install [Python 3.9+](https://www.python.org/downloads/)
- Windows: Check "Add Python to PATH" during installation
- Verify: `python --version` in new terminal
- Note: On macOS/Linux, might need `python3` instead of `python`

**Problem: "No module named 'flask'" or other missing modules**
- Cause: Virtual environment not activated
- Solution:
  1. `cd backend` - go to backend folder
  2. Activate venv:
     - Windows: `.\venv\Scripts\Activate.ps1` or `venv\Scripts\activate.bat`
     - macOS/Linux: `source venv/bin/activate`
  3. Verify: You should see `(venv)` in terminal prompt
  4. Reinstall: `pip install -r requirements.txt`

**Problem: "venv folder doesn't exist" or "venv is not recognized"**
- Cause: Virtual environment not created
- Solution:
  1. `cd backend`
  2. Create it: `python -m venv venv`
  3. Activate: (see instructions above)
  4. Install: `pip install -r requirements.txt`

**Problem: "Permission denied" when running pip**
- Cause: Using `sudo pip` or wrong environment
- Solution: 
  1. Never use `sudo pip` - breaks virtual environment
  2. Ensure venv is activated: Check for `(venv)` in terminal
  3. Try again: `pip install -r requirements.txt`

**Problem: "Microsoft Visual C++ 14.0 is required" (Windows)**
- Cause: C++ build tools needed for psycopg2/cryptography
- Solution:
  - Install [Microsoft Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
  - Or install Visual Studio Community with C++ support
  - Restart terminal and retry: `pip install -r requirements.txt`

**Problem: "Port 5000 already in use"**
- Cause: Another Flask app or service running
- Solution:
  1. Stop other services
  2. Or change port in `.env`: `FLASK_PORT=5001`
  3. Check: 
     - Windows: `netstat -ano | findstr :5000`
     - macOS/Linux: `lsof -i :5000`

**Problem: "ModuleNotFoundError" after git pull**
- Cause: New dependencies added, not installed
- Solution:
  1. `cd backend`
  2. Activate venv
  3. `pip install -r requirements.txt`

**Problem: "Database migration failed"**
- Solution:
  1. Check Docker is running: `docker ps`
  2. Check database exists: `docker-compose exec postgres psql -U admin qa_automation`
  3. Manual migration: `python run_migrations.py -v` (verbose mode)
  4. Review: Check [backend/migrations/000_init.sql](backend/migrations/000_init.sql)

### Node.js & Frontend Issues

**Problem: "npm: command not found" or "npm is not recognized"**
- Cause: Node.js not installed
- Solution: Download and install [Node.js 18+](https://nodejs.org/)
- Verify: `npm --version` in new terminal
- Note: npm comes bundled with Node.js

**Problem: "Cannot find module" or "Missing dependency"**
- Cause: Dependencies not installed
- Solution:
  1. `cd frontend`
  2. `npm install`
  3. Wait for completion (2-5 minutes)
  4. Retry: `npm run dev`

**Problem: "Port 5173 already in use"**
- Cause: Old dev server or other service
- Solution:
  - Windows: `npx kill-port 5173`
  - macOS/Linux: `kill -9 $(lsof -t -i :5173)`
  - Or change port: `npm run dev -- --port 5174`

**Problem: "ERR! code ERESOLVE dependency conflict"**
- Cause: Conflicting package versions
- Solution: `npm install --legacy-peer-deps`
- Alternative: `npm ci` (clean install)

**Problem: Blank white page or "Vite server did not start"**
- Troubleshoot:
  1. Check terminal for errors: Look for red error messages
  2. Open DevTools (F12) and check Console tab
  3. Ensure backend is running: `curl http://localhost:5000/api/health`
  4. Restart: Stop server (Ctrl+C), run `npm run dev` again

**Problem: "Cannot POST /api/..." or API connection errors**
- Cause: Backend not running or wrong port
- Solution:
  1. Check backend is running in terminal 2
  2. Verify port 5000 is correct
  3. Test: `curl http://localhost:5000/api/health`
  4. Check CORS in backend logs

### Git & Repository Issues

**Problem: "git: command not found"**
- Cause: Git not installed
- Solution: Install from [git-scm.com](https://git-scm.com/)
- Verify: `git --version`

**Problem: "fatal: not a git repository"**
- Cause: Not in project folder
- Solution: `cd GenAI-QA` (make sure you're in project root)

**Problem: Merge conflicts after git pull**
- Solution:
  1. `git status` - see conflicted files
  2. Edit files to resolve conflicts (or ask your team)
  3. `git add .` and `git commit -m "Resolve conflicts"`
  4. Run migrations: `python run_migrations.py`

### Windows-Specific Issues

**Problem: "PowerShell execution policy" error**
- When running venv activation script
- Solution (PowerShell as Administrator):
  ```powershell
  Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
  ```
  Then:
  ```powershell
  .\venv\Scripts\Activate.ps1
  ```

**Problem: Command doesn't work in PowerShell but works in Command Prompt**
- Cause: PowerShell vs cmd.exe differences
- Solution: Try Command Prompt (cmd.exe) instead or use WSL (Windows Subsystem for Linux)

**Problem: Long file paths cause errors ("path too long")**
- Cause: Windows path length limit (260 characters)
- Solution: Enable long paths for Git and Node:
  ```powershell
  # PowerShell as Administrator
  New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force
  ```

### General Debugging Tips

1. **Check logs first**:
   - Backend: Look at terminal running `python app.py`
   - Frontend: Look at terminal running `npm run dev`
   - Database: `docker-compose logs postgres`

2. **Search the error message**:
   - Google the exact error message
   - Check GitHub issues in project repo
   - Look for Python/Node.js official docs

3. **Clear caches and reinstall**:
   ```bash
   # Backend
   cd backend
   rm -rf __pycache__ .pytest_cache  # Windows: manual delete
   pip install --force-reinstall -r requirements.txt
   
   # Frontend
   cd frontend
   rm -rf node_modules package-lock.json  # Windows: manual delete
   npm install
   ```

4. **Restart everything**:
   - Kill all terminals (Ctrl+C)
   - Stop Docker: `docker-compose down`
   - Start fresh: Follow "Quick Restart Guide" section

5. **Ask for help**:
   - Check project's GitHub Issues
   - Ask in team Slack/Discord with full error message
   - Include: OS, Python/Node versions, error output, what you tried

## Database Migrations

### What Are Migrations?

Migrations track changes to your database schema over time. Instead of modifying `init.sql` directly, we use migration files to add new tables, columns, or indexes.

### Running Migrations

**After every `git pull`, run:**

```bash
cd backend
python run_migrations.py
```

This ensures your local database has all the latest schema changes.

### Creating a New Migration

When you need to add or modify database tables:

1. **Create a new migration file** in `backend/migrations/`:
   ```
   backend/migrations/002_your_description.sql
   ```
   
2. **Write your SQL changes**:
   ```sql
   CREATE TABLE IF NOT EXISTS new_table (
       id SERIAL PRIMARY KEY,
       name VARCHAR(100) NOT NULL
   );
   ```

3. **Run the migration**:
   ```bash
   python run_migrations.py
   ```

4. **Commit both files**:
   ```bash
   git add backend/migrations/002_your_description.sql
   git commit -m "Add new_table for feature X"
   ```

### Team Workflow

1. **Developer A** creates a migration and pushes to Git
2. **Developer B** pulls the code:
   ```bash
   git pull
   cd backend
   python run_migrations.py  # Applies new migrations automatically
   ```
3. The migration runner:
   - ✅ Detects which migrations haven't been run yet
   - ✅ Runs only the new ones
   - ✅ Tracks what's been applied in the `schema_migrations` table

### Migration Best Practices

- ✅ **DO**: Use `CREATE TABLE IF NOT EXISTS` for safety
- ✅ **DO**: Add `ON DELETE CASCADE` to foreign keys when appropriate
- ✅ **DO**: Create indexes for foreign keys and frequently queried columns
- ✅ **DO**: Name migrations descriptively: `001_add_projects_table.sql`
- ❌ **DON'T**: Modify existing migration files after they've been committed
- ❌ **DON'T**: Edit `init.sql` for schema changes (use migrations instead)

### Optional: Automatic Migration Reminder (Git Hook)

To automatically get reminded to run migrations after `git pull`, install the Git hook:

**Windows (PowerShell):**
```powershell
Copy-Item .agent\hooks\post-merge .git\hooks\post-merge
```

**Mac/Linux:**
```bash
cp .agent/hooks/post-merge .git/hooks/post-merge
chmod +x .git/hooks/post-merge
```

After installation, you'll see a reminder message whenever you pull code that includes new migrations.


