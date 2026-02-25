"""
Comprehensive API Schema definitions using Pydantic.

Includes both request and response models for type safety and validation.
All schemas follow OpenAPI/JSON Schema standards.
"""

from pydantic import BaseModel, Field, validator, EmailStr, HttpUrl
from typing import Optional, List, Dict, Any, Union, Annotated
from datetime import datetime
from enum import Enum
import re


# ========================================
# Enums for constrained values
# ========================================

class UserRole(str, Enum):
    """User role types"""
    ADMIN = 'admin'
    USER = 'user'
    MODERATOR = 'moderator'


class TestStatus(str, Enum):
    """Test execution status"""
    PENDING = 'pending'
    RUNNING = 'running'
    PASSED = 'passed'
    FAILED = 'failed'
    ERROR = 'error'
    TIMEOUT = 'timeout'


class TestLanguage(str, Enum):
    """Supported programming languages"""
    PYTHON = 'python'
    JAVASCRIPT = 'javascript'
    JAVA = 'java'


class TestFramework(str, Enum):
    """Supported test frameworks"""
    PYTEST = 'pytest'
    UNITTEST = 'unittest'
    JEST = 'jest'
    MOCHA = 'mocha'
    JUNIT = 'junit'


class GitProvider(str, Enum):
    """Git hosting providers"""
    GITHUB = 'github'
    GITLAB = 'gitlab'


class QueueStatus(str, Enum):
    """Test queue status"""
    PENDING = 'pending'
    PROCESSING = 'processing'
    COMPLETED = 'completed'
    FAILED = 'failed'


class LLMProvider(str, Enum):
    """LLM service providers"""
    GOOGLE = 'google'
    OLLAMA = 'ollama'


class LLMPreset(str, Enum):
    """LLM generation presets"""
    FAST = 'fast'
    BALANCED = 'balanced'
    THOROUGH = 'thorough'


# ========================================
# Base Response Models
# ========================================

class BaseResponse(BaseModel):
    """Base response model for all API responses"""
    success: bool = True
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat() + 'Z'
        }


class ErrorDetail(BaseModel):
    """Error detail structure"""
    message: str
    code: Optional[str] = None
    details: Optional[Any] = None
    path: Optional[str] = None
    method: Optional[str] = None


class ErrorResponse(BaseResponse):
    """Standard error response"""
    success: bool = False
    error: ErrorDetail


class PaginationMeta(BaseModel):
    """Pagination metadata"""
    page: int = Field(..., ge=1)
    per_page: int = Field(..., ge=1, le=100)
    total_items: int = Field(..., ge=0)
    total_pages: int = Field(..., ge=0)
    has_prev: bool
    has_next: bool


class PaginatedResponse(BaseResponse):
    """Paginated response wrapper"""
    meta: Dict[str, PaginationMeta]
    links: Optional[Dict[str, str]] = None


# ========================================
# User Schemas
# ========================================

class UserBase(BaseModel):
    """Base user fields"""
    username: Annotated[str, Field(min_length=3, max_length=50, pattern=r'^[a-zA-Z0-9_-]+$')]
    email: EmailStr
    full_name: Optional[Annotated[str, Field(max_length=100)]] = None


class UserCreate(UserBase):
    """User creation request"""
    password: Annotated[str, Field(min_length=8, max_length=128)]


class UserUpdate(BaseModel):
    """User update request (all fields optional)"""
    username: Optional[Annotated[str, Field(min_length=3, max_length=50)]] = None
    email: Optional[EmailStr] = None
    full_name: Optional[Annotated[str, Field(max_length=100)]] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None


class UserResponse(UserBase):
    """User response model"""
    id: int
    role: UserRole = UserRole.USER
    is_active: bool = True
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class UserListResponse(BaseResponse):
    """User list response"""
    data: Dict[str, List[UserResponse]]


# ========================================
# Authentication Schemas
# ========================================

