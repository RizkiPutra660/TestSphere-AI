import { useNavigate, useLocation } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";
import { useEffect, useMemo, useState } from "react";
import { CreateProjectModal } from "../components/CreateProject";
import { useAuth } from "../context/AuthContext";
import { usePersistedLocationState } from "../hooks/usePersistedLocationState";
import ConfirmDialog from "../components/ConfirmDialog";
import TestTypeDialog from "../components/TestTypeDialog";
import SecretsManager from "../components/SecretsManager";
import GitProviderModal from "../components/GitProviderModal";

import { getTokenBudget } from "../utils/tokenBudget";
import { StatCard } from "../components/ui/Card";
import { AppHeader } from "../components/ui/PageHeader";
import { DeleteButton } from "../components/ui/IconButton";

// Types matching backend responses
interface Project {
  id: number;
  name: string;
  description: string | null;
  created_at: string | null;
}

interface RecentRequest {
  id: number;
  requestText: string;
  functionName: string;
  language: string;
  modelUsed: string;
  status: string;
  timestamp: string | null;
  projectName: string;
  projectId: number;
  passedCount: number;
  failedCount: number;
  totalTests: number;
  executionLogId: number;
  executionTime: number;
}

interface Stats {
  totalProjects: number;
  totalRequests: number;
  totalPassed: number;
  totalFailed: number;
  totalTests: number;
  languagesUsed: number;
}

interface Activity {
  date: string;
  passed: number;
  failed: number;
}

interface DashboardData {
  projects: Project[];
  recentRequests: RecentRequest[];
  stats: Stats;
  activity: Activity[];
}

type TokenUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

type DashboardState = {
  projectId?: number;
  tokenUsage?: TokenUsage;
};

type ResultItem = {
  id: number;
  test_case_name: string;
  test_case_description?: string | null;
  status: string;
  execution_time_ms: number;
  code?: string | null;
  error_message?: string | null;
};

const Dashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { colors, theme } = useTheme();
  const isDark = theme === "dark";

  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const state = usePersistedLocationState<DashboardState>('dashboard') ?? (location.state as DashboardState | null);

  // Persist activeProjectId in localStorage so it survives a page refresh
  const [activeProjectId, setActiveProjectId] = useState<number | null>(() => {
    if (state?.projectId) return state.projectId;
    const stored = localStorage.getItem('activeProjectId');
    return stored ? Number(stored) : null;
  });

  // Keep localStorage in sync whenever activeProjectId changes
  const setActiveProjectIdPersisted = (id: number | null) => {
    setActiveProjectId(id);
    if (id != null) {
      localStorage.setItem('activeProjectId', String(id));
    } else {
      localStorage.removeItem('activeProjectId');
    }
  };

  const [showCreateModal, setShowCreateModal] = useState(false);

  const [hoveredProjectId, setHoveredProjectId] = useState<number | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<number | null>(null);
  const [editingProjectName, setEditingProjectName] = useState("");

  const [deleteDialog, setDeleteDialog] = useState<{ id: number; name: string } | null>(null);

  const [showTestTypeDialog, setShowTestTypeDialog] = useState(false);

  const [deleteRequestDialog, setDeleteRequestDialog] = useState<{
    id: number;
    executionLogId: number;
    name: string;
  } | null>(null);

  const [hoveredRequestId, setHoveredRequestId] = useState<number | null>(null);

  const [showSecrets, setShowSecrets] = useState(false);
  const [showGitProviderModal, setShowGitProviderModal] = useState(false);

  // Latest call token usage
  const [tokenUsage, setTokenUsage] = useState<TokenUsage>({
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
  });

  // Remaining budget
  const [remainingTokens, setRemainingTokens] = useState<number>(() => {
    try {
      return getTokenBudget().remaining;
    } catch {
      return 500_000;
    }
  });

  const isOutOfTokens = remainingTokens <= 0;

  // Read projectId + tokenUsage from navigation state (and fallback to localStorage)
  const projectIdFromState = state?.projectId;
  const tokenUsageFromState = state?.tokenUsage;

  useEffect(() => {
    if (projectIdFromState != null) setActiveProjectIdPersisted(projectIdFromState);

    if (tokenUsageFromState) {
      const next: TokenUsage = {
        prompt_tokens: Number(tokenUsageFromState.prompt_tokens || 0),
        completion_tokens: Number(tokenUsageFromState.completion_tokens || 0),
        total_tokens: Number(tokenUsageFromState.total_tokens || 0),
      };
      setTokenUsage(next);
      localStorage.setItem("tokenUsage", JSON.stringify(next));
    } else {
      const stored = localStorage.getItem("tokenUsage");
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as Partial<TokenUsage>;
          setTokenUsage({
            prompt_tokens: Number(parsed.prompt_tokens || 0),
            completion_tokens: Number(parsed.completion_tokens || 0),
            total_tokens: Number(parsed.total_tokens || 0),
          });
        } catch {
          // ignore
        }
      }
    }

    try {
      setRemainingTokens(getTokenBudget().remaining);
    } catch {
      setRemainingTokens(500_000);
    }
  }, [projectIdFromState, tokenUsageFromState]);

  // Poll localStorage every 1s to keep tokenUsage + remainingTokens in sync
  useEffect(() => {
    const id = setInterval(() => {
      const raw = localStorage.getItem("tokenUsage");
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          setTokenUsage((prev) => {
            const next: TokenUsage = {
              prompt_tokens: Number(parsed.prompt_tokens || 0),
              completion_tokens: Number(parsed.completion_tokens || 0),
              total_tokens: Number(parsed.total_tokens || 0),
            };
            if (
              prev.total_tokens === next.total_tokens &&
              prev.prompt_tokens === next.prompt_tokens &&
              prev.completion_tokens === next.completion_tokens
            ) {
              return prev;
            }
            return next;
          });
        } catch {
          // ignore
        }
      }

      try {
        setRemainingTokens(getTokenBudget().remaining);
      } catch {
        // ignore
      }
    }, 1000);

    return () => clearInterval(id);
  }, []);

  const onStartNewTest = () => {
    if (isOutOfTokens) {
      alert("Token budget exhausted (0 / 500,000).");
      return;
    }
    setShowTestTypeDialog(true);
  };

  const onGitHubTests = async () => {
    if (activeProjectId) {
      try {
        const response = await fetch(`/api/projects/${activeProjectId}`, {
          credentials: "include",
        });
        if (response.ok) {
          const project = await response.json();
          if (project.github_repo_url && project.git_provider) {
            navigate("/queue", {
              state: {
                projectId: activeProjectId,
                gitProvider: project.git_provider,
                repoUrl: project.github_repo_url,
              },
            });
            return;
          }
        }
      } catch {
        void 0;
      }
    }
    setShowGitProviderModal(true);
  };

  const onViewHistory = () => {
    navigate("/history", { state: { projectId: activeProjectId } });
  };

  const onLogout = async () => {
    await logout();
    navigate("/");
  };

  useEffect(() => {
    if (user) fetchDashboardData(user.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activeProjectId]);

  const fetchDashboardData = async (userId: number) => {
    try {
      setLoading(true);
      const projectParam = activeProjectId ? `?project=${activeProjectId}` : "";
      const response = await fetch(`/api/dashboard/${userId}${projectParam}`, {
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) throw new Error("Failed to fetch dashboard data");

      const data = await response.json();
      setDashboardData(data);
      setError(null);
    } catch {
      setError("Unable to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProject = async (projectId: number) => {
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error("Failed to delete project");

      if (activeProjectId === projectId) setActiveProjectIdPersisted(null);
      if (user) fetchDashboardData(user.id);
    } catch {
      alert("Failed to delete project");
    }
  };

  const handleEditProject = async (projectId: number, newName: string) => {
    if (!newName.trim()) {
      alert("Project name cannot be empty");
      return;
    }

    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });

      if (!response.ok) throw new Error("Failed to update project");

      setEditingProjectId(null);
      setEditingProjectName("");
      if (user) fetchDashboardData(user.id);
    } catch {
      alert("Failed to update project");
    }
  };

  const onViewResults = async (request: RecentRequest) => {
    try {
      const response = await fetch(`/api/results/${request.executionLogId}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch results");

      const data = await response.json();

      const session = {
        id: String(request.executionLogId),
        execution_log_id: request.executionLogId,
        generatedTests: (data.test_results as ResultItem[]).map((result) => ({
          id: String(result.id),
          name: result.test_case_name,
          description: result.test_case_description || "",
          status: result.status,
          duration: result.execution_time_ms,
          code: result.code || `# Test: ${result.test_case_name}`,
          error: result.error_message,
        })),
        projectId: request.projectId,
        passedCount: request.passedCount,
        failedCount: request.failedCount,
        executionTime: request.executionTime || data.execution_log?.total_execution_time_ms || 0,
        language: request.language,
        functionName: request.functionName,
        framework: data.execution_log?.framework,
        config: data.execution_log?.config,
        originalTestCases: data.original_test_cases || [],
      };

      navigate("/results", { state: { session } });
    } catch {
      setError("Failed to load test results");
    }
  };

  const handleDeleteRequest = async (executionLogId: number) => {
    try {
      const response = await fetch(`/api/results/${executionLogId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) throw new Error("Failed to delete");

      if (user) fetchDashboardData(user.id);
      setDeleteRequestDialog(null);
    } catch {
      setError("Failed to delete test execution");
    }
  };

  const stats = dashboardData?.stats || {
    totalProjects: 0,
    totalRequests: 0,
    totalPassed: 0,
    totalFailed: 0,
    totalTests: 0,
    languagesUsed: 0,
  };

  const recentRequests = dashboardData?.recentRequests || [];
  const trendData = useMemo(() => {
    const activity = dashboardData?.activity || [];
    const getDayName = (dateStr: string) => {
      const date = new Date(dateStr);
      return date.toLocaleDateString("en-GB", {
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    };

    return activity.length > 0
      ? activity.map((a) => ({
          name: getDayName(a.date),
          passed: a.passed,
          failed: a.failed,
        }))
      : [];
  }, [dashboardData?.activity]);

  const isInitialLoad = loading && !dashboardData;

  const hasNoProjects = !dashboardData?.projects || dashboardData.projects.length === 0;

  const currentProject = activeProjectId
    ? dashboardData?.projects.find((p) => p.id === activeProjectId)
    : null;

  const TokenBar = () => {
    const totalBudget = 500_000;
    const pct = totalBudget > 0 ? (remainingTokens / totalBudget) * 100 : 0;

    const remainingBadgeBg = isOutOfTokens
      ? isDark
        ? "rgba(239, 68, 68, 0.12)"
        : "rgba(239, 68, 68, 0.14)"
      : isDark
      ? "rgba(99, 102, 241, 0.12)"
      : "rgba(99, 102, 241, 0.18)";

    const remainingBadgeBorder = isOutOfTokens
      ? isDark
        ? "1px solid rgba(239, 68, 68, 0.28)"
        : "1px solid rgba(239, 68, 68, 0.35)"
      : isDark
      ? "1px solid rgba(99, 102, 241, 0.28)"
      : "1px solid rgba(99, 102, 241, 0.38)";

    const remainingLabel = isOutOfTokens
      ? isDark
        ? "#FCA5A5"
        : "#B91C1C"
      : isDark
      ? "#C7D2FE"
      : "#4338CA";

    const remainingValue = isDark ? "#FFFFFF" : "#0F172A";

    const chipBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(15, 23, 42, 0.05)";
    const chipBorder = isDark ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(15, 23, 42, 0.08)";
    const chipText = isDark ? "#E5E7EB" : "#1F2937";
    const chipLabel = isDark ? "#9CA3AF" : "#475569";

    return (
      <div style={{ marginTop: "1rem", display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.6rem",
            padding: "0.55rem 0.85rem",
            borderRadius: "999px",
            background: remainingBadgeBg,
            border: remainingBadgeBorder,
            boxShadow: isDark ? "0 10px 25px rgba(0,0,0,0.25)" : "0 12px 24px rgba(79, 70, 229, 0.12)",
          }}
        >
          <span style={{ fontSize: "1rem" }}>{isOutOfTokens ? "🚫" : "🔢"}</span>
          <span style={{ color: remainingLabel, fontWeight: 700, fontSize: "0.92rem" }}>
            Remaining
          </span>
          <span style={{ color: remainingValue, fontWeight: 800, fontSize: "0.95rem" }}>
            {remainingTokens.toLocaleString()} / {totalBudget.toLocaleString()}
          </span>
        </div>

        <div style={{ display: "inline-flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <div
            style={{
              padding: "0.45rem 0.7rem",
              borderRadius: "999px",
              background: chipBg,
              border: chipBorder,
              color: chipText,
              fontSize: "0.82rem",
            }}
            title="Latest prompt tokens"
          >
            <span style={{ color: chipLabel }}>Prompt</span>{" "}
            <span style={{ fontWeight: 700 }}>{tokenUsage.prompt_tokens.toLocaleString()}</span>
          </div>

          <div
            style={{
              padding: "0.45rem 0.7rem",
              borderRadius: "999px",
              background: chipBg,
              border: chipBorder,
              color: chipText,
              fontSize: "0.82rem",
            }}
            title="Latest completion tokens"
          >
            <span style={{ color: chipLabel }}>Completion</span>{" "}
            <span style={{ fontWeight: 700 }}>{tokenUsage.completion_tokens.toLocaleString()}</span>
          </div>

          <div
            style={{
              padding: "0.45rem 0.7rem",
              borderRadius: "999px",
              background: chipBg,
              border: chipBorder,
              color: chipText,
              fontSize: "0.82rem",
            }}
            title="Latest total tokens"
          >
            <span style={{ color: chipLabel }}>Last call</span>{" "}
            <span style={{ fontWeight: 700 }}>{tokenUsage.total_tokens.toLocaleString()}</span>
          </div>
        </div>

        <div
          style={{
            width: 220,
            maxWidth: "100%",
            height: 10,
            borderRadius: 999,
            background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.10)",
            overflow: "hidden",
          }}
          title="Remaining token budget"
        >
          <div
            style={{
              height: "100%",
              width: `${Math.max(0, Math.min(100, pct))}%`,
              background: isOutOfTokens
                ? "linear-gradient(90deg, rgba(239,68,68,0.9), rgba(244,63,94,0.9))"
                : "linear-gradient(90deg, rgba(99,102,241,0.9), rgba(34,211,238,0.9))",
            }}
          />
        </div>

        <div style={{ fontSize: "0.78rem", color: colors.textMuted }}>Auto-updates after each generation/execution</div>
      </div>
    );
  };

  if (isInitialLoad) {
    return (
      <div style={{ minHeight: "100vh", background: colors.bgPrimary, color: colors.textPrimary, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: "50%",
              border: "2px solid rgba(255,255,255,0.25)",
              borderTopColor: colors.textPrimary,
              animation: "spin 0.8s linear infinite",
            }}
          />
          <div>Loading dashboard...</div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (hasNoProjects) {
    return (
      <div style={{ minHeight: "100vh", background: colors.bgPrimary, color: colors.textPrimary, display: "flex", flexDirection: "column" }}>
        <AppHeader
          user={user || undefined}
          actions={
            <button
              type="button"
              onClick={onLogout}
              style={{
                background: "transparent",
                border: "none",
                color: colors.textMuted,
                padding: "0.5rem 1rem",
                borderRadius: "8px",
                cursor: "pointer",
                fontSize: "0.875rem",
              }}
            >
              Logout
            </button>
          }
        />

        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem" }}>
          <div style={{ maxWidth: "800px", width: "100%", textAlign: "center" }}>
            <div style={{ color: colors.textPrimary }}>
              <div style={{ fontSize: "4rem", marginBottom: "1.5rem" }}>🚀</div>
              <h1 style={{ fontSize: "2.5rem", fontWeight: "bold", marginBottom: "1rem", color: colors.textPrimary }}>
                Welcome to TestSphere AI
              </h1>
              <p style={{ fontSize: "1.25rem", color: colors.textMuted, marginBottom: "2rem", lineHeight: "1.6" }}>
                Generate intelligent software test scenarios for your code with AI. Create your first project to get started.
              </p>
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                style={{
                  padding: "1rem 2rem",
                  fontSize: "1.125rem",
                  fontWeight: "600",
                  borderRadius: "12px",
                  border: "none",
                  cursor: "pointer",
                  background: "linear-gradient(135deg, #6366F1, #4F46E5)",
                  color: "#fff",
                  transition: "transform 0.2s, box-shadow 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow = "0 8px 16px rgba(99, 102, 241, 0.3)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                Create Your First Project
              </button>
            </div>
          </div>
        </div>

        <CreateProjectModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onSuccess={(project) => {
            setActiveProjectIdPersisted(project.id);
            if (user) fetchDashboardData(user.id);
          }}
        />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: colors.bgPrimary, color: colors.textPrimary, display: "flex", flexDirection: "column" }}>
      {/* Overlay while refetching */}
      {loading && dashboardData && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,0.35)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              padding: "0.9rem 1.1rem",
              borderRadius: "12px",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              color: "#fff",
            }}
          >
            <div
              style={{
                width: 18,
                height: 18,
                borderRadius: "50%",
                border: "2px solid rgba(255,255,255,0.25)",
                borderTopColor: "#fff",
                animation: "spin 0.8s linear infinite",
              }}
            />
            <div style={{ fontSize: "0.9rem", color: "#E5E7EB" }}>Updating dashboard…</div>
          </div>
        </div>
      )}

      <AppHeader
        user={user || undefined}
        sticky
        actions={
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <button
              type="button"
              onClick={onLogout}
              style={{ background: "transparent", border: "none", color: colors.textMuted, padding: "0.5rem 1rem", borderRadius: "8px", cursor: "pointer", fontSize: "0.875rem", transition: "background 0.2s" }}
              onMouseEnter={(e) => e.currentTarget.style.background = theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              Logout
            </button>
          </div>
        }
      />

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Sidebar */}
        <aside style={{ width: 280, background: colors.bgSidebar, borderRight: `1px solid ${colors.borderPrimary}`, padding: "1.5rem", overflowY: "auto" }}>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            style={{
              width: "100%",
              padding: "0.75rem",
              background: "rgba(99, 102, 241, 0.1)",
              border: "1px dashed rgba(99, 102, 241, 0.3)",
              borderRadius: "8px",
              color: "#6366F1",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: "pointer",
              marginBottom: "0.75rem",
              transition: "background 0.2s, border 0.2s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(99, 102, 241, 0.2)"; e.currentTarget.style.borderColor = "rgba(99, 102, 241, 0.5)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(99, 102, 241, 0.1)"; e.currentTarget.style.borderColor = "rgba(99, 102, 241, 0.3)"; }}
          >
            + New Project
          </button>

          <div
            onClick={() => setActiveProjectIdPersisted(null)}
            style={{
              padding: "0.75rem",
              borderRadius: "8px",
              marginBottom: "0.75rem",
              background: activeProjectId === null ? "rgba(99, 102, 241, 0.15)" : "transparent",
              border: activeProjectId === null ? "1px solid rgba(99, 102, 241, 0.3)" : "1px solid transparent",
              cursor: "pointer",
              transition: "background 0.2s",
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = activeProjectId === null ? "rgba(99, 102, 241, 0.25)" : "rgba(99, 102, 241, 0.08)"}
            onMouseLeave={(e) => e.currentTarget.style.background = activeProjectId === null ? "rgba(99, 102, 241, 0.15)" : "transparent"}
          >
            <div style={{ fontSize: "0.875rem", fontWeight: 700 }}>Show all projects</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {dashboardData?.projects.map((project) => (
              <div
                key={project.id}
                onClick={() => setActiveProjectIdPersisted(project.id)}
                onMouseEnter={() => setHoveredProjectId(project.id)}
                onMouseLeave={() => setHoveredProjectId(null)}
                style={{
                  padding: "0.75rem",
                  borderRadius: "8px",
                  background: activeProjectId === project.id ? "rgba(99, 102, 241, 0.15)" : "transparent",
                  border: activeProjectId === project.id ? "1px solid rgba(99, 102, 241, 0.3)" : "1px solid transparent",
                  cursor: "pointer",
                  transition: "background 0.2s",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {editingProjectId === project.id ? (
                      <input
                        value={editingProjectName}
                        onChange={(e) => setEditingProjectName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleEditProject(project.id, editingProjectName);
                          if (e.key === "Escape") {
                            setEditingProjectId(null);
                            setEditingProjectName("");
                          }
                        }}
                        onBlur={() => handleEditProject(project.id, editingProjectName)}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          background: "rgba(255,255,255,0.08)",
                          border: "1px solid rgba(99, 102, 241, 0.4)",
                          borderRadius: 6,
                          padding: "0.35rem 0.5rem",
                          color: colors.textPrimary,
                          width: "100%",
                          outline: "none",
                        }}
                      />
                    ) : (
                      <div style={{ fontSize: "0.9rem", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {project.name}
                      </div>
                    )}
                  </div>

                  {hoveredProjectId === project.id && editingProjectId !== project.id && (
                    <div style={{ display: "flex", gap: "0.25rem" }}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingProjectId(project.id);
                          setEditingProjectName(project.name);
                        }}
                        style={{
                          background: "rgba(99, 102, 241, 0.12)",
                          border: "1px solid rgba(99, 102, 241, 0.25)",
                          borderRadius: 8,
                          padding: "0.35rem 0.45rem",
                          cursor: "pointer",
                          color: colors.textPrimary,
                          transition: "background 0.2s",
                        }}
                        title="Edit project"
                        onMouseEnter={(e) => e.currentTarget.style.background = "rgba(99, 102, 241, 0.25)"}
                        onMouseLeave={(e) => e.currentTarget.style.background = "rgba(99, 102, 241, 0.12)"}
                      >
                        ✏️
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteDialog({ id: project.id, name: project.name });
                        }}
                        style={{
                          background: "rgba(239, 68, 68, 0.12)",
                          border: "1px solid rgba(239, 68, 68, 0.25)",
                          borderRadius: 8,
                          padding: "0.35rem 0.45rem",
                          cursor: "pointer",
                          color: colors.textPrimary,
                          transition: "background 0.2s",
                        }}
                        title="Delete project"
                        onMouseEnter={(e) => e.currentTarget.style.background = "rgba(239, 68, 68, 0.25)"}
                        onMouseLeave={(e) => e.currentTarget.style.background = "rgba(239, 68, 68, 0.12)"}
                      >
                        🗑️
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {activeProjectId && (
            <div style={{ marginTop: "1.25rem", paddingTop: "1.25rem", borderTop: `1px solid ${colors.borderPrimary}` }}>
              <button
                type="button"
                onClick={() => setShowSecrets((v) => !v)}
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  background: showSecrets ? "rgba(99, 102, 241, 0.15)" : "transparent",
                  border: `1px solid ${colors.borderPrimary}`,
                  borderRadius: "8px",
                  color: showSecrets ? "#6366F1" : colors.textMuted,
                  fontSize: "0.875rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                🔐 Manage Secrets
              </button>
            </div>
          )}
        </aside>

        {/* Main */}
        <main style={{ flex: 1, overflowY: "auto", padding: "2.5rem 2rem" }}>
          {error && (
            <div style={{ background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: "12px", padding: "1rem", marginBottom: "2rem", color: "#EF4444" }}>
              {error}
            </div>
          )}

          <div style={{ marginBottom: "2rem" }}>
            {activeProjectId == null ? (
              <>
                <h1 style={{ fontSize: "2.2rem", fontWeight: 900, marginBottom: "0.35rem" }}>
                  Welcome, {user?.username || "User"}
                </h1>
                <p style={{ fontSize: "1.05rem", color: colors.textMuted }}>Ready to generate some intelligent tests?</p>
                <TokenBar />
              </>
            ) : (
              <>
                <h1 style={{ fontSize: "2.2rem", fontWeight: 900, marginBottom: "0.35rem" }}>
                  {currentProject?.name || "Project"}
                </h1>
                <p style={{ fontSize: "1.0rem", color: colors.textMuted }}>{currentProject?.description || "No description"}</p>
                <TokenBar />
              </>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1.25rem", marginBottom: "2rem" }}>
            <StatCard emoji="🧪" label="Total Tests" value={stats.totalTests} variant="info" headerText="All time" />
            <StatCard emoji="✓" label="Passed" value={stats.totalPassed} variant="success" headerText="All time" />
            <StatCard emoji="✗" label="Failed" value={stats.totalFailed} variant="error" headerText="All time" />
            <StatCard emoji="</>" label="Languages Used" value={stats.languagesUsed} variant="warning" headerText="Active" />
          </div>

          <div style={{ marginBottom: "2rem", display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            {activeProjectId == null ? (
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                style={{
                  padding: "1rem 1.5rem",
                  borderRadius: 12,
                  border: "none",
                  cursor: "pointer",
                  background: "linear-gradient(135deg, #6366F1, #4F46E5)",
                  color: "#fff",
                  fontWeight: 800,
                  transition: "transform 0.2s, box-shadow 0.2s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 16px rgba(99, 102, 241, 0.3)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
              >
                ✨ Create New Project
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onStartNewTest}
                  disabled={isOutOfTokens}
                  style={{
                    padding: "1rem 1.5rem",
                    borderRadius: 12,
                    border: "none",
                    cursor: isOutOfTokens ? "not-allowed" : "pointer",
                    opacity: isOutOfTokens ? 0.6 : 1,
                    background: "linear-gradient(135deg, #6366F1, #4F46E5)",
                    color: "#fff",
                    fontWeight: 800,
                    transition: "transform 0.2s, box-shadow 0.2s",
                  }}
                  title={isOutOfTokens ? "Token budget exhausted (0 / 10,000)" : "Start a new AI test"}
                  onMouseEnter={(e) => { if (!isOutOfTokens) { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 16px rgba(99, 102, 241, 0.3)"; } }}
                  onMouseLeave={(e) => { if (!isOutOfTokens) { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; } }}
                >
                  ✨ Start New AI Test
                </button>

                <button
                  type="button"
                  onClick={onGitHubTests}
                  style={{
                    padding: "1rem 1.5rem",
                    borderRadius: 12,
                    border: "none",
                    cursor: "pointer",
                    background: "linear-gradient(135deg, #22D3EE, #06B6D4)",
                    color: "#fff",
                    fontWeight: 800,
                    transition: "transform 0.2s, box-shadow 0.2s",
                  }}
                  title="Run tests from Git repo"
                  onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 16px rgba(34, 211, 238, 0.3)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
                >
                  🔗 Git Tests
                </button>
              </>
            )}
          </div>

          {showGitProviderModal && (
            <GitProviderModal
              onClose={() => setShowGitProviderModal(false)}
              onProceed={(provider, repoUrl) => {
                setShowGitProviderModal(false);
                navigate("/queue", { state: { projectId: activeProjectId, gitProvider: provider, repoUrl } });
              }}
            />
          )}

          {showSecrets && activeProjectId && (
            <div style={{ marginBottom: "2rem" }}>
              <SecretsManager projectId={activeProjectId} />
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: "1.5rem" }}>
            <div style={{ background: colors.bgCard, border: `1px solid ${colors.borderPrimary}`, borderRadius: 16, padding: "1.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <h2 style={{ fontSize: "1.15rem", fontWeight: 900 }}>Recent AI Requests</h2>
                <button type="button" onClick={onViewHistory} style={{ background: "transparent", border: "none", color: "#6366F1", cursor: "pointer", fontSize: "0.9rem", transition: "opacity 0.2s", opacity: 0.9 }} onMouseEnter={(e) => e.currentTarget.style.opacity = "1"} onMouseLeave={(e) => e.currentTarget.style.opacity = "0.9"}>
                  View All →
                </button>
              </div>

              {recentRequests.length === 0 ? (
                <div style={{ textAlign: "center", padding: "2.5rem 1rem", color: colors.textMuted }}>No tests run yet</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {recentRequests.map((request) => (
                    <div
                      key={request.id}
                      onClick={() => onViewResults(request)}
                      onMouseEnter={() => setHoveredRequestId(request.id)}
                      onMouseLeave={() => setHoveredRequestId(null)}
                      style={{
                        background: isDark ? "rgba(255, 255, 255, 0.04)" : "#ffffff",
                        border: `1px solid ${colors.borderPrimary}`,
                        boxShadow: isDark ? "0 4px 12px rgba(0,0,0,0.25)" : "0 8px 18px rgba(15, 23, 42, 0.08)",
                        borderRadius: 12,
                        padding: "1rem",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "flex-end",
                        justifyContent: "space-between",
                        gap: "0.75rem",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "0.95rem", fontWeight: 900, marginBottom: "0.4rem", color: colors.textPrimary }}>{request.functionName}</div>

                        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "0.8rem", color: colors.textMuted }}>
                          <span style={{ padding: "0.25rem 0.5rem", background: isDark ? "rgba(99, 102, 241, 0.14)" : "rgba(99, 102, 241, 0.12)", color: "#4f46e5", borderRadius: 6, fontWeight: 800, textTransform: "capitalize" }}>
                            {request.language}
                          </span>

                          <span>
                            {request.timestamp
                              ? new Date(request.timestamp).toLocaleString("en-GB", {
                                  day: "2-digit",
                                  month: "2-digit",
                                  year: "numeric",
                                  hour: "numeric",
                                  minute: "2-digit",
                                  hour12: true,
                                })
                              : "N/A"}
                          </span>

                          <div style={{ display: "flex", gap: "0.6rem", marginLeft: "auto" }}>
                            {request.passedCount > 0 && <span style={{ color: "#059669", fontWeight: 900 }}>✓ {request.passedCount}</span>}
                            {request.failedCount > 0 && <span style={{ color: "#DC2626", fontWeight: 900 }}>✗ {request.failedCount}</span>}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
                        {hoveredRequestId === request.id && (
                          <DeleteButton
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteRequestDialog({
                                id: request.id,
                                executionLogId: request.executionLogId,
                                name: request.functionName,
                              });
                            }}
                            size="sm"
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ background: colors.bgCard, border: `1px solid ${colors.borderPrimary}`, borderRadius: 16, padding: "1.5rem" }}>
              <h2 style={{ fontSize: "1.15rem", fontWeight: 900, marginBottom: "1rem" }}>Pass/Fail Activity (Last 7 Days)</h2>

              {trendData.length === 0 ? (
                <p style={{ color: colors.textMuted, fontSize: "0.9rem", textAlign: "center", padding: "2rem" }}>No activity yet</p>
              ) : (
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {trendData.map((day, i) => (
                    <li key={i} style={{ display: "flex", justifyContent: "space-between", padding: "0.6rem 0", borderBottom: `1px solid ${colors.borderPrimary}`, fontSize: "0.9rem", color: colors.textMuted }}>
                      <span>{day.name}</span>
                      <span>
                        Passed {day.passed}, Failed {day.failed}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </main>
      </div>

      <CreateProjectModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={(project) => {
          setActiveProjectIdPersisted(project.id);
          if (user) fetchDashboardData(user.id);
        }}
      />

      <ConfirmDialog
        isOpen={!!deleteDialog}
        title="Delete Project"
        message={`Are you sure you want to delete "${deleteDialog?.name}"? This will delete all associated tests.`}
        confirmText="Delete"
        cancelText="Cancel"
        onClose={() => setDeleteDialog(null)}
        onConfirm={() => {
          if (deleteDialog) {
            handleDeleteProject(deleteDialog.id);
            setDeleteDialog(null);
          }
        }}
      />

      <ConfirmDialog
        isOpen={!!deleteRequestDialog}
        title="Delete Test Execution"
        message={`Are you sure you want to delete "${deleteRequestDialog?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        onClose={() => setDeleteRequestDialog(null)}
        onConfirm={() => {
          if (deleteRequestDialog) handleDeleteRequest(deleteRequestDialog.executionLogId);
        }}
      />

      <TestTypeDialog
        isOpen={showTestTypeDialog}
        onClose={() => setShowTestTypeDialog(false)}
        onSelect={(type) => {
          setShowTestTypeDialog(false);

          if (type === "unit") {
            navigate("/test", { state: { projectId: activeProjectId, testType: "unit" } });
            return;
          }

          navigate("/integration-test", { state: { projectId: activeProjectId, testType: "integration" } });
        }}
      />

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default Dashboard;
