class JavaTestClassBuilder:
    """Builds complete Java test classes from LLM-generated scenarios."""
    
    @staticmethod
    def build_test_class(metadata, scenarios):
        """
        Args:
            metadata: Dict with package_name, class_name, imports, etc.
            scenarios: List of test scenarios
            
        Returns:
            Complete Java test class as string
        """
        parts = []
        
        # Package declaration
        parts.append(f"package {metadata['package_name']};")
        parts.append("")
        
        # Imports
        import_set = set()
        
        # Add metadata imports
        for imp in metadata.get('imports', []):
            if imp.startswith('static '):
                import_set.add(f"import {imp};")
            else:
                import_set.add(f"import {imp};")
        
        # CRITICAL: Always add JUnit imports for Java tests
        # This matches frontend behavior and ensures compilation succeeds
        import_set.add("import org.junit.jupiter.api.Test;")
        import_set.add("import static org.junit.jupiter.api.Assertions.*;")
        
        # Add imports to parts
        for imp in sorted(import_set):
            parts.append(imp)
        parts.append("")
        
        # Class declaration with annotations
        for annotation in metadata.get('class_annotations', []):
            parts.append(annotation)
        parts.append(f"public class {metadata['class_name']} {{")
        parts.append("")
        
        # Fields
        for field in metadata.get('fields', []):
            for annotation in field.get('annotations', []):
                parts.append(f"    {annotation}")
            parts.append(f"    private {field['type']} {field['name']};")
            parts.append("")
        
        # @BeforeEach setup
        if metadata.get('setup_code'):
            parts.append("    @BeforeEach")
            parts.append("    void setUp() {")
            parts.append(f"        {metadata['setup_code']}")
            parts.append("    }")
            parts.append("")
        
        # @AfterEach teardown
        if metadata.get('teardown_code'):
            parts.append("    @AfterEach")
            parts.append("    void tearDown() {")
            parts.append(f"        {metadata['teardown_code']}")
            parts.append("    }")
            parts.append("")
        
        # Test methods
        for scenario in scenarios:
            # Annotations
            for annotation in scenario.get('annotations', ['@Test']):
                parts.append(f"    {annotation}")
            
            # Method signature
            throws = f" throws {', '.join(scenario.get('throws', []))}" if scenario.get('throws') else ""
            parts.append(f"    void {scenario['title']}(){throws} {{")
            
            # Test code (indent each line)
            test_code = scenario['test_code']
            for line in test_code.split('\n'):
                parts.append(f"        {line}")
            
            parts.append("    }")
            parts.append("")
        
        # Close class
        parts.append("}")
        
        return '\n'.join(parts)