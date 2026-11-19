
import { useMemo, useState } from 'react';
import * as THREE from 'three';

import { Canvas } from '@react-three/fiber';
import { Line, OrbitControls } from '@react-three/drei';

import type {
  GarmentPanel,
  GarmentResult,
  GarmentSeam,
  GarmentPanelType,
} from '../geometry/types';

type DisplayMode = 'original' | 'exploded';

interface GarmentVisualizerProps {
  garment: GarmentResult<
    any,
    any,
    GarmentPanelType
  >;
}

interface PanelOffset {
  x: number;
  y: number;
  z: number;
}

/**
 * Cores específicas dos painéis da camiseta.
 * Outros tipos de painéis recebem cores automaticamente.
 */
const PANEL_COLORS: Record<string, string> = {
  front: '#9254e1',
  back: '#7040b0',
  leftSleeve: '#b3ff79',
  rightSleeve: '#83c94f',
  collar: '#e5a5ff',
};

/**
 * Paleta de cores para painéis de outros tipos de roupa.
 */
const GENERIC_PANEL_COLORS = [
  '#9254e1',
  '#b3ff79',
  '#e5a5ff',
  '#ffbd59',
  '#55c8c8',
  '#e87979',
  '#8ca8ff',
  '#c49a6c',
];

const SEAM_COLOR = '#ffbd59';

/**
 * Retorna a cor do painel.
 * Se o tipo não estiver cadastrado, utiliza a paleta genérica.
 */
function getPanelColor(
  panelType: string,
  panelIndex: number,
): string {
  return (
    PANEL_COLORS[panelType] ??
    GENERIC_PANEL_COLORS[
      panelIndex % GENERIC_PANEL_COLORS.length
    ]
  );
}

/**
 * Calcula a posição dos painéis na visualização.
 *
 * Os deslocamentos da camiseta são preservados.
 * Outros tipos recebem uma distribuição radial automática.
 */
function getPanelOffset(
  panelType: string,
  mode: DisplayMode,
  panelIndex: number,
  totalPanels: number,
): PanelOffset {
  if (mode === 'original') {
    return { x: 0, y: 0, z: 0 };
  }

  switch (panelType) {
    case 'front':
      return { x: 0, y: 0, z: 0.16 };

    case 'back':
      return { x: 0, y: 0, z: -0.16 };

    case 'leftSleeve':
      return { x: -0.24, y: 0, z: 0 };

    case 'rightSleeve':
      return { x: 0.24, y: 0, z: 0 };

    case 'collar':
      return { x: 0, y: 0.2, z: 0 };

    default: {
      const angle =
        (2 * Math.PI * panelIndex) /
        Math.max(totalPanels, 1);

      const radius = 0.22;

      return {
        x: Math.cos(angle) * radius,
        y: panelIndex % 2 === 0 ? 0.06 : -0.06,
        z: Math.sin(angle) * radius,
      };
    }
  }
}

/**
 * Recupera as posições dos vértices de uma costura.
 */
function getSeamPoints(
  panel: GarmentPanel,
  indices: number[],
): THREE.Vector3[] {
  return indices
    .map((index) => panel.vertices[index]?.position)
    .filter(
      (position): position is THREE.Vector3 =>
        position instanceof THREE.Vector3,
    );
}

/**
 * Visualização individual de um painel.
 */
function PanelView({
  panel,
  mode,
  seams,
  panelIndex,
  totalPanels,
}: {
  panel: GarmentPanel;
  mode: DisplayMode;
  seams: GarmentSeam[];
  panelIndex: number;
  totalPanels: number;
}) {
  const offset = getPanelOffset(
    panel.type,
    mode,
    panelIndex,
    totalPanels,
  );

  const panelColor = getPanelColor(
    panel.type,
    panelIndex,
  );

  const panelSeams = useMemo(() => {
    return seams
      .map((seam) => {
        if (seam.panelAId === panel.id) {
          return {
            id: seam.id,
            indices: seam.edgeA,
          };
        }

        if (seam.panelBId === panel.id) {
          return {
            id: seam.id,
            indices: seam.edgeB,
          };
        }

        return null;
      })
      .filter(
        (
          item,
        ): item is { id: string; indices: number[] } =>
          item !== null,
      );
  }, [panel, seams]);

  const seamLines = useMemo(() => {
    return panelSeams.map((seam) => ({
      id: seam.id,
      points: getSeamPoints(panel, seam.indices),
    }));
  }, [panel, panelSeams]);

  return (
    <group position={[offset.x, offset.y, offset.z]}>
      <mesh geometry={panel.geometry}>
        <meshStandardMaterial
          color={panelColor}
          roughness={0.85}
          metalness={0}
          side={THREE.DoubleSide}
        />
      </mesh>

      {seamLines.map((seam) => (
        seam.points.length >= 2 && (
          <Line
            key={seam.id}
            points={seam.points}
            color={SEAM_COLOR}
            lineWidth={2.5}
          />
        )
      ))}
    </group>
  );
}

