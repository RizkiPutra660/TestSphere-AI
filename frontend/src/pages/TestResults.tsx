import { useState, useEffect } from "react";
import {
  ArrowLeft,
  Plus,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Download,
  Eye,
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "react-hot-toast";
import jsPDF from "jspdf"; // Import jsPDF for PDF generation
import TestTypeDialog from "../components/TestTypeDialog";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { StatCard } from "../components/ui/Card";
import { TestResultItem } from "../components/ui/TestResultItem";
import { PageNavHeader } from "../components/ui/PageHeader";
import { useTheme } from "../context/ThemeContext";
import { useSessionState, clearSessionState } from "../hooks/useSessionState";
import ThemeToggle from "../components/ThemeToggle";

// --- Types ---
interface TestResult {
  id: string;
  name: string;
  description: string;
  status: "passed" | "failed";
  duration?: number;
  code: string;
  error?: string;
  errorSummary?: string;
}

interface TestSession {
  id: string;
  execution_log_id?: number;
  generatedTests: TestResult[];
  projectId?: number;
  passedCount: number;
  failedCount: number;
  executionTime: number;
  language: string;
  functionName: string;
  framework?: string; // Add framework
  rawOutput?: string;
  rawErrors?: string;
  config?: {
    // Add full config for future use
    framework: string;
    preset: "quick" | "standard" | "thorough";
  };
  originalTestCases?: {
    title: string;
    description: string;
    code: string;
    category: string;
  }[];
}

// Helper function to merge execution results with original test data
const mergeTestResults = (session: TestSession): TestResult[] => {
  if (!session.originalTestCases || session.originalTestCases.length === 0) {
    return session.generatedTests;
  }

  return session.generatedTests.map((test, index) => {
    const originalTest = session.originalTestCases?.[index];
    if (originalTest) {
      return {
        ...test,
        name: originalTest.title || test.name,
        description: originalTest.description || test.description,
        code: originalTest.code || test.code,
        // preserve error details from execution
        error: test.error,
        errorSummary: test.errorSummary,
      };
    }
    return test;
  });
};

// --- UI Components ---

// --- XML Modal Component (Show XML popup) ---
const XMLModal = ({
  isOpen,
  onClose,
  xmlContent,
  isLoading,
}: {
  isOpen: boolean;
  onClose: () => void;
  xmlContent: string;
  isLoading: boolean;
}) => {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const codeBg = isDark ? "bg-[#0d1117]" : "bg-gray-50";
  const codeText = isDark ? "text-gray-300" : "text-gray-800";
  const copyButtonClass = isDark
    ? "bg-white/5 hover:bg-white/10 border border-white/10 hover:border-indigo-500/50 text-white"
    : "bg-white hover:bg-indigo-50 border border-gray-200 hover:border-indigo-200 text-gray-900";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="JUnit XML Report"
      maxWidth="2xl"
    >
      <div className="overflow-auto max-h-[60vh]">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <span className="ml-3 text-gray-400">Loading XML...</span>
          </div>
        ) : (
          <pre
            className={`text-sm font-mono rounded-lg p-4 overflow-x-auto whitespace-pre-wrap ${codeText} ${codeBg}`}
          >
            {xmlContent}
          </pre>
        )}
      </div>
      <div className="flex items-center justify-end gap-3 mt-4">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
        <button
          onClick={() => {
            navigator.clipboard.writeText(xmlContent);
            toast.success("XML copied to clipboard!");
          }}
          disabled={isLoading}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${copyButtonClass}`}
        >
          Copy to Clipboard
        </button>
      </div>
    </Modal>
  );
};

// --- Download Modal Component (Download options popup) ---
const DownloadModal = ({
  isOpen,
  onClose,
  executionLogId,
  session,
  mergedTests,
}: {
  isOpen: boolean;
  onClose: () => void;
  executionLogId?: number;
  session: TestSession;
  mergedTests: TestResult[];
}) => {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const mutedText = isDark ? "text-gray-400" : "text-gray-600";

  const handleDownload = (format: "xml" | "pdf") => {
    if (format === "xml") {
      if (!executionLogId) {
        toast.error("No execution ID available");
        return;
      }
      window.open(
        `/api/results/${executionLogId}/junit?download=true`,
        "_blank"
      );
      toast.success("Downloading XML report...");
    } else {
      // Generate PDF
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();

      // Title
      doc.setFontSize(20);
      doc.setFont("helvetica", "bold");
      doc.text("Test Results Report", pageWidth / 2, 20, { align: "center" });

      // Session Info
      doc.setFontSize(12);
      doc.setFont("helvetica", "normal");
      doc.text(`Function: ${session.functionName}`, 20, 40);
      doc.text(`Language: ${session.language}`, 20, 50);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 20, 60);

      // Summary
      const totalTests = mergedTests.length;
      const passedTests = session.passedCount || 0;
      const failedTests = session.failedCount || 0;
      const passRate =
        totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0;

      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Summary", 20, 80);
      doc.setFontSize(12);
      doc.setFont("helvetica", "normal");
      doc.text(`Total Tests: ${totalTests}`, 20, 90);
      doc.text(`Passed: ${passedTests}`, 20, 100);
      doc.text(`Failed: ${failedTests}`, 20, 110);
      doc.text(`Pass Rate: ${passRate}%`, 20, 120);
      doc.text(`Execution Time: ${session.executionTime}ms`, 20, 130);

      // Test Results
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Test Details", 20, 150);

      let yPos = 160;
      doc.setFontSize(10);

      mergedTests.forEach((test, index) => {
        if (yPos > 270) {
          doc.addPage();
          yPos = 20;
        }

        const status = test.status === "passed" ? "[PASS]" : "[FAIL]";
        doc.setFont("helvetica", "bold");
        doc.text(`${index + 1}. ${status} ${test.name}`, 20, yPos);
        yPos += 7;

        doc.setFont("helvetica", "normal");
        doc.text(`   ${test.description}`, 20, yPos);
        yPos += 7;

        if (test.duration) {
          doc.text(`   Duration: ${test.duration}ms`, 20, yPos);
          yPos += 7;
        }

        if (test.status === "failed" && test.error) {
          doc.setTextColor(180, 0, 0);
          doc.text(`   Error: ${test.error.substring(0, 80)}...`, 20, yPos);
          doc.setTextColor(0, 0, 0);
          yPos += 7;
        }

        yPos += 5;
      });

      // Save the PDF
      doc.save(`test-report-${session.functionName}-${Date.now()}.pdf`);
      toast.success("PDF report downloaded!");
    }
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Download Report"
      maxWidth="md"
    >
      <p className={`${mutedText} text-sm mb-6`}>
        Choose the format for your test report:
      </p>
      <div className="space-y-3">
        <button
          onClick={() => handleDownload("xml")}
          className={`w-full p-4 rounded-xl border transition-all flex items-center gap-4 ${
            isDark
              ? "bg-white/5 hover:bg-white/10 border-white/10 hover:border-indigo-500/50"
              : "bg-white hover:bg-indigo-50 border-gray-200 hover:border-indigo-200"
          }`}
        >
          <div className="w-12 h-12 rounded-lg bg-indigo-500/10 flex items-center justify-center">
            <Download className="w-6 h-6 text-indigo-400" />
          </div>
          <div className="text-left">
            <div className={`${isDark ? "text-white" : "text-gray-900"} font-medium`}>JUnit XML</div>
            <div className={`${mutedText} text-sm`}>Standard format for CI/CD tools</div>
          </div>
        </button>
        <button
          onClick={() => handleDownload("pdf")}
          className={`w-full p-4 rounded-xl border transition-all flex items-center gap-4 ${isDark ? "bg-white/5 hover:bg-white/10 border-white/10 hover:border-emerald-500/50" : "bg-white hover:bg-emerald-50 border-gray-200 hover:border-emerald-200"}`}
        >
          <div className="w-12 h-12 rounded-lg bg-emerald-500/10 flex items-center justify-center">
            <Download className="w-6 h-6 text-emerald-400" />
          </div>
          <div className="text-left">
            <div className={`${isDark ? "text-white" : "text-gray-900"} font-medium`}>PDF Report</div>
            <div className={`${mutedText} text-sm`}>
              Human-readable document
            </div>
          </div>
        </button>
      </div>
    </Modal>
  );
};

// --- Main Component ---
export default function TestResults() {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme } = useTheme();
  const [expandedTest, setExpandedTest] = useState<string | null>(null);

  // ADD THESE LINES - Modal states for XML viewer and download
  const [showXMLModal, setShowXMLModal] = useState(false);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [showTestTypeDialog, setShowTestTypeDialog] = useState(false);
  const [xmlContent, setXmlContent] = useState("");
  const [isLoadingXML, setIsLoadingXML] = useState(false);

  // Retrieve Session data with automatic persistence across reloads
  const activeSession = useSessionState<TestSession>('testSession') || (location.state?.session as TestSession | undefined);
  const isDark = theme === "dark";
  const shellClass = isDark
    ? "min-h-screen bg-[#0B0F19] text-white"
    : "min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 text-gray-900";
  const panelClass = isDark
    ? "bg-white/5 backdrop-blur-sm border border-white/10"
    : "bg-white border border-gray-300 shadow-lg";
  const metaCardClass = isDark
    ? "flex items-center justify-between p-3 bg-[#0B0F19] rounded-lg border border-white/5"
    : "flex items-center justify-between p-3 bg-gray-100 rounded-lg border border-gray-300";
  const mutedText = isDark ? "text-gray-400" : "text-gray-600";

  useEffect(() => {
    if (!activeSession) {
      toast.error("No test results found.");
      navigate("/test");
    }
  }, [activeSession, navigate]);

  // Added this to Fetch XML content for the modal
  const fetchXMLContent = async () => {
    if (!activeSession?.execution_log_id) {
      toast.error("No execution ID available");
      return;
    }
    setIsLoadingXML(true);
    setShowXMLModal(true);
    try {
      const response = await fetch(
        `/api/results/${activeSession.execution_log_id}/junit`
      );
      if (!response.ok) throw new Error("Failed to fetch XML");
      const xml = await response.text();
      setXmlContent(xml);
    } catch {
      toast.error("Failed to load XML content");
      setXmlContent("Error loading XML content");
    } finally {
      setIsLoadingXML(false);
    }
  };

  if (!activeSession) return null;

  const mergedTests = mergeTestResults(activeSession);
  const totalTests = activeSession.generatedTests.length;
  const passedTests = activeSession.passedCount || 0;
  const failedTests = activeSession.failedCount || 0;
  const executionTime = activeSession.executionTime || 0;
  const passRate =
    totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0;

  const toggleExpand = (testId?: string) => {
    setExpandedTest(expandedTest === testId ? null : testId || null);
  };

  return (
    <div className={`${shellClass} font-sans selection:bg-indigo-500/30`}>
      {/* ADD THESE MODALS */}
      <XMLModal
        isOpen={showXMLModal}
        onClose={() => setShowXMLModal(false)}
        xmlContent={xmlContent}
        isLoading={isLoadingXML}
      />
      <DownloadModal
        isOpen={showDownloadModal}
        onClose={() => setShowDownloadModal(false)}
        executionLogId={activeSession.execution_log_id}
        session={activeSession}
        mergedTests={mergedTests}
      />
      <TestTypeDialog
        isOpen={showTestTypeDialog}
        onClose={() => setShowTestTypeDialog(false)}
        onSelect={(type) => {
          setShowTestTypeDialog(false);
          if (type === "unit") {
            navigate("/test", { state: { testType: "unit", projectId: activeSession?.projectId } });
          } else {
          navigate("/integration-test", {
            state: { testType: "integration", projectId: activeSession?.projectId },
           });
          }
        }}
      />
      {/* Header */}
      <PageNavHeader
        breadcrumbs={[
          {
            label: 'Dashboard',
            icon: ArrowLeft,
            onClick: () => {
              navigate("/dashboard", { state: { projectId: activeSession?.projectId } });
              sessionStorage.removeItem("code");
              sessionStorage.removeItem("functionName");
              sessionStorage.removeItem("language");
              clearSessionState('testSession');
            },
            className: isDark
              ? 'text-gray-400 hover:text-white hover:bg-white/5 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-2'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-2',
          },
        ]}
        title="Test Results"
        actions={
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Button onClick={() => setShowTestTypeDialog(true)} variant="primary">
              <Plus className="w-4 h-4 mr-2" />
              New Test
            </Button>
          </div>
        }
      />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-12">
        {/* Summary Section */}
        <div className="mb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center gap-4 mb-6">
            <div
              className={`w-16 h-16 rounded-2xl flex items-center justify-center border ${
                passRate >= 80
                  ? "bg-emerald-500/10 border-emerald-500/20"
                  : passRate >= 50
                  ? "bg-yellow-500/10 border-yellow-500/20"
                  : "bg-red-500/10 border-red-500/20"
              }`}
            >
              {passRate >= 80 ? (
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              ) : passRate >= 50 ? (
                <AlertCircle className="w-8 h-8 text-yellow-400" />
              ) : (
                <XCircle className="w-8 h-8 text-red-400" />
              )}
            </div>
            <div>
              <h1 className="text-4xl font-bold mb-2">
                {passRate >= 80
                  ? "Great Success!"
                  : passRate >= 50
                  ? "Partial Success"
                  : "Tests Failed"}
              </h1>
              <p className={`text-xl ${mutedText}`}>
                {passedTests} of {totalTests} tests passed ({passRate}% success
                rate)
              </p>
            </div>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <StatCard
              emoji="✨"
              label="Total Tests"
              value={totalTests}
              variant="info"
            />

            <StatCard
              emoji="✓"
              label="Passed"
              value={passedTests}
              variant="success"
            />

            <StatCard
              emoji="✗"
              label="Failed"
              value={failedTests}
              variant="error"
            />

            <StatCard
              emoji="⏱"
              label="Execution Time"
              value={`${executionTime}ms`}
              variant="info"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Test Results Table */}
          <div className={`lg:col-span-2 ${panelClass} rounded-2xl overflow-hidden h-fit`}>
            <div className={`p-6 border-b ${isDark ? "border-white/10" : "border-gray-300"}`}>
              <h2 className="text-2xl font-semibold">Detailed Results</h2>
            </div>

            <div className={`divide-y ${isDark ? "divide-white/5" : "divide-gray-300"}`}>
              {mergedTests.map((test, index) => (
                <TestResultItem
                  key={test.id || index}
                  id={test.id}
                  index={index}
                  name={test.name}
                  description={test.description}
                  status={test.status}
                  duration={test.duration}
                  code={test.code}
                  error={test.error}
                  errorSummary={test.errorSummary}
                  isExpanded={expandedTest === test.id}
                  onToggleExpand={toggleExpand}
                />
              ))}
            </div>
          </div>

          {/* Side Panel - Generated Code Metadata */}
          <div className={`${panelClass} rounded-2xl overflow-hidden h-fit`}>
            <div className={`p-6 border-b ${isDark ? "border-white/10" : "border-gray-300"}`}>
              <h2 className="text-xl font-semibold">Session Info</h2>
            </div>

            <div className="p-6">
              <div className="space-y-3 text-sm">
                <div className={metaCardClass}>
                  <span className={`${mutedText}`}>Function</span>
                  <span className={`${isDark ? "text-white" : "text-gray-900"} font-medium font-mono`}>
                    {activeSession.functionName}
                  </span>
                </div>
                <div className={metaCardClass}>
                  <span className={`${mutedText}`}>Language</span>
                  <span className={`${isDark ? "text-white" : "text-gray-900"} font-medium capitalize`}>
                    {activeSession.language}
                  </span>
                </div>
                <div className={metaCardClass}>
                  <span className={`${mutedText}`}>Test Framework</span>
                  <span className={`${isDark ? "text-white" : "text-gray-900"} font-medium capitalize`}>
                    {activeSession.framework || activeSession.config?.framework || "pytest"}
                  </span>
                </div>
                <div className={metaCardClass}>
                  <span className={`${mutedText}`}>Test Preset</span>
                  <span className={`${isDark ? "text-white" : "text-gray-900"} font-medium capitalize`}>
                    {activeSession.config?.preset || "standard"}
                  </span>
                </div>
              </div>

              {/* Export Actions */}
              <div className={`mt-6 pt-6 border-t ${isDark ? "border-white/10" : "border-gray-300"} space-y-3`}>
                <Button
                  onClick={fetchXMLContent}
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  <Eye className="w-4 h-4 mr-2" />
                  Show XML
                </Button>
                <Button
                  onClick={() => setShowDownloadModal(true)}
                  variant="success"
                  size="sm"
                  className="w-full"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download Report
                </Button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
