import { useMemo, useState } from "react";
import { X, Play, Loader2, Plus, HelpCircle, Sparkles } from "lucide-react";
import { toast } from "react-toastify";
import { TestResultCompact, TestResultsSummary } from "./ui/TestResultItem";
import { IconButton, DeleteButton } from "./ui/IconButton";
import { normalizeBaseUrl, normalizePath } from "../utils/formatters";
import { useTheme } from "../context/ThemeContext";

/**
 * UI Testing Modal (fixed)
 * ✅ Stable ids for rows (dropdown bug fix)
 * ✅ Locks ALL inputs while running
 * ✅ Unlocks automatically after execution (finally)
 */

type StepType =
  | "goto"
  | "click"
  | "fill"
  | "press"
  | "waitFor"
  | "expectVisible"
  | "expectHidden"
  | "expectTextContains"
  | "expectUrlContains"
  | "expectTitleContains";

type UiStep = {
  id: string;
  type: StepType;
  path?: string;
  selector?: string;
  value?: string;
  key?: string;
  ms?: number;
};

type UiScenario = {
  id: string;
  name: string;
  startPath: string;
  steps: UiStep[];
};

type UiTestStatus =
  | "passed"
  | "failed"
  | "skipped"
  | "timedOut"
  | "interrupted"
  | "unknown";

type UiTestResult = {
  ok: boolean;
  summary: {
    total: number;
    passed: number;
    failed: number;
    durationMs: number;
  };
  tests: Array<{
    title: string;
    status: UiTestStatus;
    durationMs: number;
    error: string | null;
  }>;
  runnerError: string | null;
};

function makeId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return String(Date.now() + Math.random());
}

const STEP_TYPES: Array<{ value: StepType; label: string; hint: string }> = [
  { value: "goto", label: "goto", hint: "Navigate to a path (/login)" },
  { value: "click", label: "click", hint: "Click element by selector" },
  { value: "fill", label: "fill", hint: "Fill input by selector + value" },
  { value: "press", label: "press", hint: "Press key on element (Enter)" },
  { value: "waitFor", label: "waitFor", hint: "Wait for selector visible OR ms" },
  { value: "expectVisible", label: "expectVisible", hint: "Assert selector is visible" },
  { value: "expectHidden", label: "expectHidden", hint: "Assert selector is hidden" },
  { value: "expectTextContains", label: "expectTextContains", hint: "Assert selector text contains value" },
  { value: "expectUrlContains", label: "expectUrlContains", hint: "Assert current URL contains value" },
  { value: "expectTitleContains", label: "expectTitleContains", hint: "Assert page title contains value" },
];

function defaultScenario(): UiScenario {
  return {
    id: makeId(),
    name: "Login happy path",
    startPath: "/login",
    steps: [
      { id: makeId(), type: "fill", selector: "[data-testid=email]", value: "test@example.com" },
      { id: makeId(), type: "fill", selector: "[data-testid=password]", value: "Password123!" },
      { id: makeId(), type: "click", selector: "[data-testid=login-btn]" },
      { id: makeId(), type: "expectUrlContains", value: "/dashboard" },
    ],
  };
}

function defaultStep(type: StepType): UiStep {
  const id = makeId();
  if (type === "goto") return { id, type, path: "/" };
  if (type === "waitFor") return { id, type, ms: 800 };
  if (type === "press") return { id, type, selector: "input", key: "Enter" };
  if (type === "expectUrlContains") return { id, type, value: "/dashboard" };
  if (type === "expectTitleContains") return { id, type, value: "Dashboard" };
  if (type === "fill") return { id, type, selector: "input", value: "" };
  if (type === "expectTextContains") return { id, type, selector: "body", value: "" };
  return { id, type, selector: "text=Some text" };
}

