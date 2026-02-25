"""
Cryptographic utilities for secrets management.

Provides symmetric encryption/decryption using Fernet
All secrets are encrypted at rest and decrypted only in memory during execution.
"""

from cryptography.fernet import Fernet
import os
import logging

logger = logging.getLogger(__name__)


class CryptoService:
    """
    Handles encryption and decryption of secret values.
    
    CRITICAL: Requires SECRETS_ENCRYPTION_KEY environment variable.
    Application will fail to start if the key is missing.
    """
    
    def __init__(self):
        """
        Initialize the crypto service with encryption key from environment.
        
        Raises:
            RuntimeError: If SECRETS_ENCRYPTION_KEY is not set
        """
        key = os.getenv("SECRETS_ENCRYPTION_KEY")
        
        if not key:
            error_msg = (
                "SECRETS_ENCRYPTION_KEY environment variable is not set. "
                "Application cannot start without encryption key. "
                "Generate one with: python3 -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
            )
            logger.error(error_msg)
            raise RuntimeError(error_msg)
        
        try:
            self.cipher = Fernet(key.encode() if isinstance(key, str) else key)
            logger.info("CryptoService initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize CryptoService: {e}")
            raise RuntimeError(f"Invalid SECRETS_ENCRYPTION_KEY format: {e}")
    
    def encrypt(self, plaintext: str) -> str:
        """
        Encrypt a plaintext secret value.
        
        Args:
            plaintext: The secret value to encrypt
            
        Returns:
            Base64-encoded encrypted string
            
        Raises:
            ValueError: If plaintext is empty
        """
        if not plaintext:
            raise ValueError("Cannot encrypt empty value")
        
        try:
            encrypted_bytes = self.cipher.encrypt(plaintext.encode('utf-8'))
            return encrypted_bytes.decode('utf-8')
        except Exception as e:
            logger.error(f"Encryption failed: {e}")
            raise RuntimeError(f"Failed to encrypt value: {e}")
    
    def decrypt(self, ciphertext: str) -> str:
        """
        Decrypt an encrypted secret value.
        
        Args:
            ciphertext: Base64-encoded encrypted string
            
        Returns:
            Decrypted plaintext string
            
        Raises:
            ValueError: If ciphertext is invalid or tampered
        """
        if not ciphertext:
            raise ValueError("Cannot decrypt empty value")
        
        try:
            decrypted_bytes = self.cipher.decrypt(ciphertext.encode('utf-8'))
            return decrypted_bytes.decode('utf-8')
        except Exception as e:
            logger.error(f"Decryption failed: {e}")
            raise RuntimeError(f"Failed to decrypt value (data may be corrupted): {e}")
    
    def mask_secret(self, value: str, reveal_chars: int = 3) -> str:
        """
        Create a masked version of a secret for safe display.
        
        Args:
            value: The secret value to mask
            reveal_chars: Number of characters to reveal at start and end
            
        Returns:
            Masked string (e.g., "abc***xyz" for reveal_chars=3)
            
        Example:
            >>> crypto.mask_secret("my_api_key_12345", reveal_chars=3)
            'my_***45'
        """
        if not value:
            return "****"
        
        length = len(value)
        
        if length <= reveal_chars * 2:
            # Too short to safely reveal - mask entirely
            return "*" * min(length, 8)
        
        start = value[:reveal_chars]
        end = value[-reveal_chars:]
        masked_count = length - (reveal_chars * 2)
        
        return f"{start}{'*' * min(masked_count, 8)}{end}"


# Singleton instance - import this from other modules
try:
    crypto_service = CryptoService()
except RuntimeError as e:
    # Re-raise to prevent application startup
    raise
