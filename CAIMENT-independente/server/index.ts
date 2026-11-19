
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  mkdtemp,
  writeFile,
  readFile,
  rm,
  access,
  mkdir,
} from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import storeIntegrationRoutes from '../backend/src/features/integration/storeIntegration.routes.js';

import {
  uploadImage,
  createMultiviewTask,
  getTask,
  downloadModel,
} from './services/tripo.js';

dotenv.config();

const app = express();
const PORT = 3001;
const execFileAsync = promisify(execFile);

// ============================================================
// CAMINHOS DO PROJETO
// ============================================================

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SERVER_DIR, '..');
const BACKEND_DIR = path.join(PROJECT_ROOT, 'backend');

const SEGMENTATION_SCRIPT = path.join(
  BACKEND_DIR,
  'src',
  'features',
  'body',
  'geometry',
  'segmentBodyPhotos.py'
);

const SEGMENTATION_DATA_DIR = path.join(
  BACKEND_DIR,
  'data',
  'body-segmentations'
);

const LATEST_SEGMENTATION_FILE = path.join(
  SEGMENTATION_DATA_DIR,
  'latest.json'
);

const PYTHON_EXECUTABLE =
  process.env.CAIMENT_PYTHON ||
  (process.platform === 'win32'
    ? path.join(BACKEND_DIR, '.venv', 'Scripts', 'python.exe')
    : path.join(BACKEND_DIR, '.venv', 'bin', 'python'));

// ============================================================
// UPLOAD
// ============================================================

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 4,
  },
});

app.use(cors());
app.use(express.json());

app.use('/api/integration', storeIntegrationRoutes);

// ============================================================
// EXTENSÃO DAS IMAGENS
// ============================================================

function getImageExtension(file: Express.Multer.File): string {
  const originalExtension = path
    .extname(file.originalname)
    .toLowerCase();

  if (['.jpg', '.jpeg', '.png', '.webp'].includes(originalExtension)) {
    return originalExtension;
  }

  const mimeExtensions: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
  };

  const extension = mimeExtensions[file.mimetype];

  if (!extension) {
    throw new Error(
      `Formato de imagem não suportado: ${file.mimetype}`
    );
  }

  return extension;
}

// ============================================================
// SALVAR SEGMENTAÇÃO PERMANENTEMENTE
// ============================================================

async function saveSegmentation(
  segmentation: Record<string, unknown>
): Promise<void> {
  await mkdir(SEGMENTATION_DATA_DIR, {
    recursive: true,
  });

  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-');

  const timestampedFile = path.join(
    SEGMENTATION_DATA_DIR,
    `segmentation-${timestamp}.json`
  );

  const content = JSON.stringify(segmentation, null, 2);

  // Mantém um histórico e também uma cópia sempre atualizada.

  await writeFile(timestampedFile, content, 'utf-8');

  await writeFile(
    LATEST_SEGMENTATION_FILE,
    content,
    'utf-8'
  );

  console.log('');
  console.log('====================================');
  console.log('💾 SEGMENTAÇÃO SALVA');
  console.log('====================================');
  console.log(`Arquivo mais recente: ${LATEST_SEGMENTATION_FILE}`);
}

// ============================================================
// SEGMENTAÇÃO DAS QUATRO FOTOS COM SAM 2.1
// ============================================================

type BodyPhotos = {
  front: Express.Multer.File;
  back: Express.Multer.File;
  right: Express.Multer.File;
  left: Express.Multer.File;
};

