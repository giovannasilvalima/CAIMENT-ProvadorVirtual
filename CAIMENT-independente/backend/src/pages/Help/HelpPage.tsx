
import {
  ArrowLeft,
  ChevronDown,
  CircleHelp,
  Mail,
  MessageCircle,
  AtSign,
  ExternalLink,
  Send,
  Copy,
  Check,
} from 'lucide-react';

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const SUPPORT_EMAIL = 'projetocaiment@gmail.com';

const INSTAGRAM_URL = 'https://www.instagram.com/caiment2026/';

const faqItems = [
  {
    question: 'O que é o CAIMENT?',
    answer:
      'O CAIMENT é uma plataforma de experimentação virtual de roupas que permite visualizar como diferentes peças podem se ajustar ao seu corpo por meio de um avatar 3D personalizado.',
  },
  {
    question: 'Como funciona a criação do avatar?',
    answer:
      'O processo utiliza fotos e informações corporais para gerar um avatar tridimensional. Após a criação, você poderá visualizar sua representação virtual e utilizá-la no provador.',
  },
  {
    question: 'Por que preciso informar minhas medidas?',
    answer:
      'As medidas corporais ajudam a personalizar o avatar e permitem comparar as dimensões do corpo com as dimensões das roupas disponibilizadas pelas lojas.',
  },
  {
    question: 'Como experimentar uma roupa?',
    answer:
      'Acesse o provador virtual, selecione uma peça disponibilizada pela loja e escolha o tamanho desejado. O sistema utilizará as informações disponíveis para apresentar a peça no seu avatar.',
  },
  {
    question: 'Posso alterar minhas medidas?',
    answer:
      'Sim. Você pode acessar a área de medidas para consultar e atualizar suas informações corporais, conforme as funcionalidades disponíveis na plataforma.',
  },
  {
    question: 'O que fazer se meu avatar ou uma roupa não carregar?',
    answer:
      'Verifique sua conexão com a internet e tente atualizar a página. Se o problema continuar, entre em contato com nossa equipe de suporte informando o ocorrido.',
  },
];

