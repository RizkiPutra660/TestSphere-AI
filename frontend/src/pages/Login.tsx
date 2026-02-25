// frontend/src/pages/Login.tsx
import React, { useState, useEffect } from "react";
import { Sparkles, Eye, EyeOff } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useGoogleLogin } from "@react-oauth/google";
import axios from "axios";
import { useAuth } from "../context/AuthContext";

const Login: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // Redirect to dashboard if already logged in
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate("/dashboard");
    }
  }, [isAuthenticated, isLoading, navigate]);

  const handleGoogleLogin = useGoogleLogin({
  onSuccess: async(res) => {
    await axios.post("/api/google-login", {
      access_token: res.access_token,
    }, {
      withCredentials: true  // Send/receive cookies
    });

    // Refresh auth context and navigate
    await login();
    navigate("/dashboard");
  }
});


  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: 'include',  // Send/receive cookies
        body: JSON.stringify({ email, password,rememberMe }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Login failed");
        return;
      }

      // Refresh auth context and navigate
      await login();
      navigate("/dashboard");
    } catch {
      setError("Unable to connect to server");
    } finally {
      setLoading(false);
    }
  };

  // Show loading while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#020617]">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#020617]">
      {/* Animated background with floating particles and light flares */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Gradient orbs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl animate-pulse-glow" />
        <div
          className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl animate-pulse-glow"
          style={{ animationDelay: "1.5s" }}
        />
        <div
          className="absolute top-1/2 right-1/3 w-64 h-64 bg-purple-500/15 rounded-full blur-3xl animate-pulse-glow"
          style={{ animationDelay: "0.8s" }}
        />

        {/* Floating particles */}
        <div className="absolute top-1/4 left-1/3 w-2 h-2 bg-indigo-400 rounded-full opacity-60 animate-float" />
        <div
          className="absolute top-1/3 right-1/4 w-1.5 h-1.5 bg-cyan-400 rounded-full opacity-50 animate-float"
          style={{ animationDelay: "0.5s" }}
        />
        <div
          className="absolute bottom-1/3 left-1/4 w-1 h-1 bg-purple-400 rounded-full opacity-70 animate-float"
          style={{ animationDelay: "1s" }}
        />
        <div
          className="absolute top-2/3 right-1/3 w-2 h-2 bg-indigo-300 rounded-full opacity-40 animate-float"
          style={{ animationDelay: "1.5s" }}
        />
        <div
          className="absolute bottom-1/4 right-1/2 w-1.5 h-1.5 bg-cyan-300 rounded-full opacity-60 animate-float"
          style={{ animationDelay: "2s" }}
        />
        <div
          className="absolute top-1/2 left-1/2 w-1 h-1 bg-purple-300 rounded-full opacity-50 animate-float"
          style={{ animationDelay: "2.5s" }}
        />

        {/* Light flares */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500/30 to-transparent" />
        <div className="absolute bottom-0 right-0 w-full h-1 bg-gradient-to-l from-transparent via-cyan-500/30 to-transparent" />
      </div>

      {/* Login Card wrapper */}
      <div className="relative z-10 w-full px-4">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="flex items-center gap-3 justify-center mb-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#6366F1] to-[#22D3EE] flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <span className="text-3xl text-white">TestSphere AI</span>
          </div>
          <h1 className="text-4xl mb-2 bg-gradient-to-r from-white via-indigo-100 to-cyan-100 bg-clip-text text-transparent">
            Welcome Back
          </h1>
          <p className="text-gray-400 text-sm">
            Sign in to continue to your dashboard
          </p>
        </div>

        {/* Card itself (border box) */}
        <div className="glass-strong max-w-lg mx-auto rounded-2xl p-8 shadow-2xl border border-white/10 bg-[#080B16]/80 space-y-6">
          {/* Login Form */}
          <form onSubmit={handleLogin} className="space-y-5">
            {/* Error message display */}
            {error && (
              <div className="bg-red-500/20 border border-red-500/50 text-red-300 px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            <div>
              <label
                htmlFor="email"
                className="text-gray-300 mb-1 block text-sm"
              >
                Email Address
              </label>
              <input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-[#0B0F19] border border-white/10 text-white placeholder:text-gray-600 h-12 px-3 rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="password" className="text-gray-300 text-sm">
                  Password
                </label>
                <button
                  type="button"
                  className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
                  onClick={() => navigate("/forgot-password")}
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full bg-[#0B0F19] border border-white/10 text-white placeholder:text-gray-600 h-12 px-3 pr-10 rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300 transition-colors"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {/* Remember me row */}
            <div className="flex items-center gap-2">
              <input
                id="remember"
                type="checkbox"
                className="h-4 w-4 rounded border border-white/20 bg-transparent checked:bg-indigo-600 checked:border-indigo-600"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <label
                htmlFor="remember"
                className="text-gray-400 cursor-pointer text-sm"
              >
                Remember me for 30 days
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-500/30 transition-all duration-200 hover:shadow-indigo-500/50 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          {/* “Or continue with” section */}
          <div className="space-y-4 pt-2">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-3 text-gray-500 bg-[#080B16]">
                  Or continue with
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Google */}
              <button
                type="button"
                className="h-11 w-full bg-[#0B0F19] border border-white/10 text-white hover:bg-[#1A1F2E] hover:border-white/20 rounded-xl transition-all text- cursor-pointer"
                onClick={() => handleGoogleLogin()}
              >
                Google
              </button>

              {/* GitHub */}
              <button
                type="button"
                className="h-11 w-full bg-[#0B0F19] border border-white/10 text-white hover:bg-[#1A1F2E] hover:border-white/20 rounded-xl transition-all text-sm cursor-pointer"
                onClick={async () => {
                  try {
                    const response = await fetch('/api/github-login');
                    const data = await response.json();
                    window.location.href = data.auth_url;
                  } catch {
                    setError('Failed to initialize GitHub login');
                  }
                }}
              >
                GitHub
              </button>
            </div>
          </div>

          {/* Sign up link */}
          <div className="pt-2 text-center text-sm">
            <p className="text-gray-400">
              Don&apos;t have an account?{" "}
              <button
                type="button"
                  onClick={() => navigate("/register")}
                className="text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
              >
                Sign up for free
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
