
import { useEffect, useState } from 'react';

import {
  User,
  Ruler,
  Pencil,
  Mail as MailIcon,
  Trash2,
  LogOut,
} from 'lucide-react';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

import { useAuth } from '@/context/AuthContext';

import {
  getUserProfile,
  updateUserProfile,
  deleteUserProfile,
} from '@/services/firebase/users';

import {
  getMeasurements,
  saveMeasurements,
} from '@/services/firebase/measurements';

import { deleteCurrentUser } from '@/services/firebase/auth';

import type {
  EditableMeasurements,
  UserMeasurements,
} from '@/types/measurements';

import {
  defaultUnisexMeasurements,
} from '@/data/bodyMeasurement';

// ============================================================
// TIPOS
// ============================================================

type Section = 'perfil' | 'medidas';

const sections: {
  id: Section;
  label: string;
  icon: typeof User;
}[] = [
  {
    id: 'perfil',
    label: 'Informações da conta',
    icon: User,
  },
  {
    id: 'medidas',
    label: 'Medidas',
    icon: Ruler,
  },
];

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================

export default function SettingsPage() {
  const [active, setActive] = useState<Section>('perfil');

  const { show } = useToast();
  const { user, logout } = useAuth();

  // ==========================================================
  // PERFIL
  // ==========================================================

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);

  // ==========================================================
  // MEDIDAS
  // ==========================================================

  const [measurements, setMeasurements] =
    useState<UserMeasurements>({
      ...defaultUnisexMeasurements,
    });

  const [loadingMeasurements, setLoadingMeasurements] =
    useState(false);

  const [savingMeasurements, setSavingMeasurements] =
    useState(false);

  // ==========================================================
  // CARREGAR PERFIL
  // ==========================================================

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      if (!user) {
        setLoadingProfile(false);
        return;
      }

      setLoadingProfile(true);

      try {
        const profile = await getUserProfile(user.uid);

        if (cancelled) return;

        setName(
          profile?.name ||
          user.displayName ||
          '',
        );

        setEmail(
          profile?.email ||
          user.email ||
          '',
        );
      } catch (error) {
        if (cancelled) return;

        console.error('Erro ao carregar perfil:', error);

        setName(user.displayName || '');
        setEmail(user.email || '');

        show(
          'Não foi possível carregar todas as informações da conta.',
        );
      } finally {
        if (!cancelled) {
          setLoadingProfile(false);
        }
      }
    }

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [user, show]);

  // ==========================================================
  // CARREGAR MEDIDAS
  // ==========================================================

  useEffect(() => {
    let cancelled = false;

    async function loadMeasurements() {
      if (!user || active !== 'medidas') {
        return;
      }

      setLoadingMeasurements(true);

      try {
        const saved = await getMeasurements(user.uid);

        if (cancelled || !saved) return;

        const savedData = saved as UserMeasurements & {
          medidas?: Partial<UserMeasurements>;
        };

        const { medidas, ...rest } = savedData;

        setMeasurements((previous) => ({
          ...previous,
          ...rest,
          ...(medidas ?? {}),
        }));
      } catch (error) {
        if (cancelled) return;

        console.error('Erro ao carregar medidas:', error);

        show('Não foi possível carregar suas medidas.');
      } finally {
        if (!cancelled) {
          setLoadingMeasurements(false);
        }
      }
    }

    loadMeasurements();

    return () => {
      cancelled = true;
    };
  }, [user, active, show]);

  // ==========================================================
  // ALTERAR MEDIDA
  // ==========================================================

  const updateMeasurement = (
    key: keyof EditableMeasurements,
    value: string,
  ) => {
    setMeasurements((previous) => ({
      ...previous,
      [key]: value === '' ? 0 : Number(value),
    }));
  };

  // ==========================================================
  // SALVAR PERFIL
  // ==========================================================

  const handleSaveProfile = async () => {
    if (!user) {
      show(
        'Você precisa estar conectado para salvar as alterações.',
      );
      return;
    }

    if (!name.trim()) {
      show('Digite seu nome.');
      return;
    }

    setSavingProfile(true);

    try {
      await updateUserProfile(user.uid, {
        name: name.trim(),
      });

      show('Informações da conta atualizadas com sucesso.');
    } catch (error) {
      console.error('Erro ao atualizar perfil:', error);

      show(
        'Não foi possível atualizar as informações da conta.',
      );
    } finally {
      setSavingProfile(false);
    }
  };

  // ==========================================================
  // SAIR DA CONTA
  // ==========================================================

  const handleLogout = async () => {
    try {
      await logout();

      window.location.href = '/login';
    } catch (error) {
      console.error('Erro ao sair da conta:', error);

      show('Não foi possível encerrar sua sessão.');
    }
  };

  // ==========================================================
  // EXCLUIR CONTA
  // ==========================================================

  const handleDeleteAccount = async () => {
    if (!user) {
      show(
        'Você precisa estar conectado para excluir sua conta.',
      );
      return;
    }

    const confirmed = window.confirm(
      'Tem certeza que deseja excluir sua conta? Essa ação não poderá ser desfeita.',
    );

    if (!confirmed) return;

    try {
      await deleteUserProfile(user.uid);

      await deleteCurrentUser();

      window.location.href = '/login';
    } catch (error: any) {
      console.error('Erro ao excluir conta:', error);

      if (
        error?.code === 'auth/requires-recent-login'
      ) {
        show(
          'Por segurança, faça login novamente antes de excluir sua conta.',
        );

        return;
      }

      show(
        'Não foi possível excluir sua conta. Tente novamente.',
      );
    }
  };

  // ==========================================================
  // SALVAR MEDIDAS
  // ==========================================================

  const handleSaveMeasurements = async () => {
    if (!user) {
      show(
        'Você precisa estar conectado para salvar suas medidas.',
      );
      return;
    }

    const requiredMeasurements = [
      measurements.altura,
      measurements.ombros,
      measurements.torax,
      measurements.busto,
      measurements.cintura,
      measurements.quadril,
    ];

    const hasInvalidMeasurement =
      requiredMeasurements.some(
        (value) => !value || value <= 0,
      );

    if (hasInvalidMeasurement) {
      show('Preencha todas as medidas obrigatórias.');
      return;
    }

    setSavingMeasurements(true);

    try {
      await saveMeasurements(
        user.uid,
        measurements,
      );

      await updateUserProfile(user.uid, {
        measurementsCompleted: true,
      });

      show('Medidas salvas com sucesso.');
    } catch (error) {
      console.error('Erro ao salvar medidas:', error);

      show('Não foi possível salvar suas medidas.');
    } finally {
      setSavingMeasurements(false);
    }
  };

  // ==========================================================
  // RENDERIZAÇÃO
  // ==========================================================

  return (
    <DashboardLayout title="Configurações">

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">

        {/* MENU */}

        <nav className="flex gap-1.5 overflow-x-auto lg:flex-col lg:overflow-visible">

          {sections.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActive(id)}
              className={`
                flex shrink-0 items-center gap-2.5 rounded-2xl
                px-4 py-2.5 text-left text-sm font-medium
                transition-colors
                ${
                  active === id
                    ? 'bg-caiment-ink text-white'
                    : 'text-caiment-ink-soft hover:bg-caiment-purple-50 hover:text-caiment-ink'
                }
              `}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}

        </nav>

        <Card padding="md">

          {/* ==================================================
              INFORMAÇÕES DA CONTA
              ================================================== */}

          {active === 'perfil' && (
            <div className="space-y-6">

              <div>
                <h3 className="font-display text-lg font-medium text-caiment-ink">
                  Informações da conta
                </h3>

                <p className="mt-1 text-sm text-caiment-ink-soft">
                  Consulte e atualize suas informações pessoais.
                </p>
              </div>

              {loadingProfile ? (
                <div className="rounded-2xl bg-caiment-purple-50/60 p-6 text-center">
                  <p className="text-sm text-caiment-ink-soft">
                    Carregando informações da conta...
                  </p>
                </div>
              ) : (
                <div className="max-w-xl space-y-5">

                  {/* NOME */}

                  <div>
                    <label
                      htmlFor="account-name"
                      className="text-xs font-medium text-caiment-ink-soft"
                    >
                      Nome completo
                    </label>

                    <div className="mt-1.5 flex items-center gap-2 rounded-2xl border border-caiment-line bg-white px-4 py-3">
                      <input
                        id="account-name"
                        type="text"
                        value={name}
                        onChange={(event) =>
                          setName(event.target.value)
                        }
                        placeholder="Seu nome"
                        className="w-full bg-transparent text-sm text-caiment-ink outline-none"
                      />

                      <Pencil
                        size={15}
                        className="shrink-0 text-caiment-ink-soft"
                      />
                    </div>
                  </div>

                  {/* EMAIL */}

                  <div>
                    <label
                      htmlFor="account-email"
                      className="text-xs font-medium text-caiment-ink-soft"
                    >
                      E-mail da conta
                    </label>

                    <div className="mt-1.5 flex items-center gap-2 rounded-2xl border border-caiment-line bg-caiment-purple-50/40 px-4 py-3">
                      <input
                        id="account-email"
                        type="email"
                        value={email}
                        readOnly
                        disabled
                        className="w-full bg-transparent text-sm text-caiment-ink/70 outline-none"
                      />

                      <MailIcon
                        size={15}
                        className="shrink-0 text-caiment-ink-soft"
                      />
                    </div>

                    <p className="mt-1 text-xs text-caiment-ink-soft">
                      O e-mail é vinculado à sua conta de autenticação.
                    </p>
                  </div>

                  {/* SALVAR */}

                  <div className="flex justify-start pt-2">
                    <Button
                      size="sm"
                      onClick={handleSaveProfile}
                      disabled={savingProfile}
                    >
                      {savingProfile
                        ? 'Salvando...'
                        : 'Salvar alterações'}
                    </Button>
                  </div>

                </div>
              )}

              {/* AÇÕES DA CONTA */}

              <div className="space-y-5 border-t border-caiment-line pt-5">

                {/* SAIR DA CONTA */}

                <div>
                  <h4 className="text-sm font-medium text-caiment-ink">
                    Sessão
                  </h4>

                  <p className="mt-1 text-xs text-caiment-ink-soft">
                    Encerre sua sessão neste dispositivo.
                  </p>

                  <button
                    onClick={handleLogout}
                    className="mt-3 flex items-center gap-2 text-xs font-medium text-caiment-purple-700 transition-colors hover:text-caiment-purple-900"
                  >
                    <LogOut size={14} />
                    Sair da conta
                  </button>
                </div>

                {/* EXCLUIR CONTA */}

                <div className="border-t border-caiment-line pt-4">

                  <h4 className="text-sm font-medium text-caiment-ink">
                    Excluir conta
                  </h4>

                  <p className="mt-1 text-xs text-caiment-ink-soft">
                    A exclusão da conta é permanente e não poderá ser desfeita.
                  </p>

                  <button
                    onClick={handleDeleteAccount}
                    className="mt-3 flex items-center gap-2 text-xs font-medium text-red-600 transition-colors hover:text-red-700"
                  >
                    <Trash2 size={14} />
                    Excluir minha conta
                  </button>

                </div>

              </div>

            </div>
          )}

          {/* ==================================================
              MEDIDAS
              ================================================== */}

          {active === 'medidas' && (
            <div>

              <div>
                <h3 className="font-display text-lg font-medium text-caiment-ink">
                  Minhas medidas
                </h3>

                <p className="mt-1 text-sm text-caiment-ink-soft">
                  Consulte e atualize suas medidas corporais utilizadas na criação do avatar e na prova virtual.
                </p>
              </div>

              {loadingMeasurements ? (
                <div className="mt-6 rounded-2xl bg-caiment-purple-50/60 p-6 text-center">
                  <p className="text-sm text-caiment-ink-soft">
                    Carregando suas medidas...
                  </p>
                </div>
              ) : (
                <>

                  <div className="mt-6 grid gap-4 sm:grid-cols-2">

                    {/* ALTURA */}

                    <div>
                      <label className="text-xs font-medium text-caiment-ink-soft">
                        Altura (cm)
                      </label>

                      <input
                        type="number"
                        min="1"
                        value={measurements.altura || ''}
                        onChange={(event) =>
                          updateMeasurement('altura', event.target.value)
                        }
                        placeholder="Ex.: 168"
                        className="mt-1.5 w-full rounded-2xl border border-caiment-line bg-white px-4 py-3 text-sm text-caiment-ink outline-none transition focus:border-caiment-purple-500"
                      />
                    </div>

                    {/* OMBROS */}

                    <div>
                      <label className="text-xs font-medium text-caiment-ink-soft">
                        Ombros (cm)
                      </label>

                      <input
                        type="number"
                        min="1"
                        value={measurements.ombros || ''}
                        onChange={(event) =>
                          updateMeasurement('ombros', event.target.value)
                        }
                        placeholder="Ex.: 42"
                        className="mt-1.5 w-full rounded-2xl border border-caiment-line bg-white px-4 py-3 text-sm text-caiment-ink outline-none transition focus:border-caiment-purple-500"
                      />
                    </div>

                    {/* TÓRAX */}

                    <div>
                      <label className="text-xs font-medium text-caiment-ink-soft">
                        Tórax (cm)
                      </label>

                      <input
                        type="number"
                        min="1"
                        value={measurements.torax || ''}
                        onChange={(event) =>
                          updateMeasurement('torax', event.target.value)
                        }
                        placeholder="Ex.: 90"
                        className="mt-1.5 w-full rounded-2xl border border-caiment-line bg-white px-4 py-3 text-sm text-caiment-ink outline-none transition focus:border-caiment-purple-500"
                      />
                    </div>

                    {/* BUSTO */}

                    <div>
                      <label className="text-xs font-medium text-caiment-ink-soft">
                        Busto (cm)
                      </label>

                      <input
                        type="number"
                        min="1"
                        value={measurements.busto || ''}
                        onChange={(event) =>
                          updateMeasurement('busto', event.target.value)
                        }
                        placeholder="Ex.: 92"
                        className="mt-1.5 w-full rounded-2xl border border-caiment-line bg-white px-4 py-3 text-sm text-caiment-ink outline-none transition focus:border-caiment-purple-500"
                      />
                    </div>

                    {/* CINTURA */}

                    <div>
                      <label className="text-xs font-medium text-caiment-ink-soft">
                        Cintura (cm)
                      </label>

                      <input
                        type="number"
                        min="1"
                        value={measurements.cintura || ''}
                        onChange={(event) =>
                          updateMeasurement('cintura', event.target.value)
                        }
                        placeholder="Ex.: 72"
                        className="mt-1.5 w-full rounded-2xl border border-caiment-line bg-white px-4 py-3 text-sm text-caiment-ink outline-none transition focus:border-caiment-purple-500"
                      />
                    </div>

                    {/* QUADRIL */}

                    <div>
                      <label className="text-xs font-medium text-caiment-ink-soft">
                        Quadril (cm)
                      </label>

                      <input
                        type="number"
                        min="1"
                        value={measurements.quadril || ''}
                        onChange={(event) =>
                          updateMeasurement('quadril', event.target.value)
                        }
                        placeholder="Ex.: 96"
                        className="mt-1.5 w-full rounded-2xl border border-caiment-line bg-white px-4 py-3 text-sm text-caiment-ink outline-none transition focus:border-caiment-purple-500"
                      />
                    </div>

                    {/* ALTURA PÉ ATÉ CINTURA */}

                    <div>
                      <label className="text-xs font-medium text-caiment-ink-soft">
                        Pernas (do chão até a cintura) (cm)
                      </label>

                      <input
                        type="number"
                        min="1"
                        value={measurements.alturaPeCintura || ''}
                        onChange={(event) =>
                          updateMeasurement(
                            'alturaPeCintura',
                            event.target.value,
                          )
                        }
                        placeholder="Ex.: 96"
                        className="mt-1.5 w-full rounded-2xl border border-caiment-line bg-white px-4 py-3 text-sm text-caiment-ink outline-none transition focus:border-caiment-purple-500"
                      />
                    </div>

                    {/* ALTURA CINTURA ATÉ OMBROS */}

                    <div>
                      <label className="text-xs font-medium text-caiment-ink-soft">
                        Tronco (da cintura até os ombros) (cm)
                      </label>

                      <input
                        type="number"
                        min="1"
                        value={measurements.alturaCinturaOmbros || ''}
                        onChange={(event) =>
                          updateMeasurement(
                            'alturaCinturaOmbros',
                            event.target.value,
                          )
                        }
                        placeholder="Ex.: 46"
                        className="mt-1.5 w-full rounded-2xl border border-caiment-line bg-white px-4 py-3 text-sm text-caiment-ink outline-none transition focus:border-caiment-purple-500"
                      />
                    </div>

                  </div>

                  {/* SALVAR MEDIDAS */}

                  <div className="mt-6 flex justify-end">
                    <Button
                      size="sm"
                      onClick={handleSaveMeasurements}
                      disabled={savingMeasurements}
                    >
                      {savingMeasurements
                        ? 'Salvando...'
                        : 'Salvar medidas'}
                    </Button>
                  </div>

                </>
              )}

            </div>
          )}

        </Card>

      </div>

    </DashboardLayout>
  );
}
