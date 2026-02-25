/**
 * Centralized API Client with TypeScript Types
 * 
 * Features:
 * - Typed API responses
 * - Centralized error handling
 * - Request/response interceptors
 * - Auth token management
 * - Retry logic with exponential backoff
 * - Request cancellation
 */

import axios, { type AxiosInstance, AxiosError, type AxiosRequestConfig, type CancelTokenSource } from 'axios';

// ========================================
// Type Definitions (API Response Types)
// ========================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  metadata?: {
    page?: number;
    per_page?: number;
    total?: number;
    total_pages?: number;
  };
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  field_errors?: Record<string, string[]>;
}

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

// ========================================
// Domain Types
// ========================================

export interface User {
  id: number;
  email: string;
  name?: string;
  role: 'admin' | 'user' | 'moderator';
  created_at: string;
}

export interface Project {
  id: number;
  name: string;
  description?: string;
  repository_url?: string;
  github_repo_url?: string;
  git_provider?: 'github' | 'gitlab' | 'bitbucket';
  created_at: string;
  updated_at: string;
  user_id: number;
}

export interface Test {
  id: number;
  project_id: number;
  test_name: string;
  test_code: string;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'cancelled';
  created_at: string;
  updated_at: string;
  execution_time_ms?: number;
  error_message?: string;
  coverage_percentage?: number;
}

export interface TestResult {
  id: number;
  test_id: number;
  status: 'passed' | 'failed' | 'skipped';
  execution_time_ms: number;
  error_message?: string;
  stack_trace?: string;
  created_at: string;
}

export interface Secret {
  id: number;
  project_id: number;
  key: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

// ========================================
// Error Classification
// ========================================

export const ErrorType = {
  NETWORK: 'NETWORK',
  AUTH: 'AUTH',
  VALIDATION: 'VALIDATION',
  NOT_FOUND: 'NOT_FOUND',
  SERVER: 'SERVER',
  RATE_LIMIT: 'RATE_LIMIT',
  TIMEOUT: 'TIMEOUT',
  CANCELLED: 'CANCELLED',
  UNKNOWN: 'UNKNOWN',
} as const;

export type ErrorType = typeof ErrorType[keyof typeof ErrorType];

export interface ClassifiedError {
  type: ErrorType;
  message: string;
  userMessage: string;
  statusCode?: number;
  retryable: boolean;
  error?: unknown;
}

// ========================================
// API Configuration
// ========================================

export interface ApiClientConfig {
  baseURL?: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  onError?: (error: ClassifiedError) => void;
  onUnauthorized?: () => void;
}

// ========================================
// API Client Class
// ========================================

export class ApiClient {
  private client: AxiosInstance;
  private config: Required<ApiClientConfig>;
  private cancelTokens: Map<string, CancelTokenSource> = new Map();

