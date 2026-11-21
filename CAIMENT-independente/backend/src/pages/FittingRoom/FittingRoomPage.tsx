
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  ArrowLeft,
  Ruler,
  ShoppingBag,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  UserRound,
} from 'lucide-react';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AvatarViewer } from '@/components/avatar/AvatarViewer';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

import { useAuth } from '@/context/AuthContext';

import { getAvatar } from '@/services/firebase/avatar';
import { getUserProfile } from '@/services/firebase/users';
import { getMeasurements } from '@/services/firebase/measurements';

import { formatCurrency } from '@/utils/format';

import {
  recommendSize,
  type UserMeasurements,
  type ProductSize,
  type SizeRecommendationResult,
} from '@/features/clothing/recommendation/SizeRecommendation';

const PRODUCT_STORAGE_KEY = 'caiment_product';
const LEGACY_PRODUCT_STORAGE_KEY = 'caiment_selected_product';

interface SelectedProduct {
  id: string;
  name: string;
  category: string;
  price: number;
  image: string;
  size: string;
  color: string;
  sizes: ProductSize[];
  [key: string]: unknown;
}

type ProductPayload = Record<string, unknown>;

function isObject(value: unknown): value is ProductPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function getString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

function getNumber(...values: unknown[]): number {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value.replace(',', '.'));

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return 0;
}

function normalizeProductSizes(value: unknown): ProductSize[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized: ProductSize[] = [];

  for (const item of value) {
    if (!isObject(item)) {
      continue;
    }

    const size = getString(item.size);

    if (!size || !isObject(item.measurements)) {
      continue;
    }

    normalized.push({
      size,
      measurements: item.measurements as ProductSize['measurements'],
    });
  }

  return normalized;
}

function normalizeProduct(
  payload: ProductPayload,
): SelectedProduct | null {
  const data = isObject(payload.data)
    ? payload.data
    : {};

  const nestedProduct = isObject(data.product)
    ? data.product
    : isObject(payload.product)
      ? payload.product
      : data;

  const variant = isObject(payload.selectedVariant)
    ? payload.selectedVariant
    : isObject(payload.variant)
      ? payload.variant
      : isObject(nestedProduct.selectedVariant)
        ? nestedProduct.selectedVariant
        : isObject(nestedProduct.variant)
          ? nestedProduct.variant
          : {};

  const combined: ProductPayload = {
    ...payload,
    ...data,
    ...nestedProduct,
  };

  const id = getString(
    combined.id,
    combined.productId,
    combined.sku,
  );

  const name = getString(
    combined.name,
    combined.title,
    combined.productName,
  );

  if (!id || !name) {
    console.error(
      'CAIMENT: produto recebido sem identificador ou nome.',
      payload,
    );

    return null;
  }

  const images = isObject(combined.images)
    ? combined.images
    : {};

  const image = getString(
    combined.image,
    combined.imageUrl,
    combined.thumbnail,
    combined.photo,
    images.front,
  );

  return {
    id,
    name,

    category:
      getString(
        combined.categoryLabel,
        combined.category,
        combined.type,
        combined.garmentType,
      ) || 'Produto',

    price: getNumber(
      combined.price,
      combined.salePrice,
      combined.displayPrice,
    ),

    image: image || '',

    size:
      getString(
        combined.size,
        combined.selectedSize,
        variant.size,
        variant.name,
      ) || 'M',

    color:
      getString(
        combined.color,
        combined.selectedColor,
        variant.color,
      ) || 'Padrão',

    sizes: normalizeProductSizes(
      combined.sizes,
    ),
  };
}

