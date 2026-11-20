
import {
  ArrowLeft,
  ShieldCheck,
  FileText,
  LockKeyhole,
  ChevronRight,
} from 'lucide-react';

import { useNavigate } from 'react-router-dom';

export default function PoliciesPage() {
  const navigate = useNavigate();

  return (
    <main className="min-h-screen bg-caiment-bg px-5 py-8 lg:px-10">
      <div className="mx-auto max-w-5xl">

        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mb-8 flex items-center gap-2 text-sm text-caiment-ink-soft transition-colors hover:text-caiment-purple-600"
        >
          <ArrowLeft size={18} />
          Voltar
        </button>

        <div className="mb-10">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-caiment-purple-50 text-caiment-purple-600">
              <LockKeyhole size={25} />
            </div>

            <div>
              <h1 className="font-display text-3xl font-semibold text-caiment-ink">
                Políticas e documentos
              </h1>
              <p className="text-sm text-caiment-ink-soft">
                CAIMENT — Provador Virtual
              </p>
            </div>
          </div>

          <p className="mt-4 max-w-3xl text-sm leading-7 text-caiment-ink-soft">
            Consulte as diretrizes de segurança, privacidade e
            utilização do CAIMENT. Estes documentos apresentam
            as condições e responsabilidades relacionadas ao
            uso da plataforma.
          </p>
        </div>

        <nav className="mb-10 grid gap-3 sm:grid-cols-2">
          <a
            href="#seguranca"
            className="flex items-center justify-between rounded-xl border border-caiment-line bg-white p-5 transition-colors hover:border-caiment-purple-600"
          >
            <div className="flex items-center gap-3">
              <ShieldCheck
                className="text-caiment-purple-600"
                size={23}
              />
              <div>
                <p className="text-sm font-semibold text-caiment-ink">
                  Segurança e privacidade
                </p>
                <p className="text-xs text-caiment-ink-soft">
                  Proteção das informações
                </p>
              </div>
            </div>
            <ChevronRight size={18} />
          </a>

          <a
            href="#termos"
            className="flex items-center justify-between rounded-xl border border-caiment-line bg-white p-5 transition-colors hover:border-caiment-purple-600"
          >
            <div className="flex items-center gap-3">
              <FileText
                className="text-caiment-purple-600"
                size={23}
              />
              <div>
                <p className="text-sm font-semibold text-caiment-ink">
                  Termos de uso
                </p>
                <p className="text-xs text-caiment-ink-soft">
                  Condições de utilização
                </p>
              </div>
            </div>
            <ChevronRight size={18} />
          </a>
        </nav>

        {/* POLÍTICA DE SEGURANÇA */}

        <section
          id="seguranca"
          className="mb-10 scroll-mt-8 rounded-2xl border border-caiment-line bg-white p-6 shadow-sm lg:p-9"
        >
          <div className="mb-7 flex items-center gap-3 border-b border-caiment-line pb-5">
            <ShieldCheck
              size={27}
              className="text-caiment-purple-600"
            />
            <div>
              <h2 className="text-xl font-semibold text-caiment-ink">
                Política de Segurança da Informação
              </h2>
              <p className="text-xs text-caiment-ink-soft">
                Última atualização: 04/08/2026
              </p>
            </div>
          </div>

          <div className="space-y-7 text-sm leading-7 text-caiment-ink-soft">

            <article>
              <h3 className="mb-2 font-semibold text-caiment-ink">
                1. Introdução
              </h3>
              <p>
                A segurança da informação é fundamental para a
                integridade, confidencialidade e disponibilidade
                dos dados e sistemas da Caiment Tecnologia e
                Experiência Digital LTDA.
              </p>
              <p>
                Esta política define as diretrizes para proteger
                as informações da empresa contra acesso não
                autorizado, uso indevido, divulgação, alteração
                e destruição.
              </p>
            </article>

            <article>
              <h3 className="mb-2 font-semibold text-caiment-ink">
                2. Objetivo
              </h3>
              <p>
                Estabelecer regras para garantir a proteção das
                informações da Caiment Tecnologia e Experiência
                Digital LTDA, minimizando riscos e assegurando
                o cumprimento das leis e regulamentações aplicáveis.
              </p>
            </article>

            <article>
              <h3 className="mb-2 font-semibold text-caiment-ink">
                3. Escopo
              </h3>
              <p>
                Esta política se aplica aos funcionários,
                contratados, aplicativos, APIs, bancos de dados,
                ambientes de desenvolvimento, testes e produção,
                serviços de hospedagem, cópias de segurança,
                integrações e dispositivos administrativos.
              </p>
              <p>
                Inclui Firebase Firestore, Firebase Authentication
                e Firebase Storage.
              </p>
            </article>

            <article>
              <h3 className="mb-2 font-semibold text-caiment-ink">
                4. Diretrizes Gerais
              </h3>

              <p>
                <strong className="text-caiment-ink">
                  Confidencialidade:
                </strong>{' '}
                informações de e-mail, senha e medidas do avatar
                devem ser acessíveis somente a indivíduos
                autorizados. O compartilhamento deve ser limitado
                ao mínimo necessário.
              </p>

              <p>
                <strong className="text-caiment-ink">
                  Integridade:
                </strong>{' '}
                as informações devem ser protegidas contra
                alterações não autorizadas, utilizando controles
                de versão, backups, validação, versionamento e
                trilhas de auditoria.
              </p>

              <p>
                <strong className="text-caiment-ink">
                  Disponibilidade:
                </strong>{' '}
                os sistemas e informações devem estar disponíveis
                às lojas externas autorizadas, com medidas de
                contingência, recuperação e monitoramento.
              </p>
            </article>

            <article>
              <h3 className="mb-2 font-semibold text-caiment-ink">
                5. Classificação da Informação
              </h3>
              <p>
                <strong className="text-caiment-ink">Pública:</strong>{' '}
                dados das peças e nome da loja externa.
              </p>
              <p>
                <strong className="text-caiment-ink">Confidencial:</strong>{' '}
                informações de fornecedor e origem.
              </p>
              <p>
                <strong className="text-caiment-ink">Restrita:</strong>{' '}
                código da loja externa.
              </p>
            </article>

            <article>
              <h3 className="mb-2 font-semibold text-caiment-ink">
                6. Integração e Conectividade (Segurança de APIs)
              </h3>
              <p>
                As lojas externas fornecerão chaves de acesso,
                tokens ou credenciais exclusivas para integração.
                Essas credenciais são confidenciais e intransferíveis,
                devendo ser armazenadas de forma criptografada.
              </p>
              <p>
                A comunicação entre os sistemas deverá utilizar
                protocolos criptografados seguros, como HTTPS
                com TLS 1.3 ou superior.
              </p>
              <p>
                Serão implementados limites de requisições
                (Rate Limiting), com possibilidade de suspensão
                de integrações que apresentem comportamento
                anômalo e coloquem a estabilidade das plataformas
                em risco.
              </p>
            </article>

            <article>
              <h3 className="mb-2 font-semibold text-caiment-ink">
                7. Validação e Integridade dos Dados
              </h3>
              <p>
                Os dados recebidos, incluindo textos, medidas,
                tecidos, modelos e cores, poderão ser sanitizados,
                filtrados e validados antes de serem armazenados,
                visando impedir ataques de injeção de código,
                como SQL Injection e Cross-Site Scripting (XSS).
              </p>
              <p>
                As lojas externas deverão comunicar com
                antecedência mínima de 10 dias alterações em
                formatos, schemas ou estruturas de APIs que
                possam comprometer a integração.
              </p>
            </article>

            <article>
              <h3 className="mb-2 font-semibold text-caiment-ink">
                8. Exclusão de Responsabilidade por Erro de Dados
              </h3>
              <p>
                A loja externa é responsável pela veracidade,
                precisão e atualização das informações de
                tamanho, medidas, tecido, modelo e cor enviadas.
              </p>
              <p>
                A política estabelece que a Caiment Tecnologia
                e Experiência Digital LTDA não será
                responsabilizada por prejuízos decorrentes de
                divergências entre as informações fornecidas
                pela integração e o produto físico entregue.
              </p>
            </article>

            <article>
              <h3 className="mb-2 font-semibold text-caiment-ink">
                9. Disponibilidade e Contingência (SLA)
              </h3>
              <p>
                Em caso de indisponibilidade dos servidores ou
                APIs da loja externa, o CAIMENT poderá operar
                em modo de contingência, omitindo temporariamente
                os produtos afetados.
              </p>
            </article>

            <article>
              <h3 className="mb-2 font-semibold text-caiment-ink">
                10. Propriedade Intelectual e Uso Autorizado
              </h3>
              <p>
                A loja externa concede à Caiment Tecnologia e
                Experiência Digital LTDA uma licença não
                exclusiva, gratuita e limitada para coletar,
                armazenar, processar e exibir dados de catálogo,
                como especificações e descrições dos produtos,
                exclusivamente para a finalidade da parceria
                comercial estabelecida.
              </p>
            </article>

            <article>
              <h3 className="mb-2 font-semibold text-caiment-ink">
                11. Diretrizes para o Uso da Inteligência Artificial
              </h3>
              <p>
                A Inteligência Artificial utilizada pelo CAIMENT
                tem como finalidade gerar recomendações de
                tamanhos e simulações do caimento das roupas,
                utilizando as informações fornecidas pela
                loja externa durante o gerenciamento dos dados
                compartilhados na integração.
              </p>
              <p>
                O processamento deverá respeitar os princípios
                de privacidade, transparência e proteção de dados,
                em conformidade com a Lei Geral de Proteção
                de Dados Pessoais (LGPD — Lei nº 13.709/2018).
              </p>
              <p>
                Os dados não poderão ser utilizados para
                finalidades diferentes das autorizadas pelo
                usuário, nem compartilhados com terceiros
                sem o devido consentimento.
              </p>
              <p>
                As recomendações geradas possuem caráter
                informativo e representam estimativas baseadas
                nos dados fornecidos pela loja externa.
              </p>
              <p>
                Os modelos de Inteligência Artificial deverão
                ser monitorados e atualizados periodicamente,
                buscando aprimorar a precisão das recomendações,
                reduzir inconsistências e assegurar uma
                utilização ética e transparente.
              </p>
            </article>

            <article>
              <h3 className="mb-2 font-semibold text-caiment-ink">
                12. Treinamento e Conscientização
              </h3>
              <p>
                A equipe deverá participar de programas regulares
                de treinamento em segurança da informação,
                compreendendo suas responsabilidades e boas
                práticas de proteção e manutenção dos bancos
                de dados.
              </p>
              <p>
                A política prevê a revisão anual das diretrizes
                de segurança.
              </p>
            </article>

            <article>
              <h3 className="mb-2 font-semibold text-caiment-ink">
                13. Resposta a Incidentes
              </h3>
              <p>
                Todos os incidentes de segurança deverão ser
                reportados imediatamente ao departamento de TI
                ou responsável pela segurança da informação.
              </p>
              <p>
                A loja externa deverá entrar em contato com
                a equipe CAIMENT pelo número de WhatsApp
                disponibilizado na plataforma. A resposta da
                equipe ao usuário deverá ocorrer em até três
                dias úteis.
              </p>
              <p>
                A equipe responsável deverá investigar,
                documentar e mitigar os efeitos de qualquer
                incidente de segurança.
              </p>
            </article>

            <article>
              <h3 className="mb-2 font-semibold text-caiment-ink">
                14. Conformidade e Auditoria
              </h3>
              <p>
                A Caiment Tecnologia e Experiência Digital
                LTDA deverá assegurar o cumprimento das leis
                e regulamentações aplicáveis à segurança
                da informação.
              </p>
              <p>
                Auditorias internas e externas deverão ser
                conduzidas regularmente.
              </p>
            </article>

            <article>
              <h3 className="mb-2 font-semibold text-caiment-ink">
                15. Revisão da Política
              </h3>
              <p>
                Esta política deverá ser revisada anualmente,
                ou sempre que necessário, para garantir sua
                eficácia e conformidade com as mudanças
                legais e tecnológicas.
              </p>
            </article>
          </div>
        </section>

        {/* TERMOS DE USO */}

        <section
          id="termos"
          className="scroll-mt-8 rounded-2xl border border-caiment-line bg-white p-6 shadow-sm lg:p-9"
        >
          <div className="mb-7 flex items-center gap-3 border-b border-caiment-line pb-5">
            <FileText
              size={27}
              className="text-caiment-purple-600"
            />
            <div>
              <h2 className="text-xl font-semibold text-caiment-ink">
                Termos de Uso de Software
              </h2>
              <p className="text-xs text-caiment-ink-soft">
                Última atualização: 04/08/2026
              </p>
            </div>
          </div>

          <div className="space-y-7 text-sm leading-7 text-caiment-ink-soft">

            <article>
              <h3 className="mb-2 font-semibold text-caiment-ink">
                1. Aceitação dos Termos
              </h3>
              <p>
                Ao baixar, instalar, acessar ou integrar o
                software CAIMENT, você concorda em cumprir
                e estar legalmente vinculado aos presentes
                Termos de Uso.
              </p>
              <p>
                Caso não concorde com estes termos, não
                deverá utilizar o software.
              </p>
            </article>

            <article>
              <h3 className="mb-2 font-semibold text-caiment-ink">
                2. Licença de Uso
              </h3>
              <p>
                <strong className="text-caiment-ink">
                  2.1 Concessão de Licença:
                </strong>{' '}
                é concedida uma licença limitada, não exclusiva,
                intransferível e revogável para utilização
                do CAIMENT para fins pessoais e não comerciais,
                sujeita ao cumprimento destes termos.
              </p>
              <p>
                <strong className="text-caiment-ink">
                  2.2 Restrições de Uso:
                </strong>{' '}
                o usuário concorda em não copiar, modificar,
                criar obras derivadas, realizar engenharia
                reversa, descompilar, tentar extrair o
                código-fonte, alugar, sublicenciar ou distribuir
                o software a terceiros.
              </p>
            </article>

            <article>
              <h3 className="mb-2 font-semibold text-caiment-ink">
                3. Atualizações
              </h3>
              <p>
                A Caiment Tecnologia e Experiência Digital
                LTDA poderá fornecer atualizações, correções
                de bugs e outras modificações periodicamente.
                Essas atualizações poderão ser instaladas
                automaticamente como parte do uso contínuo
                do software.
              </p>
            </article>

            <article>
              <h3 className="mb-2 font-semibold text-caiment-ink">
                4. Propriedade Intelectual
              </h3>
              <p>
                Todos os direitos relacionados ao software,
                incluindo direitos autorais, patentes,
                segredos comerciais, marcas registradas e
                demais direitos de propriedade intelectual,
                são atribuídos à Caiment Tecnologia e
                Experiência Digital LTDA, conforme o documento.
              </p>
              <p>
                Estes Termos de Uso não concedem ao usuário
                direitos de propriedade intelectual sobre
                o software.
              </p>
            </article>

            <article>
              <h3 className="mb-2 font-semibold text-caiment-ink">
                5. Coleta de Dados e Privacidade
              </h3>
              <p>
                <strong className="text-caiment-ink">
                  5.1 Coleta de Dados:
                </strong>{' '}
                poderão ser coletadas informações sobre o
                uso do software, incluindo dados técnicos
                e informações relacionadas ao desempenho,
                para melhorar sua funcionalidade.
              </p>
              <p>
                <strong className="text-caiment-ink">
                  5.2 Política de Privacidade:
                </strong>{' '}
                o uso do software está sujeito à Política
                de Privacidade da Caiment Tecnologia e
                Experiência Digital LTDA.
              </p>
            </article>

            <article>
              <h3 className="mb-2 font-semibold text-caiment-ink">
                6. Limitação de Responsabilidade
              </h3>
              <p>
                O documento estabelece que a Caiment
                Tecnologia e Experiência Digital LTDA não
                será responsável por danos diretos, indiretos,
                incidentais, especiais, consequenciais ou
                punitivos decorrentes do uso ou da
                incapacidade de utilizar o software.
              </p>
            </article>

            <article>
              <h3 className="mb-2 font-semibold text-caiment-ink">
                7. Garantia Limitada
              </h3>
              <p>
                O software é fornecido "como está", sem
                garantias de qualquer tipo, expressas ou
                implícitas, incluindo garantias de
                comercialização, adequação a uma finalidade
                específica ou não violação.
              </p>
            </article>

            <article>
              <h3 className="mb-2 font-semibold text-caiment-ink">
                8. Rescisão
              </h3>
              <p>
                Os Termos de Uso permanecem efetivos até
                serem rescindidos. A Caiment Tecnologia e
                Experiência Digital LTDA poderá rescindir
                os termos em caso de violação de suas
                disposições.
              </p>
              <p>
                Após a rescisão, o usuário deverá cessar
                a utilização do software e destruir as
                cópias em sua posse, conforme previsto
                no documento.
              </p>
            </article>

            <article>
              <h3 className="mb-2 font-semibold text-caiment-ink">
                9. Disposições Gerais
              </h3>
              <p>
                <strong className="text-caiment-ink">
                  9.1 Legislação Aplicável:
                </strong>{' '}
                estes termos serão regidos e interpretados
                de acordo com as leis do Brasil.
              </p>
              <p>
                <strong className="text-caiment-ink">
                  9.2 Alterações aos Termos:
                </strong>{' '}
                a Caiment Tecnologia e Experiência Digital
                LTDA reserva-se o direito de modificar
                estes termos, com efeitos após sua
                publicação ou notificação.
              </p>
              <p>
                <strong className="text-caiment-ink">
                  9.3 Acordo Integral:
                </strong>{' '}
                estes termos constituem o acordo integral
                entre as partes em relação à utilização
                do software.
              </p>
            </article>

            <article>
              <h3 className="mb-2 font-semibold text-caiment-ink">
                10. Contato
              </h3>
              <p>
                Em caso de dúvidas sobre estes Termos
                de Uso, entre em contato com a Caiment
                Tecnologia e Experiência Digital LTDA
                pelos canais oficiais disponibilizados
                na plataforma.
              </p>
            </article>
          </div>
        </section>

        <footer className="mt-8 border-t border-caiment-line py-6 text-center text-xs text-caiment-ink-soft">
          CAIMENT — Provador Virtual
          <p className="mt-1">
            Política de Segurança e Termos de Uso.
          </p>
        </footer>

      </div>
    </main>
  );
}
