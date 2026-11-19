
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Mail, Lock, CheckCircle2 } from 'lucide-react';

import { AuthLayout } from '@/components/layout/AuthLayout';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

import {
  loginUser,
  resendVerificationEmail,
  refreshCurrentUser,
} from '@/services/firebase/auth';

import { useAuth } from '@/context/AuthContext';

const PRODUCT_STORAGE_KEY = 'caiment_product';
const REGISTRATION_PENDING_KEY = 'caiment_registration_pending';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const { refreshUser } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [checking, setChecking] = useState(false);

  const [pendingVerification, setPendingVerification] = useState(false);

  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Recupera o produto selecionado no FitSense.
  const getProductPayload = () => {
    const params = new URLSearchParams(location.search);

    return (
      params.get('caiment_product') ||
      params.get('fitsense_product')
    );
  };

  // Preserva o produto durante a autenticação.
  const preserveSelectedProduct = () => {
    const productPayload = getProductPayload();

    if (productPayload) {
      sessionStorage.setItem(
        PRODUCT_STORAGE_KEY,
        productPayload
      );
    }
  };

  useEffect(() => {
    try {
      preserveSelectedProduct();
    } catch (storageError) {
      console.error(
        'Não foi possível preservar o produto selecionado:',
        storageError
      );
    }
  }, [location.search]);

  // Define o destino depois da confirmação.
  const continueAfterVerification = () => {
    const registrationPending =
      sessionStorage.getItem(REGISTRATION_PENDING_KEY);

    if (registrationPending === 'true') {
      sessionStorage.removeItem(REGISTRATION_PENDING_KEY);

      navigate('/cadastro/medidas', {
        replace: true,
      });

      return;
    }

    navigate('/dashboard', {
      replace: true,
    });
  };

  // Login.
  const handleSubmit = async (
    e: FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();

    setError('');
    setSuccessMessage('');
    setPendingVerification(false);

    setLoading(true);

    try {
      preserveSelectedProduct();

      const user = await loginUser(email, password);

      // Impede acesso sem confirmação do e-mail.
      if (!user.emailVerified) {
        setPendingVerification(true);

        setError(
          'Seu e-mail ainda não foi confirmado. Confirme seu endereço para acessar o CAIMENT.'
        );

        return;
      }

      // Atualiza o contexto de autenticação.
      await refreshUser();

      // Acesso liberado.
      continueAfterVerification();

    } catch (error: unknown) {
      console.error('Erro no login:', error);

      const firebaseError = error as {
        code?: string;
        message?: string;
      };

      switch (firebaseError.code) {
        case 'auth/invalid-credential':
          setError('E-mail ou senha incorretos.');
          break;

        case 'auth/user-not-found':
          setError(
            'Não encontramos uma conta com este e-mail.'
          );
          break;

        case 'auth/wrong-password':
          setError('Senha incorreta.');
          break;

        case 'auth/invalid-email':
          setError('Digite um e-mail válido.');
          break;

        case 'auth/user-disabled':
          setError('Esta conta foi desativada.');
          break;

        case 'auth/too-many-requests':
          setError(
            'Muitas tentativas. Aguarde alguns minutos e tente novamente.'
          );
          break;

        default:
          setError(
            firebaseError.message ||
            'Não foi possível entrar. Tente novamente.'
          );
      }
    } finally {
      setLoading(false);
    }
  };

  // Reenvia o e-mail de confirmação.
  const handleResendVerification = async () => {
    setError('');
    setSuccessMessage('');
    setResending(true);

    try {
      await resendVerificationEmail();

      setSuccessMessage(
        'E-mail de confirmação reenviado com sucesso!'
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
        firebaseError.code === 'auth/user-token-expired' ||
        firebaseError.code === 'auth/invalid-user-token'
      ) {
        setError(
          'Sua sessão expirou. Entre novamente na sua conta para reenviar a confirmação.'
        );
      } else {
        setError(
          firebaseError.message ||
          'Não foi possível reenviar o e-mail de confirmação.'
        );
      }
    } finally {
      setResending(false);
    }
  };

  // Confere se o e-mail já foi confirmado.
  const handleCheckVerification = async () => {
    setError('');
    setSuccessMessage('');
    setChecking(true);

    try {
      const updatedUser = await refreshCurrentUser();

      await refreshUser();

      if (updatedUser?.emailVerified) {
        continueAfterVerification();
        return;
      }

      setError(
        'Ainda não identificamos a confirmação. Verifique sua caixa de entrada e tente novamente.'
      );
    } catch (error) {
      console.error(
        'Erro ao verificar confirmação:',
        error
      );

      setError(
        'Não foi possível verificar seu e-mail. Tente novamente.'
      );
    } finally {
      setChecking(false);
    }
  };

  return (
    <AuthLayout wide>
      <div className="grid gap-8 sm:grid-cols-2">

        {/* LADO ESQUERDO */}

        <div className="flex flex-col justify-center">
          <h1 className="font-display text-3xl font-medium leading-tight text-caiment-ink">
            Bem-vindo
            <br />

            <span className="text-caiment-purple-600">
              de volta
            </span>
          </h1>

          <p className="mt-3 max-w-xs text-sm text-caiment-ink-soft">
            Entre na sua conta para continuar sua experiência
            no CAIMENT.
          </p>

          {!pendingVerification && (
            <p className="mt-8 text-sm text-caiment-ink-soft">
              Ainda não tem uma conta?{' '}

              <Link to={`/cadastro${location.search}`}>
                <Button
                  variant="secondary"
                  size="sm"
                  className="ml-1"
                >
                  Criar conta
                </Button>
              </Link>
            </p>
          )}
        </div>

        {/* LADO DIREITO */}

        <div>
          {pendingVerification ? (

            /* VERIFICAÇÃO DE E-MAIL */

            <div className="flex flex-col">
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-caiment-purple-100 text-caiment-purple-600">
                <CheckCircle2 size={30} />
              </div>

              <h2 className="font-display text-lg font-medium text-caiment-ink">
                Confirme seu e-mail
              </h2>

              <p className="mt-3 text-sm leading-relaxed text-caiment-ink-soft">
                Sua conta foi encontrada, mas precisamos
                confirmar seu endereço antes de liberar
                o acesso ao CAIMENT.
              </p>

              <p className="mt-4 break-all text-sm font-medium text-caiment-purple-600">
                {email}
              </p>

              <p className="mt-4 text-sm leading-relaxed text-caiment-ink-soft">
                Abra o e-mail enviado pelo Firebase,
                clique no link de confirmação e volte
                para esta página.
              </p>

              <div className="mt-6 space-y-3">
                <Button
                  type="button"
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
                  type="button"
                  variant="secondary"
                  size="lg"
                  className="w-full"
                  disabled={resending}
                  onClick={handleResendVerification}
                >
                  {resending
                    ? 'Enviando...'
                    : 'Reenviar confirmação'}
                </Button>
              </div>

              <p className="mt-5 text-xs leading-relaxed text-caiment-ink-soft">
                Caso não encontre a mensagem, verifique
                também a pasta de spam ou lixo eletrônico.
              </p>

              <Link
                to="/login"
                className="mt-5 text-center text-sm text-caiment-purple-600 hover:underline"
                onClick={() => {
                  setPendingVerification(false);
                  setError('');
                  setSuccessMessage('');
                }}
              >
                Voltar ao login
              </Link>
            </div>

          ) : (

            /* FORMULÁRIO DE LOGIN */

            <>
              <h2 className="font-display text-lg font-medium text-caiment-ink">
                Entre na sua conta
              </h2>

              <form
                onSubmit={handleSubmit}
                className="mt-5 space-y-3.5"
              >
                <Input
                  placeholder="E-mail"
                  type="email"
                  icon={<Mail size={16} />}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />

                <Input
                  placeholder="Senha"
                  type="password"
                  icon={<Lock size={16} />}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />

                <div className="flex justify-end">
                  <Link
                    to="/recuperar-senha"
                    className="text-xs text-caiment-purple-600 hover:underline"
                  >
                    Esqueci minha senha
                  </Link>
                </div>

                {error && (
                  <p
                    role="alert"
                    className="text-sm text-red-600"
                  >
                    {error}
                  </p>
                )}

                <div className="flex justify-end pt-2">
                  <Button
                    type="submit"
                    size="lg"
                    disabled={loading}
                  >
                    {loading ? 'Entrando...' : 'Entrar'}
                  </Button>
                </div>
              </form>
            </>
          )}

          {pendingVerification && error && (
            <p
              role="alert"
              className="mt-4 text-sm text-red-600"
            >
              {error}
            </p>
          )}

          {pendingVerification && successMessage && (
            <p
              role="status"
              className="mt-4 text-sm text-green-700"
            >
              {successMessage}
            </p>
          )}
        </div>
      </div>
    </AuthLayout>
  );
}
