import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { I18nProvider } from "@/lib/i18n";
import { AuthProvider } from "@/lib/auth";
import RequireAuth from "@/components/RequireAuth";
import RequireAdmin from "@/components/RequireAdmin";
import PinOverlay from "@/components/PinOverlay";
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
const Club = lazy(() => import("./pages/Club"));
const Promos = lazy(() => import("./pages/Promos"));
const ServiceCatalog = lazy(() => import("./pages/ServiceCatalog"));
const PremiumBenefits = lazy(() => import("./pages/PremiumBenefits"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ApiKeys = lazy(() => import("./pages/admin/ApiKeys"));

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
                <Route path="/club" element={<RequireAuth><Club /></RequireAuth>} />
                <Route path="/premium" element={<RequireAuth><PremiumBenefits /></RequireAuth>} />
                <Route path="/promos" element={<RequireAuth><Promos /></RequireAuth>} />
                <Route path="/admin/api-keys" element={<RequireAdmin><ApiKeys /></RequireAdmin>} />
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
