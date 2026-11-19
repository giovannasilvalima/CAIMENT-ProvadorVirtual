
import * as THREE from 'three';

/**
 * ============================================================
 * SISTEMA UNIVERSAL DE COORDENADAS CAIMENT
 * ============================================================
 *
 * Unidade física: metros.
 * X: largura.
 * Y: altura.
 * Z: profundidade.
 *
 * Origem: centro do chão, entre os pés do avatar.
 * Frente: +Z.
 * Costas: -Z.
 *
 * Todas as medidas recebidas do catálogo devem ser convertidas
 * para metros pelo garmentMeasurementsAdapter antes de chegar
 * aos geradores.
 */

export const CAIMENT_COORDINATE_SYSTEM = {
  unit: 'meters',
  up: '+Y',
  right: '+X',
  forward: '+Z',
  origin: 'body_floor_center',
} as const;

export type CoordinateSystem =
  typeof CAIMENT_COORDINATE_SYSTEM;

/**
 * ============================================================
 * UNIDADES E DIMENSÕES
 * ============================================================
 *
 * Aliases sem alteração em tempo de execução.
 * Todos continuam sendo números, preservando compatibilidade.
 */

export type Meters = number;

export type LinearMeasurement = Meters;

export type CircumferenceMeasurement = Meters;

export type LengthMeasurement = Meters;

/**
 * ============================================================
 * REFERÊNCIAS ANATÔMICAS DO AVATAR
 * ============================================================
 */

export type BodyLandmark =
  | 'bodyCenter'
  | 'neckBase'
  | 'shoulderCenter'
  | 'leftShoulder'
  | 'rightShoulder'
  | 'bustCenter'
  | 'waistCenter'
  | 'hipCenter'
  | 'leftHip'
  | 'rightHip'
  | 'crotchCenter'
  | 'leftKnee'
  | 'rightKnee'
  | 'leftAnkle'
  | 'rightAnkle'
  | 'leftElbow'
  | 'rightElbow'
  | 'leftWrist'
  | 'rightWrist';

export type BodyLandmarks = Record<
  BodyLandmark,
  THREE.Vector3
>;

/**
 * ============================================================
 * REGIÕES ANATÔMICAS
 * ============================================================
 */

export type BodyRegion =
  | 'neck'
  | 'shoulders'
  | 'chest'
  | 'abdomen'
  | 'waist'
  | 'pelvis'
  | 'leftArm'
  | 'rightArm'
  | 'leftForearm'
  | 'rightForearm'
  | 'leftHand'
  | 'rightHand'
  | 'leftThigh'
  | 'rightThigh'
  | 'leftLeg'
  | 'rightLeg'
  | 'leftFoot'
  | 'rightFoot';

/**
 * ============================================================
 * TIPOS DE ROUPA
 * ============================================================
 */

export type GarmentType =
  | 'tshirt'
  | 'short'
  | 'dress'
  | 'pants';

/**
 * tshirt representa o gerador da regata no FitSense.
 * Não significa que o gerador deva produzir mangas.
 */

/**
 * ============================================================
 * TIPOS DE PAINÉIS
 * ============================================================
 */

export type GarmentPanelType =
  | 'front'
  | 'back'
  | 'leftSleeve'
  | 'rightSleeve'
  | 'leftStrap'
  | 'rightStrap'
  | 'collar'
  | 'waistband'
  | 'leftLeg'
  | 'rightLeg'
  | 'skirtFront'
  | 'skirtBack'
  | 'bodiceFront'
  | 'bodiceBack';

/**
 * ============================================================
 * REGIÕES SEMÂNTICAS DA ROUPA
 * ============================================================
 */

export type GarmentRegionRole =
  | 'coverage'
  | 'opening'
  | 'support'
  | 'hem'
  | 'articulation'
  | 'contact';

export interface GarmentRegionDefinition {
  id: string;
  name: string;
  bodyRegion: BodyRegion;
  vertexIndices: number[];
  role: GarmentRegionRole;
}

/**
 * ============================================================
 * CLASSIFICAÇÃO SEMÂNTICA DAS BORDAS
 * ============================================================
 */

export type GarmentBoundaryRole =
  | 'neckline'
  | 'hem'
  | 'armhole'
  | 'sleeveOpening'
  | 'strapOpening'
  | 'waistOpening'
  | 'legOpening'
  | 'sideOpening'
  | 'crotch'
  | 'other';

export type GarmentBoundaryFinish =
  | 'raw'
  | 'folded'
  | 'stitched'
  | 'bound'
  | 'ribbed';

