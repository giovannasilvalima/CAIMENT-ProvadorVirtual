
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { AuthProvider } from '@/context/AuthContext';
import { ToastProvider } from '@/components/ui/Toast';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

// =============================
// PÁGINAS DO CAIMENT
// =============================

import LoginPage from '@/pages/Login/LoginPage';
import RegisterPage from '@/pages/Register/RegisterPage';
import VerificationPage from '@/pages/Register/VerificationPage';
import RegisterMeasurementsPage from '@/pages/RegisterMeasurements/RegisterMeasurementsPage';

import PoliciesPage from '@/pages/Policies/PoliciesPage';
import HelpPage from '@/pages/Help/HelpPage';

import OnboardingWelcomePage from '@/pages/Onboarding/OnboardingWelcomePage';
import OnboardingAdjustPage from '@/pages/Onboarding/OnboardingAdjustPage';

import DashboardPage from '@/pages/Dashboard/DashboardPage';

import AvatarCreationPage from '@/pages/AvatarCreation/AvatarCreationPage';
import AvatarProcessingPage from '@/pages/AvatarCreation/AvatarProcessingPage';

import AvatarPage from '@/pages/Avatar/AvatarPage';
import MeasurementsPage from '@/pages/Measurements/MeasurementsPage';
import FittingRoomPage from '@/pages/FittingRoom/FittingRoomPage';
import SettingsPage from '@/pages/Settings/SettingsPage';

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>

              {/* Página inicial */}
              <Route
                path="/"
                element={<Navigate to="/login" replace />}
              />

              {/* CONTA E AUTENTICAÇÃO */}

              <Route
                path="/login"
                element={<LoginPage />}
              />

              <Route
                path="/cadastro"
                element={<RegisterPage />}
              />

              <Route
                path="/cadastro/medidas"
                element={<RegisterMeasurementsPage />}
              />

              <Route
                path="/verificacao"
                element={<VerificationPage />}
              />

              {/* PÁGINAS PÚBLICAS */}

              <Route
                path="/politicas"
                element={<PoliciesPage />}
              />

              <Route
                path="/ajuda"
                element={<HelpPage />}
              />

              {/* ONBOARDING */}

              <Route
                path="/onboarding"
                element={<OnboardingWelcomePage />}
              />

              <Route
                path="/onboarding/ajuste"
                element={<OnboardingAdjustPage />}
              />

              {/* ÁREA PRINCIPAL */}

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

              {/* ROTA NÃO ENCONTRADA */}

              <Route
                path="*"
                element={<Navigate to="/login" replace />}
              />

            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
