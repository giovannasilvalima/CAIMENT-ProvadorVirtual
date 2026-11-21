
/*
============================================================
CAIMENT — AvatarViewer
============================================================

RESPONSABILIDADES:
- Buscar e carregar somente o avatar Tripo.
- Recuperar o modelo pelo taskId, renovando a URL temporária.
- Manter compatibilidade com URLs antigas.
- Normalizar a orientação do avatar.
- Aplicar escala para altura de referência de 3,4 metros.
- Centralizar horizontalmente o avatar.
- Posicionar os pés no chão.
- Manter câmera, iluminação e controles de visualização.
- Exibir o placeholder quando não houver avatar.

INDEPENDÊNCIA:
- Não importa módulos da pasta clothing.
- Não carrega roupas.
- Não utiliza clothingObject.
- Não processa medidas corporais.
- Não executa detecção ou correção de colisões.

CONVENÇÃO ESPACIAL FINAL:
X = largura
Y = altura
Z = profundidade
+Z = frente do Viewer
-Z = costas

============================================================
*/

import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  Canvas,
  useThree,
} from '@react-three/fiber';

import {
  OrbitControls,
} from '@react-three/drei';

import type {
  OrbitControls as OrbitControlsImpl,
} from 'three-stdlib';

import * as THREE from 'three';

import type {
  Object3D,
} from 'three';

import {
  GLTFLoader,
} from 'three/examples/jsm/loaders/GLTFLoader.js';

import {
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

import {
  AvatarPlaceholderModel,
} from './AvatarPlaceholderModel';

import {
  LoadingState,
} from '@/components/ui/LoadingState';

import {
  ErrorBoundary,
} from '@/components/ui/ErrorBoundary';

// ============================================================
// PROPRIEDADES
// ============================================================

interface AvatarViewerProps {
  modelUrl?: string | null;
  taskId?: string | null;

  // Compatibilidade com componentes antigos.
  clothingModelUrl?: string | null;
  clothingObject?: Object3D | null;
  measurements?: unknown;

  className?: string;
  showControls?: boolean;
}

// ============================================================
// CONSTANTES
// ============================================================

const AVATAR_TARGET_HEIGHT = 3.4;

const AVATAR_ROTATION_Y = -Math.PI / 2;

const CAMERA_POSITION: [number, number, number] = [
  0,
  1.7,
  5.2,
];

const CAMERA_TARGET: [number, number, number] = [
  0,
  1.7,
  0,
];

// ============================================================
// PREPARAÇÃO DO MODELO
// ============================================================

function prepareAvatarForRendering(
  avatar: Object3D,
): void {
  avatar.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }

    child.castShadow = false;
    child.receiveShadow = false;
    child.frustumCulled = true;
  });

  avatar.updateMatrixWorld(true);
}

// ============================================================
// NORMALIZAÇÃO INDEPENDENTE DO AVATAR
// ============================================================

function normalizeAvatar(
  originalModel: Object3D,
): {
  group: THREE.Group;
  unitScale: number;
  modelScale: number;
  size: THREE.Vector3;
} {
  const group = new THREE.Group();

  const model = originalModel.clone(true);

  group.add(model);

  // Atualiza as transformações antes de calcular dimensões.
  group.updateMatrixWorld(true);

  const initialBox = new THREE.Box3().setFromObject(group);

  const initialSize = new THREE.Vector3();

  initialBox.getSize(initialSize);

  if (
    !Number.isFinite(initialSize.x) ||
    !Number.isFinite(initialSize.y) ||
    !Number.isFinite(initialSize.z) ||
    initialSize.y <= 0
  ) {
    throw new Error(
      'CAIMENT: o avatar possui dimensões inválidas.',
    );
  }

  // Converte a altura original para a referência de 3,4 m.
  const modelScale =
    AVATAR_TARGET_HEIGHT / initialSize.y;

  model.scale.multiplyScalar(modelScale);

  group.updateMatrixWorld(true);

  // Recalcula os limites depois da escala.
  const scaledBox = new THREE.Box3().setFromObject(group);

  const scaledSize = new THREE.Vector3();

  scaledBox.getSize(scaledSize);

  // Centraliza horizontalmente.
  const center = new THREE.Vector3();

  scaledBox.getCenter(center);

  group.position.x -= center.x;
  group.position.z -= center.z;

  // Posiciona os pés exatamente no chão.
  group.position.y -= scaledBox.min.y;

  group.updateMatrixWorld(true);

  const finalBox = new THREE.Box3().setFromObject(group);

  const finalSize = new THREE.Vector3();

  finalBox.getSize(finalSize);

  if (
    !Number.isFinite(finalSize.x) ||
    !Number.isFinite(finalSize.y) ||
    !Number.isFinite(finalSize.z) ||
    Math.abs(finalSize.y - AVATAR_TARGET_HEIGHT) > 0.01
  ) {
    throw new Error(
      'CAIMENT: falha ao normalizar a escala do avatar.',
    );
  }

  return {
    group,
    unitScale: modelScale,
    modelScale,
    size: finalSize,
  };
}

