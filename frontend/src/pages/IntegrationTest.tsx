import React, { useState } from "react";
import { CodeInput } from "../components/CodeInput";
import { ConfigPanel, type TestConfig } from "../components/ConfigPanel";
import { ArrowLeft, BookOpen, Lightbulb, Plus, X } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "react-toastify";
import { useTheme } from "../context/ThemeContext";
import { Button } from "../components/ui/Button";
import ThemeToggle from "../components/ThemeToggle";
import { usePersistedLocationState } from "../hooks/usePersistedLocationState";

import ApiTestingModal from "../components/ApiTestingModal";
import UiTestingModal from "../components/UiTestingModal"; // ✅ ADD THIS
import { SectionHeader } from "../components/ui/PageHeader";

interface CodeInputData {
  id: string;
  code: string;
  language: string;
  fileName: string;
}

const IntegrationTest: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const state = usePersistedLocationState<{
    projectId?: number;
    testType?: "unit" | "integration";
  }>('integrationTest') ?? (location.state as { projectId?: number; testType?: "unit" | "integration" } | null);
  const projectId = state?.projectId || null;
  const { colors, theme } = useTheme();
  const isDark = theme === 'dark';
  const [isLoading, setIsLoading] = useState(false);
  const [context] = useState("");

  const [config, setConfig] = useState<TestConfig>({
    framework: "",
    preset: "standard",
  });

  const [codeInputs, setCodeInputs] = useState<CodeInputData[]>([
    { id: "1", code: "", language: "", fileName: "" },
  ]);
  const [testName, setTestName] = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState("");

  // ✅ MODAL STATES
  const [isApiModalOpen, setIsApiModalOpen] = useState(false);
  const [isUiModalOpen, setIsUiModalOpen] = useState(false);

  // ✅ MANAGE CODE INPUTS
  const addCodeInput = () => {
    setCodeInputs(prev => {
      const newId = String(Math.max(0, ...prev.map(input => parseInt(input.id))) + 1);
      return [...prev, { id: newId, code: "", language: "", fileName: "" }];
    });
  };

  const removeCodeInput = (id: string) => {
    if (codeInputs.length === 1) {
      toast.error("You must have at least one code input.");
      return;
    }
    setCodeInputs(prev => prev.filter(input => input.id !== id));
  };

  const updateCodeInput = (id: string, field: keyof CodeInputData, value: string) => {
    setCodeInputs(prev => prev.map(input =>
      input.id === id ? { ...input, [field]: value } : input
    ));
  };

  const handleGenerate = async () => {
    if (!testName.trim()) {
      toast.error("Please enter a Test Name.");
      return;
    }

    // Validate that all code inputs have code
    const invalidInputs = codeInputs.filter(input => !input.code.trim());
    if (invalidInputs.length > 0) {
      toast.error("All source files must have code.");
      return;
    }

    // Validate all languages are selected
    const missingLanguages = codeInputs.filter(input => !input.language);
    if (missingLanguages.length > 0) {
      toast.error("Please select a language for all code inputs.");
      return;
    }

    const firstInput = codeInputs[0];
    const { language } = firstInput;

    // Use language-appropriate comment prefix (same logic as the CLI)
    const commentPrefix = (language === "javascript" || language === "typescript" || language === "java")
      ? "//"
      : "#";

    // Combine all files into a single code snippet for the LLM
    const combinedMessage = codeInputs
      .map(input => `${commentPrefix} File: ${input.fileName || `file_${input.id}`}\n${input.code}`)
      .join("\n\n");

    setIsLoading(true);
    try {
      const defaultFramework =
        language === "python"
          ? "pytest"
          : language === "java"
          ? "junit"
          : language === "typescript"
          ? "jest"
          : language === "javascript"
          ? "jest"
          : "pytest";

      // Prepare fields for backend
      const requirements = language === "python" ? config.requirements : undefined;
      const customDeps = language === "java" ? config.requirements : undefined;

      // Send all code inputs to backend
      const payload = {
        message: combinedMessage,
        context: context,
        project_id: projectId,
        functionName: testName,
        language: language,
        requirements: requirements,
        custom_deps: customDeps,
        code_files: codeInputs.map(input => ({
          code: input.code,
          language: input.language,
          fileName: input.fileName,
        })),
        config: {
          ...config,
          framework: config.framework || defaultFramework,
          requirements: undefined,
        },
      };

      const response = await fetch("/api/generate-tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        if (response.status === 401) {
          toast.error("Session expired. Please log in again.");
          navigate("/");
          return;
        }
        throw new Error("Failed to generate tests");
      }

      const data = await response.json();

      // Combine all file contents so TestPreview has the full context
      const combinedSourceCode = codeInputs
        .map(input => `${commentPrefix} File: ${input.fileName || `file_${input.id}`}\n${input.code}`)
        .join("\n\n");

      console.log("[IntegrationTest] Navigating to /preview with testData:", data.response);

      navigate("/preview", {
        state: {
          testData: data.response,
          sourceCode: combinedSourceCode,
          requestID: data.request_id,
          functionName: testName,
          config: data.config || config,
          testType: "integration",
          projectId: projectId,
          requirements: data.requirements,
          customDeps: data.custom_deps,
        },
      });
    } catch (err) {
      console.error("[IntegrationTest] handleGenerate error:", err);
      toast.error("Failed to generate tests. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToDashboard = () => {
    sessionStorage.removeItem("code");
    sessionStorage.removeItem("language");
    sessionStorage.removeItem("functionName");
    navigate("/dashboard", { state: { projectId } });
  };
  return (
    <div
      className="min-h-screen py-12 flex flex-col"
      style={{ background: colors.bgPrimary, color: colors.textPrimary }}
    >
      <div className="container mx-auto px-4 max-w-[1600px] flex flex-col h-full min-h-0">
        <div className="flex justify-between items-center mb-8">
          <Button onClick={handleBackToDashboard} variant="ghost" size="md">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
          <ThemeToggle />
        </div>

        <SectionHeader
          title="Integration Test Generator"
          description="Configure your testing environment, define the context, and generate comprehensive integration tests instantly."
          actions={
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setIsApiModalOpen(true)}
                className="
                  px-6 py-3
                  rounded-xl
                  text-blue-300
                  font-medium
                  bg-blue-500/10
                  border border-blue-500/30
                  hover:bg-blue-500/40
                  hover:text-blue-200
                  shadow-sm
                  transition-all duration-200
                  focus:outline-none focus:ring-2 focus:ring-blue-500/30
                  cursor-pointer
                "
              >
                🔌 API Testing
              </button>

              <button
                onClick={() => setIsUiModalOpen(true)}
                className="
                  px-6 py-3
                  rounded-xl
                  text-indigo-300
                  font-medium
                  bg-indigo-500/10
                  border border-indigo-500/30
                  hover:bg-indigo-500/40
                  hover:text-indigo-200
                  shadow-sm
                  transition-all duration-200
                  focus:outline-none focus:ring-2 focus:ring-indigo-500/30
                  cursor-pointer
                "
              >
                🖥️ UI Testing
              </button>
            </div>
          }
        />

        {/* GRID: Overview, Source Code, Configuration */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start flex-1 min-h-[60vh] md:min-h-[65vh] lg:min-h-[70vh]">
          {/* LEFT COLUMN */}
          <div className="lg:col-span-3 lg:sticky lg:top-6">
            <div
              className="p-6 rounded-xl border shadow-2xl flex flex-col"
              style={{ background: colors.bgCard, borderColor: colors.borderPrimary }}
            >
              <div className="flex items-center gap-2 mb-4 text-blue-400">
                <BookOpen className="w-5 h-5" />
                <h2 className="text-lg font-semibold">Overview</h2>
              </div>

              <p className="text-sm text-gray-400 mb-4">
                AI-generated tests based on your source code and selected configuration.
              </p>

              <ul className="text-sm text-gray-400 space-y-2 list-disc list-inside">
                <li>Understands logic & edge cases</li>
                <li>Generates framework-specific tests</li>
                <li>Runs tests and reports results</li>
              </ul>

              <div className="mt-6 flex items-start gap-2 bg-blue-500/10 p-3 rounded-lg border border-blue-500/20">
                <Lightbulb className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-blue-300">Clean functions = better test output.</p>
              </div>
            </div>
          </div>

          {/* MIDDLE COLUMN - Source Code Card ONLY (NO BUTTON) */}
          <div className="lg:col-span-6 min-h-0">
            <div
              className="p-6 rounded-xl border shadow-2xl min-h-[70vh] flex flex-col"
              style={{ background: colors.bgCard, borderColor: colors.borderPrimary }}
            >
              {/* Single Test Name field */}
              <div className="mb-4 flex-shrink-0">
                <label
                  htmlFor="testName"
                  className="block text-sm font-medium mb-1"
                  style={{ color: colors.textSecondary ?? '#9ca3af' }}
                >
                  Test Name
                </label>
                <input
                  type="text"
                  id="testName"
                  value={testName}
                  onChange={(e) => setTestName(e.target.value)}
                  placeholder="e.g., user_authentication_flow"
                  style={{
                    width: '100%',
                    background: isDark ? '#0B0F19' : '#ffffff',
                    border: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`,
                    borderRadius: '0.5rem',
                    padding: '0.75rem 1rem',
                    color: isDark ? '#ffffff' : '#1f2937',
                    outline: 'none',
                    fontSize: '0.875rem',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = isDark ? '#3b82f6' : '#4f46e5';
                    e.currentTarget.style.boxShadow = isDark ? '0 0 0 3px rgba(59, 130, 246, 0.1)' : '0 0 0 3px rgba(79, 70, 229, 0.1)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = isDark ? '#374151' : '#e5e7eb';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>

            {/* Code Inputs Scrollable Area */}
              <div className="flex-1 min-h-0 flex flex-col gap-4 overflow-y-auto">
                {codeInputs.map((input, index) => (
                  <div key={input.id} className="relative flex-shrink-0 flex flex-col min-h-0 flex-1">
                    {/* Code Input Header with Remove Button */}
                    <div className="flex items-center justify-between mb-2 flex-shrink-0">
                      <h3
                        className="text-sm font-semibold"
                        style={{ color: colors.textPrimary }}
                      >
                        Source File {index + 1}
                      </h3>
                      {codeInputs.length > 1 && (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            removeCodeInput(input.id);
                          }}
                          className="flex items-center gap-1 px-3 py-1 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                          title="Remove this code input"
                          type="button"
                        >
                          <X className="w-4 h-4" />
                          <span className="text-xs">Remove</span>
                        </button>
                      )}
                    </div>

                    {/* Code Input Component - Stretch to fill */}
                    <div className="flex-1 min-h-0">
                      <CodeInput
                        onGenerate={() => handleGenerate()}
                        isLoading={isLoading}
                        onLanguageChange={(lang) => {
                          if (index === 0) setSelectedLanguage(lang);
                          updateCodeInput(input.id, "language", lang);
                        }}
                        onCodeChange={(code) => updateCodeInput(input.id, "code", code)}
                        onFunctionNameChange={(name) => updateCodeInput(input.id, "fileName", name)}
                        initialCode={input.code}
                        initialFunctionName={input.fileName}
                        hideSubmitButton={true}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div className="lg:col-span-3 lg:sticky lg:top-6">
            <ConfigPanel
              config={config}
              setConfig={setConfig}
              language={selectedLanguage}
              showDependencies={true}
            />
          </div>
        </div>

        {/* SEPARATE GRID: Buttons (Aligned with Middle Column) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6">
          {/* Empty left column space */}
          <div className="lg:col-span-3"></div>

          {/* Middle column: Add file + Generate buttons */}
          <div className="lg:col-span-6 flex flex-col gap-3">
            <button
              onClick={addCodeInput}
              className="
                w-full
                px-6 py-3
                rounded-xl
                border-2 border-dashed
                flex items-center justify-center gap-2
                font-medium
                transition-all duration-200
                hover:opacity-80
                cursor-pointer
              "
              style={{
                borderColor: isDark ? "#3b82f6" : "#4f46e5",
                color: isDark ? "#60a5fa" : "#4f46e5",
                background: isDark ? "rgba(59, 130, 246, 0.05)" : "rgba(79, 70, 229, 0.05)",
              }}
            >
              <Plus className="w-5 h-5" />
              <span>Add Another Source File</span>
            </button>

            <button
              onClick={handleGenerate}
              disabled={isLoading}
              style={{
                width: '100%',
                background: isLoading ? (isDark ? 'rgba(59, 130, 246, 0.5)' : 'rgba(79, 70, 229, 0.5)') : 'linear-gradient(to right, #2563eb, #4f46e5)',
                color: '#ffffff',
                fontWeight: 600,
                padding: '1rem',
                borderRadius: '0.5rem',
                border: 'none',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.75 : 1
              }}
            >
              {isLoading ? (
                <>
                  <div style={{ width: '1.25rem', height: '1.25rem', border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginRight: '0.5rem' }}></div>
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                  Generating...
                </>
              ) : (
                "Generate Test Cases"
              )}
            </button>
          </div>

          {/* Empty right column space */}
          <div className="lg:col-span-3"></div>
        </div>
      </div>

      <ApiTestingModal
        isOpen={isApiModalOpen}
        onClose={() => setIsApiModalOpen(false)}
        projectId={projectId}
      />

      <UiTestingModal
        isOpen={isUiModalOpen}
        onClose={() => setIsUiModalOpen(false)}
        projectId={projectId}
      />
    </div>
  );
};

export default IntegrationTest;
