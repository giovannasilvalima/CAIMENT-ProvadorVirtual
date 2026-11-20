
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ShoppingBag,
} from 'lucide-react';

type Category = {
  name: string;
  image: string;
};

type Product = {
  id: number;
  name: string;
  category: string;
  price: number;
  image: string;
};

type CartItem = {
  id: number;
  quantity: number;
};

const categories: Category[] = [
  {
    name: 'Camisetas',
    image:
      'https://cdn.dooca.store/946/products/a-567.jpg?v=1707488629&webp=0',
  },
  {
    name: 'Calças',
    image:
      'https://images.unsplash.com/photo-1542272604-787c3835535d?auto=format&fit=crop&w=900&q=85',
  },
  {
    name: 'Vestidos',
    image:
      'https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&w=900&q=85',
  },
  {
    name: 'Shorts',
    image:
      'https://images.unsplash.com/photo-1591195853828-11db59a44f6b?auto=format&fit=crop&w=1200&q=90',
  },
];

const products: Product[] = [
  {
    id: 1,
    name: 'Camiseta Essential',
    category: 'Camisetas',
    price: 129.9,
    image:
      'https://cdn.dooca.store/946/products/a-567.jpg?v=1707488629&webp=0',
  },
  {
    id: 2,
    name: 'Calça Wide Leg',
    category: 'Calças',
    price: 249.9,
    image:
      'https://images.unsplash.com/photo-1542272604-787c3835535d?auto=format&fit=crop&w=900&q=85',
  },
  {
    id: 3,
    name: 'Vestido Serena',
    category: 'Vestidos',
    price: 289.9,
    image:
      'https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&w=900&q=85',
  },
  {
    id: 4,
    name: 'Short Casual',
    category: 'Shorts',
    price: 159.9,
    image:
      'https://images.unsplash.com/photo-1591195853828-11db59a44f6b?auto=format&fit=crop&w=1200&q=90',
  },
];

