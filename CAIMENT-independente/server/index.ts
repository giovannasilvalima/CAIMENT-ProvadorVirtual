
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';

import storeIntegrationRoutes from '../backend/src/features/integration/storeIntegration.routes.js';

import {
  uploadImage,
  createMultiviewTask,
  getTask,
  downloadModel,
  downloadModelByTaskId,
} from './services/tripo.js';

dotenv.config();

const app = express();
const PORT = 3001;

// ============================================================
// UPLOAD
// ============================================================

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 4,
  },
  fileFilter: (_req, file, callback) => {
    const allowedMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      return callback(
        new Error(
          `Formato de imagem não suportado: ${file.mimetype}`
        )
      );
    }

    callback(null, true);
  },
});

app.use(cors());
app.use(express.json());

app.use('/api/integration', storeIntegrationRoutes);

// ============================================================
// TIPOS DAS FOTOGRAFIAS
// ============================================================

type BodyPhotos = {
  front: Express.Multer.File;
  back: Express.Multer.File;
  right: Express.Multer.File;
  left: Express.Multer.File;
};

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

// ============================================================
// VALIDAR AS QUATRO FOTOGRAFIAS
// ============================================================

function validateBodyPhotos(
  photos: BodyPhotos
): void {
  const entries = Object.entries(photos);

  for (const [position, photo] of entries) {
    if (!photo.buffer || photo.buffer.length === 0) {
      throw new Error(
        `A fotografia ${position} está vazia.`
      );
    }

    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(
        photo.mimetype
      )
    ) {
      throw new Error(
        `Formato inválido na fotografia ${position}: ${photo.mimetype}`
      );
    }
  }
}

// ============================================================
// LOG DAS FOTOGRAFIAS RECEBIDAS
// ============================================================

function logReceivedPhotos(
  photos: BodyPhotos
): void {
  console.log('');
  console.log('====================================');
  console.log('📸 FOTOGRAFIAS RECEBIDAS');
  console.log('====================================');

  console.log(
    `Frontal: ${photos.front.originalname} (${(photos.front.size / 1024).toFixed(2)} KB)`
  );

  console.log(
    `Esquerda: ${photos.left.originalname} (${(photos.left.size / 1024).toFixed(2)} KB)`
  );

  console.log(
    `Traseira: ${photos.back.originalname} (${(photos.back.size / 1024).toFixed(2)} KB)`
  );

  console.log(
    `Direita: ${photos.right.originalname} (${(photos.right.size / 1024).toFixed(2)} KB)`
  );
}

// ============================================================
// HEALTH
// ============================================================