async function segmentBodyPhotos(
  photos: BodyPhotos
): Promise<Record<string, unknown>> {
  if (!existsSync(SEGMENTATION_SCRIPT)) {
    throw new Error(
      `Script de segmentação não encontrado: ${SEGMENTATION_SCRIPT}`
    );
  }

  try {
    await access(PYTHON_EXECUTABLE);
  } catch {
    throw new Error(
      `Python da .venv não encontrado: ${PYTHON_EXECUTABLE}`
    );
  }

  const temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'caiment-segmentation-')
  );

  const frontPath = path.join(
    temporaryDirectory,
    `front${getImageExtension(photos.front)}`
  );

  const backPath = path.join(
    temporaryDirectory,
    `back${getImageExtension(photos.back)}`
  );

  const rightPath = path.join(
    temporaryDirectory,
    `right${getImageExtension(photos.right)}`
  );

  const leftPath = path.join(
    temporaryDirectory,
    `left${getImageExtension(photos.left)}`
  );

  const outputPath = path.join(
    temporaryDirectory,
    'segmentation.json'
  );

  try {
    await Promise.all([
      writeFile(frontPath, photos.front.buffer),
      writeFile(backPath, photos.back.buffer),
      writeFile(rightPath, photos.right.buffer),
      writeFile(leftPath, photos.left.buffer),
    ]);

    console.log('');
    console.log('====================================');
    console.log('🧍 SEGMENTAÇÃO CORPORAL — SAM 2.1');
    console.log('====================================');

    try {
      const { stdout, stderr } = await execFileAsync(
        PYTHON_EXECUTABLE,
        [
          SEGMENTATION_SCRIPT,
          '--front',
          frontPath,
          '--back',
          backPath,
          '--right',
          rightPath,
          '--left',
          leftPath,
          '--output',
          outputPath,
        ],
        {
          cwd: PROJECT_ROOT,
          windowsHide: true,
          maxBuffer: 20 * 1024 * 1024,
        }
      );

      if (stdout) {
        console.log(stdout);
      }

      if (stderr) {
        console.log('Avisos do Python:', stderr);
      }
    } catch (error) {
      const pythonError = error as Error & {
        stderr?: string;
      };

      console.error('Erro durante a execução do SAM 2.1:');
      console.error(pythonError.stderr || pythonError.message);

      throw new Error(
        `Falha na segmentação corporal: ${
          pythonError.stderr || pythonError.message
        }`
      );
    }

    const outputContent = await readFile(outputPath, 'utf-8');

    const segmentation = JSON.parse(
      outputContent
    ) as Record<string, unknown>;

    // Salva antes de remover os arquivos temporários.

    await saveSegmentation(segmentation);

    console.log('✅ Segmentação das quatro fotos concluída.');

    return segmentation;
  } finally {
    await rm(temporaryDirectory, {
      recursive: true,
      force: true,
    });
  }
}

// ============================================================
// EXTRAIR AS QUATRO FOTOS DO MULTER
// ============================================================

function getBodyPhotos(
  req: express.Request
): BodyPhotos | null {
  const files = req.files as
    | {
        [fieldname: string]: Express.Multer.File[];
      }
    | undefined;

  const front = files?.front?.[0];
  const left = files?.left?.[0];
  const back = files?.back?.[0];
  const right = files?.right?.[0];

  if (!front || !left || !back || !right) {
    return null;
  }

  return {
    front,
    back,
    right,
    left,
  };
}

function logReceivedPhotos(photos: BodyPhotos): void {
  console.log('');
  console.log('====================================');
  console.log('📸 FOTOS RECEBIDAS');
  console.log('====================================');

  console.log(`Frontal: ${photos.front.originalname}`);
  console.log(`Esquerda: ${photos.left.originalname}`);
  console.log(`Traseira: ${photos.back.originalname}`);
  console.log(`Direita: ${photos.right.originalname}`);
}

// ============================================================
// HEALTH
// ============================================================

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    message: 'Backend do Caiment funcionando!',
  });
});

// ============================================================
// TRIPO STATUS
// ============================================================

app.get('/api/tripo/status', (_req, res) => {
  const configured = Boolean(
    process.env.TRIPO_API_KEY
  );

  res.json({
    configured,
    message: configured
      ? 'Chave do Tripo configurada no backend.'
      : 'TRIPO_API_KEY não encontrada.',
  });
});

// ============================================================
// SEGMENTAR FOTOS SEM GERAR AVATAR
// ============================================================

app.post(
  '/api/body/segment',

  upload.fields([
    { name: 'front', maxCount: 1 },
    { name: 'left', maxCount: 1 },
    { name: 'back', maxCount: 1 },
    { name: 'right', maxCount: 1 },
  ]),

  async (req, res) => {
    try {
      const photos = getBodyPhotos(req);

      if (!photos) {
        return res.status(400).json({
          success: false,
          error: 'É necessário enviar as quatro fotos.',
        });
      }

      logReceivedPhotos(photos);

      // Executa somente o SAM 2.1.
      // Esta rota NÃO envia imagens ao Tripo.
      // Esta rota NÃO cria tarefas nem avatares.

      const segmentation = await segmentBodyPhotos(photos);

      return res.json({
        success: true,
        segmentation,
        message:
          'Fotos segmentadas e resultado salvo. Nenhum avatar foi gerado.',
      });
    } catch (error) {
      console.error('❌ ERRO NA SEGMENTAÇÃO CORPORAL:', error);

      return res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Erro interno na segmentação corporal.',
      });
    }
  }
);

// ============================================================
// RECUPERAR A ÚLTIMA SEGMENTAÇÃO
// ============================================================

app.get('/api/body/segmentation/latest', async (_req, res) => {
  try {
    if (!existsSync(LATEST_SEGMENTATION_FILE)) {
      return res.status(404).json({
        success: false,
        error: 'Ainda não existe uma segmentação salva.',
      });
    }

    const content = await readFile(
      LATEST_SEGMENTATION_FILE,
      'utf-8'
    );

    const segmentation = JSON.parse(content);

    return res.json({
      success: true,
      segmentation,
    });
  } catch (error) {
    console.error('❌ ERRO AO RECUPERAR SEGMENTAÇÃO:', error);

    return res.status(500).json({
      success: false,
      error: 'Não foi possível recuperar a segmentação.',
    });
  }
});

