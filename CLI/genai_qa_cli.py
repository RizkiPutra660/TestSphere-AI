#!/usr/bin/env python
"""
GenAI-QA CLI - Simplified Testing Focus
Command Line Interface for test management and execution
"""

import click
import requests
import json
import sys
from typing import Optional, Dict, Any, List
from tabulate import tabulate
from pathlib import Path
from dotenv import load_dotenv
import os
from datetime import datetime

# Load environment variables
env_path = Path(__file__).parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

# Configuration
API_BASE_URL = os.getenv('API_URL', 'http://localhost:5000')


class APIClient:
    """HTTP client for API communication"""
    
    def __init__(self, base_url: str):
        self.base_url = base_url
        self.session = requests.Session()
        self.token = None
    
    def set_token(self, token: str):
        """Set authentication token"""
        self.token = token
        self.session.headers.update({'Authorization': f'Bearer {token}'})
    
    def get(self, endpoint: str, **kwargs) -> Dict[str, Any]:
        """GET request"""
        url = f"{self.base_url}{endpoint}"
        try:
            response = self.session.get(url, **kwargs)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            click.echo(f"Error: {str(e)}", err=True)
            sys.exit(1)
    
    def post(self, endpoint: str, data: Optional[Dict] = None, **kwargs) -> Dict[str, Any]:
        """POST request"""
        url = f"{self.base_url}{endpoint}"
        try:
            response = self.session.post(url, json=data, **kwargs)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            # Try to get error details from response
            try:
                error_data = response.json()
                error_data['_http_error'] = str(e)
                return error_data
            except:
                click.echo(f"Error: {str(e)}", err=True)
                sys.exit(1)
    
    def put(self, endpoint: str, data: Optional[Dict] = None, **kwargs) -> Dict[str, Any]:
        """PUT request"""
        url = f"{self.base_url}{endpoint}"
        try:
            response = self.session.put(url, json=data, **kwargs)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            click.echo(f"Error: {str(e)}", err=True)
            sys.exit(1)
    
    def delete(self, endpoint: str, **kwargs) -> Dict[str, Any]:
        """DELETE request"""
        url = f"{self.base_url}{endpoint}"
        try:
            response = self.session.delete(url, **kwargs)
            response.raise_for_status()
            return response.json() if response.text else {}
        except requests.exceptions.RequestException as e:
            click.echo(f"Error: {str(e)}", err=True)
            sys.exit(1)


# Global API client
client = APIClient(API_BASE_URL)


# ============================================================================
# Main CLI
# ============================================================================

@click.group()
def cli():
    """GenAI-QA Testing CLI - Manage and run tests from the command line"""
    pass


# ============================================================================
# Authentication Commands
# ============================================================================

@cli.group()
def auth():
    """Authentication management"""
    pass


@auth.command()
@click.option('--email', prompt='Email', help='User email')
@click.option('--password', prompt=True, hide_input=True, help='User password')
def login(email: str, password: str):
    """Login to GenAI-QA"""
    try:
        response = client.post('/api/login', {
            'email': email,
            'password': password
        })
        
        if 'token' in response or 'access_token' in response:
            token = response.get('token') or response.get('access_token')
            client.set_token(token)
            
            # Save token to file
            token_file = Path.home() / '.genai_qa_token'
            token_file.write_text(token)
            token_file.chmod(0o600)
            
            click.echo(click.style('[+] Login successful!', fg='green'))
            return token
        else:
            click.echo(click.style('[-] Login failed', fg='red'), err=True)
            sys.exit(1)
    except Exception as e:
        click.echo(f"Login error: {str(e)}", err=True)
        sys.exit(1)


@auth.command()
def logout():
    """Logout from GenAI-QA"""
    token_file = Path.home() / '.genai_qa_token'
    if token_file.exists():
        token_file.unlink()
    click.echo(click.style('[+] Logged out successfully', fg='green'))


@auth.command()
def status():
    """Check authentication status"""
    token_file = Path.home() / '.genai_qa_token'
    if token_file.exists():
        click.echo(click.style('[+] Authenticated', fg='green'))
    else:
        click.echo(click.style('[-] Not authenticated. Run: genai-qa auth login', fg='red'))


# ============================================================================
# Test Commands
# ============================================================================

@cli.group()
def test():
    """Test management and execution"""
    pass


@test.command(name='list')
@click.option('--project-id', 'project_id', prompt='Project ID', help='Project ID')
def list_tests(project_id: str):
    """List all tests in a project"""
    _ensure_authenticated()
    try:
        response = client.get(f'/api/test-items?project_id={project_id}')
        tests_data = response.get('tests', [])
        
        if not tests_data:
            click.echo("No tests found")
            return
        
        table_data = [
            [t.get('id'), t.get('name'), t.get('status', 'pending'), t.get('language', 'unknown')]
            for t in tests_data
        ]
        
        click.echo(tabulate(
            table_data,
            headers=['ID', 'Name', 'Status', 'Language'],
            tablefmt='grid'
        ))
    except Exception as e:
        click.echo(f"Error: {str(e)}", err=True)


@test.command(name='create')
@click.option('--project-id', 'project_id', prompt='Project ID', help='Project ID')
@click.option('--name', prompt='Test name', help='Name of the test')
@click.option('--language', type=click.Choice(['python', 'javascript', 'java']), 
              prompt='Language', help='Test language')
@click.option('--code', prompt='Code snippet', help='Test code')
def create_test(project_id: str, name: str, language: str, code: str):
    """Create a new test"""
    click.echo(click.style('[-] Test creation via CLI not supported. Use the web interface or API directly.', fg='yellow'))
    click.echo('Reason: Backend uses AI-generated tests, not direct test creation.')
    # Original code commented out - backend doesn't support direct test creation
    # Tests are AI-generated via the web interface


@test.command(name='run')
@click.option('--test-id', 'test_id', prompt='Test Item ID', help='Test item ID to run')
def run_test(test_id: str):
    """Run a test"""
    _ensure_authenticated()
    try:
        with click.progressbar(length=100, label='Running test') as bar:
            response = client.post(f'/api/test-items/{test_id}/run', {})
            bar.update(100)
        
        result = response.get('result', response)
        status = result.get('status', 'unknown')
        
        if status == 'passed':
            click.echo(click.style('[+] Test passed!', fg='green'))
        elif status == 'failed':
            click.echo(click.style('[-] Test failed!', fg='red'))
            if 'error' in result:
                click.echo(f"Error: {result['error']}")
        else:
            click.echo(f"Test status: {status}")
    except Exception as e:
        click.echo(f"Error: {str(e)}", err=True)


