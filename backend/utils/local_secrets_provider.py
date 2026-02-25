"""
Local database implementation of SecretsProvider.

Stores secrets encrypted at rest in PostgreSQL and decrypts ONLY in memory
for runtime injection during test execution.

Design goals:
- No plaintext secrets stored in DB
- No plaintext secrets returned by list APIs
- Least-privilege injection via allowed_keys
- Minimal logging (never log secrets or exception details)
- Provider abstraction supports future AWS Secrets Manager migration
"""

from __future__ import annotations

from typing import Dict, List, Optional

import logging

from utils.secrets_provider import SecretsProvider
from utils.crypto import crypto_service
from data.database import get_db_connection

logger = logging.getLogger(__name__)


class LocalSecretsProvider(SecretsProvider):
    """Stores encrypted secrets in PostgreSQL."""

    def create_secret(
        self,
        project_id: int,
        key_name: str,
        value: str,
        description: str = "",
    ) -> int:
        """
        Create a new encrypted secret.

        Notes:
        - `value` is encrypted immediately and never stored in plaintext.
        - Caller should validate key_name format; DB constraint also enforces it.
        """
        encrypted_value = crypto_service.encrypt(value)

        conn = get_db_connection()
        cursor = conn.cursor()

        try:
            cursor.execute(
                """
                INSERT INTO project_secrets
                    (project_id, key_name, encrypted_value, description)
                VALUES (%s, %s, %s, %s)
                RETURNING id
                """,
                (project_id, key_name, encrypted_value, description),
            )

            secret_id_row = cursor.fetchone()
            if not secret_id_row:
                conn.rollback()
                raise RuntimeError("Failed to create secret (no id returned)")

            secret_id = int(secret_id_row[0])
            conn.commit()

            # Minimal logging: do not log secret values; avoid noisy details.
            logger.info("Secret created (project_id=%s, key_name=%s)", project_id, key_name)
            return secret_id

        except Exception:
            conn.rollback()
            logger.error("Failed to create secret (project_id=%s, key_name=%s)", project_id, key_name)
            raise
        finally:
            cursor.close()
            conn.close()

    def list_secrets(self, project_id: int) -> List[Dict]:
        """
        List secret metadata (no values, no decryption).

        Returns list of dicts:
        - id, key_name, description, created_at, last_used_at, value_masked
        """
        conn = get_db_connection()
        cursor = conn.cursor()

        try:
            cursor.execute(
                """
                SELECT id, key_name, description, created_at, last_used_at
                FROM project_secrets
                WHERE project_id = %s
                ORDER BY key_name
                """,
                (project_id,),
            )

            secrets: List[Dict] = []
            for row in cursor.fetchall():
                secrets.append(
                    {
                        "id": row[0],
                        "key_name": row[1],
                        "description": row[2],
                        "created_at": row[3].isoformat() if row[3] else None,
                        "last_used_at": row[4].isoformat() if row[4] else None,
                        # Placeholder only: we never decrypt for display.
                        "value_masked": "********",
                    }
                )

            return secrets

        finally:
            cursor.close()
            conn.close()

    def delete_secret(self, project_id: int, key_name: str) -> bool:
        """
        Delete a secret.

        Returns:
            True if secret existed and was deleted, False if not found.
        """
        conn = get_db_connection()
        cursor = conn.cursor()

        try:
            cursor.execute(
                """
                DELETE FROM project_secrets
                WHERE project_id = %s AND key_name = %s
                """,
                (project_id, key_name),
            )

            deleted = cursor.rowcount > 0
            conn.commit()

            if deleted:
                logger.info("Secret deleted (project_id=%s, key_name=%s)", project_id, key_name)

            return deleted

        except Exception:
            conn.rollback()
            logger.error("Failed to delete secret (project_id=%s, key_name=%s)", project_id, key_name)
            raise
        finally:
            cursor.close()
            conn.close()

    def get_for_execution(
        self,
        project_id: int,
        allowed_keys: Optional[List[str]] = None,
    ) -> Dict[str, str]:
        """
        Retrieve decrypted secrets for test execution (runtime-only).

        SECURITY NOTES:
        - Do not log decrypted secrets.
        - Do not cache returned values.
        - Use returned values only for environment injection at execution time.

        Args:
            project_id: Project ID
            allowed_keys: If provided, only these keys are returned (least privilege)

        Returns:
            Dict of {KEY_NAME: decrypted_value}
        """
        conn = get_db_connection()
        cursor = conn.cursor()

        try:
            if allowed_keys is not None:
                # Treat empty list as "inject nothing"
                if len(allowed_keys) == 0:
                    return {}

                placeholders = ",".join(["%s"] * len(allowed_keys))
                query = f"""
                    SELECT key_name, encrypted_value
                    FROM project_secrets
                    WHERE project_id = %s AND key_name IN ({placeholders})
                """
                params = [project_id, *allowed_keys]
            else:
                # If allowed_keys is None, caller explicitly chose "all" (not recommended).
                query = """
                    SELECT key_name, encrypted_value
                    FROM project_secrets
                    WHERE project_id = %s
                """
                params = [project_id]

            cursor.execute(query, params)

            secrets_dict: Dict[str, str] = {}
            fetched_keys: List[str] = []

            for key_name, encrypted_value in cursor.fetchall():
                # Decrypt ONLY in memory
                secrets_dict[key_name] = crypto_service.decrypt(encrypted_value)
                fetched_keys.append(key_name)

            # Update last_used_at ONLY for secrets that were actually fetched/injected
            if fetched_keys:
                placeholders_used = ",".join(["%s"] * len(fetched_keys))
                cursor.execute(
                    f"""
                    UPDATE project_secrets
                    SET last_used_at = CURRENT_TIMESTAMP
                    WHERE project_id = %s AND key_name IN ({placeholders_used})
                    """,
                    [project_id, *fetched_keys],
                )
                conn.commit()
            else:
                # Nothing fetched; avoid unnecessary writes
                conn.rollback()

            # Minimal logging, no counts (avoid metadata leakage)
            logger.info("Secrets retrieved for execution (project_id=%s)", project_id)

            return secrets_dict

        except Exception:
            conn.rollback()
            logger.error("Failed to retrieve secrets for execution (project_id=%s)", project_id)
            raise
        finally:
            cursor.close()
            conn.close()


# Singleton instance - import this from other modules
secrets_provider: SecretsProvider = LocalSecretsProvider()
