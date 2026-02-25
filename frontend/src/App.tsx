import { Routes, Route } from "react-router-dom";
import "./App.css";
import ProtectedRoute from "./components/ProtectedRoute";
import { lazy, Suspense } from "react";


const Landing = lazy(() => import("./pages/Landing"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const DatabasePOC = lazy(() => import("./pages/Database-poc"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const ErrorPage = lazy(() => import("./pages/Error"));

// Protected pages
const TestPreview = lazy(() => import("./pages/TestPreview"));
const LoadingPage = lazy(() => import("./pages/Loading"));
const TestResults = lazy(() => import("./pages/TestResults"));
const GenAiTest = lazy(() => import("./pages/GenAiTest"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const TestHistory = lazy(() => import("./pages/TestHistory"));
const IntegrationTest = lazy(() => import("./pages/IntegrationTest"));
const QueueDashboard = lazy(() => import("./pages/QueueDashboard"));

function PageLoader() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0B0F19 0%, #1a1f2e 100%)',
      color: '#fff',
      fontSize: '1rem',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    }}>
      Loading...
    </div>
  );
}

export default function App() {
  return (
    <div className="App">
      <Suspense fallback={<PageLoader />}>

        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/database-poc" element={<DatabasePOC />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          <Route
            path="/preview"
            element={
              <ProtectedRoute>
                <TestPreview />
              </ProtectedRoute>
            }
          />

          <Route
            path="/results"
            element={
              <ProtectedRoute>
                <TestResults />
              </ProtectedRoute>
            }
          />

          <Route
            path="/loading"
            element={
              <ProtectedRoute>
                <LoadingPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/test"
            element={
              <ProtectedRoute>
                <GenAiTest />
              </ProtectedRoute>
            }
          />

          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/history"
            element={
              <ProtectedRoute>
                <TestHistory />
              </ProtectedRoute>
            }
          />

          <Route
            path="/integration-test"
            element={
              <ProtectedRoute>
                <IntegrationTest />
              </ProtectedRoute>
            }
          />

          <Route
            path="/queue"
            element={
              <ProtectedRoute>
                <QueueDashboard />
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<ErrorPage />} />
        </Routes>
      </Suspense>
    </div>
  );
}