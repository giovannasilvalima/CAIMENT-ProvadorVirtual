
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import {
  ArrowLeft,
  ArrowRight,
  Check,
  Ruler,
  ShoppingBag,
  Sparkles,
} from 'lucide-react';

import productCatalogRaw from '../../../server/data/products.json';

// ============================================================
// CATÁLOGO FITSENSE
// ============================================================

type CatalogMeasurementType =
  | 'circumference'
  | 'linear'
  | 'length';

type CatalogMeasurement = {
  value: number;
  unit: 'cm';
  type: CatalogMeasurementType;
  landmark?: string;
};

type CatalogSize = {
  size: string;
  measurements: Record<string, CatalogMeasurement>;
};

type CatalogProduct = {
  id: string;
  sku: string;
  name: string;
  category: string;
  categoryLabel: string;
  price: number;
  description: string;

  // Opcional: o catálogo não precisa ser alterado.
  clothingModel?: string;

  images: {
    front: string;
    back: string;
  };

  colors: {
    name: string;
    hex: string;
  }[];

  material: {
    composition: string;
    elasticity: string;
    elasticityLabel: string;
  };

  model: {
    fit: string;
    geometryProfile: string;
    sleeves?: boolean;
    neckline?: string;
    waist?: string;
  };

  measurementConvention: string;
  sizes: CatalogSize[];
  slug: string;
};

type ProductCatalog = {
  catalogVersion: string;
  notice: string;
  products: CatalogProduct[];
};

const catalog = productCatalogRaw as ProductCatalog;

// ============================================================
// MODELOS 3D — MAPEAMENTO SEPARADO DO CATÁLOGO
// ============================================================

// Cadastre aqui o caminho público de cada arquivo GLB.
// A chave deve ser o ID do produto existente no products.json.
//
// Exemplo:
// '1': '/models/clothes/camiseta-essential.glb'

const CLOTHING_MODELS_BY_PRODUCT_ID: Record<string, string> = {
  '1': '/models/clothes/camiseta-essential.glb',

  // Adicione os demais produtos usando seus IDs e caminhos reais:
  // '2': '/models/clothes/arquivo-real-short.glb',
  // '3': '/models/clothes/arquivo-real-vestido.glb',
  // '4': '/models/clothes/arquivo-real-calca.glb',
};

function getClothingModel(product: CatalogProduct): string {
  const clothingModel =
    product.clothingModel?.trim() ||
    CLOTHING_MODELS_BY_PRODUCT_ID[String(product.id)]?.trim();

  if (!clothingModel) {
    throw new Error(
      `O produto "${product.name}" (ID ${product.id}) ainda não possui um arquivo GLB cadastrado. Configure o caminho em CLOTHING_MODELS_BY_PRODUCT_ID.`,
    );
  }

  return clothingModel;
}

// ============================================================
// CONTRATO DE INTEGRAÇÃO COM O CAIMENT
// ============================================================

type CaimentGarmentType =
  | 'tshirt'
  | 'short'
  | 'dress'
  | 'pants';

type CaimentProductPayload = {
  id: string;
  sku: string;
  name: string;
  category: CaimentGarmentType;
  categoryLabel: string;
  price: number;
  image: string;

  // Obrigatório no payload enviado ao CAIMENT.
  clothingModel: string;

  size: string;
  color: string;

  measurements: Record<string, CatalogMeasurement>;

  sizes: {
    size: string;
    measurements: Record<string, CatalogMeasurement>;
  }[];

  measurementUnit: 'cm';
  material: CatalogProduct['material'];
  model: CatalogProduct['model'];
  measurementConvention: string;
  catalogVersion: string;
};

// ============================================================
// TIPOS DA PÁGINA
// ============================================================

type Product = {
  id: number;
  name: string;
  category: string;
  categoryLabel: string;
  price: number;
  image: string;
  description: string;
  sizes: string[];

  colors: {
    name: string;
    value: string;
  }[];

  details: string[];
  catalogProduct: CatalogProduct;
};

// ============================================================
// TIPOS DO CARRINHO
// ============================================================

type CartItem = {
  id: number;
  name: string;
  category: string;
  price: number;
  image: string;
  size: string;
  color: string;
  quantity: number;
};

