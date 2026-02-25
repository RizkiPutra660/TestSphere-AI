import { useTheme } from '../context/ThemeContext';

const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggleTheme}
      style={{
        position: 'relative',
        zIndex: 100,
        width: '70px',
        height: '34px',
        borderRadius: '17px',
        border: 'none',
        cursor: 'pointer',
        background: isDark 
          ? 'linear-gradient(to right, #1a1a2e, #16213e, #0f3460)' 
          : 'linear-gradient(to right, #87CEEB, #4AA5D4, #2E90C8)',
        overflow: 'hidden',
        transition: 'all 0.4s ease',
        padding: 0,
      }}
      title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
    >
      {/* Stars (visible in dark mode) */}
      <div style={{
        position: 'absolute',
        top: '6px',
        left: '10px',
        opacity: isDark ? 1 : 0,
        transition: 'opacity 0.3s ease',
      }}>
        <span style={{ fontSize: '4px', color: '#fff', position: 'absolute', top: '0px', left: '0px' }}>★</span>
        <span style={{ fontSize: '3px', color: '#fff', position: 'absolute', top: '8px', left: '8px' }}>★</span>
        <span style={{ fontSize: '5px', color: '#fff', position: 'absolute', top: '4px', left: '16px' }}>★</span>
        <span style={{ fontSize: '3px', color: '#fff', position: 'absolute', top: '12px', left: '4px' }}>★</span>
      </div>

      {/* Clouds (visible in light mode) */}
      <div style={{
        position: 'absolute',
        top: '8px',
        right: '10px',
        opacity: isDark ? 0 : 1,
        transition: 'opacity 0.3s ease',
      }}>
        <div style={{
          width: '20px',
          height: '8px',
          background: 'rgba(255, 255, 255, 0.9)',
          borderRadius: '10px',
          position: 'absolute',
          top: '6px',
          right: '0px',
        }} />
        <div style={{
          width: '14px',
          height: '6px',
          background: 'rgba(255, 255, 255, 0.7)',
          borderRadius: '10px',
          position: 'absolute',
          top: '2px',
          right: '8px',
        }} />
      </div>

      {/* Sun/Moon Circle */}
      <div style={{
        position: 'absolute',
        top: '3px',
        left: isDark ? '39px' : '3px',
        width: '28px',
        height: '28px',
        borderRadius: '50%',
        background: isDark 
          ? 'linear-gradient(145deg, #c9c9c9, #e8e8e8)' 
          : 'linear-gradient(145deg, #FFD700, #FFA500)',
        transition: 'left 0.4s ease, background 0.4s ease',
        boxShadow: isDark 
          ? 'inset -3px -3px 6px rgba(0,0,0,0.2)' 
          : '0 0 10px rgba(255, 200, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {/* Moon craters (visible in dark mode) */}
        {isDark && (
          <>
            <div style={{
              position: 'absolute',
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: 'rgba(150, 150, 150, 0.4)',
              top: '6px',
              left: '8px',
            }} />
            <div style={{
              position: 'absolute',
              width: '4px',
              height: '4px',
              borderRadius: '50%',
              background: 'rgba(150, 150, 150, 0.4)',
              top: '14px',
              left: '14px',
            }} />
            <div style={{
              position: 'absolute',
              width: '5px',
              height: '5px',
              borderRadius: '50%',
              background: 'rgba(150, 150, 150, 0.4)',
              top: '16px',
              left: '6px',
            }} />
          </>
        )}
      </div>
    </button>
  );
};

export default ThemeToggle;