  constructor(config: ApiClientConfig = {}) {
    this.config = {
      baseURL: config.baseURL || import.meta.env.VITE_API_URL || 'http://localhost:5000',
      timeout: config.timeout || 30000,
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000,
      onError: config.onError || (() => {}),
      onUnauthorized: config.onUnauthorized || (() => {}),
    };

    this.client = axios.create({
      baseURL: this.config.baseURL,
      timeout: this.config.timeout,
      withCredentials: true,  // Enable sending HTTP-only cookies
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor - add auth token
    this.client.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('access_token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor - handle errors
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const classifiedError = this.classifyError(error);

        // Handle 401 Unauthorized
        if (classifiedError.type === ErrorType.AUTH) {
          this.config.onUnauthorized();
          localStorage.removeItem('access_token');
          window.location.href = '/login';
        }

        // Retry logic for retryable errors
        if (classifiedError.retryable && error.config) {
          interface RetryConfig {
            __retryCount?: number;
          }
          const retryCount = (error.config as RetryConfig).__retryCount || 0;
          if (retryCount < this.config.retryAttempts) {
            (error.config as RetryConfig).__retryCount = retryCount + 1;
            await this.delay(this.config.retryDelay * Math.pow(2, retryCount));
            return this.client.request(error.config);
          }
        }

        // Call error handler
        this.config.onError(classifiedError);

        return Promise.reject(classifiedError);
      }
    );
  }

  private classifyError(error: AxiosError): ClassifiedError {
    // Network error (no response)
    if (!error.response) {
      if (error.code === 'ECONNABORTED') {
        return {
          type: ErrorType.TIMEOUT,
          message: 'Request timeout',
          userMessage: 'The request took too long. Please try again.',
          retryable: true,
          error,
        };
      }
      if (axios.isCancel(error)) {
        return {
          type: ErrorType.CANCELLED,
          message: 'Request cancelled',
          userMessage: 'Request was cancelled',
          retryable: false,
          error,
        };
      }
      return {
        type: ErrorType.NETWORK,
        message: 'Network error',
        userMessage: 'Unable to connect to the server. Please check your internet connection.',
        retryable: true,
        error,
      };
    }

    const status = error.response.status;
    const data = error.response.data as Record<string, unknown> | undefined;

    // Authentication error
    if (status === 401) {
      return {
        type: ErrorType.AUTH,
        message: 'Unauthorized',
        userMessage: 'Your session has expired. Please log in again.',
        statusCode: status,
        retryable: false,
        error,
      };
    }

    // Validation error
    if (status === 400 || status === 422) {
      return {
        type: ErrorType.VALIDATION,
        message: (data?.error as { message?: string })?.message || 'Validation error',
        userMessage: (data?.error as { message?: string })?.message || 'Please check your input and try again.',
        statusCode: status,
        retryable: false,
        error,
      };
    }

    // Not found
    if (status === 404) {
      return {
        type: ErrorType.NOT_FOUND,
        message: 'Resource not found',
        userMessage: (data?.error as { message?: string })?.message || 'The requested resource was not found.',
        statusCode: status,
        retryable: false,
        error,
      };
    }

    // Rate limit
    if (status === 429) {
      return {
        type: ErrorType.RATE_LIMIT,
        message: 'Rate limit exceeded',
        userMessage: 'Too many requests. Please wait a moment and try again.',
        statusCode: status,
        retryable: true,
        error,
      };
    }

    // Server error
    if (status >= 500) {
      return {
        type: ErrorType.SERVER,
        message: (data?.error as { message?: string })?.message || 'Server error',
        userMessage: 'Something went wrong on our end. Please try again later.',
        statusCode: status,
        retryable: true,
        error,
      };
    }

    // Unknown error
    return {
      type: ErrorType.UNKNOWN,
      message: (data?.error as { message?: string })?.message || 'An error occurred',
      userMessage: (data?.error as { message?: string })?.message || 'An unexpected error occurred. Please try again.',
      statusCode: status,
      retryable: false,
      error,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Cancel a request by key
   */
  public cancel(key: string): void {
    const cancelToken = this.cancelTokens.get(key);
    if (cancelToken) {
      cancelToken.cancel(`Request cancelled: ${key}`);
      this.cancelTokens.delete(key);
    }
  }

  /**
   * Cancel all pending requests
   */
  public cancelAll(): void {
    this.cancelTokens.forEach((cancelToken) => {
      cancelToken.cancel('All requests cancelled');
    });
    this.cancelTokens.clear();
  }

  // ========================================
  // HTTP Methods
  // ========================================

  public async get<T = unknown>(
    url: string,
    config?: AxiosRequestConfig & { cancelKey?: string }
  ): Promise<ApiResponse<T>> {
    const { cancelKey, ...axiosConfig } = config || {};
    
    if (cancelKey) {
      const cancelToken = axios.CancelToken.source();
      this.cancelTokens.set(cancelKey, cancelToken);
      axiosConfig.cancelToken = cancelToken.token;
    }

    const response = await this.client.get<ApiResponse<T>>(url, axiosConfig);
    
    if (cancelKey) {
      this.cancelTokens.delete(cancelKey);
    }

    return response.data;
  }

  public async post<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig & { cancelKey?: string }
  ): Promise<ApiResponse<T>> {
    const { cancelKey, ...axiosConfig } = config || {};
    
    if (cancelKey) {
      const cancelToken = axios.CancelToken.source();
      this.cancelTokens.set(cancelKey, cancelToken);
      axiosConfig.cancelToken = cancelToken.token;
    }

    const response = await this.client.post<ApiResponse<T>>(url, data, axiosConfig);
    
    if (cancelKey) {
      this.cancelTokens.delete(cancelKey);
    }

    return response.data;
  }

  public async put<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    const response = await this.client.put<ApiResponse<T>>(url, data, config);
    return response.data;
  }

  public async patch<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    const response = await this.client.patch<ApiResponse<T>>(url, data, config);
    return response.data;
  }

  public async delete<T = unknown>(
    url: string,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    const response = await this.client.delete<ApiResponse<T>>(url, config);
    return response.data;
  }

  // ========================================
  // Convenience Methods
  // ========================================

  /**
   * Get paginated data
   */
  public async getPaginated<T = unknown>(
    url: string,
    page: number = 1,
    perPage: number = 20,
    config?: AxiosRequestConfig
  ): Promise<PaginatedResponse<T>> {
    const response = await this.get<PaginatedResponse<T>>(
      `${url}?page=${page}&per_page=${perPage}`,
      config
    );
    return response.data!;
  }