function validateScenario(s: UiScenario): string | null {
  if (!s.name.trim()) return "Scenario name is required.";
  if (!s.startPath.trim()) return "Start path is required (e.g., /login).";

  for (let i = 0; i < s.steps.length; i++) {
    const step = s.steps[i];
    const idx = i + 1;

    switch (step.type) {
      case "goto":
        if (!step.path?.trim()) return `Step ${idx} (goto): path is required`;
        break;

      case "click":
      case "expectVisible":
      case "expectHidden":
        if (!step.selector?.trim()) return `Step ${idx} (${step.type}): selector is required`;
        break;

      case "fill":
        if (!step.selector?.trim()) return `Step ${idx} (fill): selector is required`;
        if (step.value === undefined) return `Step ${idx} (fill): value is required`;
        break;

      case "press":
        if (!step.selector?.trim()) return `Step ${idx} (press): selector is required`;
        if (!step.key?.trim()) return `Step ${idx} (press): key is required`;
        break;

      case "waitFor":
        if ((step.ms === null || step.ms === undefined) && !step.selector?.trim()) {
          return `Step ${idx} (waitFor): provide ms OR selector`;
        }
        break;

      case "expectTextContains":
        if (!step.selector?.trim()) return `Step ${idx} (expectTextContains): selector is required`;
        if (!step.value?.trim()) return `Step ${idx} (expectTextContains): value is required`;
        break;

      case "expectUrlContains":
      case "expectTitleContains":
        if (!step.value?.trim()) return `Step ${idx} (${step.type}): value is required`;
        break;
    }
  }

  return null;
}

function applyTypeChange(oldStep: UiStep, nextType: StepType): UiStep {
  const next: UiStep = { ...oldStep, type: nextType };
  const mutable = next as Partial<UiStep>;

  const needsSelector =
    nextType === "click" ||
    nextType === "fill" ||
    nextType === "press" ||
    nextType === "waitFor" ||
    nextType === "expectVisible" ||
    nextType === "expectHidden" ||
    nextType === "expectTextContains";

  const needsValue =
    nextType === "fill" ||
    nextType === "expectTextContains" ||
    nextType === "expectUrlContains" ||
    nextType === "expectTitleContains";

  const needsPath = nextType === "goto";
  const needsKey = nextType === "press";
  const needsMs = nextType === "waitFor";

  if (!needsSelector) delete mutable.selector;
  if (!needsValue) delete mutable.value;
  if (!needsPath) delete mutable.path;
  if (!needsKey) delete mutable.key;
  if (!needsMs) delete mutable.ms;

  if (nextType === "goto" && !next.path) next.path = "/";
  if (nextType === "press") {
    if (!next.selector) next.selector = "input";
    if (!next.key) next.key = "Enter";
  }
  if (nextType === "waitFor") {
    if (next.ms === undefined && !next.selector) next.ms = 800;
  }
  if (nextType === "fill") {
    if (!next.selector) next.selector = "input";
    if (next.value === undefined) next.value = "";
  }
  if (nextType === "expectUrlContains") {
    if (!next.value) next.value = "/";
  }
  if (nextType === "expectTitleContains") {
    if (next.value === undefined) next.value = "";
  }
  if (nextType === "expectTextContains") {
    if (!next.selector) next.selector = "body";
    if (!next.value) next.value = "";
  }
  if (nextType === "click" || nextType === "expectVisible" || nextType === "expectHidden") {
    if (!next.selector) next.selector = "text=Some text";
  }

  return next;
}

