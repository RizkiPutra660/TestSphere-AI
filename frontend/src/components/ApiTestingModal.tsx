import { useMemo, useState } from "react";
import { X, Play, Loader2 } from "lucide-react";
import { toast } from "react-toastify";
import { TestResultCompact, TestResultsSummary } from "./ui/TestResultItem";
import { normalizeBaseUrl, normalizePath } from "../utils/formatters";
import { useTheme } from "../context/ThemeContext";

type ApiTestStatus =
  | "passed"
  | "failed"
  | "skipped"
  | "timedOut"
  | "interrupted"
  | "unknown";

type ApiTestResult = {
  ok: boolean;
  summary: {
    total: number;
    passed: number;
    failed: number;
    durationMs: number;
  };
  tests: Array<{
    title: string;
    status: ApiTestStatus;
    durationMs: number;
    error: string | null;
  }>;
  runnerError: string | null;
};

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type ApiRequest = {
  method: HttpMethod;
  path: string;
  body?: unknown;
};

function parseEndpoints(raw: string): string[] {
  return raw
    .split(/\r?\n|,/g)
    .map((s) => s.trim())
    .filter(Boolean)
    .map(normalizePath)
    .filter(Boolean);
}

function isBodyMethod(method: HttpMethod) {
  return method === "POST" || method === "PUT" || method === "PATCH";
}

