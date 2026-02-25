import React from 'react';
import { useNavigate } from 'react-router-dom';

const Error: React.FC = () => {
  const navigate = useNavigate();

  const handleGoHome = async () => {
    // Call logout to clear any existing session
    try {
      await fetch('/api/logout', {
        method: 'POST',
        credentials: 'include'
      });
    } catch {
      void 0;
    }
    navigate('/login');
  };

  const handleGoBack = () => {
    navigate(-1);
  };

  return (
    <div className="error-page">
      <div className="error-orbit" />
      <div className="error-card">
        <div className="error-icon-wrapper">
          <div className="error-icon">
            <svg
              viewBox="0 0 64 64"
              xmlns="http://www.w3.org/2000/svg"
              className="error-svg"
            >
              <circle cx="32" cy="32" r="24" className="error-svg-bg" />
              <path
                d="M32 18 L32 36"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <circle cx="32" cy="42" r="2.2" fill="currentColor" />
            </svg>
          </div>
        </div>

        <h1 className="error-title">Something went wrong</h1>
        <p className="error-subtitle">
          We couldn’t load this page right now. It might be a broken link,
          expired session, or just a temporary glitch.
        </p>

        <div className="error-actions">
          <button className="error-btn primary" onClick={handleGoHome}>
            Go to Login
          </button>
          <button className="error-btn ghost" onClick={handleGoBack}>
            Go Back
          </button>
        </div>

        <p className="error-hint">
          If this keeps happening, try refreshing the page or signing in again.
        </p>
      </div>

      {/* Inline styles so this is drop-in ready */}
      <style>{`
        .error-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: radial-gradient(circle at top, #1b2845 0, #050814 55%, #020308 100%);
          color: #f9fafb;
          padding: 1.5rem;
          position: relative;
          overflow: hidden;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .error-orbit {
          position: absolute;
          width: 520px;
          height: 520px;
          border-radius: 50%;
          border: 1px solid rgba(96, 165, 250, 0.12);
          box-shadow: 0 0 120px rgba(59, 130, 246, 0.18);
          animation: orbit-pulse 7s ease-in-out infinite;
          opacity: 0.6;
        }

        .error-card {
          position: relative;
          max-width: 480px;
          width: 100%;
          background: radial-gradient(circle at top left, rgba(56, 189, 248, 0.07), transparent),
                      linear-gradient(to bottom right, rgba(15, 23, 42, 0.95), rgba(15, 23, 42, 0.98));
          border-radius: 1.5rem;
          padding: 2.5rem 2.25rem 2rem;
          box-shadow:
            0 24px 80px rgba(0, 0, 0, 0.75),
            0 0 0 1px rgba(148, 163, 184, 0.12);
          backdrop-filter: blur(22px);
          border: 1px solid rgba(148, 163, 184, 0.25);
          animation: card-fade 0.5s ease-out forwards;
        }

        .error-card::before {
          content: "";
          position: absolute;
          inset: -1px;
          border-radius: inherit;
          background: conic-gradient(
            from 180deg,
            rgba(56, 189, 248, 0.15),
            rgba(129, 140, 248, 0.15),
            rgba(56, 189, 248, 0.15)
          );
          opacity: 0;
          z-index: -1;
          animation: border-glow 4.5s ease-in-out infinite;
        }

        .error-icon-wrapper {
          display: flex;
          justify-content: center;
          margin-bottom: 1.5rem;
        }

        .error-icon {
          width: 80px;
          height: 80px;
          border-radius: 999px;
          background: radial-gradient(circle at 30% 0%, #60a5fa, #4f46e5 60%, #0f172a 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow:
            0 0 25px rgba(59, 130, 246, 0.6),
            0 0 50px rgba(79, 70, 229, 0.45);
          animation: float 4.5s ease-in-out infinite;
        }

        .error-svg {
          width: 40px;
          height: 40px;
          color: #e5e7eb;
        }

        .error-svg-bg {
          fill: rgba(15, 23, 42, 0.6);
          stroke: rgba(148, 163, 184, 0.3);
          stroke-width: 2;
        }

        .error-title {
          font-size: 1.7rem;
          line-height: 1.2;
          text-align: center;
          margin-bottom: 0.75rem;
          letter-spacing: 0.02em;
        }

        .error-subtitle {
          font-size: 0.95rem;
          text-align: center;
          color: #9ca3af;
          margin-bottom: 1.75rem;
        }

        .error-actions {
          display: flex;
          gap: 0.75rem;
          justify-content: center;
          margin-bottom: 1.25rem;
          flex-wrap: wrap;
        }

        .error-btn {
          border-radius: 999px;
          padding: 0.7rem 1.5rem;
          font-size: 0.92rem;
          border: none;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.4rem;
          transition:
            background-color 0.2s ease,
            transform 0.15s ease,
            box-shadow 0.2s ease,
            color 0.2s ease;
          white-space: nowrap;
        }

        .error-btn.primary {
          background: linear-gradient(to right, #4f46e5, #38bdf8);
          color: #f9fafb;
          box-shadow:
            0 12px 25px rgba(37, 99, 235, 0.45),
            0 0 0 1px rgba(191, 219, 254, 0.2);
        }

        .error-btn.primary:hover {
          transform: translateY(-1px);
          box-shadow:
            0 18px 32px rgba(37, 99, 235, 0.55),
            0 0 0 1px rgba(219, 234, 254, 0.25);
        }

        .error-btn.ghost {
          background: rgba(15, 23, 42, 0.9);
          color: #e5e7eb;
          border: 1px solid rgba(148, 163, 184, 0.5);
        }

        .error-btn.ghost:hover {
          background: rgba(30, 64, 175, 0.35);
          border-color: rgba(129, 140, 248, 0.8);
          transform: translateY(-1px);
        }

        .error-hint {
          font-size: 0.8rem;
          color: #6b7280;
          text-align: center;
        }

        @keyframes float {
          0% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
          100% { transform: translateY(0); }
        }

        @keyframes orbit-pulse {
          0%, 100% {
            transform: scale(1);
            opacity: 0.5;
          }
          50% {
            transform: scale(1.05);
            opacity: 0.85;
          }
        }

        @keyframes card-fade {
          from {
            opacity: 0;
            transform: translateY(12px) scale(0.99);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes border-glow {
          0%, 100% { opacity: 0; }
          40% { opacity: 0.6; }
          60% { opacity: 0.25; }
        }

        @media (max-width: 480px) {
          .error-card {
            padding: 2rem 1.6rem 1.75rem;
            border-radius: 1.25rem;
          }
          .error-title {
            font-size: 1.5rem;
          }
          .error-subtitle {
            font-size: 0.9rem;
          }
        }
      `}</style>
    </div>
  );
};

export default Error;