export default function HelpPage() {
  const navigate = useNavigate();

  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [emailCopied, setEmailCopied] = useState(false);

  async function handleCopyEmail() {
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL);
      setEmailCopied(true);

      window.setTimeout(() => {
        setEmailCopied(false);
      }, 2500);
    } catch (error) {
      console.error('Erro ao copiar e-mail:', error);

      window.location.href = `mailto:${SUPPORT_EMAIL}`;
    }
  }

  function getEmailLink() {
    const subject = encodeURIComponent(
        'Solicitação de suporte - CAIMENT'
    );

    const body = encodeURIComponent(
        'Olá, equipe CAIMENT!\n\n' +
        'Estou entrando em contato para solicitar suporte.\n\n' +
        'Descrição do problema:\n\n' +
        'Atenciosamente,'
    );

    return (
        `https://mail.google.com/mail/?view=cm&fs=1` +
        `&to=${encodeURIComponent(SUPPORT_EMAIL)}` +
        `&su=${subject}` +
        `&body=${body}`
    );
    }

  return (
    <main className="min-h-screen bg-caiment-bg px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">

        {/* CABEÇALHO */}

        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mb-6 inline-flex items-center gap-2 rounded-lg text-sm text-caiment-ink-soft transition-colors hover:text-caiment-purple-600"
        >
          <ArrowLeft size={18} />
          Voltar
        </button>

        <section className="mb-10">
          <div className="mb-3 flex items-center gap-2">
            <CircleHelp
              size={22}
              className="text-caiment-purple-600"
            />

            <span className="text-sm font-semibold uppercase tracking-wider text-caiment-purple-600">
              Central de ajuda
            </span>
          </div>

          <h1 className="font-display text-3xl font-semibold text-caiment-ink sm:text-4xl">
            Como podemos ajudar?
          </h1>

          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-caiment-ink-soft sm:text-base">
            Encontre informações sobre o funcionamento do CAIMENT,
            tire suas dúvidas e entre em contato com nossa equipe.
          </p>
        </section>

        {/* CONTATOS */}

        <section className="mb-12">
          <h2 className="mb-5 text-xl font-semibold text-caiment-ink">
            Entre em contato
          </h2>

          <div className="grid gap-4 md:grid-cols-2">

            {/* E-MAIL */}

            <div className="rounded-2xl border border-caiment-line bg-white p-6 shadow-sm">
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-caiment-purple-50 text-caiment-purple-600">
                <Mail size={24} />
              </div>

              <h3 className="text-lg font-semibold text-caiment-ink">
                E-mail
              </h3>

              <p className="mt-2 text-sm leading-relaxed text-caiment-ink-soft">
                Entre em contato com nossa equipe para dúvidas,
                sugestões ou problemas técnicos.
              </p>

              <p className="mt-4 break-all text-sm font-medium text-caiment-purple-600">
                {SUPPORT_EMAIL}
              </p>

              <div className="mt-5 grid grid-cols-2 gap-2">
                <a
                  href={getEmailLink()}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-caiment-purple-600 px-3 py-3 text-sm font-semibold text-white transition-colors hover:bg-caiment-purple-700"
                >
                  <Send size={16} />
                  Enviar e-mail
                </a>

                <button
                  type="button"
                  onClick={handleCopyEmail}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-caiment-purple-600 px-3 py-3 text-sm font-semibold text-caiment-purple-600 transition-colors hover:bg-caiment-purple-50"
                >
                  {emailCopied ? (
                    <>
                      <Check size={16} />
                      Copiado!
                    </>
                  ) : (
                    <>
                      <Copy size={16} />
                      Copiar e-mail
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* INSTAGRAM */}

            <div className="rounded-2xl border border-caiment-line bg-white p-6 shadow-sm">
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-caiment-purple-50 text-caiment-purple-600">
                <AtSign size={24} />
              </div>

              <h3 className="text-lg font-semibold text-caiment-ink">
                Instagram
              </h3>

              <p className="mt-2 text-sm leading-relaxed text-caiment-ink-soft">
                Acompanhe as novidades do projeto, conheça nossas
                atualizações e fale conosco pelas redes sociais.
              </p>

              <p className="mt-4 text-sm font-medium text-caiment-purple-600">
                @caiment2026
              </p>

              <a
                href={INSTAGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-caiment-purple-600 px-4 py-3 text-sm font-semibold text-caiment-purple-600 transition-colors hover:bg-caiment-purple-50"
              >
                <AtSign size={16} />
                Acessar Instagram
                <ExternalLink size={14} />
              </a>
            </div>

          </div>
        </section>

        {/* PERGUNTAS FREQUENTES */}

        <section className="mb-12">
          <div className="mb-5 flex items-center gap-3">
            <CircleHelp
              size={21}
              className="text-caiment-purple-600"
            />

            <h2 className="text-xl font-semibold text-caiment-ink">
              Perguntas frequentes
            </h2>
          </div>

          <div className="overflow-hidden rounded-2xl border border-caiment-line bg-white">

            {faqItems.map((item, index) => {
              const isExpanded = expandedFaq === index;

              return (
                <div
                  key={item.question}
                  className={
                    index !== faqItems.length - 1
                      ? 'border-b border-caiment-line'
                      : ''
                  }
                >
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedFaq(
                        isExpanded ? null : index
                      )
                    }
                    aria-expanded={isExpanded}
                    className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left transition-colors hover:bg-caiment-purple-50/50"
                  >
                    <span className="text-sm font-medium text-caiment-ink sm:text-base">
                      {item.question}
                    </span>

                    <ChevronDown
                      size={19}
                      className={`shrink-0 text-caiment-purple-600 transition-transform ${
                        isExpanded ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {isExpanded && (
                    <div className="px-5 pb-5">
                      <p className="text-sm leading-relaxed text-caiment-ink-soft">
                        {item.answer}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}

          </div>
        </section>

        {/* SUPORTE */}

        <section className="rounded-2xl bg-caiment-purple-50 p-6 sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">

            <div className="flex gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-caiment-purple-600">
                <MessageCircle size={24} />
              </div>

              <div>
                <h2 className="text-lg font-semibold text-caiment-ink">
                  Ainda precisa de ajuda?
                </h2>

                <p className="mt-2 max-w-lg text-sm leading-relaxed text-caiment-ink-soft">
                  Nossa equipe está disponível para receber suas
                  dúvidas, sugestões e relatos de problemas.
                </p>
              </div>
            </div>

            <a
              href={getEmailLink()}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-caiment-purple-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-caiment-purple-700"
            >
              <Mail size={17} />
              Falar com suporte
            </a>

          </div>
        </section>

        {/* RODAPÉ */}

        <footer className="mt-10 border-t border-caiment-line py-6 text-center">
          <p className="text-sm font-semibold text-caiment-ink">
            CAIMENT
          </p>

          <p className="mt-2 text-xs text-caiment-ink-soft">
            Tecnologia e moda conectadas à sua experiência.
          </p>

          <p className="mt-2 text-xs text-caiment-ink-soft">
            © {new Date().getFullYear()} CAIMENT. Todos os direitos reservados.
          </p>
        </footer>

      </div>
    </main>
  );
}
