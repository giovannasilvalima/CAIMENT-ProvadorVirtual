
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
} from 'react-router-dom';

import type { ReactNode } from 'react';

import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ToastProvider } from '@/components/ui/Toast';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

import LandingPage from '@/pages/Landing/LandingPage';
import LoginPage from '@/pages/Login/LoginPage';
import RecoverPasswordPage from '@/pages/Login/RecoverPasswordPage';
import RegisterPage from '@/pages/Register/RegisterPage';
import VerificationPage from '@/pages/Register/VerificationPage';
import RegisterMeasurementsPage from '@/pages/RegisterMeasurements/RegisterMeasurementsPage';
import OnboardingWelcomePage from '@/pages/Onboarding/OnboardingWelcomePage';
import OnboardingAdjustPage from '@/pages/Onboarding/OnboardingAdjustPage';
import DashboardPage from '@/pages/Dashboard/DashboardPage';
import AvatarCreationPage from '@/pages/AvatarCreation/AvatarCreationPage';
import AvatarProcessingPage from '@/pages/AvatarCreation/AvatarProcessingPage';
import AvatarPage from '@/pages/Avatar/AvatarPage';
import MeasurementsPage from '@/pages/Measurements/MeasurementsPage';
import FittingRoomPage from '@/pages/FittingRoom/FittingRoomPage';
import SettingsPage from '@/pages/Settings/SettingsPage';
import HelpPage from '@/pages/Help/HelpPage';
import PoliciesPage from '@/pages/Policies/PoliciesPage';

interface ProtectedRouteProps {
  requireVerified?: boolean;
  children?: ReactNode;
}

function ProtectedRoute({
  requireVerified = true,
  children,
}: ProtectedRouteProps) {
  const { user, loading, emailVerified } = useAuth();

  if (loading) {
    return null;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requireVerified && !emailVerified) {
    return <Navigate to="/verificacao" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              {/* ROTAS PÚBLICAS */}

              <Route path="/" element={<LandingPage />} />

              <Route path="/login" element={<LoginPage />} />

              <Route
                path="/recuperar-senha"
                element={<RecoverPasswordPage />}
              />

              <Route path="/cadastro" element={<RegisterPage />} />

              {/* POLÍTICAS E DOCUMENTOS - ACESSO PÚBLICO */}

              <Route
                path="/politicas"
                element={<PoliciesPage />}
              />

              {/* ROTA PARA USUÁRIOS AUTENTICADOS */}

              <Route
                element={<ProtectedRoute requireVerified={false} />}
              >
                <Route
                  path="/verificacao"
                  element={<VerificationPage />}
                />
              </Route>

              {/* ROTAS QUE EXIGEM E-MAIL VERIFICADO */}

              <Route element={<ProtectedRoute />}>
                <Route
                  path="/cadastro/medidas"
                  element={<RegisterMeasurementsPage />}
                />

                <Route
                  path="/onboarding"
                  element={<OnboardingWelcomePage />}
                />

                <Route
                  path="/onboarding/ajuste"
                  element={<OnboardingAdjustPage />}
                />

                <Route
                  path="/dashboard"
                  element={<DashboardPage />}
                />

                <Route
                  path="/avatar-criacao"
                  element={<AvatarCreationPage />}
                />

                <Route
                  path="/avatar-criacao/processando"
                  element={<AvatarProcessingPage />}
                />

                <Route
                  path="/avatar"
                  element={<AvatarPage />}
                />

                <Route
                  path="/medidas"
                  element={<MeasurementsPage />}
                />

                <Route
                  path="/provador"
                  element={<FittingRoomPage />}
                />

                <Route
                  path="/configuracoes"
                  element={<SettingsPage />}
                />

                {/* CENTRAL DE AJUDA */}

                <Route
                  path="/ajuda"
                  element={<HelpPage />}
                />
              </Route>

              {/* ROTA NÃO ENCONTRADA */}

              <Route
                path="*"
                element={<Navigate to="/" replace />}
              />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
