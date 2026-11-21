
const TRIPO_API_URL = 'https://openapi.tripo3d.ai/v3';

function getApiKey(): string {
  const apiKey = process.env.TRIPO_API_KEY?.trim();

  if (!apiKey) {
    throw new Error('TRIPO_API_KEY não encontrada no arquivo .env');
  }

  return apiKey;
}

interface TripoUploadResponse {
  code: number;
  message?: string;
  data?: {
    file_token?: string;
  };
}

interface TripoTaskResponse {
  code: number;
  message?: string;
  data?: {
    task_id?: string;
  };
}

interface TripoTaskData {
  task_id?: string;
  status?: string;
  output?: {
    model_url?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Faz upload de uma imagem para o Tripo V3.
 */
export async function uploadImage(
  file: Express.Multer.File,
): Promise<string> {
  const apiKey = getApiKey();

  if (!file?.buffer) {
    throw new Error('Arquivo de imagem inválido.');
  }

  console.log('');
  console.log('====================================');
  console.log('UPLOAD PARA O TRIPO V3');
  console.log('====================================');
  console.log(`Arquivo: ${file.originalname}`);
  console.log(`Tipo: ${file.mimetype}`);
  console.log(`Tamanho: ${file.size} bytes`);

  const formData = new FormData();

  const blob = new Blob(
    [new Uint8Array(file.buffer)],
    { type: file.mimetype },
  );

  formData.append('file', blob, file.originalname);

  const response = await fetch(`${TRIPO_API_URL}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  const text = await response.text();

  console.log(`Tripo upload → HTTP ${response.status}`);

  if (!response.ok) {
    throw new Error(
      `Tripo recusou o upload (${response.status}): ${text}`,
    );
  }

  let data: TripoUploadResponse;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `Resposta inválida do Tripo durante o upload: ${text}`,
    );
  }

  if (data.code !== 0) {
    throw new Error(
      `Tripo retornou erro no upload. Código ${data.code}: ${
        data.message ?? text
      }`,
    );
  }

  const fileToken = data.data?.file_token;

  if (!fileToken) {
    throw new Error(`Tripo não retornou file_token: ${text}`);
  }

  console.log(`Upload concluído: ${fileToken}`);

  return fileToken;
}

/**
 * Cria uma tarefa Multiview → 3D.
 */
export async function createMultiviewTask(
  imageTokens: {
    front: string;
    left: string;
    back: string;
    right: string;
  },
): Promise<string> {
  const apiKey = getApiKey();

  console.log('');
  console.log('====================================');
  console.log('CRIANDO AVATAR 3D');
  console.log('====================================');

  const body = {
    inputs: [
      { front: imageTokens.front },
      { left: imageTokens.left },
      { back: imageTokens.back },
      { right: imageTokens.right },
    ],
    model: 'v3.1-20260211',
    texture: true,
    pbr: true,
    texture_quality: 'standard',
    geometry_quality: 'standard',
    export_uv: true,
  };

  const response = await fetch(
    `${TRIPO_API_URL}/generation/multiview-to-model`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );

  const text = await response.text();

  console.log(`Tripo geração → HTTP ${response.status}`);

  if (!response.ok) {
    throw new Error(
      `Tripo recusou a criação do avatar (${response.status}): ${text}`,
    );
  }

  let data: TripoTaskResponse;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `Resposta inválida do Tripo ao criar avatar: ${text}`,
    );
  }

  if (data.code !== 0) {
    throw new Error(
      `Tripo retornou erro ao criar avatar. Código ${data.code}: ${
        data.message ?? text
      }`,
    );
  }

  const taskId = data.data?.task_id;

  if (!taskId) {
    throw new Error(`Tripo não retornou task_id: ${text}`);
  }

  console.log('');
  console.log('TAREFA CRIADA COM SUCESSO!');
  console.log(`Task ID: ${taskId}`);

  return taskId;
}

/**
 * Consulta o status e os dados atualizados de uma tarefa.
 */
export async function getTask(
  taskId: string,
): Promise<TripoTaskData> {
  const apiKey = getApiKey();

  if (!taskId?.trim()) {
    throw new Error('Task ID não informado.');
  }

  console.log('');
  console.log(`Consultando tarefa: ${taskId}`);

  const response = await fetch(
    `${TRIPO_API_URL}/tasks/${encodeURIComponent(taskId)}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    },
  );

  const text = await response.text();

  console.log(`Consulta Tripo → HTTP ${response.status}`);

  if (!response.ok) {
    throw new Error(
      `Erro ao consultar tarefa no Tripo (${response.status}): ${text}`,
    );
  }

  let data: {
    code: number;
    message?: string;
    data?: TripoTaskData;
  };

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Resposta inválida do Tripo: ${text}`);
  }

  if (data.code !== 0) {
    throw new Error(
      `Tripo retornou erro na consulta. Código ${data.code}: ${
        data.message ?? text
      }`,
    );
  }

  if (!data.data) {
    throw new Error('Tripo não retornou os dados da tarefa.');
  }

  return data.data;
}

/**
 * Extrai a URL do modelo retornada pela tarefa.
 */
function getModelUrl(task: TripoTaskData): string {
  const modelUrl = task.output?.model_url;

  if (!modelUrl) {
    throw new Error(
      `A tarefa ${task.task_id ?? ''} ainda não possui model_url. Status: ${
        task.status ?? 'desconhecido'
      }`,
    );
  }

  return modelUrl;
}

/**
 * Valida os hosts utilizados pelo Tripo para disponibilizar modelos.
 */
function validateModelUrl(modelUrl: string): URL {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(modelUrl);
  } catch {
    throw new Error('URL do modelo 3D inválida.');
  }

  const hostname = parsedUrl.hostname.toLowerCase();

  const isTripoHost =
    hostname === 'tripo3d.com' ||
    hostname.endsWith('.tripo3d.com');

  const isAmazonHost =
    hostname.endsWith('.amazonaws.com');

  if (
    parsedUrl.protocol !== 'https:' ||
    (!isTripoHost && !isAmazonHost) ||
    parsedUrl.username ||
    parsedUrl.password
  ) {
    throw new Error(
      `Host não permitido para download do modelo: ${hostname}`,
    );
  }

  return parsedUrl;
}

/**
 * Baixa o modelo 3D diretamente do Tripo pelo backend.
 */
export async function downloadModel(
  modelUrl: string,
): Promise<Buffer> {
  if (!modelUrl?.trim()) {
    throw new Error('URL do modelo 3D não informada.');
  }

  const parsedUrl = validateModelUrl(modelUrl);

  console.log('');
  console.log('====================================');
  console.log('BAIXANDO MODELO 3D DO TRIPO');
  console.log('====================================');
  console.log(`Host: ${parsedUrl.hostname}`);

  try {
    const response = await fetch(parsedUrl.toString(), {
      redirect: 'error',
    });

    console.log(
      `Download do modelo → HTTP ${response.status} ${response.statusText}`,
    );

    if (!response.ok) {
      const text = await response.text();

      if (response.status === 403) {
        throw new Error(
          'A URL assinada do Tripo expirou ou foi recusada (403). ' +
          'É necessário consultar novamente a tarefa pelo task_id.',
        );
      }

      throw new Error(
        `Tripo recusou o download do modelo (${response.status} ${response.statusText}): ${
          text.slice(0, 500)
        }`,
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length === 0) {
      throw new Error('O Tripo retornou um modelo vazio.');
    }

    console.log('Modelo baixado com sucesso!');
    console.log(
      `Tamanho: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`,
    );

    return buffer;
  } catch (error) {
    console.error('');
    console.error('ERRO AO BAIXAR MODELO DO TRIPO');

    if (error instanceof Error) {
      console.error('Mensagem:', error.message);
    } else {
      console.error(error);
    }

    throw error;
  }
}

/**
 * Consulta novamente a tarefa e baixa o modelo usando
 * a URL atualizada fornecida pelo Tripo.
 */
export async function downloadModelByTaskId(
  taskId: string,
): Promise<Buffer> {
  console.log('');
  console.log('====================================');
  console.log('RECUPERANDO MODELO PELO TASK ID');
  console.log('====================================');

  const task = await getTask(taskId);

  if (task.status !== 'success') {
    throw new Error(
      `O modelo ainda não está disponível. Status da tarefa: ${
        task.status ?? 'desconhecido'
      }`,
    );
  }

  const freshModelUrl = getModelUrl(task);

  console.log('URL atualizada do modelo recuperada.');

  return downloadModel(freshModelUrl);
}
