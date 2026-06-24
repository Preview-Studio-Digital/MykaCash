import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index.tsx";
import Login from "./pages/Login.tsx";
import Admin from "./pages/Admin.tsx";
import Historico from "./pages/Historico.tsx";
import Analises from "./pages/Analises.tsx";
import NotFound from "./pages/NotFound.tsx";

import { useEffect } from "react";

const ScrollTracker = () => {
  useEffect(() => {
    let lastScrollY = window.scrollY;
    let timeoutId: number | null = null;

    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const body = document.body;

      if (currentScrollY < lastScrollY) {
        body.classList.add("scrolling-up");
        body.classList.remove("scrolling-down");
      } else if (currentScrollY > lastScrollY) {
        body.classList.add("scrolling-down");
        body.classList.remove("scrolling-up");
      }

      lastScrollY = currentScrollY;

      // Remove classes after scrolling stops
      if (timeoutId) window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        body.classList.remove("scrolling-up", "scrolling-down");
      }, 150);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, []);

  return null;
};

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <ScrollTracker />
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
                  <Historico />
                </ProtectedRoute>
              }
            />
            <Route
              path="/cadastro"
              element={
                <ProtectedRoute>
                  <Index />
                </ProtectedRoute>
              }
            />
            <Route
              path="/analises"
              element={
                <ProtectedRoute>
                  <Analises />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <ProtectedRoute>
                  <Admin />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
