"""
Request validation schemas using Pydantic.
Centralizes input validation for all routes.
"""
from pydantic import BaseModel, Field, validator, EmailStr
from typing import Optional, List, Dict, Any
import re

# Auth schemas
class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=8)
    full_name: Optional[str] = Field(None, max_length=100)
    
    @validator('username')
    def validate_username(cls, v):
        if not re.match(r'^[a-zA-Z0-9_-]+$', v):
            raise ValueError('Username can only contain letters, numbers, underscores, and hyphens')
        return v

class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1)
    rememberMe: Optional[bool] = False

class PasswordResetRequest(BaseModel):
    email: EmailStr

class PasswordResetConfirm(BaseModel):
    token: str = Field(..., min_length=1)
    password: str = Field(..., min_length=8)

# Project schemas
class ProjectCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    github_repo_url: Optional[str] = None
    git_provider: Optional[str] = Field(None, pattern='^(github|gitlab)$')
    default_branch: Optional[str] = Field('main', max_length=100)
    
    @validator('github_repo_url')
    def validate_repo_url(cls, v):
        if v:
            # Validate GitHub/GitLab URL format
            pattern = r'^https://(github\.com|gitlab\.com)/[\w-]+/[\w.-]+/?$'
            if not re.match(pattern, v):
                raise ValueError('Invalid repository URL. Must be a valid GitHub or GitLab repository URL')
        return v

class ProjectUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    github_repo_url: Optional[str] = None
    git_provider: Optional[str] = Field(None, pattern='^(github|gitlab)$')
    default_branch: Optional[str] = Field(None, max_length=100)
    
    @validator('github_repo_url')
    def validate_repo_url(cls, v):
        if v:
            pattern = r'^https://(github\.com|gitlab\.com)/[\w-]+/[\w.-]+/?$'
            if not re.match(pattern, v):
                raise ValueError('Invalid repository URL')
        return v

# AI/Test Generation schemas
class GenerateTestsRequest(BaseModel):
    project_id: int = Field(..., gt=0)
    code: str = Field(..., min_length=1)
    language: str = Field(..., pattern='^(python|javascript|java)$')
    test_framework: Optional[str] = Field('pytest', max_length=50)
    scenario_id: Optional[int] = Field(None, gt=0)
    github_file_path: Optional[str] = Field(None, max_length=500)
    
    @validator('code')
    def validate_code_length(cls, v):
        if len(v) > 100000:  # 100KB limit
            raise ValueError('Code size exceeds maximum limit of 100KB')
        return v

class RunTestsRequest(BaseModel):
    project_id: int = Field(..., gt=0)
    code: str = Field(..., min_length=1)
    test_code: str = Field(..., min_length=1)
    language: str = Field(..., pattern='^(python-basic|python-web|javascript-basic|java-basic)$')
    
    @validator('code', 'test_code')
    def validate_code_size(cls, v):
        if len(v) > 100000:
            raise ValueError('Code size exceeds maximum limit of 100KB')
        return v

# Scenario schemas
class ScenarioCreateRequest(BaseModel):
    project_id: int = Field(..., gt=0)
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    custom_instructions: Optional[str] = Field(None, max_length=5000)
    custom_assertions: Optional[str] = Field(None, max_length=2000)

class ScenarioUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    custom_instructions: Optional[str] = Field(None, max_length=5000)
    custom_assertions: Optional[str] = Field(None, max_length=2000)

# Secret schemas
class SecretCreateRequest(BaseModel):
    project_id: int = Field(..., gt=0)
    key: str = Field(..., min_length=1, max_length=100, pattern='^[A-Z0-9_]+$')
    value: str = Field(..., min_length=1, max_length=10000)
    description: Optional[str] = Field(None, max_length=500)
    
    @validator('key')
    def validate_secret_key(cls, v):
        # Ensure secret keys follow environment variable conventions
        if not re.match(r'^[A-Z][A-Z0-9_]*$', v):
            raise ValueError('Secret key must start with a letter and contain only uppercase letters, numbers, and underscores')
        return v

class SecretUpdateRequest(BaseModel):
    value: str = Field(..., min_length=1, max_length=10000)
    description: Optional[str] = Field(None, max_length=500)

# Queue/Webhook schemas
class ManualQueueRequest(BaseModel):
    project_id: int = Field(..., gt=0)
    github_file_path: str = Field(..., min_length=1, max_length=500)
    commit_sha: Optional[str] = Field(None, min_length=7, max_length=40)
    
    @validator('commit_sha')
    def validate_commit_sha(cls, v):
        if v and not re.match(r'^[a-f0-9]{7,40}$', v):
            raise ValueError('Invalid commit SHA format')
        return v

# User schemas
class UserUpdateRequest(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = Field(None, max_length=100)
    role: Optional[str] = Field(None, pattern='^(admin|user)$')

# Test execution schemas
class TestExecutionRequest(BaseModel):
    project_id: int = Field(..., gt=0)
    code: str = Field(..., min_length=1, max_length=100000)
    test_code: str = Field(..., min_length=1, max_length=100000)
    language: str = Field(..., pattern='^(python-basic|python-web|javascript-basic|java-basic)$')
    github_file_path: Optional[str] = Field(None, max_length=500)
    function_name: Optional[str] = Field(None, max_length=200)
