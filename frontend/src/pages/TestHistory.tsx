import { useNavigate, useLocation } from "react-router";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { usePersistedLocationState } from "../hooks/usePersistedLocationState";
import TestTypeDialog from "../components/TestTypeDialog";
import ConfirmDialog from "../components/ConfirmDialog";
import { SimplePagination } from "../components/ui/Pagination";
import { TableEmptyState } from "../components/ui/EmptyState";
import { SimplePageHeader } from "../components/ui/PageHeader";

interface TestHistoryItem {
  id: number;
  functionName: string;
  requestText: string;
  language: string;
  timestamp: string | null;
  passedCount: number;
  failedCount: number;
  status: string;
  projectName: string;
  projectId: number;
  executionLogId: number;
  executionTime: number;
  totalTests: number;
  testType: string;
}

interface Pagination {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

interface TestResultResponseItem {
  id: number;
  test_case_name: string;
  test_case_description?: string | null;
  status: string;
  execution_time_ms: number;
  code?: string | null;
  error_message?: string | null;
}

const TestHistory = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { colors, theme } = useTheme();
  const persistedState = usePersistedLocationState<{ projectId?: number | null }>('testHistory');
  const [history, setHistory] = useState<TestHistoryItem[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const projectId = persistedState?.projectId ?? location.state?.projectId ?? null;
  const [projectName, setProjectName] = useState<string>("");
  
  // Search and Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filterProject, setFilterProject] = useState("");
  const [filterLanguage, setFilterLanguage] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  
  // Available options for filters (populated from data)
  const [availableProjects, setAvailableProjects] = useState<string[]>([]);
  const [availableLanguages, setAvailableLanguages] = useState<string[]>([]);
  const [filterTestType, setFilterTestType] = useState("");

  const [showTestTypeDialog, setShowTestTypeDialog] = useState(false);

  // Delete states
  const [deleteDialog, setDeleteDialog] = useState<{
    executionLogId: number;
    name: string;
  } | null>(null);
  const [hoveredItemId, setHoveredItemId] = useState<number | null>(null);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterProject, filterLanguage, filterDateFrom, filterDateTo, filterTestType]);

  const fetchHistory = useCallback(async (page: number) => {
    try {
      setLoading(true);
      let url = `/api/history/${user?.id}?page=${page}&per_page=15`;
      
      if (projectId) {
        url += `&project=${projectId}`;
      }
      if (searchQuery) {
        url += `&search=${encodeURIComponent(searchQuery)}`;
      }
      if (filterProject) {
        url += `&filter_project=${encodeURIComponent(filterProject)}`;
      }
      if (filterLanguage) {
        url += `&filter_language=${encodeURIComponent(filterLanguage)}`;
      }
      if (filterDateFrom) {
        url += `&date_from=${filterDateFrom}`;
      }
      if (filterDateTo) {
        url += `&date_to=${filterDateTo}`;
      }
      if (filterTestType) {
        url += `&filter_test_type=${encodeURIComponent(filterTestType)}`;
      }

      const response = await fetch(url, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch history");
      }

      const data = await response.json();
      setHistory(data.history);
      setPagination(data.pagination);
      
      // Set project name for specific project view
      if (projectId && data.projectName) {
        setProjectName(data.projectName);
      }
      
      // Extract unique projects and languages for filter dropdowns
      if (data.availableFilters) {
        setAvailableProjects(data.availableFilters.projects || []);
        setAvailableLanguages(data.availableFilters.languages || []);
      }
    } catch {
      setError("Unable to load test history");
    } finally {
      setLoading(false);
    }
  }, [
    user?.id,
    projectId,
    searchQuery,
    filterProject,
    filterLanguage,
    filterDateFrom,
    filterDateTo,
    filterTestType,
  ]);

  useEffect(() => {
    if (user) {
      fetchHistory(currentPage);
    }
  }, [user, currentPage, fetchHistory]);

  const clearFilters = () => {
    setSearchQuery("");
    setFilterProject("");
    setFilterLanguage("");
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterTestType("");
  };

  const hasActiveFilters = filterProject || filterLanguage || filterDateFrom || filterDateTo || filterTestType;

  const handleDeleteItem = async (executionLogId: number) => {
    try {
      const response = await fetch(
        `/api/results/${executionLogId}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      if (!response.ok) {
        throw new Error("Failed to delete");
      }

      // Refresh history
      fetchHistory(currentPage);
      setDeleteDialog(null);
    } catch {
      setError("Failed to delete test execution");
    }
  };

  const onViewResults = async (item: TestHistoryItem) => {
    try {
      const response = await fetch(
        `/api/results/${item.executionLogId}`,
        {
          credentials: "include",
        }
      );

      if (!response.ok) {
        throw new Error("Failed to fetch results");
      }

      const data = await response.json();

        const session = {
      id: String(item.executionLogId),
      execution_log_id: item.executionLogId,
        generatedTests: (data.test_results as TestResultResponseItem[]).map((result) => ({
          id: String(result.id),
          name: result.test_case_name,
          description: result.test_case_description || "",
          status: result.status,
          duration: result.execution_time_ms,
          code: result.code || `# Test: ${result.test_case_name}`,
          error: result.error_message,
      })),
      passedCount: item.passedCount,
      failedCount: item.failedCount,
      executionTime: item.executionTime || data.execution_log.total_execution_time_ms || 0,
      language: item.language,
      functionName: item.functionName,
      framework: data.execution_log.framework,
      config: data.execution_log.config,
      originalTestCases: data.original_test_cases || [], 
      };

      navigate("/results", { state: { session } });
    } catch {
      setError("Failed to load test results");
    }
  };

  if (loading && history.length === 0) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: colors.bgPrimary,
          color: colors.textPrimary,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: "50%",
              border: `2px solid ${colors.borderPrimary}`,
              borderTopColor: colors.accentPrimary,
              animation: "spin 0.8s linear infinite",
            }}
          />
          <div>Loading test history...</div>
        </div>
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: colors.bgPrimary,
        color: colors.textPrimary,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <style>{`
        select option {
          background: ${theme === 'dark' ? '#1F2937' : '#ffffff'};
          color: ${theme === 'dark' ? '#ffffff' : '#0F172A'};
        }
        select option:checked {
          background: ${theme === 'dark' ? '#4F46E5' : '#E0E7FF'};
          color: ${theme === 'dark' ? '#ffffff' : '#0F172A'};
        }
      `}</style>
      {/* Header */}
      <SimplePageHeader
        onBack={() => navigate("/dashboard", { state: { projectId } })}
        title={projectId ? `Test History - ${projectName || "Project"}` : "Test History - All Projects"}
        bgColor={colors.bgHeader}
        borderColor={colors.borderPrimary}
        textColor={colors.textMuted}
      />

      {/* Main Content */}
      <main style={{ padding: "2rem", maxWidth: "1400px", margin: "0 auto" }}>
        {error && (
          <div
            style={{
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              borderRadius: "12px",
              padding: "1rem",
              marginBottom: "2rem",
              color: "#EF4444",
            }}
          >
            {error}
          </div>
        )}

        {/* Search and Filter Bar */}
        <div style={{ 
          display: "flex", 
          gap: "1rem", 
          marginBottom: "1.5rem",
          flexWrap: "wrap",
          alignItems: "center"
        }}>
          {/* Search Input */}
          <div style={{ position: "relative", flex: "1", minWidth: "250px", maxWidth: "400px" }}>
            <span style={{
              position: "absolute",
              left: "12px",
              top: "50%",
              transform: "translateY(-50%)",
              color: colors.textMuted,
              fontSize: "1rem"
            }}>
              🔍
            </span>
            <input
              type="text"
              placeholder={projectId ? "Search by test name..." : "Search by test name or project..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "0.75rem 1rem 0.75rem 2.5rem",
                background: colors.bgInput,
                border: `1px solid ${colors.borderPrimary}`,
                borderRadius: "8px",
                color: colors.textPrimary,
                fontSize: "0.875rem",
                outline: "none",
              }}
            />
          </div>

          {/* Filter Button */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.75rem 1rem",
              background: hasActiveFilters ? "rgba(99, 102, 241, 0.2)" : colors.bgCard,
              border: hasActiveFilters ? "1px solid rgba(99, 102, 241, 0.5)" : `1px solid ${colors.borderPrimary}`,
              borderRadius: "8px",
              color: hasActiveFilters ? "#818CF8" : colors.textPrimary,
              fontSize: "0.875rem",
              cursor: "pointer",
              transition: "background 0.2s, border-color 0.2s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = hasActiveFilters ? "rgba(99, 102, 241, 0.3)" : (theme === 'dark' ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)"); }}
            onMouseLeave={(e) => { e.currentTarget.style.background = hasActiveFilters ? "rgba(99, 102, 241, 0.2)" : colors.bgCard; }}
          >
            <span>🔽</span>
            Filter
            {hasActiveFilters && (
              <span style={{
                background: "#6366F1",
                color: "#fff",
                borderRadius: "50%",
                width: "18px",
                height: "18px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.7rem",
                fontWeight: 600
              }}>
                {[filterProject, filterLanguage, filterDateFrom, filterDateTo, filterTestType].filter(Boolean).length}
              </span>
            )}
          </button>

          {/* Clear Filters Button */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              style={{
                padding: "0.75rem 1rem",
                background: "transparent",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                borderRadius: "8px",
                color: "#EF4444",
                fontSize: "0.875rem",
                cursor: "pointer",
                transition: "background 0.2s, border-color 0.2s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239, 68, 68, 0.1)"; e.currentTarget.style.borderColor = "rgba(239, 68, 68, 0.5)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "rgba(239, 68, 68, 0.3)"; }}
            >
              Clear Filters
            </button>
          )}
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <div style={{
            background: colors.bgCard,
            border: `1px solid ${colors.borderPrimary}`,
            borderRadius: "12px",
            padding: "1.5rem",
            marginBottom: "1.5rem",
            display: "grid",
            gridTemplateColumns: projectId ? "repeat(4, 1fr)" : "repeat(5, 1fr)",
            gap: "1rem",
          }}>
            {/* Project Filter - Only show for All Projects view */}
            {!projectId && (
              <div>
                <label style={{ display: "block", marginBottom: "0.5rem", color: colors.textMuted, fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase" }}>
                  Project
                </label>
                <select
                  value={filterProject}
                  onChange={(e) => setFilterProject(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    background: colors.bgInput,
                    border: `1px solid ${colors.borderPrimary}`,
                    borderRadius: "8px",
                    color: colors.textPrimary,
                    fontSize: "0.875rem",
                    outline: "none",
                  }}
                >
                  <option value="">All Projects</option>
                  {availableProjects.map((proj) => (
                    <option key={proj} value={proj}>{proj}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Language Filter */}
            <div>
              <label style={{ display: "block", marginBottom: "0.5rem", color: colors.textMuted, fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase" }}>
                Language
              </label>
              <select
                value={filterLanguage}
                onChange={(e) => setFilterLanguage(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  background: colors.bgInput,
                  border: `1px solid ${colors.borderPrimary}`,
                  borderRadius: "8px",
                  color: colors.textPrimary,
                  fontSize: "0.875rem",
                  outline: "none",
                }}
              >
                <option value="">All Languages</option>
                {availableLanguages.map((lang) => (
                  <option key={lang} value={lang}>{lang.charAt(0).toUpperCase() + lang.slice(1)}</option>
                ))}
              </select>
            </div>
            
            {/* Test Type Filter */}
            <div>
              <label style={{ display: "block", marginBottom: "0.5rem", color: colors.textMuted, fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase" }}>
                Test Type
              </label>
              <select
                value={filterTestType}
                onChange={(e) => setFilterTestType(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  background: colors.bgInput,
                  border: `1px solid ${colors.borderPrimary}`,
                  borderRadius: "8px",
                  color: colors.textPrimary,
                  fontSize: "0.875rem",
                  outline: "none",
                }}
              >
                <option value="">All Types</option>
                <option value="unit">Unit Tests</option>
                <option value="integration">Integration Tests</option>
              </select>
            </div>

            {/* Date From */}
            <div>
              <label style={{ display: "block", marginBottom: "0.5rem", color: colors.textMuted, fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase" }}>
                From Date
              </label>
              <input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  background: colors.bgInput,
                  border: `1px solid ${colors.borderPrimary}`,
                  borderRadius: "8px",
                  color: colors.textPrimary,
                  fontSize: "0.875rem",
                  outline: "none",
                }}
              />
            </div>

            {/* Date To */}
            <div>
              <label style={{ display: "block", marginBottom: "0.5rem", color: colors.textMuted, fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase" }}>
                To Date
              </label>
              <input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  background: colors.bgInput,
                  border: `1px solid ${colors.borderPrimary}`,
                  borderRadius: "8px",
                  color: colors.textPrimary,
                  fontSize: "0.875rem",
                  outline: "none",
                }}
              />
            </div>
          </div>
        )}

        {/* Stats Summary */}
        {pagination && (
          <div style={{ marginBottom: "1rem", color: colors.textMuted, fontSize: "0.875rem" }}>
            Showing {history.length} of {pagination.total} test executions
            {hasActiveFilters && " (filtered)"}
          </div>
        )}

        {/* History List */}
        <div
          style={{
            background: colors.bgCard,
            border: `1px solid ${colors.borderPrimary}`,
            borderRadius: "16px",
            overflow: "hidden",
          }}
        >
          {/* Table Header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: projectId ? "2fr 1fr 1fr 1fr 1fr 1fr 0.5fr" : "2fr 1fr 1fr 1fr 1fr 1fr 1fr 0.5fr",
              padding: "1rem 1.5rem",
              background: theme === 'dark' ? "rgba(0, 0, 0, 0.3)" : "rgba(0, 0, 0, 0.05)",
              borderBottom: `1px solid ${colors.borderPrimary}`,
              fontSize: "0.75rem",
              fontWeight: 600,
              color: colors.textMuted,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            <div>Test Name</div>
            {!projectId && <div>Project</div>}
            <div>Language</div>
            <div>Type</div>
            <div>Date</div>
            <div>Results</div>
            <div>Duration</div>
            <div>Actions</div>
          </div>

          {/* Table Body */}
          {history.length === 0 ? (
            <TableEmptyState
              emoji="📭"
              title="No test history found"
              actionText="Create Your First Test"
              onAction={() => navigate("/test")}
              variant={theme === 'dark' ? "dark" : "light"}
              isTableFooter={true}
            />
          ) : (
            history.map((item, index) => (
              <div
                key={`${item.executionLogId}-${index}`}
                onClick={() => onViewResults(item)}
                onMouseEnter={() => setHoveredItemId(item.executionLogId)}
                onMouseLeave={() => setHoveredItemId(null)}
                style={{
                  display: "grid",
                  gridTemplateColumns: projectId ? "2fr 1fr 1fr 1fr 1fr 1fr 0.5fr" : "2fr 1fr 1fr 1fr 1fr 1fr 1fr 0.5fr",
                  padding: "1rem 1.5rem",
                  borderBottom: `1px solid ${colors.borderSecondary}`,
                  cursor: "pointer",
                  transition: "all 0.2s",
                  background: hoveredItemId === item.executionLogId 
                    ? (theme === 'dark' ? "rgba(99, 102, 241, 0.1)" : "rgba(99, 102, 241, 0.05)")
                    : "transparent",
                }}
              >
                {/* Function Name */}
                <div
                  style={{
                    fontWeight: 500,
                    color: colors.textPrimary,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.functionName}
                </div>

                {/* Project - Only show for All Projects view */}
                {!projectId && (
                  <div
                    style={{
                      color: colors.textMuted,
                      fontSize: "0.875rem",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.projectName}
                  </div>
                )}

                {/* Language */}
                <div>
                  <span
                    style={{
                      padding: "0.25rem 0.5rem",
                      background: "rgba(99, 102, 241, 0.1)",
                      color: "#818CF8",
                      borderRadius: "4px",
                      fontSize: "0.75rem",
                      fontWeight: 500,
                      textTransform: "capitalize",
                    }}
                  >
                    {item.language}
                  </span>
                </div>

                {/* Test Type */}
                <div>
                  <span
                    style={{
                      padding: "0.25rem 0.5rem",
                      background: item.testType === 'integration' 
                        ? "rgba(34, 211, 238, 0.1)" 
                        : "rgba(16, 185, 129, 0.1)",
                      color: item.testType === 'integration' ? "#22D3EE" : "#10B981",
                      borderRadius: "4px",
                      fontSize: "0.75rem",
                      fontWeight: 500,
                    }}
                  >
                    {item.testType === 'integration' ? '🔗 Integration' : '🧪 Unit'}
                  </span>
                </div>
                
                {/* Date */}
                <div style={{ color: colors.textMuted, fontSize: "0.875rem" }}>
                  {item.timestamp
                    ? new Date(item.timestamp).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "N/A"}
                </div>

                {/* Results */}
                <div style={{ display: "flex", gap: "0.75rem", fontSize: "0.875rem" }}>
                  {item.passedCount > 0 && (
                    <span style={{ color: "#10B981", fontWeight: 500 }}>
                      ✓ {item.passedCount}
                    </span>
                  )}
                  {item.failedCount > 0 && (
                    <span style={{ color: "#EF4444", fontWeight: 500 }}>
                      ✗ {item.failedCount}
                    </span>
                  )}
                  {item.passedCount === 0 && item.failedCount === 0 && (
                    <span style={{ color: colors.textMuted }}>-</span>
                  )}
                </div>

                {/* Duration */}
                <div style={{ color: colors.textMuted, fontSize: "0.875rem" }}>
                  {item.executionTime > 0 ? `${(item.executionTime / 1000).toFixed(2)}s` : "-"}
                </div>

                {/* Actions */}
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteDialog({
                        executionLogId: item.executionLogId,
                        name: item.functionName,
                      });
                    }}
                    style={{
                      background: "rgba(239, 68, 68, 0.1)",
                      border: "1px solid rgba(239, 68, 68, 0.3)",
                      borderRadius: "6px",
                      padding: "0.4rem",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "all 0.2s",
                      opacity: hoveredItemId === item.executionLogId ? 1 : 0.5,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(239, 68, 68, 0.2)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "rgba(239, 68, 68, 0.1)";
                    }}
                    title="Delete test"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div style={{ marginTop: "2rem" }}>
            <SimplePagination
              currentPage={currentPage}
              totalPages={pagination.totalPages}
              onPageChange={setCurrentPage}
            />
          </div>
        )}
      </main>

      {/* Test Type Dialog */}
      <TestTypeDialog
        isOpen={showTestTypeDialog}
        onClose={() => setShowTestTypeDialog(false)}
        onSelect={(type) => {
          setShowTestTypeDialog(false);
          if (type === "unit") {
            navigate("/test", { state: { projectId, testType: "unit" } });
          } else {
            navigate("/integration-test", { state: { projectId, testType: "integration" } });
          }
        }}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!deleteDialog}
        title="Delete Test Execution"
        message={`Are you sure you want to delete "${deleteDialog?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        onClose={() => setDeleteDialog(null)}
        onConfirm={() => {
          if (deleteDialog) {
            handleDeleteItem(deleteDialog.executionLogId);
          }
        }}
      />
    </div>
  );
};

export default TestHistory;