@test.command(name='view')
@click.option('--test-id', 'test_id', prompt='Test Item ID', help='Test item ID to view')
def view_test(test_id: str):
    """View test details and code"""
    _ensure_authenticated()
    try:
        response = client.get(f'/api/test-items/{test_id}')
        test = response.get('test', response)
        
        click.echo("\n" + "="*60)
        click.echo(f"Test: {test.get('name')}")
        click.echo("="*60)
        click.echo(f"ID:       {test.get('id')}")
        click.echo(f"Language: {test.get('language')}")
        click.echo(f"Status:   {test.get('status')}")
        click.echo(f"Created:  {test.get('created_at', 'N/A')}")
        click.echo("\nCode:")
        click.echo(test.get('code', 'N/A'))
        click.echo("="*60 + "\n")
    except Exception as e:
        click.echo(f"Error: {str(e)}", err=True)


@test.command(name='file')
@click.argument('file_path', type=click.Path(exists=True))
@click.option('--language', type=click.Choice(['python', 'javascript', 'java']), 
              default=None, help='Programming language (auto-detect from extension if not specified)')
@click.option('--context', default='', help='Additional context for AI analysis')
@click.option('--requirements', '-r', default=None, 
              help='Python package requirements (file path or comma-separated list). Example: -r requirements.txt or -r "requests,numpy,pandas"')
@click.option('--show-tests', is_flag=True, help='Display generated test scenarios after execution')
@click.option('--export-pdf', type=click.Path(), default=None, 
              help='Export test results to PDF file. Example: --export-pdf test-report.pdf')
def test_file(file_path: str, language: Optional[str], context: str, requirements: Optional[str], show_tests: bool, export_pdf: Optional[str]):
    """Test a file with AI-generated test scenarios
    
    The AI analyzes your code and generates test scenarios, then executes them.
    
    Usage:
        genai-qa test file /path/to/file.py
        genai-qa test file /path/to/app.js --language javascript
        genai-qa test file app.py --context "User authentication module"
        genai-qa test file app.py --show-tests
        genai-qa test file app.py --requirements requirements.txt
        genai-qa test file app.py -r "requests,numpy,pandas"
    """
    _ensure_authenticated()
    
    try:
        # Read the source file
        source_path = Path(file_path)
        if not source_path.exists():
            click.echo(click.style(f'[-] File not found: {file_path}', fg='red'), err=True)
            sys.exit(1)
        
        source_code = source_path.read_text()
        
        # Determine language from extension if not specified
        if not language:
            ext_map = {
                '.py': 'python',
                '.js': 'javascript',
                '.ts': 'javascript',
                '.java': 'java',
            }
            ext = source_path.suffix.lower()
            language = ext_map.get(ext, 'python')
        
        click.echo(f"Analyzing {source_path.name} ({language})...\n")
        
        # Step 1: Generate tests with AI
        click.echo("[*] Generating test scenarios with AI...")
        with click.progressbar(length=100, label='  ') as bar:
            generate_response = client.post('/api/generate-tests', {
                'message': source_code,
                'language': language,
                'context': context or 'No specific context provided.',
                'config': {}
            })
            bar.update(100)
        
        request_id = generate_response.get('request_id')
        response_data = generate_response.get('response', {})
        generated_tests = response_data.get('testCases', [])
        full_test_code = response_data.get('fullCode', '')  # Get the complete test code
        
        if not request_id:
            click.echo(click.style('[-] Failed to generate tests', fg='red'), err=True)
            click.echo(f"Response: {generate_response}", err=True)
            sys.exit(1)
        
        num_scenarios = len(generated_tests)
        click.echo(click.style(f'[+] Generated {num_scenarios} test scenarios\n', fg='green'))
        
        if num_scenarios == 0:
            click.echo(click.style('[!] Warning: No test scenarios were generated.', fg='yellow'), err=True)
            click.echo('This might happen if the code cannot be automatically tested.', err=True)
            sys.exit(1)
        
        # Always show test scenarios before execution
        click.echo("Test Scenarios to Execute:")
        for i, scenario in enumerate(generated_tests, 1):
            click.echo(f"  {i}. {scenario.get('title', 'Untitled')}")
            desc = scenario.get('description', '')
            if desc:
                click.echo(f"     {desc}")
        click.echo()
        
        # Step 2: Run the tests
        click.echo("[T] Executing test scenarios...")
        
        # Parse requirements if provided
        req_list = _parse_requirements(requirements)
        if req_list:
            click.echo(f"  Dependencies to install: {', '.join(req_list)}")
        
        with click.progressbar(length=100, label='  ') as bar:
            payload = {
                'request_id': request_id,
                'source_code': source_code,
                'test_code': full_test_code,  # Send the generated test code
                'language': language
            }
            # Add requirements if provided (format as requirements.txt content)
            if req_list:
                payload['requirements'] = '\n'.join(req_list)
            
            run_response = client.post('/api/run-tests', payload)
            bar.update(100)
        
        # Check for API errors
        if '_http_error' in run_response:
            click.echo(click.style(f'[-] Test execution failed', fg='red'), err=True)
            if 'error' in run_response:
                click.echo(f"Error: {run_response['error']}", err=True)
            click.echo(f"HTTP Error: {run_response.get('_http_error', 'Unknown')}", err=True)
            sys.exit(1)
        
        # Display results
        results = run_response.get('results', {})
        passed_count = results.get('passedCount', 0)
        failed_count = results.get('failedCount', 0)
        generated_tests = results.get('generatedTests', [])
        execution_time = results.get('executionTime', 0)
        
        click.echo()
        
        # Display summary
        if failed_count == 0 and passed_count > 0:
            click.echo(click.style(f'[+] All tests passed! ({passed_count}/{passed_count + failed_count})', fg='green'))
        elif failed_count > 0:
            click.echo(click.style(f'[-] Some tests failed ({passed_count} passed, {failed_count} failed)', fg='red'))
        else:
            click.echo(f"Status: No tests executed")
        
        if execution_time > 0:
            click.echo(f"Execution time: {execution_time}ms")
        
        # Show all test scenarios with their results
        click.echo("\nTest Scenarios:")
        for i, test in enumerate(generated_tests, 1):
            status = test.get('status', 'unknown')
            name = test.get('name', 'Unknown')
            description = test.get('description', '')
            duration = test.get('duration', 0)
            
            if status == 'passed':
                status_icon = click.style('✓', fg='green')
            elif status == 'failed':
                status_icon = click.style('✗', fg='red')
            else:
                status_icon = '?'
            
            click.echo(f"  {status_icon} Test {i}: {name} ({duration}ms)")
            if description:
                click.echo(f"    {description}")
            
            # Show error for failed tests
            if status == 'failed' and test.get('error'):
                click.echo(click.style(f"    Error: {test.get('error')}", fg='red'))
        
        # Generate PDF report if requested
        if export_pdf:
            pdf_results = {
                'total_tests': passed_count + failed_count,
                'passed': passed_count,
                'failed': failed_count,
                'success': failed_count == 0 and passed_count > 0,
                'output': run_response.get('output', ''),
                'errors': run_response.get('errors', '')
            }
            _generate_pdf_report(
                pdf_path=export_pdf,
                file_path=file_path,
                language=language,
                test_scenarios=generated_tests,
                test_code=full_test_code,
                test_results=pdf_results,
                source_code=source_code
            )
            
    except Exception as e:
        click.echo(f"Error: {str(e)}", err=True)
        sys.exit(1)


