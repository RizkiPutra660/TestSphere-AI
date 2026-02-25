"""
GenAI-QA API Python Wrapper

This module provides a Python API wrapper for programmatically interacting
with the GenAI-QA backend. It's useful for integration with other Python tools.

Example:
    from genai_qa_api import GenAIQAClient
    
    client = GenAIQAClient('http://localhost:5000')
    client.login('user@example.com', 'password')
    
    projects = client.list_projects()
    for project in projects:
        print(f"Project: {project['name']}")
"""

import requests
from typing import Optional, Dict, Any, List


class GenAIQAClient:
    """Python client for GenAI-QA API"""
    
    def __init__(self, base_url: str = 'http://localhost:5000'):
        """
        Initialize the client.
        
        Args:
            base_url: The base URL of the GenAI-QA API
        """
        self.base_url = base_url
        self.session = requests.Session()
        self.token = None
    
    def _request(self, method: str, endpoint: str, data: Optional[Dict] = None, 
                 **kwargs) -> Dict[str, Any]:
        """Make HTTP request"""
        url = f"{self.base_url}{endpoint}"
        headers = kwargs.get('headers', {})
        
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'
        
        kwargs['headers'] = headers
        
        response = requests.request(method, url, json=data, **kwargs)
        response.raise_for_status()
        
        return response.json() if response.text else {}
    
    # Authentication Methods
    
    def login(self, email: str, password: str) -> str:
        """
        Login to GenAI-QA.
        
        Args:
            email: User email
            password: User password
            
        Returns:
            Authentication token
        """
        response = self._request('POST', '/login', {
            'email': email,
            'password': password
        })
        
        self.token = response.get('token') or response.get('access_token')
        return self.token
    
    # Project Methods
    
    def list_projects(self) -> List[Dict[str, Any]]:
        """List all projects"""
        response = self._request('GET', '/projects')
        return response.get('projects', [])
    
    def get_project(self, project_id: str) -> Dict[str, Any]:
        """Get project details"""
        response = self._request('GET', f'/projects/{project_id}')
        return response.get('project', response)
    
    def create_project(self, name: str, description: str = '') -> Dict[str, Any]:
        """Create a new project"""
        return self._request('POST', '/projects', {
            'name': name,
            'description': description
        })
    
    # Test Methods
    
    def list_tests(self, project_id: str) -> List[Dict[str, Any]]:
        """List tests in a project"""
        response = self._request('GET', f'/projects/{project_id}/tests')
        return response.get('tests', [])
    
    def get_test(self, project_id: str, test_id: str) -> Dict[str, Any]:
        """Get test details"""
        response = self._request('GET', f'/projects/{project_id}/tests/{test_id}')
        return response.get('test', response)
    
    def create_test(self, project_id: str, name: str, language: str, 
                   code: str) -> Dict[str, Any]:
        """Create a new test"""
        return self._request('POST', f'/projects/{project_id}/tests', {
            'name': name,
            'language': language,
            'code': code
        })
    
    def run_test(self, project_id: str, test_id: str) -> Dict[str, Any]:
        """Run a test"""
        return self._request('POST', f'/projects/{project_id}/tests/{test_id}/run', {})
    
    # Results Methods
    
    def list_results(self, project_id: str, limit: int = 10) -> List[Dict[str, Any]]:
        """List test results"""
        response = self._request('GET', f'/projects/{project_id}/results?limit={limit}')
        return response.get('results', [])
    
    def get_result(self, project_id: str, result_id: str) -> Dict[str, Any]:
        """Get result details"""
        response = self._request('GET', f'/projects/{project_id}/results/{result_id}')
        return response.get('result', response)
    
    # Scenario Methods
    
    def list_scenarios(self, project_id: str) -> List[Dict[str, Any]]:
        """List test scenarios"""
        response = self._request('GET', f'/projects/{project_id}/scenarios')
        return response.get('scenarios', [])
    
    def create_scenario(self, project_id: str, name: str, 
                       description: str = '') -> Dict[str, Any]:
        """Create a test scenario"""
        return self._request('POST', f'/projects/{project_id}/scenarios', {
            'name': name,
            'description': description
        })
    
    # Queue Methods
    
    def list_queue(self) -> List[Dict[str, Any]]:
        """List queued tests"""
        response = self._request('GET', '/queue')
        return response.get('queue', [])
    
    def enqueue_test(self, project_id: str, test_id: str, 
                    priority: str = 'normal') -> Dict[str, Any]:
        """Add test to queue"""
        return self._request('POST', '/queue/add', {
            'project_id': project_id,
            'test_id': test_id,
            'priority': priority
        })


# Example usage
if __name__ == '__main__':
    # Initialize client
    client = GenAIQAClient('http://localhost:5000')
    
    # Login
    print("Logging in...")
    token = client.login('user@example.com', 'password')
    print(f"Token: {token}")
    
    # List projects
    print("\nListing projects...")
    projects = client.list_projects()
    for project in projects:
        print(f"  - {project['name']}")
    
    # Create a project
    print("\nCreating project...")
    new_project = client.create_project('Test Project', 'Description')
    print(f"Created: {new_project['id']}")
    
    # Create a test
    print("\nCreating test...")
    test = client.create_test(
        new_project['id'],
        'Sample Test',
        'python',
        'def test(): assert True'
    )
    print(f"Test created: {test['id']}")
    
    # Run test
    print("\nRunning test...")
    result = client.run_test(new_project['id'], test['id'])
    print(f"Result: {result['status']}")