/**
 * Cena 3D genérica da roupa.
 *
 * Aceita qualquer estrutura de medidas, sem limitar
 * o visualizador a um tipo específico de vestuário.
 */
function GarmentScene({
  garment,
  mode,
}: {
  garment: GarmentVisualizerProps['garment'];
  mode: DisplayMode;
}) {
  const panels = garment.meshData.panels;
  const seams = garment.meshData.seams;

  return (
    <>
      <ambientLight intensity={1.5} />

      <directionalLight
        position={[3, 5, 5]}
        intensity={2}
      />

      <directionalLight
        position={[-3, 2, -4]}
        intensity={1}
      />

      {panels.map((panel, index) => (
        <PanelView
          key={panel.id}
          panel={panel}
          mode={mode}
          seams={seams}
          panelIndex={index}
          totalPanels={panels.length}
        />
      ))}

      <OrbitControls
        makeDefault
        target={[0, 0.15, 0]}
        enableDamping
        dampingFactor={0.08}
        minDistance={0.7}
        maxDistance={5}
      />

      <gridHelper
        args={[2, 20, '#777777', '#333333']}
        position={[0, -0.4, 0]}
      />
    </>
  );
}

/**
 * Visualizador principal genérico.
 */
export default function GarmentVisualizer({
  garment,
}: GarmentVisualizerProps) {
  const [mode, setMode] = useState<DisplayMode>('original');

  if (!garment?.meshData?.panels?.length) {
    return (
      <div>
        Não foi possível encontrar os painéis da roupa.
      </div>
    );
  }

  return (
    <section
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      <header>
        <h2>{garment.name}</h2>

        <p>
          {garment.meshData.panels.length} painéis ·{' '}
          {garment.meshData.seams.length} costuras ·{' '}
          {garment.meshData.vertexCount} vértices
        </p>
      </header>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <button
          type="button"
          onClick={() => setMode('original')}
          disabled={mode === 'original'}
        >
          Posição original
        </button>

        <button
          type="button"
          onClick={() => setMode('exploded')}
          disabled={mode === 'exploded'}
        >
          Separar painéis
        </button>
      </div>

      <div
        style={{
          width: '100%',
          height: '520px',
          overflow: 'hidden',
          borderRadius: '12px',
          background: '#1c1b1e',
        }}
      >
        <Canvas
          camera={{
            position: [2.2, 1.2, 3.2],
            fov: 45,
            near: 0.01,
            far: 100,
          }}
        >
          <color
            attach="background"
            args={['#1c1b1e']}
          />

          <GarmentScene
            garment={garment}
            mode={mode}
          />
        </Canvas>
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '14px',
          fontSize: '13px',
        }}
      >
        {garment.meshData.panels.map((panel, index) => (
          <span
            key={panel.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
            }}
          >
            <span
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '3px',
                background: getPanelColor(
                  panel.type,
                  index,
                ),
              }}
            />

            {panel.name}
          </span>
        ))}

        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
          }}
        >
          <span
            style={{
              width: '18px',
              height: '3px',
              background: SEAM_COLOR,
            }}
          />
          Costuras
        </span>
      </div>

      <p style={{ fontSize: '12px', opacity: 0.7 }}>
        Arraste para girar a câmera e utilize a roda do mouse
        para aproximar ou afastar.
      </p>
    </section>
  );
}