function recoverSelectedProduct(): SelectedProduct | null {
  const params = new URLSearchParams(window.location.search);

  const productFromUrl =
    params.get('caiment_product') ||
    params.get('fitsense_product');

  if (productFromUrl) {
    try {
      const parsed: unknown = JSON.parse(productFromUrl);

      if (!isObject(parsed)) {
        throw new Error('Payload do produto inválido.');
      }

      sessionStorage.setItem(
        PRODUCT_STORAGE_KEY,
        productFromUrl,
      );

      return normalizeProduct(parsed);
    } catch (error) {
      console.error(
        'CAIMENT: erro ao interpretar o produto recebido pela URL:',
        error,
      );
    }
  }

  const savedProduct =
    sessionStorage.getItem(PRODUCT_STORAGE_KEY) ||
    sessionStorage.getItem(LEGACY_PRODUCT_STORAGE_KEY);

  if (!savedProduct) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(savedProduct);

    if (!isObject(parsed)) {
      throw new Error('Payload armazenado inválido.');
    }

    sessionStorage.setItem(
      PRODUCT_STORAGE_KEY,
      savedProduct,
    );

    return normalizeProduct(parsed);
  } catch (error) {
    console.error(
      'CAIMENT: não foi possível recuperar o produto armazenado:',
      error,
    );

    return null;
  }
}

function getUserMeasurementsForRecommendation(
  input: unknown,
): UserMeasurements {
  if (!isObject(input)) {
    return {};
  }

  const source = isObject(input.medidas)
    ? input.medidas
    : isObject(input.measurements)
      ? input.measurements
      : input;

  const result: UserMeasurements = {};

  const supportedMeasurements = [
    'torax',
    'busto',
    'cintura',
    'quadril',
    'ombros',
  ];

  for (const key of supportedMeasurements) {
    const value = source[key];

    if (typeof value === 'number' || isObject(value)) {
      result[key] = value as UserMeasurements[string];
    }
  }

  return result;
}

