import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";
import { Loader2, CheckCircle2 } from "lucide-react";
import { toast, Toaster } from "react-hot-toast";

import { setTokensUsed } from "../utils/tokenTracker";
import { subtractFromBudget } from "../utils/tokenBudget";

const EXECUTION_STEPS = [
  { id: 1, label: "Preparing environment", minTime: 800 },
  { id: 2, label: "Writing test files", minTime: 800 },
  { id: 3, label: "Running tests", minTime: 0 }, // Will wait for API
  { id: 4, label: "Collecting results", minTime: 600 },
];

type TestStatus = "passed" | "failed";

type TestResultItem = {
  id: string;
  name: string;
  status: TestStatus;
  duration: number;
  description: string;
  code: string;
  error: string | null;        // full traceback block
  errorSummary: string | null; // human-readable headline (E-lines only)
  message?: string;
};

type DockerTestSummary = {
  passed?: number;
  failed?: number;
  failures?: string[];
  // Rich per-test array returned by JS/TS executor
  tests?: {
    name: string;
    status: "passed" | "failed";
    duration?: number;
    description?: string;
    error?: string | null;
  }[];
};

type DockerData = {
  output?: string;
  errors?: string;
  exit_code?: number;
  test_results_json?: DockerTestSummary;
};

type ResultsPayload = {
  generatedTests: TestResultItem[];
  passedCount: number;
  failedCount: number;
  executionTime: number;
  dockerExecution?: boolean;
  rawOutput?: string;
  rawErrors?: string;
};

type LoadingState = {
  requestId?: string;
  sourceCode?: string;
  testCode?: string;
  language?: string;
  functionName?: string;
  config?: { framework?: string; project_id?: number };
  queueItemId?: number;
  testCases?: unknown[];
  testType?: "unit" | "integration";
  selectedSecrets?: string[];
  projectId?: number;
  requirements?: string;
  customDeps?: string;
  testedFile?: string;
};

