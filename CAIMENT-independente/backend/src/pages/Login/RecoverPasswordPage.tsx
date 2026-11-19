
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Mail, CheckCircle2, ArrowLeft } from 'lucide-react';

import { AuthLayout } from '@/components/layout/AuthLayout';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

import { resetPassword } from '@/services/firebase/auth';

export default function RecoverPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setError('');
    setSent(false);
    setLoading(true);

    try {
      await resetPassword(email);

      setSent(true);
    } catch (error: unknown) {
      console.error('Erro ao recuperar senha:', error);

      const firebaseError = error as {
        code?: string;
        message?: string;
      };

      switch (firebaseError.code) {
        case 'auth/invalid-email':
          setError('Digite um endereço de e-mail válido.');
          break;

        case 'auth/user-not-found':
          setError('Não encontramos uma conta com esse e-mail.');
          break;

        case 'auth/too-many-requests':
          setError(
            'Muitas solicitações. Aguarde alguns minutos e tente novamente.'
          );
          break;

        case 'auth/network-request-failed':
          setError(
            'Erro de conexão. Verifique sua internet e tente novamente.'
          );
          break;

        default:
          setError(
            firebaseError.message ||
            'Não foi possível enviar o e-mail. Tente novamente.'
          );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div className="text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-caiment-purple-100 text-caiment-purple-600">
          {sent ? (
            <CheckCircle2 size={32} />
          ) : (
            <Mail size={32} />
          )}
        </div>

        <h1 className="font-display text-2xl font-medium text-caiment-ink">
          {sent ? 'Verifique seu e-mail' : 'Esqueceu sua senha?'}
        </h1>

        <p className="mt-4 text-sm leading-relaxed text-caiment-ink-soft">
          {sent
            ? 'Se houver uma conta cadastrada com esse endereço, você receberá um link para redefinir sua senha. Verifique também a pasta de spam.'
            : 'Informe o e-mail utilizado no seu cadastro. Enviaremos um link para você criar uma nova senha.'}
        </p>

        {!sent ? (
          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <Input
              placeholder="Seu e-mail"
              type="email"
              icon={<Mail size={16} />}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />

            {error && (
              <p role="alert" className="text-left text-sm text-red-600">
                {error}
              </p>
            )}

            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={loading}
            >
              {loading ? 'Enviando...' : 'Enviar link de recuperação'}
            </Button>
          </form>
        ) : (
          <div className="mt-8">
            <Button
              type="button"
              size="lg"
              className="w-full"
              onClick={() => {
                setSent(false);
                setEmail('');
              }}
            >
              Enviar para outro e-mail
            </Button>
          </div>
        )}

        <Link
          to="/login"
          className="mt-6 inline-flex items-center justify-center gap-2 text-sm font-medium text-caiment-purple-600 hover:underline"
        >
          <ArrowLeft size={16} />
          Voltar para o login
        </Link>
      </div>
    </AuthLayout>
  );
}