export interface GarmentBoundaryDefinition {
  id: string;
  name: string;
  panelId: string;

  /**
   * Índices locais dos vértices do painel.
   */
  vertexIndices: number[];

  role: GarmentBoundaryRole;
  finish?: GarmentBoundaryFinish;
}

/**
 * ============================================================
 * ÂNCORAS DO AVATAR
 * ============================================================
 */

export interface GarmentAnchor {
  id: string;
  bodyLandmark: BodyLandmark;
  garmentPosition: THREE.Vector3;
  weight?: number;
}

/**
 * ============================================================
 * SUSTENTAÇÃO DA ROUPA
 * ============================================================
 */

export type GarmentSupportMode =
  | 'contact'
  | 'wrap'
  | 'hang';

export interface GarmentSupportDefinition {
  id: string;
  garmentRegionId: string;
  bodyRegion: BodyRegion;
  mode: GarmentSupportMode;
  strength: number;
}

/**
 * ============================================================
 * CONTRATO UNIVERSAL DE ENCAIXE
 * ============================================================
 */

export interface GarmentFitDefinition {
  coverage: BodyRegion[];
  anchors: GarmentAnchor[];
  clearance: number;
  scale?: THREE.Vector3;
  regions?: GarmentRegionDefinition[];
  supports?: GarmentSupportDefinition[];
}

/**
 * ============================================================
 * MEDIDAS DA REGATA
 * GarmentType: tshirt
 * geometryProfile: tshirt-basic
 * garmentModel: tank-top
 * ============================================================
 *
 * Compatível com o produto Regata Essential do FitSense.
 *
 * IMPORTANTE:
 *
 * width:
 * Largura plana total do corpo da regata.
 *
 * height:
 * Comprimento total da regata.
 *
 * depth:
 * Profundidade da peça no eixo Z.
 *
 * shoulderWidth:
 * Largura entre as extremidades dos ombros.
 *
 * neckWidth:
 * Largura da abertura do decote.
 *
 * Circunferências:
 * Representam o contorno completo da peça.
 *
 * Não existem medidas de mangas neste modelo.
 */

export interface TShirtMeasurements {
  // Estrutura principal.
  width: LinearMeasurement;
  height: LengthMeasurement;
  depth: LinearMeasurement;
  shoulderWidth: LinearMeasurement;
  neckWidth: LinearMeasurement;

  // Contornos completos.
  chestCircumference?: CircumferenceMeasurement;
  waistCircumference?: CircumferenceMeasurement;
  hemCircumference?: CircumferenceMeasurement;

  // Alturas de referência.
  bustHeight?: LengthMeasurement;
  waistHeight?: LengthMeasurement;
  hemHeight?: LengthMeasurement;

  // Alças.
  strapWidth?: LinearMeasurement;
  strapLength?: LengthMeasurement;
  strapSpacing?: LinearMeasurement;
  strapPositionFront?: LinearMeasurement;
  strapPositionBack?: LinearMeasurement;

  // Decote.
  frontNeckDepth?: LengthMeasurement;
  backNeckDepth?: LengthMeasurement;
  necklineFrontWidth?: LinearMeasurement;
  necklineBackWidth?: LinearMeasurement;

  // Cavas.
  armholeDepth?: LengthMeasurement;
  armholeFrontDepth?: LengthMeasurement;
  armholeBackDepth?: LengthMeasurement;
  armholeWidth?: LinearMeasurement;

  // Acabamentos.
  hemWidth?: LinearMeasurement;
  necklineFinishWidth?: LinearMeasurement;
  armholeFinishWidth?: LinearMeasurement;
}

/**
 * ============================================================
 * MEDIDAS DO VESTIDO
 * GarmentType: dress
 * geometryProfile: dress-a-line
 * ============================================================
 *
 * bustWidth, waistWidth e hipWidth são circunferências
 * completas da peça, apesar do sufixo Width.
 *
 * length representa o comprimento total.
 *
 * depth representa a profundidade da peça no eixo Z.
 */

export interface DressMeasurements {
  // Contornos completos.
  bustWidth: CircumferenceMeasurement;
  waistWidth: CircumferenceMeasurement;
  hipWidth: CircumferenceMeasurement;

  // Estrutura principal.
  shoulderWidth: LinearMeasurement;
  length: LengthMeasurement;
  depth: LinearMeasurement;
  strapWidth: LinearMeasurement;

  // Alças.
  strapLength?: LengthMeasurement;
  strapSpacing?: LinearMeasurement;
  strapPositionFront?: LinearMeasurement;
  strapPositionBack?: LinearMeasurement;

