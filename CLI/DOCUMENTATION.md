# GenAI-QA CLI - Complete User Guide

**Version:** 2.0.0 | **Status:** ✅ Ready to Use  
**Last Updated:** January 28, 2026

---

## 📋 Table of Contents

### Quick Navigation
- [🚀 Quick Start](#quick-start) - Get started in 2 minutes
- [📖 Installation](#installation) - Setup instructions
- [🧪 Testing Types](#testing-types) - Comprehensive testing overview
  - [Unit Testing (AI-Generated)](#unit-testing-ai-generated)
  - [API Testing](#api-testing)
  - [UI/Frontend Testing](#uifrontend-testing)
  - [Integration Testing](#integration-testing)
- [📚 Command Reference](#command-reference) - All CLI commands
- [💡 Examples](#examples) - Real-world usage patterns
- [❓ FAQ & Troubleshooting](#faq--troubleshooting)
- [⚙️ Configuration](#configuration)

---

## Quick Start

### Installation (30 seconds)

#### Windows
```cmd
cd CLI
install.bat
```

#### Linux/Mac
```bash
cd CLI
bash install.sh
```

#### Manual
```bash
cd CLI
pip install -e .
```

### First Run (2 minutes)

**AI generates and runs tests for you automatically!**

```bash
# 1. Login (one time setup)
genai-qa auth login
# Enter your email and password

# 2. Test any file - AI does the rest!
genai-qa test file /path/to/your_code.py

# 3. Integration test a folder (multiple connected files)
genai-qa test folder ./src

# 4. Add context for better AI analysis (optional)
genai-qa test file auth.py --context "JWT authentication module"

# 5. Specify dependencies if your code uses external packages (optional)
genai-qa test file app.py --requirements "requests,numpy,pandas"
genai-qa test file app.py --requirements requirements.txt

# 6. Export test results to PDF (optional)
genai-qa test file app.py --export-pdf test-report.pdf

# 7. Auto-detects language from file extension
genai-qa test file app.js           # JavaScript
genai-qa test file MyClass.java     # Java
```

**What happens when you run a test:**

1. **AI Analysis** 🤖 - AI examines your code structure and logic
2. **Test Generation** 📝 - AI creates 5-10 test scenarios (happy path, edge cases, error handling)
3. **Execution** ⚡ - Tests run automatically in isolated environment
4. **Results** 📊 - See which tests passed/failed with detailed output

**Example Output:**
```
Analyzing calculator.py (python)...

🤖 Generating test scenarios with AI...
✓ Generated 5 test scenarios

Test Scenarios to Execute:
  1. Test add with two positive integers
     Verifies that the add function correctly sums two positive integers.
  2. Test add with zero
     Verifies that the add function correctly handles zero values.
  3. Test add with negative numbers
     Verifies that the add function works with negative integers.
  4. Test edge case - string concatenation
     Verifies string addition behavior.
  5. Test error handling - type validation
     Verifies appropriate error handling for invalid types.

🧪 Executing test scenarios...
✓ All tests passed! (5/5)
Execution time: 450ms

Test Scenarios:
  ✓ Test 1: test_add_positive_integers (35ms)
    Verifies that the add function correctly sums two positive integers.
  ✓ Test 2: test_add_with_zero (40ms)
    Verifies that the add function correctly handles zero values.
  ✓ Test 3: test_add_negative_numbers (45ms)
    Verifies that the add function works with negative integers.
  ✓ Test 4: test_string_concatenation (50ms)
    Verifies string addition behavior.
  ✓ Test 5: test_error_handling (50ms)
    Verifies appropriate error handling for invalid types.
```

**That's it! Write code, run one command, get comprehensive testing.**

---

## Testing Types

### Unit Testing (AI-Generated)

**AI automatically generates and executes comprehensive test cases for your code.**

#### What It Tests
- ✅ Happy path (normal usage scenarios)
- ✅ Edge cases (zero, empty, boundary values, null)
- ✅ Error handling (invalid inputs, exceptions)
- ✅ State management (variables, mutations)
- ✅ Type validation (wrong types, type coercion)
- ✅ Boundary conditions (min/max values)

#### Test Single File

```bash
# Basic usage
genai-qa test file /path/to/code.py

# With context for better AI understanding
genai-qa test file calculator.py --context "Mathematical operations with division by zero handling"

# Specify language (auto-detected from extension if not specified)
genai-qa test file mycode.ts --language typescript

# Export results to PDF
genai-qa test file calculator.py --export-pdf calculator-test-report.pdf

# Combine multiple options
genai-qa test file app.py --requirements "requests,numpy" --export-pdf app-tests.pdf
```

**Supported Languages:**
- Python (`.py`)
- JavaScript (`.js`)
- TypeScript (`.ts`)
- Java (`.java`)

#### Python Dependencies Support

**For Python code with external dependencies (like requests, numpy, pandas, etc.):**

```bash
# Using a requirements.txt file
genai-qa test file app.py --requirements requirements.txt

# Using inline comma-separated packages
genai-qa test file app.py -r "requests,numpy,pandas"

# Using space-separated packages
genai-qa test file app.py -r "requests numpy pandas"

# With version specifiers
genai-qa test file app.py -r "requests==2.28.1,numpy>=1.23.0"

# Folder integration testing with dependencies
genai-qa test folder ./backend --requirements requirements.txt
genai-qa test folder ./backend -r "flask,sqlalchemy,psycopg2-binary"
```

**Why Use This?**
- ✅ Prevents ImportError when testing code with external dependencies
- ✅ Packages are automatically installed in Docker before tests run
- ✅ Works with requirements.txt files or inline package lists
- ✅ Supports pip version specifiers (==, >=, <=, >, <, ranges)

**Supported Format Options:**

| Format | Example | Use Case |
|--------|---------|----------|
| requirements.txt file | `--requirements requirements.txt` | Existing requirements file |
| Comma-separated | `-r "requests,numpy,pandas"` | Quick inline specification |
| Space-separated | `-r "requests numpy pandas"` | Alternative inline syntax |
| With versions | `-r "requests==2.28.1,numpy>=1.23.0"` | Version control |

**How It Works:**
1. You specify requirements (file or inline)
2. CLI parses and formats them
3. Backend passes to Docker executor
4. Docker container installs packages via `pip install -r requirements.txt`
5. Tests execute with all dependencies available

**Output Example:**
```
[*] Analyzing code structure...
  4 Python files found

[G] Generating test scenarios...
  Dependencies to install: requests, numpy, pandas

[T] Executing test scenarios...
  ✓ Test 1: Data processing (45ms)
  ✓ Test 2: Error handling (30ms)
  ✓ All 2 test(s) passed!
```

**Output Example:**
```
Analyzing calculator.py (python)...

🤖 Generating test scenarios with AI...
✓ Generated 5 test scenarios

Test Scenarios to Execute:
  1. Test add with two positive integers
     Verifies that the add function correctly sums two positive integers.
  2. Test add with zero
     Verifies that the add function correctly handles zero values.
  3. Test add with negative numbers
     Verifies that the add function works with negative integers.
  4. Test edge case - string concatenation
     Verifies string addition behavior.
  5. Test error handling - type validation
     Verifies appropriate error handling for invalid types.

🧪 Executing test scenarios...
✓ All tests passed! (5/5)
Execution time: 450ms

Test Results:
  ✓ Test 1: test_add_positive_integers (35ms)
  ✓ Test 2: test_add_with_zero (40ms)
  ✓ Test 3: test_add_negative_numbers (45ms)
  ✓ Test 4: test_string_concatenation (50ms)
  ✓ Test 5: test_error_handling (50ms)
```

#### Test Multiple Files (Integration Testing)

**For interconnected files that work together - tests real interactions.**

```bash
# Basic folder testing
genai-qa test folder ./src

# With language specification
genai-qa test folder ./services --language python

# With architecture context
genai-qa test folder ./api --context "FastAPI with service layer and repository pattern"

# Export integration test results to PDF
genai-qa test folder ./backend --export-pdf integration-report.pdf
```

**Execution Method:**
- ✅ Creates isolated Docker container
- ✅ Real Python/JavaScript/Java runtime
- ✅ Proper dependency management
- ✅ Actual execution, not simulation
- ✅ More accurate for multi-file interactions

**Output Includes:**
- Docker execution status
- Real test framework output (pytest for Python)
- Pass/fail counts
- Execution time

#### PDF Export Feature

**Export comprehensive test reports to PDF format:**

```bash
# Single file test with PDF export
genai-qa test file app.py --export-pdf test-report.pdf

# Folder integration test with PDF export
genai-qa test folder ./backend --export-pdf integration-report.pdf

# With all options combined
genai-qa test file calculator.py \
  --context "Math operations with error handling" \
  --requirements "numpy" \
  --export-pdf calculator-report.pdf
```

**PDF Report Includes:**
- ✅ **Test Metadata** - Date, file path, language, test count
- ✅ **Test Summary** - Total tests, passed, failed, status
- ✅ **Test Scenarios** - All generated test scenarios with descriptions
- ✅ **Generated Test Code** - Complete AI-generated test code
- ✅ **Test Results** - Detailed execution output and errors
- ✅ **Professional Formatting** - Clean, readable layout with syntax highlighting

**Use Cases:**
- 📄 Documentation and archival
- 📊 Sharing results with team members
- 📋 Code review and audit trails
- 📈 Progress tracking and reporting
- 🎯 Compliance and quality assurance

**Output Example:**
```
[T] Executing test scenarios...
✓ All 5 test(s) passed!

✓ PDF report generated: test-report.pdf
```

#### Common Test File Scenarios

**Scenario 1: Authentication Module**
```bash
genai-qa test file auth.py --context "JWT token validation with refresh token rotation"
```
AI will test: token generation, validation, expiration, refresh logic, error cases

**Scenario 2: Data Validation**
```bash
genai-qa test file validator.py --context "Email and password validation for user signup"
```
AI will test: valid inputs, invalid formats, edge cases, error messages

**Scenario 3: Payment Processing**
```bash
genai-qa test file payment.py --context "Stripe integration with refund and cancellation handling"
```
AI will test: successful payments, failures, refunds, edge cases

---

### API Testing

**Test REST API endpoints quickly - perfect for smoke tests, pre-deployment checks, and CI/CD.**

#### Test Single Endpoint

**GET Request:**
```bash
genai-qa api test http://localhost:5000/api/users
```

**POST Request with Body:**
```bash
genai-qa api test http://localhost:5000/api/payment \
  --method POST \
  --body '{"amount": 100, "currency": "USD"}'
```

**With Custom Headers:**
```bash
genai-qa api test https://api.example.com/v1/data \
  --headers '{"Authorization": "Bearer token123", "X-API-Key": "secret"}'
```

**All HTTP Methods Supported:**
```bash
# GET (default)
genai-qa api test http://localhost:5000/api/users

# POST
genai-qa api test http://localhost:5000/api/users \
  --method POST \
  --body '{"name": "John"}'

# PUT
genai-qa api test http://localhost:5000/api/users/1 \
  --method PUT \
  --body '{"name": "Jane"}'

# DELETE
genai-qa api test http://localhost:5000/api/users/1 \
  --method DELETE

# PATCH
genai-qa api test http://localhost:5000/api/users/1 \
  --method PATCH \
  --body '{"status": "active"}'
```

#### Test Multiple Endpoints from Config

**Create config file (`endpoints.json`):**
```json
{
  "baseUrl": "http://localhost:5000",
  "headers": {"Authorization": "Bearer your-token"},
  "requests": [
    {"method": "GET", "path": "/api/users"},
    {"method": "GET", "path": "/api/users/1"},
    {"method": "POST", "path": "/api/login", 
     "body": {"username": "admin", "password": "secret"}},
    {"method": "POST", "path": "/api/projects", 
     "body": {"name": "My Project", "description": "Test"}},
    {"method": "GET", "path": "/api/projects"}
  ]
}
```

**Run all tests:**
```bash
genai-qa api test http://localhost:5000 --config endpoints.json
```

**Output Format:**
```
Testing API: http://localhost:5000
    [####################################]  100%

✓ All API tests passed! (5/5)
Duration: 1234.56ms

✓ GET /api/users (234ms)
✓ GET /api/users/1 (145ms)
✓ POST /api/login (289ms)
✓ POST /api/projects (345ms)
✓ GET /api/projects (221ms)
```

#### Health Check (Pre-Deployment)

**Check default endpoints:**
```bash
genai-qa api health-check http://localhost:5000
```

**Check specific endpoints:**
```bash
genai-qa api health-check https://staging.myapp.com \
  --endpoints "/api/health,/api/users,/api/projects"
```

**Use Cases:**
- ✅ Pre-deployment validation
- ✅ Quick service availability check
- ✅ Testing critical endpoints
- ✅ Monitoring integration

#### API Testing Features

**Response Validation:**
- ✅ HTTP status codes
- ✅ Response headers
- ✅ Response body (JSON/text)
- ✅ Response time

**Request Capabilities:**
- ✅ Multiple HTTP methods (GET, POST, PUT, DELETE, PATCH)
- ✅ Custom headers
- ✅ Request body (JSON)
- ✅ URL parameters
- ✅ Authentication tokens

**CI/CD Integration:**
```bash
# JSON output for automation
genai-qa api health-check https://api.example.com --format json

# Output:
# {
#   "ok": true,
#   "summary": {"total": 1, "passed": 1, "failed": 0},
#   "tests": [{"title": "Health check", "status": "passed"}]
# }
```

---

### UI/Frontend Testing

**Test frontend/browser interactions - perfect for E2E testing, user flows, and UI validation.**

#### Test with Configuration File

**Create config file (`ui-tests.json`):**
```json
{
  "tests": [
    {
      "name": "Login flow",
      "startPath": "/login",
      "steps": [
        {"type": "fill", "selector": "#email", "value": "user@example.com"},
        {"type": "fill", "selector": "#password", "value": "password123"},
        {"type": "click", "selector": "button[type=submit]"},
        {"type": "waitFor", "ms": 1000},
        {"type": "expectVisible", "selector": ".dashboard"}
      ]
    },
    {
      "name": "Navigation test",
      "startPath": "/",
      "steps": [
        {"type": "expectVisible", "selector": "nav"},
        {"type": "click", "selector": "a[href='/about']"},
        {"type": "expectUrlContains", "value": "/about"}
      ]
    }
  ]
}
```

**Run tests:**
```bash
genai-qa ui test http://localhost:3000 --config ui-tests.json
```

**Note:** The URL is provided via command-line and **NOT** in the JSON file. This allows you to use the same JSON config across different environments:
```bash
genai-qa ui test http://localhost:3000 --config ui-tests.json        # Local
genai-qa ui test https://staging.example.com --config ui-tests.json  # Staging
genai-qa ui test https://example.com --config ui-tests.json          # Production
```

#### Smoke Test (Quick Check)

**Basic page load validation:**
```bash
genai-qa ui smoke-test http://localhost:3000

# Output:
# ✓ Page loads successfully
# ✓ Smoke test passed!
```

**Use Cases:**
- ✅ Pre-deployment validation
- ✅ Quick daily monitoring
- ✅ Frontend availability check
- ✅ Browser compatibility check

#### Validate Elements

**Check specific elements exist on page:**
```bash
genai-qa ui validate http://localhost:3000 \
  --check "button:has-text('Login')" \
  --check "input[name='email']" \
  --check "h1" \
  --check "nav"

# Output:
# ✓ Element validation
# ✓ All 4 element(s) validated successfully!
#   ✓ button:has-text('Login')
#   ✓ input[name='email']
#   ✓ h1
#   ✓ nav
```

**Use Cases:**
- ✅ Quick development checks
- ✅ QA element presence validation
- ✅ Before/after deployment verification
- ✅ Element availability monitoring

#### Supported UI Step Types

| Step Type | Purpose | Example |
|-----------|---------|---------|
| `goto` | Navigate to path | `{"type": "goto", "path": "/login"}` |
| `click` | Click element | `{"type": "click", "selector": "button"}` |
| `fill` | Fill input field | `{"type": "fill", "selector": "#email", "value": "test@example.com"}` |
| `press` | Press keyboard key | `{"type": "press", "key": "Enter"}` |
| `waitFor` | Wait for element/time | `{"type": "waitFor", "selector": ".modal"}` or `{"type": "waitFor", "ms": 2000}` |
| `expectVisible` | Assert element visible | `{"type": "expectVisible", "selector": ".success-message"}` |
| `expectHidden` | Assert element hidden | `{"type": "expectHidden", "selector": ".error"}` |
| `expectTextContains` | Assert text content | `{"type": "expectTextContains", "selector": "h1", "value": "Welcome"}` |
| `expectUrlContains` | Assert URL contains | `{"type": "expectUrlContains", "value": "/dashboard"}` |
| `expectTitleContains` | Assert page title | `{"type": "expectTitleContains", "value": "Dashboard"}` |

#### UI Test Configuration Reference

**Complete Config Example:**
```json
{
  "tests": [
    {
      "name": "Complete user flow",
      "startPath": "/",
      "steps": [
        {"type": "expectVisible", "selector": "h1"},
        {"type": "click", "selector": "a[href='/login']"},
        {"type": "fill", "selector": "#email", "value": "user@test.com"},
        {"type": "fill", "selector": "#password", "value": "password"},
        {"type": "click", "selector": "button[type=submit]"},
        {"type": "waitFor", "selector": ".dashboard"},
        {"type": "expectUrlContains", "value": "/dashboard"},
        {"type": "expectVisible", "selector": ".user-profile"},
        {"type": "click", "selector": ".user-menu"},
        {"type": "expectVisible", "selector": "button:has-text('Logout')"}
      ]
    }
  ]
}
```

#### Output Formats

**Text Output (default):**
```bash
genai-qa ui test http://localhost:3000 --config ui-tests.json

# Output:
# Testing UI at http://localhost:3000 (2 scenario(s))...
#     [####################################]  100%
#
# ✓ All UI tests passed! (2/2)
# Duration: 5234ms
#
# ✓ Login flow (2456ms)
# ✓ Navigation test (2778ms)
```

**JSON Output (CI/CD):**
```bash
genai-qa ui test http://localhost:3000 --config ui-tests.json --format json

# Output:
# {
#   "ok": true,
#   "runnerError": null,
#   "summary": {
#     "durationMs": 5234,
#     "total": 2,
#     "passed": 2,
#     "failed": 0
#   },
#   "tests": [
#     {
#       "title": "Login flow",
#       "status": "passed",
#       "durationMs": 2456,
#       "error": null
#     },
#     {
#       "title": "Navigation test",
#       "status": "passed",
#       "durationMs": 2778,
#       "error": null
#     }
#   ]
# }
```

#### Common UI Testing Patterns

**Pattern 1: Login Flow**
```json
{
  "name": "User login",
  "startPath": "/login",
  "steps": [
    {"type": "fill", "selector": "#email", "value": "user@example.com"},
    {"type": "fill", "selector": "#password", "value": "secret123"},
    {"type": "click", "selector": "button:has-text('Sign In')"},
    {"type": "waitFor", "selector": ".dashboard"},
    {"type": "expectUrlContains", "value": "/dashboard"}
  ]
}
```

**Pattern 2: Form Submission**
```json
{
  "name": "Submit contact form",
  "startPath": "/contact",
  "steps": [
    {"type": "fill", "selector": "#name", "value": "John Doe"},
    {"type": "fill", "selector": "#email", "value": "john@example.com"},
    {"type": "fill", "selector": "#message", "value": "Hello!"},
    {"type": "click", "selector": "button[type=submit]"},
    {"type": "expectVisible", "selector": ".success-message"}
  ]
}
```

**Pattern 3: Navigation Validation**
```json
{
  "name": "Navigation menu",
  "startPath": "/",
  "steps": [
    {"type": "expectVisible", "selector": "nav"},
    {"type": "click", "selector": "a[href='/about']"},
    {"type": "expectUrlContains", "value": "/about"},
    {"type": "expectVisible", "selector": "h1:has-text('About Us')"}
  ]
}
```

---

### Integration Testing

**Test multiple interconnected files working together in a real environment.**

#### Folder Testing with Dependencies

```bash
# Basic folder test
genai-qa test folder ./src

# With context about architecture
genai-qa test folder ./services --language python \
  --context "Microservices with database layer and API routes"

# Specific folder patterns
genai-qa test folder ./handlers --context "Request handlers with middleware"
```

#### Real Docker Execution

- ✅ Isolated container environment
- ✅ Real language runtime (Python, Node.js, Java)
- ✅ Dependency resolution
- ✅ Database connectivity (if configured)
- ✅ Actual execution (not simulation)

#### Common Integration Test Scenarios

**Scenario 1: Database Operations**
```bash
# Order processing with database
genai-qa test folder ./order-service --context "Order processing with inventory tracking and payment"
```

**Scenario 2: API with Business Logic**
```bash
# User API with authentication and database
genai-qa test folder ./api --context "User management API with JWT auth and PostgreSQL"
```

**Scenario 3: Multi-Layer Architecture**
```bash
# Full stack testing
genai-qa test folder ./src --context "MVC pattern: Models (DB), Views (Response), Controllers (Logic)"
```

---

## Command Reference

---

## Examples

### Unit Testing Examples

#### Example 1: Simple Calculator Function

**Code to test (`calculator.py`):**
```python
def add(a, b):
    return a + b

def divide(a, b):
    if b == 0:
        raise ValueError("Cannot divide by zero")
    return a / b
```

**Run test:**
```bash
genai-qa test file calculator.py
```

**AI generates tests for:**
- ✅ Adding positive numbers
- ✅ Adding negative numbers
- ✅ Adding zero
- ✅ Division by zero error
- ✅ Normal division
- ✅ Type errors
- ✅ Large numbers

---

#### Example 2: Authentication Module with Context

**Code:**
```python
def validate_token(token):
    # JWT validation logic
    pass

def generate_token(user_id):
    # Token generation logic
    pass
```

**Run with context:**
```bash
genai-qa test file auth.py \
  --context "JWT authentication with refresh token rotation and expiry validation"
```

**AI generates tests for:**
- ✅ Valid token generation
- ✅ Token expiry
- ✅ Token refresh
- ✅ Invalid token rejection
- ✅ Signature validation
- ✅ Rotation logic

---

#### Example 3: Integration Test - Folder with Multiple Files

**Project structure:**
```
src/
  ├── database.py     (DB queries)
  ├── models.py       (Data models)
  └── service.py      (Business logic)
```

**Run integration test:**
```bash
genai-qa test folder ./src \
  --context "User service with ORM models and database layer"
```

**Tests real interactions:**
- ✅ Data model creation
- ✅ Database operations
- ✅ Service layer logic
- ✅ Cross-file dependencies

---

#### Example 4: Testing with Python Dependencies

**Scenario: Code that uses external packages**

**Code:**
```python
import requests
import numpy as np
import pandas as pd

def fetch_and_process_data(url):
    response = requests.get(url)
    data = np.array(response.json())
    df = pd.DataFrame(data)
    return df.describe()
```

**Run test with requirements:**
```bash
# Method 1: Using requirements.txt
genai-qa test file data_processor.py --requirements requirements.txt

# Method 2: Inline packages
genai-qa test file data_processor.py -r "requests,numpy,pandas"

# Method 3: With version control
genai-qa test file data_processor.py -r "requests==2.28.1,numpy>=1.23.0,pandas"
```

**Requirements.txt file:**
```
requests==2.28.1
numpy>=1.23.0
pandas
```

**AI generates tests for:**
- ✅ HTTP request handling (requests)
- ✅ Array operations (numpy)
- ✅ DataFrame operations (pandas)
- ✅ Error handling (missing packages, network errors)
- ✅ Data validation

**Output:**
```
[*] Analyzing code structure...
  1 Python file found

[G] Generating test scenarios...
  Dependencies to install: requests==2.28.1, numpy>=1.23.0, pandas

[T] Executing test scenarios...
  ✓ Test 1: Valid data fetch and process (456ms)
  ✓ Test 2: Empty response handling (234ms)
  ✓ Test 3: Network error handling (145ms)
  ✓ All 3 test(s) passed!
```

---

#### Example 5: Folder Integration Testing with Dependencies

**Project structure:**
```
backend/
  ├── requirements.txt
  ├── models.py        (SQLAlchemy models)
  ├── database.py      (DB operations)
  └── service.py       (Business logic)
```

**requirements.txt:**
```
flask==2.3.0
sqlalchemy>=2.0.0
psycopg2-binary==2.9.6
```

**Run integration test:**
```bash
genai-qa test folder ./backend --requirements requirements.txt
```

**Tests real multi-file interactions:**
- ✅ Database connection and ORM
- ✅ Model creation and queries
- ✅ Service layer logic
- ✅ Dependencies between files

---

### API Testing Examples

#### Example 1: Single Endpoint Health Check

```bash
# Pre-deployment check
genai-qa api health-check https://api.staging.example.com
```

**Validates:**
- ✅ Server is responding
- ✅ Valid status code
- ✅ Response time acceptable
- ✅ Required endpoints available

---

#### Example 2: Test Multiple Endpoints from Config

**Create `api-tests.json`:**
```json
{
  "baseUrl": "http://localhost:5000",
  "headers": {
    "Content-Type": "application/json",
    "Authorization": "Bearer your-token"
  },
  "requests": [
    {
      "method": "GET",
      "path": "/api/users"
    },
    {
      "method": "GET",
      "path": "/api/users/1"
    },
    {
      "method": "POST",
      "path": "/api/users",
      "body": {
        "name": "John Doe",
        "email": "john@example.com"
      }
    },
    {
      "method": "PUT",
      "path": "/api/users/1",
      "body": {
        "name": "Jane Doe"
      }
    },
    {
      "method": "DELETE",
      "path": "/api/users/1"
    }
  ]
}
```

**Run:**
```bash
genai-qa api test http://localhost:5000 --config api-tests.json
```

**Output:**
```
Testing API: http://localhost:5000
    [####################################]  100%

✓ All API tests passed! (5/5)
Duration: 1234.56ms

✓ GET /api/users (234ms)
✓ GET /api/users/1 (145ms)
✓ POST /api/users (289ms)
✓ PUT /api/users/1 (195ms)
✓ DELETE /api/users/1 (171ms)
```

---

#### Example 3: API with Authentication

```bash
# Test protected endpoint with bearer token
genai-qa api test https://api.example.com/api/profile \
  --headers '{"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."}'
```

---

#### Example 4: CI/CD Integration with JSON Output

```bash
# Get JSON output for automation
genai-qa api health-check https://api.production.example.com \
  --format json > api-test-results.json

# Check exit code
if [ $? -eq 0 ]; then
  echo "✓ API health check passed"
else
  echo "✗ API health check failed"
fi
```

---

### UI Testing Examples

#### Example 1: Simple Smoke Test

```bash
# Check if website loads
genai-qa ui smoke-test https://example.com

# Output:
# ✓ Page loads successfully
# ✓ Smoke test passed!
```

**Use before deployment to ensure:**
- ✅ Site is accessible
- ✅ No critical JS errors
- ✅ Page loads within timeout
- ✅ Basic structure intact

---

#### Example 2: Element Validation

```bash
# Check critical page elements exist
genai-qa ui validate https://example.com \
  --check "nav" \
  --check "button:has-text('Login')" \
  --check "h1" \
  --check "footer"

# Output:
# ✓ Element validation
# ✓ All 4 element(s) validated successfully!
#   ✓ nav
#   ✓ button:has-text('Login')
#   ✓ h1
#   ✓ footer
```

---

#### Example 3: Complete Login Flow Test

**Create `login-test.json`:**
```json
{
  "tests": [
    {
      "name": "Complete login and navigation",
      "startPath": "/login",
      "steps": [
        {"type": "expectVisible", "selector": "#email"},
        {"type": "expectVisible", "selector": "#password"},
        {"type": "fill", "selector": "#email", "value": "test@example.com"},
        {"type": "fill", "selector": "#password", "value": "password123"},
        {"type": "click", "selector": "button[type=submit]"},
        {"type": "waitFor", "ms": 2000},
        {"type": "expectUrlContains", "value": "/dashboard"},
        {"type": "expectVisible", "selector": ".user-profile"},
        {"type": "click", "selector": "a[href='/settings']"},
        {"type": "expectUrlContains", "value": "/settings"},
        {"type": "expectVisible", "selector": "h1:has-text('Settings')"}
      ]
    }
  ]
}
```

**Run:**
```bash
genai-qa ui test http://localhost:3000 --config login-test.json
```

---

#### Example 4: Multi-Scenario Test

**Create `comprehensive-test.json`:**
```json
{
  "tests": [
    {
      "name": "Homepage loads",
      "startPath": "/",
      "steps": [
        {"type": "expectVisible", "selector": "h1"},
        {"type": "expectVisible", "selector": "nav"},
        {"type": "expectTitleContains", "value": "Home"}
      ]
    },
    {
      "name": "User registration flow",
      "startPath": "/signup",
      "steps": [
        {"type": "fill", "selector": "#name", "value": "John Doe"},
        {"type": "fill", "selector": "#email", "value": "john@example.com"},
        {"type": "fill", "selector": "#password", "value": "secure123"},
        {"type": "click", "selector": "button:has-text('Sign Up')"},
        {"type": "waitFor", "ms": 2000},
        {"type": "expectVisible", "selector": ".success-message"}
      ]
    },
    {
      "name": "Product search",
      "startPath": "/products",
      "steps": [
        {"type": "fill", "selector": ".search-box", "value": "laptop"},
        {"type": "press", "key": "Enter"},
        {"type": "waitFor", "selector": ".product-results"},
        {"type": "expectVisible", "selector": ".product-card"}
      ]
    }
  ]
}
```

**Run:**
```bash
genai-qa ui test http://localhost:3000 --config comprehensive-test.json

# Output:
# ✓ All UI tests passed! (3/3)
# Duration: 8532.45ms
#
# ✓ Homepage loads (1523ms)
# ✓ User registration flow (3256ms)
# ✓ Product search (3753ms)
```

---

#### Example 5: CI/CD JSON Output

```bash
# Get JSON for automation
genai-qa ui smoke-test https://staging.example.com --format json

# Output:
# {
#   "ok": true,
#   "summary": {
#     "total": 1,
#     "passed": 1,
#     "failed": 0,
#     "durationMs": 3456
#   },
#   "tests": [
#     {
#       "title": "Page loads successfully",
#       "status": "passed",
#       "durationMs": 3456,
#       "error": null
#     }
#   ]
# }
```

---

## FAQ & Troubleshooting

### Authentication Issues

**Problem: "Not authenticated" error**
```bash
Error: Not authenticated. Please login first.
```

**Solution:**
```bash
genai-qa auth login
# Enter your email and password
```

**Problem: Authentication token expired**

**Solution:**
```bash
# Login again
genai-qa auth login

# Or logout and login fresh
genai-qa auth logout
genai-qa auth login
```

---

### Test Execution Issues

**Problem: "Command not found: genai-qa"**

**Solution:**
```bash
# Reinstall the CLI
cd CLI && pip install -e .

# Or activate virtual environment if using one
source myvenv/bin/activate  # Linux/Mac
.\myvenv\Scripts\activate   # Windows
```

**Problem: Test file has syntax errors**

**Solution:**
```bash
# Check file for Python syntax errors
python -m py_compile your_file.py

# Fix any errors and try again
genai-qa test file your_file.py
```

**Problem: ImportError - "No module named 'requests'" (or other package)**

**Solution:**
You need to specify the required packages using the `--requirements` flag:

```bash
# If your code imports requests
genai-qa test file app.py -r "requests"

# Multiple packages
genai-qa test file app.py -r "requests,numpy,pandas"

# Or use a requirements.txt file
genai-qa test file app.py --requirements requirements.txt
```

**Problem: Package not found error**

**Solution:**
Make sure the package name is correct:
- ❌ `PIL` → ✅ `pillow`
- ❌ `yaml` → ✅ `pyyaml`
- ❌ `cv2` → ✅ `opencv-python`

Check package names on [PyPI.org](https://pypi.org)

**Problem: Version conflict when installing packages**

**Solution:**
Use broader version ranges instead of exact versions:

```bash
# Instead of:
genai-qa test file app.py -r "numpy==1.21.0"

# Use:
genai-qa test file app.py -r "numpy>=1.20.0"

# Or let pip find compatible versions:
genai-qa test file app.py -r "numpy"
```

**Problem: Test execution timeout**

**Solution:**
- Try with more context: `genai-qa test file code.py --context "explanation"`
- Check if file is valid and has no infinite loops
- Try again (AI generation can vary)

---

### API Testing Issues

**Problem: "Connection refused" when testing API**

**Solution:**
```bash
# Make sure your API server is running
# Check the URL is correct
genai-qa api test http://localhost:5000/api/health
```

**Problem: Authentication errors (401, 403)**

**Solution:**
```bash
# Pass your authentication token in headers
genai-qa api test https://api.example.com/api/users \
  --headers '{"Authorization": "Bearer your-token-here"}'
```

**Problem: Request body not accepted**

**Solution:**
```bash
# Make sure JSON is properly formatted
genai-qa api test http://localhost:5000/api/users \
  --method POST \
  --body '{"name": "John", "email": "john@example.com"}'

# Or use double quotes correctly
genai-qa api test http://localhost:5000/api/users \
  --method POST \
  --body "{\"name\": \"John\", \"email\": \"john@example.com\"}"
```

---

### UI Testing Issues

**Problem: "Selector not found" or "Element not found"**

**Solution:**
```bash
# Use correct CSS selectors:
# By ID: #my-id
# By class: .my-class
# By tag: button, input, div
# By attribute: input[type=email]
# By text: button:has-text('Click me')

# Test selector validity:
genai-qa ui validate http://localhost:3000 --check "button"
```

**Problem: "Timeout waiting for element"**

**Solution:**
```json
{
  "steps": [
    {"type": "click", "selector": "button"},
    {"type": "waitFor", "ms": 2000},  // Increase wait time
    {"type": "expectVisible", "selector": ".modal"}
  ]
}
```

**Problem: Test runs but page hasn't loaded**

**Solution:**
```json
{
  "steps": [
    {"type": "goto", "path": "/"},
    {"type": "waitFor", "ms": 1000},  // Add wait after goto
    {"type": "expectVisible", "selector": "h1"}
  ]
}
```

**Problem: JavaScript framework not rendering (React, Vue, Angular)**

**Solution:**
```json
{
  "steps": [
    {"type": "goto", "path": "/"},
    {"type": "waitFor", "ms": 2000},  // Wait for JS to render
    {"type": "expectVisible", "selector": "[data-testid='my-element']"}
  ]
}
```

---

### Docker Issues (Folder Testing)

**Problem: "Docker is not running"**

**Solution:**
```bash
# Windows
docker desktop  # Start Docker Desktop

# Linux
sudo systemctl start docker
systemctl status docker

# Mac
open /Applications/Docker.app
```

**Problem: "Permission denied" when accessing Docker**

**Solution:**
```bash
# Linux: Add user to docker group
sudo usermod -aG docker $USER
newgrp docker

# Mac/Windows: Ensure Docker Desktop is running with correct permissions
```

**Problem: Docker image build fails**

**Solution:**
```bash
# Rebuild images
docker-compose build --no-cache

# Or run with verbose output
genai-qa test folder ./src --verbose
```

---

### General Help

**View all commands:**
```bash
genai-qa --help
```

**View command-specific help:**
```bash
genai-qa test --help
genai-qa test file --help
genai-qa api --help
genai-qa ui --help
genai-qa auth --help
```

**View version:**
```bash
genai-qa --version
```

**Check authentication status:**
```bash
genai-qa auth status
```

---

### Common Questions

**Q: What languages does GenAI-QA support?**

A: Python, JavaScript/TypeScript, and Java. Language is auto-detected from file extension.

---

**Q: Can I test multiple files together?**

A: Yes! Use `genai-qa test folder ./src` for integration testing across multiple interconnected files.

---

**Q: How are tests executed for folders?**

A: Using isolated Docker containers with real language runtimes. This provides accurate integration testing.

---

**Q: Can I use GenAI-QA in CI/CD?**

A: Yes! Use `--format json` flag for JSON output that's easy to parse in automation scripts.

---

**Q: What if my test keeps failing?**

A: Try adding `--context` with explanation of what your code does. AI uses this to generate better tests.

---

**Q: How do I handle Python packages my code depends on?**

A: Use the `--requirements` flag to specify packages:

```bash
# Inline packages
genai-qa test file app.py -r "requests,numpy,pandas"

# Or use requirements.txt
genai-qa test file app.py --requirements requirements.txt

# With version control
genai-qa test file app.py -r "requests==2.28.1,numpy>=1.23.0"
```

The packages will be automatically installed in Docker before tests execute.

---

**Q: What version specifiers can I use for Python packages?**

A: Standard pip version specifiers:
- `package` - Latest version
- `package==1.0.0` - Exact version
- `package>=1.0.0` - Minimum version
- `package<=2.0.0` - Maximum version
- `package>=1.0,<2.0` - Version range

---

**Q: Can I test folder-level code with dependencies?**

A: Yes! Use the same --requirements flag:

```bash
genai-qa test folder ./backend -r "flask,sqlalchemy,requests"
# Or use a requirements.txt file
genai-qa test folder ./backend --requirements requirements.txt
```

---

**Q: Can I use requirements.txt from my project?**

A: Yes! Just point to your existing requirements.txt file:

```bash
genai-qa test file app.py --requirements requirements.txt
```

---

**Q: Can I use custom authentication with APIs?**

A: Yes! Use the `--headers` flag:

```bash
genai-qa api test https://api.example.com/api/data \
  --headers '{"Authorization": "Bearer token"}'
```

---

**Q: Are test results stored/logged?**

A: Yes! All test results are logged to the database with execution details and timestamps.

---

**Q: Can I test APIs with custom authentication?**

A: Yes! Use the `--headers` flag:

```bash
genai-qa api test https://api.example.com/api/data \
  --headers '{"Authorization": "Bearer token"}'
```

---

**Q: Can I test APIs with custom authentication?**

A: Yes! Use the `--headers` flag:

```bash
genai-qa api test https://api.example.com/api/data \
  --headers '{"Authorization": "Bearer token"}'
```

---

**Q: Are test results stored/logged?**

A: Yes! All test results are logged to the database with execution details and timestamps.

---

## Use Cases by Scenario

### Scenario 1: Pre-Deployment Validation

```bash
# 1. Quick API health check
genai-qa api health-check https://staging.myapp.com

# 2. UI smoke test
genai-qa ui smoke-test https://staging.myapp.com

# 3. If both pass, proceed with deployment
```

---

### Scenario 2: Development Testing

```bash
# Test the file you just edited
genai-qa test file auth.py --context "JWT token validation"

# Fix any issues
# Run again to confirm
genai-qa test file auth.py --context "JWT token validation"
```

---

### Scenario 3: Integration Testing

```bash
# Test all connected services
genai-qa test folder ./services --context "Microservices with shared database"

# If tests pass, commit code
```

---

### Scenario 4: API Regression Testing

```bash
# Create api-tests.json with all critical endpoints
# Run before every deployment
genai-qa api test https://api.myapp.com --config api-tests.json
```

---

### Scenario 5: UI Element Validation

```bash
# Check critical elements after each deployment
genai-qa ui validate https://myapp.com \
  --check "nav" \
  --check "button:has-text('Login')" \
  --check ".user-profile"
```

---

### Scenario 6: CI/CD Pipeline Integration

```bash
# In your CI/CD script
genai-qa test file src/auth.py --format json > test-results.json

# Check if tests passed
if jq -e '.ok' test-results.json; then
  echo "✓ Tests passed"
else
  echo "✗ Tests failed"
  exit 1
fi
```

---

## Performance Tips

### For Faster Testing

1. **Use specific selectors for UI tests**
   - ✅ Good: `#login-button`, `.submit-btn`
   - ❌ Slow: `button`, `div`

2. **Add `--context` for complex code**
   - Helps AI generate better, faster tests

3. **Test single file first**
   - Before testing entire folder

4. **Reduce waits in UI tests**
   - Use `waitFor` only when necessary
   - Minimum 500ms, maximum 5000ms

5. **Test critical endpoints only**
   - Don't test every endpoint in API tests
   - Focus on happy path + critical errors

---

## Output Interpretation

### Unit Test Results

```
✓ All tests passed! (5/5)  ← All tests passed
Duration: 450ms             ← Total execution time
```

### API Test Results

```
✓ All API tests passed! (5/5)      ← Test count and status
Duration: 1234.56ms                ← Total execution time
✓ GET /api/users (234ms)           ← Individual endpoint test
```

### UI Test Results

```
✓ All UI tests passed! (2/2)       ← Test scenario count
Duration: 5234ms                   ← Total execution time
✓ Login flow (2456ms)              ← Individual scenario
```

---

## Debugging Failed Tests

### Step 1: Read Error Message

Look for specific error details in test output.

### Step 2: Add Context

```bash
# Re-run with more context
genai-qa test file your_file.py --context "detailed explanation"
```

### Step 3: Check Dependencies

```bash
# Verify imports work
python -c "import your_module"
```

### Step 4: Try Simpler Test

```bash
# Test simpler scenario first
genai-qa test file simple.py
```

### Step 5: Check Your Code

Ensure source code is valid and doesn't have obvious errors.

---

## Configuration

### API URL (Optional)

Create `.env` in workspace root if using non-default backend:

```env
API_URL=http://localhost:5000
```

### Authentication Token

Token is automatically stored at `~/.genai_qa_token` with secure permissions.

---

**For detailed help, run commands with `--help` flag.**