class LoginRequest(BaseModel):
    """Login request"""
    username: Annotated[str, Field(min_length=3, max_length=50)]
    password: Annotated[str, Field(min_length=1)]
    remember_me: bool = False


class LoginResponse(BaseResponse):
    """Login response with token"""
    data: Dict[str, Any]  # Contains: token, user
    message: str = "Login successful"


class TokenRefreshRequest(BaseModel):
    """Token refresh request"""
    refresh_token: str


class PasswordResetRequest(BaseModel):
    """Password reset request"""
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    """Password reset confirmation"""
    token: str
    new_password: Annotated[str, Field(min_length=8, max_length=128)]


# ========================================
# Project Schemas
# ========================================

class ProjectBase(BaseModel):
    """Base project fields"""
    name: Annotated[str, Field(min_length=1, max_length=200)]
    description: Optional[Annotated[str, Field(max_length=1000)]] = None


class ProjectCreate(ProjectBase):
    """Project creation request"""
    github_repo_url: Optional[HttpUrl] = None
    git_provider: Optional[GitProvider] = None
    default_branch: Annotated[str, Field(max_length=100)] = 'main'
    
    @validator('github_repo_url')
    def validate_repo_url(cls, v, values):
        if v:
            url_str = str(v)
            if 'git_provider' in values and values['git_provider'] == GitProvider.GITHUB:
                if 'github.com' not in url_str:
                    raise ValueError('GitHub provider requires github.com URL')
            elif 'git_provider' in values and values['git_provider'] == GitProvider.GITLAB:
                if 'gitlab.com' not in url_str:
                    raise ValueError('GitLab provider requires gitlab.com URL')
        return v


class ProjectUpdate(BaseModel):
    """Project update request (all fields optional)"""
    name: Optional[Annotated[str, Field(min_length=1, max_length=200)]] = None
    description: Optional[Annotated[str, Field(max_length=1000)]] = None
    github_repo_url: Optional[HttpUrl] = None
    git_provider: Optional[GitProvider] = None
    default_branch: Optional[Annotated[str, Field(max_length=100)]] = None
    status: Optional[str] = None


class ProjectSettingsUpdate(BaseModel):
    """Project settings update request (all fields optional)"""
    default_test_framework: Optional[TestFramework] = Field(
        None,
        description="Default test framework for the project"
    )
    coverage_goal: Optional[Annotated[int, Field(ge=0, le=100)]] = Field(
        None,
        description="Target code coverage percentage (0-100)"
    )
    llm_preset: Optional[LLMPreset] = Field(
        None,
        description="LLM generation preset (fast, balanced, thorough)"
    )
    llm_temperature: Optional[float] = Field(
        None,
        ge=0.0,
        le=1.0,
        description="LLM temperature for creativity (0.0-1.0)"
    )
    max_tokens: Optional[Annotated[int, Field(ge=100, le=8000)]] = Field(
        None,
        description="Maximum tokens for LLM responses (100-8000)"
    )


class ProjectResponse(ProjectBase):
    """Project response model"""
    id: int
    user_id: int
    github_repo_url: Optional[str] = None
    git_provider: Optional[GitProvider] = None
    default_branch: str = 'main'
    status: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    # Additional computed fields
    test_count: Optional[int] = 0
    last_test_date: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class ProjectListResponse(BaseResponse):
    """Project list response"""
    data: Dict[str, List[ProjectResponse]]


# ========================================
# Test Generation Schemas
# ========================================

class TestGenerationRequest(BaseModel):
    """Test generation request"""
    project_id: Annotated[int, Field(gt=0)]
    code: Annotated[str, Field(min_length=1, max_length=100000)]
    language: TestLanguage
    test_framework: Optional[TestFramework] = TestFramework.PYTEST
    scenario_id: Optional[Annotated[int, Field(gt=0)]] = None
    github_file_path: Optional[Annotated[str, Field(max_length=500)]] = None
    function_name: Optional[Annotated[str, Field(max_length=200)]] = None


