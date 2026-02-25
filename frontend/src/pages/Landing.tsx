import { useNavigate } from 'react-router';
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { AppHeader } from '../components/ui/PageHeader';

const Landing = () => {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuth();
  const { colors, setTheme } = useTheme();
  const [isGetStartedHovered, setIsGetStartedHovered] = useState(false);
  const [isLoginHovered, setIsLoginHovered] = useState(false);

  // Redirect to dashboard if already logged in
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, isLoading, navigate]);

  // Force dark mode when not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setTheme('dark');
    }
  }, [isLoading, isAuthenticated, setTheme]);

  // Show loading while checking auth
  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', background: colors.bgPrimary, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.textPrimary }}>
        Loading...
      </div>
    );
  }
  

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0B0F19 0%, #1a1f2e 100%)', color: colors.textPrimary, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", display: 'flex', flexDirection: 'column' }}>
      <AppHeader
        showThemeToggle={false}
        actions={
          <button
            type="button"
            onClick={() => navigate('/login')}
            onMouseEnter={() => setIsLoginHovered(true)}
            onMouseLeave={() => setIsLoginHovered(false)}
            style={{
              background: isLoginHovered ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              color: colors.textPrimary,
              padding: '0.5rem 1.5rem',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: 500,
              transition: 'all 0.2s ease'
            }}
          >
            Login
          </button>
        }
      />

      {/* Hero Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', maxWidth: '900px', margin: '0 auto', textAlign: 'center' }}>
        {/* Welcome Icon */}
        <div style={{
          width: '80px',
          height: '80px',
          borderRadius: '24px',
          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(34, 211, 238, 0.2))',
          border: '1px solid rgba(99, 102, 241, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '2.5rem',
          marginBottom: '2rem'
        }}>
          🚀
        </div>

        {/* Hero Text */}
        <h1 style={{ fontSize: '3rem', fontWeight: 700, marginBottom: '1.5rem', background: 'linear-gradient(135deg, #fff, #9CA3AF)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', lineHeight: 1.2 }}>
          AI-Powered Unit Test Generation
        </h1>
        <p style={{ fontSize: '1.25rem', color: colors.textMuted, marginBottom: '2.5rem', maxWidth: '600px', lineHeight: 1.7 }}>
          Stop writing tests manually. Let AI generate comprehensive unit tests for your code in seconds. Support for Python, JavaScript, and more.
        </p>

        {/* CTA Buttons */}
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => navigate('/register')}
            onMouseEnter={() => setIsGetStartedHovered(true)}
            onMouseLeave={() => setIsGetStartedHovered(false)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '1.25rem 2.5rem',
              background: isGetStartedHovered
                ? 'linear-gradient(135deg, #818CF8, #6366F1)'
                : 'linear-gradient(135deg, #6366F1, #4F46E5)',
              border: 'none',
              borderRadius: '16px',
              color: '#fff',
              fontSize: '1.125rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: isGetStartedHovered
                ? '0 12px 40px rgba(99, 102, 241, 0.5)'
                : '0 8px 30px rgba(99, 102, 241, 0.3)',
              transform: isGetStartedHovered ? 'translateY(-3px) scale(1.02)' : 'translateY(0) scale(1)',
              transition: 'all 0.3s ease-in-out'
            }}
          >
            Get Started Free
          </button>
        </div>

        {/* Feature Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', marginTop: '5rem', width: '100%' }}>
          {/* Feature 1 */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            padding: '1.5rem',
            textAlign: 'left'
          }}>
            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🤖</div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem', color: colors.textPrimary }}>AI-Powered Tests</h3>
            <p style={{ fontSize: '0.875rem', color: colors.textMuted, lineHeight: 1.5 }}>
              Generate comprehensive unit tests automatically using advanced AI models.
            </p>
          </div>

          {/* Feature 2 */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            padding: '1.5rem',
            textAlign: 'left'
          }}>
            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⚡</div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem', color: colors.textPrimary }}>Instant Execution</h3>
            <p style={{ fontSize: '0.875rem', color: colors.textMuted, lineHeight: 1.5 }}>
              Run your generated tests instantly and see real-time pass/fail results.
            </p>
          </div>

          {/* Feature 3 */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            padding: '1.5rem',
            textAlign: 'left'
          }}>
            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>📊</div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem', color: colors.textPrimary }}>Track Progress</h3>
            <p style={{ fontSize: '0.875rem', color: colors.textMuted, lineHeight: 1.5 }}>
              Monitor your testing history and track code quality over time.
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer style={{ padding: '1.5rem 2rem', borderTop: '1px solid rgba(255, 255, 255, 0.1)', textAlign: 'center' }}>
        <p style={{ fontSize: '0.875rem', color: colors.textMuted }}>
          © 2025 TestSphere AI. All rights reserved.
        </p>
      </footer>
    </div>
  );
}

export default Landing