  // Decote.
  frontNeckDepth?: LengthMeasurement;
  backNeckDepth?: LengthMeasurement;
  necklineFrontWidth?: LinearMeasurement;
  necklineBackWidth?: LinearMeasurement;

  // Cavas.
  armholeDepth?: LengthMeasurement;
  armholeFrontDepth?: LengthMeasurement;
  armholeBackDepth?: LengthMeasurement;
  armholeWidth?: LinearMeasurement;

  // Alturas de referência.
  bustHeight?: LengthMeasurement;
  waistHeight?: LengthMeasurement;
  hipHeight?: LengthMeasurement;

  // Comprimentos diferenciados.
  frontLength?: LengthMeasurement;
  backLength?: LengthMeasurement;

  // Saia e abertura inferior.
  hemCircumference?: CircumferenceMeasurement;
  skirtFlare?: LinearMeasurement;
  skirtFrontLength?: LengthMeasurement;
  skirtBackLength?: LengthMeasurement;

  // Profundidades por região.
  bustDepth?: LinearMeasurement;
  waistDepth?: LinearMeasurement;
  hipDepth?: LinearMeasurement;

  // Acabamentos.
  hemWidth?: LinearMeasurement;
  necklineFinishWidth?: LinearMeasurement;
  armholeFinishWidth?: LinearMeasurement;
}

/**
 * ============================================================
 * MEDIDAS DA CALÇA
 * GarmentType: pants
 * geometryProfile: pants-wide-leg
 * ============================================================
 *
 * waistWidth:
 * Circunferência completa da cintura.
 *
 * hipWidth:
 * Circunferência completa do quadril.
 *
 * thighWidth:
 * Circunferência completa da coxa.
 *
 * legOpening:
 * Circunferência da abertura de cada perna.
 *
 * length:
 * Comprimento entrepernas.
 *
 * outseamLength:
 * Comprimento externo da calça.
 *
 * depth:
 * Profundidade da peça no eixo Z.
 *
 * rise:
 * Altura do gancho.
 */

export interface PantsMeasurements {
  // Contornos completos.
  waistWidth: CircumferenceMeasurement;
  hipWidth: CircumferenceMeasurement;
  thighWidth: CircumferenceMeasurement;
  legOpening: CircumferenceMeasurement;

  // Estrutura principal.
  length: LengthMeasurement;
  depth: LinearMeasurement;
  crotchDepth: LengthMeasurement;
  crotchWidth: LinearMeasurement;
  rise: LengthMeasurement;

  // Comprimentos do gancho.
  frontRise?: LengthMeasurement;
  backRise?: LengthMeasurement;
  frontCrotchLength?: LengthMeasurement;
  backCrotchLength?: LengthMeasurement;

  // Contornos intermediários das pernas.
  kneeCircumference?: CircumferenceMeasurement;
  calfCircumference?: CircumferenceMeasurement;
  ankleCircumference?: CircumferenceMeasurement;

  // Alturas anatômicas.
  thighHeight?: LengthMeasurement;
  kneeHeight?: LengthMeasurement;
  calfHeight?: LengthMeasurement;

  // Comprimento externo.
  outseamLength?: LengthMeasurement;

  // Cós.
  waistbandHeight?: LengthMeasurement;
  waistbandCircumference?: CircumferenceMeasurement;

  // Detalhes das pernas.
  leftLegLength?: LengthMeasurement;
  rightLegLength?: LengthMeasurement;
  legSeparation?: LinearMeasurement;

  // Acabamentos.
  hemWidth?: LinearMeasurement;
  waistbandFinishWidth?: LinearMeasurement;
  hemCircumference?: CircumferenceMeasurement;
}

/**
 * ============================================================
 * MEDIDAS DO SHORT
 * GarmentType: short
 * geometryProfile: shorts-basic
 * ============================================================
 *
 * waistWidth:
 * Circunferência completa da cintura.
 *
 * hipWidth:
 * Circunferência completa do quadril.
 *
 * thighWidth:
 * Circunferência da coxa.
 *
 * legOpening:
 * Circunferência da abertura de cada perna.
 *
 * length:
 * Comprimento entrepernas.
 *
 * outseamLength:
 * Comprimento externo.
 *
 * depth:
 * Profundidade da peça no eixo Z.
 */

export interface ShortMeasurements {
  // Contornos completos.
  waistWidth: CircumferenceMeasurement;
  hipWidth: CircumferenceMeasurement;
  thighWidth: CircumferenceMeasurement;
  legOpening: CircumferenceMeasurement;

  // Estrutura principal.
  length: LengthMeasurement;
  depth: LinearMeasurement;
  crotchDepth: LengthMeasurement;
  crotchWidth: LinearMeasurement;
  rise: LengthMeasurement;

