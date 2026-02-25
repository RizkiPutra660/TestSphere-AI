class ConfigValidator:
    """
    Validates test configuration parameters to ensure consistency 
    between the selected language and the requested testing framework.
    """
    
    FRAMEWORKS = {
        'python': ['pytest', 'unittest'],
        'javascript': ['jest', 'mocha', 'jasmine'],
        'typescript': ['jest', 'mocha', 'jasmine'],
        'java': ['junit', 'testng']
    }

    DEFAULTS = {
        'python': 'pytest',
        'javascript': 'jest',
        'typescript': 'jest',
        'java': 'junit'
    }

    PRESETS = {
        'quick': {
            'coverage_target': 60,
            'edge_cases': False,
            'use_mocking': False,
            'test_focus': 'Generate tests only for the primary happy path using standard, valid inputs.',
            'edge_case_strategy': 'Focus on happy path only',
            'mocking_strategy': 'Avoid mocking, use real objects'
        },
        'standard': {
            'coverage_target': 80,
            'edge_cases': True,
            'use_mocking': True,
            'test_focus': 'Test happy paths plus common edge cases (e.g., empty strings, zero, null for nullable types).',
            'edge_case_strategy': 'Include common edge cases like empty strings, zero, null',
            'mocking_strategy': 'Use mocking for external dependencies when beneficial'
        },
        'thorough': {
            'coverage_target': 95,
            'edge_cases': True,
            'use_mocking': True,
            'test_focus': 'Expand to include boundary values, invalid inputs, and simple error conditions.',
            'edge_case_strategy': 'Include exhaustive edge cases: boundary values, invalid inputs, error conditions',
            'mocking_strategy': 'Use mocking libraries for all external dependencies'
        }
    }

    @staticmethod
    def validate_config(config, language):
        """
        Sanitizes and validates the configuration dictionary.
        Returns a clean config dictionary with defaults applied where missing.
        """
        lang = language.lower() if language else 'python'
        clean_config = {}

        # 1. Validate Framework
        requested_framework = config.get('framework', '').lower()
        allowed_frameworks = ConfigValidator.FRAMEWORKS.get(lang, [])
        
        if requested_framework in allowed_frameworks:
            clean_config['framework'] = requested_framework
        else:
            # Fallback to default if invalid or missing
            clean_config['framework'] = ConfigValidator.DEFAULTS.get(lang, 'unittest')

        # 2. Handle Preset System
        preset = config.get('preset', 'standard').lower()
        if preset in ConfigValidator.PRESETS:
            preset_config = ConfigValidator.PRESETS[preset]
            clean_config['preset'] = preset
            clean_config['coverage_target'] = preset_config['coverage_target']
            clean_config['edge_cases'] = preset_config['edge_cases']
            clean_config['use_mocking'] = preset_config['use_mocking']
            clean_config['test_focus'] = preset_config['test_focus']
            clean_config['edge_case_strategy'] = preset_config['edge_case_strategy']
            clean_config['mocking_strategy'] = preset_config['mocking_strategy']
        else:
            # Fallback to standard preset
            preset_config = ConfigValidator.PRESETS['standard']
            clean_config['preset'] = 'standard'
            clean_config['coverage_target'] = preset_config['coverage_target']
            clean_config['edge_cases'] = preset_config['edge_cases']
            clean_config['use_mocking'] = preset_config['use_mocking']
            clean_config['test_focus'] = preset_config['test_focus']
            clean_config['edge_case_strategy'] = preset_config['edge_case_strategy']
            clean_config['mocking_strategy'] = preset_config['mocking_strategy']

        return clean_config