
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Info } from 'lucide-react';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PhotoUpload } from '@/components/upload/PhotoUpload';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

import type {
  AvatarPhoto,
  PhotoAngle,
} from '@/types';

import { generateAvatar } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { createAvatarRecord } from '@/services/firebase/avatar';

// ============================================================
// CONFIGURAÇÃO
// ============================================================

const angles: {
  angle: PhotoAngle;
  label: string;
}[] = [
  { angle: 'front', label: 'Frontal' },
  { angle: 'back', label: 'Traseira' },
  { angle: 'left', label: 'Lateral esquerda' },
  { angle: 'right', label: 'Lateral direita' },
];

const AVATAR_TASK_STORAGE_KEY = 'caiment_avatar_task_id';

// ============================================================
// PÁGINA DE CRIAÇÃO DO AVATAR
// ============================================================

export default function AvatarCreationPage() {
  const navigate = useNavigate();

  const { show } = useToast();
  const { user } = useAuth();

  const previewUrlsRef = useRef<Set<string>>(new Set());

  const [photos, setPhotos] = useState<Record<PhotoAngle, AvatarPhoto>>(
    () =>
      Object.fromEntries(
        angles.map(({ angle }) => [
          angle,
          {
            id: angle,
            angle,
            previewUrl: null,
            file: null,
          },
        ]),
      ) as Record<PhotoAngle, AvatarPhoto>,
  );

  const [isSending, setIsSending] = useState(false);

  // ==========================================================
  // VALIDAÇÃO DAS FOTOS
  // ==========================================================

  const allFilled = angles.every(({ angle }) => {
    return Boolean(
      photos[angle].previewUrl &&
      photos[angle].file,
    );
  });

  const uploadedCount = angles.filter(({ angle }) => {
    return Boolean(photos[angle].file);
  }).length;

  const progress = (uploadedCount / angles.length) * 100;

  // ==========================================================
  // LIBERAÇÃO DOS RECURSOS
  // ==========================================================

  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach((url) => {
        URL.revokeObjectURL(url);
      });

      previewUrlsRef.current.clear();
    };
  }, []);

  // ==========================================================
  // ADICIONAR OU SUBSTITUIR FOTO
  // ==========================================================

  const handleChange = (angle: PhotoAngle, file: File) => {
    const previousUrl = photos[angle].previewUrl;

    if (previousUrl) {
      URL.revokeObjectURL(previousUrl);
      previewUrlsRef.current.delete(previousUrl);
    }

    const newUrl = URL.createObjectURL(file);

    previewUrlsRef.current.add(newUrl);

    setPhotos((previous) => ({
      ...previous,
      [angle]: {
        ...previous[angle],
        previewUrl: newUrl,
        file,
      },
    }));
  };

  // ==========================================================
  // REMOVER FOTO
  // ==========================================================

  const handleRemove = (angle: PhotoAngle) => {
    const previousUrl = photos[angle].previewUrl;

    if (previousUrl) {
      URL.revokeObjectURL(previousUrl);
      previewUrlsRef.current.delete(previousUrl);
    }

    setPhotos((previous) => ({
      ...previous,
      [angle]: {
        ...previous[angle],
        previewUrl: null,
        file: null,
      },
    }));
  };

  // ==========================================================
  // GERAÇÃO DO AVATAR
  // ==========================================================

  const handleGenerate = async () => {
    if (!user) {
      show(
        'Você precisa estar conectado para continuar.',
        'warning',
      );

      navigate('/login');
      return;
    }

    if (!allFilled) {
      show(
        'Envie as quatro fotos para continuar.',
        'warning',
      );

      return;
    }

    if (isSending) {
      return;
    }

    try {
      setIsSending(true);

      const photosSnapshot = { ...photos };

      const front = photosSnapshot.front.file;
      const left = photosSnapshot.left.file;
      const back = photosSnapshot.back.file;
      const right = photosSnapshot.right.file;

      if (!front || !left || !back || !right) {
        throw new Error('As quatro fotos são obrigatórias.');
      }

      const formData = new FormData();

      formData.append('front', front);
      formData.append('left', left);
      formData.append('back', back);
      formData.append('right', right);

      show(
        'Enviando as quatro fotos para gerar seu avatar...',
        'success',
      );

      const data = await generateAvatar(formData);

      if (!data?.taskId) {
        throw new Error(
          'O serviço de geração não retornou um identificador de tarefa.',
        );
      }

      const taskId = data.taskId;

      console.log('Avatar Task ID:', taskId);

      await createAvatarRecord(user.uid, taskId);

      sessionStorage.setItem(
        AVATAR_TASK_STORAGE_KEY,
        taskId,
      );

      navigate('/avatar-criacao/processando');

    } catch (error) {
      console.error(
        'Erro ao solicitar a geração do avatar:',
        error,
      );

      show(
        error instanceof Error
          ? error.message
          : 'Erro ao processar as fotografias.',
        'warning',
      );
    } finally {
      setIsSending(false);
    }
  };

  // ==========================================================
  // INTERFACE
  // ==========================================================

  return (
    <DashboardLayout title="Criar meu avatar">
      <div className="mx-auto max-w-4xl space-y-6">

        {/* CABEÇALHO */}

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-caiment-purple-500">
            Criação do avatar
          </p>

          <h2 className="text-2xl font-bold text-caiment-ink">
            Envie suas quatro fotos
          </h2>

          <p className="text-sm text-caiment-ink-soft">
            Adicione uma foto de cada ângulo para gerar seu avatar 3D.
          </p>
        </div>

        {/* ORIENTAÇÃO RESUMIDA */}

        <div className="flex items-start gap-2.5 rounded-2xl border border-caiment-purple-100 bg-caiment-purple-50/60 p-4 text-sm text-caiment-ink-soft">
          <Info
            size={18}
            className="mt-0.5 shrink-0 text-caiment-purple-400"
          />

          <span>
            Envie fotos de corpo inteiro, com boa iluminação,
            sem cortes e mantendo a mesma postura nas quatro vistas.
          </span>
        </div>

        {/* FOTOS */}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {angles.map(({ angle, label }) => (
            <PhotoUpload
              key={angle}
              photo={photos[angle]}
              label={label}
              onChange={handleChange}
              onRemove={handleRemove}
            />
          ))}
        </div>

        {/* PROGRESSO */}

        <div className="rounded-2xl border border-caiment-purple-100 bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-caiment-ink">
              Fotos enviadas
            </span>

            <span className="text-sm font-bold text-caiment-purple-600">
              {uploadedCount}/4
            </span>
          </div>

          <div className="h-2 overflow-hidden rounded-full bg-caiment-purple-100">
            <div
              className="h-full rounded-full bg-caiment-purple-500 transition-all duration-300"
              style={{
                width: `${progress}%`,
              }}
            />
          </div>
        </div>

        {/* GERAR AVATAR */}

        <Button
          fullWidth
          size="lg"
          icon={<Sparkles size={17} />}
          onClick={handleGenerate}
          disabled={!allFilled || isSending}
        >
          {isSending
            ? 'Enviando e processando fotos...'
            : 'Gerar meu avatar'}
        </Button>

        {!allFilled && (
          <p className="text-center text-xs text-gray-500">
            Envie as quatro fotos para liberar a geração do seu avatar.
          </p>
        )}

      </div>
    </DashboardLayout>
  );
}
