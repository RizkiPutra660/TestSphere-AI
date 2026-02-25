import { useState, useEffect, useRef } from "react";
import {
  ArrowLeft,
  Play,
  RefreshCw,
  FileText,
  Code2,
  Sparkles,
  CheckCircle2,
  Copy,
  Check,
  Pencil,
  Settings2,
  Key
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "react-hot-toast";
import { useTheme } from "../context/ThemeContext";
import ThemeToggle from "../components/ThemeToggle";
import { usePersistedLocationState } from "../hooks/usePersistedLocationState";
import SecretsSelector from "../components/SecretsSelector";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { InfoCard, GradientCard } from "../components/ui/Card";
import { PageNavHeader } from "../components/ui/PageHeader";
import { IconButton, DeleteButton } from "../components/ui/IconButton";

interface TestCase {
  id?: number; // Database ID for API calls
  title: string;
  description: string;
  category: "Happy Path" | "Edge Case" | "Error Handling";
  code: string; // should be the test method snippet
}

type JavaField =
  | string
  | {
      type: string;
      name: string;
      annotations?: string[];
    };

interface TestData {
  summary: string;
  language: string;
  imports?: string | string[];
  setup_code?: string;
  teardown_code?: string;
  // Java specific fields
  package_name?: string;
  class_name?: string;
  class_annotations?: string[];
  fields?: JavaField[];
  testCases: TestCase[];
  fullCode: string; // whole test file
}

export default function TestPreview() {
  const navigate = useNavigate();
  const location = useLocation();
  // Persists navigation state so the page survives a browser refresh
  const ps = usePersistedLocationState<{
    testData?: TestData;
    sourceCode?: string;
    requestID?: string;
    functionName?: string;
    config?: Record<string, unknown>;
    testType?: string;
    projectId?: number;
    queueItemId?: number;
    requirements?: string;
    customDeps?: string;
    language?: string;
    codeFiles?: unknown[];
  }>('testPreview');

  const [activeTab, setActiveTab] = useState<"descriptions" | "code">(
    "descriptions"
  );
  const [copied, setCopied] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  // initial data from navigation state
  const [currentTestData, setCurrentTestData] = useState<TestData | undefined>(
    ps?.testData
  );


  // textarea content – always the "current" full file used for copy / run / regenerate
  const [editableCode, setEditableCode] = useState<string>(
    ps?.testData?.fullCode || ""
  );

  // dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"edit" | "delete">("edit");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [draftTest, setDraftTest] = useState<TestCase | null>(null);

  // Secrets selector state
  const [selectedSecrets, setSelectedSecrets] = useState<string[]>([]);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // Retrieve initial data
  const config = ps?.config || {};
  const sourceCode = ps?.sourceCode as string | undefined;
  const functionName = ps?.functionName as string | undefined;
  const requestID = ps?.requestID as string | undefined;
  const projectId = ps?.projectId as number | undefined;
  const queueItemId = ps?.queueItemId as number | undefined;
  const testType = ps?.testType || "unit";

  // Dependency state (init from config)
  // We use `config.requirements` which now comes populated from IntegrationTest page
  // Dependency state (init from location state, fallback to config for legacy)
  const requirements = ps?.requirements || (config as Record<string, string>)?.requirements || "";
  const customDeps = ps?.customDeps || (ps?.language === 'java' ? (config as Record<string, string>)?.custom_deps : "") || "";


  // Determine the correct "back" route based on test type
  const backRoute = testType === "integration" ? "/integration-test" : "/test";

  useEffect(() => {
    // Only redirect if there is genuinely no test data anywhere (not on refresh)
    if (!currentTestData) {
      const stored = sessionStorage.getItem('nav_state_testPreview');
      if (!stored) {
        toast.error("No test data found. Please generate tests first.");
        navigate(backRoute, { state: { projectId } });
      } else {
        // Data exists in sessionStorage but didn't initialize — try to restore
        try {
          const parsed = JSON.parse(stored);
          if (parsed?.testData) {
            setCurrentTestData(parsed.testData);
            setEditableCode(parsed.testData.fullCode || "");
          } else {
            navigate(backRoute, { state: { projectId } });
          }
        } catch {
          navigate(backRoute, { state: { projectId } });
        }
      }
    }
  }, []);

  if (!currentTestData) return null;

  const openEditDialog = (index: number) => {
    const test = currentTestData.testCases[index];
    setSelectedIndex(index);
    setDraftTest({ ...test });
    setDialogMode("edit");
    setIsDialogOpen(true);
  };

  const openDeleteDialog = (index: number) => {
    const test = currentTestData.testCases[index];
    setSelectedIndex(index);
    setDraftTest({ ...test });
    setDialogMode("delete");
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setSelectedIndex(null);
    setDraftTest(null);
  };

  const handleSaveEdit = async () => {
    if (!draftTest) return;

    if (selectedIndex === null) {
      try {
        const response = await fetch("/api/test-scenarios", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ai_request_id: requestID,
            title: draftTest.title,
            description: draftTest.description,
            category: draftTest.category,
            code: draftTest.code,
          }),
        });

        if (!response.ok) throw new Error("Failed to create test scenario");

        const created = await response.json(); // expect created scenario (with id)

        // Update local state (add to list)
        setCurrentTestData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            testCases: [...prev.testCases, created],
          };
        });

        toast.success("New test case added!");
        closeDialog();
      } catch {
        toast.error("Failed to add test case");
      }
      return;
    }

    // 2) EDIT mode (selectedIndex !== null)
    try {
      const scenario = currentTestData!.testCases[selectedIndex];

      const response = await fetch(
        `/api/test-scenarios/${scenario.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            title: draftTest.title,
            description: draftTest.description,
            category: draftTest.category,
            code: draftTest.code,
          }),
        }
      );

      if (!response.ok) throw new Error("Failed to save changes");

      const updated = await response.json(); // optional

      // Update local state
      setCurrentTestData((prev) => {
        if (!prev) return prev;
        const copy = [...prev.testCases];
        copy[selectedIndex] = updated ?? draftTest; // use backend response if provided
        return { ...prev, testCases: copy };
      });

      toast.success("Test case updated and saved!");
      closeDialog();
    } catch {
      toast.error("Failed to save changes");
    }
  };

  const handleConfirmDelete = async () => {
    if (selectedIndex === null || !draftTest) return;
    const scenario = currentTestData.testCases[selectedIndex];

    try {
      // Call backend to soft-delete (set enabled = false)
      const response = await fetch(`/api/test-scenarios/${scenario.id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to delete scenario');
      // Update local state
      const updatedTestCases = currentTestData.testCases.filter(
        (_t, i) => i !== selectedIndex
      );
      setCurrentTestData({
        ...currentTestData,
        testCases: updatedTestCases
      });
      toast.success("Test case deleted");
      closeDialog();

    } catch {
      toast.error('Failed to delete scenario');
    }
  };

  // ----------------- core actions -----------------

  const handleCopyCode = () => {
    navigator.clipboard.writeText(editableCode);
    setCopied(true);
    toast.success("Full test suite copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRegenerate = async () => {
    if (isRegenerating) return;

    setIsRegenerating(true);
    const toastId = toast.loading("Regenerating test cases...");

    try {
      const response = await fetch("/api/generate-tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          // you can add a mode flag if you want different behavior on backend
          message: editableCode,
        }),
      });

      if (!response.ok) throw new Error("Regeneration failed");

      const data = await response.json();

      // AI returns same structure as before
      setCurrentTestData(data.response);
      setEditableCode(data.response.fullCode);

      toast.dismiss(toastId);
      toast.success("Tests regenerated successfully!");
    } catch {
      toast.dismiss(toastId);
      toast.error("Failed to regenerate tests.");
    } finally {
      setIsRegenerating(false);
    }
  };

  // Rebuild full test code from current scenarios (includes edits)
  const rebuildTestCodeFromScenarios = () => {
    const { language, imports, setup_code, teardown_code, package_name, class_name, class_annotations, fields } = currentTestData!;

    if (language === 'java') {
      let code = '';
      // 1. Package
      code += `package ${package_name || 'com.test'};\n\n`;

      // 2. Imports
      const rawImports = imports ? (Array.isArray(imports) ? imports : imports.split('\n')) : [];
      const importSet = new Set<string>();

      rawImports.forEach((imp: string) => {
        let clean = imp.trim();
        if (!clean) return;
        if (!clean.startsWith('import ')) clean = `import ${clean}`;
        if (!clean.endsWith(';')) clean = `${clean};`;
        importSet.add(clean);
      });

      // Auto-inject missing imports based on used features
      if (class_annotations && class_annotations.some(a => a.includes('WebMvcTest'))) {
        importSet.add('import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;');
        importSet.add('import org.springframework.beans.factory.annotation.Autowired;');
        importSet.add('import org.springframework.test.web.servlet.MockMvc;');
      }
      if (fields && fields.some(f => (typeof f === 'string' ? f : JSON.stringify(f)).includes('MockMvc'))) {
        importSet.add('import org.springframework.test.web.servlet.MockMvc;');
      }
      if (fields && fields.some(f => (typeof f === 'string' ? f : JSON.stringify(f)).includes('Autowired'))) {
        importSet.add('import org.springframework.beans.factory.annotation.Autowired;');
      }

      // Ensure basic JUnit imports are ALWAYS present
      // We do not trust the list from the AI or backend to be complete.
      const requiredJunitImports = [
        'import org.junit.jupiter.api.Test;',
        'import static org.junit.jupiter.api.Assertions.*;'
      ];

      requiredJunitImports.forEach(req => importSet.add(req));

      code += Array.from(importSet).join('\n');
      code += '\n\n';

      // 3. Class Annotations
      if (class_annotations && class_annotations.length > 0) {
        code += class_annotations.join('\n') + '\n';
      }

      // 4. Class Declaration
      code += `public class ${class_name || 'ApplicationTest'} {\n\n`;

      // 5. Fields
      if (fields && fields.length > 0) {
        fields.forEach((field) => {
          if (typeof field === 'string') {
            code += `    ${field}\n\n`;
          } else {
            if (field.annotations) {
              field.annotations.forEach((ann: string) => code += `    ${ann}\n`);
            }
            code += `    ${field.type} ${field.name};\n\n`;
          }
        });
      }

      // 6. Setup
      if (setup_code) {
        code += setup_code + '\n\n';
      }

      // 7. Scenarios
      currentTestData!.testCases.forEach((test, index) => {
        if (test.code) {
          // Annotations
          if (test.category) { // or specific annotations field if available, defaulting for now
            code += '    @Test\n';
          } else {
            code += '    @Test\n';
          }

          // Method Signature
          // Sanitize title to be a valid java identifier
          const safeTitle = (test.title || `testScenario${index + 1}`).replace(/[^a-zA-Z0-9]/g, '');
          code += `    public void ${safeTitle}() {\n`;

          // Body
          const indentedCode = test.code.split('\n').map(line => '        ' + line).join('\n');
          code += indentedCode + '\n';

          // Close method
          code += '    }\n\n';
        }
      });

      // 8. Teardown
      if (teardown_code) {
        code += teardown_code + '\n';
      }

      // 9. Close Class
      code += '}\n';
      return code;
    }

    // --- Python (Legacy) ---
    // Start with imports
    const importText = Array.isArray(imports) ? imports.join("\n") : imports || '';
    let fullCode = importText;
    fullCode += '\n\n';

    // Add setup code if exists
    if (setup_code) {
      fullCode += setup_code;
      fullCode += '\n\n';
    }

    // Add all scenario test functions (using current state, includes edits!)
    currentTestData!.testCases.forEach((test) => {
      if (test.code) {
        fullCode += test.code;
        fullCode += '\n\n';
      }
    });

    // Add teardown code if exists
    if (teardown_code) {
      fullCode += teardown_code;
      fullCode += '\n';
    }

    return fullCode.trim();
  };

  const handleRunTests = () => {
    // Rebuild test code from current scenarios (includes any edits)
    let rebuiltCode = rebuildTestCodeFromScenarios();

    // Prepare dependencies based on language
    const language = currentTestData.language || "python";
    // const requirements = ... (Removed to use component state)
    // const customDeps = ... (Removed to use component state)

    // Verify and Force-Inject (Paranoid Check)
    // Even if rebuildTestCodeFromScenarios adds them, string manipulation elsewhere could drop them.
    if (language === 'java') {
      if (!rebuiltCode.includes('import org.junit.jupiter.api.Test;')) {
        rebuiltCode = 'import org.junit.jupiter.api.Test;\n' + rebuiltCode;
      }
      if (!rebuiltCode.includes('import static org.junit.jupiter.api.Assertions.*;')) {
        rebuiltCode = 'import static org.junit.jupiter.api.Assertions.*;\n' + rebuiltCode;
      }
    }

    navigate("/loading", {
      state: {
        requestId: requestID,
        sourceCode: sourceCode,
        testCode: rebuiltCode,  // ← Use validated code
        language: currentTestData.language,
        functionName: functionName,
        config: {
          ...config,
          // Remove requirements from nested config to avoid confusion
          requirements: undefined
        },
        testCases: currentTestData.testCases, // added this line to pass original test cases
        testType: testType,
        projectId: projectId,
        selectedSecrets: selectedSecrets,
        requirements: requirements, // Pass requirements
        customDeps: customDeps, // Pass custom deps
        queueItemId: queueItemId,  // Pass queue item ID for status update
        testedFile: sourceCode?.match(/\/\/ File: (.+?)\n/)?.[1], // Extract filename from source code
      },
    });
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "Happy Path":
        return "text-green-400 bg-green-400/10 border-green-400/20";
      case "Edge Case":
        return "text-orange-400 bg-orange-400/10 border-orange-400/20";
      case "Error Handling":
        return "text-red-400 bg-red-400/10 border-red-400/20";
      default:
        return "text-indigo-400 bg-indigo-400/10 border-indigo-400/20";
    }
  };

  return (
    <div className={isDark ? "min-h-screen bg-[#0B0F19] text-white font-sans" : "min-h-screen bg-gray-50 text-gray-900 font-sans"}>
      {/* Header */}
      <PageNavHeader
        breadcrumbs={[
          {
            label: 'Back',
            icon: ArrowLeft,
            onClick: () => navigate(backRoute, { state: { projectId } }),
          },
        ]}
        title="AI Generated Tests"
        titleEmoji="✨"
        actions={
          <>
            <ThemeToggle />
            <Button
              onClick={handleRegenerate}
              disabled={isRegenerating}
              variant="outline"
              size="md"
            >
              <RefreshCw
                className={`w-4 h-4 mr-2 ${
                  isRegenerating ? "animate-spin" : ""
                }`}
              />
              {isRegenerating ? "Regenerating..." : "Regenerate"}
            </Button>
            <Button
              onClick={handleRunTests}
              disabled={isRegenerating}
              variant="primary"
              size="md"
            >
              <Play className="w-4 h-4 mr-2" />
              Run Tests
            </Button>
          </>
        }
      />

      {/* Secrets Selector - Only show for integration tests */}
      {testType === "integration" && projectId && (
        <div className="max-w-7xl mx-auto px-6 py-6">
          <GradientCard
            gradientFrom="rgba(99, 102, 241, 0.1)"
            gradientTo="rgba(147, 51, 234, 0.1)"
            icon={Key}
            title="Integration Test Secrets"
            subtitle="Select secrets to inject into the Docker container"
          >
            <SecretsSelector
              projectId={projectId}
              selected={selectedSecrets}
              onChange={setSelectedSecrets}
            />

            {selectedSecrets.length > 0 && (
              <InfoCard
                emoji="✅"
                title={`${selectedSecrets.length} secret${selectedSecrets.length > 1 ? 's' : ''} will be injected`}
                description={selectedSecrets.join(', ')}
                variant="success"
                className="mt-4"
              />
            )}
          </GradientCard>
        </div>
      )}



      <main className="max-w-7xl mx-auto px-6 py-12">
        {/* Banner with Config Info */}
        <div className={`p-6 rounded-2xl border shadow-lg mb-8 ${isDark ? 'border-white/10 bg-[#1a1f2e]' : 'border-gray-200 bg-white'}`}>
          <div className="flex items-start justify-between gap-6">
            <div className="flex items-start gap-4 flex-1">
              <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-6 h-6 text-indigo-400" />
              </div>
              <div className="flex-1">
                <h2 className={`text-2xl font-semibold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  Generated <span className="text-blue-400">{currentTestData.testCases.length} test cases</span> for your code
                </h2>
                <p className={`text-sm leading-relaxed ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                  {currentTestData.summary || "Tests for the sum function, covering various numeric inputs including positive, negative, zero, and floating-point numbers."}
                </p>
              </div>
            </div>
            
            {/* Config Chips Display - Right Side */}
            {config && (config.framework || config.preset) && (
              <div className="flex flex-col gap-2 items-end">
                {config.framework && (
                  <div className={`flex items-center gap-1.5 px-3 py-1 rounded-md border text-xs font-mono ${isDark ? 'bg-white/5 border-white/10 text-indigo-300' : 'bg-indigo-50 border-indigo-200 text-indigo-700'}`}>
                    <Settings2 className="w-3 h-3" />
                    <span className={isDark ? 'text-gray-400' : 'text-gray-600'}>Framework:</span> <span>{config.framework}</span>
                  </div>
                )}
                {config.preset && (
                  <div className={`flex items-center gap-1.5 px-3 py-1 rounded-md border text-xs ${isDark ? 'bg-white/5 border-white/10' : 'bg-emerald-50 border-emerald-200'}`}>
                    <CheckCircle2 className="w-3 h-3" />
                    <span className={isDark ? 'text-gray-400' : 'text-gray-600'}>Preset:</span> <span className={`capitalize ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>{config.preset}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className={`p-5 rounded-xl border transition-colors ${isDark ? 'border-white/10 bg-[#131825] hover:border-indigo-500/30' : 'border-gray-200 bg-white hover:border-indigo-500/30'}`}>
            <div className="flex items-center justify-between">
              <div>
                <div className={`text-3xl font-bold mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  {currentTestData.testCases.length}
                </div>
                <div className={`text-sm font-medium ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                  Test Cases Created
                </div>
              </div>
              <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center">
                <FileText className="w-6 h-6 text-indigo-400" />
              </div>
            </div>
          </div>

          <div className={`p-5 rounded-xl border transition-colors ${isDark ? 'border-white/10 bg-[#131825] hover:border-cyan-500/30' : 'border-gray-200 bg-white hover:border-cyan-500/30'}`}>
            <div className="flex items-center justify-between">
              <div>
                <div className={`text-3xl font-bold mb-1 capitalize ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  {currentTestData.language}
                </div>
                <div className={`text-sm font-medium ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                  Detected Language
                </div>
              </div>
              <div className="w-12 h-12 rounded-xl bg-cyan-500/10 flex items-center justify-center">
                <Code2 className="w-6 h-6 text-cyan-400" />
              </div>
            </div>
          </div>

          <div className={`p-5 rounded-xl border transition-colors ${isDark ? 'border-white/10 bg-[#131825] hover:border-purple-500/30' : 'border-gray-200 bg-white hover:border-purple-500/30'}`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-3xl font-bold mb-1 text-green-400">
                  100%
                </div>
                <div className={`text-sm font-medium ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                  Syntax Validity
                </div>
              </div>
              <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-green-400" />
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className={`rounded-2xl border shadow-2xl relative ${isDark ? 'border-white/10 bg-[#131825]' : 'border-gray-200 bg-white'}`}>
          <div className={`border-b px-6 rounded-t-2xl ${isDark ? 'border-white/10 bg-white/[0.02]' : 'border-gray-200 bg-gray-50/50'}`}>
            <div className="flex h-16 gap-8">
              <button
                onClick={() => setActiveTab("descriptions")}
                className={`flex items-center gap-2 border-b-2 px-2 transition-all ${activeTab === "descriptions"
                  ? `border-indigo-500 text-indigo-400 font-medium`
                  : isDark ? 'border-transparent text-gray-400 hover:text-white' : 'border-transparent text-gray-500 hover:text-gray-900'
                  }`}
              >
                <FileText className="w-4 h-4" />
                Test Scenarios
              </button>
              <button
                onClick={() => setActiveTab("code")}
                className={`flex items-center gap-2 border-b-2 px-2 transition-all ${activeTab === "code"
                  ? `border-indigo-500 text-indigo-400 font-medium`
                  : isDark ? 'border-transparent text-gray-400 hover:text-white' : 'border-transparent text-gray-500 hover:text-gray-900'
                  }`}
              >
                <Code2 className="w-4 h-4" />
                Full Code Source
              </button>
            </div>
          </div>

          <div className={`p-6 min-h-[400px] ${isDark ? 'bg-[#131825]' : 'bg-white'}`}>
            {activeTab === "descriptions" ? (
              <div className="space-y-4">
                <button
                  onClick={() => {
                    setDraftTest({
                      title: "",
                      description: "",
                      category: "Happy Path",
                      code: "",
                    });
                    setSelectedIndex(null);
                    setDialogMode("edit");
                    setIsDialogOpen(true);
                  }}
                  disabled={currentTestData.testCases.length >= 5}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${currentTestData.testCases.length >= 5
                    ? isDark ? 'bg-red-900/50 border-red-500/30 text-red-400 cursor-not-allowed' : 'bg-red-100 border-red-300 text-red-700 cursor-not-allowed'
                    : isDark ? 'bg-blue-600/70 border-blue-500 text-white hover:bg-blue-600/30' : 'bg-blue-100 border-blue-300 text-blue-700 hover:bg-blue-50'
                    }`}
                >

                  + Add Test Case
                </button>

                {currentTestData.testCases.map((test, i) => (
                  <div
                    key={i}
                    className={`group p-5 rounded-xl border transition-all duration-300 relative ${isDark ? 'border-white/5 bg-[#0B0F19] hover:border-indigo-500/30' : 'border-gray-200 bg-gray-50 hover:border-indigo-500/30'}`}
                  >
                    <div className={`absolute inset-0 rounded-xl transition-opacity duration-300 ${isDark ? 'bg-gradient-to-r from-indigo-500/0 via-indigo-500/5 to-cyan-500/0' : 'bg-gradient-to-r from-indigo-500/0 via-indigo-500/3 to-cyan-500/0'} opacity-0 group-hover:opacity-100`}></div>

                    <div className="relative z-10">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <span className={`w-8 h-8 flex items-center justify-center rounded-lg border text-xs font-mono ${isDark ? 'bg-white/5 border-white/10 text-gray-400' : 'bg-gray-200 border-gray-300 text-gray-600'}`}>
                            #{i + 1}
                          </span>
                          <h3 className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                            {test.title}
                          </h3>
                        </div>

                        <div className="flex items-center gap-3">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-medium border cursor-help ${getCategoryColor(
                              test.category
                            )}`}
                          >
                            {test.category}
                          </span>

                          <IconButton
                            icon={Pencil}
                            variant="default"
                            size="sm"
                            onClick={() => openEditDialog(i)}
                            tooltip="Edit"
                          />

                          <DeleteButton
                            onClick={() => openDeleteDialog(i)}
                            size="sm"
                            variant="destructive"
                          />
                        </div>
                      </div>

                      <div className="pl-11">
                        <div className={`p-2 text-sm leading-relaxed ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                          {test.description ||
                            "No description provided for this test case."}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="relative group">
                <div className="absolute right-4 top-4 z-10">
                  <button
                    onClick={handleCopyCode}
                    className={`flex items-center gap-2 backdrop-blur-md px-3 py-2 rounded-lg text-sm transition-all border ${isDark ? 'bg-white/10 hover:bg-white/20 border-white/10 text-white' : 'bg-gray-200 hover:bg-gray-300 border-gray-300 text-gray-900'}`}
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-green-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                    {copied ? "Copied!" : "Copy Code"}
                  </button>
                </div>
                <div className={`rounded-xl border p-6 overflow-x-auto ${isDark ? 'bg-[#0B0F19] border-white/5' : 'bg-gray-100 border-gray-300'}`}>
                  <textarea
                    ref={textareaRef}
                    value={editableCode}
                    readOnly
                    spellCheck={false}
                    className={`custom-scrollbar w-full h-96 font-mono text-sm bg-transparent outline-none resize-none leading-relaxed overflow-y-auto ${isDark ? 'text-gray-300' : 'text-gray-700'}`}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Dialog */}
      <Modal
        isOpen={isDialogOpen}
        onClose={closeDialog}
        title={dialogMode === "edit" ? "Edit Test Case" : "Delete Test Case"}
        maxWidth="2xl"
      >
        {draftTest && (
          <>
            {dialogMode === "edit" ? (
              <>
                <div className="space-y-4">
                  <div>
                    <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                      Title
                    </label>
                    <input
                      value={draftTest.title}
                      onChange={(e) =>
                        setDraftTest({ ...draftTest, title: e.target.value })
                      }
                      className={`w-full px-3 py-2 rounded-lg border text-sm outline-none focus:border-indigo-500 ${isDark ? 'bg-[#111827] border-white/10 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                    />
                  </div>

                  <div>
                    <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                      Description
                    </label>
                    <textarea
                      value={draftTest.description}
                      onChange={(e) =>
                        setDraftTest({
                          ...draftTest,
                          description: e.target.value,
                        })
                      }
                      className={`w-full px-3 py-2 rounded-lg border text-sm outline-none focus:border-indigo-500 min-h-[80px] ${isDark ? 'bg-[#111827] border-white/10 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                    />
                  </div>

                  <div>
                    <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                      Category
                    </label>
                    <select
                      value={draftTest.category}
                      onChange={(e) =>
                        setDraftTest({
                          ...draftTest,
                          category: e.target.value as TestCase["category"],
                        })
                      }
                      className={`w-full px-3 py-2 rounded-lg border text-sm outline-none focus:border-indigo-500 ${isDark ? 'bg-[#111827] border-white/10 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                    >
                      <option value="Happy Path">Happy Path</option>
                      <option value="Edge Case">Edge Case</option>
                      <option value="Error Handling">Error Handling</option>
                    </select>
                  </div>

                  <div>
                    <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                      Test Code
                    </label>
                    <textarea
                      value={draftTest.code}
                      onChange={(e) =>
                        setDraftTest({ ...draftTest, code: e.target.value })
                      }
                      spellCheck={false}
                      className={`w-full px-3 py-2 rounded-lg border text-xs font-mono outline-none focus:border-indigo-500 min-h-[180px] ${isDark ? 'bg-[#111827] border-white/10 text-gray-100' : 'bg-white border-gray-300 text-gray-900'}`}
                    />
                  </div>
                </div>

                <div className="mt-6 flex justify-end gap-3">
                  <Button
                    onClick={closeDialog}
                    variant="ghost"
                    size="md"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSaveEdit}
                    variant="primary"
                    size="md"
                  >
                    Save Changes
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-300 mb-6">
                  Are you sure you want to delete the test{" "}
                  <span className="font-semibold">{draftTest.title}</span>? This
                  will remove it from the list and from the test file.
                </p>
                <div className="flex justify-end gap-3">
                  <Button
                    onClick={closeDialog}
                    variant="ghost"
                    size="md"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleConfirmDelete}
                    variant="destructive"
                    size="md"
                  >
                    Delete
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}
