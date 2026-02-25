import os
from flask import Blueprint, request, jsonify
from dotenv import load_dotenv
import traceback
import json
import data.database as database
import data.test_execution as test_execution
from datetime import datetime
from flask_jwt_extended import jwt_required, get_jwt_identity
from pydantic import ValidationError
from utils.code_optimizer import CodeOptimizerService
from utils.config_validator import ConfigValidator
from utils.scenario_manager import ScenarioManager, extract_function_name_from_code
from utils.llm_service import llm_service
from utils.validation import GenerateTestsRequest, RunTestsRequest
from utils.api_response import error_response, validation_error_response
from utils.logger import setup_logger

load_dotenv()

ai_bp = Blueprint('ai', __name__, url_prefix='/api')
logger = setup_logger(__name__)

def load_prompt(filename, **kwargs):
    try:
        current_dir = os.path.dirname(os.path.abspath(__file__))
        file_path = os.path.join(current_dir, 'prompts', filename)
        with open(file_path, 'r', encoding='utf-8') as file:
            template = file.read()
        return template.format(**kwargs)
    except Exception as e:
        logger.error(f"Error loading prompt: {e}")
        raise

@ai_bp.route('/generate-tests', methods=['POST'])
@jwt_required()
def generate_tests():
    """Generate tests for provided code with rate limiting."""
    from app import limiter
    
    # Rate limit: 20 AI generation requests per hour
    limiter.limit("20 per hour")(lambda: None)()
    
    try:
        data = request.get_json()

        code_snippet = data.get('message', '')
        context = data.get('context', 'No specific context provided.')
        function_name = data.get('functionName', '') or data.get('function_name', '')
        language = data.get('language', 'python')

        # --- NEW: Get Configuration Object ---
        raw_config = data.get('config', {})

        # Validate and sanitize config
        test_config = ConfigValidator.validate_config(raw_config, language)

        # --- NEW: Get Dependencies (Top-level preferred) ---
        requirements = data.get('requirements') or raw_config.get('requirements')
        custom_deps = data.get('custom_deps') or raw_config.get('custom_deps')
        # ------------------------------------

        user_id = int(get_jwt_identity())
        request_project_id = data.get('project_id')

        if request_project_id:
            project_id = request_project_id
        else:
            project_id = test_execution.get_or_create_default_project(user_id=user_id)

        if not code_snippet:
            return jsonify({'error': 'Code snippet is required'}), 400

        # --- OPTIMIZATION STEP ---
        try:
            optimizer = CodeOptimizerService()
            optimized_code = optimizer.optimize_code(code_snippet, language)
            if not optimized_code:
                optimized_code = code_snippet
        except Exception:
            optimized_code = code_snippet

        # --- LOAD PROMPT WITH CONFIG ---
        try:
            if language.lower() == 'java':
                prompt_file = 'generate_tests_java.txt'
            elif language.lower() in ('javascript', 'typescript'):
                prompt_file = 'generate_tests_javascript.txt'
            else:
                prompt_file = 'generate_tests.txt'

            prompt = load_prompt(
                prompt_file,
                code_snippet=optimized_code,
                context=context,
                framework=test_config['framework'],
                coverage_target=test_config['coverage_target'],
                preset=test_config.get('preset', 'standard'),
                test_focus=test_config.get('test_focus', 'Test happy paths plus common edge cases'),
                edge_cases=test_config.get('edge_case_strategy', 'Include common edge cases'),
                mocking_instruction=test_config.get('mocking_strategy', 'Use mocking when beneficial')
            )
        except Exception as e:
            return jsonify({'error': f'Failed to load prompt template: {str(e)}'}), 500

        llm_service.get_provider_info()

        # --- CALL LLM ---
        try:
            response_data = llm_service.generate_content(
                prompt=prompt,
                max_tokens=128000,
                temperature=0.2,
                response_format='json'
            )
            raw_text = response_data.get('text')
        except Exception as api_err:
            print(f"[ERROR] LLM API Error: {str(api_err)}")
            raise api_err

        # --- EXTRACT TOKENS (Gemini usage_metadata) ---
        tokens_used = {}
        raw_resp = response_data.get("raw_response") if isinstance(response_data, dict) else None

        if raw_resp and hasattr(raw_resp, "usage_metadata") and raw_resp.usage_metadata:
            um = raw_resp.usage_metadata
            tokens_used = {
                "prompt_tokens": getattr(um, "prompt_token_count", 0),
                "completion_tokens": getattr(um, "candidates_token_count", 0),
                "total_tokens": getattr(um, "total_token_count", 0),
            }

        if not raw_text:
            return jsonify({'error': 'AI returned no content'}), 500

        # --- PARSE JSON ---
        try:
            cleaned_text = raw_text.strip()

            import re
            json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', cleaned_text, re.DOTALL)
            if json_match:
                cleaned_text = json_match.group(1)
            else:
                start = cleaned_text.find('{')
                end = cleaned_text.rfind('}')
                if start != -1 and end != -1:
                    cleaned_text = cleaned_text[start:end+1]

            cleaned_text = cleaned_text.strip()

            json_data = json.loads(cleaned_text)

            # === Parse LLM response using ScenarioManager ===
            try:
                metadata, scenarios = ScenarioManager.parse_llm_response(json_data)
                print(f"[SUCCESS] Parsed {len(scenarios)} scenarios from LLM response")
            except KeyError as e:
                return jsonify({'error': f'Invalid LLM response structure: missing {e}'}), 500

            # Extract function name if not provided
            if not function_name:
                function_name = extract_function_name_from_code(optimized_code)

            # === Save to database with scenario splitting ===
            ai_request_id = None
            conn = None
            cur = None

            try:
                conn = database.get_db_connection()
                cur = conn.cursor()

                # 1. Save ai_request
                log_text = f"[Config: {test_config}] \n{optimized_code[:1000]}"
                cur.execute('''
                    INSERT INTO ai_requests (project_id, request_text, model_used, status, function_name)
                    VALUES (%s, %s, %s, %s, %s) RETURNING id
                ''', (project_id, log_text, 'gemini-2.5-flash', 'completed', function_name))

                ai_request_id = cur.fetchone()[0]
                print(f"[SUCCESS] Created ai_request_id: {ai_request_id}")

                # 2. Save test suite metadata
                cur.execute('''
                    INSERT INTO test_suite_metadata
                    (ai_request_id, language, framework, imports, setup_code, teardown_code, summary,
                     generated_with_config, requirements_text, custom_deps_xml)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ''', (
                    ai_request_id,
                    metadata['language'],
                    test_config['framework'],
                    metadata['imports'],
                    metadata['setup_code'],
                    metadata['teardown_code'],
                    metadata['summary'],
                    json.dumps(test_config),
                    requirements,
                    custom_deps
                ))
                print(f"[SUCCESS] Saved test suite metadata")

                # 3. Save individual scenarios
                scenario_ids = []
                for scenario in scenarios:
                    cur.execute('''
                        INSERT INTO test_scenarios
                        (ai_request_id, scenario_title, scenario_description, scenario_category,
                         scenario_code, original_scenario_code, sort_order, enabled, is_user_edited)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                        RETURNING id
                    ''', (
                        ai_request_id,
                        scenario['scenario_title'],
                        scenario['scenario_description'],
                        scenario['scenario_category'],
                        scenario['scenario_code'],
                        scenario['original_scenario_code'],
                        scenario['sort_order'],
                        True,
                        False
                    ))
                    scenario_id = cur.fetchone()[0]
                    scenario_ids.append(scenario_id)
                    scenario['id'] = scenario_id

                print(f"[SUCCESS] Saved {len(scenarios)} test scenarios with IDs: {scenario_ids}")

                # 4. LEGACY: Save to generated_tests
                if metadata['language'] == 'java':
                    from utils.java_test_builder import JavaTestClassBuilder

                    java_metadata = {
                        'package_name': json_data.get('package_name', 'com.test'),
                        'class_name': json_data.get('class_name', 'ApplicationTest'),
                        'imports': json_data.get('imports', []),
                        'class_annotations': json_data.get('class_annotations', []),
                        'fields': json_data.get('fields', []),
                        'setup_code': json_data.get('setup_code', ''),
                        'teardown_code': json_data.get('teardown_code', '')
                    }

                    java_scenarios = [
                        {
                            'title': s['scenario_title'],
                            'test_code': s['scenario_code'],
                            'annotations': ['@Test'],
                            'throws': ['Exception']
                        }
                        for s in scenarios
                    ]

                    fullCode = JavaTestClassBuilder.build_test_class(java_metadata, java_scenarios)
                else:
                    fullCode = ScenarioManager.rebuild_full_code(
                        imports=metadata['imports'],
                        setup_code=metadata['setup_code'],
                        scenarios=scenarios,
                        teardown_code=metadata['teardown_code'],
                        language=metadata['language']
                    )

                legacy_response = {
                    'language': metadata['language'],
                    'summary': metadata['summary'],
                    'package_name': json_data.get('package_name', 'com.test'),
                    'class_name': json_data.get('class_name', 'ApplicationTest'),
                    'imports': metadata['imports'],
                    'class_annotations': json_data.get('class_annotations', []),
                    'fields': json_data.get('fields', []),
                    'setup_code': metadata['setup_code'],
                    'teardown_code': metadata['teardown_code'],
                    'testCases': [
                        {
                            'id': s['id'],
                            'title': s['scenario_title'],
                            'description': s['scenario_description'],
                            'category': s['scenario_category'],
                            'code': s['scenario_code']
                        }
                        for s in scenarios
                    ],
                    'fullCode': fullCode
                }

                cur.execute('''
                    INSERT INTO generated_tests (ai_request_id, test_code)
                    VALUES (%s, %s)
                ''', (ai_request_id, json.dumps(legacy_response)))

                conn.commit()
                print(f"[SUCCESS] All data committed to database")

                ai_response = legacy_response

            except Exception as db_error:
                if conn:
                    conn.rollback()
                print(f"[ERROR] Database error: {str(db_error)}")
                traceback.print_exc()
                raise db_error
            finally:
                if cur:
                    cur.close()
                if conn:
                    database.return_db_connection(conn)

        except json.JSONDecodeError as json_err:
            print(f"[ERROR] JSON Parse Error: {str(json_err)}")
            return jsonify({'error': 'Failed to parse AI response as JSON', 'details': str(json_err)}), 500

        return jsonify({
            'response': ai_response,
            'request_id': ai_request_id,
            'timestamp': datetime.now().isoformat(),
            'config': test_config,
            'scenarios_count': len(scenarios),
            'requirements': requirements,
            'custom_deps': custom_deps,
            'tokensUsed': tokens_used
        })

    except Exception as e:
        print(f"\n[CRITICAL] ERROR in /generate-tests: {str(e)}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500



@ai_bp.route('/chat/health', methods=['GET'])
def chat_health():
    provider_info = llm_service.get_provider_info()
    return jsonify({
        'status': 'healthy',
        'service': 'AI Chat',
        **provider_info
    })