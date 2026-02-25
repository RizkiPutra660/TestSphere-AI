"""
Abstract interface for secrets providers.
Enables seamless migration to AWS Secrets Manager in future.
"""

from abc import ABC, abstractmethod
from typing import Dict, List, Optional


class SecretsProvider(ABC):
    """Abstract interface for secrets storage and retrieval."""

    @abstractmethod
    def create_secret(
        self,
        project_id: int,
        key_name: str,
        value: str,
        description: str = ""
    ) -> int:
        """
        Store a new secret.

        Returns:
            secret_id
        """
        pass

    @abstractmethod
    def list_secrets(self, project_id: int) -> List[Dict]:
        """
        List all secrets for a project (metadata only, no values).

        Returns:
            List of dicts with keys:
            - id
            - key_name
            - description
            - created_at
            - last_used_at
        """
        pass

    @abstractmethod
    def delete_secret(self, project_id: int, key_name: str) -> bool:
        """
        Delete a secret.

        Returns:
            True if secret existed and was deleted, False if not found
        """
        pass

    @abstractmethod
    def get_for_execution(
        self,
        project_id: int,
        allowed_keys: Optional[List[str]] = None
    ) -> Dict[str, str]:
        """
        Retrieve decrypted secrets for test execution.

        Args:
            project_id: Project ID
            allowed_keys: If provided, only return these keys

        Returns:
            Dict of {KEY_NAME: decrypted_value}

        IMPORTANT:
            - Values must never be logged
            - Values must never be cached
            - Values must be used for runtime injection only
        """
        pass
