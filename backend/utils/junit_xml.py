"""
JUnit XML Generator for CI/CD Integration

This module converts test execution results from the database into JUnit XML format,
which is the standard format understood by all major CI/CD systems:
- GitHub Actions
- GitLab CI
- Jenkins
- Azure DevOps
- CircleCI
"""

import xml.etree.ElementTree as ET
from xml.dom import minidom
from datetime import datetime
from typing import List, Dict, Any, Optional


def generate_junit_xml(
    execution_log: Dict[str, Any],
    test_results: List[Dict[str, Any]],
    testsuite_name: Optional[str] = None
) -> str:
    """
    Generate JUnit XML from execution log and test case results.
    """
    
    # Create root testsuites element
    testsuites = ET.Element('testsuites')
    
    # Calculate totals
    total_tests = len(test_results)
    failures = sum(1 for t in test_results if t.get('status') == 'failed')
    errors = sum(1 for t in test_results if t.get('status') == 'error')
    skipped = sum(1 for t in test_results if t.get('status') == 'skipped')
    total_time_sec = (execution_log.get('total_execution_time_ms', 0) or 0) / 1000.0
    
    # Set testsuites attributes
    testsuites.set('name', 'GenAI-QA Test Results')
    testsuites.set('tests', str(total_tests))
    testsuites.set('failures', str(failures))
    testsuites.set('errors', str(errors))
    testsuites.set('time', f'{total_time_sec:.3f}')
    
    # Create testsuite element
    testsuite = ET.SubElement(testsuites, 'testsuite')
    
    # Generate testsuite name
    suite_name = testsuite_name or f"GenAI-QA-Execution-{execution_log.get('id', 'unknown')}"
    testsuite.set('name', suite_name)
    testsuite.set('tests', str(total_tests))
    testsuite.set('failures', str(failures))
    testsuite.set('errors', str(errors))
    testsuite.set('skipped', str(skipped))
    testsuite.set('time', f'{total_time_sec:.3f}')
    
    # Add timestamp if available
    created_at = execution_log.get('created_at')
    if created_at:
        if isinstance(created_at, datetime):
            testsuite.set('timestamp', created_at.isoformat())
        else:
            testsuite.set('timestamp', str(created_at))
    
    # Add properties element with metadata
    properties = ET.SubElement(testsuite, 'properties')
    
    # Add useful properties
    _add_property(properties, 'execution_log_id', execution_log.get('id'))
    _add_property(properties, 'ai_request_id', execution_log.get('ai_request_id'))
    _add_property(properties, 'execution_status', execution_log.get('execution_status'))
    _add_property(properties, 'passed_count', execution_log.get('passed_count'))
    _add_property(properties, 'failed_count', execution_log.get('failed_count'))
    _add_property(properties, 'generator', 'GenAI-QA')
    
    # Add individual test cases
    for test in test_results:
        testcase = ET.SubElement(testsuite, 'testcase')
        
        # Required attributes
        test_name = test.get('test_case_name', 'unnamed_test')
        testcase.set('name', test_name)
        testcase.set('classname', test.get('test_case_category', 'GenAI-QA'))
        
        # Time in seconds
        time_ms = test.get('execution_time_ms', 0) or 0
        testcase.set('time', f'{time_ms / 1000.0:.3f}')
        
        # Handle test status
        status = test.get('status', 'passed').lower()
        
        if status == 'failed':
            failure = ET.SubElement(testcase, 'failure')
            failure.set('message', test.get('error_message', 'Test failed'))
            failure.set('type', 'AssertionError')
            
            stack_trace = test.get('stack_trace')
            if stack_trace:
                failure.text = stack_trace
                
        elif status == 'error':
            error = ET.SubElement(testcase, 'error')
            error.set('message', test.get('error_message', 'Test error'))
            error.set('type', 'Error')
            
            stack_trace = test.get('stack_trace')
            if stack_trace:
                error.text = stack_trace
                
        elif status == 'skipped':
            skipped_elem = ET.SubElement(testcase, 'skipped')
            if test.get('error_message'):
                skipped_elem.set('message', test.get('error_message'))
        
        # Add system-out with description if available
        description = test.get('test_case_description')
        if description:
            system_out = ET.SubElement(testcase, 'system-out')
            system_out.text = description
    
    # Add system-out for the entire testsuite
    execution_output = execution_log.get('execution_output')
    if execution_output:
        system_out = ET.SubElement(testsuite, 'system-out')
        system_out.text = execution_output
    
    # Convert to pretty-printed XML String
    xml_string = ET.tostring(testsuites, encoding='unicode')
    
    # Pretty print with proper XML declaration
    dom = minidom.parseString(xml_string)
    pretty_xml = dom.toprettyxml(indent='  ', encoding=None)
    
    # Remove extra blank lines
    lines = pretty_xml.split('\n')
    non_empty_lines = [line for line in lines if line.strip()]
    
    return '\n'.join(non_empty_lines)