@test.command(name='folder')
@click.argument('folder_path', type=click.Path(exists=True, file_okay=False))
@click.option('--language', type=click.Choice(['python', 'javascript', 'java']),
              default=None, help='Primary language for the folder (auto-detect if not specified)')
@click.option('--context', default='', help='Additional context for AI analysis (architecture, dependencies, etc.)')
@click.option('--requirements', '-r', default=None,
              help='Python package requirements (file path or comma-separated list). Example: -r requirements.txt or -r "requests,numpy,pandas"')
@click.option('--export-pdf', type=click.Path(), default=None,
              help='Export test results to PDF file. Example: --export-pdf integration-report.pdf')
def test_folder(folder_path: str, language: Optional[str], context: str, requirements: Optional[str], export_pdf: Optional[str]):
    """Integration test for a folder of related files using AI-generated scenarios.
    
    The AI inspects all code files in the folder, generates integration test
    scenarios that consider cross-file interactions, and executes them.
    
    Usage:
        genai-qa test folder ./src
        genai-qa test folder ./src --language python
        genai-qa test folder ./src --requirements requirements.txt
        genai-qa test folder ./src -r "requests,flask,sqlalchemy"
    """
    _ensure_authenticated()

    folder = Path(folder_path)
    if not folder.exists() or not folder.is_dir():
        click.echo(click.style(f'✗ Folder not found: {folder_path}', fg='red'), err=True)
        sys.exit(1)

    # Collect supported source files
    ext_map = {
        '.py': 'python',
        '.js': 'javascript',
        '.ts': 'javascript',
        '.java': 'java',
    }

    code_files = [p for p in folder.rglob('*') if p.is_file() and p.suffix.lower() in ext_map]

    if not code_files:
        click.echo(click.style('[-] No supported source files found in this folder.', fg='red'), err=True)
        click.echo('Supported: .py, .js, .ts, .java', err=True)
        sys.exit(1)

    # Auto-detect language by majority if not provided
    if not language:
        counts = {}
        for p in code_files:
            lang = ext_map[p.suffix.lower()]
            counts[lang] = counts.get(lang, 0) + 1
        language = max(counts, key=counts.get)

    # Build a combined source string with file markers to preserve structure
    comment_prefix = '#'
    if language in ['javascript', 'java']:
        comment_prefix = '//'

    combined_parts = []
    for file in sorted(code_files):
        rel = file.relative_to(folder)
        try:
            content = file.read_text()
        except Exception as read_err:
            click.echo(click.style(f'[-] Could not read {rel}: {read_err}', fg='red'), err=True)
            sys.exit(1)
        combined_parts.append(f"{comment_prefix} File: {rel}")
        combined_parts.append(content)
        combined_parts.append('')

    source_code = "\n".join(combined_parts)
    
    # For integration tests, wrap source code as a synthetic module to preserve imports
    # The backend expects to combine all files into a single "source.py"
    if language == 'python':
        # Add a note for the AI to understand the module structure
        source_code = f"""# Integration Test Source - Multiple files combined
# Files in this folder work together as a single module
{source_code}"""

    click.echo(f"Analyzing folder {folder.name} ({language}) with {len(code_files)} files...\n")

    # Step 1: Generate integration tests with AI
    click.echo("[*] Generating integration test scenarios with AI...")
    
    # Build context about the files being tested
    file_list = ", ".join(f.relative_to(folder).name for f in sorted(code_files))
    test_context = context or f"""Integration testing for interconnected modules in folder '{folder.name}'.
Files being tested: {file_list}

These files work together as a single module system where:
- All source files are combined into one 'source.py' during test execution
- Test code should import from 'source' or use absolute imports
- Focus on testing interactions between these interconnected components"""
    
    with click.progressbar(length=100, label='  ') as bar:
        generate_response = client.post('/api/generate-tests', {
            'message': source_code,
            'language': language,
            'context': test_context,
            'config': {'test_focus': 'Integration across multiple files'}
        })
        bar.update(100)

    request_id = generate_response.get('request_id')
    response_data = generate_response.get('response', {})
    generated_tests = response_data.get('testCases', [])
    full_test_code = response_data.get('fullCode', '')

    if not request_id:
        click.echo(click.style('[-] Failed to generate tests', fg='red'), err=True)
        click.echo(f"Response: {generate_response}", err=True)
        sys.exit(1)

    num_scenarios = len(generated_tests)
    click.echo(click.style(f'[+] Generated {num_scenarios} integration test scenarios\n', fg='green'))

    if num_scenarios == 0:
        click.echo(click.style('[!] Warning: No test scenarios were generated.', fg='yellow'), err=True)
        click.echo('This might happen if the folder contents could not be analyzed.', err=True)
        sys.exit(1)

    click.echo("Integration Test Scenarios to Execute:")
    for i, scenario in enumerate(generated_tests, 1):
        click.echo(f"  {i}. {scenario.get('title', 'Untitled')}")
        desc = scenario.get('description', '')
        if desc:
            click.echo(f"     {desc}")
    click.echo()

    # Step 2: Run the tests in Docker (real execution environment)
    click.echo("[*] Executing Tests....")
    
    # Parse requirements if provided
    req_list = _parse_requirements(requirements)
    if req_list:
        click.echo(f"  Dependencies to install: {', '.join(req_list)}")
    
    with click.progressbar(length=100, label='  ') as bar:
        payload = {
            'request_id': request_id,
            'source_code': source_code,
            'test_code': full_test_code,
            'language': language,
            'config': {
                'mode': 'integration'
            }
        }
        # Add requirements if provided (format as requirements.txt content)
        if req_list:
            payload['requirements'] = '\n'.join(req_list)
        
        run_response = client.post('/api/execute-tests', payload)
        bar.update(100)

    if '_http_error' in run_response:
        click.echo(click.style(f'[-] Test execution failed', fg='red'), err=True)
        if 'error' in run_response:
            click.echo(f"Error: {run_response['error']}", err=True)
        click.echo(f"HTTP Error: {run_response.get('_http_error', 'Unknown')}", err=True)
        sys.exit(1)

    # Parse Docker execution results
    output = run_response.get('output', '')
    errors = run_response.get('errors', '')
    exit_code = run_response.get('exit_code', 1)
    success = run_response.get('success', False)
    
    # Extract test counts from pytest output
    passed_count = 0
    failed_count = 0
    
    # Simple parsing: look for pytest summary line like "5 passed in 0.23s"
    import re
    summary_match = re.search(r'(\d+)\s+passed', output)
    if summary_match:
        passed_count = int(summary_match.group(1))
    
    failed_match = re.search(r'(\d+)\s+failed', output)
    if failed_match:
        failed_count = int(failed_match.group(1))
    
    # If no tests found in output, infer from exit code
    if passed_count == 0 and failed_count == 0:
        if success:
            passed_count = num_scenarios
        else:
            failed_count = max(1, num_scenarios)
    
    execution_time = 0
    time_match = re.search(r'in\s+([\d.]+)s', output)
    if time_match:
        execution_time = int(float(time_match.group(1)) * 1000)

    click.echo()

    if failed_count == 0 and passed_count > 0:
        click.echo(click.style(f'[+] All integration tests passed! ({passed_count}/{passed_count + failed_count})', fg='green'))
    elif failed_count > 0:
        click.echo(click.style(f'[-] Some integration tests failed ({passed_count} passed, {failed_count} failed)', fg='red'))
    else:
        click.echo(f"Status: Tests completed")

    if execution_time > 0:
        click.echo(f"Execution time: {execution_time}ms")

    click.echo("\nIntegration Test Results:")
    click.echo(f"Exit code: {exit_code}")
    
    if success:
        click.echo(click.style("[+] Docker execution successful!", fg='green'))
    else:
        click.echo(click.style("[-] Docker execution completed with errors", fg='red'))
    
    # Show only pytest results (hide source/test previews)
    if output:
        marker = "=== Running pytest ==="
        pytest_output = output
        if marker in output:
            pytest_output = output.split(marker, 1)[1]
            pytest_output = marker + pytest_output
        click.echo("\nPytest Output:")
        click.echo("-" * 60)
        
        # Color-code individual test results: green for PASSED, red for FAILED
        for line in pytest_output.split('\n'):
            if 'PASSED' in line:
                click.secho(line, fg='green')
            elif 'FAILED' in line:
                click.secho(line, fg='red')
            else:
                click.echo(line)
    
    if (not success) and errors:
        click.secho("\nErrors:", fg='red')
        click.echo("-" * 60)
        click.echo(errors)
    
    # Generate PDF report if requested
    if export_pdf:
        pdf_results = {
            'total_tests': passed_count + failed_count,
            'passed': passed_count,
            'failed': failed_count,
            'success': success,
            'output': output,
            'errors': errors
        }
        _generate_pdf_report(
            pdf_path=export_pdf,
            file_path=folder_path,
            language=language,
            test_scenarios=generated_tests,
            test_code=full_test_code,
            test_results=pdf_results,
            source_code=source_code
        )


