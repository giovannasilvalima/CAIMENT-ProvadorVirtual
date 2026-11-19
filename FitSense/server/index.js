import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const catalogPath = path.join(__dirname, 'data', 'products.json');
const PORT = Number(process.env.API_PORT || 3001);

async function readCatalog() {
  const raw = await readFile(catalogPath, 'utf8');
  return JSON.parse(raw);
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(payload));
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return sendJson(res, 204, {});
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Método não permitido.' });

  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const catalog = await readCatalog();
    const parts = url.pathname.split('/').filter(Boolean);

    if (url.pathname === '/api/health') {
      return sendJson(res, 200, { status: 'ok', service: 'FitSense API' });
    }
    if (url.pathname === '/api/products') {
      return sendJson(res, 200, {
        catalogVersion: catalog.catalogVersion,
        notice: catalog.notice,
        total: catalog.products.length,
        products: catalog.products,
      });
    }
    if (parts[0] === 'api' && parts[1] === 'products' && parts[2]) {
      const product = catalog.products.find((item) => item.id === parts[2]);
      if (!product) return sendJson(res, 404, { error: 'Produto não encontrado.' });
      if (parts[3] === 'sizes') {
        return sendJson(res, 200, { productId: product.id, sizes: product.sizes });
      }
      if (parts.length === 3) return sendJson(res, 200, product);
    }
    return sendJson(res, 404, { error: 'Rota não encontrada.' });
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, { error: 'Não foi possível consultar o catálogo.' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`FitSense API disponível em http://localhost:${PORT}`);
});