// ============================================================
// URL DO MODELO
// ============================================================

function getModelProxyUrl(
  modelUrl?: string | null,
  taskId?: string | null,
): string {
  if (taskId?.trim()) {
    return `/api/avatar/model?taskId=${encodeURIComponent(
      taskId.trim(),
    )}`;
  }

  if (modelUrl?.trim()) {
    return `/api/avatar/model?url=${encodeURIComponent(
      modelUrl.trim(),
    )}`;
  }

  throw new Error(
    'CAIMENT: informe o taskId ou a URL do modelo do avatar.',
  );
}

// ============================================================
// CARREGAMENTO DO AVATAR TRIPO
// ============================================================

function RealModel({
  url,
  taskId,
  onLoaded,
  onError,
}: {
  url?: string | null;
  taskId?: string | null;
  onLoaded?: () => void;
  onError?: (error: unknown) => void;
}) {
  const [model, setModel] = useState<Object3D | null>(null);

  const errorRef = useRef(onError);

  useEffect(() => {
    errorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    let cancelled = false;

    setModel(null);

    if (!taskId?.trim() && !url?.trim()) {
      errorRef.current?.(
        new Error('Avatar sem taskId ou URL de modelo.'),
      );

      return;
    }

    const loader = new GLTFLoader();

    const proxyUrl = getModelProxyUrl(url, taskId);

    console.log('CARREGANDO SOMENTE O AVATAR TRIPO:', {
      method: taskId?.trim() ? 'taskId' : 'modelUrl',
      taskId: taskId ?? null,
      proxyUrl,
    });

    loader.load(
      proxyUrl,

      (gltf) => {
        const avatar = gltf.scene;

        if (cancelled) {
          return;
        }

        let meshCount = 0;

        avatar.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            meshCount++;
          }
        });

        if (meshCount === 0) {
          errorRef.current?.(
            new Error('O modelo Tripo não possui meshes.'),
          );

          return;
        }

        prepareAvatarForRendering(avatar);

        setModel(avatar);
      },

      undefined,

      (error) => {
        if (!cancelled) {
          console.error(
            'ERRO AO CARREGAR AVATAR TRIPO:',
            error,
          );

          errorRef.current?.(error);
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, [url, taskId]);

  if (!model) {
    return null;
  }

  return (
    <AvatarModelObject
      model={model}
      onLoaded={onLoaded}
      onError={onError}
    />
  );
}

// ============================================================
// NORMALIZAÇÃO E EXIBIÇÃO
// ============================================================

function AvatarModelObject({
  model,
  onLoaded,
  onError,
}: {
  model: Object3D;
  onLoaded?: () => void;
  onError?: (error: unknown) => void;
}) {
  const [normalizedAvatar, setNormalizedAvatar] =
    useState<THREE.Group | null>(null);

  useEffect(() => {
    let cancelled = false;

    setNormalizedAvatar(null);

    try {
      // Orientação original do modelo Tripo.
      model.rotation.set(
        0,
        AVATAR_ROTATION_Y,
        0,
      );

      model.updateMatrixWorld(true);

      // Normalização independente da pasta clothing.
      const normalized = normalizeAvatar(model);

      normalized.group.updateMatrixWorld(true);

      if (cancelled) {
        return;
      }

      prepareAvatarForRendering(normalized.group);

      setNormalizedAvatar(normalized.group);

      console.log('AVATAR TRIPO NORMALIZADO:', {
        targetHeight: AVATAR_TARGET_HEIGHT,
        unitScale: normalized.unitScale,
        modelScale: normalized.modelScale,
        size: normalized.size.toArray(),
        floorY: 0,
        forwardDirection: '+Z',
      });

      onLoaded?.();
    } catch (error) {
      if (!cancelled) {
        console.error(
          'ERRO NA NORMALIZAÇÃO DO AVATAR:',
          error,
        );

        onError?.(error);
      }
    }

    return () => {
      cancelled = true;
    };
  }, [
    model,
    onLoaded,
    onError,
  ]);

  if (!normalizedAvatar) {
    return null;
  }

  return (
    <primitive object={normalizedAvatar} />
  );
}

// ============================================================
// CENA 3D
// ============================================================

function Scene({
  modelUrl,
  taskId,
  onAvatarLoaded,
  onAvatarError,
}: {
  modelUrl?: string | null;
  taskId?: string | null;
  onAvatarLoaded: () => void;
  onAvatarError: () => void;
}) {
  const hasAvatarSource = Boolean(
    taskId?.trim() || modelUrl?.trim(),
  );

  const handleLoaded = useCallback(() => {
    onAvatarLoaded();
  }, [onAvatarLoaded]);

  const handleError = useCallback(() => {
    onAvatarError();
  }, [onAvatarError]);

  return (
    <>
      <hemisphereLight
        args={['#F4F1FC', '#6E42D1', 0.55]}
      />

      <ambientLight intensity={0.65} />

      <directionalLight
        position={[3, 5, 4]}
        intensity={1.2}
      />

      <directionalLight
        position={[-3, 2, -3]}
        intensity={0.4}
      />

      <pointLight
        position={[0, 2.5, -2]}
        intensity={0.3}
        color="#C6F24E"
      />

      <Suspense fallback={null}>
        {hasAvatarSource ? (
          <RealModel
            url={modelUrl}
            taskId={taskId}
            onLoaded={handleLoaded}
            onError={handleError}
          />
        ) : (
          <AvatarPlaceholderModel />
        )}
      </Suspense>
    </>
  );
}

// ============================================================
// CÂMERA
// ============================================================

function CameraController() {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(...CAMERA_POSITION);
    camera.lookAt(...CAMERA_TARGET);
  }, [camera]);

  return null;
}