// ============================================================
// CONVERSÃO DO CATÁLOGO
// ============================================================

function getGarmentCategory(
  product: CatalogProduct,
): CaimentGarmentType {
  switch (product.model.geometryProfile) {
    case 'tshirt-basic':
    case 'tank-top':
      return 'tshirt';

    case 'pants-wide-leg':
      return 'pants';

    case 'dress-a-line':
      return 'dress';

    case 'shorts-basic':
      return 'short';

    default:
      throw new Error(
        `Perfil de geometria não reconhecido: ${product.model.geometryProfile}.`,
      );
  }
}

// ============================================================
// VALIDAÇÃO DO CAMINHO DO MODELO 3D
// ============================================================

function validateClothingModelPath(
  clothingModel: unknown,
  productName: string,
): asserts clothingModel is string {
  if (
    typeof clothingModel !== 'string' ||
    clothingModel.trim().length === 0
  ) {
    throw new Error(
      `O produto "${productName}" não possui um caminho de modelo 3D cadastrado.`,
    );
  }

  const isLocalPath =
    clothingModel.startsWith('/models/');

  const isExternalUrl =
    /^https?:\/\/.+/i.test(clothingModel);

  if (!isLocalPath && !isExternalUrl) {
    throw new Error(
      `O caminho do modelo 3D de "${productName}" é inválido: ${clothingModel}. Informe um caminho público em /models/ ou uma URL HTTP/HTTPS.`,
    );
  }

  if (/\s/.test(clothingModel)) {
    throw new Error(
      `O caminho do modelo 3D de "${productName}" contém espaços.`,
    );
  }
}

// ============================================================
// VALIDAÇÃO DA ESTRUTURA DO CATÁLOGO
// ============================================================

function validateCatalogStructure() {
  if (
    !catalog ||
    typeof catalog !== 'object' ||
    !Array.isArray(catalog.products)
  ) {
    throw new Error(
      'O catálogo FitSense não possui uma estrutura válida.',
    );
  }

  if (!catalog.catalogVersion) {
    throw new Error(
      'A versão do catálogo FitSense não foi informada.',
    );
  }

  for (const item of catalog.products) {
    if (!Number.isFinite(Number(item.id))) {
      throw new Error(
        `O produto "${item.name}" possui um ID inválido.`,
      );
    }

    if (!item.model?.geometryProfile) {
      throw new Error(
        `O produto "${item.name}" não possui geometryProfile.`,
      );
    }

    getGarmentCategory(item);

    if (!Array.isArray(item.sizes) || item.sizes.length === 0) {
      throw new Error(
        `O produto "${item.name}" não possui tamanhos cadastrados.`,
      );
    }
  }
}

validateCatalogStructure();

const products: Product[] = catalog.products.map((item) => ({
  id: Number(item.id),
  name: item.name,
  category: item.categoryLabel,
  categoryLabel: item.categoryLabel,
  price: item.price,
  image: item.images.front,
  description: item.description,

  sizes: item.sizes.map((size) => size.size),

  colors: item.colors.map((color) => ({
    name: color.name,
    value: color.hex,
  })),

  details: [
    `Modelagem: ${item.model.fit}`,
    `Composição: ${item.material.composition}`,
    `Elasticidade: ${item.material.elasticityLabel}`,
    'Medidas técnicas cadastradas no catálogo FitSense',
  ],

  catalogProduct: item,
}));

// ============================================================
// FUNÇÕES AUXILIARES
// ============================================================