// ============================================================
// GERAR AVATAR COM TRIPO
// ============================================================

app.post(
  '/api/avatar/generate',

  upload.fields([
    { name: 'front', maxCount: 1 },
    { name: 'left', maxCount: 1 },
    { name: 'back', maxCount: 1 },
    { name: 'right', maxCount: 1 },
  ]),

  async (req, res) => {
    try {
      const photos = getBodyPhotos(req);

      if (!photos) {
        return res.status(400).json({
          success: false,
          error: 'É necessário enviar as quatro fotos.',
        });
      }

      logReceivedPhotos(photos);

      // A segmentação continua sendo salva permanentemente.

      const segmentation = await segmentBodyPhotos(photos);

      // ==========================================
      // UPLOAD PARA O TRIPO
      // ==========================================

      console.log('');
      console.log('====================================');
      console.log('☁️ ENVIANDO PARA O TRIPO');
      console.log('====================================');

      const frontToken = await uploadImage(photos.front);
      const leftToken = await uploadImage(photos.left);
      const backToken = await uploadImage(photos.back);
      const rightToken = await uploadImage(photos.right);

      const imageTokens = {
        front: frontToken,
        left: leftToken,
        back: backToken,
        right: rightToken,
      };

      // ==========================================
      // CRIAR TAREFA
      // ==========================================

      console.log('');
      console.log('====================================');
      console.log('🤖 CRIANDO AVATAR 3D');
      console.log('====================================');

      const taskId = await createMultiviewTask(imageTokens);

      return res.json({
        success: true,
        taskId,
        segmentation,
        message:
          'Fotos segmentadas e avatar enviado para processamento.',
      });
    } catch (error) {
      console.error('');
      console.error('❌ ERRO AO GERAR AVATAR');
      console.error(error);

      return res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Erro interno ao gerar avatar.',
      });
    }
  }
);

// ============================================================
// CONSULTAR TASK
// ============================================================

app.get(
  '/api/avatar/task/:taskId',

  async (req, res) => {
    try {
      const { taskId } = req.params;

      if (!taskId) {
        return res.status(400).json({
          success: false,
          error: 'Task ID não informado.',
        });
      }

      console.log('');
      console.log('====================================');
      console.log('🔎 CONSULTANDO AVATAR');
      console.log('====================================');

      console.log(`Task ID: ${taskId}`);

      const task = await getTask(taskId);

      return res.json({
        success: true,
        task,
      });
    } catch (error) {
      console.error(
        '❌ Erro ao consultar tarefa:',
        error
      );

      return res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Erro ao consultar tarefa.',
      });
    }
  }
);

// ============================================================
// PROXY DO MODELO 3D
// ============================================================

app.get(
  '/api/avatar/model',

  async (req, res) => {
    try {
      const modelUrl = req.query.url;

      if (
        !modelUrl ||
        typeof modelUrl !== 'string'
      ) {
        return res.status(400).json({
          success: false,
          error: 'URL do modelo não informada.',
        });
      }

      let parsedUrl: URL;

      try {
        parsedUrl = new URL(modelUrl);
      } catch {
        return res.status(400).json({
          success: false,
          error: 'URL do modelo inválida.',
        });
      }

      if (
        !parsedUrl.hostname.endsWith('.tripo3d.com')
      ) {
        return res.status(400).json({
          success: false,
          error:
            'A URL do modelo não pertence ao Tripo.',
        });
      }

      console.log('');
      console.log('====================================');
      console.log('📥 PROXY DO MODELO 3D');
      console.log('====================================');

      console.log(`Host: ${parsedUrl.hostname}`);

      const modelBuffer = await downloadModel(modelUrl);

      console.log(
        `✅ Modelo recebido: ${(
          modelBuffer.length /
          1024 /
          1024
        ).toFixed(2)} MB`
      );

      res.setHeader(
        'Content-Type',
        'model/gltf-binary'
      );

      res.setHeader(
        'Content-Length',
        modelBuffer.length.toString()
      );

      res.setHeader(
        'Cache-Control',
        'public, max-age=3600'
      );

      return res.send(modelBuffer);
    } catch (error) {
      console.error(
        '❌ Erro no proxy do modelo 3D:',
        error
      );

      return res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Erro desconhecido ao carregar o modelo.',
      });
    }
  }
);

// ============================================================
// START SERVER
// ============================================================

app.listen(PORT, () => {
  console.log('');
  console.log('====================================');
  console.log('🚀 CAIMENT BACKEND');
  console.log('====================================');
  console.log(`Backend rodando em http://localhost:${PORT}`);
  console.log('');
});