# ============================================================================
# Results Commands
# ============================================================================

@cli.group()
def result():
    """Test result viewing"""
    pass


@result.command(name='list')
@click.option('--limit', default=10, help='Number of results to show')
def list_results(limit: int):
    """List test results"""
    _ensure_authenticated()
    try:
        response = client.get(f'/api/results?limit={limit}')
        results_data = response.get('results', [])
        
        if not results_data:
            click.echo("No results found")
            return
        
        table_data = [
            [r.get('id'), r.get('test_name', 'N/A'), r.get('status', 'unknown'), 
             r.get('execution_time', 'N/A'), r.get('created_at', 'N/A')]
            for r in results_data
        ]
        
        click.echo(tabulate(
            table_data,
            headers=['ID', 'Test Name', 'Status', 'Execution Time', 'Created'],
            tablefmt='grid'
        ))
    except Exception as e:
        click.echo(f"Error: {str(e)}", err=True)


@result.command(name='view')
@click.option('--result-id', 'result_id', prompt='Result ID', help='Result ID to view')
def view_result(result_id: str):
    """View test result details"""
    _ensure_authenticated()
    try:
        response = client.get(f'/api/results/{result_id}')
        result = response.get('result', response)
        
        click.echo("\n" + "="*60)
        click.echo(f"Test Result: {result.get('test_name', 'N/A')}")
        click.echo("="*60)
        click.echo(f"Result ID:     {result.get('id')}")
        click.echo(f"Status:        {result.get('status')}")
        click.echo(f"Execution Time: {result.get('execution_time')} ms")
        click.echo(f"Created:       {result.get('created_at')}")
        
        if result.get('output'):
            click.echo("\nOutput:")
            click.echo(result['output'])
        
        if result.get('error'):
            click.echo(click.style("\nError:", fg='red'))
            click.echo(result['error'])
        
        click.echo("="*60 + "\n")
    except Exception as e:
        click.echo(f"Error: {str(e)}", err=True)


# ============================================================================
# Queue Commands
# ============================================================================

@cli.group()
def queue():
    """Test queue management"""
    pass


@queue.command(name='list')
def list_queue():
    """List queued tests"""
    _ensure_authenticated()
    try:
        response = client.get('/api/test-items')
        queue_data = response.get('queue', [])
        
        if not queue_data:
            click.echo("Queue is empty")
            return
        
        table_data = [
            [q.get('id'), q.get('test_name', 'N/A'), q.get('status', 'pending'), 
             q.get('priority', 'normal'), q.get('created_at', 'N/A')]
            for q in queue_data
        ]
        
        click.echo(tabulate(
            table_data,
            headers=['ID', 'Test Name', 'Status', 'Priority', 'Created'],
            tablefmt='grid'
        ))
    except Exception as e:
        click.echo(f"Error: {str(e)}", err=True)