class TestExecutionRequest(BaseModel):
    """Test execution request"""
    test_id: Annotated[int, Field(gt=0)]
    code: Optional[Annotated[str, Field(min_length=1, max_length=100000)]] = None
    test_code: Optional[Annotated[str, Field(min_length=1, max_length=100000)]] = None
    language: TestLanguage
    timeout: Optional[Annotated[int, Field(ge=5, le=300)]] = 60  # 5s to 5min


class TestResponse(BaseModel):
    """Test response model"""
    id: int
    project_id: int
    function_name: Optional[str] = None
    language: TestLanguage
    test_framework: Optional[TestFramework] = None
    status: Optional[TestStatus] = None
    code: Optional[str] = None
    test_code: Optional[str] = None
    created_at: datetime
    executed_at: Optional[datetime] = None
    
    # Execution results
    passed_count: Optional[int] = 0
    failed_count: Optional[int] = 0
    total_tests: Optional[int] = 0
    execution_time_ms: Optional[int] = None
    
    class Config:
        from_attributes = True


class TestExecutionResponse(BaseResponse):
    """Test execution response"""
    data: Dict[str, Any]  # Contains: status, passed, failed, output, etc.


# ========================================
# Test Scenario Schemas
# ========================================

class ScenarioBase(BaseModel):
    """Base scenario fields"""
    name: Annotated[str, Field(min_length=1, max_length=200)]
    description: Optional[Annotated[str, Field(max_length=1000)]] = None


class ScenarioCreate(ScenarioBase):
    """Scenario creation request"""
    project_id: Annotated[int, Field(gt=0)]
    custom_instructions: Optional[Annotated[str, Field(max_length=5000)]] = None
    custom_assertions: Optional[Annotated[str, Field(max_length=2000)]] = None
    is_active: bool = True


class ScenarioUpdate(BaseModel):
    """Scenario update request"""
    name: Optional[Annotated[str, Field(min_length=1, max_length=200)]] = None
    description: Optional[Annotated[str, Field(max_length=1000)]] = None
    custom_instructions: Optional[Annotated[str, Field(max_length=5000)]] = None
    custom_assertions: Optional[Annotated[str, Field(max_length=2000)]] = None
    is_active: Optional[bool] = None


class ScenarioResponse(ScenarioBase):
    """Scenario response model"""
    id: int
    project_id: int
    custom_instructions: Optional[str] = None
    custom_assertions: Optional[str] = None
    is_active: bool = True
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class ScenarioListResponse(BaseResponse):
    """Scenario list response"""
    data: Dict[str, List[ScenarioResponse]]


# ========================================
# Queue Schemas
# ========================================

class QueueItemCreate(BaseModel):
    """Queue item creation request"""
    project_id: Annotated[int, Field(gt=0)]
    test_code: Annotated[str, Field(min_length=1)]
    language: TestLanguage
    priority: Optional[Annotated[int, Field(ge=0, le=10)]] = 5


class QueueItemResponse(BaseModel):
    """Queue item response"""
    id: int
    project_id: int
    status: QueueStatus
    priority: int = 5
    queued_at: datetime
    processed_at: Optional[datetime] = None
    result: Optional[Dict[str, Any]] = None
    
    class Config:
        from_attributes = True


class QueueListResponse(BaseResponse):
    """Queue list response"""
    data: Dict[str, List[QueueItemResponse]]


# ========================================
# Secret Management Schemas
# ========================================

class SecretCreate(BaseModel):
    """Secret creation request"""
    project_id: Annotated[int, Field(gt=0)]
    key_name: Annotated[str, Field(min_length=1, max_length=100, pattern=r'^[A-Z][A-Z0-9_]*$')]
    value: Annotated[str, Field(min_length=1, max_length=5000)]
    description: Optional[Annotated[str, Field(max_length=500)]] = None


