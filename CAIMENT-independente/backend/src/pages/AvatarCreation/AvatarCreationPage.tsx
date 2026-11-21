
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  Info,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  Sun,
  Camera,
  Shirt,
  UserRound,
} from 'lucide-react';

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

type TutorialVariant =
  | 'pose'
  | 'environment'
  | 'lighting'
  | 'framing'
  | 'clothing';

const tutorialSteps: {
  title: string;
  subtitle: string;
  message: string;
  icon: typeof UserRound;
  illustration: TutorialVariant;
  correctTitle: string;
  incorrectTitle: string;
  correctDescription: string;
  incorrectDescription: string;
}[] = [
  {
    title: 'A posição do seu corpo',
    subtitle: 'Mantenha uma postura natural e alinhada.',
    message:
      'Fique em pé, olhando para a frente. Deixe os braços afastados do tronco, levemente inclinados para baixo, e mantenha um pequeno espaço entre as pernas.',
    icon: UserRound,
    illustration: 'pose',
    correctTitle: 'Postura recomendada',
    incorrectTitle: 'Postura a evitar',
    correctDescription:
      'Braços afastados do tronco, pernas levemente separadas e corpo reto.',
    incorrectDescription:
      'Evite braços colados ao corpo, pernas cruzadas ou tronco inclinado.',
  },
  {
    title: 'Escolha o ambiente',
    subtitle: 'Prefira um local simples e organizado.',
    message:
      'Procure uma parede lisa, sem móveis ou objetos atrás de você. O fundo precisa contrastar com sua roupa para facilitar a identificação do contorno corporal.',
    icon: UserRound,
    illustration: 'environment',
    correctTitle: 'Fundo adequado',
    incorrectTitle: 'Fundo inadequado',
    correctDescription:
      'Parede lisa, espaço livre e poucos elementos ao redor.',
    incorrectDescription:
      'Evite ambientes com móveis, objetos, pessoas ou muitos detalhes.',
  },
  {
    title: 'Cuide da iluminação',
    subtitle: 'Seu corpo precisa estar visível por inteiro.',
    message:
      'Use uma iluminação uniforme, de preferência natural. Evite ficar contra a luz, em locais escuros ou com sombras fortes sobre o corpo.',
    icon: Sun,
    illustration: 'lighting',
    correctTitle: 'Boa iluminação',
    incorrectTitle: 'Iluminação inadequada',
    correctDescription:
      'Luz distribuída pelo corpo, sem sombras fortes.',
    incorrectDescription:
      'Evite contraluz, ambientes escuros e sombras que escondam partes do corpo.',
  },
  {
    title: 'Ajuste o enquadramento',
    subtitle: 'Da cabeça aos pés, tudo precisa aparecer.',
    message:
      'Deixe o celular reto, aproximadamente na altura do tronco. Afaste-o o suficiente para mostrar sua cabeça, mãos e pés, sem cortar nenhuma parte do corpo.',
    icon: Camera,
    illustration: 'framing',
    correctTitle: 'Enquadramento correto',
    incorrectTitle: 'Enquadramento incorreto',
    correctDescription:
      'Corpo inteiro visível, câmera reta e distância adequada.',
    incorrectDescription:
      'Não corte a cabeça, as mãos ou os pés. Evite deixar a câmera inclinada.',
  },
  {
    title: 'Escolha suas roupas',
    subtitle: 'O formato do corpo precisa ficar visível.',
    message:
      'Prefira roupas confortáveis e ajustadas ao corpo, sem excesso de tecido. Camiseta e calça legging são boas opções. Evite peças largas ou volumosas.',
    icon: Shirt,
    illustration: 'clothing',
    correctTitle: 'Roupas recomendadas',
    incorrectTitle: 'Roupas a evitar',
    correctDescription:
      'Peças simples e ajustadas, que deixam o contorno corporal visível.',
    incorrectDescription:
      'Evite casacos largos, saias volumosas e roupas que escondam a silhueta.',
  },
];

// ============================================================
// ILUSTRAÇÃO 2D
// ============================================================

