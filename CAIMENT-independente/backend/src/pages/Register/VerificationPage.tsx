
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, CheckCircle2 } from 'lucide-react';

import { AuthLayout } from '@/components/layout/AuthLayout';
import { Button } from '@/components/ui/Button';

import { useAuth } from '@/context/AuthContext';

import {
  refreshCurrentUser,
  resendVerificationEmail,
} from '@/services/firebase/auth';

export default function VerificationPage() {
  const navigate = useNavigate();

  const {
    user,
    loading,
    refreshUser,
  } = useAuth();

  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login', { replace: true });
    }
  }, [loading, user, navigate]);

  const continueAfterVerification = () => {
    const registrationPending =
      sessionStorage.getItem('caiment_registration_pending');

    if (registrationPending === 'true') {
      sessionStorage.removeItem('caiment_registration_pending');

      navigate('/cadastro/medidas', {
        replace: true,
      });

      return;
    }

    navigate('/dashboard', {
      replace: true,
    });
  };

  // Verifica a confirmação diretamente no Firebase.
  const handleCheckVerification = async () => {
    setError('');
    setSuccess('');
    setChecking(true);

    try {
      const updatedUser = await refreshCurrentUser();

      await refreshUser();

      if (updatedUser?.emailVerified) {
        continueAfterVerification();
        return;
      }

      setError(
        'Seu e-mail ainda não foi confirmado. Acesse o link enviado para sua caixa de entrada.'
      );
    } catch (error) {
      console.error('Erro ao verificar e-mail:', error);

      setError(
        'Não foi possível verificar seu e-mail. Tente novamente.'
      );
    } finally {
      setChecking(false);
    }
  };

  // Reenvia o link de confirmação.
  const handleResend = async () => {
    setError('');
    setSuccess('');
    setResending(true);

    try {
      await resendVerificationEmail();

      setSuccess(
        'Um novo link de confirmação foi enviado para seu e-mail.'
      );
    } catch (error: unknown) {
      const firebaseError = error as {
        code?: string;
        message?: string;
      };

      if (firebaseError.code === 'auth/too-many-requests') {
        setError(
          'Muitas solicitações. Aguarde alguns minutos antes de tentar novamente.'
        );
      } else if (
        firebaseError.code === 'auth/user-token-expired'
      ) {
        setError(
          'Sua sessão expirou. Entre novamente na sua conta.'
        );
      } else if (
        firebaseError.code === 'auth/invalid-user-token'
      ) {
        setError(
          'Sua sessão não é mais válida. Entre novamente na sua conta.'
        );
      } else {
        setError(
          firebaseError.message ||
          'Não foi possível enviar o e-mail de confirmação.'
        );
      }
    } finally {
      setResending(false);
    }
  };

  if (loading || !user) {
    return null;
  }

  return (
    <AuthLayout>
      <div className="text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-caiment-purple-100 text-caiment-purple-600">
          {user.emailVerified ? (
            <CheckCircle2 size={32} />
          ) : (
            <Mail size={32} />
          )}
        </div>

        <h1 className="font-display text-2xl font-medium text-caiment-ink">
          {user.emailVerified
            ? 'E-mail confirmado!'
            : 'Confirme seu e-mail'}
        </h1>

        <p className="mt-4 text-sm leading-relaxed text-caiment-ink-soft">
          {user.emailVerified
            ? 'Seu endereço foi confirmado. Você já pode continuar sua experiência no CAIMENT.'
            : 'Enviamos um link de confirmação para o endereço abaixo. Abra sua caixa de entrada e clique no link para confirmar sua conta.'}
        </p>

        <p className="mt-4 break-all font-medium text-caiment-purple-600">
          {user.email}
        </p>

        {!user.emailVerified && (
          <>
            <div className="mt-8 space-y-3">
              <Button
                size="lg"
                className="w-full"
                disabled={checking}
                onClick={handleCheckVerification}
              >
                {checking
                  ? 'Verificando...'
                  : 'Já confirmei meu e-mail'}
              </Button>

              <Button
                variant="secondary"
                size="lg"
                className="w-full"
                disabled={resending}
                onClick={handleResend}
              >
                {resending
                  ? 'Enviando...'
                  : 'Reenviar e-mail'}
              </Button>
            </div>

            <p className="mt-5 text-xs leading-relaxed text-caiment-ink-soft">
              Não encontrou a mensagem? Verifique sua pasta de spam ou lixo eletrônico.
            </p>
          </>
        )}

        {user.emailVerified && (
          <Button
            size="lg"
            className="mt-8 w-full"
            onClick={continueAfterVerification}
          >
            Continuar
          </Button>
        )}

        {error && (
          <p
            role="alert"
            className="mt-5 text-sm text-red-600"
          >
            {error}
          </p>
        )}

        {success && (
          <p
            role="status"
            className="mt-5 text-sm text-green-700"
          >
            {success}
          </p>
        )}
      </div>
    </AuthLayout>
  );
}