class SecretUpdate(BaseModel):
    """Secret update request"""
    value: Annotated[str, Field(min_length=1, max_length=5000)]
    description: Optional[Annotated[str, Field(max_length=500)]] = None


class SecretResponse(BaseModel):
    """Secret response (value never included)"""
    id: int
    project_id: int
    key_name: str
    description: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


# ========================================
# Dashboard & Statistics Schemas
# ========================================

class DashboardStats(BaseModel):
    """Dashboard statistics"""
    total_projects: int = 0
    total_tests: int = 0
    passed_tests: int = 0
    failed_tests: int = 0
    success_rate: float = 0.0
    recent_activity: List[Dict[str, Any]] = []


class DashboardResponse(BaseResponse):
    """Dashboard response"""
    data: DashboardStats


# ========================================
# Health & Monitoring Schemas
# ========================================

class HealthStatus(BaseModel):
    """Health check status"""
    status: Annotated[str, Field(pattern='^(healthy|degraded|unhealthy)$')]
    response_time_ms: Optional[float] = None
    version: Optional[str] = None
    error: Optional[str] = None


class HealthCheckResponse(BaseResponse):
    """Health check response"""
    status: str
    database: HealthStatus
    llm_service: Optional[HealthStatus] = None
    external_apis: Optional[Dict[str, HealthStatus]] = None
    metrics: Optional[Dict[str, Any]] = None


class MetricsResponse(BaseResponse):
    """Metrics response"""
    data: Dict[str, Any]  # Contains: endpoints, global stats


# ========================================
# Webhook Schemas
# ========================================

class GitHubWebhookPayload(BaseModel):
    """GitHub webhook payload"""
    ref: str
    repository: Dict[str, Any]
    commits: List[Dict[str, Any]]
    pusher: Dict[str, Any]


class WebhookResponse(BaseResponse):
    """Webhook processing response"""
    data: Dict[str, Any]


# ========================================
# Bulk Operations Schemas
# ========================================

class BulkDeleteRequest(BaseModel):
    """Bulk delete request"""
    ids: List[Annotated[int, Field(gt=0)]] = Field(..., min_items=1, max_items=100)


class BulkUpdateRequest(BaseModel):
    """Bulk update request"""
    ids: List[Annotated[int, Field(gt=0)]] = Field(..., min_items=1, max_items=100)
    updates: Dict[str, Any]


class BulkOperationResponse(BaseResponse):
    """Bulk operation response"""
    data: Dict[str, Any]  # Contains: success_count, failed_count, details


# ========================================
# File Upload Schemas
# ========================================

class FileUploadResponse(BaseResponse):
    """File upload response"""
    data: Dict[str, str]  # Contains: file_path, file_size, file_type


# ========================================
# Search & Filter Schemas
# ========================================

class SearchRequest(BaseModel):
    """Search request"""
    query: Annotated[str, Field(min_length=1, max_length=200)]
    filters: Optional[Dict[str, Any]] = None
    sort_by: Optional[str] = None
    order: Optional[Annotated[str, Field(pattern='^(asc|desc)$')]] = 'asc'


# ========================================
# Validation Helper Functions
# ========================================

def validate_schema(schema_class: type[BaseModel], data: Dict[str, Any]) -> Union[BaseModel, ErrorResponse]:
    """
    Validate data against a Pydantic schema.
    
    Args:
        schema_class: Pydantic model class
        data: Data to validate
    
    Returns:
        Validated model instance or ErrorResponse
    
    Usage:
        result = validate_schema(ProjectCreate, request.json)
        if isinstance(result, ErrorResponse):
            return jsonify(result.dict()), 400
    """
    from utils.api_response import APIResponse, ErrorCodes, HTTPStatus
    
    try:
        return schema_class(**data)
    except Exception as e:
        return APIResponse.error(
            message='Validation error',
            error_code=ErrorCodes.VALIDATION_ERROR,
            details=str(e),
            status_code=HTTPStatus.BAD_REQUEST
        )