@queue.command(name='add')
@click.option('--test-id', 'test_id', prompt='Test Item ID', help='Test item ID to queue')
@click.option('--priority', default='normal', 
              type=click.Choice(['low', 'normal', 'high']), help='Queue priority')
def enqueue_test(test_id: str, priority: str):
    """Add test to queue (update priority)"""
    click.echo(click.style('✗ Queue add not supported. Tests are automatically queued.', fg='yellow'))
    click.echo('Use the web interface to manage test queue priorities.')
    # Original code commented out - backend auto-manages queue


# ============================================================================
# API Testing Commands
# ============================================================================

@cli.group()
def api():
    """API endpoint testing"""
    pass


@api.command(name='test')
@click.argument('url')
@click.option('--method', default='GET', type=click.Choice(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
              help='HTTP method to use')
@click.option('--body', default=None, help='Request body as JSON string (for POST/PUT/PATCH)')
@click.option('--headers', default=None, help='Custom headers as JSON string')
@click.option('--config', 'config_file', default=None, type=click.Path(exists=True),
              help='JSON file with multiple endpoints configuration')
@click.option('--format', 'output_format', default='text', type=click.Choice(['text', 'json']),
              help='Output format (text or json)')
def api_test(url: str, method: str, body: Optional[str], headers: Optional[str], 
             config_file: Optional[str], output_format: str):
    """Test API endpoints - single URL or multiple from config file.
    
    Examples:
        genai-qa api test http://localhost:5000/api/users
        genai-qa api test http://localhost:5000/api/payment --method POST --body '{"amount": 100}'
        genai-qa api test http://localhost:5000 --config endpoints.json
    """
    _ensure_authenticated()
    
    # Parse URL to extract base URL and path
    from urllib.parse import urlparse
    
    if config_file:
        # Load endpoints from config file
        try:
            with open(config_file, 'r') as f:
                config = json.load(f)
            
            base_url = config.get('baseUrl', url)
            requests_list = config.get('requests', [])
            custom_headers = config.get('headers', {})
            
            if not requests_list:
                click.echo(click.style('✗ No requests found in config file', fg='red'), err=True)
                sys.exit(1)
                
        except Exception as e:
            click.echo(click.style(f'✗ Failed to read config file: {e}', fg='red'), err=True)
            sys.exit(1)
    else:
        # Single URL test
        parsed = urlparse(url)
        base_url = f"{parsed.scheme}://{parsed.netloc}"
        path = parsed.path or "/"
        
        # Parse optional body
        request_body = None
        if body and method in ['POST', 'PUT', 'PATCH']:
            try:
                request_body = json.loads(body)
            except json.JSONDecodeError:
                click.echo(click.style('✗ Invalid JSON in --body', fg='red'), err=True)
                sys.exit(1)
        
        # Parse optional headers
        custom_headers = {}
        if headers:
            try:
                custom_headers = json.loads(headers)
            except json.JSONDecodeError:
                click.echo(click.style('✗ Invalid JSON in --headers', fg='red'), err=True)
                sys.exit(1)
        
        requests_list = [{
            'method': method,
            'path': path,
            **({"body": request_body} if request_body else {})
        }]
    
    # Make API call to backend
    click.echo(f"Testing {len(requests_list)} endpoint(s) at {base_url}...")
    
    payload = {
        'baseUrl': base_url,
        'requests': requests_list,
        'headers': custom_headers,
        'function_name': f'CLI API Test: {base_url}'
    }
    
    try:
        with click.progressbar(length=100, label='  ', show_eta=False) as bar:
            response = client.post('/api/integration/run', payload)
            bar.update(100)
        
        if '_http_error' in response:
            click.echo(click.style(f'✗ API test failed', fg='red'), err=True)
            if 'error' in response:
                click.echo(f"Error: {response['error']}", err=True)
            sys.exit(1)
        
        # Parse response
        ok = response.get('ok', False)
        summary = response.get('summary', {})
        tests = response.get('tests', [])
        runner_error = response.get('runnerError')
        
        if output_format == 'json':
            # JSON output for CI/CD
            click.echo(json.dumps(response, indent=2))
            sys.exit(0 if ok else 1)
        
        # Text output
        click.echo()
        
        if runner_error:
            click.echo(click.style(f'✗ Test runner error: {runner_error}', fg='red'))
            sys.exit(1)
        
        # Display summary
        total = summary.get('total', 0)
        passed = summary.get('passed', 0)
        failed = summary.get('failed', 0)
        duration = summary.get('durationMs', 0)
        
        if failed == 0 and passed > 0:
            click.echo(click.style(f'✓ All tests passed! ({passed}/{total})', fg='green'))
        elif failed > 0:
            click.echo(click.style(f'✗ Some tests failed ({passed} passed, {failed} failed)', fg='red'))
        else:
            click.echo(f'No tests executed')
        
        click.echo(f'Duration: {duration}ms\n')
        
        # Display individual test results
        for test in tests:
            status = test.get('status', 'unknown')
            title = test.get('title', 'Unknown')
            test_duration = test.get('durationMs', 0)
            error = test.get('error')
            
            if status == 'passed':
                status_icon = click.style('✓', fg='green')
            elif status == 'failed':
                status_icon = click.style('✗', fg='red')
            else:
                status_icon = '?'
            
            click.echo(f'{status_icon} {title} ({test_duration}ms)')
            
            if error:
                click.echo(click.style(f'  Error: {error}', fg='red'))
        
        sys.exit(0 if ok else 1)
        
    except Exception as e:
        click.echo(click.style(f'✗ Unexpected error: {str(e)}', fg='red'), err=True)
        sys.exit(1)


@api.command(name='health-check')
@click.argument('base_url')
@click.option('--endpoints', default=None, help='Comma-separated list of endpoints to check')
@click.option('--format', 'output_format', default='text', type=click.Choice(['text', 'json']),
              help='Output format')
def api_health_check(base_url: str, endpoints: Optional[str], output_format: str):
    """Quick health check - test multiple endpoints for availability.
    
    Examples:
        genai-qa api health-check http://localhost:5000
        genai-qa api health-check https://staging.myapp.com --endpoints "/api/users,/api/projects,/api/health"
    """
    _ensure_authenticated()
    
    # Default common endpoints if none provided
    if not endpoints:
        endpoints_list = [
            '/',
            '/health',
            '/api/health',
            '/api/projects',
            '/api/users'
        ]
    else:
        endpoints_list = [ep.strip() for ep in endpoints.split(',')]
    
    # Ensure paths start with /
    endpoints_list = ['/' + ep.lstrip('/') for ep in endpoints_list]
    
    click.echo(f"Health check: Testing {len(endpoints_list)} endpoints at {base_url}...")
    
    requests_list = [{'method': 'GET', 'path': ep} for ep in endpoints_list]
    
    payload = {
        'baseUrl': base_url,
        'requests': requests_list,
        'function_name': f'CLI Health Check: {base_url}'
    }
    
    try:
        with click.progressbar(length=100, label='  ', show_eta=False) as bar:
            response = client.post('/api/integration/run', payload)
            bar.update(100)
        
        if '_http_error' in response:
            click.echo(click.style(f'✗ Health check failed', fg='red'), err=True)
            if 'error' in response:
                click.echo(f"Error: {response['error']}", err=True)
            sys.exit(1)
        
        ok = response.get('ok', False)
        tests = response.get('tests', [])
        
        if output_format == 'json':
            click.echo(json.dumps(response, indent=2))
            sys.exit(0 if ok else 1)
        
        # Text output
        click.echo()
        
        all_passed = True
        for test in tests:
            status = test.get('status', 'unknown')
            title = test.get('title', 'Unknown')
            error = test.get('error')
            
            if status == 'passed':
                click.echo(click.style(f'✓ {title}', fg='green'))
            else:
                click.echo(click.style(f'✗ {title}', fg='red'))
                all_passed = False
                if error:
                    click.echo(click.style(f'  {error}', fg='red'))
        
        click.echo()
        
        if all_passed:
            click.echo(click.style('✓ All endpoints healthy!', fg='green'))
        else:
            click.echo(click.style('✗ Some endpoints failed - check logs above', fg='red'))
        
        sys.exit(0 if all_passed else 1)
        
    except Exception as e:
        click.echo(click.style(f'✗ Unexpected error: {str(e)}', fg='red'), err=True)
        sys.exit(1)


# ============================================================================
# UI Testing Commands
# ============================================================================

@cli.group()
def ui():
    """UI/browser testing"""
    pass


@ui.command(name='test')
@click.argument('url')
@click.option('--config', 'config_file', default=None, type=click.Path(exists=True),
              help='JSON file with UI test scenarios')
@click.option('--format', 'output_format', default='text', type=click.Choice(['text', 'json']),
              help='Output format (text or json)')
@click.option('--headless/--headed', default=True,
              help='Run browser in headless mode (default: headless)')
def ui_test(url: str, config_file: Optional[str], output_format: str, headless: bool):
    """Test UI with scenarios - browser automation for frontend testing.
    
    Examples:
        genai-qa ui test http://localhost:3000 --config ui-tests.json
        genai-qa ui test http://localhost:3000 --config login-flow.json --headed
    """
    _ensure_authenticated()
    
    if not config_file:
        click.echo(click.style('✗ Config file is required for UI testing', fg='red'), err=True)
        click.echo('Use --config to specify a JSON file with test scenarios', err=True)
        sys.exit(1)
    
    # Load UI test config
    try:
        with open(config_file, 'r') as f:
            config = json.load(f)
        
        base_url = config.get('baseUrl', url)
        ui_spec = config.get('tests', [])
        
        if not ui_spec:
            click.echo(click.style('✗ No tests found in config file', fg='red'), err=True)
            sys.exit(1)
            
    except Exception as e:
        click.echo(click.style(f'✗ Failed to read config file: {e}', fg='red'), err=True)
        sys.exit(1)
    
    # Make API call to backend
    click.echo(f"Testing UI at {base_url} ({len(ui_spec)} scenario(s))...")
    
    payload = {
        'baseUrl': base_url,
        'uiSpec': ui_spec,
        'function_name': f'CLI UI Test: {base_url}'
    }
    
    try:
        with click.progressbar(length=100, label='  ', show_eta=False) as bar:
            response = client.post('/api/ui/run', payload)
            bar.update(100)
        
        if '_http_error' in response:
            click.echo(click.style(f'✗ UI test failed', fg='red'), err=True)
            if 'error' in response:
                click.echo(f"Error: {response['error']}", err=True)
            sys.exit(1)
        
        # Parse response
        ok = response.get('ok', False)
        summary = response.get('summary', {})
        tests = response.get('tests', [])
        runner_error = response.get('runnerError')
        
        if output_format == 'json':
            # JSON output for CI/CD
            click.echo(json.dumps(response, indent=2))
            sys.exit(0 if ok else 1)
        
        # Text output
        click.echo()
        
        if runner_error:
            click.echo(click.style(f'✗ Test runner error: {runner_error}', fg='red'))
            sys.exit(1)
        
        # Display summary
        total = summary.get('total', 0)
        passed = summary.get('passed', 0)
        failed = summary.get('failed', 0)
        duration = summary.get('durationMs', 0)
        
        if failed == 0 and passed > 0:
            click.echo(click.style(f'✓ All UI tests passed! ({passed}/{total})', fg='green'))
        elif failed > 0:
            click.echo(click.style(f'✗ Some UI tests failed ({passed} passed, {failed} failed)', fg='red'))
        else:
            click.echo(f'No tests executed')
        
        click.echo(f'Duration: {duration}ms\n')
        
        # Display individual test results
        for test in tests:
            status = test.get('status', 'unknown')
            title = test.get('title', 'Unknown')
            test_duration = test.get('durationMs', 0)
            error = test.get('error')
            
            if status == 'passed':
                status_icon = click.style('✓', fg='green')
            elif status == 'failed':
                status_icon = click.style('✗', fg='red')
            else:
                status_icon = '?'
            
            click.echo(f'{status_icon} {title} ({test_duration}ms)')
            
            if error:
                click.echo(click.style(f'  Error: {error}', fg='red'))
        
        sys.exit(0 if ok else 1)
        
    except Exception as e:
        click.echo(click.style(f'✗ Unexpected error: {str(e)}', fg='red'), err=True)
        sys.exit(1)


@ui.command(name='smoke-test')
@click.argument('url')
@click.option('--format', 'output_format', default='text', type=click.Choice(['text', 'json']),
              help='Output format')
def ui_smoke_test(url: str, output_format: str):
    """Quick smoke test - check if page loads and critical elements exist.
    
    Examples:
        genai-qa ui smoke-test http://localhost:3000
        genai-qa ui smoke-test https://staging.myapp.com
    """
    _ensure_authenticated()
    
    click.echo(f"Running smoke test on {url}...")
    
    # Define default smoke test scenarios
    ui_spec = [
        {
            'name': 'Page loads successfully',
            'startPath': '/',
            'steps': [
                {'type': 'expectVisible', 'selector': 'body'}
            ]
        }
    ]
    
    payload = {
        'baseUrl': url,
        'uiSpec': ui_spec,
        'function_name': f'CLI UI Smoke Test: {url}'
    }
    
    try:
        with click.progressbar(length=100, label='  ', show_eta=False) as bar:
            response = client.post('/api/ui/run', payload)
            bar.update(100)
        
        if '_http_error' in response:
            click.echo(click.style(f'✗ Smoke test failed', fg='red'), err=True)
            if 'error' in response:
                click.echo(f"Error: {response['error']}", err=True)
            sys.exit(1)
        
        ok = response.get('ok', False)
        tests = response.get('tests', [])
        
        if output_format == 'json':
            click.echo(json.dumps(response, indent=2))
            sys.exit(0 if ok else 1)
        
        # Text output
        click.echo()
        
        all_passed = True
        for test in tests:
            status = test.get('status', 'unknown')
            title = test.get('title', 'Unknown')
            error = test.get('error')
            
            if status == 'passed':
                click.echo(click.style(f'✓ {title}', fg='green'))
            else:
                click.echo(click.style(f'✗ {title}', fg='red'))
                all_passed = False
                if error:
                    click.echo(click.style(f'  {error}', fg='red'))
        
        click.echo()
        
        if all_passed:
            click.echo(click.style('✓ Smoke test passed!', fg='green'))
        else:
            click.echo(click.style('✗ Smoke test failed - check errors above', fg='red'))
        
        sys.exit(0 if all_passed else 1)
        
    except Exception as e:
        click.echo(click.style(f'✗ Unexpected error: {str(e)}', fg='red'), err=True)
        sys.exit(1)


@ui.command(name='validate')
@click.argument('url')
@click.option('--check', 'checks', multiple=True, required=True,
              help='Element selector to validate (can be used multiple times)')
@click.option('--format', 'output_format', default='text', type=click.Choice(['text', 'json']),
              help='Output format')
def ui_validate(url: str, checks: tuple, output_format: str):
    """Validate specific elements exist on a page.
    
    Examples:
        genai-qa ui validate http://localhost:3000 --check "button:has-text('Login')" --check "input[name='email']"
        genai-qa ui validate http://localhost:3000 --check "h1" --check ".navbar"
    """
    _ensure_authenticated()
    
    if not checks:
        click.echo(click.style('✗ At least one --check is required', fg='red'), err=True)
        sys.exit(1)
    
    click.echo(f"Validating {len(checks)} element(s) on {url}...")
    
    # Build UI test spec from checks
    steps = [{'type': 'expectVisible', 'selector': selector} for selector in checks]
    
    ui_spec = [
        {
            'name': 'Element validation',
            'startPath': '/',
            'steps': steps
        }
    ]
    
    payload = {
        'baseUrl': url,
        'uiSpec': ui_spec,
        'function_name': f'CLI UI Validate: {url}'
    }
    
    try:
        with click.progressbar(length=100, label='  ', show_eta=False) as bar:
            response = client.post('/api/ui/run', payload)
            bar.update(100)
        
        if '_http_error' in response:
            click.echo(click.style(f'✗ Validation failed', fg='red'), err=True)
            if 'error' in response:
                click.echo(f"Error: {response['error']}", err=True)
            sys.exit(1)
        
        ok = response.get('ok', False)
        tests = response.get('tests', [])
        summary = response.get('summary', {})
        
        if output_format == 'json':
            click.echo(json.dumps(response, indent=2))
            sys.exit(0 if ok else 1)
        
        # Text output
        click.echo()
        
        all_passed = True
        for test in tests:
            status = test.get('status', 'unknown')
            title = test.get('title', 'Unknown')
            error = test.get('error')
            
            if status == 'passed':
                click.echo(click.style(f'✓ {title}', fg='green'))
            else:
                click.echo(click.style(f'✗ {title}', fg='red'))
                all_passed = False
                if error:
                    click.echo(click.style(f'  {error}', fg='red'))
        
        click.echo()
        
        passed = summary.get('passed', 0)
        total = summary.get('total', 0)
        
        if all_passed:
            click.echo(click.style(f'✓ All {total} element(s) validated successfully!', fg='green'))
        else:
            failed = summary.get('failed', 0)
            click.echo(click.style(f'✗ {failed}/{total} validation(s) failed', fg='red'))
        
        sys.exit(0 if all_passed else 1)
        
    except Exception as e:
        click.echo(click.style(f'✗ Unexpected error: {str(e)}', fg='red'), err=True)
        sys.exit(1)


# ============================================================================
# Helper Functions
# ============================================================================

def _generate_pdf_report(
    pdf_path: str,
    file_path: str,
    language: str,
    test_scenarios: List[Dict],
    test_code: str,
    test_results: Dict,
    source_code: Optional[str] = None
) -> None:
    """Generate a PDF report with test scenarios, code, and results.
    
    Args:
        pdf_path: Path to save the PDF file
        file_path: Path to the tested file/folder
        language: Programming language
        test_scenarios: List of test scenario dictionaries
        test_code: Generated test code
        test_results: Test execution results
        source_code: Optional source code to include
    """
    try:
        from reportlab.lib.pagesizes import letter, A4
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import inch
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Preformatted, PageBreak, Table, TableStyle
        from reportlab.lib import colors
        from reportlab.lib.enums import TA_CENTER, TA_LEFT
        
        # Create the PDF document
        doc = SimpleDocTemplate(pdf_path, pagesize=letter)
        story = []
        styles = getSampleStyleSheet()
        
        # Custom styles
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=24,
            textColor=colors.HexColor('#1a73e8'),
            spaceAfter=30,
            alignment=TA_CENTER
        )
        
        heading_style = ParagraphStyle(
            'CustomHeading',
            parent=styles['Heading2'],
            fontSize=16,
            textColor=colors.HexColor('#1a73e8'),
            spaceAfter=12,
            spaceBefore=12
        )
        
        subheading_style = ParagraphStyle(
            'CustomSubHeading',
            parent=styles['Heading3'],
            fontSize=12,
            textColor=colors.HexColor('#5f6368'),
            spaceAfter=6
        )
        
        code_style = ParagraphStyle(
            'Code',
            parent=styles['Code'],
            fontSize=8,
            leftIndent=20,
            fontName='Courier',
            backColor=colors.HexColor('#f5f5f5')
        )
        
        # Title
        story.append(Paragraph("GenAI-QA Test Report", title_style))
        story.append(Spacer(1, 0.2*inch))
        
        # Metadata table
        metadata = [
            ['Report Date:', datetime.now().strftime('%Y-%m-%d %H:%M:%S')],
            ['Tested File:', file_path],
            ['Language:', language.capitalize()],
            ['Test Count:', str(len(test_scenarios))]
        ]
        
        metadata_table = Table(metadata, colWidths=[2*inch, 4*inch])
        metadata_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#e8f0fe')),
            ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 1, colors.grey)
        ]))
        story.append(metadata_table)
        story.append(Spacer(1, 0.3*inch))
        
        # Test Summary
        story.append(Paragraph("Test Summary", heading_style))
        
        total_tests = test_results.get('total_tests', len(test_scenarios))
        passed_tests = test_results.get('passed', 0)
        failed_tests = test_results.get('failed', 0)
        success = test_results.get('success', False)
        
        summary_data = [
            ['Total Tests', str(total_tests)],
            ['Passed', str(passed_tests)],
            ['Failed', str(failed_tests)],
            ['Status', '✓ PASSED' if success else '✗ FAILED']
        ]
        
        summary_table = Table(summary_data, colWidths=[2*inch, 4*inch])
        summary_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#e8f0fe')),
            ('BACKGROUND', (1, 3), (1, 3), colors.HexColor('#34a853') if success else colors.HexColor('#ea4335')),
            ('TEXTCOLOR', (1, 3), (1, 3), colors.white),
            ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTNAME', (1, 3), (1, 3), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 1, colors.grey)
        ]))
        story.append(summary_table)
        story.append(Spacer(1, 0.3*inch))
        
        # Test Scenarios
        story.append(Paragraph("Test Scenarios", heading_style))
        
        for i, scenario in enumerate(test_scenarios, 1):
            scenario_title = scenario.get('title', f'Test {i}')
            scenario_desc = scenario.get('description', 'No description')
            
            story.append(Paragraph(f"{i}. {scenario_title}", subheading_style))
            story.append(Paragraph(scenario_desc, styles['Normal']))
            story.append(Spacer(1, 0.1*inch))
        
        story.append(Spacer(1, 0.2*inch))
        
        # Test Code
        story.append(PageBreak())
        story.append(Paragraph("Generated Test Code", heading_style))
        story.append(Spacer(1, 0.1*inch))
        
        # Split code into chunks to avoid overflow
        code_lines = test_code.split('\n')
        chunk_size = 50
        for i in range(0, len(code_lines), chunk_size):
            chunk = '\n'.join(code_lines[i:i+chunk_size])
            story.append(Preformatted(chunk, code_style))
            if i + chunk_size < len(code_lines):
                story.append(Spacer(1, 0.1*inch))
        
        story.append(Spacer(1, 0.3*inch))
        
        # Test Results Detail
        story.append(PageBreak())
        story.append(Paragraph("Test Results Detail", heading_style))
        story.append(Spacer(1, 0.1*inch))
        
        # Output
        output = test_results.get('output', '')
        if output:
            story.append(Paragraph("Test Output:", subheading_style))
            output_lines = output.split('\n')
            chunk_size = 60
            for i in range(0, len(output_lines), chunk_size):
                chunk = '\n'.join(output_lines[i:i+chunk_size])
                story.append(Preformatted(chunk, code_style))
                if i + chunk_size < len(output_lines):
                    story.append(Spacer(1, 0.1*inch))
        
        # Errors (if any)
        errors = test_results.get('errors', '')
        if errors:
            story.append(Spacer(1, 0.2*inch))
            story.append(Paragraph("Errors:", subheading_style))
            error_lines = errors.split('\n')
            chunk_size = 60
            for i in range(0, len(error_lines), chunk_size):
                chunk = '\n'.join(error_lines[i:i+chunk_size])
                story.append(Preformatted(chunk, code_style))
                if i + chunk_size < len(error_lines):
                    story.append(Spacer(1, 0.1*inch))
        
        # Build PDF
        doc.build(story)
        click.echo(click.style(f'\n✓ PDF report generated: {pdf_path}', fg='green'))
        
    except ImportError:
        click.echo(click.style('✗ Error: reportlab library not installed. Run: pip install reportlab', fg='red'), err=True)
    except Exception as e:
        click.echo(click.style(f'✗ Error generating PDF: {str(e)}', fg='red'), err=True)


