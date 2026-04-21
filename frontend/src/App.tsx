import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from "react-router-dom";
import AppShell from "@/components/layout/AppShell";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import DocDetail from "@/pages/DocDetail";
import Docs from "@/pages/Docs";
import LawModel from "@/pages/LawModel";
import Login from "@/pages/Login";
import RewriteReview from "@/pages/RewriteReview";
import Tools from "@/pages/Tools";
import Workbench from "@/pages/Workbench";

function ShellLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ShellLayout />}>
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Workbench />
              </ProtectedRoute>
            }
          />
          <Route
            path="/docs"
            element={
              <ProtectedRoute>
                <Docs />
              </ProtectedRoute>
            }
          />
          <Route
            path="/tools"
            element={
              <ProtectedRoute>
                <Tools />
              </ProtectedRoute>
            }
          />
          <Route
            path="/law"
            element={
              <ProtectedRoute>
                <LawModel />
              </ProtectedRoute>
            }
          />
          <Route
            path="/docs/:docId"
            element={
              <ProtectedRoute>
                <DocDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/docs/:docId/rewrite"
            element={
              <ProtectedRoute>
                <RewriteReview />
              </ProtectedRoute>
            }
          />
          <Route
            path="/docs/:docId/rewrite/:sessionId"
            element={
              <ProtectedRoute>
                <RewriteReview />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Router>
  );
}
