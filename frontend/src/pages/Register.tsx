import React, { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { useNavigate } from "react-router";
import { toast } from "react-toastify";
import { useAuth } from "../context/AuthContext";

const Register: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const getErrorMessage = (err: unknown) =>
    err instanceof Error ? err.message : "Failed to create account";
  
  // Form State
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: ""
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.id]: e.target.value });
    setError(""); // Clear error on typing
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    // 1. Client-side Validation
    if (formData.password !== formData.confirmPassword) {
        setError("Passwords do not match");
        setLoading(false);
        return;
    }

    if (formData.password.length < 6) {
        setError("Password must be at least 6 characters");
        setLoading(false);
        return;
    }

    try {
        // 2. API Call
        const response = await fetch("/api/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: 'include',  // Send/receive cookies
            body: JSON.stringify({
                username: formData.fullName,
                email: formData.email,
                password: formData.password
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Registration failed");
        }

        // 3. Success - Refresh auth context and navigate
        await login();
        toast.success("Account created successfully!");
        navigate("/dashboard");

    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#050816] text-white">
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
        
        {/* Light flares */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500/30 to-transparent" />
        <div className="absolute bottom-0 right-0 w-full h-1 bg-gradient-to-l from-transparent via-cyan-500/30 to-transparent" />
      </div>

      {/* Register card wrapper */}
      <div className="relative z-10 w-full px-4">
        {/* Header (icon + title) */}
        <div className="text-center mb-6">
          <div className="flex items-center gap-3 justify-center mb-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#6366F1] to-[#22D3EE] flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <span className="text-3xl text-white">TestSphere AI</span>
          </div>
          <h1 className="text-4xl mb-2 bg-gradient-to-r from-white via-indigo-100 to-cyan-100 bg-clip-text text-transparent">
            Create Account
          </h1>
          <p className="text-gray-400 text-sm">
            Start generating AI-powered tests today
          </p>
        </div>

        {/* Card itself */}
        <div className="glass-strong max-w-lg mx-auto rounded-2xl p-8 shadow-2xl border border-white/10 bg-[#080B16]/80 space-y-6">
          <form onSubmit={handleRegister} className="space-y-5">
            
            {/* Error Message */}
            {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
                    {error}
                </div>
            )}

            {/* Full name */}
            <div>
              <label
                htmlFor="fullName"
                className="text-gray-300 mb-1 block text-sm"
              >
                Full Name
              </label>
              <input
                id="fullName"
                type="text"
                value={formData.fullName}
                onChange={handleChange}
                required
                placeholder="Enter your full name"
                className="w-full bg-[#0B0F19] border border-white/10 text-white placeholder:text-gray-600 h-12 px-3 rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
              />
            </div>

            {/* Email */}
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
                value={formData.email}
                onChange={handleChange}
                required
                placeholder="you@company.com"
                className="w-full bg-[#0B0F19] border border-white/10 text-white placeholder:text-gray-600 h-12 px-3 rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
              />
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="text-gray-300 mb-1 block text-sm"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={formData.password}
                onChange={handleChange}
                required
                placeholder="Create a strong password"
                className="w-full bg-[#0B0F19] border border-white/10 text-white placeholder:text-gray-600 h-12 px-3 rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
              />
            </div>

            {/* Confirm password */}
            <div>
              <label
                htmlFor="confirmPassword"
                className="text-gray-300 mb-1 block text-sm"
              >
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
                placeholder="Re-enter your password"
                className="w-full bg-[#0B0F19] border border-white/10 text-white placeholder:text-gray-600 h-12 px-3 rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
              />
            </div>

            {/* Create account button */}
            <button
              type="submit"
              disabled={loading}
              className={`w-full h-12 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-500/30 transition-all duration-200 hover:shadow-indigo-500/50 text-sm font-medium cursor-pointer flex items-center justify-center ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating Account...
                  </>
              ) : "Create Account"}
            </button>
          </form>

          {/* Sign in link */}
          <div className="pt-2 text-center text-sm">
            <p className="text-gray-400">
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => navigate("/login")}
                className="text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
              >
                Sign in
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;