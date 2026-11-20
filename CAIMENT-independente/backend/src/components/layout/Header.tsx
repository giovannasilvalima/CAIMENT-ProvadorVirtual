
import {
  ChevronDown,
  CircleHelp,
  LogOut,
  Menu,
  ShieldCheck,
  Store,
  UserRound,
} from 'lucide-react';

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '@/context/AuthContext';
import { getUserProfile } from '@/services/firebase/users';

interface HeaderProps {
  title: string;
  onOpenMobileMenu: () => void;
}

type ProductPayload = Record<string, unknown>;

const PRODUCT_STORAGE_KEY = 'caiment_product';
const LEGACY_PRODUCT_STORAGE_KEY = 'caiment_selected_product';

function isObject(value: unknown): value is ProductPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function parseProductPayload(raw: string): ProductPayload | null {
  const candidates = [raw];

  try {
    candidates.push(decodeURIComponent(raw));
  } catch {
    // Mantém o valor original caso não seja uma string codificada.
  }

  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);

      if (isObject(parsed)) {
        return parsed;
      }
    } catch {
      // Tenta o próximo formato.
    }
  }

  return null;
}

function getSafeExternalUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  try {
    const url = new URL(value);

    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.href;
    }
  } catch {
    return null;
  }

  return null;
}

function getStoreReturnUrl(): string | null {
  try {
    const storedProduct =
      sessionStorage.getItem(PRODUCT_STORAGE_KEY) ||
      sessionStorage.getItem(LEGACY_PRODUCT_STORAGE_KEY);

    if (storedProduct) {
      const payload = parseProductPayload(storedProduct);

      if (payload) {
        const possibleUrls: unknown[] = [
          payload.returnUrl,
          payload.storeUrl,
          payload.originUrl,
          payload.shopUrl,
          payload.sourceUrl,
          payload.return_url,
          payload.store_url,
        ];

        if (isObject(payload.store)) {
          possibleUrls.push(
            payload.store.returnUrl,
            payload.store.url,
            payload.store.website,
            payload.store.websiteUrl,
            payload.store.shopUrl
          );
        }

        if (isObject(payload.product)) {
          possibleUrls.push(
            payload.product.returnUrl,
            payload.product.storeUrl
          );
        }

        if (isObject(payload.integration)) {
          possibleUrls.push(
            payload.integration.returnUrl,
            payload.integration.storeUrl
          );
        }

        for (const value of possibleUrls) {
          const safeUrl = getSafeExternalUrl(value);

          if (safeUrl) {
            return safeUrl;
          }
        }
      }
    }

    const referrer = document.referrer;

    if (referrer) {
      const referrerUrl = new URL(referrer);

      if (referrerUrl.origin !== window.location.origin) {
        return getSafeExternalUrl(referrer);
      }
    }
  } catch (error) {
    console.error(
      'Erro ao identificar a loja de origem:',
      error
    );
  }

  return null;
}

export function Header({
  title,
  onOpenMobileMenu,
}: HeaderProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [userName, setUserName] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadUserName() {
      if (!user) {
        setUserName('');
        return;
      }

      try {
        const profile = await getUserProfile(user.uid);

        if (profile?.name) {
          setUserName(profile.name);
        } else if (user.displayName) {
          setUserName(user.displayName);
        } else {
          setUserName(user.email?.split('@')[0] || '');
        }
      } catch (error) {
        console.error(
          'Erro ao carregar nome do usuário:',
          error
        );

        setUserName(
          user.displayName ||
          user.email?.split('@')[0] ||
          ''
        );
      }
    }

    loadUserName();
  }, [user]);

  // Fecha o menu ao clicar fora ou pressionar Escape.
  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node)
      ) {
        setMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener(
        'mousedown',
        handleOutsideClick
      );

      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const initials = userName
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((name) => name[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  function handleReturnToStore() {
    setMenuOpen(false);

    const storeUrl = getStoreReturnUrl();

    if (storeUrl) {
      window.location.assign(storeUrl);
      return;
    }

    alert(
      'Não foi possível identificar a loja de origem. ' +
      'Acesse novamente o CAIMENT pelo botão de experimentar da loja.'
    );
  }

  async function handleLogout() {
    setMenuOpen(false);

    try {
      await logout();
    } catch (error) {
      console.error('Erro ao encerrar sessão:', error);

      alert(
        'Não foi possível encerrar sua sessão. Tente novamente.'
      );
    }
  }

  function handleProfile() {
    setMenuOpen(false);
    navigate('/configuracoes');
  }

  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-caiment-line bg-caiment-bg/90 px-5 py-4 backdrop-blur-sm lg:px-8">
      {/* Menu lateral para dispositivos móveis */}
      <button
        type="button"
        onClick={onOpenMobileMenu}
        className="rounded-full p-2 text-caiment-ink-soft transition-colors hover:bg-caiment-purple-50 focus:outline-none focus:ring-2 focus:ring-caiment-purple-600 lg:hidden"
        aria-label="Abrir menu"
      >
        <Menu size={20} />
      </button>

      <h1 className="font-display text-xl font-medium text-caiment-ink">
        {title}
      </h1>

      {/* Menu do usuário */}
      <div className="relative ml-auto" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((previous) => !previous)}
          className="flex items-center gap-2 rounded-full p-1.5 transition-colors hover:bg-caiment-purple-50 focus:outline-none focus:ring-2 focus:ring-caiment-purple-600"
          aria-label="Abrir menu do usuário"
          aria-haspopup="true"
          aria-expanded={menuOpen}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-caiment-purple-600 text-xs font-semibold text-white">
            {initials || '?'}
          </span>

          <ChevronDown
            size={16}
            className={`text-caiment-ink-soft transition-transform ${
              menuOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-xl border border-caiment-line bg-white shadow-xl">
            {/* Identificação do usuário */}
            <div className="border-b border-caiment-line px-4 py-4">
              <p className="truncate text-sm font-semibold text-caiment-ink">
                {userName || 'Usuário'}
              </p>

              <p className="mt-1 truncate text-xs text-caiment-ink-soft">
                {user?.email || ''}
              </p>
            </div>

            <div className="p-2">
              {/* Perfil */}
              <button
                type="button"
                onClick={handleProfile}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-caiment-ink transition-colors hover:bg-caiment-purple-50"
              >
                <UserRound
                  size={18}
                  className="text-caiment-purple-600"
                />
                <span>Meu perfil</span>
              </button>

              {/* Ajuda */}
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  navigate('/ajuda');
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-caiment-ink transition-colors hover:bg-caiment-purple-50"
              >
                <CircleHelp
                  size={18}
                  className="text-caiment-purple-600"
                />
                <span>Ajuda</span>
              </button>

              {/* Termos de uso */}
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  navigate('/politicas');
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-caiment-ink transition-colors hover:bg-caiment-purple-50"
              >
                <ShieldCheck
                  size={18}
                  className="text-caiment-purple-600"
                />
                <span className="flex-1">
                  Políticas de segurança e privacidade
                </span>
              </button>
            </div>

            <div className="border-t border-caiment-line p-2">
              {/* Voltar para a loja */}
              <button
                type="button"
                onClick={handleReturnToStore}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-caiment-ink transition-colors hover:bg-caiment-purple-50"
              >
                <Store
                  size={18}
                  className="text-caiment-purple-600"
                />
                <span>Voltar para a loja</span>
              </button>

              {/* Logout */}
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-red-600 transition-colors hover:bg-red-50"
              >
                <LogOut size={18} />
                <span>Sair da conta</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