  // Comprimentos do gancho.
  frontRise?: LengthMeasurement;
  backRise?: LengthMeasurement;
  frontCrotchLength?: LengthMeasurement;
  backCrotchLength?: LengthMeasurement;

  // Contornos intermediários.
  kneeCircumference?: CircumferenceMeasurement;

  // Alturas anatômicas.
  thighHeight?: LengthMeasurement;
  kneeHeight?: LengthMeasurement;

  // Comprimento externo.
  outseamLength?: LengthMeasurement;

  // Cós.
  waistbandHeight?: LengthMeasurement;
  waistbandCircumference?: CircumferenceMeasurement;

  // Detalhes das pernas.
  leftLegLength?: LengthMeasurement;
  rightLegLength?: LengthMeasurement;
  legSeparation?: LinearMeasurement;

  // Acabamentos.
  hemWidth?: LinearMeasurement;
  waistbandFinishWidth?: LinearMeasurement;
  hemCircumference?: CircumferenceMeasurement;
}

/**
 * ============================================================
 * MEDIDAS POR TIPO DE ROUPA
 * ============================================================
 *
 * Permite relacionar cada GarmentType ao seu contrato específico.
 */

export interface GarmentMeasurementsByType {
  tshirt: TShirtMeasurements;
  dress: DressMeasurements;
  short: ShortMeasurements;
  pants: PantsMeasurements;
}

/**
 * Compatibilidade com código legado do gerador da regata.
 *
 * Este alias representa somente a regata.
 * Não representa uma união dos quatro tipos.
 */

export type GarmentMeasurements = TShirtMeasurements;

/**
 * ============================================================
 * PARÂMETROS GERAIS DA ROUPA
 * ============================================================
 */

export interface GarmentParameters<
  TType extends GarmentType = GarmentType,
  TMeasurements extends object = Record<string, number>,
> {
  id: string;
  name: string;
  type: TType;
  measurements: TMeasurements;
  fit?: GarmentFitDefinition;
  color?: THREE.ColorRepresentation;
}

/**
 * ============================================================
 * VÉRTICES
 * ============================================================
 */

export interface GarmentVertex {
  id: number;
  position: THREE.Vector3;
  initialPosition: THREE.Vector3;
  mass: number;
  pinned: boolean;
}

/**
 * ============================================================
 * TRIÂNGULOS
 * ============================================================
 */

export interface GarmentTriangle {
  a: number;
  b: number;
  c: number;
}

/**
 * ============================================================
 * PAINÉIS
 * ============================================================
 */

export interface GarmentPanel<
  TPanelType extends GarmentPanelType = GarmentPanelType,
> {
  id: string;
  type: TPanelType;
  name: string;
  vertices: GarmentVertex[];
  triangles: GarmentTriangle[];
  geometry: THREE.BufferGeometry;
}

/**
 * ============================================================
 * COSTURAS
 * ============================================================
 */

export interface GarmentSeam {
  id: string;
  name: string;
  panelAId: string;
  panelBId: string;
  edgeA: number[];
  edgeB: number[];
  stiffness: number;
}

/**
 * ============================================================
 * DADOS UNIVERSAIS DA MALHA
 * ============================================================
 */

export interface GarmentMeshData<
  TPanelType extends GarmentPanelType = GarmentPanelType,
> {
  panels: GarmentPanel<TPanelType>[];
  seams: GarmentSeam[];
  vertexCount: number;
  triangleCount: number;

  coordinateSystem?: CoordinateSystem;
  fit?: GarmentFitDefinition;
  boundaries?: GarmentBoundaryDefinition[];
}

/**
 * ============================================================
 * RESULTADO DA GERAÇÃO
 * ============================================================
 */

export interface GarmentResult<
  TType extends GarmentType = GarmentType,
  TMeasurements extends object = Record<string, number>,
  TPanelType extends GarmentPanelType = GarmentPanelType,
> {
  id: string;
  name: string;
  type: TType;
  group: THREE.Group;
  measurements: TMeasurements;
  meshData: GarmentMeshData<TPanelType>;
}

/**
 * ============================================================
 * MATERIAL
 * ============================================================
 */

export interface FabricParameters {
  color: THREE.ColorRepresentation;
  roughness: number;
  metalness: number;
  side?: THREE.Side;
}

/**
 * ============================================================
 * SIMULAÇÃO
 * ============================================================
 */

export interface ClothSimulationParameters {
  gravity: number;
  stiffness: number;
  damping: number;
  mass: number;
}
