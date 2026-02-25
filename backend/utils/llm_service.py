import os
import json
from dotenv import load_dotenv
from typing import Dict, Any, Optional
from utils.retry import retry_with_backoff, retry_on_rate_limit
from utils.logger import setup_logger

load_dotenv()

logger= setup_logger(__name__)
LLM_PROVIDER = os.getenv('LLM_PROVIDER', 'google').lower()

class LLMService:
    """
    Unified LLM service that supports multiple providers.
    Currently supports: Google Gemini and Ollama
    """
    
    def __init__(self):
        self.provider = LLM_PROVIDER
        
        if self.provider == 'google':
            import google.generativeai as genai
            genai.configure(api_key=os.getenv('GOOGLE_API_KEY'))
            self.model = genai.GenerativeModel('gemini-2.5-flash')
            self.genai = genai
            
        elif self.provider == 'ollama':
            import ollama
            self.ollama_client = ollama
            self.model_name = os.getenv('OLLAMA_MODEL', 'llama3.1:8b')
            self.base_url = os.getenv('OLLAMA_BASE_URL', 'http://localhost:11434')
            
    def generate_content(
        self, 
        prompt: str, 
        max_tokens: int = 128000, 
        temperature: float = 0.2,
        response_format: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Generate content using the configured LLM provider.
        
        Args:
            prompt: The input prompt
            max_tokens: Maximum tokens in response
            temperature: Sampling temperature
            response_format: Expected format (e.g., 'json')
            
        Returns:
            Dict with 'text' and 'raw_response' keys
        """
        if self.provider == 'google':
            return self._generate_google(prompt, max_tokens, temperature, response_format)
        elif self.provider == 'ollama':
            return self._generate_ollama(prompt, max_tokens, temperature, response_format)
        else:
            raise ValueError(f"Unsupported LLM provider: {self.provider}")
    
    def _generate_google(
        self, 
        prompt: str, 
        max_tokens: int, 
        temperature: float,
        response_format: Optional[str] = None
    ) -> Dict[str, Any]:
        """Generate using Google Gemini"""
        config = self.genai.types.GenerationConfig(
            max_output_tokens=max_tokens,
            temperature=temperature
        )
        
        if response_format == 'json':
            config.response_mime_type = "application/json"
        
        response = self.model.generate_content(
            contents=prompt,
            generation_config=config
        )
        
        if not response.candidates:
            raise ValueError("Google API returned no candidates")
        
        candidate = response.candidates[0]
        text = ""
        
        if hasattr(candidate, 'content') and hasattr(candidate.content, 'parts'):
            parts = candidate.content.parts
            if len(parts) > 0 and hasattr(parts[0], 'text'):
                text = parts[0].text
        
        return {
            'text': text,
            'raw_response': response
        }
    
    def _generate_ollama(
        self, 
        prompt: str, 
        max_tokens: int, 
        temperature: float,
        response_format: Optional[str] = None
    ) -> Dict[str, Any]:
        """Generate using Ollama"""
        
        # Build the options for better performance
        options = {
            'temperature': temperature,
            'num_predict': max_tokens,  # Ollama uses num_predict instead of max_tokens
            'num_ctx': 4096,  # Reduce context window for faster processing (default is 2048)
            'top_k': 40,  # Limit sampling to top-k tokens for speed
            'top_p': 0.9,  # Nucleus sampling for better quality
            'repeat_penalty': 1.1,  # Prevent repetition
        }
        
        # If JSON format is requested, enable native JSON mode
        format_param = None
        if response_format == 'json':
            format_param = 'json'
        
        response = self.ollama_client.generate(
            model=self.model_name,
            prompt=prompt,
            format=format_param, # Native JSON mode
            options=options,
            keep_alive='5m'  # Keep model in memory for 5 minutes for faster subsequent requests
        )
        
        text = response.get('response', '')
        
        return {
            'text': text,
            'raw_response': response
        }
    
    def get_provider_info(self) -> Dict[str, str]:
        """Get information about current provider"""
        if self.provider == 'google':
            return {
                'provider': 'Google Gemini',
                'model': 'gemini-2.5-flash'
            }
        elif self.provider == 'ollama':
            return {
                'provider': 'Ollama',
                'model': self.model_name,
                'base_url': self.base_url
            }
        return {'provider': 'unknown'}
    
    @retry_with_backoff(max_attempts=3, initial_delay=2.0, exceptions=(Exception,))
    def generate_with_retry(
        self,
        prompt: str,
        max_tokens: int = 128000,
        temperature: float = 0.2,
        response_format: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Generate content with automatic retry on failures.
        
        This method wraps generate_content with retry logic for improved reliability.
        Use this method for production code.
        
        Args:
            prompt: The input prompt
            max_tokens: Maximum tokens in response
            temperature: Sampling temperature
            response_format: Expected format (e.g., 'json')
            
        Returns:
            Dict with 'text' and 'raw_response' keys
        """
        logger.info(f"Generating content with {self.provider} (max_tokens={max_tokens})")
        result = self.generate_content(prompt, max_tokens, temperature, response_format)
        logger.info(f"Content generated successfully ({len(result.get('text', ''))} chars)")
        return result


# Singleton instance
llm_service = LLMService()
