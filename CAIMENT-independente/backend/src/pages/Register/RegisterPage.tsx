
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, User, CheckCircle2 } from 'lucide-react';

import { AuthLayout } from '@/components/layout/AuthLayout';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

import {
  registerUser,
  resendVerificationEmail,
  refreshCurrentUser,
} from '@/services/firebase/auth';

import { createUserProfile } from '@/services/firebase/users';
import { useAuth } from '@/context/AuthContext';

export default function RegisterPage() {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [accepted, setAccepted] = useState(false);

  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [checking, setChecking] = useState(false);

  const [verificationSent, setVerificationSent] = useState(false);

  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Cadastro de usuário.
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setError('');
    setSuccessMessage('');

    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();

    // Validar nome.
    if (normalizedName.length < 3) {
      setError('Informe seu nome completo, com pelo menos 3 caracteres.');
      return;
    }

    // Validar e-mail.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Informe um endereço de e-mail válido.');
      return;
    }

    // Validar senha.
    if (password.length < 8) {
      setError('A senha deve ter pelo menos 8 caracteres.');
      return;
    }

    // Confirmar senha.
    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    // Validar política de privacidade.
    if (!accepted) {
      setError('Você precisa aceitar a política de privacidade.');
      return;
    }

    setLoading(true);

    try {
      // Criar uma conta nova.
      // O Firebase bloqueia e-mails que já possuem cadastro.
      const user = await registerUser(normalizedEmail, password);

      // Criar perfil somente para a nova conta.
      await createUserProfile(
        user.uid,
        normalizedName,
        user.email ?? normalizedEmail
      );

      // Atualizar o estado global da autenticação.
      await refreshUser();

      // Verificar se o e-mail já está confirmado.
      const updatedUser = await refreshCurrentUser();

      if (updatedUser?.emailVerified) {
        navigate('/cadastro/medidas', {
          replace: true,
        });

        return;
      }

      // Aguardar confirmação de e-mail.
      setEmail(normalizedEmail);
      setVerificationSent(true);

    } catch (error: unknown) {
      console.error('Erro no cadastro:', error);

      const firebaseError = error as {
        code?: string;
        message?: string;
      };

      switch (firebaseError.code) {
        case 'auth/email-already-in-use':
          setError(
            'Este e-mail já possui uma conta. Faça login para continuar.'
          );
          break;

        case 'auth/invalid-email':
          setError('Digite um endereço de e-mail válido.');
          break;

        case 'auth/weak-password':
          setError('A senha deve possuir pelo menos 8 caracteres.');
          break;

        case 'auth/operation-not-allowed':
          setError(
            'O cadastro por e-mail e senha não está ativado no Firebase.'
          );
          break;

        case 'auth/too-many-requests':
          setError(
            'Muitas tentativas. Aguarde um pouco antes de tentar novamente.'
          );
          break;

        case 'permission-denied':
        case 'firestore/permission-denied':
          setError(
            'Sua conta pode ter sido criada, mas não foi possível salvar seu perfil. Tente novamente ou entre em contato com o suporte.'
          );
          break;

        default:
          setError(
            firebaseError.message ||
            'Não foi possível concluir o cadastro. Tente novamente.'
          );
      }
    } finally {
      setLoading(false);
    }
  };

  // Reenviar confirmação de e-mail.
  const handleResendVerification = async () => {
    setError('');
    setSuccessMessage('');
    setResending(true);

    try {
      await resendVerificationEmail();

      setSuccessMessage(
        'Um novo e-mail de confirmação foi enviado!'
      );
    } catch (error: unknown) {
      const firebaseError = error as {
        code?: string;
        message?: string;
      };

      if (firebaseError.code === 'auth/too-many-requests') {
        setError(
          'Muitas solicitações. Aguarde antes de tentar novamente.'
        );
      } else {
        setError(
          firebaseError.message ||
          'Não foi possível reenviar o e-mail.'
        );
      }
    } finally {
      setResending(false);
    }
  };

  // Verificar confirmação de e-mail.
  const handleCheckVerification = async () => {
    setError('');
    setSuccessMessage('');
    setChecking(true);

    try {
      const updatedUser = await refreshCurrentUser();

      await refreshUser();

      if (!updatedUser?.emailVerified) {
        setError(
          'Ainda não identificamos a confirmação. Verifique seu e-mail e tente novamente.'
        );

        return;
      }

      navigate('/cadastro/medidas', {
        replace: true,
      });

    } catch {
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
            {verificationSent ? (
              <>
                Quase lá!
                <br />
                <span className="text-caiment-purple-600">
                  CAIMENT
                </span>
              </>
            ) : (
              <>
                Cadastre-se
                <br />
                <span className="text-caiment-purple-600">
                  CAIMENT
                </span>
              </>
            )}
          </h1>

          <p className="mt-3 max-w-xs text-sm text-caiment-ink-soft">
            {verificationSent
              ? 'Só precisamos confirmar seu endereço de e-mail para continuar.'
              : 'O seu provador virtual está a poucos passos. Crie sua conta para começar.'}
          </p>

          {!verificationSent && (
            <p className="mt-8 text-sm text-caiment-ink-soft">
              Já tem uma conta?

              <Link to="/login">
                <Button
                  variant="secondary"
                  size="sm"
                  className="ml-1"
                >
                  Entrar
                </Button>
              </Link>
            </p>
          )}

        </div>

        {/* LADO DIREITO */}

        <div>

          {verificationSent ? (

            /* CONFIRMAÇÃO DE E-MAIL */

            <div className="flex flex-col">

              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-caiment-purple-100 text-caiment-purple-600">
                <CheckCircle2 size={30} />
              </div>

              <h2 className="font-display text-lg font-medium text-caiment-ink">
                Confirme seu e-mail
              </h2>

              <p className="mt-3 text-sm leading-relaxed text-caiment-ink-soft">
                Enviamos um link de confirmação para:
              </p>

              <p className="mt-2 break-all font-medium text-caiment-purple-600">
                {email}
              </p>

              <p className="mt-4 text-sm leading-relaxed text-caiment-ink-soft">
                Abra sua caixa de entrada, clique no link enviado pelo Firebase e depois volte aqui para continuar seu cadastro.
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
                    : 'Reenviar e-mail'}
                </Button>

              </div>

              <p className="mt-5 text-xs leading-relaxed text-caiment-ink-soft">
                Não encontrou a mensagem? Verifique também a pasta de spam ou lixo eletrônico.
              </p>

            </div>

          ) : (

            /* FORMULÁRIO DE CADASTRO */

            <>
              <h2 className="font-display text-lg font-medium text-caiment-ink">
                Crie sua conta
              </h2>

              <form
                onSubmit={handleSubmit}
                className="mt-5 space-y-3.5"
              >

                {/* NOME */}

                <Input
                  placeholder="Nome completo"
                  icon={<User size={16} />}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  minLength={3}
                  maxLength={100}
                  autoComplete="name"
                  required
                />

                {/* E-MAIL */}

                <Input
                  placeholder="E-mail"
                  type="email"
                  icon={<Mail size={16} />}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />

                {/* SENHA */}

                <Input
                  placeholder="Senha (mínimo 8 caracteres)"
                  type="password"
                  icon={<Lock size={16} />}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  autoComplete="new-password"
                  required
                />

                {/* CONFIRMAR SENHA */}

                <Input
                  placeholder="Confirmar senha"
                  type="password"
                  icon={<Lock size={16} />}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  minLength={8}
                  autoComplete="new-password"
                  required
                />

                {/* POLÍTICA DE PRIVACIDADE */}

                <label className="flex items-start gap-2.5 pt-1 text-xs text-caiment-ink-soft">

                  <input
                    type="checkbox"
                    checked={accepted}
                    onChange={(e) => setAccepted(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-caiment-line text-caiment-purple-600 focus:ring-caiment-purple-400"
                    required
                  />

                  <span>
                    Li e aceito a{' '}

                    <Link
                      to="/politicas"
                      className="font-medium text-caiment-purple-600 underline underline-offset-2"
                    >
                      política de privacidade
                    </Link>{' '}

                    do CAIMENT.
                  </span>

                </label>

                {/* ERRO */}

                {error && (
                  <p role="alert" className="text-sm text-red-600">
                    {error}
                  </p>
                )}

                {/* BOTÃO */}

                <div className="flex justify-end pt-2">

                  <Button
                    type="submit"
                    size="lg"
                    disabled={loading}
                  >
                    {loading
                      ? 'Criando conta...'
                      : 'Avançar'}
                  </Button>

                </div>

              </form>
            </>
          )}

          {verificationSent && error && (
            <p role="alert" className="mt-4 text-sm text-red-600">
              {error}
            </p>
          )}

          {verificationSent && successMessage && (
            <p role="status" className="mt-4 text-sm text-green-700">
              {successMessage}
            </p>
          )}

        </div>

      </div>
    </AuthLayout>
  );
}
