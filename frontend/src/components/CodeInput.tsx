import React, { useEffect, useRef, useState } from "react";
import { toast, ToastContainer } from "react-toastify";
import { Trash2, Upload, Code2, FileCode } from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import validityCheck from "../componentFunction/validityCheck";

interface CodeInputProps {
  onGenerate: (code: string, language: string, functionName: string) => void;
  isLoading?: boolean;
  onLanguageChange?: (lang: string) => void;
  onCodeChange?: (code: string) => void;
  onFunctionNameChange?: (name: string) => void;
  initialCode?: string;
  initialFunctionName?: string;
  hideSubmitButton?: boolean;
}

export const CodeInput: React.FC<CodeInputProps> = ({ onGenerate, isLoading = false, onLanguageChange, onCodeChange, onFunctionNameChange, initialCode, initialFunctionName, hideSubmitButton = false }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [code, setCode] = useState(() => initialCode ?? sessionStorage.getItem("code") ?? "");
  const [language, setLanguage] = useState(() => sessionStorage.getItem("language") ?? "");

  // Sync initial language to parent on mount so ConfigPanel is pre-populated
  useEffect(() => {
    const initial = sessionStorage.getItem("language") ?? "";
    if (initial) onLanguageChange?.(initial);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [functionName, setFunctionName] = useState(
    () => initialFunctionName || sessionStorage.getItem("functionName") || ""
  );

  const handleCodeChange = (value: string) => {
    setCode(value);
    onCodeChange?.(value);
  };

  const handleFunctionNameChange = (value: string) => {
    setFunctionName(value);
    onFunctionNameChange?.(value);
  };

  const handleLanguageChange = (lang: string) => {
    setLanguage(lang);
    onLanguageChange?.(lang);
  };

  const [fileName, setFileName] = useState("");

  const notify = () => toast("Test Name and Source Code cannot be empty"); // change label to "test name"

  // --- Helper Functions ---
  const getLanguageFromExtension = (filename: string): string => {
    const lower = filename.toLowerCase();
    if (lower.endsWith('.py')) return 'python';
    if (lower.endsWith('.js')) return 'javascript';
    if (lower.endsWith('.ts')) return 'typescript';
    if (lower.endsWith('.java')) return 'java';
    return 'unknown';
  };

  const stripCommentsAndStrings = (content: string, lang: string): string => {
    let stripped = content;
    if (lang === 'python') {
      stripped = stripped.replace(/"""[\s\S]*?"""/g, '').replace(/'''[\s\S]*?'''/g, '');
      stripped = stripped.replace(/#.*$/gm, '');
    } else {
      stripped = stripped.replace(/\/\*[\s\S]*?\*\//g, '');
      stripped = stripped.replace(/\/\/.*/gm, '');
    }
    return stripped;
  };

  const validateContent = (content: string, lang: string): boolean => {
    if (!lang) return true;

    const cleanContent = stripCommentsAndStrings(content, lang).trim();
    if (!cleanContent) return false;

    const positivePatterns: Record<string, RegExp> = {
      python: /(def\s+\w+|class\s+\w+\s*[:(]|if\s+.*:|elif\s+.*:|else:|try:|except\s+.*:|from\s+\w+\s+import|import\s+\w+|print\s*\()/,
      javascript: /(function\s+|const\s+|let\s+|var\s+|=>|import\s+.*from|export\s+|console\.log|module\.exports|require\s*\()/,
      typescript: /(interface\s+|type\s+|function\s+|const\s+|let\s+|var\s+|import\s+.*from|export\s+|:\s*(string|number|boolean|any|void))/,
      java: /(public\s+class|public\s+static|private\s+|protected\s+|void\s+\w+|String\[\]|System\.out\.print|package\s+[\w.]+;|import\s+java|class\s+\w+\s*\{)/
    };

    const negativePatterns: Record<string, RegExp> = {
      python: /(public\s+class|public\s+static|System\.out|console\.log|function\s+\w+\s*\(|var\s+\w+|^\s*package\s+)/m,
      javascript: /(def\s+\w+|class\s+\w+\(.*\):|public\s+class|public\s+static|System\.out|#include|from\s+\w+\s+import|interface\s+\w+|type\s+\w+\s*=:\s*(string|number|boolean|any|void))/,
      typescript: /(def\s+\w+|class\s+\w+\(.*\):|public\s+class|System\.out|#include|from\s+\w+\s+import)/,
      java: /(def\s+\w+|from\s+\w+\s+import|import\s+\w+\s+as\s+\w+|console\.log|function\s+\w+|var\s+\w+\s*=)/
    };

    const posRegex = positivePatterns[lang];
    if (posRegex && !posRegex.test(cleanContent)) return false; 

    const negRegex = negativePatterns[lang];
    if (negRegex && negRegex.test(cleanContent)) return false; 

    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    if (!language) {
      toast.error("Please select a programming language.");
      return;
    }

    if (fileName && !validityCheck(fileName, language)) {
      toast.error("Selected file type does not match the language.");
      return;
    } 
    
    if (code.trim().length === 0 || functionName.trim().length === 0) {
      notify();
      return;
    }
    
    if (!validateContent(code, language)) {
      const supportedLanguages = ['python', 'javascript', 'typescript', 'java'];
      let detectedRealLang = null;
      for (const lang of supportedLanguages) {
        if (lang !== language && validateContent(code, lang)) {
          detectedRealLang = lang;
          break;
        }
      }

      if (detectedRealLang) {
        toast.error(`This looks like ${detectedRealLang.toUpperCase()} code, but you selected ${language.toUpperCase()}. Please switch the language.`);
      } else {
        toast.warning(`The code doesn't look like valid ${language}. Please check your input.`);
      }
      return; 
    }

    sessionStorage.setItem("code", code);
    sessionStorage.setItem("language", language);
    sessionStorage.setItem("functionName", functionName);

    // localStorage.setItem("code", code);
    // localStorage.setItem("language", language);
    // localStorage.setItem("functionName", functionName);
    
    onGenerate(code, language, functionName);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const detectedLang = getLanguageFromExtension(file.name);
      if (!validityCheck(file.name, detectedLang)) {
        toast.error("Unsupported file type. Please upload .py, .js, .ts, or .java files.");
        event.target.value = "";
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        if (!validateContent(content, detectedLang)) {
            toast.error(`Error: The file "${file.name}" contains code that doesn't look like ${detectedLang}.`);
            handleClear(); 
            return;
        }
        setCode(content);
        setFileName(file.name);
        handleLanguageChange(detectedLang);
        toast.success(`Auto-detected language: ${detectedLang.toUpperCase()}`);     
      };
      reader.readAsText(file);
    }
  };

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleClear = () => {
    setCode("");
    setFileName("");
    setFunctionName(""); 
    handleLanguageChange(""); 
    if (fileInputRef.current) {
      fileInputRef.current.value = ""; 
    }

    sessionStorage.removeItem("code");
    sessionStorage.removeItem("language");
    sessionStorage.removeItem("functionName");

    // localStorage.removeItem("code");
    // localStorage.removeItem("language");
    // localStorage.removeItem("functionName");
  };

  const getLanguageIcon = () => {
    return <Code2 className="w-5 h-5 text-blue-400" />;
  };

  return (
    // h-full with min-h-0 ensures the component fills its grid cell
    <div className="h-full min-h-0 flex flex-col">
      <style>{`
        input:-webkit-autofill,
        input:-webkit-autofill:hover, 
        input:-webkit-autofill:focus, 
        input:-webkit-autofill:active {
            -webkit-box-shadow: 0 0 0 30px ${isDark ? '#0B0F19' : '#ffffff'} inset !important;
            -webkit-text-fill-color: ${isDark ? 'white' : '#1f2937'} !important;
            transition: background-color 5000s ease-in-out 0s;
        }

        #language option {
            color: ${isDark ? '#ffffff' : '#111827'};
            background: ${isDark ? '#0B0F19' : '#ffffff'};
        }

        #language option[disabled] {
            color: ${isDark ? '#6b7280' : '#9ca3af'};
        }
      `}</style>

      {/* Main Card: min-h-0 critical for preventing overflow */}
      <div style={{
        background: isDark ? '#1A1F2E' : '#ffffff',
        border: `1px solid ${isDark ? '#1f2937' : '#e5e7eb'}`,
        borderRadius: '0.75rem',
        padding: '1.5rem',
        boxShadow: isDark ? '0 20px 25px -5px rgba(0, 0, 0, 0.5)' : '0 1px 3px rgba(0, 0, 0, 0.1)',
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: isDark ? '#ffffff' : '#111827' }}>Source Code</h2>
            {(code || fileName) && (
                <button 
                    onClick={handleClear}
                    type="button"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      color: isDark ? '#f87171' : '#dc2626',
                      cursor: 'pointer',
                      fontSize: '0.875rem'
                    }}
                >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Clear Form
                </button>
            )}
        </div>
        
        <p style={{ color: isDark ? '#9ca3af' : '#6b7280', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
          Upload a file to automatically detect the language, or select manually to paste code.
        </p>

        {/* Form: flex-grow and min-h-0 to fill remaining space */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: '1.5rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            
            {/* Language */}
            <div>
              <label htmlFor="language" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: isDark ? '#d1d5db' : '#4b5563', marginBottom: '0.5rem' }}>
                {fileName ? "Detected Language" : "Language"}
              </label>
              
              {fileName ? (
                <div style={{
                  width: '100%',
                  background: isDark ? '#0B0F19' : '#f9fafb',
                  border: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`,
                  borderRadius: '0.5rem',
                  padding: '0.75rem 1rem',
                  color: isDark ? '#ffffff' : '#1f2937',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  opacity: 0.9,
                  cursor: 'default'
                }}>
                    {getLanguageIcon()}
                    <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{language}</span>
                    <span style={{ fontSize: '0.75rem', color: isDark ? '#9ca3af' : '#9ca3af', marginLeft: 'auto' }}>(Auto-detected)</span>
                </div>
              ) : (
                <select
                    id="language"
                    value={language}
                    onChange={(e) => handleLanguageChange(e.target.value)}
                    style={{
                      width: '100%',
                      background: isDark ? '#0B0F19' : '#ffffff',
                      border: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`,
                      borderRadius: '0.5rem',
                      padding: '0.75rem 1rem',
                      color: language === "" ? (isDark ? '#6b7280' : '#9ca3af') : (isDark ? '#ffffff' : '#1f2937'),
                      outline: 'none',
                      cursor: 'pointer'
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = isDark ? '#3b82f6' : '#4f46e5';
                      e.currentTarget.style.boxShadow = isDark ? '0 0 0 3px rgba(59, 130, 246, 0.1)' : '0 0 0 3px rgba(79, 70, 229, 0.1)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = isDark ? '#374151' : '#e5e7eb';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                >
                    <option value="" disabled hidden>Select Language</option>
                    <option value="python">Python</option>
                    <option value="javascript">JavaScript</option>
                    <option value="typescript">TypeScript</option>
                    <option value="java">Java</option>
                </select>
              )}
            </div>

            {/* File Name */}
            <div>
              <label htmlFor="fileName" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: isDark ? '#d1d5db' : '#4b5563', marginBottom: '0.5rem' }}>
                File Name
              </label>
              <input
                type="text"
                id="fileName"
                value={functionName}
                onChange={(e) => handleFunctionNameChange(e.target.value)}
                placeholder="e.g., auth_service.py"
                style={{
                  width: '100%',
                  background: isDark ? '#0B0F19' : '#ffffff',
                  border: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`,
                  borderRadius: '0.5rem',
                  padding: '0.75rem 1rem',
                  color: isDark ? '#ffffff' : '#1f2937',
                  outline: 'none'
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
          </div>

          {/* Textarea Section: flex-grow and min-h-0 to take all available height */}
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: '0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <label htmlFor="code" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: isDark ? '#d1d5db' : '#4b5563' }}>
                  Source Code
                </label>
                <div>
                    <input type="file" onChange={handleFileChange} ref={fileInputRef} style={{ display: 'none' }} accept=".py,.js,.ts,.java" />
                    {fileName ? (
                         <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: isDark ? 'rgba(59, 130, 246, 0.1)' : 'rgba(79, 70, 229, 0.1)', padding: '0.25rem 0.75rem', borderRadius: '9999px', border: `1px solid ${isDark ? 'rgba(59, 130, 246, 0.3)' : 'rgba(79, 70, 229, 0.3)'}` }}>
                            <FileCode className="w-3 h-3" style={{ color: isDark ? '#60a5fa' : '#4f46e5' }} />
                            <span style={{ color: isDark ? '#60a5fa' : '#4f46e5', fontSize: '0.75rem' }}>{fileName}</span>
                            <button type="button" onClick={handleClear} style={{ color: isDark ? '#9ca3af' : '#6b7280', cursor: 'pointer', marginLeft: '0.25rem' }}>×</button>
                         </div>
                    ) : (
                        <button type="button" onClick={handleFileSelect} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: isDark ? '#60a5fa' : '#4f46e5', cursor: 'pointer' }}>
                            <Upload className="w-4 h-4" />
                            <span>Upload File</span>
                        </button>
                    )}
                </div>
            </div>

            <textarea
              id="code"
              value={code}
              onChange={(e) => handleCodeChange(e.target.value)}
              placeholder="Paste your function here or upload a file..."
              style={{
                width: '100%',
                height: '100%',
                flex: 1,
                minHeight: '240px',
                background: isDark ? '#0B0F19' : '#ffffff',
                border: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`,
                borderRadius: '0.5rem',
                padding: '1rem',
                color: isDark ? '#ffffff' : '#1f2937',
                fontFamily: 'monospace',
                fontSize: '0.875rem',
                outline: 'none',
                resize: 'none'
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

          {!hideSubmitButton && <div style={{ paddingTop: '0.5rem' }}>
            <button
              type="submit"
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
          </div>}
        </form>
      </div>
      <ToastContainer position="bottom-right" theme={isDark ? 'dark' : 'light'} />
    </div>
  );
};