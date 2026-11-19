
/**
 * storeIntegration.routes.ts
 *
 * Rotas HTTP para integração de lojas parceiras com CAIMENT.
 *
 * Endpoints:
 *
 * POST /products
 * POST /catalog
 *
 * Responsabilidades:
 * - Receber produtos individuais enviados pelas lojas.
 * - Receber catálogos completos.
 * - Identificar a loja de origem.
 * - Validar e normalizar os dados recebidos.
 * - Encaminhar os dados para StoreIntegration.
 * - Retornar os dados padronizados.
 *
 * Este módulo não gera geometria nem executa simulações.
 */

import {
  Router,
  type Request,
  type Response,
} from 'express';

import {
  receiveStoreProduct,
  receiveStoreCatalog,
  StoreIntegrationError,
} from './StoreIntegration.js';

// ============================================================
// ROUTER
// ============================================================

const router = Router();

// ============================================================
// LOJA DEMONSTRATIVA
// ============================================================

/**
 * Identificação temporária da loja demonstrativa.
 *
 * Nesta primeira integração, utilizamos a FitSense.
 *
 * Em produção, essa identificação deverá vir de uma
 * autenticação própria para cada loja parceira.
 */
const DEMONSTRATION_STORE = {
  id: 'fitsense',
  name: 'FitSense',
};

// ============================================================
// VALIDAÇÃO DO CORPO DA REQUISIÇÃO
// ============================================================

/**
 * Verifica se o corpo recebido é um objeto válido.
 *
 * Arrays e valores nulos não são aceitos como payload raiz.
 */
function isValidRequestBody(
  body: unknown,
): body is Record<string, unknown> {
  return (
    typeof body === 'object' &&
    body !== null &&
    !Array.isArray(body)
  );
}

// ============================================================
// TRATAMENTO DE ERROS
// ============================================================

/**
 * Centraliza o tratamento dos erros das rotas.
 */
function handleIntegrationError(
  error: unknown,
  res: Response,
  operation: string,
): Response {
  if (error instanceof StoreIntegrationError) {
    return res.status(400).json({
      success: false,
      error: error.message,
    });
  }

  console.error(
    `[CAIMENT] Erro na integração ${operation}:`,
    error,
  );

  return res.status(500).json({
    success: false,
    error:
      error instanceof Error
        ? error.message
        : String(error),
  });
}

// ============================================================
// POST /products
// ============================================================

/**
 * Recebe um produto individual enviado por uma loja.
 *
 * Endpoint completo:
 *
 * POST /api/integration/products
 *
 * Payload esperado:
 *
 * {
 *   id,
 *   sku,
 *   name,
 *   category,
 *   categoryLabel,
 *   price,
 *   image,
 *   size,
 *   color,
 *   measurements,
 *   sizes,
 *   measurementUnit,
 *   material,
 *   model,
 *   measurementConvention,
 *   catalogVersion
 * }
 *
 * A rota mantém:
 * - Medidas do tamanho selecionado.
 * - Medidas de todos os tamanhos disponíveis.
 * - Perfil geométrico da peça.
 * - Informações do tecido.
 * - Informações da loja.
 */
router.post(
  '/products',
  (
    req: Request,
    res: Response,
  ): Response => {
    try {
      if (!isValidRequestBody(req.body)) {
        return res.status(400).json({
          success: false,
          error:
            'O corpo da requisição está vazio ou inválido.',
        });
      }

      const integratedProduct = receiveStoreProduct(
        req.body,
        DEMONSTRATION_STORE,
      );

      console.log(
        `[CAIMENT] Produto recebido da loja ${DEMONSTRATION_STORE.name}:`,
        integratedProduct.product.id,
      );

      console.log(
        '[CAIMENT] Categoria:',
        integratedProduct.product.category,
      );

      console.log(
        '[CAIMENT] Tamanho selecionado:',
        integratedProduct.selection.size,
      );

      console.log(
        '[CAIMENT] Quantidade de tamanhos recebidos:',
        integratedProduct.sizes.length,
      );

      return res.status(201).json({
        success: true,

        message:
          'Produto recebido e integrado com sucesso.',

        data: integratedProduct,
      });
    } catch (error: unknown) {
      return handleIntegrationError(
        error,
        res,
        'de produto',
      );
    }
  },
);

// ============================================================
// POST /catalog
// ============================================================

/**
 * Recebe um catálogo completo enviado por uma loja.
 *
 * Endpoint completo:
 *
 * POST /api/integration/catalog
 *
 * Payload esperado:
 *
 * {
 *   catalogVersion: "1.2.0",
 *   notice: "...",
 *   products: [...]
 * }
 *
 * A rota preserva:
 * - Todos os produtos.
 * - Todos os tamanhos.
 * - Todas as medidas de cada tamanho.
 * - Categorias e perfis geométricos.
 * - Imagens e cores.
 * - Propriedades dos materiais.
 * - Informações de modelagem.
 */
router.post(
  '/catalog',
  (
    req: Request,
    res: Response,
  ): Response => {
    try {
      if (!isValidRequestBody(req.body)) {
        return res.status(400).json({
          success: false,
          error:
            'O corpo da requisição do catálogo está vazio ou inválido.',
        });
      }

      const integratedCatalog = receiveStoreCatalog(
        req.body,
        DEMONSTRATION_STORE,
      );

      console.log(
        `[CAIMENT] Catálogo recebido da loja ${DEMONSTRATION_STORE.name}.`,
      );

      console.log(
        '[CAIMENT] Versão do catálogo:',
        integratedCatalog.catalogVersion,
      );

      console.log(
        '[CAIMENT] Quantidade de produtos:',
        integratedCatalog.products.length,
      );

      return res.status(201).json({
        success: true,

        message:
          'Catálogo recebido e integrado com sucesso.',

        data: integratedCatalog,
      });
    } catch (error: unknown) {
      return handleIntegrationError(
        error,
        res,
        'de catálogo',
      );
    }
  },
);

// ============================================================
// EXPORTAÇÃO
// ============================================================

export default router;
