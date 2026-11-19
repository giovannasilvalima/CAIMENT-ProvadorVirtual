
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  onAuthStateChanged,
  deleteUser,
  reload,
  type User,
} from 'firebase/auth';

import { auth } from './config';

// Normalizar e validar e-mail.
function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();

  if (
    !normalized ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
  ) {
    throw new Error('Informe um endereço de e-mail válido.');
  }

  return normalized;
}

// Validar senha.
function validatePassword(password: string): void {
  if (password.length < 8) {
    throw new Error('A senha deve possuir pelo menos 8 caracteres.');
  }
}

// Cadastro de usuário com envio automático de confirmação.
export async function registerUser(
  email: string,
  password: string
): Promise<User> {
  const normalizedEmail = normalizeEmail(email);

  validatePassword(password);

  const credential = await createUserWithEmailAndPassword(
    auth,
    normalizedEmail,
    password
  );

  try {
    await sendEmailVerification(credential.user);
  } catch (error) {
    // A conta já foi criada no Firebase.
    // Não excluir automaticamente a conta se o envio falhar.
    throw error;
  }

  return credential.user;
}

// Login com e-mail e senha.
export async function loginUser(
  email: string,
  password: string
): Promise<User> {
  const normalizedEmail = normalizeEmail(email);

  const credential = await signInWithEmailAndPassword(
    auth,
    normalizedEmail,
    password
  );

  await reload(credential.user);

  return auth.currentUser ?? credential.user;
}

// Reenviar confirmação de e-mail.
export async function resendVerificationEmail(): Promise<void> {
  const user = auth.currentUser;

  if (!user) {
    throw new Error('Nenhum usuário está autenticado.');
  }

  await reload(user);

  const updatedUser = auth.currentUser;

  if (!updatedUser) {
    throw new Error('Não foi possível atualizar a autenticação.');
  }

  if (updatedUser.emailVerified) {
    throw new Error('Este e-mail já foi verificado.');
  }

  await sendEmailVerification(updatedUser);
}

// Atualizar os dados do usuário autenticado.
export async function refreshCurrentUser(): Promise<User | null> {
  const user = auth.currentUser;

  if (!user) {
    return null;
  }

  await reload(user);

  return auth.currentUser;
}

// Verificar se o usuário confirmou o e-mail.
export async function isEmailVerified(): Promise<boolean> {
  const user = await refreshCurrentUser();

  return user?.emailVerified ?? false;
}

// Encerrar sessão.
export async function logoutUser(): Promise<void> {
  await signOut(auth);
}

// Excluir conta autenticada.
export async function deleteCurrentUser(): Promise<void> {
  const user = auth.currentUser;

  if (!user) {
    throw new Error('Nenhum usuário está autenticado.');
  }

  await deleteUser(user);
}

// Recuperação de senha.
export async function resetPassword(
  email: string
): Promise<void> {
  const normalizedEmail = normalizeEmail(email);

  await sendPasswordResetEmail(auth, normalizedEmail);
}

// Observar alterações na autenticação.
export function listenToAuthChanges(
  callback: (user: User | null) => void
) {
  return onAuthStateChanged(auth, callback);
}