def _parse_requirements(requirements_input: Optional[str]) -> list:
    """Parse requirements from file path or comma-separated string.
    
    Args:
        requirements_input: Either a file path (requirements.txt) or comma-separated packages
        
    Returns:
        List of requirement strings (package names with optional versions)
    """
    if not requirements_input:
        return []
    
    requirements = []
    req_path = Path(requirements_input)
    
    # Check if it's a file path
    if req_path.exists() and req_path.is_file():
        try:
            content = req_path.read_text()
            # Parse requirements.txt format: each line is a requirement
            for line in content.strip().split('\n'):
                line = line.strip()
                # Skip empty lines and comments
                if line and not line.startswith('#'):
                    requirements.append(line)
        except Exception as e:
            click.echo(click.style(f'[-] Error reading requirements file: {e}', fg='red'), err=True)
            sys.exit(1)
    else:
        # Treat as comma-separated or space-separated package list
        # Support both "package1,package2" and "package1 package2"
        packages = requirements_input.replace(',', ' ').split()
        requirements = [pkg.strip() for pkg in packages if pkg.strip()]
    
    return requirements


def _ensure_authenticated():
    """Ensure user is authenticated"""
    token_file = Path.home() / '.genai_qa_token'
    
    if not token_file.exists():
        click.echo(click.style('✗ Not authenticated', fg='red'), err=True)
        click.echo("Run: genai-qa auth login", err=True)
        sys.exit(1)
    
    token = token_file.read_text().strip()
    client.set_token(token)


if __name__ == '__main__':
    cli()