app.get('/api/health', (_req, res) => {
  return res.json({
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

  return res.json({
    configured,
    message: configured
      ? 'Chave do Tripo configurada no backend.'
      : 'TRIPO_API_KEY não encontrada.',
  });
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
          error:
            'É necessário enviar as quatro fotografias: front, left, back e right.',
        });
      }

      validateBodyPhotos(photos);
      logReceivedPhotos(photos);

      if (!process.env.TRIPO_API_KEY) {
        return res.status(500).json({
          success: false,
          error:
            'TRIPO_API_KEY não está configurada no backend.',
        });
      }

      console.log('');
      console.log('====================================');
      console.log('☁️ ENVIANDO FOTOGRAFIAS PARA O TRIPO');
      console.log('====================================');

      const frontToken = await uploadImage(photos.front);
      console.log('✅ Fotografia frontal enviada.');

      const leftToken = await uploadImage(photos.left);
      console.log('✅ Fotografia esquerda enviada.');

      const backToken = await uploadImage(photos.back);
      console.log('✅ Fotografia traseira enviada.');

      const rightToken = await uploadImage(photos.right);
      console.log('✅ Fotografia direita enviada.');

      const imageTokens = {
        front: frontToken,
        left: leftToken,
        back: backToken,
        right: rightToken,
      };

      console.log('');
      console.log('====================================');
      console.log('🤖 CRIANDO AVATAR 3D');
      console.log('====================================');

      const taskId = await createMultiviewTask(imageTokens);

      console.log('');
      console.log('====================================');
      console.log('✅ TAREFA CRIADA');
      console.log('====================================');
      console.log(`Task ID: ${taskId}`);

      return res.json({
        success: true,
        taskId,
        message:
          'As quatro fotografias foram enviadas ao Tripo e o processamento do avatar foi iniciado.',
      });
    } catch (error) {
      console.error('');
      console.error('====================================');
      console.error('❌ ERRO AO GERAR AVATAR');
      console.error('====================================');
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
// CONSULTAR TASK DO TRIPO
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
      const taskId = req.query.taskId;
      const modelUrl = req.query.url;

      if (
        taskId !== undefined &&
        (typeof taskId !== 'string' || !taskId.trim())
      ) {
        return res.status(400).json({
          success: false,
          error: 'Task ID inválido.',
        });
      }

      if (
        modelUrl !== undefined &&
        (typeof modelUrl !== 'string' || !modelUrl.trim())
      ) {
        return res.status(400).json({
          success: false,
          error: 'URL do modelo inválida.',
        });
      }

      if (!taskId && !modelUrl) {
        return res.status(400).json({
          success: false,
          error:
            'Informe o taskId para recuperar o modelo atualizado ou a URL do modelo.',
        });
      }

      console.log('');
      console.log('====================================');
      console.log('📥 PROXY DO MODELO 3D');
      console.log('====================================');

      let modelBuffer: Buffer;

      // ------------------------------------------------------
      // OPÇÃO 1: RECUPERAR PELA TASK
      // ------------------------------------------------------

      if (typeof taskId === 'string') {
        console.log('🔄 Recuperando modelo pelo taskId.');
        console.log(`Task ID: ${taskId}`);

        modelBuffer = await downloadModelByTaskId(taskId);
      }

      // ------------------------------------------------------
      // OPÇÃO 2: MANTER COMPATIBILIDADE COM URL ANTIGA
      // ------------------------------------------------------

      else if (typeof modelUrl === 'string') {
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
          parsedUrl.protocol !== 'https:' ||
          !(
            parsedUrl.hostname === 'tripo3d.com' ||
            parsedUrl.hostname.endsWith('.tripo3d.com')
          )
        ) {
          return res.status(400).json({
            success: false,
            error:
              'A URL do modelo não pertence a um domínio HTTPS permitido do Tripo.',
          });
        }

        console.log('📎 Utilizando URL recebida.');
        console.log(`Host: ${parsedUrl.hostname}`);

        modelBuffer = await downloadModel(modelUrl);
      } else {
        return res.status(400).json({
          success: false,
          error: 'Não foi possível identificar o modelo solicitado.',
        });
      }

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
        'private, max-age=3600'
      );

      return res.send(modelBuffer);
    } catch (error) {
      console.error('');
      console.error('====================================');
      console.error('❌ ERRO NO PROXY DO MODELO 3D');
      console.error('====================================');
      console.error(error);

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
// TRATAMENTO DE ERROS DO MULTER
// ============================================================

app.use(
  (
    error: Error,
    _req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    if (res.headersSent) {
      return next(error);
    }

    if (error instanceof multer.MulterError) {
      return res.status(400).json({
        success: false,
        error: `Erro no upload: ${error.message}`,
      });
    }

    if (
      error.message.startsWith(
        'Formato de imagem não suportado:'
      )
    ) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    console.error('❌ ERRO NO SERVIDOR:', error);

    return res.status(500).json({
      success: false,
      error: error.message || 'Erro interno no servidor.',
    });
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
  console.log('Segmentação Python: desativada.');
  console.log('Geração de avatar: Tripo Multiview.');
  console.log('Recuperação de modelo: URL atualizada por taskId.');
  console.log('');
});