export default function TestExecution() {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme } = useTheme();
  const [currentStep, setCurrentStep] = useState(0);
  const [isComplete, setIsComplete] = useState(false);

  // Track API state to coordinate animation
  const [apiStatus, setApiStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const apiResponseRef = useRef<ResultsPayload | null>(null);
  const hasStartedRef = useRef(false);

  // Get data passed from Preview
  const {
    requestId,
    sourceCode,
    testCode,
    language,
    functionName,
    config,
    queueItemId,
    testCases,
    testType,
    selectedSecrets,
    projectId,
    requirements,
    customDeps,
    testedFile,
  } = (location.state as LoadingState) || {};

  // 1. Start API Call on Mount
  useEffect(() => {
    if (!sourceCode || !testCode) {
      toast.error("Missing execution data");
      navigate("/preview");
      return;
    }

    // Prevent double execution in React StrictMode
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    // Extract execution time from pytest output
    const extractExecutionTime = (output: string): number => {
      const match = String(output || "").match(/([\d.]+)s/);
      return match ? parseFloat(match[1]) * 1000 : 0;
    };

    // Extract test results from pytest output
    // Parse pytest FAILURES section: returns map of test name -> {summary, traceback}.
    // summary = human-readable "E   ..." assertion lines only.
    // traceback = full pytest failure block.
    type FailureDetail = { summary: string; traceback: string };
    const extractFailureDetails = (output: string): Map<string, FailureDetail> => {
      const failureMap = new Map<string, FailureDetail>();
      const lines = output.split("\n");
      let currentTest: string | null = null;
      const blockLines: string[] = [];

      const flush = () => {
        if (currentTest && blockLines.length > 0) {
          const traceback = blockLines.join("\n").trim();
          // Extract lines starting with "E " — these are the assertion error messages
          const eLines = blockLines
            .filter(l => /^E\s+/.test(l))
            .map(l => l.replace(/^E\s+/, "").trim())
            .filter(Boolean);
          const summary = eLines.length > 0
            ? eLines.join("\n")
            : traceback.split("\n").slice(-2).join(" ").trim(); // last 2 lines as fallback
          failureMap.set(currentTest, { summary, traceback });
        }
        blockLines.length = 0;
      };

      for (const line of lines) {
        // Separator line: "___ test_foo_bar ___" (5+ underscores on each side)
        const sep = line.match(/^_{5,}\s+(test_\w+)\s+_{5,}\s*$/);
        if (sep) {
          flush();
          currentTest = sep[1];
          continue;
        }
        // Stop collecting at the next "====" section divider
        if (currentTest && /^={5,}/.test(line)) {
          flush();
          currentTest = null;
          continue;
        }
        if (currentTest) {
          blockLines.push(line);
        }
      }
      flush();
      return failureMap;
    };

    const parsePytestOutput = (output: string, dockerData: DockerData) => {
      const tests: TestResultItem[] = [];
      const lines = String(output || "").split("\n");
      const failureDetails = extractFailureDetails(output);

      for (const line of lines) {
        let match = line.match(
          /(?:test\.py|test_\w+\.py)::(?:\w+::)?(test_\w+)\s+(PASSED|FAILED|ERROR)/i
        );

        if (!match) match = line.match(/(test_\w+)\s+(PASSED|FAILED|ERROR)/i);

        if (!match) {
          const tick = line.match(/[✓✗]\s+(test_\w+)/);
          if (tick) {
            const status = line.includes("✓") ? "PASSED" : "FAILED";
            match = [line, tick[1], status];
          }
        }

        if (match) {
          const name = match[1];
          const status = match[2];
          const upper = status.toUpperCase();

          let error: string | null = null;
          let errorSummary: string | null = null;
          if (upper === "ERROR" || upper === "FAILED") {
            const detail = failureDetails.get(name);
            error = detail?.traceback ?? "Test failed — see terminal output for details.";
            errorSummary = detail?.summary ?? null;
          }

          tests.push({
            id: `test-${tests.length}`,
            name,
            status: upper === "PASSED" ? "passed" : "failed",
            duration: 0,
            description: name.replace(/test_/, "").replace(/_/g, " "),
            code: "",
            error,
            errorSummary,
          });
        }
      }

      // Summary fallback: "5 passed, 2 failed in 0.23s"
      const summaryMatch = String(output || "").match(/(\d+)\s+passed(?:,\s*(\d+)\s+failed)?/i);

      if (tests.length === 0 && summaryMatch) {
        const passedCount = parseInt(summaryMatch[1] || "0");
        const failedCount = parseInt(summaryMatch[2] || "0");

        for (let i = 0; i < passedCount; i++) {
          tests.push({
            id: `test-passed-${i}`,
            name: `Test ${i + 1}`,
            status: "passed",
            duration: 0,
            description: "Test passed",
            code: "",
            error: null,
            errorSummary: null,
          });
        }

        for (let i = 0; i < failedCount; i++) {
          tests.push({
            id: `test-failed-${i}`,
            name: `Test ${passedCount + i + 1}`,
            status: "failed",
            duration: 0,
            description: "Test failed",
            code: "",
            error: output || "Test execution failed",
            errorSummary: "Test failed — see terminal output for full details.",
          });
        }
      }

      // Absolute fallback
      if (tests.length === 0) {
        const collectionErrorMatch = String(output || "").match(/collected 0 items \/ (\d+) error/);

        if (collectionErrorMatch || dockerData?.exit_code === 2) {
          tests.push({
            id: "test-error-0",
            name: "Code Syntax/Import Error",
            status: "failed",
            duration: 0,
            description: "Failed to load test file (NameError, SyntaxError, etc.)",
            code: "",
            error: output ? String(output) : "",
            errorSummary: "Collection error — test file could not be imported. Check for syntax errors or missing imports.",
          });
        } else {
          const success = dockerData?.exit_code === 0;
          const errorText = dockerData?.errors ?? dockerData?.output ?? null;
          tests.push({
            id: "test-fallback-0",
            name: success ? "All tests passed" : "Tests failed",
            status: success ? "passed" : "failed",
            duration: 0,
            description: "Docker execution completed",
            code: "",
            error: success ? null : (errorText ? String(errorText) : "Test execution failed"),
            errorSummary: success ? null : "Test execution failed — see terminal output for details.",
          });
        }
      }

      return tests;
    };

    // Parse Docker executor results into format expected by Results page
    const parseDockerResults = (dockerData: DockerData): ResultsPayload => {

      // Prefer structured JSON results if available
      if (dockerData?.test_results_json) {
        const summary = dockerData.test_results_json;

        // ── Rich per-test path (JS / TS executor returns a `tests` array) ──
        if (summary?.tests && summary.tests.length > 0) {
          const tests: TestResultItem[] = summary.tests.map((t, i) => ({
            id: `test-${i}-${t.name}`,
            name: t.name,
            status: t.status,
            duration: t.duration ?? 0,
            description: t.description || t.name,
            code: "",
            error: t.error ?? null,
            errorSummary: t.error ? (t.error.split("\n")[0] || t.error) : null,
          }));
          return {
            generatedTests: tests,
            passedCount: tests.filter((t) => t.status === "passed").length,
            failedCount: tests.filter((t) => t.status === "failed").length,
            executionTime: extractExecutionTime(dockerData.output || ""),
            dockerExecution: true,
            rawOutput: dockerData.output,
            rawErrors: dockerData.errors,
          };
        }

        // ── Legacy path (Java / Surefire): summary counts + failures list ──
        const tests: TestResultItem[] = (summary?.failures || []).map((msg: string) => ({
          id: `test-failed-${msg}`,
          name: msg.split(":")[0] || "Unknown Test",
          status: "failed",
          duration: 0,
          description: "Test failed",
          code: "",
          error: msg,
          errorSummary: msg.split("\n")[0] || msg,
          message: msg,
        }));

        const passedCount = Number(summary?.passed || 0);
        for (let i = 0; i < passedCount; i++) {
          tests.push({
            id: `test-passed-${i}`,
            name: `Test ${i + 1}`,
            status: "passed",
            duration: 0,
            description: "Test passed",
            code: "",
            error: null,
            errorSummary: null,
          });
        }

        return {
          generatedTests: tests,
          passedCount,
          failedCount: Number(summary?.failed || 0),
          executionTime: extractExecutionTime(dockerData.output || ""),
          dockerExecution: true,
          rawOutput: dockerData.output,
          rawErrors: dockerData.errors,
        };
      }

      const tests = parsePytestOutput(dockerData?.output || "", dockerData);

      return {
        generatedTests: tests,
          passedCount: tests.filter((t) => t.status === "passed").length,
          failedCount: tests.filter((t) => t.status === "failed").length,
        executionTime: extractExecutionTime(dockerData?.output || ""),
        dockerExecution: true,
        rawOutput: dockerData?.output,
        rawErrors: dockerData?.errors,
      };
    };

    const runTests = async () => {
      setApiStatus("pending");
      try {
        // Always execute in Docker — unit tests use mode: "unit", integration use mode: "integration"
        const requestBody = {
          test_code: testCode,
          source_code: sourceCode,
          language: language || "python",
          project_id: projectId || config?.project_id,
          request_id: requestId,
          function_name: functionName,
          requirements: requirements,
          custom_deps: customDeps,
          config: {
            mode: testType === "integration" ? "integration" : "unit",
            secrets: selectedSecrets || [],
          },
        };

        const response = await fetch("/api/execute-tests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) throw new Error("Test execution failed");

        const data = await response.json();

        // ✅ Store *latest* tokens for this call (NOT cumulative)
        if (data?.tokensUsed) {
          const used = Number(data.tokensUsed.total_tokens ?? 0);

          setTokensUsed({
            prompt_tokens: data.tokensUsed.prompt_tokens ?? 0,
            completion_tokens: data.tokensUsed.completion_tokens ?? 0,
            total_tokens: used,
          });

          // ✅ subtract from budget
          subtractFromBudget(used);
        }

        // Parse Docker results for both unit and integration tests
        apiResponseRef.current = parseDockerResults(data);

        setApiStatus("success");

        // Update queue item status if this test came from queue
        if (queueItemId) {
          try {
            const executionLogId =
              data.execution_log_id || data.executionLogId || data.results?.execution_log_id;

            const newStatus = "running"; // backend handles auto-transition

            await fetch(`/api/test-items/${queueItemId}/status`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                status: newStatus,
                execution_log_id: executionLogId,
                tested_file: testedFile,
              }),
            });

          } catch {
            void 0;
          }
        }
      } catch {
        setApiStatus("error");
        toast.error("Failed to run tests. Please try again.");
        navigate("/preview");
      }
    };

    runTests();
  }, [
    sourceCode,
    testCode,
    language,
    navigate,
    requestId,
    testType,
    projectId,
    config,
    functionName,
    selectedSecrets,
    requirements,
    customDeps,
    queueItemId,
    testedFile,
  ]);

  // 2. Smart Step Progression Logic
  useEffect(() => {
    if (isComplete) return;

    const step = EXECUTION_STEPS[currentStep];

    let canAdvance = true;

    // RULE: If we are at "Running tests" (Index 2), we MUST wait for API success
    if (currentStep === 2 && apiStatus !== "success") {
      canAdvance = false;
    }

    if (canAdvance) {
      const timer = setTimeout(() => {
        if (currentStep < EXECUTION_STEPS.length - 1) {
          setCurrentStep((prev) => prev + 1);
        } else {
          setIsComplete(true);
        }
      }, step.minTime);

      return () => clearTimeout(timer);
    }
  }, [currentStep, apiStatus, isComplete]);

  // 3. Navigation on Completion
  useEffect(() => {
    if (isComplete && apiResponseRef.current) {
      const timer = setTimeout(() => {
        navigate("/results", {
          state: {
            session: {
              ...apiResponseRef.current,
              language: language,
              functionName: functionName || "function",
              framework: config?.framework,
              config: config,
              originalTestCases: testCases,
              projectId: projectId,
            },
          },
        });
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [isComplete, navigate, language, functionName, config, testCases, projectId]);

  const calculatedProgress = Math.round((currentStep / EXECUTION_STEPS.length) * 100);

  const progress = isComplete
    ? 100
    : currentStep === 2 && apiStatus !== "success"
    ? 60
    : calculatedProgress;

  const isDark = theme === "dark";
  const containerClasses = isDark
    ? "min-h-screen bg-[#0B0F19] text-white"
    : "min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 text-gray-900";
  const panelClasses = isDark
    ? "backdrop-blur-xl bg-white/5 border border-white/10 text-white"
    : "bg-white border border-gray-300 shadow-xl text-gray-900";

  return (
    <div className={`${containerClasses} flex items-center justify-center relative overflow-hidden font-sans`}>
      <style>{`
        @keyframes fill-width { from { width: 0%; } to { width: 100%; } }
        .animate-fill {
          animation-name: fill-width;
          animation-timing-function: linear;
          animation-fill-mode: forwards;
        }
        @keyframes pulse-bar { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        .animate-pulse-bar {
          animation: pulse-bar 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
      `}</style>

      {/* Background Effects */}
      <div className="absolute inset-0 pointer-events-none">
        <div className={`absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-3xl animate-pulse ${isDark ? "bg-indigo-500/20" : "bg-indigo-400/10"}`} />
        <div className={`absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full blur-3xl animate-pulse delay-700 ${isDark ? "bg-cyan-500/20" : "bg-cyan-400/10"}`} />
        <div
          className="absolute inset-0 opacity-30"
          style={{
            background:
              isDark
                ? "linear-gradient(90deg, transparent, rgba(99, 102, 241, 0.1), transparent)"
                : "linear-gradient(90deg, transparent, rgba(59, 130, 246, 0.08), transparent)",
            backgroundSize: "200% 100%",
          }}
        />
      </div>

      <div className="relative z-10 max-w-2xl w-full mx-auto px-6">
        <div className="text-center mb-12">
          <div
            className={`w-20 h-20 mx-auto mb-6 rounded-2xl flex items-center justify-center transition-all duration-500 ${
              isComplete
                ? "bg-gradient-to-br from-emerald-500 to-teal-500 shadow-[0_0_40px_rgba(16,185,129,0.4)]"
                : "bg-gradient-to-br from-indigo-500 to-cyan-500 shadow-[0_0_40px_rgba(99,102,241,0.4)]"
            }`}
          >
            {isComplete ? (
              <CheckCircle2 className="w-10 h-10 text-white" />
            ) : (
              <Loader2 className="w-10 h-10 text-white animate-spin" />
            )}
          </div>

          <h1 className={`text-4xl font-bold mb-3 bg-gradient-to-r bg-clip-text text-transparent transition-all ${isDark ? "from-white via-indigo-200 to-cyan-200" : "from-indigo-600 via-blue-500 to-cyan-500"}`}>
            {isComplete ? "Execution Complete" : "Executing Tests"}
          </h1>
          <p className={`text-xl transition-all ${isDark ? "text-gray-400" : "text-gray-700"}`}>
            {isComplete ? "Finalizing report..." : "AI is running your test suite..."}
          </p>
        </div>

        <div className={`${panelClasses} rounded-2xl p-8 shadow-2xl transition-all duration-500`}>
          <div className="space-y-6">
            {EXECUTION_STEPS.map((step, index) => {
              const isFinished = index < currentStep || isComplete;
              const isCurrent = index === currentStep && !isComplete;
              const isWaiting = isCurrent && index === 2 && apiStatus !== "success";

              return (
                <div key={step.id} className="flex flex-col relative">
                  <div className="flex items-center gap-4 z-10">
                    <div className="relative">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-500 ${
                          isFinished
                            ? "bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-500/30 scale-100"
                            : isCurrent
                            ? "bg-gradient-to-br from-indigo-500 to-cyan-500 shadow-lg shadow-indigo-500/30 scale-110"
                            : isDark ? "bg-white/5 border-2 border-white/10" : "bg-gray-100 border-2 border-gray-300"
                        }`}
                      >
                        {isFinished ? (
                          <CheckCircle2 className="w-6 h-6 text-white" />
                        ) : isCurrent ? (
                          <Loader2 className="w-5 h-5 text-white animate-spin" />
                        ) : (
                          <span className={`text-sm font-medium ${isDark ? "text-gray-600" : "text-gray-500"}`}>{index + 1}</span>
                        )}
                      </div>

                      {index < EXECUTION_STEPS.length - 1 && (
                        <div className={`absolute top-10 left-1/2 -translate-x-1/2 w-0.5 h-6 overflow-hidden ${isDark ? "bg-white/10" : "bg-gray-300"}`}>
                          <div
                            className={`w-full h-full bg-emerald-500 transition-transform duration-500 ${
                              isFinished ? "translate-y-0" : "-translate-y-full"
                            }`}
                          />
                        </div>
                      )}
                    </div>

                    <div className="flex-1">
                      <div
                        className={`font-medium transition-colors duration-300 ${
                          isFinished
                            ? isDark ? "text-emerald-400" : "text-emerald-600"
                            : isCurrent
                            ? isDark ? "text-white" : "text-gray-900"
                            : isDark ? "text-gray-600" : "text-gray-500"
                        }`}
                      >
                        {step.label}
                      </div>

                      <div
                        className={`h-1 rounded-full mt-2 overflow-hidden transition-all duration-300 ${
                          isCurrent ? "opacity-100 max-w-full" : "opacity-0 max-w-0"
                        } ${isDark ? "bg-gray-800" : "bg-gray-200"}`}
                      >
                        {isCurrent && (
                          <div
                            className={`h-full bg-gradient-to-r from-indigo-500 to-cyan-500 ${
                              isWaiting ? "w-full animate-pulse-bar" : "animate-fill"
                            }`}
                            style={{
                              animationDuration: isWaiting ? "2s" : `${step.minTime}ms`,
                              width: isWaiting ? "100%" : undefined,
                            }}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className={`mt-8 pt-6 border-t ${isDark ? "border-white/10" : "border-gray-200"}`}>
            <div className="flex items-center justify-between text-sm mb-2">
              <span className={isDark ? "text-gray-400" : "text-gray-600"}>Overall Progress</span>
              <span className={`font-mono font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>{progress}%</span>
            </div>
            <div className={`h-2 rounded-full overflow-hidden ${isDark ? "bg-white/5" : "bg-gray-200"}`}>
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-cyan-500 transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        <div className={`mt-8 text-center transition-opacity duration-500 ${isComplete ? "opacity-100" : "opacity-0"}`}>
          <p className={`text-sm ${isDark ? "text-gray-500" : "text-gray-600"}`}>💡 Tip: Well-tested code is easier to maintain and refactor</p>
        </div>
      </div>

      <Toaster position="bottom-right" />
    </div>
  );
}
