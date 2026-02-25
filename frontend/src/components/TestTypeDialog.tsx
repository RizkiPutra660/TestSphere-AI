import { useEffect, useState } from "react";
import { useTheme } from "../context/ThemeContext";

type TestType = "unit" | "integration";

interface TestTypeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (type: TestType) => void;
}

const CLOSE_MS = 220;

export default function TestTypeDialog({
  isOpen,
  onClose,
  onSelect,
}: TestTypeDialogProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [closing, setClosing] = useState(false);

  // Close on ESC (with animation)
  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // reset when opened
  useEffect(() => {
    if (isOpen) setClosing(false);
  }, [isOpen]);

  const handleClose = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(() => {
      onClose();
    }, CLOSE_MS);
  };

  const handleSelect = (type: TestType) => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(() => {
      onClose(); // hide modal first
      onSelect(type); // then parent navigates
    }, CLOSE_MS);
  };

  if (!isOpen) return null;

  return (
    <div
      onMouseDown={handleClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(10px)",
        animation: closing
          ? `ts_fadeOut ${CLOSE_MS}ms ease-in forwards`
          : "ts_fadeIn 160ms ease-out",
      }}
    >
      <style>{`
        @keyframes ts_fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes ts_fadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }

        @keyframes ts_popIn {
          0%   { transform: translateY(10px) scale(0.96); opacity: 0; }
          100% { transform: translateY(0px)  scale(1);    opacity: 1; }
        }

        @keyframes ts_popOut {
          0%   { transform: translateY(0px) scale(1); opacity: 1; }
          100% { transform: translateY(10px) scale(0.96); opacity: 0; }
        }

        @keyframes ts_glow {
          0%   { opacity: 0.25; }
          50%  { opacity: 0.55; }
          100% { opacity: 0.25; }
        }
      `}</style>

      {/* Dialog */}
      <div
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{
          width: "min(720px, 100%)",
          borderRadius: "18px",
          border: isDark ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(15,23,42,0.12)",
          background: isDark
            ? "linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))"
            : "linear-gradient(135deg, rgba(255,255,255,0.95), rgba(249,250,251,0.98))",
          boxShadow: isDark
            ? "0 30px 90px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04) inset"
            : "0 30px 90px rgba(79,70,229,0.15), 0 0 0 1px rgba(15,23,42,0.06) inset",
          overflow: "hidden",
          animation: closing
            ? `ts_popOut ${CLOSE_MS}ms ease-in forwards`
            : "ts_popIn 220ms cubic-bezier(.2,.9,.2,1)",
          position: "relative",
        }}
      >
        {/* Soft animated glow */}
        <div
          style={{
            position: "absolute",
            inset: -120,
            background:
              "radial-gradient(circle at 30% 20%, rgba(99,102,241,0.45), transparent 55%), radial-gradient(circle at 70% 65%, rgba(34,211,238,0.35), transparent 55%)",
            filter: "blur(18px)",
            animation: "ts_glow 3.2s ease-in-out infinite",
            pointerEvents: "none",
            opacity: closing ? 0 : 1,
            transition: `opacity ${CLOSE_MS}ms ease`,
          }}
        />

        {/* Header */}
        <div
          style={{
            position: "relative",
            padding: "1.5rem 1.5rem 1rem",
            borderBottom: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(15,23,42,0.08)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: "1rem",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "1.25rem",
                  fontWeight: 700,
                  color: isDark ? "#fff" : "#0F172A",
                  letterSpacing: "0.2px",
                }}
              >
                Choose a test type
              </div>
              <div style={{ color: isDark ? "#9CA3AF" : "#64748B", marginTop: "0.35rem" }}>
                What kind of tests do you want to run for this project?
              </div>
            </div>

            <button
              type="button"
              onClick={handleClose}
              aria-label="Close"
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                border: isDark ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(15,23,42,0.12)",
                background: isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.05)",
                color: isDark ? "#E5E7EB" : "#475569",
                cursor: "pointer",
                fontSize: "1rem",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.10)" : "rgba(15,23,42,0.08)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.05)";
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Options */}
        <div
          style={{
            position: "relative",
            padding: "1.5rem",
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: "1rem",
          }}
        >
          {/* Unit Testing */}
          <button
            type="button"
            disabled={closing}
            onClick={() => handleSelect("unit")}
            style={{
              ...cardButtonStyle(isDark),
              opacity: closing ? 0.9 : 1,
              cursor: closing ? "default" : "pointer",
            }}
            onMouseEnter={(e) => !closing && applyHover(e.currentTarget, "unit", isDark)}
            onMouseLeave={(e) => !closing && removeHover(e.currentTarget, isDark)}
          >
            <div style={iconWrapStyle("rgba(99,102,241,0.18)", isDark)}>🧪</div>

            <div style={{ textAlign: "left" }}>
              <div style={titleStyle(isDark)}>Unit Testing</div>
              <div style={descStyle(isDark)}>
                Generate and run tests for individual functions/classes.
              </div>

              <div style={pillRowStyle()}>
                <span style={pillStyle("rgba(99,102,241,0.18)", "#A5B4FC", isDark)}>
                  Fast
                </span>
                <span style={pillStyle("rgba(34,211,238,0.14)", "#67E8F9", isDark)}>
                  Focused
                </span>
                <span style={pillStyle("rgba(255,255,255,0.08)", "#E5E7EB", isDark)}>
                  Great starting point
                </span>
              </div>
            </div>
          </button>

          {/* Integration Testing */}
          <button
            type="button"
            disabled={closing}
            onClick={() => handleSelect("integration")}
            style={{
              ...cardButtonStyle(isDark),
              opacity: closing ? 0.9 : 1,
              cursor: closing ? "default" : "pointer",
            }}
            onMouseEnter={(e) =>
              !closing && applyHover(e.currentTarget, "integration", isDark)
            }
            onMouseLeave={(e) => !closing && removeHover(e.currentTarget, isDark)}
          >
            <div style={iconWrapStyle("rgba(34,211,238,0.16)", isDark)}>🔗</div>

            <div style={{ textAlign: "left" }}>
              <div style={titleStyle(isDark)}>Integration Testing</div>
              <div style={descStyle(isDark)}>
                Validate multiple modules working together (APIs, DB, flows).
              </div>

              <div style={pillRowStyle()}>
                <span style={pillStyle("rgba(34,211,238,0.16)", "#67E8F9", isDark)}>
                  Realistic
                </span>
                <span style={pillStyle("rgba(16,185,129,0.14)", "#6EE7B7", isDark)}>
                  End-to-end
                </span>
                <span style={pillStyle("rgba(255,255,255,0.08)", "#E5E7EB", isDark)}>
                  Higher confidence
                </span>
              </div>
            </div>
          </button>
        </div>

        {/* Footer */}
        <div
          style={{
            position: "relative",
            padding: "1rem 1.5rem 1.5rem",
            display: "flex",
            justifyContent: "flex-end",
            gap: "0.75rem",
            borderTop: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(15,23,42,0.08)",
          }}
        >
          <button
            type="button"
            onClick={handleClose}
            disabled={closing}
            style={{
              padding: "0.75rem 1.1rem",
              borderRadius: 12,
              border: isDark ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(15,23,42,0.12)",
              background: isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.05)",
              color: isDark ? "#E5E7EB" : "#475569",
              cursor: closing ? "default" : "pointer",
              fontWeight: 600,
              opacity: closing ? 0.9 : 1,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.10)" : "rgba(15,23,42,0.08)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.05)";
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/** ----- small style helpers (keep it clean) ----- */
function cardButtonStyle(isDark: boolean): React.CSSProperties {
  return {
    width: "100%",
    borderRadius: 16,
    border: isDark ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(15,23,42,0.10)",
    background: isDark ? "rgba(11,15,25,0.55)" : "rgba(255,255,255,0.5)",
    padding: "1rem",
    cursor: "pointer",
    color: isDark ? "#fff" : "#0F172A",
    display: "flex",
    gap: "1rem",
    alignItems: "flex-start",
    transition:
      "transform 160ms ease, border-color 160ms ease, background 160ms ease",
    transform: "translateY(0px)",
  };
}

