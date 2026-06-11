import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { StaffGuard } from "@/components/StaffGuard";
import Index from "./pages/Index.tsx";
import Login from "./pages/Login.tsx";
import Cocina from "./pages/Cocina.tsx";
import Caja from "./pages/Caja.tsx";
import Historico from "./pages/Historico.tsx";
import StaffLocalPicker from "./pages/StaffLocalPicker.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Index />
                </ProtectedRoute>
              }
            />
            <Route
              path="/seleccionar-local"
              element={
                <ProtectedRoute>
                  <StaffLocalPicker />
                </ProtectedRoute>
              }
            />
            <Route
              path="/cocina"
              element={
                <ProtectedRoute requiredRole="cocina">
                  <StaffGuard role="cocina">
                    <Cocina />
                  </StaffGuard>
                </ProtectedRoute>
              }
            />
            <Route
              path="/caja"
              element={
                <ProtectedRoute requiredRole="caja">
                  <StaffGuard role="caja">
                    <Caja />
                  </StaffGuard>
                </ProtectedRoute>
              }
            />
            <Route
              path="/historico"
              element={
                <ProtectedRoute requiredRole={["caja", "admin"]}>
                  <Historico />
                </ProtectedRoute>
              }
            />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