export default function UiTestingModal({
  isOpen,
  onClose,
  projectId,
}: {
  isOpen: boolean;
  onClose: () => void;
  projectId?: number | null;
}) {
  const [baseUrl, setBaseUrl] = useState("");
  const [scenarios, setScenarios] = useState<UiScenario[]>([defaultScenario()]);

  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<UiTestResult | null>(null);

  // AI generation state
  const [aiPrompt, setAiPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const cleanBaseUrl = normalizeBaseUrl(baseUrl);

  const { theme } = useTheme();
  const isDark = theme === "dark";
  const panelClass = isDark
    ? "bg-[#111827] border border-gray-800 text-white"
    : "bg-white border border-gray-200 text-gray-900";
  const labelClass = `text-sm ${isDark ? "text-gray-300" : "text-gray-700"}`;
  const helperTextClass = `text-xs ${isDark ? "text-gray-500" : "text-gray-600"}`;
  const inputEnabledClass = isDark
    ? "bg-[#0B0F19] border-gray-800 text-white"
    : "bg-white border-gray-300 text-gray-900";
  const inputDisabledClass = isDark
    ? "bg-[#0B0F19] border-gray-900 text-gray-500 cursor-not-allowed"
    : "bg-gray-100 border-gray-300 text-gray-500 cursor-not-allowed";
  const selectEnabledClass = isDark
    ? "bg-[#111827] border-gray-800 text-white"
    : "bg-white border-gray-300 text-gray-900";
  const selectDisabledClass = isDark
    ? "bg-[#0B0F19] border-gray-900 text-gray-500 cursor-not-allowed"
    : "bg-gray-100 border-gray-300 text-gray-500 cursor-not-allowed";
  const chipClass = `text-xs px-2 py-1 rounded-md border ${
    isDark ? "bg-white/5 border-gray-800 text-gray-300" : "bg-gray-100 border-gray-300 text-gray-700"
  }`;

  const uiSpec = useMemo(() => {
    return scenarios.map((s) => ({
      name: s.name.trim(),
      startPath: normalizePath(s.startPath),
      steps: s.steps.map((st) => ({
        type: st.type,
        path: st.path ? normalizePath(st.path) : undefined,
        selector: st.selector?.trim() || undefined,
        value: st.value ?? undefined,
        key: st.key?.trim() || undefined,
        ms: st.ms ?? undefined,
      })),
    }));
  }, [scenarios]);

  const validationError = useMemo(() => {
    if (!cleanBaseUrl) return "Base URL is required.";
    if (scenarios.length === 0) return "Add at least one scenario.";

    for (let i = 0; i < scenarios.length; i++) {
      const err = validateScenario(scenarios[i]);
      if (err) return `Scenario ${i + 1}: ${err}`;
    }
    return null;
  }, [cleanBaseUrl, scenarios]);

  const canRun = !validationError && !isRunning;

  // ✅ This controls locking everywhere
  const locked = isRunning;

  if (!isOpen) return null;

  const addScenario = () => {
    if (locked) return;
    setScenarios((prev) => [
      ...prev,
      {
        id: makeId(),
        name: `Scenario ${prev.length + 1}`,
        startPath: "/",
        steps: [{ id: makeId(), type: "expectVisible", selector: "body" }],
      },
    ]);
  };

  const deleteScenario = (scenarioId: string) => {
    if (locked) return;
    setScenarios((prev) => prev.filter((s) => s.id !== scenarioId));
  };

  const updateScenario = (scenarioId: string, patch: Partial<UiScenario>) => {
    if (locked) return;
    setScenarios((prev) =>
      prev.map((s) => (s.id === scenarioId ? { ...s, ...patch } : s))
    );
  };

  const addStep = (scenarioId: string) => {
    if (locked) return;
    setScenarios((prev) =>
      prev.map((s) =>
        s.id === scenarioId ? { ...s, steps: [...s.steps, defaultStep("click")] } : s
      )
    );
  };

  const deleteStep = (scenarioId: string, stepId: string) => {
    if (locked) return;
    setScenarios((prev) =>
      prev.map((s) =>
        s.id === scenarioId ? { ...s, steps: s.steps.filter((st) => st.id !== stepId) } : s
      )
    );
  };

  const updateStep = (scenarioId: string, stepId: string, patch: Partial<UiStep>) => {
    if (locked) return;
    setScenarios((prev) =>
      prev.map((s) => {
        if (s.id !== scenarioId) return s;
        const steps = s.steps.map((st) => (st.id === stepId ? { ...st, ...patch } : st));
        return { ...s, steps };
      })
    );
  };

  const changeStepType = (scenarioId: string, stepId: string, nextType: StepType) => {
    if (locked) return;
    setScenarios((prev) =>
      prev.map((s) => {
        if (s.id !== scenarioId) return s;
        const steps = s.steps.map((st) =>
          st.id === stepId ? applyTypeChange(st, nextType) : st
        );
        return { ...s, steps };
      })
    );
  };

  const generateSteps = async () => {
    if (!cleanBaseUrl) {
      toast.error("Enter the Base URL first so the AI can inspect the page.");
      return;
    }
    if (!aiPrompt.trim()) {
      toast.error("Describe the scenario you want to test.");
      return;
    }

    setIsGenerating(true);
    try {
      const res = await fetch("/api/ui/generate-steps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          baseUrl: cleanBaseUrl,
          startPath: "/",
          scenario: aiPrompt,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || "Failed to generate steps");
        return;
      }

      const generated: UiScenario[] = (data.scenarios || []).map((s: {
        name?: string;
        startPath?: string;
        steps?: Array<{ type: string; selector?: string; value?: string; path?: string; key?: string; ms?: number }>;
      }) => ({
        id: makeId(),
        name: s.name || "Generated scenario",
        startPath: s.startPath || "/",
        steps: (s.steps || []).map((st) => {
          const step: UiStep = { id: makeId(), type: st.type as StepType };
          if (st.selector !== undefined) step.selector = st.selector;
          if (st.value !== undefined) step.value = st.value;
          if (st.path !== undefined) step.path = st.path;
          if (st.key !== undefined) step.key = st.key;
          if (st.ms !== undefined) step.ms = st.ms;
          return step;
        }),
      }));

      if (generated.length === 0) {
        toast.warning("AI did not generate any scenarios. Try rephrasing your description.");
        return;
      }

      setScenarios(generated);
      const totalSteps = generated.reduce((n, s) => n + s.steps.length, 0);
      toast.success(`Generated ${generated.length} scenario${generated.length > 1 ? "s" : ""} with ${totalSteps} steps — review and run!`);
    } catch {
      toast.error("Network error while generating steps");
    } finally {
      setIsGenerating(false);
    }
  };

  const runUiTests = async () => {
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setIsRunning(true);     // ✅ lock inputs
    setResult(null);

    try {
      const res = await fetch("/api/ui/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          baseUrl: cleanBaseUrl,
          uiSpec,
          project_id: projectId,
          function_name: `UI Test: ${cleanBaseUrl}`,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || "Failed to run UI tests");
        return;
      }

      setResult(data as UiTestResult);
    } catch {
      toast.error("Network error while running tests");
    } finally {
      setIsRunning(false);  // ✅ unlock inputs
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 px-4"
      onMouseDown={locked ? undefined : onClose}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className={`
          w-full max-w-3xl
          max-h-[85vh]
          rounded-2xl
          shadow-2xl
          flex flex-col
          ${panelClass}
        `}
      >
        {/* Header */}
        <div className={`flex justify-between items-center px-5 py-4 border-b ${isDark ? "border-gray-800" : "border-gray-200"}`}>
          <div className="flex items-center gap-3">
            <h2 className={`text-lg font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>UI Testing</h2>
            <span className={chipClass}>
              Playwright (E2E)
            </span>

            <a
              href="/ui-testing-guide.html"
              target="_blank"
              rel="noopener noreferrer"
              title="Open documentation"
              className={`p-1.5 rounded-lg transition-colors ${
                isDark
                  ? "text-gray-400 hover:text-blue-400 hover:bg-blue-500/10"
                  : "text-gray-600 hover:text-blue-600 hover:bg-blue-50"
              }`}
            >
              <HelpCircle className="w-5 h-5" />
            </a>

            {locked && (
              <span className={`text-xs px-2 py-1 rounded-md border ${
                isDark ? "bg-yellow-500/10 border-yellow-500/20 text-yellow-300" : "bg-yellow-50 border-yellow-200 text-yellow-700"
              }`}>
                Running… inputs locked
              </span>
            )}
          </div>

          <IconButton
            icon={X}
            variant="ghost"
            size="md"
            onClick={onClose}
            disabled={locked}
            tooltip={locked ? "Wait for run to finish" : "Close"}
          />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Base URL */}
          <div>
            <label className={labelClass}>Base URL</label>
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              disabled={locked}
              className={`mt-2 w-full border rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500/40 ${
                locked ? inputDisabledClass : inputEnabledClass
              }`}
              placeholder="http://localhost:5173"
            />
            <p className={`${helperTextClass} mt-2`}>
              Tip: Use your frontend URL (React dev server / deployed URL). No trailing slash.
            </p>
          </div>

          {/* AI Generate */}
          <div className={`rounded-2xl border p-4 ${isDark ? "border-indigo-500/30 bg-indigo-500/5" : "border-indigo-200 bg-indigo-50"}`}>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className={`w-4 h-4 ${isDark ? "text-indigo-400" : "text-indigo-600"}`} />
              <span className={`text-sm font-semibold ${isDark ? "text-indigo-300" : "text-indigo-700"}`}>
                AI Step Generator
              </span>
            </div>

            <p className={`text-xs mb-3 ${isDark ? "text-gray-400" : "text-gray-600"}`}>
              Describe the journey in plain English. AI will inspect the live page DOM and generate steps automatically.
            </p>

            <textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              disabled={locked || isGenerating}
              rows={3}
              className={`w-full border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/40 resize-none ${
                locked || isGenerating ? inputDisabledClass : inputEnabledClass
              }`}
              placeholder={`e.g. "User navigates to the login page, fills in email and password, clicks Sign In, and lands on the dashboard"`}
            />

            <div className="flex items-center justify-between mt-3">
              <p className={`text-xs ${isDark ? "text-gray-500" : "text-gray-500"}`}>
                Generated scenarios will replace the current ones.
              </p>
              <button
                onClick={generateSteps}
                disabled={locked || isGenerating || !aiPrompt.trim()}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                  locked || isGenerating || !aiPrompt.trim()
                    ? "opacity-50 cursor-not-allowed bg-indigo-600 text-white"
                    : "bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer"
                }`}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate Steps
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Scenarios header */}
          <div className="flex items-center justify-between">
            <div>
              <div className={`text-sm font-medium ${isDark ? "text-white" : "text-gray-900"}`}>Scenarios</div>
              <div className={`${helperTextClass} mt-1`}>
                Use stable selectors like <span className={isDark ? "text-gray-300" : "text-gray-800"}>data-testid</span>.
              </div>
            </div>

            <button
              onClick={addScenario}
              disabled={locked}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border ${
                locked
                  ? `${isDark ? "border-gray-900 text-gray-500" : "border-gray-300 text-gray-500"} opacity-50 cursor-not-allowed`
                  : `${isDark ? "border-gray-800 text-gray-200 hover:bg-white/5" : "border-gray-300 text-gray-700 hover:bg-gray-100"}`
              }`}
            >
              <Plus className="w-4 h-4" />
              Add scenario
            </button>
          </div>

          {/* Validation error */}
          {validationError && (
            <div className={`text-xs rounded-xl px-3 py-2 whitespace-pre-wrap ${
              isDark ? "text-red-300 bg-red-500/10 border border-red-500/20" : "text-red-700 bg-red-50 border border-red-200"
            }`}>
              • {validationError}
            </div>
          )}

          {/* Scenarios list */}
          <div className="space-y-4">
            {scenarios.map((s) => (
              <div key={s.id} className={`border rounded-2xl overflow-hidden ${isDark ? "border-gray-800" : "border-gray-200"}`}>
                {/* Scenario header */}
                <div className={`px-4 py-3 flex items-start justify-between gap-3 border-b ${
                  isDark ? "bg-white/5 border-gray-800" : "bg-gray-50 border-gray-200"
                }`}>
                  <div className="flex-1 min-w-0">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="md:col-span-2">
                        <label className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>Scenario name</label>
                        <input
                          value={s.name}
                          onChange={(e) => updateScenario(s.id, { name: e.target.value })}
                          disabled={locked}
                          className={`mt-1 w-full border rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/40 ${
                            locked ? inputDisabledClass : inputEnabledClass
                          }`}
                        />
                      </div>

                      <div>
                        <label className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>Start path</label>
                        <input
                          value={s.startPath}
                          onChange={(e) => updateScenario(s.id, { startPath: e.target.value })}
                          disabled={locked}
                          className={`mt-1 w-full border rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/40 ${
                            locked ? inputDisabledClass : inputEnabledClass
                          }`}
                        />
                      </div>
                    </div>
                  </div>

                  <DeleteButton
                    onClick={() => deleteScenario(s.id)}
                    disabled={locked}
                    size="md"
                  />
                </div>

                {/* Steps */}
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className={`text-sm font-medium ${isDark ? "text-white" : "text-gray-900"}`}>Steps</div>
                    <button
                      onClick={() => addStep(s.id)}
                      disabled={locked}
                      className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border ${
                        locked
                          ? `${isDark ? "border-gray-900 text-gray-500" : "border-gray-300 text-gray-500"} opacity-50 cursor-not-allowed`
                          : `${isDark ? "border-gray-800 text-gray-200 hover:bg-white/5" : "border-gray-300 text-gray-700 hover:bg-gray-100"}`
                      }`}
                    >
                      <Plus className="w-4 h-4" />
                      Add step
                    </button>
                  </div>

                  <div className="space-y-3">
                    {s.steps.map((st, idx) => {
                      const typeMeta = STEP_TYPES.find((x) => x.value === st.type);

                      const needsSelector =
                        st.type === "click" ||
                        st.type === "fill" ||
                        st.type === "press" ||
                        st.type === "waitFor" ||
                        st.type === "expectVisible" ||
                        st.type === "expectHidden" ||
                        st.type === "expectTextContains";

                      const selectorOptionalForWait = st.type === "waitFor" && st.ms !== undefined;

                      const needsValue =
                        st.type === "fill" ||
                        st.type === "expectTextContains" ||
                        st.type === "expectUrlContains" ||
                        st.type === "expectTitleContains";

                      const needsPath = st.type === "goto";
                      const needsKey = st.type === "press";
                      const needsMs = st.type === "waitFor";

                      return (
                        <div key={st.id} className={`rounded-2xl border p-3 ${isDark ? "border-gray-800 bg-[#0B0F19]" : "border-gray-200 bg-white"}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                                {/* type */}
                                <div className="md:col-span-1">
                                  <label className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>Type</label>
                                  <select
                                    value={st.type}
                                    disabled={locked}
                                    onChange={(e) =>
                                      changeStepType(s.id, st.id, e.target.value as StepType)
                                    }
                                    className={`mt-1 w-full border rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/40 ${
                                      locked ? selectDisabledClass : selectEnabledClass
                                    }`}
                                  >
                                    {STEP_TYPES.map((t) => (
                                      <option key={t.value} value={t.value}>
                                        {t.label}
                                      </option>
                                    ))}
                                  </select>

                                  {typeMeta?.hint && (
                                    <div className={`mt-1 text-[11px] ${isDark ? "text-gray-500" : "text-gray-600"}`}>{typeMeta.hint}</div>
                                  )}
                                </div>

                                {/* selector */}
                                <div className="md:col-span-2">
                                  <label className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                                    Selector{needsSelector && !selectorOptionalForWait ? " *" : ""}
                                  </label>

                                  <input
                                    value={st.selector ?? ""}
                                    onChange={(e) => updateStep(s.id, st.id, { selector: e.target.value })}
                                    disabled={locked || !needsSelector}
                                    className={`mt-1 w-full border rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/40 ${
                                      locked || !needsSelector
                                        ? inputDisabledClass
                                        : inputEnabledClass
                                    }`}
                                    placeholder={needsSelector ? `[data-testid=login-btn]` : "Not required"}
                                  />

                                  {st.type === "waitFor" && (
                                    <div className={`mt-1 text-[11px] ${isDark ? "text-gray-500" : "text-gray-600"}`}>
                                      Provide selector OR ms below.
                                    </div>
                                  )}
                                </div>

                                {/* value / path / key / ms */}
                                <div className="md:col-span-2">
                                  {needsPath ? (
                                    <>
                                      <label className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>Path *</label>
                                      <input
                                        value={st.path ?? ""}
                                        onChange={(e) => updateStep(s.id, st.id, { path: e.target.value })}
                                        disabled={locked}
                                        className={`mt-1 w-full border rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/40 ${
                                          locked ? inputDisabledClass : inputEnabledClass
                                        }`}
                                        placeholder="/dashboard"
                                      />
                                    </>
                                  ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                      <div>
                                        <label className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                                          Value{needsValue ? " *" : ""}
                                        </label>
                                        <input
                                          value={st.value ?? ""}
                                          onChange={(e) => updateStep(s.id, st.id, { value: e.target.value })}
                                          disabled={locked || !needsValue}
                                          className={`mt-1 w-full border rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/40 ${
                                            locked || !needsValue
                                              ? inputDisabledClass
                                              : inputEnabledClass
                                          }`}
                                          placeholder="—"
                                        />
                                      </div>

                                      <div>
                                        <label className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                                          {needsKey ? "Key *" : needsMs ? "Wait ms" : "Extra"}
                                        </label>

                                        {needsKey ? (
                                          <input
                                            value={st.key ?? ""}
                                            onChange={(e) => updateStep(s.id, st.id, { key: e.target.value })}
                                            disabled={locked}
                                            className={`mt-1 w-full border rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/40 ${
                                              locked ? inputDisabledClass : inputEnabledClass
                                            }`}
                                            placeholder="Enter"
                                          />
                                        ) : needsMs ? (
                                          <input
                                            type="number"
                                            value={st.ms ?? ""}
                                            onChange={(e) =>
                                              updateStep(s.id, st.id, { ms: e.target.value ? Number(e.target.value) : undefined })
                                            }
                                            disabled={locked}
                                            className={`mt-1 w-full border rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/40 ${
                                              locked ? inputDisabledClass : inputEnabledClass
                                            }`}
                                            placeholder="800"
                                          />
                                        ) : (
                                          <input
                                            disabled
                                            value=""
                                            className={`mt-1 w-full rounded-xl px-3 py-2 cursor-not-allowed ${isDark ? "bg-[#0B0F19] border border-gray-900 text-gray-600" : "bg-gray-100 border border-gray-300 text-gray-500"}`}
                                            placeholder="—"
                                          />
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className={`mt-2 text-[11px] ${isDark ? "text-gray-500" : "text-gray-600"}`}>
                                Step {idx + 1}: <span className={isDark ? "text-gray-300" : "text-gray-800"}>{st.type}</span>
                              </div>
                            </div>

                            <DeleteButton
                              onClick={() => deleteStep(s.id, st.id)}
                              disabled={locked}
                              size="sm"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Results */}
          {result && (
            <div className={`border rounded-2xl overflow-hidden ${isDark ? "border-gray-800" : "border-gray-200"}`}>
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

              <div className={`max-h-[260px] overflow-auto divide-y ${isDark ? "divide-gray-800" : "divide-gray-200"}`}>
                {result.tests.map((t, i) => (
                  <TestResultCompact
                    key={`${t.title}-${i}`}
                    title={t.title}
                    status={t.status === 'failed' ? 'failed' : 'passed'}
                    durationMs={t.durationMs}
                    error={t.error || undefined}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`px-5 py-4 border-t flex justify-between items-center gap-3 ${isDark ? "border-gray-800" : "border-gray-200"}`}>
          <div className={`text-xs ${isDark ? "text-gray-500" : "text-gray-600"}`}>
            Recommended selector: <span className={isDark ? "text-gray-300" : "text-gray-800"}>[data-testid=...]</span>
          </div>

          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              disabled={locked}
              className={`px-4 py-2 rounded-xl border ${
                locked
                  ? `${isDark ? "text-gray-500 border-gray-800" : "text-gray-500 border-gray-300"} opacity-50 cursor-not-allowed`
                  : `${isDark ? "text-gray-300 border-gray-800 hover:bg-white/5" : "text-gray-700 border-gray-300 hover:bg-gray-100"}`
              }`}
            >
              Close
            </button>

            <button
              disabled={!canRun}
              onClick={runUiTests}
              className="
                inline-flex items-center gap-2
                px-5 py-2 rounded-xl
                bg-blue-600 hover:bg-blue-500 text-white
                disabled:opacity-50 disabled:cursor-not-allowed
              "
              title={!canRun ? validationError || "Fix inputs to run UI tests" : ""}
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
    </div>
  );
}
