
import { NavLink } from 'react-router-dom';
import {
  LayoutGrid,
  Scan,
  Shirt,
  Store,
  Settings,
  X,
} from 'lucide-react';
import { cn } from '@/utils/cn';

const PRODUCT_STORAGE_KEY = 'caiment_product';
const LEGACY_PRODUCT_STORAGE_KEY = 'caiment_selected_product';

const navItems = [
  { to: '/dashboard', label: 'Início', icon: LayoutGrid },
  { to: '/avatar', label: 'Meu Avatar', icon: Scan },
  { to: '/provador', label: 'Provador', icon: Shirt },
  { to: '/configuracoes', label: 'Configurações', icon: Settings },
];

interface SidebarProps {
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

type ProductPayload = Record<string, unknown>;

function isObject(value: unknown): value is ProductPayload {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseProductPayload(raw: string): ProductPayload | null {
  try {
    const parsed: unknown = JSON.parse(raw);

    if (isObject(parsed)) {
      return parsed;
    }
  } catch {
    // Tenta interpretar um payload que tenha sido codificado novamente.
  }

  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(raw));

    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function getSafeExternalUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  try {
    const url = new URL(value.trim());

    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return null;
    }

    return url.href;
  } catch {
    return null;
  }
}

function getStoreReturnUrl(): string | null {
  try {
    const rawPayload =
      sessionStorage.getItem(PRODUCT_STORAGE_KEY) ||
      sessionStorage.getItem(LEGACY_PRODUCT_STORAGE_KEY);

    if (rawPayload) {
      const payload = parseProductPayload(rawPayload);

      if (payload) {
        const product = isObject(payload.product)
          ? payload.product
          : {};

        const store = isObject(payload.store)
          ? payload.store
          : {};

        const integration = isObject(payload.integration)
          ? payload.integration
          : {};

        const candidates = [
          payload.returnUrl,
          payload.storeUrl,
          payload.originUrl,
          payload.shopUrl,
          payload.sourceUrl,
          payload.return_url,
          payload.store_url,
          store.returnUrl,
          store.url,
          store.website,
          store.websiteUrl,
          store.shopUrl,
          product.returnUrl,
          product.storeUrl,
          integration.returnUrl,
          integration.storeUrl,
        ];

        for (const candidate of candidates) {
          const safeUrl = getSafeExternalUrl(candidate);

          if (safeUrl) {
            return safeUrl;
          }
        }
      }
    }
  } catch (error) {
    console.error('Não foi possível recuperar a loja de origem:', error);
  }

  // Alternativa: utiliza a página externa que abriu o CAIMENT,
  // desde que ela seja realmente de outro domínio.
  try {
    if (document.referrer) {
      const referrerUrl = new URL(document.referrer);

      if (
        (referrerUrl.protocol === 'https:' ||
          referrerUrl.protocol === 'http:') &&
        referrerUrl.origin !== window.location.origin
      ) {
        return referrerUrl.href;
      }
    }
  } catch (error) {
    console.error('Não foi possível recuperar a página de origem:', error);
  }

  return null;
}

function handleReturnToStore() {
  const storeUrl = getStoreReturnUrl();

  if (storeUrl) {
    window.location.assign(storeUrl);
    return;
  }

  window.alert(
    'Não foi possível identificar a loja de origem. Acesse novamente o CAIMENT pelo botão de experimentar da loja.'
  );
}

export function Sidebar({ mobileOpen, onCloseMobile }: SidebarProps) {
  const handleStoreClick = () => {
    onCloseMobile?.();
    handleReturnToStore();
  };

  const content = (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex items-center justify-between px-6 py-7">
        <span className="font-display text-xl font-medium text-caiment-ink">
          <span className="italic">Meu</span>CAIMENT
        </span>

        <button
          onClick={onCloseMobile}
          className="rounded-full p-1.5 text-caiment-ink-soft hover:bg-caiment-purple-50 lg:hidden"
          aria-label="Fechar menu"
        >
          <X size={18} />
        </button>
      </div>

      {/* Navegação */}
      <nav className="flex-1 space-y-1 px-4">
        {navItems.map(({ to, label, icon: Icon }) => (
          <div key={to}>
            <NavLink
              to={to}
              onClick={onCloseMobile}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-caiment-ink text-white shadow-sm'
                    : 'text-caiment-ink-soft hover:bg-caiment-purple-50 hover:text-caiment-ink',
                )
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>

            {/* Voltar para a loja ocupa a antiga posição de Favoritos */}
            {to === '/provador' && (
              <button
                type="button"
                onClick={handleStoreClick}
                className="mt-1 flex w-full items-center gap-3 rounded-2xl px-4 py-2.5 text-left text-sm font-medium text-caiment-ink-soft transition-all duration-200 hover:bg-caiment-purple-50 hover:text-caiment-ink"
              >
                <Store size={18} />
                Voltar para a loja
              </button>
            )}
          </div>
        ))}
      </nav>

      {/* Card CAIMENT */}
      <div className="mx-4 mb-6 overflow-hidden rounded-2xl bg-caiment-purple-50 p-4">
        <div className="mb-2 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-caiment-purple-600 text-white">
            <Shirt size={14} />
          </div>

          <p className="text-xs font-semibold text-caiment-purple-700">
            Seu provador virtual
          </p>
        </div>

        <p className="text-xs leading-relaxed text-caiment-ink-soft">
          Experimente peças de lojas parceiras diretamente no seu avatar.
        </p>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop */}
      <aside className="hidden w-64 shrink-0 border-r border-caiment-line bg-white lg:block">
        {content}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-caiment-ink/40"
            onClick={onCloseMobile}
          />

          <aside className="absolute inset-y-0 left-0 w-72 animate-[slideUp_0.25s_ease] bg-white shadow-2xl">
            {content}
          </aside>
        </div>
      )}
    </>
  );
}