function formatPrice(price: number) {
  return price.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

export default function FitsenseHomePage() {
  const [cartCount, setCartCount] = useState(0);

  // ATUALIZAR CONTADOR DO CARRINHO
  useEffect(() => {
    function updateCartCount() {
      try {
        const savedCart = localStorage.getItem('fitsense_cart');

        if (!savedCart) {
          setCartCount(0);
          return;
        }

        const cart: CartItem[] = JSON.parse(savedCart);

        if (!Array.isArray(cart)) {
          setCartCount(0);
          return;
        }

        const count = cart.reduce(
          (total, item) =>
            total + (Number(item.quantity) || 0),
          0,
        );

        setCartCount(count);
      } catch {
        setCartCount(0);
      }
    }

    updateCartCount();

    window.addEventListener('storage', updateCartCount);
    window.addEventListener('focus', updateCartCount);

    return () => {
      window.removeEventListener('storage', updateCartCount);
      window.removeEventListener('focus', updateCartCount);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#F8F7F4] text-[#171717]">

      {/* HEADER */}
      <header className="sticky top-0 z-50 border-b border-black/5 bg-[#F8F7F4]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8">

          {/* LOGO */}
          <Link
            to="/fitsense"
            className="text-2xl font-semibold tracking-[-0.04em]"
          >
            FITSENSE
          </Link>

          {/* MENU FUNCIONAL */}
          <nav className="hidden items-center gap-8 md:flex">
            <Link
              to="/fitsense"
              className="text-sm font-semibold"
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

          {/* CARRINHO */}
          <Link
            to="/fitsense/carrinho"
            aria-label={`Carrinho com ${cartCount} itens`}
            className="relative flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-black/5"
          >
            <ShoppingBag
              size={19}
              strokeWidth={1.7}
            />

            {cartCount > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#171717] px-1 text-[9px] font-semibold text-white">
                {cartCount}
              </span>
            )}
          </Link>

        </div>
      </header>

      <main>

        {/* HERO */}
        <section className="mx-auto max-w-7xl px-5 pt-5 sm:px-8">
          <div className="relative min-h-[560px] overflow-hidden rounded-[2rem] bg-[#D9D4CC] sm:min-h-[650px]">

            <img
              src="https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1800&q=90"
              alt="Coleção de moda Fitsense"
              className="absolute inset-0 h-full w-full object-cover"
            />

            <div className="absolute inset-0 bg-gradient-to-r from-black/65 via-black/25 to-transparent" />

            <div className="relative flex min-h-[560px] max-w-xl flex-col justify-end p-8 pb-12 text-white sm:min-h-[650px] sm:p-14 sm:pb-16">

              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.3em] text-white/75">
                Fitsense collection
              </p>

              <h1 className="max-w-lg text-5xl font-medium leading-[0.95] tracking-[-0.05em] sm:text-7xl">
                Vista o que combina com você.
              </h1>

              <p className="mt-6 max-w-md text-sm leading-6 text-white/80 sm:text-base">
                Descubra peças para todos os momentos e
                encontre aquelas que combinam com seu estilo.
              </p>

              <div className="mt-8">
                <Link
                  to="/fitsense/produtos"
                  className="inline-flex items-center gap-3 rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-[#171717] transition hover:scale-[1.02] hover:bg-white/90"
                >
                  Explorar produtos
                  <ArrowRight size={17} />
                </Link>
              </div>

            </div>
          </div>
        </section>

        {/* CATEGORIAS */}
        <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-28">

          <div className="mb-10 flex items-end justify-between">

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.25em] text-black/45">
                Explore
              </p>

              <h2 className="text-4xl font-medium tracking-[-0.04em] sm:text-5xl">
                Categorias
              </h2>
            </div>

            <Link
              to="/fitsense/produtos"
              className="hidden items-center gap-2 text-sm font-semibold transition hover:opacity-50 sm:flex"
            >
              Ver tudo
              <ArrowRight size={16} />
            </Link>

          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-5">

            {categories.map((category) => (
              <Link
                key={category.name}
                to="/fitsense/produtos"
                aria-label={`Ver produtos: ${category.name}`}
                className="group relative aspect-[3/4] overflow-hidden rounded-2xl bg-[#DDD8D0]"
              >

                <img
                  src={category.image}
                  alt={category.name}
                  loading="lazy"
                  className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
                />

                <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />

                <div className="absolute bottom-5 left-5 right-5">
                  <span className="text-lg font-medium text-white sm:text-xl">
                    {category.name}
                  </span>
                </div>

              </Link>
            ))}

          </div>
        </section>

        {/* PRODUTOS */}
        <section className="bg-white">

          <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-28">

            <div className="mb-10 flex items-end justify-between">

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.25em] text-black/45">
                  Seleção Fitsense
                </p>

                <h2 className="text-4xl font-medium tracking-[-0.04em] sm:text-5xl">
                  Nossa seleção
                </h2>
              </div>

              <Link
                to="/fitsense/produtos"
                className="hidden items-center gap-2 text-sm font-semibold transition hover:opacity-50 sm:flex"
              >
                Ver todos
                <ArrowRight size={16} />
              </Link>

            </div>

            <div className="grid grid-cols-2 gap-x-3 gap-y-10 sm:grid-cols-4 sm:gap-x-5">

              {products.map((product) => (
                <Link
                  key={product.id}
                  to={`/fitsense/produtos/${product.id}`}
                  className="group"
                >

                  <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-[#F2F0EC]">

                    <img
                      src={product.image}
                      alt={product.name}
                      loading="lazy"
                      className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
                    />

                    <div className="absolute bottom-3 left-3 rounded-full bg-white/90 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] backdrop-blur-md">
                      Ver produto
                    </div>

                  </div>

                  <div className="pt-4">

                    <p className="text-xs uppercase tracking-[0.15em] text-black/40">
                      {product.category}
                    </p>

                    <h3 className="mt-1 text-sm font-medium sm:text-base">
                      {product.name}
                    </h3>

                    <p className="mt-2 text-sm font-semibold">
                      {formatPrice(product.price)}
                    </p>

                  </div>

                </Link>
              ))}

            </div>

            <div className="mt-10 flex justify-center sm:hidden">
              <Link
                to="/fitsense/produtos"
                className="inline-flex items-center gap-2 rounded-full border border-black/10 px-6 py-3 text-sm font-semibold"
              >
                Ver todos os produtos
                <ArrowRight size={16} />
              </Link>
            </div>

          </div>
        </section>

        {/* CAIMENT */}
        <section className="bg-[#171717] text-white">

          <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-2">

            <div>

              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.25em] text-white/45">
                Tecnologia Fitsense
              </p>

              <h2 className="max-w-xl text-4xl font-medium leading-tight tracking-[-0.04em] sm:text-6xl">
                Moda e tecnologia em um só lugar.
              </h2>

              <p className="mt-6 max-w-lg text-sm leading-7 text-white/60 sm:text-base">
                Conheça a proposta do CAIMENT, nosso provador
                virtual desenvolvido para aproximar a experiência
                de experimentar roupas do ambiente digital.
              </p>

              <Link
                to="/fitsense/produtos"
                className="mt-8 inline-flex items-center gap-3 rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-[#171717] transition hover:bg-white/90"
              >
                Conhecer as peças
                <ArrowRight size={17} />
              </Link>

            </div>

            <div className="relative aspect-square overflow-hidden rounded-[2rem] bg-[#2A2A2A]">

              <img
                src="https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1200&q=85"
                alt="Moda e tecnologia Fitsense"
                loading="lazy"
                className="h-full w-full object-cover opacity-85"
              />

              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

              <div className="absolute bottom-7 left-7 right-7">

                <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-medium backdrop-blur-md">
                  <span className="h-2 w-2 rounded-full bg-[#C6F24E]" />
                  CAIMENT + FITSENSE
                </div>

              </div>
            </div>

          </div>
        </section>

      </main>

      {/* FOOTER */}
      <footer className="bg-[#F8F7F4]">

        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-12 sm:px-8 md:flex-row md:items-center md:justify-between">

          <div>

            <p className="text-xl font-semibold tracking-[-0.04em]">
              FITSENSE
            </p>

            <p className="mt-2 text-xs text-black/45">
              Moda que combina com você.
            </p>

          </div>

          {/* LINKS FUNCIONAIS */}
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
