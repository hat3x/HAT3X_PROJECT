import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { I18nProvider } from "@/lib/i18n";
import { AuthProvider } from "@/lib/auth";
import RequireAuth from "@/components/RequireAuth";
import PinOverlay from "@/components/PinOverlay";
import { FEATURES } from "@/config/features";
import { lazy, Suspense } from "react";

// Eagerly loaded — needed immediately on any entry point
import Index from "./pages/Index";
import Welcome from "./pages/Welcome";
import Register from "./pages/Register";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";

// Lazy loaded — only fetched when the user navigates to that route
const Home = lazy(() => import("./pages/Home"));
const BookAppointment = lazy(() => import("./pages/BookAppointment"));
const Appointments = lazy(() => import("./pages/Appointments"));
const Loyalty = lazy(() => import("./pages/Loyalty"));
const Profile = lazy(() => import("./pages/Profile"));
const ServiceCatalog = lazy(() => import("./pages/ServiceCatalog"));
const NotFound = lazy(() => import("./pages/NotFound"));
// Disabled while their backend is missing in Salon OS — see @/config/features.
// Club, PremiumBenefits, Promos and admin/ApiKeys stay in src/pages/ but are not
// routed. Legacy paths below redirect to /home until the flags are turned on.

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <I18nProvider>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <PinOverlay />
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/welcome" element={<Welcome />} />
                <Route path="/register" element={<Register />} />
                <Route path="/login" element={<Login />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/home" element={<RequireAuth><Home /></RequireAuth>} />
                <Route path="/services" element={<RequireAuth><ServiceCatalog /></RequireAuth>} />
                <Route path="/book" element={<RequireAuth><BookAppointment /></RequireAuth>} />
                <Route path="/appointments" element={<RequireAuth><Appointments /></RequireAuth>} />
                <Route path="/loyalty" element={<RequireAuth><Loyalty /></RequireAuth>} />
                <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
                {/* Disabled features (no Salon OS backend yet) — see @/config/features.
                    Legacy paths redirect to /home so old links/bookmarks don't 404. */}
                {!FEATURES.subscriptions && (
                  <>
                    <Route path="/club" element={<Navigate to="/home" replace />} />
                    <Route path="/premium" element={<Navigate to="/home" replace />} />
                  </>
                )}
                {!FEATURES.promos && (
                  <Route path="/promos" element={<Navigate to="/home" replace />} />
                )}
                {!FEATURES.admin && (
                  <Route path="/admin/*" element={<Navigate to="/home" replace />} />
                )}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </I18nProvider>
  </QueryClientProvider>
);

export default App;
