
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import type { User } from 'firebase/auth';

import {
  listenToAuthChanges,
  logoutUser,
  refreshCurrentUser,
} from '@/services/firebase/auth';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  emailVerified: boolean;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext =
  createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [user, setUser] = useState<User | null>(null);

  const [loading, setLoading] = useState(true);

  const [emailVerified, setEmailVerified] = useState(false);

  useEffect(() => {
    let active = true;

    const unsubscribe = listenToAuthChanges(async (currentUser) => {
      if (!active) return;

      if (!currentUser) {
        setUser(null);
        setEmailVerified(false);
        setLoading(false);
        return;
      }

      try {
        const updatedUser = await refreshCurrentUser();

        if (!active) return;

        if (updatedUser?.uid === currentUser.uid) {
          setUser(updatedUser);
          setEmailVerified(updatedUser.emailVerified);
        } else {
          setUser(currentUser);
          setEmailVerified(currentUser.emailVerified);
        }
      } catch (error) {
        console.error(
          'Erro ao atualizar autenticação:',
          error
        );

        if (!active) return;

        setUser(currentUser);
        setEmailVerified(currentUser.emailVerified);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  // Encerrar sessão.
  const logout = async (): Promise<void> => {
    await logoutUser();

    setUser(null);
    setEmailVerified(false);
  };

  // Atualizar usuário e estado de confirmação do e-mail.
  const refreshUser = async (): Promise<void> => {
    const currentUser = await refreshCurrentUser();

    setUser(currentUser);
    setEmailVerified(currentUser?.emailVerified ?? false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        emailVerified,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      'useAuth deve ser usado dentro de AuthProvider'
    );
  }

  return context;
}
