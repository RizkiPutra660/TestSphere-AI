import React, { useRef } from 'react';
import { Settings, Upload, FileJson } from 'lucide-react';
import { toast } from 'react-toastify';
import { useTheme } from '../context/ThemeContext';
import yaml from 'js-yaml'; // Requires: npm install js-yaml

export interface TestConfig {
  framework: string;
  preset: 'quick' | 'standard' | 'thorough';
  requirements?: string; // python
  custom_deps?: string;  // java
}

interface ConfigPanelProps {
  config: TestConfig;
  setConfig: React.Dispatch<React.SetStateAction<TestConfig>>;
  language: string;
  showDependencies?: boolean; // New prop to control visibility
}

const FRAMEWORK_OPTIONS: Record<string, string[]> = {
  python: ['pytest', 'unittest'],
  javascript: ['jest', 'mocha', 'jasmine'],
  typescript: ['jest', 'mocha', 'jasmine'],
  java: ['junit', 'testng'],
  '': []
};

export const ConfigPanel: React.FC<ConfigPanelProps> = ({ config, setConfig, language, showDependencies = false }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.yaml') && !file.name.endsWith('.yml')) {
      toast.error('Please upload a valid YAML file (.yaml or .yml)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        // Parse YAML
        const parsed = yaml.load(content) as Partial<TestConfig>;

        // Merge with existing config, prioritizing file values
        setConfig(prev => ({
          ...prev,
          framework: parsed.framework || prev.framework,
          preset: parsed.preset || prev.preset,
          requirements: parsed.requirements || prev.requirements,
        }));

        toast.success('Configuration loaded from YAML');
      } catch {
        toast.error('Failed to parse YAML file');
      }
    };
    reader.readAsText(file);
  };

  const currentFrameworks = FRAMEWORK_OPTIONS[language.toLowerCase()] || [];
  const [activeTab, setActiveTab] = React.useState<'config' | 'deps'>('config');

  return (
    <div style={{
      background: isDark ? '#1A1F2E' : '#ffffff',
      padding: 0,
      borderRadius: '0.75rem',
      border: `1px solid ${isDark ? '#1f2937' : '#e5e7eb'}`,
      boxShadow: isDark ? '0 20px 25px -5px rgba(0, 0, 0, 0.5)' : '0 1px 3px rgba(0, 0, 0, 0.1)',
      height: '100%',
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      {/* Tabs Header */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${isDark ? '#1f2937' : '#e5e7eb'}`, background: isDark ? 'rgba(11, 15, 25, 0.5)' : 'rgba(249, 250, 251, 0.5)' }}>
        <button
          onClick={() => setActiveTab('config')}
          style={{
            flex: 1,
            padding: '0.75rem',
            fontSize: '0.875rem',
            fontWeight: 500,
            transition: 'all 0.2s',
            borderBottom: `2px solid ${activeTab === 'config' ? (isDark ? '#3b82f6' : '#4f46e5') : 'transparent'}`,
            color: activeTab === 'config' ? (isDark ? '#60a5fa' : '#4f46e5') : (isDark ? '#9ca3af' : '#9ca3af'),
            background: activeTab === 'config' ? (isDark ? '#1A1F2E' : '#ffffff') : 'transparent',
            cursor: 'pointer',
            border: 'none'
          }}
          onMouseEnter={(e) => {
            if (activeTab !== 'config') {
              e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)';
              e.currentTarget.style.color = isDark ? '#fff' : '#111827';
            }
          }}
          onMouseLeave={(e) => {
            if (activeTab !== 'config') {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = isDark ? '#9ca3af' : '#9ca3af';
            }
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
            <Settings className="w-4 h-4" />
            Configuration
          </div>
        </button>
        {showDependencies && (
          <button
            onClick={() => setActiveTab('deps')}
            style={{
              flex: 1,
              padding: '0.75rem',
              fontSize: '0.875rem',
              fontWeight: 500,
              transition: 'all 0.2s',
              borderBottom: `2px solid ${activeTab === 'deps' ? (isDark ? '#6366f1' : '#4f46e5') : 'transparent'}`,
              color: activeTab === 'deps' ? (isDark ? '#a78bfa' : '#4f46e5') : (isDark ? '#9ca3af' : '#9ca3af'),
              background: activeTab === 'deps' ? (isDark ? '#1A1F2E' : '#ffffff') : 'transparent',
              cursor: 'pointer',
              border: 'none'
            }}
            onMouseEnter={(e) => {
              if (activeTab !== 'deps') {
                e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)';
                e.currentTarget.style.color = isDark ? '#fff' : '#111827';
              }
            }}
            onMouseLeave={(e) => {
              if (activeTab !== 'deps') {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = isDark ? '#9ca3af' : '#9ca3af';
              }
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
              <Upload className="w-4 h-4" />
              Dependencies
            </div>
          </button>
        )}
      </div>

      <div style={{ padding: '1.5rem', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'config' ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  fontSize: '0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  background: isDark ? '#374151' : '#f3f4f6',
                  color: isDark ? '#d1d5db' : '#374151',
                  padding: '0.375rem 0.75rem',
                  borderRadius: '0.5rem',
                  border: `1px solid ${isDark ? '#4b5563' : '#d1d5db'}`,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  marginLeft: 'auto'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = isDark ? '#4b5563' : '#e5e7eb';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = isDark ? '#374151' : '#f3f4f6';
                }}
                title="Upload genai-qa.config.yaml"
              >
                <Upload className="w-3 h-3" />
                Load YAML
              </button>
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                accept=".yaml,.yml"
                onChange={handleFileUpload}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', flex: 1, overflowY: 'auto' }}>
              {/* Framework Selection */}
              <div>
                <label style={{ fontSize: '0.875rem', fontWeight: 500, color: isDark ? '#d1d5db' : '#374151' }}>Testing Framework</label>
                <select
                  value={config.framework}
                  onChange={(e) => setConfig({ ...config, framework: e.target.value })}
                  disabled={!language}
                  style={{
                    width: '100%',
                    background: isDark ? '#0B0F19' : '#ffffff',
                    border: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`,
                    borderRadius: '0.5rem',
                    padding: '0.625rem 1rem',
                    color: isDark ? '#ffffff' : '#1f2937',
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
                  {language ? (
                    currentFrameworks.map(fw => (
                      <option key={fw} value={fw}>{fw}</option>
                    ))
                  ) : (
                    <option value="">Select Language First</option>
                  )}
                </select>
              </div>

              {/* Test Preset */}
              <div>
                <label style={{ fontSize: '0.875rem', fontWeight: 500, color: isDark ? '#d1d5db' : '#374151' }}>Test Preset</label>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem' }}>
                  {/* Quick Preset */}
                  <div
                    onClick={() => setConfig({ ...config, preset: 'quick' })}
                    style={{
                      padding: '1rem',
                      borderRadius: '0.5rem',
                      border: `2px solid ${config.preset === 'quick' ? '#10b981' : (isDark ? '#374151' : '#e5e7eb')}`,
                      background: config.preset === 'quick' ? (isDark ? 'rgba(16, 185, 129, 0.1)' : 'rgba(16, 185, 129, 0.05)') : (isDark ? '#0B0F19' : '#f9fafb'),
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      if (config.preset !== 'quick') {
                        e.currentTarget.style.borderColor = isDark ? '#4b5563' : '#d1d5db';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (config.preset !== 'quick') {
                        e.currentTarget.style.borderColor = isDark ? '#374151' : '#e5e7eb';
                      }
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                      <h3 style={{ fontWeight: 600, fontSize: '0.875rem', color: isDark ? '#ffffff' : '#111827' }}>⚡ Quick</h3>
                      <span style={{ fontSize: '0.75rem', color: isDark ? '#9ca3af' : '#6b7280' }}>~60% coverage</span>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: isDark ? '#9ca3af' : '#6b7280' }}>
                      Verify core functionality works. Fastest option for development.
                    </p>
                  </div>

                  {/* Standard Preset */}
                  <div
                    onClick={() => setConfig({ ...config, preset: 'standard' })}
                    style={{
                      padding: '1rem',
                      borderRadius: '0.5rem',
                      border: `2px solid ${config.preset === 'standard' ? '#3b82f6' : (isDark ? '#374151' : '#e5e7eb')}`,
                      background: config.preset === 'standard' ? (isDark ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.05)') : (isDark ? '#0B0F19' : '#f9fafb'),
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      if (config.preset !== 'standard') {
                        e.currentTarget.style.borderColor = isDark ? '#4b5563' : '#d1d5db';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (config.preset !== 'standard') {
                        e.currentTarget.style.borderColor = isDark ? '#374151' : '#e5e7eb';
                      }
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                      <h3 style={{ fontWeight: 600, fontSize: '0.875rem', color: isDark ? '#ffffff' : '#111827' }}>✨ Standard</h3>
                      <span style={{ fontSize: '0.75rem', color: isDark ? '#9ca3af' : '#6b7280' }}>~80% coverage</span>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: isDark ? '#9ca3af' : '#6b7280' }}>
                      Balanced confidence and speed. Tests happy paths plus common edge cases.
                    </p>
                  </div>

                  {/* Thorough Preset */}
                  <div
                    onClick={() => setConfig({ ...config, preset: 'thorough' })}
                    style={{
                      padding: '1rem',
                      borderRadius: '0.5rem',
                      border: `2px solid ${config.preset === 'thorough' ? '#a855f7' : (isDark ? '#374151' : '#e5e7eb')}`,
                      background: config.preset === 'thorough' ? (isDark ? 'rgba(168, 85, 247, 0.1)' : 'rgba(168, 85, 247, 0.05)') : (isDark ? '#0B0F19' : '#f9fafb'),
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      if (config.preset !== 'thorough') {
                        e.currentTarget.style.borderColor = isDark ? '#4b5563' : '#d1d5db';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (config.preset !== 'thorough') {
                        e.currentTarget.style.borderColor = isDark ? '#374151' : '#e5e7eb';
                      }
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                      <h3 style={{ fontWeight: 600, fontSize: '0.875rem', color: isDark ? '#ffffff' : '#111827' }}>🔍 Thorough</h3>
                      <span style={{ fontSize: '0.75rem', color: isDark ? '#9ca3af' : '#6b7280' }}>~95% coverage</span>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: isDark ? '#9ca3af' : '#6b7280' }}>
                      High reliability. Includes boundary values, invalid inputs, and error conditions.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <p style={{ fontSize: '0.875rem', color: isDark ? '#9ca3af' : '#6b7280', marginBottom: '1rem', marginTop: '1rem' }}>
              {language === 'java'
                ? "Define Maven dependencies (XML blocks) to inject into pom.xml:"
                : "Define Python packages (requirements.txt format) to install:"}
            </p>

            {language === 'java' ? (
              <textarea
                value={config.custom_deps || ''}
                onChange={(e) => setConfig({ ...config, custom_deps: e.target.value })}
                placeholder={'<dependency>\n  <groupId>org.json</groupId>\n  <artifactId>json</artifactId>\n  <version>20231013</version>\n</dependency>'}
                style={{
                  flex: 1,
                  width: '100%',
                  background: isDark ? '#0B0F19' : '#ffffff',
                  border: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`,
                  borderRadius: '0.5rem',
                  padding: '1rem',
                  color: isDark ? '#d1d5db' : '#1f2937',
                  outline: 'none',
                  resize: 'none',
                  fontSize: '0.875rem',
                  fontFamily: 'monospace',
                  lineHeight: '1.5rem'
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
            ) : (
              <textarea
                value={config.requirements || ''}
                onChange={(e) => setConfig({ ...config, requirements: e.target.value })}
                placeholder={'requests==2.31.0\npandas>=2.0.0'}
                style={{
                  flex: 1,
                  width: '100%',
                  background: isDark ? '#0B0F19' : '#ffffff',
                  border: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`,
                  borderRadius: '0.5rem',
                  padding: '1rem',
                  color: isDark ? '#d1d5db' : '#1f2937',
                  outline: 'none',
                  resize: 'none',
                  fontSize: '0.875rem',
                  fontFamily: 'monospace',
                  lineHeight: '1.5rem'
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
            )}

            <div style={{ marginTop: '1rem', padding: '0.75rem', background: isDark ? 'rgba(99, 102, 241, 0.1)' : 'rgba(99, 102, 241, 0.05)', borderRadius: '0.5rem', border: `1px solid ${isDark ? 'rgba(99, 102, 241, 0.3)' : 'rgba(99, 102, 241, 0.2)'}` }}>
              <p style={{ fontSize: '0.75rem', color: isDark ? '#a5b4fc' : '#4f46e5' }}>
                <strong>Note:</strong> These will be installed/cached per project at runtime.
              </p>
            </div>
          </div>
        )}
      </div>

      <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: `1px solid ${isDark ? '#1f2937' : '#e5e7eb'}` }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', background: isDark ? 'rgba(59, 130, 246, 0.05)' : 'rgba(59, 130, 246, 0.05)', padding: '0.75rem', borderRadius: '0.5rem' }}>
          <FileJson style={{ width: '1rem', height: '1rem', color: isDark ? '#60a5fa' : '#3b82f6', marginTop: '0.125rem', flexShrink: 0 }} />
          <p style={{ fontSize: '0.75rem', color: isDark ? '#9ca3af' : '#6b7280' }}>
            Configuration helps the AI generate predictable, framework-compliant code.
          </p>
        </div>
      </div>
    </div>
  );
};