function formatPrice(price: number) {
  return price.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function getCart(): CartItem[] {
  try {
    const storedCart = localStorage.getItem('fitsense_cart');

    if (!storedCart) {
      return [];
    }

    const parsedCart = JSON.parse(storedCart);

    if (!Array.isArray(parsedCart)) {
      return [];
    }

    return parsedCart.filter(
      (item): item is CartItem =>
        item !== null &&
        typeof item === 'object' &&
        Number.isFinite(item.id) &&
        typeof item.name === 'string' &&
        Number.isFinite(item.price) &&
        typeof item.size === 'string' &&
        typeof item.color === 'string' &&
        Number.isFinite(item.quantity) &&
        item.quantity > 0,
    );
  } catch (error) {
    console.error('Erro ao recuperar o carrinho:', error);
    return [];
  }
}

function saveCart(cart: CartItem[]) {
  localStorage.setItem('fitsense_cart', JSON.stringify(cart));

  window.dispatchEvent(
    new Event('fitsense-cart-updated'),
  );
}

// ============================================================
// VALIDAÇÃO DAS MEDIDAS DO CATÁLOGO
// ============================================================

function getSelectedMeasurements(
  product: CatalogProduct,
  selectedSize: string,
): Record<string, CatalogMeasurement> | null {
  const sizeData = product.sizes.find(
    (item) => item.size === selectedSize,
  );

  if (!sizeData) {
    return null;
  }

  const measurements: Record<string, CatalogMeasurement> = {};

  const relativePositionFields = new Set([
    'strapPositionFront',
    'strapPositionBack',
  ]);

  for (const [key, measurement] of Object.entries(
    sizeData.measurements,
  )) {
    if (
      !measurement ||
      typeof measurement !== 'object' ||
      !Number.isFinite(measurement.value)
    ) {
      throw new Error(
        `Medida inválida no catálogo: ${key}, tamanho ${selectedSize}.`,
      );
    }

    const allowsZeroOrNegative =
      relativePositionFields.has(key);

    if (
      !allowsZeroOrNegative &&
      measurement.value <= 0
    ) {
      throw new Error(
        `Valor inválido na medida ${key}, tamanho ${selectedSize}.`,
      );
    }

    if (measurement.unit !== 'cm') {
      throw new Error(
        `Unidade não suportada na medida ${key}, tamanho ${selectedSize}: ${measurement.unit}.`,
      );
    }

    if (
      measurement.type !== 'circumference' &&
      measurement.type !== 'linear' &&
      measurement.type !== 'length'
    ) {
      throw new Error(
        `Tipo inválido na medida ${key}, tamanho ${selectedSize}. Use circumference, linear ou length.`,
      );
    }

    if (
      measurement.landmark !== undefined &&
      typeof measurement.landmark !== 'string'
    ) {
      throw new Error(
        `Referência anatômica inválida na medida ${key}, tamanho ${selectedSize}.`,
      );
    }

    measurements[key] = {
      value: measurement.value,
      unit: measurement.unit,
      type: measurement.type,
      ...(measurement.landmark
        ? { landmark: measurement.landmark }
        : {}),
    };
  }

  if (Object.keys(measurements).length === 0) {
    return null;
  }

  return measurements;
}

// ============================================================
// MEDIDAS DE TODOS OS TAMANHOS
// ============================================================

function getAllProductSizes(
  product: CatalogProduct,
): CaimentProductPayload['sizes'] {
  if (!Array.isArray(product.sizes) || product.sizes.length === 0) {
    throw new Error(
      'O catálogo não possui tamanhos cadastrados para este produto.',
    );
  }

  return product.sizes.map((item) => {
    const measurements = getSelectedMeasurements(
      product,
      item.size,
    );

    if (!measurements) {
      throw new Error(
        `Não existem medidas válidas para o tamanho ${item.size}.`,
      );
    }

    return {
      size: item.size,
      measurements,
    };
  });
}

// ============================================================
// TAMANHO DE REFERÊNCIA
// ============================================================

function getReferenceSize(product: Product): string {
  if (product.sizes.length === 0) {
    throw new Error(
      'O produto não possui tamanhos disponíveis.',
    );
  }

  return product.sizes[
    Math.floor((product.sizes.length - 1) / 2)
  ];
}

// ============================================================
// SERIALIZAÇÃO DO PRODUTO
// ============================================================

function encodeProductPayload(
  product: CaimentProductPayload,
): string {
  return encodeURIComponent(JSON.stringify(product));
}

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================

export default function FitsenseProductPage() {
  const { id } = useParams();

  const [selectedSize, setSelectedSize] =
    useState<string | null>(null);

  const [selectedColor, setSelectedColor] = useState(0);
  const [imageLoaded, setImageLoaded] = useState(false);

  const [isSendingToCaiment, setIsSendingToCaiment] =
    useState(false);

  const [isAddingToCart, setIsAddingToCart] =
    useState(false);

  const [cartCount, setCartCount] = useState(0);

  // ==========================================================
  // CONTADOR DO CARRINHO
  // ==========================================================

  useEffect(() => {
    function updateCartCount() {
      const cart = getCart();

      setCartCount(
        cart.reduce(
          (total, item) => total + item.quantity,
          0,
        ),
      );
    }

    updateCartCount();

    window.addEventListener('storage', updateCartCount);
    window.addEventListener('focus', updateCartCount);
    window.addEventListener(
      'fitsense-cart-updated',
      updateCartCount,
    );

    return () => {
      window.removeEventListener('storage', updateCartCount);
      window.removeEventListener('focus', updateCartCount);
      window.removeEventListener(
        'fitsense-cart-updated',
        updateCartCount,
      );
    };
  }, []);

  // ==========================================================
  // LOCALIZAR PRODUTO
  // ==========================================================

  const productId = Number(id);

  const foundProduct = products.find(
    (item) => item.id === productId,
  );

  if (!foundProduct) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8F7F4]">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">
            Produto não encontrado
          </h1>

          <Link
            to="/fitsense/produtos"
            className="mt-4 inline-block text-sm underline"
          >
            Voltar para produtos
          </Link>
        </div>
      </div>
    );
  }

  const product: Product = foundProduct;

  const selectedProductColor =
    product.colors[selectedColor];

  // ==========================================================
  // PREPARAR DADOS DO PRODUTO
  // ==========================================================

  function prepareSelectedProduct():
    | CaimentProductPayload
    | null {
    if (!selectedProductColor) {
      alert('Selecione uma cor válida para o produto.');
      return null;
    }

    try {
      const category = getGarmentCategory(
        product.catalogProduct,
      );

      // Obtém o GLB pelo mapeamento separado do catálogo.
      const clothingModel = getClothingModel(
        product.catalogProduct,
      );

      validateClothingModelPath(
        clothingModel,
        product.name,
      );

      const referenceSize =
        selectedSize ?? getReferenceSize(product);

      const measurements = getSelectedMeasurements(
        product.catalogProduct,
        referenceSize,
      );

      if (!measurements) {
        throw new Error(
          `Não foi possível localizar as medidas do tamanho ${referenceSize}.`,
        );
      }

      const sizes = getAllProductSizes(
        product.catalogProduct,
      );

      const selectedProduct: CaimentProductPayload = {
        id: String(product.catalogProduct.id),
        sku: product.catalogProduct.sku,
        name: product.name,
        category,
        categoryLabel: product.categoryLabel,
        price: product.price,
        image: product.image,

        clothingModel,

        size: referenceSize,
        color: selectedProductColor.name,

        measurements,
        sizes,

        measurementUnit: 'cm',
        material: product.catalogProduct.material,
        model: product.catalogProduct.model,
        measurementConvention:
          product.catalogProduct.measurementConvention,
        catalogVersion: catalog.catalogVersion,
      };

      console.log(
        '[FITSENSE] Arquivo 3D enviado:',
        selectedProduct.clothingModel,
      );

      return selectedProduct;
    } catch (error) {
      console.error(
        'Erro ao preparar os dados do produto:',
        error,
      );

      alert(
        error instanceof Error
          ? error.message
          : 'Não foi possível preparar os dados da peça.',
      );

      return null;
    }
  }

  // ==========================================================
  // ADICIONAR AO CARRINHO
  // ==========================================================

  function handleAddToCart() {
    if (isAddingToCart) {
      return;
    }

    if (!selectedSize) {
      alert(
        'Selecione um tamanho antes de adicionar ao carrinho.',
      );
      return;
    }

    if (!selectedProductColor) {
      alert('Selecione uma cor válida para o produto.');
      return;
    }

    setIsAddingToCart(true);

    try {
      const cart = getCart();

      const existingItem = cart.find(
        (item) =>
          item.id === product.id &&
          item.size === selectedSize &&
          item.color === selectedProductColor.name,
      );

      if (existingItem) {
        existingItem.quantity += 1;
      } else {
        cart.push({
          id: product.id,
          name: product.name,
          category: product.category,
          price: product.price,
          image: product.image,
          size: selectedSize,
          color: selectedProductColor.name,
          quantity: 1,
        });
      }

      saveCart(cart);

      setCartCount(
        cart.reduce(
          (total, item) => total + item.quantity,
          0,
        ),
      );

      alert('Produto adicionado ao carrinho!');
    } catch (error) {
      console.error(
        'Erro ao adicionar produto ao carrinho:',
        error,
      );

      alert(
        'Não foi possível adicionar o produto ao carrinho.',
      );
    } finally {
      setIsAddingToCart(false);
    }
  }

  // ==========================================================
  // EXPERIMENTAR NO CAIMENT
  // ==========================================================

  async function handleTryOn() {
    if (isSendingToCaiment) {
      return;
    }

    const selectedProduct = prepareSelectedProduct();

    if (!selectedProduct) {
      return;
    }

    setIsSendingToCaiment(true);

    try {
      const apiUrl = (
        import.meta.env.VITE_CAIMENT_API_URL ||
        'http://localhost:3001'
      ).replace(/\/$/, '');

      const response = await fetch(
        `${apiUrl}/api/integration/products`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(selectedProduct),
        },
      );

      const responseData = await response
        .json()
        .catch(() => null);

      if (!response.ok) {
        throw new Error(
          responseData?.error ||
            responseData?.message ||
            `Erro ao enviar produto. Status: ${response.status}`,
        );
      }

      if (responseData?.success !== true) {
        throw new Error(
          responseData?.message ||
            'O backend não confirmou o recebimento do produto.',
        );
      }

      console.log(
        'Produto recebido pelo backend do CAIMENT:',
        responseData.data,
      );

      console.log(
        '[FITSENSE] Arquivo 3D:',
        selectedProduct.clothingModel,
      );

      console.log(
        '[FITSENSE] Medidas do tamanho de referência:',
        selectedProduct.measurements,
      );

      console.log(
        '[FITSENSE] Medidas de todos os tamanhos:',
        selectedProduct.sizes,
      );

      const productPayload =
        encodeProductPayload(selectedProduct);

      const caimentUrl = (
        import.meta.env.VITE_CAIMENT_URL ||
        'http://localhost:5173'
      ).replace(/\/$/, '');

      window.location.href =
        `${caimentUrl}/login?fitsense_product=${productPayload}`;
    } catch (error) {
      console.error(
        'Erro ao integrar produto com o CAIMENT:',
        error,
      );

      alert(
        error instanceof Error
          ? error.message
          : 'Não foi possível conectar ao CAIMENT. Verifique se o backend está funcionando.',
      );

      setIsSendingToCaiment(false);
    }
  }

  // ==========================================================
  // INTERFACE
  // ==========================================================

  return (
    <div className="min-h-screen bg-[#F8F7F4] text-[#171717]">

      {/* HEADER */}

      <header className="sticky top-0 z-50 border-b border-black/5 bg-[#F8F7F4]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8">

          <Link
            to="/fitsense"
            className="text-2xl font-semibold tracking-[-0.04em]"
          >
            FITSENSE
          </Link>

          <nav className="hidden items-center gap-8 md:flex">
            <Link
              to="/fitsense"
              className="text-sm font-medium transition hover:opacity-50"
            >
              Início
            </Link>

            <Link
              to="/fitsense/produtos"
              className="text-sm font-medium transition hover:opacity-50"
            >
              Produtos
            </Link>
          </nav>

          <div className="flex items-center gap-3">

            <Link
              to="/fitsense/carrinho"
              aria-label={`Carrinho com ${cartCount} itens`}
              className="relative flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-black/5"
            >
              <ShoppingBag size={20} />

              {cartCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#6E42D1] px-1 text-[10px] font-semibold text-white">
                  {cartCount > 99 ? '99+' : cartCount}
                </span>
              )}
            </Link>

            <a
              href={`${
                import.meta.env.VITE_CAIMENT_URL ||
                'http://localhost:5173'
              }/login`}
              aria-label="Acessar minha conta"
              title="Minha conta"
              className="flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-black/5"
            >
              <UserIcon />
            </a>

          </div>
        </div>
      </header>

      {/* CONTEÚDO */}

      <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-12">

        <Link
          to="/fitsense/produtos"
          className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-black/55 transition hover:text-black"
        >
          <ArrowLeft size={16} />
          Voltar para produtos
        </Link>

        <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">

          {/* IMAGEM DO PRODUTO */}

          <div>
            <div className="relative aspect-[4/5] overflow-hidden rounded-[2rem] bg-[#ECEAE5]">

              {!imageLoaded && (
                <div className="absolute inset-0 animate-pulse bg-[#E5E2DC]" />
              )}

              <img
                src={product.image}
                alt={product.name}
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageLoaded(true)}
                className={`h-full w-full object-cover transition duration-700 ${
                  imageLoaded
                    ? 'opacity-100'
                    : 'opacity-0'
                }`}
              />

            </div>
          </div>

          {/* INFORMAÇÕES DO PRODUTO */}

          <div className="flex flex-col">

            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-black/40">
              {product.category}
            </p>

            <h1 className="mt-3 text-4xl font-medium tracking-[-0.05em] sm:text-5xl">
              {product.name}
            </h1>

            <p className="mt-5 text-xl font-semibold">
              {formatPrice(product.price)}
            </p>

            <div className="my-7 h-px bg-black/10" />

            <p className="text-sm leading-7 text-black/60 sm:text-base">
              {product.description}
            </p>

            {/* COR */}

            <div className="mt-8">

              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">
                  Cor
                </p>

                <p className="text-sm text-black/45">
                  {selectedProductColor?.name ?? 'Selecione uma cor'}
                </p>
              </div>

              <div className="mt-4 flex gap-3">
                {product.colors.map((color, index) => (
                  <button
                    type="button"
                    key={color.name}
                    onClick={() => setSelectedColor(index)}
                    aria-label={`Selecionar cor ${color.name}`}
                    aria-pressed={selectedColor === index}
                    className={`relative flex h-10 w-10 items-center justify-center rounded-full border ${
                      selectedColor === index
                        ? 'border-black'
                        : 'border-black/10'
                    }`}
                  >
                    <span
                      className="h-7 w-7 rounded-full border border-black/10"
                      style={{
                        backgroundColor: color.value,
                      }}
                    />

                    {selectedColor === index && (
                      <span className="absolute inset-[-4px] rounded-full border border-black" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* TAMANHO */}

            <div className="mt-8">

              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">
                  Tamanho de referência
                </p>

                <button
                  type="button"
                  onClick={() => {
                    alert(
                      'Consulte as medidas disponíveis na descrição técnica do produto.',
                    );
                  }}
                  className="flex items-center gap-1.5 text-xs font-medium text-black/50 transition hover:text-black"
                >
                  <Ruler size={14} />
                  Guia de tamanhos
                </button>
              </div>

              <p className="mt-1 text-xs leading-5 text-black/45">
                Opcional para experimentar no CAIMENT. Para comprar,
                selecione um tamanho. A recomendação será calculada
                pelo CAIMENT com as medidas de todos os tamanhos.
              </p>

              <div className="mt-4 grid grid-cols-5 gap-2">
                {product.sizes.map((size) => {
                  const selected = selectedSize === size;

                  return (
                    <button
                      type="button"
                      key={size}
                      onClick={() =>
                        setSelectedSize(
                          selected ? null : size,
                        )
                      }
                      aria-pressed={selected}
                      className={`flex h-12 items-center justify-center rounded-xl border text-sm font-medium transition ${
                        selected
                          ? 'border-[#5A2FB8] bg-[#5A2FB8] text-white'
                          : 'border-black/10 bg-white hover:border-black/30'
                      }`}
                    >
                      {size}
                    </button>
                  );
                })}
              </div>

              {!selectedSize && (
                <p className="mt-2 text-xs text-black/45">
                  Nenhum tamanho selecionado. Será utilizado um tamanho
                  intermediário somente como referência para a geometria.
                </p>
              )}

            </div>

            {/* BOTÕES DE AÇÃO */}

            <div className="mt-8 flex flex-col gap-3">

              <button
                type="button"
                onClick={handleTryOn}
                disabled={isSendingToCaiment}
                className="group relative flex min-h-[62px] items-center justify-center gap-3 overflow-hidden rounded-2xl bg-gradient-to-r from-[#472494] via-[#6E42D1] to-[#8862DD] px-6 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(90,47,184,0.25)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_35px_rgba(90,47,184,0.35)] disabled:cursor-wait disabled:opacity-60"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15">
                  <Sparkles size={18} />
                </span>

                <span>
                  {isSendingToCaiment
                    ? 'Conectando ao CAIMENT...'
                    : 'Experimentar no CAIMENT'}
                </span>

                {!isSendingToCaiment && (
                  <ArrowRight
                    size={17}
                    className="transition group-hover:translate-x-1"
                  />
                )}
              </button>

              <button
                type="button"
                onClick={handleAddToCart}
                disabled={isAddingToCart}
                className="flex min-h-[58px] items-center justify-center gap-3 rounded-2xl border border-black/15 bg-white px-6 text-sm font-semibold text-[#171717] transition hover:border-[#6E42D1] hover:bg-[#F4F1FC] disabled:cursor-wait disabled:opacity-60"
              >
                <ShoppingBag size={19} />

                {isAddingToCart
                  ? 'Adicionando...'
                  : 'Adicionar ao carrinho'}
              </button>

            </div>

            {/* INFORMAÇÃO SOBRE O CAIMENT */}

            <div className="mt-5 rounded-2xl border border-[#CDBEF2] bg-[#F4F1FC] p-4">
              <div className="flex gap-3">

                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#6E42D1] text-white">
                  <Sparkles size={16} />
                </div>

                <div>
                  <p className="text-sm font-semibold text-[#341A6E]">
                    Experimente virtualmente
                  </p>

                  <p className="mt-1 text-xs leading-5 text-[#6E6580]">
                    Veja esta peça no seu avatar 3D através do provador
                    virtual CAIMENT e confira a recomendação de tamanho
                    baseada nas suas medidas.
                  </p>
                </div>

              </div>
            </div>

          </div>
        </div>

        {/* DETALHES DO PRODUTO */}

        <section className="mt-20 border-t border-black/10 pt-12 sm:mt-28">

          <div className="grid gap-10 md:grid-cols-2">

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-black/40">
                Sobre a peça
              </p>

              <h2 className="mt-3 text-3xl font-medium tracking-[-0.04em]">
                Detalhes
              </h2>
            </div>

            <div>
              <div className="divide-y divide-black/10">
                {product.details.map((detail) => (
                  <div
                    key={detail}
                    className="flex items-center gap-3 py-4 text-sm text-black/65"
                  >
                    <Check size={15} className="shrink-0" />
                    {detail}
                  </div>
                ))}
              </div>
            </div>

          </div>
        </section>

      </main>

      {/* FOOTER */}

      <footer className="mt-20 border-t border-black/5 bg-[#F8F7F4]">

        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-12 sm:flex-row sm:items-center sm:justify-between sm:px-8">

          <div>
            <p className="text-xl font-semibold tracking-[-0.04em]">
              FITSENSE
            </p>

            <p className="mt-2 text-xs text-black/45">
              Moda que combina com você.
            </p>
          </div>

          <div className="flex flex-wrap gap-6 text-xs font-medium text-black/60">

            <Link
              to="/fitsense"
              className="transition hover:text-black"
            >
              Início
            </Link>

            <Link
              to="/fitsense/produtos"
              className="transition hover:text-black"
            >
              Produtos
            </Link>

            <Link
              to="/fitsense/carrinho"
              className="transition hover:text-black"
            >
              Carrinho
            </Link>

          </div>
        </div>

        <div className="border-t border-black/5">
          <div className="mx-auto max-w-7xl px-5 py-5 text-xs text-black/35 sm:px-8">
            © 2026 Fitsense. Todos os direitos reservados.
          </div>
        </div>

      </footer>
    </div>
  );
}

// ============================================================
// ÍCONE DE USUÁRIO
// ============================================================

function UserIcon() {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M5 21c.8-4 3.1-6 7-6s6.2 2 7 6" />
    </svg>
  );
}