def _add_property(properties: ET.Element, name: str, value: Any) -> None:
    """Helper to add a property element if value is not None."""
    if value is not None:
        prop = ET.SubElement(properties, 'property')
        prop.set('name', name)
        prop.set('value', str(value))


def generate_junit_xml_from_multiple_executions(
    executions: List[Dict[str, Any]]
) -> str:
    """
    Generate JUnit XML from multiple execution logs.
    """
    
    testsuites = ET.Element('testsuites')
    
    total_tests = 0
    total_failures = 0
    total_errors = 0
    total_time = 0.0
    
    for execution in executions:
        exec_log = execution.get('execution_log', {})
        results = execution.get('test_results', [])
        suite_name = execution.get('testsuite_name')
        
        # Calculate stats for this execution
        tests = len(results)
        failures = sum(1 for t in results if t.get('status') == 'failed')
        errors = sum(1 for t in results if t.get('status') == 'error')
        skipped = sum(1 for t in results if t.get('status') == 'skipped')
        time_sec = (exec_log.get('total_execution_time_ms', 0) or 0) / 1000.0
        
        # Update totals
        total_tests += tests
        total_failures += failures
        total_errors += errors
        total_time += time_sec
        
        # Create testsuite
        testsuite = ET.SubElement(testsuites, 'testsuite')
        testsuite.set('name', suite_name or f"Execution-{exec_log.get('id', 'unknown')}")
        testsuite.set('tests', str(tests))
        testsuite.set('failures', str(failures))
        testsuite.set('errors', str(errors))
        testsuite.set('skipped', str(skipped))
        testsuite.set('time', f'{time_sec:.3f}')
        
        # Add test cases
        for test in results:
            testcase = ET.SubElement(testsuite, 'testcase')
            testcase.set('name', test.get('test_case_name', 'unnamed'))
            testcase.set('classname', test.get('test_case_category', 'GenAI-QA'))
            time_ms = test.get('execution_time_ms', 0) or 0
            testcase.set('time', f'{time_ms / 1000.0:.3f}')
            
            status = test.get('status', 'passed').lower()
            if status == 'failed':
                failure = ET.SubElement(testcase, 'failure')
                failure.set('message', test.get('error_message', 'Test failed'))
            elif status == 'error':
                error = ET.SubElement(testcase, 'error')
                error.set('message', test.get('error_message', 'Test error'))
            elif status == 'skipped':
                ET.SubElement(testcase, 'skipped')
    
    # Set root attributes
    testsuites.set('name', 'GenAI-QA Combined Results')
    testsuites.set('tests', str(total_tests))
    testsuites.set('failures', str(total_failures))
    testsuites.set('errors', str(total_errors))
    testsuites.set('time', f'{total_time:.3f}')
    
    # Pretty print
    xml_string = ET.tostring(testsuites, encoding='unicode')
    dom = minidom.parseString(xml_string)
    pretty_xml = dom.toprettyxml(indent='  ', encoding=None)
    lines = pretty_xml.split('\n')
    non_empty_lines = [line for line in lines if line.strip()]
    
    return '\n'.join(non_empty_lines)