function applyHover(el: HTMLButtonElement, type: "unit" | "integration", isDark: boolean) {
  el.style.transform = "translateY(-2px)";
  el.style.borderColor =
    type === "unit" ? "rgba(99,102,241,0.45)" : "rgba(34,211,238,0.45)";
  el.style.background = isDark ? "rgba(11,15,25,0.78)" : "rgba(255,255,255,0.75)";
}

function removeHover(el: HTMLButtonElement, isDark: boolean) {
  el.style.transform = "translateY(0px)";
  el.style.borderColor = isDark ? "rgba(255,255,255,0.10)" : "rgba(15,23,42,0.10)";
  el.style.background = isDark ? "rgba(11,15,25,0.55)" : "rgba(255,255,255,0.5)";
}

function iconWrapStyle(bg: string, isDark: boolean): React.CSSProperties {
  return {
    width: 46,
    height: 46,
    borderRadius: 14,
    background: bg,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "1.4rem",
    flexShrink: 0,
    border: isDark ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(15,23,42,0.10)",
  };
}

function titleStyle(isDark: boolean): React.CSSProperties {
  return { fontSize: "1.05rem", fontWeight: 800, marginBottom: "0.35rem", color: isDark ? "#fff" : "#0F172A" };
}

function descStyle(isDark: boolean): React.CSSProperties {
  return { fontSize: "0.9rem", color: isDark ? "#9CA3AF" : "#64748B", lineHeight: 1.5 };
}

function pillRowStyle(): React.CSSProperties {
  return {
    marginTop: "0.75rem",
    display: "flex",
    gap: "0.5rem",
    flexWrap: "wrap",
  };
}

function pillStyle(bg: string, darkModeColor: string, isDark: boolean): React.CSSProperties {
  const lightModeColorMap: { [key: string]: string } = {
    "#A5B4FC": "#4338CA", // indigo light -> indigo dark
    "#67E8F9": "#0369A1", // cyan light -> cyan dark
    "#E5E7EB": "#374151", // gray light -> gray dark
    "#6EE7B7": "#059669", // emerald light -> emerald dark
  };

  const textColor = isDark ? darkModeColor : (lightModeColorMap[darkModeColor] || "#1f2937");

  return {
    padding: "0.25rem 0.5rem",
    borderRadius: 999,
    fontSize: "0.75rem",
    fontWeight: 700,
    background: bg,
    color: textColor,
    border: "1px solid rgba(0,0,0,0.08)",
  };
}