function PersonIllustration({
  variant,
  correct,
}: {
  variant: TutorialVariant;
  correct: boolean;
}) {
  const armsCorrect =
    'M132 119 Q112 133 91 153 L61 174';

  const armsIncorrect =
    'M132 119 Q119 137 132 170 L139 211';

  const rightArmsCorrect =
    'M188 119 Q208 133 229 153 L259 174';

  const rightArmsIncorrect =
    'M188 119 Q201 137 188 170 L181 211';

  const clothingColor = correct ? '#9254e1' : '#684b78';

  const personScale =
    variant === 'framing' && !correct ? 1.35 : 1;

  return (
    <svg
      viewBox="0 0 320 390"
      className="h-full w-full"
      role="img"
      aria-label={
        correct
          ? 'Ilustração mostrando o exemplo correto'
          : 'Ilustração mostrando o exemplo incorreto'
      }
    >
      {/* Sombra no chão */}
      <ellipse
        cx="160"
        cy="367"
        rx="68"
        ry="8"
        fill="#402b47"
        opacity=".13"
      />

      <g transform={`translate(160 195) scale(${personScale}) translate(-160 -195)`}>
        {/* Cabelo */}
        <path
          d="M128 49 Q119 14 160 16 Q203 15 195 66 L191 101 L128 101 Z"
          fill="#49302e"
        />

        {/* Cabeça */}
        <ellipse
          cx="160"
          cy="68"
          rx="29"
          ry="37"
          fill="#edb99f"
        />

        {/* Cabelo frontal */}
        <path
          d="M132 61 Q128 25 162 29 Q193 27 190 61 Q178 46 164 49 Q148 46 132 61"
          fill="#49302e"
        />

        {/* Rosto */}
        <ellipse cx="149" cy="70" rx="2.8" ry="3.5" fill="#402b47" />
        <ellipse cx="171" cy="70" rx="2.8" ry="3.5" fill="#402b47" />
        <path
          d="M153 84 Q160 89 167 84"
          stroke="#b76e6c"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />

        {/* Pescoço */}
        <path
          d="M149 99 L149 117 L171 117 L171 99"
          fill="#edb99f"
        />

        {/* Pernas */}
        {variant === 'pose' && !correct ? (
          <>
            <path
              d="M137 231 L145 283 L165 321 L178 355 L191 354 L184 315 L164 272 L182 231 Z"
              fill="#edb99f"
            />
            <path
              d="M163 231 L151 280 L139 319 L128 354 L140 359 L158 323 L177 283 L182 231 Z"
              fill="#edb99f"
            />
          </>
        ) : (
          <>
            <path
              d="M137 231 L131 300 L126 351 Q127 360 139 360 L149 359 L157 288 L160 238 Z"
              fill="#edb99f"
            />
            <path
              d="M163 238 L166 288 L173 359 L184 360 Q196 359 193 350 L187 300 L182 231 Z"
              fill="#edb99f"
            />
          </>
        )}

        {/* Calçados */}
        <path
          d="M126 348 Q113 354 117 365 L150 365 Q155 361 148 354 L139 351 Z"
          fill="#ffffff"
          stroke="#684b78"
          strokeWidth="2"
        />
        <path
          d="M174 354 Q165 361 171 365 L205 365 Q209 357 192 350 L184 351 Z"
          fill="#ffffff"
          stroke="#684b78"
          strokeWidth="2"
        />

        {/* Braços atrás do tronco */}
        <path
          d={correct ? armsCorrect : armsIncorrect}
          stroke="#edb99f"
          strokeWidth="17"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d={correct ? rightArmsCorrect : rightArmsIncorrect}
          stroke="#edb99f"
          strokeWidth="17"
          strokeLinecap="round"
          fill="none"
        />

        {/* Tronco */}
        {variant === 'clothing' && !correct ? (
          <path
            d="M125 111 Q160 101 195 111 L211 192 L201 250 Q160 260 119 250 L109 192 Z"
            fill="#9254e1"
            opacity=".9"
          />
        ) : (
          <path
            d="M137 112 Q160 103 183 112 L193 190 L183 240 Q160 250 137 240 L127 190 Z"
            fill={clothingColor}
          />
        )}

        {/* Detalhe da cintura */}
        <path
          d="M132 233 Q160 241 188 233 L190 248 Q160 255 130 248 Z"
          fill="#b3ff79"
        />

        {/* Calça */}
        <path
          d="M130 246 Q160 252 190 246 L187 302 L175 357 L160 357 L157 290 L146 357 L130 357 L132 302 Z"
          fill="#402b47"
        />

        {/* Mãos */}
        {correct ? (
          <>
            <ellipse cx="57" cy="177" rx="8" ry="11" fill="#edb99f" />
            <ellipse cx="263" cy="177" rx="8" ry="11" fill="#edb99f" />
          </>
        ) : (
          <>
            <ellipse cx="139" cy="216" rx="8" ry="11" fill="#edb99f" />
            <ellipse cx="181" cy="216" rx="8" ry="11" fill="#edb99f" />
          </>
        )}
      </g>

      {/* Elementos específicos de cada comparação */}

      {variant === 'framing' && correct && (
        <rect
          x="40"
          y="10"
          width="240"
          height="365"
          rx="8"
          fill="none"
          stroke="#684b78"
          strokeWidth="2"
          strokeDasharray="7 6"
          opacity=".65"
        />
      )}

      {variant === 'framing' && !correct && (
        <>
          <rect
            x="0"
            y="0"
            width="320"
            height="38"
            fill="#402b47"
            opacity=".12"
          />
          <rect
            x="0"
            y="350"
            width="320"
            height="40"
            fill="#402b47"
            opacity=".12"
          />
          <path
            d="M18 18 L48 18 M18 18 L18 48 M302 18 L272 18 M302 18 L302 48"
            stroke="#dc5555"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </>
      )}

      {variant === 'lighting' && !correct && (
        <rect
          x="0"
          y="0"
          width="320"
          height="390"
          fill="#25213b"
          opacity=".35"
        />
      )}

      {variant === 'lighting' && correct && (
        <>
          <circle cx="265" cy="48" r="22" fill="#ffd76a" />
          <path
            d="M265 12 V2 M265 94 V84 M229 48 H219 M311 48 H301 M239 22 L231 14 M291 82 L299 90"
            stroke="#eab84b"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </>
      )}

      {variant === 'clothing' && !correct && (
        <>
          <path
            d="M109 125 L92 150 L101 184 L116 174"
            fill="none"
            stroke="#684b78"
            strokeWidth="9"
            strokeLinecap="round"
          />
          <path
            d="M211 125 L228 150 L219 184 L204 174"
            fill="none"
            stroke="#684b78"
            strokeWidth="9"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  );
}

// ============================================================
// CENÁRIOS DO TUTORIAL
// ============================================================

function IllustrationScene({
  variant,
  correct,
}: {
  variant: TutorialVariant;
  correct: boolean;
}) {
  const backgrounds: Record<TutorialVariant, string> = {
    pose: correct
      ? 'bg-gradient-to-b from-[#f0f9ed] to-[#dcefd5]'
      : 'bg-gradient-to-b from-[#fff0ed] to-[#f8d9d4]',
    environment: correct
      ? 'bg-gradient-to-b from-[#e8f4f1] to-[#d1e9e2]'
      : 'bg-gradient-to-b from-[#eee7df] to-[#d5c8bd]',
    lighting: correct
      ? 'bg-gradient-to-b from-[#fff7d9] to-[#f8e7a9]'
      : 'bg-gradient-to-b from-[#77758d] to-[#38364d]',
    framing: correct
      ? 'bg-gradient-to-b from-[#f0edff] to-[#ddd5fa]'
      : 'bg-gradient-to-b from-[#eee7f0] to-[#d8cbdc]',
    clothing: correct
      ? 'bg-gradient-to-b from-[#edf5ff] to-[#d9e7f7]'
      : 'bg-gradient-to-b from-[#f8e9ef] to-[#efd3df]',
  };

  return (
    <div
      className={`relative flex h-[250px] items-center justify-center overflow-hidden rounded-t-2xl ${backgrounds[variant]}`}
    >
      {/* Cenário de fundo */}

      {variant === 'environment' && correct && (
        <>
          <div className="absolute inset-x-0 bottom-0 h-8 bg-[#c4d9ce]" />
          <div className="absolute left-5 top-5 h-16 w-16 rounded-full bg-white/50" />
          <div className="absolute right-5 top-5 h-20 w-20 rounded-full bg-white/30" />
        </>
      )}

      {variant === 'environment' && !correct && (
        <>
          <div className="absolute bottom-0 left-0 h-24 w-20 rounded-tr-xl bg-[#9b8273]" />
          <div className="absolute bottom-0 right-4 h-32 w-16 rounded-t-lg bg-[#a68a79]" />
          <div className="absolute right-8 top-7 h-14 w-14 rounded-full bg-[#c5b6a8]" />
          <div className="absolute left-1/2 top-8 h-12 w-20 -translate-x-1/2 rounded-lg bg-[#b7a99c]" />
          <div className="absolute bottom-0 left-1/3 h-16 w-12 rounded-t-lg bg-[#806e65]" />
        </>
      )}

      {variant === 'lighting' && correct && (
        <div className="absolute inset-0 bg-white/15" />
      )}

      {variant === 'lighting' && !correct && (
        <div className="absolute inset-0 bg-[#25213b]/25" />
      )}

      {variant === 'framing' && (
        <div className="absolute bottom-0 h-8 w-full bg-[#b9b0d3]/50" />
      )}

      {variant === 'clothing' && (
        <>
          <div className="absolute left-5 top-5 h-12 w-12 rounded-full bg-white/50" />
          <div className="absolute bottom-0 h-8 w-full bg-white/20" />
        </>
      )}

      <div className="relative z-10 h-full w-full max-w-[220px]">
        <PersonIllustration variant={variant} correct={correct} />
      </div>
    </div>
  );
}

// ============================================================
// COMPARAÇÃO CORRETO X INCORRETO
// ============================================================

function TutorialComparison({
  step,
}: {
  step: (typeof tutorialSteps)[number];
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {/* CORRETO */}

      <div className="overflow-hidden rounded-2xl border-2 border-green-200 bg-white">
        <IllustrationScene
          variant={step.illustration}
          correct
        />

        <div className="space-y-2 p-4">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-green-100 text-green-700">
              <Check size={18} strokeWidth={3} />
            </span>

            <h4 className="text-sm font-bold text-green-800">
              {step.correctTitle}
            </h4>
          </div>

          <p className="text-xs leading-relaxed text-gray-600">
            {step.correctDescription}
          </p>
        </div>
      </div>

      {/* INCORRETO */}

      <div className="overflow-hidden rounded-2xl border-2 border-red-200 bg-white">
        <IllustrationScene
          variant={step.illustration}
          correct={false}
        />

        <div className="space-y-2 p-4">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-red-100 text-red-700">
              <X size={18} strokeWidth={3} />
            </span>

            <h4 className="text-sm font-bold text-red-800">
              {step.incorrectTitle}
            </h4>
          </div>

          <p className="text-xs leading-relaxed text-gray-600">
            {step.incorrectDescription}
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// COMPONENTE PRINCIPAL
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
  const [tutorialStep, setTutorialStep] = useState(0);
  const [tutorialCompleted, setTutorialCompleted] = useState(false);

  // ==========================================================
  // ESTADOS DERIVADOS
  // ==========================================================

  const allFilled = angles.every(({ angle }) => {
    return Boolean(
      photos[angle].previewUrl &&
      photos[angle].file,
    );
  });

  const currentStep = tutorialSteps[tutorialStep];

  const progress = tutorialCompleted
    ? 100
    : ((tutorialStep + 1) / tutorialSteps.length) * 100;

  // ==========================================================
  // LIBERAÇÃO DE RECURSOS
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
  // GERENCIAMENTO DAS FOTOS
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
  // NAVEGAÇÃO DO TUTORIAL
  // ==========================================================

  const handleNextStep = () => {
    if (tutorialStep < tutorialSteps.length - 1) {
      setTutorialStep((previous) => previous + 1);
      return;
    }

    setTutorialCompleted(true);
  };

  const handlePreviousStep = () => {
    if (tutorialCompleted) {
      setTutorialCompleted(false);
      setTutorialStep(tutorialSteps.length - 1);
      return;
    }

    setTutorialStep((previous) => Math.max(0, previous - 1));
  };

  const handleRestartTutorial = () => {
    setTutorialStep(0);
    setTutorialCompleted(false);
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

        {!tutorialCompleted ? (
          <>
            {/* CABEÇALHO DO TUTORIAL */}

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-caiment-purple-500">
                    Preparação
                  </p>

                  <h2 className="text-xl font-bold text-caiment-ink">
                    Tutorial para suas fotos
                  </h2>
                </div>

                <span className="rounded-full bg-caiment-purple-50 px-3 py-1.5 text-xs font-semibold text-caiment-purple-600">
                  {tutorialStep + 1} de {tutorialSteps.length}
                </span>
              </div>

              <div className="h-2 overflow-hidden rounded-full bg-caiment-purple-100">
                <div
                  className="h-full rounded-full bg-caiment-purple-500 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* CONTEÚDO DA ETAPA */}

            <div className="overflow-hidden rounded-3xl border border-caiment-purple-100 bg-white shadow-sm">
              <div className="space-y-5 p-4 sm:p-6">

                {/* TÍTULO E MENSAGEM */}

                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-caiment-purple-50 text-caiment-purple-600">
                    <currentStep.icon size={23} />
                  </div>

                  <div className="min-w-0">
                    <h3 className="text-2xl font-bold text-caiment-ink">
                      {currentStep.title}
                    </h3>

                    <p className="mt-1 text-sm text-caiment-purple-500">
                      {currentStep.subtitle}
                    </p>
                  </div>
                </div>

                {/* BALÃO DE EXPLICAÇÃO */}

                <div className="relative rounded-2xl rounded-tl-sm border border-caiment-purple-100 bg-caiment-purple-50 p-4">
                  <div className="absolute -left-2 top-3 h-4 w-4 rotate-45 border-b border-l border-caiment-purple-100 bg-caiment-purple-50" />

                  <p className="relative text-sm leading-relaxed text-caiment-ink-soft">
                    {currentStep.message}
                  </p>
                </div>

                {/* LEGENDA */}

                <div className="flex flex-wrap items-center gap-4 text-xs font-semibold">
                  <span className="flex items-center gap-1.5 text-green-700">
                    <Check size={16} strokeWidth={3} />
                    Assim está correto
                  </span>

                  <span className="flex items-center gap-1.5 text-red-700">
                    <X size={16} strokeWidth={3} />
                    Evite fazer assim
                  </span>
                </div>

                {/* COMPARAÇÃO VISUAL */}

                <TutorialComparison step={currentStep} />

              </div>

              {/* NAVEGAÇÃO */}

              <div className="flex items-center justify-between border-t border-caiment-purple-100 bg-gray-50/70 p-4">

                <button
                  type="button"
                  onClick={handlePreviousStep}
                  disabled={tutorialStep === 0}
                  className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-medium text-caiment-purple-600 transition hover:bg-caiment-purple-50 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <ChevronLeft size={18} />
                  Voltar
                </button>

                <div className="flex items-center gap-1.5">
                  {tutorialSteps.map((_, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => setTutorialStep(index)}
                      aria-label={`Ir para etapa ${index + 1}`}
                      className={`h-2 rounded-full transition-all ${
                        index === tutorialStep
                          ? 'w-6 bg-caiment-purple-500'
                          : 'w-2 bg-caiment-purple-200 hover:bg-caiment-purple-400'
                      }`}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleNextStep}
                  className="inline-flex items-center gap-1 rounded-xl bg-caiment-purple-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-caiment-purple-700"
                >
                  {tutorialStep === tutorialSteps.length - 1
                    ? 'Começar'
                    : 'Continuar'}

                  <ChevronRight size={18} />
                </button>
              </div>
            </div>

            <p className="text-center text-xs text-gray-500">
              Aprenda cada etapa antes de enviar suas fotografias.
            </p>
          </>
        ) : (
          <>
            {/* ÁREA DE ENVIO */}

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-caiment-purple-500">
                    Última etapa
                  </p>

                  <h2 className="text-xl font-bold text-caiment-ink">
                    Envie suas quatro fotos
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={handleRestartTutorial}
                  className="text-xs font-semibold text-caiment-purple-600 hover:underline"
                >
                  Rever tutorial
                </button>
              </div>

              <div className="flex items-start gap-2.5 rounded-2xl border border-caiment-purple-100 bg-caiment-purple-50/60 p-4 text-sm text-caiment-ink-soft">
                <Info
                  size={17}
                  className="mt-0.5 shrink-0 text-caiment-purple-400"
                />

                <span>
                  Utilize fotos de corpo inteiro, com boa iluminação,
                  sem cortes e com os braços afastados do corpo.
                  Mantenha a mesma postura nas quatro vistas.
                </span>
              </div>
            </div>

            {/* QUATRO FOTOS */}

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

            {/* PROGRESSO DO ENVIO */}

            <div className="rounded-2xl border border-caiment-purple-100 bg-white p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-caiment-ink">
                  Fotos enviadas
                </span>

                <span className="text-sm font-bold text-caiment-purple-600">
                  {angles.filter(({ angle }) => photos[angle].file).length}/4
                </span>
              </div>

              <div className="h-2 overflow-hidden rounded-full bg-caiment-purple-100">
                <div
                  className="h-full rounded-full bg-caiment-purple-500 transition-all duration-300"
                  style={{
                    width: `${
                      (angles.filter(({ angle }) => photos[angle].file).length / 4) * 100
                    }%`,
                  }}
                />
              </div>
            </div>

            {/* GERAÇÃO */}

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
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