function RecommendationPanel({
  recommendation,
}: {
  recommendation: SizeRecommendationResult;
}) {
  const hasRecommendation =
    recommendation.recommendedSize !== null;

  const levelLabel = {
    high: 'Alta compatibilidade',
    medium: 'Compatibilidade moderada',
    low: 'Baixa compatibilidade',
    incompatible: 'Compatibilidade insuficiente',
    unavailable: 'Dados insuficientes',
  }[recommendation.level];

  const levelColor = {
    high: 'text-green-700 bg-green-50 border-green-200',
    medium: 'text-amber-700 bg-amber-50 border-amber-200',
    low: 'text-orange-700 bg-orange-50 border-orange-200',
    incompatible: 'text-red-700 bg-red-50 border-red-200',
    unavailable:
      'text-caiment-ink-soft bg-caiment-purple-50 border-caiment-purple-100',
  }[recommendation.level];

  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-caiment-purple-100 text-caiment-purple-700">
          <Ruler size={21} />
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-caiment-ink-soft">
            Análise de tamanho
          </p>

          <h3 className="mt-1 font-display text-lg font-medium text-caiment-ink">
            Recomendação para você
          </h3>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-caiment-purple-100 bg-caiment-purple-50 p-4">
        {hasRecommendation ? (
          <>
            <p className="text-xs font-medium text-caiment-ink-soft">
              Tamanho mais compatível
            </p>

            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="font-display text-4xl font-semibold text-caiment-ink">
                {recommendation.recommendedSize}
              </p>

              <span
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${levelColor}`}
              >
                {recommendation.compatibility}%
              </span>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3">
            <AlertCircle
              size={22}
              className="shrink-0 text-caiment-ink-soft"
            />

            <div>
              <p className="text-sm font-semibold text-caiment-ink">
                Não foi possível recomendar um tamanho
              </p>

              <p className="mt-1 text-xs text-caiment-ink-soft">
                {recommendation.message}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4">
        <div className="flex items-center gap-2">
          {hasRecommendation ? (
            <CheckCircle2
              size={16}
              className="text-green-600"
            />
          ) : (
            <AlertCircle
              size={16}
              className="text-amber-600"
            />
          )}

          <p className="text-sm font-semibold text-caiment-ink">
            {levelLabel}
          </p>
        </div>

        <p className="mt-2 text-xs leading-5 text-caiment-ink-soft">
          {recommendation.message}
        </p>
      </div>

      {recommendation.ranking.length > 0 && (
        <div className="mt-5 border-t border-caiment-line pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-caiment-ink-soft">
            Comparação entre tamanhos
          </p>

          <div className="mt-3 space-y-3">
            {recommendation.ranking.map((item) => (
              <div key={item.size}>
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-caiment-ink">
                    Tamanho {item.size}
                  </span>

                  <span className="text-xs font-semibold text-caiment-ink-soft">
                    {item.compatibility}%
                  </span>
                </div>

                <div className="h-2 overflow-hidden rounded-full bg-caiment-purple-100">
                  <div
                    className="h-full rounded-full bg-caiment-purple-600 transition-all"
                    style={{
                      width: `${item.compatibility}%`,
                    }}
                  />
                </div>

                <p className="mt-1 text-[11px] text-caiment-ink-soft">
                  {item.measurementsCompared}{' '}
                  {item.measurementsCompared === 1
                    ? 'medida comparada'
                    : 'medidas comparadas'}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="mt-4 border-t border-caiment-line pt-3 text-[11px] leading-5 text-caiment-ink-soft">
        A recomendação utiliza suas medidas corporais e as
        dimensões técnicas dos tamanhos fornecidas pela loja.
        O CAIMENT não gera nem modifica modelos de roupas.
      </p>
    </Card>
  );
}

export default function FittingRoomPage() {
  const { user } = useAuth();

  const [modelUrl, setModelUrl] =
    useState<string | null>(null);

  const [avatarReady, setAvatarReady] =
    useState(false);

  const [product, setProduct] =
    useState<SelectedProduct | null>(null);

  const [measurementsReady, setMeasurementsReady] =
    useState<boolean | null>(null);

  const [measurements, setMeasurements] =
    useState<Awaited<
      ReturnType<typeof getMeasurements>
    >>(null);

  const [loadError, setLoadError] =
    useState<string | null>(null);

  const recommendation = useMemo<SizeRecommendationResult>(
    () => {
      if (!product) {
        return {
          recommendedSize: null,
          compatibility: 0,
          level: 'unavailable',
          ranking: [],
          message: 'Nenhum produto foi selecionado.',
        };
      }

      const userMeasurements =
        getUserMeasurementsForRecommendation(
          measurements,
        );

      const productSizes = product.sizes ?? [];

      if (productSizes.length === 0) {
        return {
          recommendedSize: null,
          compatibility: 0,
          level: 'unavailable',
          ranking: [],
          message:
            'A loja não enviou as medidas dos tamanhos. Não é possível calcular uma recomendação.',
        };
      }

      return recommendSize(
        userMeasurements,
        productSizes,
      );
    },
    [product, measurements],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadFittingRoom() {
      if (!user) {
        setMeasurementsReady(false);
        setAvatarReady(false);
        setModelUrl(null);
        setProduct(null);
        setMeasurements(null);
        return;
      }

      try {
        setLoadError(null);
        setAvatarReady(false);
        setModelUrl(null);

        const recoveredProduct =
          recoverSelectedProduct();

        if (!cancelled) {
          setProduct(recoveredProduct);
        }

        const [
          profile,
          userMeasurements,
          avatar,
        ] = await Promise.all([
          getUserProfile(user.uid),
          getMeasurements(user.uid),
          getAvatar(user.uid),
        ]);

        if (cancelled) {
          return;
        }

        setMeasurements(userMeasurements);

        setMeasurementsReady(
          profile?.measurementsCompleted === true,
        );

        if (avatar?.modelUrl) {
          setModelUrl(avatar.modelUrl);
          setAvatarReady(true);
        } else {
          setModelUrl(null);
          setAvatarReady(false);
        }
      } catch (error) {
        console.error(
          'CAIMENT: erro ao carregar dados do usuário:',
          error,
        );

        if (!cancelled) {
          setLoadError(
            'Não foi possível carregar seus dados. Tente novamente.',
          );

          setMeasurementsReady(false);
          setAvatarReady(false);
          setModelUrl(null);
        }
      }
    }

    void loadFittingRoom();

    return () => {
      cancelled = true;
    };
  }, [user]);

  if (measurementsReady === null) {
    return (
      <DashboardLayout title="Meu avatar e tamanhos">
        <Card className="flex min-h-[420px] items-center justify-center">
          <div className="text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-caiment-purple-100 border-t-caiment-purple-500" />

            <p className="mt-4 text-sm text-caiment-ink-soft">
              Carregando seus dados...
            </p>
          </div>
        </Card>
      </DashboardLayout>
    );
  }

  if (!measurementsReady) {
    return (
      <DashboardLayout title="Meu avatar e tamanhos">
        <Card className="overflow-hidden">
          <div className="relative flex min-h-[420px] flex-col items-center justify-center overflow-hidden rounded-3xl bg-caiment-ink px-6 py-12 text-center">
            <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-caiment-purple-600/30 blur-3xl" />

            <div className="pointer-events-none absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-caiment-lime/10 blur-3xl" />

            <div className="relative flex h-16 w-16 items-center justify-center rounded-3xl bg-caiment-purple-500 text-white shadow-lg">
              <Ruler size={28} />
            </div>

            <h3 className="relative mt-6 font-display text-2xl font-medium text-white">
              Complete suas medidas
            </h3>

            <p className="relative mt-2 max-w-md text-sm leading-relaxed text-white/70">
              Precisamos das suas medidas corporais para
              recomendar os tamanhos mais compatíveis com
              você.
            </p>

            {loadError && (
              <p className="relative mt-3 text-sm text-red-300">
                {loadError}
              </p>
            )}

            <div className="relative mt-7 flex flex-col gap-3 sm:flex-row">
              <Link to="/medidas">
                <Button className="bg-caiment-lime text-caiment-ink hover:bg-caiment-lime-soft">
                  Cadastrar medidas
                </Button>
              </Link>

              <Link to="/avatar">
                <Button
                  variant="outline"
                  className="border-white/20 text-white hover:bg-white/10"
                >
                  Ver meu avatar
                </Button>
              </Link>
            </div>
          </div>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Meu avatar e tamanhos">
      <div className="space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-caiment-purple-600">
            CAIMENT
          </p>

          <h2 className="mt-1 font-display text-2xl font-medium text-caiment-ink">
            Seu avatar e recomendação de tamanho
          </h2>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-caiment-ink-soft">
            Consulte seu avatar personalizado e descubra
            qual tamanho apresenta maior compatibilidade
            com suas medidas.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Card padding="none" className="overflow-hidden">
            <div className="relative overflow-hidden rounded-3xl bg-caiment-purple-50/60 p-3">
              {avatarReady && modelUrl ? (
                <>
                  <AvatarViewer
                    key={modelUrl}
                    modelUrl={modelUrl}
                    className="h-[820px]"
                  />

                  <div className="absolute left-6 top-6 flex items-center gap-2 rounded-full bg-white/90 px-3 py-2 shadow-sm backdrop-blur">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-caiment-lime-deep" />

                    <span className="text-xs font-semibold text-caiment-ink">
                      Avatar carregado
                    </span>
                  </div>
                </>
              ) : (
                <div className="relative flex min-h-[820px] flex-col items-center justify-center overflow-hidden rounded-3xl bg-caiment-ink px-8 py-12 text-center">
                  <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-caiment-purple-600/30 blur-3xl" />

                  <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-caiment-lime/10 blur-3xl" />

                  <div className="relative flex h-16 w-16 items-center justify-center rounded-3xl bg-caiment-purple-500 text-white shadow-lg">
                    <Sparkles size={28} />
                  </div>

                  <h3 className="relative mt-6 font-display text-2xl font-medium text-white">
                    Seu avatar ainda não está pronto
                  </h3>

                  <p className="relative mt-2 max-w-sm text-sm leading-relaxed text-white/70">
                    Crie seu avatar personalizado para
                    visualizar seu modelo 3D.
                  </p>

                  <Link to="/avatar-criacao">
                    <Button className="relative mt-7 bg-caiment-lime text-caiment-ink hover:bg-caiment-lime-soft">
                      Criar meu avatar
                    </Button>
                  </Link>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-caiment-line px-5 py-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-caiment-ink-soft">
                  Seu avatar
                </p>

                <p className="mt-1 text-sm font-medium text-caiment-ink">
                  {avatarReady && modelUrl
                    ? 'Modelo personalizado'
                    : 'Avatar ainda não criado'}
                </p>
              </div>

              <Link to="/avatar">
                <Button
                  size="sm"
                  variant="outline"
                  icon={<UserRound size={14} />}
                >
                  Meu avatar
                </Button>
              </Link>
            </div>
          </Card>

          <div className="flex flex-col gap-4">
            {product ? (
              <Card>
                <div className="flex gap-4">
                  <div className="h-28 w-24 shrink-0 overflow-hidden rounded-2xl bg-caiment-purple-50">
                    {product.image && (
                      <img
                        src={product.image}
                        alt={product.name}
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium uppercase tracking-wide text-caiment-purple-600">
                      Loja parceira
                    </p>

                    <h3 className="mt-1 font-display text-xl font-medium text-caiment-ink">
                      {product.name}
                    </h3>

                    <p className="mt-1 text-sm text-caiment-ink-soft">
                      {product.category}
                    </p>

                    <p className="mt-3 text-lg font-semibold text-caiment-ink">
                      {formatCurrency(product.price)}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-caiment-line pt-4">
                  <div className="rounded-2xl bg-caiment-purple-50 p-4">
                    <p className="text-xs text-caiment-ink-soft">
                      Tamanho selecionado
                    </p>

                    <p className="mt-1 text-lg font-semibold text-caiment-ink">
                      {product.size}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-caiment-purple-50 p-4">
                    <p className="text-xs text-caiment-ink-soft">
                      Cor selecionada
                    </p>

                    <p className="mt-1 text-sm font-semibold text-caiment-ink">
                      {product.color}
                    </p>
                  </div>
                </div>
              </Card>
            ) : (
              <Card>
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-caiment-purple-100 text-caiment-purple-700">
                    <ShoppingBag size={21} />
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-caiment-ink-soft">
                      Loja parceira
                    </p>

                    <h3 className="mt-1 font-display text-lg font-medium text-caiment-ink">
                      Nenhum produto selecionado
                    </h3>
                  </div>
                </div>

                <p className="mt-3 text-sm leading-6 text-caiment-ink-soft">
                  Você pode acessar o CAIMENT diretamente
                  para consultar seu avatar. Para receber
                  uma recomendação, entre pelo produto de
                  uma loja parceira.
                </p>
              </Card>
            )}

            {product && (
              <RecommendationPanel
                recommendation={recommendation}
              />
            )}

            <Card>
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-caiment-purple-100 text-caiment-purple-700">
                  <Ruler size={21} />
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-caiment-ink-soft">
                    Seus dados
                  </p>

                  <h3 className="mt-1 font-display text-lg font-medium text-caiment-ink">
                    Medidas corporais
                  </h3>
                </div>
              </div>

              <p className="mt-3 text-sm leading-6 text-caiment-ink-soft">
                Suas medidas ficam salvas no seu perfil e
                podem ser atualizadas sempre que necessário.
              </p>

              <Link to="/medidas">
                <Button
                  className="mt-4 w-full"
                  variant="outline"
                  icon={<Ruler size={15} />}
                >
                  Atualizar minhas medidas
                </Button>
              </Link>
            </Card>

            {product && (
              <Link to="/dashboard">
                <Button
                  variant="outline"
                  className="w-full"
                  icon={<ArrowLeft size={15} />}
                >
                  Voltar ao painel
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