export default function ApiTestingModal({
  isOpen,
  onClose,
  projectId,
}: {
  isOpen: boolean;
  onClose: () => void;
  projectId?: number | null;
}) {
  const [baseUrl, setBaseUrl] = useState("");
  const [method, setMethod] = useState<HttpMethod>("GET");
  const [endpointsText, setEndpointsText] = useState("");
  const [bodyText, setBodyText] = useState("");

  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<ApiTestResult | null>(null);

  const endpoints = useMemo(() => parseEndpoints(endpointsText), [endpointsText]);
  const cleanBaseUrl = normalizeBaseUrl(baseUrl);

  const bodyJsonError = useMemo(() => {
    if (!isBodyMethod(method)) return null;
    const trimmed = bodyText.trim();
    if (!trimmed) return null;
    try {
      JSON.parse(trimmed);
      return null;
    } catch {
      return "Body must be valid JSON";
    }
  }, [method, bodyText]);

  const requests: ApiRequest[] = useMemo(() => {
    let body: unknown = undefined;

    if (isBodyMethod(method)) {
      const trimmed = bodyText.trim();
      if (trimmed) {
        try {
          body = JSON.parse(trimmed);
        } catch {
          body = undefined;
        }
      }
    }

    return endpoints.map((path) => ({
      method,
      path,
      ...(isBodyMethod(method) && body !== undefined ? { body } : {}),
    }));
  }, [endpoints, method, bodyText]);

  const canRun =
    cleanBaseUrl.length > 0 &&
    endpoints.length > 0 &&
    !bodyJsonError &&
    !isRunning;

  const { theme } = useTheme();
  const isDark = theme === "dark";
  const panelClass = isDark
    ? "bg-[#111827] border border-gray-800 text-white"
    : "bg-white border border-gray-200 text-gray-900";
  const labelClass = `text-sm ${isDark ? "text-gray-300" : "text-gray-700"}`;
  const helperTextClass = `text-xs ${isDark ? "text-gray-500" : "text-gray-600"}`;
  const inputClass = `mt-2 w-full border rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500/40 ${
    isDark
      ? "bg-[#0B0F19] border-gray-800 text-white"
      : "bg-white border-gray-300 text-gray-900"
  }`;
  const chipClass = `text-xs px-2 py-1 rounded-md border ${
    isDark ? "bg-white/5 border-gray-800 text-gray-300" : "bg-gray-100 border-gray-300 text-gray-700"
  }`;

  if (!isOpen) return null;

  const runApiTests = async () => {
    if (!cleanBaseUrl) {
      toast.error("Base URL is required");
      return;
    }
    if (endpoints.length === 0) {
      toast.error("Please add at least one endpoint.");
      return;
    }
    if (bodyJsonError) {
      toast.error(bodyJsonError);
      return;
    }

    setIsRunning(true);
    setResult(null);

    try {
      const res = await fetch("/api/integration/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          baseUrl: cleanBaseUrl,
          requests,
          project_id: projectId,
          function_name: `API Test: ${cleanBaseUrl}`,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || "Failed to run API tests");
        return;
      }

      setResult(data as ApiTestResult);
    } catch {
      toast.error("Network error while running tests");
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 px-4"
      onMouseDown={onClose}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className={`
          w-full max-w-xl
          max-h-[80vh]
          rounded-2xl
          shadow-2xl
          flex flex-col
          ${panelClass}
        `}
      >
        {/* Header */}
        <div className={`flex justify-between items-center px-5 py-4 border-b ${isDark ? "border-gray-800" : "border-gray-200"}`}>
          <h2 className={`text-lg font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>API Testing</h2>
          <button onClick={onClose} className={`p-2 rounded-lg ${isDark ? "hover:bg-white/5" : "hover:bg-gray-100"}`}>
            <X className={`w-5 h-5 ${isDark ? "text-gray-300" : "text-gray-600"}`} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Base URL */}
          <div>
            <label className={labelClass}>Base URL</label>
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className={inputClass}
              placeholder="http://127.0.0.1:5000"
            />
            <p className={`${helperTextClass} mt-2`}>
              Tip: Don’t end with a trailing slash.
            </p>
          </div>

          {/* Method dropdown */}
          <div>
            <label className={labelClass}>Method</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as HttpMethod)}
              className={inputClass}
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="PATCH">PATCH</option>
              <option value="DELETE">DELETE</option>
            </select>

            <p className={`${helperTextClass} mt-2`}>
              You only need to type endpoints below — method is applied to all.
            </p>
          </div>

          {/* Endpoints */}
          <div>
            <label className={labelClass}>
              Endpoints (one per line)
            </label>
            <textarea
              value={endpointsText}
              onChange={(e) => setEndpointsText(e.target.value)}
              rows={5}
              className={inputClass}
              placeholder={"/\n/api/chat/health\n/api/integration/run"}
            />

            {endpoints.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {endpoints.slice(0, 6).map((ep) => (
                  <span
                    key={ep}
                    className={chipClass}
                  >
                    {method} {ep}
                  </span>
                ))}
                {endpoints.length > 6 && (
                  <span className={helperTextClass}>
                    +{endpoints.length - 6} more
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Body JSON */}
          {isBodyMethod(method) && (
            <div>
              <label className={labelClass}>
                Body JSON (optional)
              </label>
              <textarea
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                rows={4}
                className={inputClass}
                placeholder={'{"key":"value"}'}
              />
              {bodyJsonError && (
                <div className={`mt-2 text-xs ${isDark ? "text-red-300" : "text-red-600"}`}>
                  • {bodyJsonError}
                </div>
              )}
              <p className={`${helperTextClass} mt-2`}>
                This JSON will be sent to every endpoint using {method}.
              </p>
            </div>
          )}

          {/* Quick Tips */}
          <div className={`border rounded-2xl overflow-hidden ${isDark ? "border-gray-800" : "border-gray-200"}`}>
            <div className={`px-4 py-3 border-b ${isDark ? "bg-white/5 border-gray-800" : "bg-gray-50 border-gray-200"}`}>
              <div className={`text-sm font-medium ${isDark ? "text-white" : "text-gray-900"}`}>Quick tips</div>
              <div className={`${isDark ? "text-gray-400" : "text-gray-600"} text-xs mt-1`}>
                • PUT/PATCH require a JSON body
                <br />
                • Provide full URL paths (e.g., /api/users)
                <br />
                • Authentication uses your current session
              </div>
            </div>
            <div className={`p-4 text-sm space-y-2 ${isDark ? "text-gray-300" : "text-gray-700"}`}>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded-md text-xs border ${isDark ? "bg-blue-500/10 border-blue-500/20 text-blue-300" : "bg-blue-50 border-blue-200 text-blue-700"}`}>
                  TIP
                </span>
                <span className={isDark ? "text-gray-400" : "text-gray-600"}>Click run to execute all endpoints in parallel.</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded-md text-xs border ${isDark ? "bg-green-500/10 border-green-500/20 text-green-300" : "bg-green-50 border-green-200 text-green-700"}`}>
                  FYI
                </span>
                <span className={isDark ? "text-gray-400" : "text-gray-600"}>Results include per-endpoint status and durations.</span>
              </div>
            </div>
          </div>

          {/* Results UI */}
          {result && (
            <div className={`border rounded-2xl overflow-hidden ${isDark ? "border-gray-800" : "border-gray-200"}`}>
              {/* Summary */}
              <div className={`px-4 py-3 border-b ${isDark ? "bg-white/5 border-gray-800" : "bg-gray-50 border-gray-200"}`}>
                <TestResultsSummary
                  total={result.summary.total}
                  passed={result.summary.passed}
                  failed={result.summary.failed}
                  durationMs={result.summary.durationMs}
                />

                {result.runnerError && (
                  <div className={`mt-3 text-xs rounded-xl px-3 py-2 whitespace-pre-wrap break-words ${
                    isDark ? "text-red-300 bg-red-500/10 border border-red-500/20" : "text-red-700 bg-red-50 border border-red-200"
                  }`}>
                    Runner Error: {result.runnerError}
                  </div>
                )}
              </div>

              {/* Tests */}
              <div className={`max-h-[260px] overflow-auto divide-y ${isDark ? "divide-gray-800" : "divide-gray-200"}`}>
                {result.tests.map((t, i) => (
                  <TestResultCompact
                    key={`${t.title}-${i}`}
                    title={t.title}
                    status={t.status === "failed" ? "failed" : "passed"}
                    durationMs={t.durationMs}
                    error={t.error || undefined}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sticky footer */}
        <div className={`px-5 py-4 border-t flex justify-end gap-3 ${isDark ? "border-gray-800" : "border-gray-200"}`}>
          <button
            onClick={onClose}
            disabled={isRunning}
            className={`px-4 py-2 rounded-xl border transition-colors ${
              isDark
                ? "text-gray-300 border-gray-800 hover:bg-white/5"
                : "text-gray-700 border-gray-300 hover:bg-gray-100"
            } ${isRunning ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            Close
          </button>
          <button
            disabled={!canRun}
            onClick={runApiTests}
            className="
              inline-flex items-center gap-2
              px-5 py-2 rounded-xl
              bg-blue-600 hover:bg-blue-400 text-white
              disabled:opacity-50 disabled:cursor-not-allowed
            "
            title={
              !canRun
                ? "Enter Base URL + endpoints (and valid JSON body if needed)"
                : ""
            }
          >
            {isRunning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Running…
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Run
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