// ============================================================
// AVATAR VIEWER
// ============================================================

export function AvatarViewer({
  modelUrl,
  taskId,
  className,
  showControls = true,
}: AvatarViewerProps) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  const hasAvatarSource = Boolean(
    taskId?.trim() || modelUrl?.trim(),
  );

  const [ready, setReady] = useState(!hasAvatarSource);

  const [modelError, setModelError] = useState(false);

  useEffect(() => {
    setModelError(false);
    setReady(!hasAvatarSource);
  }, [
    modelUrl,
    taskId,
    hasAvatarSource,
  ]);

  const handleAvatarLoaded = useCallback(() => {
    setReady(true);
    setModelError(false);

    console.log(
      'Avatar Tripo carregado e normalizado.',
    );
  }, []);

  const handleAvatarError = useCallback(() => {
    setReady(true);
    setModelError(true);
  }, []);

  // Restaura a posição inicial da câmera.
  const handleReset = () => {
    const controls = controlsRef.current;

    if (!controls) {
      return;
    }

    controls.object.position.set(...CAMERA_POSITION);

    controls.target.set(...CAMERA_TARGET);

    controls.update();
  };

  // Controla o zoom.
  const handleZoom = (direction: 1 | -1) => {
    const controls = controlsRef.current;

    if (!controls) {
      return;
    }

    const camera = controls.object;

    const factor = direction === 1 ? 0.85 : 1.15;

    camera.position
      .sub(controls.target)
      .multiplyScalar(factor)
      .add(controls.target);

    controls.update();
  };

  return (
    <div
      className={`relative overflow-hidden rounded-3xl bg-gradient-to-b from-caiment-purple-50 to-white ${
        className ?? ''
      }`}
    >
      {!ready && !modelError && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60">
          <LoadingState label="Carregando avatar..." />
        </div>
      )}

      {modelError ? (
        <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="text-3xl">
            ⚠️
          </div>

          <p className="text-sm font-medium text-caiment-ink">
            Não foi possível carregar o avatar 3D.
          </p>

          <p className="max-w-xs text-xs text-caiment-ink-soft">
            O avatar foi gerado, mas não foi possível
            entregar ou normalizar o modelo 3D.
          </p>
        </div>
      ) : (
        <ErrorBoundary
          fallback={
            <div className="flex h-full min-h-[240px] items-center justify-center p-6 text-center">
              <p className="text-sm text-caiment-ink-soft">
                Erro inesperado no visualizador 3D.
              </p>
            </div>
          }
        >
          <Canvas
            dpr={1}
            frameloop="demand"
            shadows={false}
            gl={{
              antialias: false,
              powerPreference: 'low-power',
              preserveDrawingBuffer: false,
            }}
            camera={{
              position: CAMERA_POSITION,
              fov: 30,
            }}
          >
            <CameraController />

            <Scene
              modelUrl={modelUrl}
              taskId={taskId}
              onAvatarLoaded={handleAvatarLoaded}
              onAvatarError={handleAvatarError}
            />

            <OrbitControls
              ref={controlsRef}
              makeDefault
              enablePan={false}
              minDistance={3.2}
              maxDistance={8}
              minPolarAngle={Math.PI / 3.2}
              maxPolarAngle={Math.PI / 1.7}
              target={CAMERA_TARGET}
            />
          </Canvas>
        </ErrorBoundary>
      )}

      {showControls && !modelError && (
        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full glass px-2 py-2">
          <button
            onClick={() => handleZoom(-1)}
            aria-label="Diminuir zoom"
            className="flex h-8 w-8 items-center justify-center rounded-full text-caiment-ink-soft hover:bg-white/70"
          >
            <ZoomOut size={15} />
          </button>

          <button
            onClick={handleReset}
            aria-label="Resetar câmera"
            className="flex h-8 w-8 items-center justify-center rounded-full text-caiment-ink-soft hover:bg-white/70"
          >
            <RotateCcw size={15} />
          </button>

          <button
            onClick={() => handleZoom(1)}
            aria-label="Aumentar zoom"
            className="flex h-8 w-8 items-center justify-center rounded-full text-caiment-ink-soft hover:bg-white/70"
          >
            <ZoomIn size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
