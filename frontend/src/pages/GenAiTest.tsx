import React, { useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, BookOpen } from "lucide-react";
import { usePersistedLocationState } from "../hooks/usePersistedLocationState";
import { toast } from "react-toastify";

import { CodeInput } from "../components/CodeInput";
import { ConfigPanel, type TestConfig } from "../components/ConfigPanel";

import { setTokensUsed } from "../utils/tokenTracker";
import { subtractFromBudget } from "../utils/tokenBudget";

import { useTheme } from "../context/ThemeContext";
import ThemeToggle from "../components/ThemeToggle";
import { Button } from "../components/ui/Button";
import { Card, InfoCard } from "../components/ui/Card";
import { SectionHeader } from "../components/ui/PageHeader";

const GenAiTest: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { colors, theme } = useTheme();
  const isDark = theme === 'dark';

  const state = usePersistedLocationState<{
    projectId?: number;
    initialCode?: string;
    commitHash?: string;
    queueItemId?: number;
    testType?: "unit" | "integration";
  }>('genAiTest') ?? (location.state as { projectId?: number; initialCode?: string; commitHash?: string; queueItemId?: number; testType?: "unit" | "integration" } | null);
  const projectId = state?.projectId ?? null;
  const initialCode = state?.initialCode ?? "";
  const commitHash = state?.commitHash ?? null;
  const queueItemId = state?.queueItemId ?? null;

  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const getDefaultTestName = () => {
    if (!initialCode || !commitHash) return "";
    const fileMatch = initialCode.match(/\/\/ File: (.+?)\n/);
    const filename = fileMatch ? fileMatch[1] : "test";
    const shortHash = String(commitHash).substring(0, 7);
    return `${shortHash} - ${filename}`;
  };

  const [testName] = useState(getDefaultTestName());
  const [context, setContext] = useState("");

  const [config, setConfig] = useState<TestConfig>({
    framework: "",
    preset: "standard",
  });

  const [selectedLanguage, setSelectedLanguage] = useState(
    () => sessionStorage.getItem("language") ?? ""
  );

  const handleGenerate = async (code: string, language: string, functionName: string) => {
    setIsLoading(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch("/api/generate-tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        signal: controller.signal,
        body: JSON.stringify({
          message: code,
          context,
          project_id: projectId,
          functionName,
          language,
          config: {
            ...config,
            framework: config.framework || (language === "python" ? "pytest" : "jest"),
          },
        }),
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

      const used = Number(data?.tokensUsed?.total_tokens ?? 0);
      setTokensUsed({
        prompt_tokens: Number(data?.tokensUsed?.prompt_tokens ?? 0),
        completion_tokens: Number(data?.tokensUsed?.completion_tokens ?? 0),
        total_tokens: used,
      });
      subtractFromBudget(used);

      navigate("/preview", {
        state: {
          testData: data.response,
          sourceCode: code,
          requestID: data.request_id,
          functionName,
          config: data.config || config,
          testType: state?.testType || "unit",
          queueItemId,
          projectId,
          testName: testName || undefined,
        },
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      toast.error("Failed to generate tests. Please try again.");
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleBackToDashboard = () => {
    abortControllerRef.current?.abort();
    setIsLoading(false);
    sessionStorage.removeItem("code");
    sessionStorage.removeItem("language");
    sessionStorage.removeItem("functionName");
    navigate("/dashboard", { state: { projectId } });
  };

  return (
    <div className="min-h-screen py-12 flex flex-col" style={{ background: colors.bgPrimary, color: colors.textPrimary }}>
      <div className="container mx-auto px-4 max-w-[1600px] flex flex-col h-full min-h-0">
        <div className="flex justify-between items-center mb-8">
          <Button onClick={handleBackToDashboard} variant="ghost" size="md">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
          <ThemeToggle />
        </div>

        <SectionHeader
          title="GenAI Test Generator"
          description="Configure your testing environment, define the context, and generate comprehensive unit tests instantly."
        />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch auto-rows-fr flex-1 min-h-[60vh] md:min-h-[65vh] lg:min-h-[70vh]">
          {/* LEFT: Context */}
          <div className="lg:col-span-3 min-h-0">
            <Card className="h-full min-h-0 flex flex-col" variant="default" padding="md">
              <div className="flex items-center gap-2 mb-4" style={{ color: isDark ? '#60a5fa' : '#2563eb' }}>
                <BookOpen className="w-5 h-5" />
                <h2 className="text-lg font-semibold">Test Context</h2>
              </div>

              <p className="text-sm mb-4" style={{ color: isDark ? '#9ca3af' : '#6b7280' }}>
                Describe the scenario. The AI will prioritize tests that match this description.
              </p>

              <textarea
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="e.g., 'Ensure that users under 18 cannot register...'"
                style={{
                  width: '100%',
                  background: isDark ? '#0B0F19' : '#ffffff',
                  border: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`,
                  borderRadius: '0.5rem',
                  padding: '1rem',
                  color: isDark ? '#d1d5db' : '#1f2937',
                  fontSize: '0.875rem',
                  lineHeight: '1.5rem',
                  flex: 1,
                  minHeight: '220px',
                  resize: 'none',
                  outline: 'none',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = isDark ? '#3b82f6' : '#4f46e5';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = isDark ? '#374151' : '#e5e7eb';
                }}
              />

              <InfoCard
                emoji="💡"
                title="Tip:"
                description="Mention specific edge cases for better results."
                variant="info"
                className="mt-4"
              />
            </Card>
          </div>

          {/* MIDDLE: Code */}
          <div className="lg:col-span-6 min-h-0">
            <CodeInput
              onGenerate={handleGenerate}
              isLoading={isLoading}
              onLanguageChange={setSelectedLanguage}
              initialCode={initialCode}
              initialFunctionName={testName}
            />
          </div>

          {/* RIGHT: Config */}
          <div className="lg:col-span-3 min-h-0">
            <ConfigPanel config={config} setConfig={setConfig} language={selectedLanguage} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default GenAiTest;
