
import {
  doc,
  getDoc,
  runTransaction,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';

import { db } from './config';

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  gender?: string;
  birthDate?: string;
  profileCompleted?: boolean;
  measurementsCompleted?: boolean;
  avatarStatus?: 'none' | 'processing' | 'ready' | 'error';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type UserProfileUpdate = Partial<
  Omit<UserProfile, 'uid' | 'createdAt' | 'updatedAt'>
>;

// Criar perfil sem sobrescrever dados existentes.
export async function createUserProfile(
  uid: string,
  name: string,
  email: string
) {
  if (!uid.trim()) {
    throw new Error('Identificador do usuário inválido.');
  }

  const normalizedName = name.trim();
  const normalizedEmail = email.trim().toLowerCase();

  if (normalizedName.length < 3) {
    throw new Error('O nome deve possuir pelo menos 3 caracteres.');
  }

  if (!normalizedEmail) {
    throw new Error('E-mail não informado.');
  }

  const userRef = doc(db, 'users', uid);

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(userRef);

    // Não sobrescrever um perfil já existente.
    if (snapshot.exists()) {
      return;
    }

    transaction.set(userRef, {
      uid,
      name: normalizedName,
      email: normalizedEmail,
      profileCompleted: false,
      measurementsCompleted: false,
      avatarStatus: 'none',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  return userRef;
}

// Buscar perfil do usuário.
export async function getUserProfile(
  uid: string
): Promise<UserProfile | null> {
  if (!uid.trim()) {
    throw new Error('Identificador do usuário inválido.');
  }

  const userRef = doc(db, 'users', uid);
  const snapshot = await getDoc(userRef);

  if (!snapshot.exists()) {
    return null;
  }

  return snapshot.data() as UserProfile;
}

// Atualizar dados permitidos do perfil.
export async function updateUserProfile(
  uid: string,
  data: UserProfileUpdate
): Promise<void> {
  if (!uid.trim()) {
    throw new Error('Identificador do usuário inválido.');
  }

  const userRef = doc(db, 'users', uid);

  const {
    uid: ignoredUid,
    createdAt: ignoredCreatedAt,
    updatedAt: ignoredUpdatedAt,
    ...safeData
  } = data as UserProfileUpdate & {
    uid?: string;
    createdAt?: unknown;
    updatedAt?: unknown;
  };

  await updateDoc(userRef, {
    ...safeData,
    updatedAt: serverTimestamp(),
  });
}

// Excluir somente o documento do perfil no Firestore.
export async function deleteUserProfile(
  uid: string
): Promise<void> {
  if (!uid.trim()) {
    throw new Error('Identificador do usuário inválido.');
  }

  const userRef = doc(db, 'users', uid);

  await deleteDoc(userRef);
}