  /**
   * Upload file
   */
  public async uploadFile(
    url: string,
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<ApiResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const config: AxiosRequestConfig = {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    };

    if (onProgress) {
      config.onUploadProgress = (progressEvent) => {
        if (progressEvent.total) {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(progress);
        }
      };
    }

    return this.post(url, formData, config);
  }
}

// ========================================
// Create singleton instance
// ========================================

export const apiClient = new ApiClient({
  onUnauthorized: () => {
    console.log('User unauthorized, redirecting to login...');
  },
  onError: (error) => {
    console.error('API Error:', error);
  },
});

// ========================================
// API Endpoints
// ========================================

export const api = {
  // Auth
  auth: {
    login: (email: string, password: string) =>
      apiClient.post<{ access_token: string; user: User }>('/api/auth/login', { email, password }),
    
    register: (email: string, password: string, name?: string) =>
      apiClient.post<{ access_token: string; user: User }>('/api/auth/register', { email, password, name }),
    
    logout: () => apiClient.post('/api/auth/logout'),
    
    forgotPassword: (email: string) =>
      apiClient.post('/api/auth/forgot-password', { email }),
    
    resetPassword: (token: string, password: string) =>
      apiClient.post('/api/auth/reset-password', { token, password }),
  },

  // Users
  users: {
    me: () => apiClient.get<User>('/api/users/me'),
    
    update: (id: number, data: Partial<User>) =>
      apiClient.put<User>(`/api/users/${id}`, data),
    
    list: (page?: number, perPage?: number) =>
      apiClient.getPaginated<User>('/api/users', page, perPage),
  },

  // Projects
  projects: {
    list: (page?: number, perPage?: number) =>
      apiClient.getPaginated<Project>('/api/projects', page, perPage),
    
    get: (id: number) => apiClient.get<Project>(`/api/projects/${id}`),
    
    create: (data: Partial<Project>) => apiClient.post<Project>('/api/projects', data),
    
    update: (id: number, data: Partial<Project>) =>
      apiClient.put<Project>(`/api/projects/${id}`, data),
    
    delete: (id: number) => apiClient.delete(`/api/projects/${id}`),
    
    // GitHub integration
    linkGitHub: (id: number, repoUrl: string) =>
      apiClient.post(`/api/projects/${id}/github`, { github_repo_url: repoUrl }),
    
    syncGitHub: (id: number) =>
      apiClient.post(`/api/projects/${id}/github/sync`),
  },

  // Tests
  tests: {
    list: (projectId: number, page?: number, perPage?: number) =>
      apiClient.getPaginated<Test>(`/api/projects/${projectId}/tests`, page, perPage),
    
    get: (id: number) => apiClient.get<Test>(`/api/tests/${id}`),
    
    create: (projectId: number, data: Partial<Test>) =>
      apiClient.post<Test>(`/api/projects/${projectId}/tests`, data),
    
    update: (id: number, data: Partial<Test>) =>
      apiClient.put<Test>(`/api/tests/${id}`, data),
    
    delete: (id: number) => apiClient.delete(`/api/tests/${id}`),
    
    run: (id: number) => apiClient.post<Test>(`/api/tests/${id}/run`),
    
    cancel: (id: number, reason?: string) =>
      apiClient.post(`/api/tests/${id}/cancel`, { reason }),
    
    results: (id: number) => apiClient.get<TestResult[]>(`/api/tests/${id}/results`),
  },

  // Test Queue
  queue: {
    list: (page?: number, perPage?: number) =>
      apiClient.getPaginated<Test>('/api/queue', page, perPage),
    
    enqueue: (testId: number, priority?: number) =>
      apiClient.post('/api/queue', { test_id: testId, priority }),
    
    dequeue: (testId: number) =>
      apiClient.delete(`/api/queue/${testId}`),
    
    stats: () => apiClient.get('/api/queue/stats'),
  },

  // Secrets
  secrets: {
    list: (projectId: number) =>
      apiClient.get<Secret[]>(`/api/projects/${projectId}/secrets`),
    
    create: (projectId: number, key: string, value: string, description?: string) =>
      apiClient.post<Secret>(`/api/projects/${projectId}/secrets`, { key, value, description }),
    
    update: (projectId: number, secretId: number, value?: string, description?: string) =>
      apiClient.put<Secret>(`/api/projects/${projectId}/secrets/${secretId}`, { value, description }),
    
    delete: (projectId: number, secretId: number) =>
      apiClient.delete(`/api/projects/${projectId}/secrets/${secretId}`),
  },

  // Health & Metrics
  health: {
    check: () => apiClient.get('/api/health'),
    
    detailed: () => apiClient.get('/api/health?detailed=true'),
    
    metrics: () => apiClient.get('/api/metrics'),
  },
};

export default api;
