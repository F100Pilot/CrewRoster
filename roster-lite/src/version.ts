// Single source for the app's display name and version, shown in the header, the welcome
// screen and the shared-day image.
//
// Versioning — 0.8.<centesimal>[.<milésima>]:
//   • new features → bump the CENTESIMAL (3rd part): 0.8.2 → 0.8.3
//   • small fixes  → bump the MILÉSIMA (4th part):   0.8.2 → 0.8.2.1
// Add a RELEASE_NOTES entry for every bump so the "Novidades" pop-up can announce it.
export const APP_NAME = 'CrewRoster';
export const APP_VERSION = '0.9.3.4';
export const APP_STAGE = 'Beta';
export const APP_VERSION_LABEL = `${APP_VERSION} ${APP_STAGE}`;

export interface ReleaseNote {
  version: string;
  date: string; // YYYY-MM-DD
  highlights: string[];
}

// Newest first.
export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: '0.9.3.4',
    date: '2026-11-14',
    highlights: [
      'IO / prevenir: a app passa a reconhecê-lo sozinha mesmo quando a apresentação real difere uns minutos da que calcula (1 h antes da partida — a escala não traz a hora de apresentação). Basta o IO começar até 15 min da apresentação do serviço planeado.',
    ],
  },
  {
    version: '0.9.3.3',
    date: '2026-11-14',
    highlights: [
      'Descarregar escala: as datas de início e fim ficam uma por baixo da outra no telemóvel — lado a lado, a data ficava cortada.',
    ],
  },
  {
    version: '0.9.3.2',
    date: '2026-11-14',
    highlights: [
      'Histórico de PDFs → "Recarregar escala": a app volta a ler todos os PDFs guardados (do mais antigo para o mais recente) e atualiza a escala com o que a versão atual sabe ler — por exemplo, um dia com IO que ainda aparecia vazio. Os dias que não estão em nenhum PDF ficam como estão.',
    ],
  },
  {
    version: '0.9.3.1',
    date: '2026-11-14',
    highlights: [
      'Os PDFs importados à mão (Importar escala → Escolher ficheiro) passam também a ficar no Histórico de PDFs, marcados "Importado", para que as melhorias da app os voltem a ler — como os descarregados. O mesmo ficheiro importado duas vezes fica só uma.',
      'Um dia com IO importado antes da 0.9.2 continua vazio até o PDF desse dia ser importado (ou descarregado) outra vez — basta uma vez.',
    ],
  },
  {
    version: '0.9.3',
    date: '2026-11-14',
    highlights: [
      'Histórico de PDFs organizado em abas: anos e, dentro de cada ano, meses — pela data do download. Cada PDF é identificado pelo dia e hora em que foi descarregado (o mais recente assinalado), e apagar pede confirmação.',
      'S.EXT. passa a aparecer como "Serviço externo" (estava "Gabinete").',
    ],
  },
  {
    version: '0.9.2.2',
    date: '2026-11-14',
    highlights: [
      'IO normal (depois de voos, ou fora da base): o período do IO conta no serviço e nos abonos como o resto do PSV, e a estadia onde acaba paga os valores de lá (ex.: Manchester).',
    ],
  },
  {
    version: '0.9.2.1',
    date: '2026-11-14',
    highlights: [
      'IO: quando a app tem a escala anterior para comparar, decide sozinha se foi o prevenir ou um IO normal e diz porquê no dia. A opção "Foi o prevenir" só aparece quando não há com que comparar.',
    ],
  },
  {
    version: '0.9.2',
    date: '2026-11-14',
    highlights: [
      'IO (irregularidade operacional): a escala passa a ler o código — antes o dia ficava vazio. Conta como tempo de serviço.',
      'Prevenir (chamado na apresentação para o teste de álcool): um IO que começa à hora da apresentação do serviço planeado conta por inteiro — duty, ajuda de custo A (nacional) e os abonos do período (ex.: almoço de 18 €). No dia há a opção "Foi o prevenir" para confirmar ou corrigir.',
      'Para comparar com o serviço planeado, a app precisa de ter a escala descarregada antes da alteração.',
    ],
  },
  {
    version: '0.9.1.1',
    date: '2026-11-13',
    highlights: [
      'Partilhar o mês → Imagem: mostra agora o calendário inteiro — cada dia com a cor do serviço, o destino e a hora de saída (hora local) — e por baixo os dias de voo, setores, bloco, folgas e a legenda das cores.',
    ],
  },
  {
    version: '0.9.1',
    date: '2026-11-13',
    highlights: [
      'Calendário → Partilhar o mês: além da imagem, a escala como texto dia a dia (para WhatsApp ou SMS, em horas locais) e como ficheiro de calendário só desse mês, para juntar ao calendário de outra pessoa. Sem nomes de tripulantes nem valores.',
      'Campos de data com os números do tamanho normal.',
    ],
  },
  {
    version: '0.9.0',
    date: '2026-11-13',
    highlights: [
      'Novo visual em 3D em toda a app: banners que flutuam sobre a página com céu, colinas e sombra, botões como teclas que afundam ao carregar, cartões em relevo e campos afundados (com o nome dentro da caixa).',
      'Barra de navegação flutuante, com o separador ativo como uma tecla levantada; os botões do topo passam a teclas de vidro.',
      '"Hoje": anéis dos limites em 3D e os próximos dias como teclas. Calendário: cada dia é uma tecla com a cor do serviço.',
      'Gráficos com volume: barras 3D na evolução mensal (o mês atual a laranja) e limites, férias e duty-pay/block-pay em tubos.',
      'Mapa: a Terra em satélite (imagem Blue Marble da NASA), no globo e no plano; abre no globo. A imagem fica guardada para funcionar sem rede.',
    ],
  },
  {
    version: '0.8.40.2',
    date: '2026-11-12',
    highlights: [
      'Diário: um ramp return (setor com partida e chegada no mesmo aeroporto, ex.: LIS→LIS) já não conta descolagem nem aterragem — nem na recência, na impressão EASA ou no CSV.',
      'Editar setor: nova opção "Não houve" para a descolagem e para a aterragem (escolhida sozinha num ramp return); num air return muda para Eu ou Colega.',
    ],
  },
  {
    version: '0.8.40.1',
    date: '2026-11-12',
    highlights: [
      'Simulador EBT-2: o debriefing é de 1 h (não 30 min) — a sessão EBT-2 conta briefing 1 h + sessão + debriefing 1 h; a EBT-1 fica 30 min + sessão + 1 h. Corrige 30 min a menos no duty-pay por cada EBT-2 (uma sessão de 4 h dá 6h00, como o DT da escala).',
    ],
  },
  {
    version: '0.8.40',
    date: '2026-11-12',
    highlights: [
      'Diário de bordo: campo de notas em cada setor (Editar setor). As notas aparecem na lista do diário, na caderneta EASA impressa (coluna "Voo / Obs.") e no CSV, e mantêm-se quando a escala atualiza o voo — escrever uma nota não congela o setor.',
      'Corrigido: guardar um setor à mão apagava o nome do comandante (coluna "Nome PIC" da caderneta EASA).',
    ],
  },
  {
    version: '0.8.39',
    date: '2026-11-11',
    highlights: [
      'iPhone: a app ocupa o ecrã todo sem ficar por baixo do relógio / Dynamic Island nem da barra de gestos; guardar PDFs, backups e o diário abre a folha de partilha do iPhone (Guardar em Ficheiros, Mail, WhatsApp…); a app pede ao telemóvel para não apagar os seus dados.',
      'Definições → Ajuda: como instalar a app no iPhone (Safari → Partilhar → Adicionar ao ecrã principal) e no Android.',
    ],
  },
  {
    version: '0.8.38',
    date: '2026-11-11',
    highlights: [
      'Vencimento: calculadora em cada campo de valor (botão 🧮) — soma várias linhas do recibo (ex.: 69 + 236,38) e "Usar" põe o resultado no campo. Também podes escrever a conta diretamente no campo; aparece "= …" por baixo e fica o resultado.',
    ],
  },
  {
    version: '0.8.37.2',
    date: '2026-11-11',
    highlights: [
      'Vencimento: todos os valores ao cêntimo, como no recibo — bruto, líquido e cada linha (deixou de arredondar ao euro) — e a taxa de IRS com duas casas decimais.',
    ],
  },
  {
    version: '0.8.37.1',
    date: '2026-11-11',
    highlights: [
      'Escala: um dia que o PDF mostra em branco passa a apagar o que estava guardado nesse dia. Antes, um voo retirado de um dia (que ficou vazio) continuava na app — e contava per diem. As escalas guardadas reprocessam sozinhas.',
      'Vencimento: limite isento de SS nacional de volta a 54,49 € (o recibo de outubro bate ao cêntimo); o dia de exame médico não dá subsídio de alimentação (o per diem B mantém-se).',
    ],
  },
  {
    version: '0.8.37',
    date: '2026-11-11',
    highlights: [
      'Simulador EBT: o tempo de serviço passa a contar o briefing e o debriefing — EBT-1 = 30 min + sessão + 1 h, EBT-2 = 1 h + sessão + 30 min. Conta no duty-pay do Vencimento, nos limites de serviço, no descanso e na apresentação do "Hoje". As horas da sessão na escala e o block-pay ficam como estão.',
    ],
  },
  {
    version: '0.8.36.1',
    date: '2026-11-11',
    highlights: [
      'Vencimento: os line checks passam a ser contados pela escala — um por dia com voos marcados W_INS (examinador). O − / + no cartão fica para corrigir a contagem do mês. A marca W_INS aparece no dia como "Line check · instrutor".',
    ],
  },
  {
    version: '0.8.36',
    date: '2026-11-11',
    highlights: [
      'Vencimento: novo campo "Line check (cada)" nas Definições → Vencimento. Como a escala não marca os line checks, conta-os no cartão do Vencimento (botões − / +, por mês trabalhado); entram no variável, pagos no mês seguinte.',
    ],
  },
  {
    version: '0.8.35.1',
    date: '2026-11-11',
    highlights: [
      'Vencimento: limite isento de Segurança Social por dia em Portugal corrigido para 51,90 € (estava 54,49 €). Quem tinha o valor antigo guardado passa automaticamente; um valor escrito à mão mantém-se.',
    ],
  },
  {
    version: '0.8.35',
    date: '2026-11-11',
    highlights: [
      'Simulador EBT: as sessões LIS-EBT-1 e LIS-EBT-2 mostram o briefing e o debriefing, que a escala não indica — dia 1: briefing 30 min e debriefing 1 h; dia 2: briefing 1 h e debriefing 30 min. As horas da escala (sessão de 4h00 ou 5h00) não mudam.',
    ],
  },
  {
    version: '0.8.34.3',
    date: '2026-11-10',
    highlights: [
      'Abonos: a ceia deixa de contar como embarcada — é sempre paga quando é devida, ao valor local da Tabela 34 se o serviço acaba fora da base (ex.: chegada a Barcelona à 01:45, ceia 33 € + pernoita 10 €; Lyon 40 € + 10 €).',
    ],
  },
  {
    version: '0.8.34.2',
    date: '2026-11-10',
    highlights: [
      'Abonos: com um dia X fora de casa, as duas pernoitas são pagas — também quando se chega depois da meia-noite e a apresentação do regresso é à meia-noite (ex.: Praia, 2 × 14 €).',
    ],
  },
  {
    version: '0.8.34.1',
    date: '2026-11-10',
    highlights: [
      'Abonos: a pernoita passa a contar também quando a chegada é depois da meia-noite — por exemplo na Praia (RAI), 14 €. Antes faltava a pernoita nessas estadias.',
    ],
  },
  {
    version: '0.8.34',
    date: '2026-11-10',
    highlights: [
      'Vencimento: novo "Subsídio de gabinete" por dia GAB (valor em Definições → Vencimento).',
      'Vencimento: novo "Subsídio de alimentação" por dia em terra na base (10,46 €, editável) — isento de IRS e SS e descontado como "Cartão-refeição", como no recibo.',
    ],
  },
  {
    version: '0.8.33.1',
    date: '2026-11-10',
    highlights: [
      'Vencimento: limites isentos por dia acertados por quatro recibos reais — IRS 36,33 € / SS 54,49 € nacional, IRS 116,95 € / SS 175,42 € estrangeiro — a bater ao cêntimo com "Outros valores p/ impostos".',
      'Simulador fora da base (ex.: Frankfurt numa estadia) passa a contar como per diem A fora (parcialmente isento), como no recibo, e não "… T".',
    ],
  },
  {
    version: '0.8.33',
    date: '2026-11-10',
    highlights: [
      'Vencimento: a parte isenta do per diem passa a ser calculada dia a dia — limite nacional ou estrangeiro (dia que toca um aeroporto fora de Portugal), já com a redução por a empresa pagar o hotel.',
      'Os abonos de refeição de cada dia somam ao per diem desse dia antes do limite; o que passa é tributado com o ordenado.',
      'Limites por omissão do payroll da PGA (IRS 34,60 € / SS 51,90 € nacional; IRS 116,95 € / SS 175,42 € estrangeiro), editáveis em Definições → Vencimento → Avançado.',
    ],
  },
  {
    version: '0.8.32.4',
    date: '2026-11-10',
    highlights: [
      'Abonos em FASE EXPERIMENTAL: aviso em destaque na página e "Em testes" no Dia. Confirma sempre no extrato de Abonos Operacionais.',
      'Novo botão "Enviar feedback" nos Abonos: abre um email já preparado para indicares as diferenças entre a app e o extrato.',
    ],
  },
  {
    version: '0.8.32.3',
    date: '2026-11-10',
    highlights: ['Abonos têm agora um ícone próprio na barra de cima (🍴), ao lado do "⋮", em vez de estarem dentro do menu.'],
  },
  {
    version: '0.8.32.2',
    date: '2026-11-10',
    highlights: [
      'Apresentação: num dia já voado com atraso, passa a contar a apresentação planeada (a de antes da atualização pós-voo), e não a partida real − 1h.',
      'Com isso, o FDP e o descanso desses dias contam o atraso desde a apresentação real, e os abonos usam a apresentação original.',
      'Só funciona quando a app viu a escala antes do dia (o PDF de um dia passado não traz o plano).',
    ],
  },
  {
    version: '0.8.32.1',
    date: '2026-11-10',
    highlights: [
      'Abonos: refeições em DHC passam a ser pagas (valor local da Tabela 34 se o DHC acaba fora da base, Tabela 33 se regressa).',
      'Abonos: uma refeição só é embarcada num setor que voe dentro do horário dela (ou no primeiro, se o serviço começa no horário); contam as horas planeadas quando a app as conhece.',
      'Conferido com uma escala e o extrato de maio: 11 linhas, 9 iguais ao cêntimo.',
    ],
  },
  {
    version: '0.8.32',
    date: '2026-11-10',
    highlights: [
      'Novo: Abonos (refeições) — o RAACO do ROV (cap. 4.5, Tabelas 32 a 34) calculado pela escala, para pilotos e cabine. Menu "⋮" → Abonos.',
      'A página mostra o mês como o extrato de Abonos Operacionais: data, início, escala de pernoita, pequeno-almoço, almoço, jantar e ceia + pernoita.',
      'No Dia, cada refeição devida com o porquê: a bordo, em terra, ajuda de custo (Tabela 33) ou estadia (Tabela 34).',
      'Em testes: o Meal Plan e as irregularidades não estão na escala — confirma sempre no extrato.',
    ],
  },
  {
    version: '0.8.31.1',
    date: '2026-11-10',
    highlights: ['Totais do mês (Lista e Calendário) com o texto centrado nos mosaicos.'],
  },
  {
    version: '0.8.31',
    date: '2026-11-10',
    highlights: [
      'Os cartões do "Hoje" passam para toda a app: na Lista, cada dia é um cartão com a faixa da cor do serviço, a data, a rota (ou o código) em grande e os números do dia (apresentação, bloco, setores, chegada — ou início, fim, duração e local).',
      'Totais do mês (Lista e Calendário) em mosaicos como os do "Hoje".',
      'Dia: cada serviço com a mesma faixa e cabeçalho; formação, simulador e escritório com início, fim, duração e local em hora local.',
      'Pesquisa e pesquisa de colegas com as linhas do "Hoje".',
    ],
  },
  {
    version: '0.8.30',
    date: '2026-11-10',
    highlights: [
      'O céu do banner mostra agora o tempo no aeroporto onde estás pela escala (na base ou na estadia): sol, lua na fase real, nuvens, chuva, neve, nevoeiro e trovoada.',
      'A temperatura e o estado do tempo aparecem no topo do "Hoje" e ao lado da etiqueta de cada página.',
      'Valores de modelo (Open-Meteo), só para ambiente — para o briefing usa sempre o METAR/TAF.',
    ],
  },
  {
    version: '0.8.29.4',
    date: '2026-11-10',
    highlights: [
      'Todas as páginas têm agora o mesmo banner do "Hoje": o céu da tua base (madrugada, dia, fim de tarde ou noite), a etiqueta da secção, um título grande e os números principais.',
      'Lista e Calendário: o mês em destaque, com as setas e o "Hoje" no banner.',
      'Dia: a data, a rota do dia e o bloco / serviço no topo.',
      'AE: o limite mais apertado em percentagem logo à cabeça.',
      'Diário de bordo, Estatísticas, Vencimento, Mapa, Pesquisa, Documentos, PDFs e Códigos com o mesmo cabeçalho.',
    ],
  },
  {
    version: '0.8.29.3',
    date: '2026-11-10',
    highlights: [
      '"Hoje" segue o tema da app como as outras páginas: no tema claro fica claro, só com um tom leve da fase (frio antes do serviço, azul em serviço, verde-água na estadia, areia na folga); o topo continua a mostrar o céu da hora local.',
    ],
  },
  {
    version: '0.8.29.2',
    date: '2026-11-10',
    highlights: [
      'Toda a app com o estilo do "Hoje": barra azul-noite, cartões planos com contorno fino, avisos em tons suaves, cantos arredondados — em modo claro e escuro.',
      'Datas e tipos de serviço em português em todo o lado ("Ter, 10 nov", "Novembro 2026", "Voo", "Simulador").',
      'Estatísticas: o gráfico de atividade abre no mês atual (antes abria em janeiro e parecia vazio).',
    ],
  },
  {
    version: '0.8.29.1',
    date: '2026-11-10',
    highlights: [
      '"Hoje" mostra sempre o dia inteiro: simulador, formação, gabinete e assistência também (não só voos), numa linha do tempo com horas locais, mais o serviço, o bloco e o FDP do dia.',
      'O ecrã ganha as cores da fase, como no esboço: azul-noite antes do serviço, claro em serviço, verde-noite na estadia e areia na folga (com versão escura).',
    ],
  },
  {
    version: '0.8.29',
    date: '2026-11-10',
    highlights: [
      'Novo ecrã "Hoje", que muda com o teu dia: antes do voo, a contagem até à apresentação e o primeiro voo em cartão de embarque; em serviço, o avião na linha da rota, a chegada e o FDP que resta; na estadia, a cidade, o descanso mínimo a contar e o voo de regresso; na folga, os limites em anéis e os próximos 7 dias.',
      'O topo é o céu à hora local do aeroporto onde estás — madrugada, dia, fim de tarde ou noite, pelo nascer e pôr do sol — e a cor acompanha o destino do dia.',
      'A Lista pode ser vista como um painel de partidas (botão ao lado dos filtros), com HOJE, NOVO, ALTERADO e FOLGA como no aeroporto.',
    ],
  },
  {
    version: '0.8.28',
    date: '2026-11-10',
    highlights: [
      'Vencimento: os subsídios seguem agora o recibo real, ao cêntimo — sobre todos os fixos (com prémio de chefia e complementos); o de férias vale os 42 dias de férias (fixos ÷ 30 × 42); IRS à parte, SS e fundo de pensões de 6,5% / 7,5% sobre o próprio subsídio.',
      'Segurança: a cópia de segurança já não leva a password do CrewLink (fica só no dispositivo); a app passa a ter uma política de segurança de conteúdos (CSP) e o proxy só envia a sessão do CrewLink para o próprio CrewLink.',
      'Arranque mais rápido: o leitor de PDF, o tutorial e a documentação só carregam quando são precisos.',
      '"Hoje" passa a ser sempre o dia local (entre a meia-noite e a 1h de verão algumas vistas ainda mostravam o dia anterior).',
    ],
  },
  {
    version: '0.8.27.1',
    date: '2026-11-09',
    highlights: [
      'Subsídio de Natal no recibo de novembro (é pago com o vencimento do fim de novembro).',
      'Subsídio de férias: automático pela escala (mês antes das primeiras férias de 10 dias úteis ou mais, cl. 7.3), com uma caixa "Subsídio de férias neste recibo" no cartão para confirmar ou corrigir o mês.',
    ],
  },
  {
    version: '0.8.27',
    date: '2026-11-09',
    highlights: [
      'Vencimento: subsídios de férias e de Natal pelo AE (RRRGS cl. 7 e 8), cada um igual a VB + VE + VS. O de Natal aparece no recibo de dezembro; o de férias no mês antes das primeiras férias de 10 dias úteis ou mais (automático pela escala, ou escolhes o mês em Definições → Vencimento).',
      'Nos meses de subsídio, o IRS do subsídio é retido à parte, como manda a lei, e o fundo de pensões também incide sobre ele (14 vezes por ano, cl. 16).',
    ],
  },
  {
    version: '0.8.26.2',
    date: '2026-11-09',
    highlights: [
      'Vencimento: toca em "Per diem" para ver os dias A e B, um a um, e comparar com o recibo.',
      'As sessões de simulador e o line training como instrutor aparecem sempre que estão na escala, com aviso se ainda não tiver o valor nas Definições.',
      'Comandantes: aviso quando a anuidade de Comando e o prémio de chefia não estão separados, porque nesse caso entram na base da quota sindical.',
    ],
  },
  {
    version: '0.8.26.1',
    date: '2026-11-09',
    highlights: [
      'Vencimento: a base da quota sindical passa a ser calculada sozinha — todos os fixos menos o prémio de chefia e a anuidade técnica de Comando (bate ao cêntimo com recibos reais). Para isso, a anuidade de Comando e o prémio de chefia têm agora campo próprio. A base escrita à mão continua possível em "Avançado".',
    ],
  },
  {
    version: '0.8.26',
    date: '2026-11-09',
    highlights: [
      'Pilotos — estimativa de vencimento (experimental, desligada por omissão): liga em Definições → Vencimento e mete os teus valores (VB, VE, VS…), que ficam só neste dispositivo. Mostra o bruto e o líquido do recibo do mês seguinte: base, excedentes de duty/block-pay, per diem, complementar, extensões, descansos reduzidos, sessões de simulador e line training como instrutor, IRS pelas tabelas de 2026, Segurança Social, fundo de pensões e quota sindical. Confirma sempre no recibo oficial.',
      'Pilotos — os limites do AE e o vencimento têm abas próprias na barra de baixo, a seguir a Estatísticas (a do Vencimento aparece quando ligas a estimativa). Todos os cálculos do AE (SIPLA) são só para pilotos; a cabina vê os limites EASA no menu ⋮.',
      'Marcas de instrução (LIFUS, FAM, OPC/LPC como instrutor) aparecem na lista e no detalhe do dia.',
      'Definições arrumadas em abas: Perfil, Vencimento, App, Dados e Ajuda. A app lembra-se da última aba aberta.',
      'Na lista, as etiquetas (Hoje, Novo, Alterado…) ficam todas alinhadas na mesma coluna.',
    ],
  },
  {
    version: '0.8.21',
    date: '2026-10-29',
    highlights: [
      'Planeado vs. realizado (experimental, pilotos): quando sincronizas a escala depois de voar, a app guarda agora as horas planeadas de cada voo antes de as substituir pelas voadas. Em "Limites e AE" há um novo cartão, mês a mês, com os atrasos, o serviço a mais face ao planeado, as extensões por autoridade do comandante (RUPT cl. 27 — 2h de duty-pay, RRRGS cl. 2.6) e os descansos reduzidos (RUPT cl. 34.3/36 — o tempo reduzido em duty-pay, RRRGS cl. 2.8). Serve para confirmar o recibo do mês seguinte. Os PDFs guardados são relidos uma vez para reconstruir o histórico.',
      'No detalhe do dia, um voo que não correu como planeado mostra a hora planeada e o atraso na chegada.',
      'Atalhos da app: mantém o ícone carregado (Android) para abrir diretamente Hoje, Calendário, Limites e AE ou Diário de voo. Só na app instalada — pode ser preciso reinstalar o ícone.',
    ],
  },
  {
    version: '0.8.20',
    date: '2026-10-29',
    highlights: [
      'Documentos a expirar aparecem na lista: quando um documento (medical, licença, OPC…) expira nos próximos 60 dias ou já expirou, surge uma linha por cima do resumo dos limites — vermelha a 30 dias ou menos, amarela antes disso. Um toque abre os Documentos. Sem nada a expirar, a linha não aparece.',
      'Nas Estatísticas, novo gráfico "Evolução mensal": horas de bloco ou de serviço por mês nos últimos 12 meses. Toca numa coluna para ver o valor. O serviço é contado como nos limites e só aparece nos meses com escala guardada; o mês corrente inclui o planeado.',
    ],
  },
  {
    version: '0.8.19.2',
    date: '2026-10-29',
    highlights: [
      'O aviso do descanso semanal diz agora quando o descanso começou e qual era o limite — por exemplo, "o descanso só começa 30/10 às 16:00 (limite: 30/10 às 14:00)".',
      'Os avisos de folgas que envolvam serviço externo (S.EXT.) ou formação lembram que, se for curso de qualificação ou de comando, as regras de folga não se aplicam (RUPT cl. 7.1). O descanso semanal aplica-se sempre, também em cursos.',
    ],
  },
  {
    version: '0.8.19.1',
    date: '2026-10-29',
    highlights: [
      'A lista fica mais leve: os limites, a conformidade com o AE e o contador de férias passam para uma página própria, "Limites e AE". Na lista fica só uma linha de resumo — o valor mais perto do limite e quantos pontos do AE há a verificar, a cor de acordo — que abre essa página com um toque. Também está no menu ⋮.',
    ],
  },
  {
    version: '0.8.19',
    date: '2026-10-29',
    highlights: [
      'Novo painel "Conformidade AE" (pilotos), na lista, por baixo dos limites: verifica a escala a partir deste mês contra o RUPT — folgas no mês (mínimo 10), intervalo máximo de 6 dias entre períodos de folga, folgas de 72h/96h nos meses com 10, um sábado e domingo de folga a cada 6 semanas, descanso semanal de 36h com duas noites, e Early Start / Late Finish / Night Duty (no máximo 2 seguidos e 3 entre folgas). Os problemas aparecem primeiro, com as datas.',
      'No detalhe do dia, um chip indica quando o serviço é Early Start, Late Finish ou Night Duty.',
      'Nas Estatísticas, o contador de férias do ano: dias de PLIC / SLIC / RLIC na escala contra os 42 do AE, e as F (em atraso) à parte.',
      'Toda a análise do Acordo de Empresa — limites, FDP, descanso e conformidade — está marcada como experimental: pode conter erros, confirma sempre na escala oficial e no AE.',
    ],
  },
  {
    version: '0.8.18.4',
    date: '2026-10-17',
    highlights: [
      'No detalhe do dia, o início e o fim das sessões em terra (formação, simulador, gabinete, serviço externo, médicas) passam a aparecer em hora local, com a hora UTC entre parênteses por baixo — como já acontece nos voos.',
    ],
  },
  {
    version: '0.8.18.3',
    date: '2026-10-17',
    highlights: [
      'O código S.EXT. (serviço externo) passa a ser reconhecido. Até aqui esses dias desapareciam da escala; agora aparecem com a hora de início e de fim e contam para os limites de serviço.',
      'Os dias de gabinete (GAB1 / GAB2) passam a guardar também a hora de fim, e por isso passam a contar para os limites de serviço — antes ficavam de fora. As escalas já importadas são corrigidas sozinhas ao abrir a app.',
    ],
  },
  {
    version: '0.8.18.2',
    date: '2026-10-16',
    highlights: [
      'Nos dias só em terra (formação, simulador, gabinete, médicas), o tempo de serviço passa a somar as sessões e deixa de contar o intervalo entre elas — por exemplo, o almoço entre FP1 e FP2. Os dias com voo mantêm a contagem da apresentação ao fim do serviço.',
      'As barras dos limites só ficam vermelhas quando o limite é ultrapassado; a laranja a partir de 90%, a verde abaixo disso.',
    ],
  },
  {
    version: '0.8.18.1',
    date: '2026-10-16',
    highlights: [
      'Nova opção nas Definições: Base (Lisboa ou Porto). O descanso mínimo, a regra do FDP para apresentações fora da base e as noites fora nas estatísticas passam a contar a partir da tua base.',
      'Legenda de códigos corrigida: PLIC, SLIC e RLIC são férias (dias de calendário) e F são férias em atraso (dias úteis) — o RLIC aparecia, por engano, como licença de casamento. As assistências H são dos pilotos, as A da cabina, e o R24 é a reserva de 24 horas.',
    ],
  },
  {
    version: '0.8.18',
    date: '2026-10-16',
    highlights: [
      'Para pilotos, o painel de limites passa a usar o Acordo de Empresa SIPLA (RUPT), mais apertado do que a EASA: tempo de voo 90h em 4 semanas, 270h por trimestre e 850h por ano, com o simulador a contar; tempo de trabalho 50h em 7 dias, 180h em 28, 480h por trimestre e 1800h por ano. A tripulação de cabine mantém os limites EASA.',
      'O tempo de serviço passa a contar como o AE manda: até 30 min depois dos calços do último setor; assistência em casa a 25% (com a duração de cada código H, segundo a DOV), no aeroporto a 50%, e a reserva de 24h não conta. Antes, as assistências em casa ficavam de fora da contagem.',
      'Novo no detalhe do dia: o FDP planeado contra o máximo da tabela do AE (hora de apresentação em Lisboa × setores), incluindo a regra das apresentações fora da base entre as 22:00 e as 06:00. Fica a laranja a menos de 30 min do limite e a vermelho se o ultrapassar.',
      'O descanso mínimo segue o AE: 12h na base e 10h fora, ou a duração do serviço anterior se for maior, mais 2h quando esse serviço tocou as 02:00–05:59 de Lisboa. Quando falta descanso, o chip mostra também o mínimo devido.',
    ],
  },
  {
    version: '0.8.17.1',
    date: '2026-10-12',
    highlights: [
      'Corrigido: no último dia do período da escala podia aparecer um "OFF" que não existe (ex. 31/10 com OFF + RLIC, quando a escala só tem RLIC). O parser estava a ler a caixa de totais impressa ao lado desse dia — "Off days", "Duty time"… — como se fosse um serviço. As escalas já importadas são corrigidas automaticamente ao abrir a app.',
      'Zoom com dois dedos no PDF muito mais estável: o ponto entre os dedos fica agora debaixo deles durante todo o gesto, e as páginas já não piscam em branco quando são redesenhadas com mais nitidez.',
    ],
  },
  {
    version: '0.8.17',
    date: '2026-10-12',
    highlights: [
      'O mapa de voos ganha uma vista em globo: no topo do mapa escolhe "Plano" ou "Globo". No globo, arrasta para o rodar, usa + / − para aproximar e o botão de centrar para voltar à tua rede. As rotas seguem a ortodrómica (o caminho mais curto sobre a Terra). A vista plana continua a ser a predefinida e a app lembra-se da tua escolha.',
    ],
  },
  {
    version: '0.8.16',
    date: '2026-09-20',
    highlights: [
      'O painel de limites passa a mostrar também o TEMPO DE SERVIÇO (ORO.FTL.210): 60h em 7 dias, 110h em 14 e 190h em 28. Como já acontecia no tempo de voo, cada barra é a PIOR janela de dias consecutivos da escala — incluindo dias ainda por voar —, por isso avisa antes de se chegar ao limite e não depois. O serviço conta da apresentação à última chegada; um dia só de reserva em casa conta a 25%.',
      'Corrigido o cálculo do descanso entre serviços quando um voo termina depois da meia-noite: a hora de chegada (ex. 01:30) era lida como anterior à apresentação e o descanso aparecia maior do que era na realidade — até mais 3h30 num caso típico.',
    ],
  },
  {
    version: '0.8.15.6',
    date: '2026-09-09',
    highlights: [
      'No detalhe do voo, as horas de partida e chegada (STD/STA) passam a aparecer primeiro em hora local (LT), com a hora UTC entre parênteses por baixo. Antes era ao contrário.',
    ],
  },
  {
    version: '0.8.15.5',
    date: '2026-09-09',
    highlights: [
      'A apresentação (check-in) passa a ser mostrada só em hora local (LT) — no banner do próximo serviço, na lista, no detalhe do dia e também nos eventos exportados para o calendário (ICS / Google Calendar), incluindo o lembrete. Antes vinha em UTC com a local entre parênteses. As horas dos voos continuam em UTC (z) com a local por baixo.',
    ],
  },
  {
    version: '0.8.15.4',
    date: '2026-08-31',
    highlights: [
      'Novos códigos de simulador de Lisboa reconhecidos: LIS-EBT-1, LIS-EBT-2 (sessões EBT dia 1/2) e LIS-OTHER. Antes apareciam como “E90 · Other”, com a hora de início tomada por check-in. Passam a surgir como Simulador, com início/fim e a tripulação da sessão. As escalas já importadas reprocessam sozinhas.',
    ],
  },
  {
    version: '0.8.15.3',
    date: '2026-08-22',
    highlights: [
      'Sincronizar a escala deixa de avisar “dias mudaram” por causa de voos já realizados. Como o download abrange também a semana anterior (para o Diário receber as horas reais), esses acertos apareciam como alterações — agora só contam as mudanças de hoje em diante.',
    ],
  },
  {
    version: '0.8.15.2',
    date: '2026-08-22',
    highlights: [
      '“Onde está a aeronave” deixa de ser invisível: nos voos de hoje ainda por partir o painel aparece sempre, no detalhe do voo. Quando não há posição, diz porquê — matrícula ainda desconhecida, ou aeronave não captada neste momento — com um botão para atualizar. Antes desaparecia em silêncio e ninguém o encontrava.',
    ],
  },
  {
    version: '0.8.15.1',
    date: '2026-08-21',
    highlights: [
      'Correção: no telemóvel o nome “CrewRoster” aparecia cortado (“CrewRos…”) — havia ícones a mais na barra. A legenda de códigos e o terminar sessão passaram para um menu “⋮”, e o nome volta a aparecer completo.',
    ],
  },
  {
    version: '0.8.15',
    date: '2026-08-17',
    highlights: [
      'Sincronizar a escala passa a atualizar os voos já realizados: o download começa por omissão 7 dias atrás, por isso os setores voados recentemente recebem as horas finais e o Diário fica com elas (podes sempre mudar a data de início).',
      'Marcar quem foi PF (descolagem/aterragem) deixa de congelar o setor — as horas continuam a ser atualizadas pela escala. Só alterar os dados do voo à mão é que o protege de futuras sincronizações.',
    ],
  },
  {
    version: '0.8.14.4',
    date: '2026-08-16',
    highlights: [
      'Correção: os dias de inspeção/exames médicos desapareciam da escala — os códigos IM, VIM e MED não eram reconhecidos. Passam a aparecer como “Médico”, com o local e as horas de cada marcação. As escalas já importadas reprocessam sozinhas.',
    ],
  },
  {
    version: '0.8.14.3',
    date: '2026-08-04',
    highlights: [
      'Caderneta EASA: os simuladores passam a aparecer como linhas na própria tabela dos voos, por ordem cronológica (marcados como “Simulador”), em vez de numa tabela à parte. O tempo de simulador não conta para os totais de voo — é somado à parte (“FSTD”).',
    ],
  },
  {
    version: '0.8.14.2',
    date: '2026-07-18',
    highlights: [
      'Caderneta EASA: a coluna “Nome PIC” passa a mostrar o Comandante do voo — o teu nome quando voas como Comandante, ou o nome do Comandante quando voas como Oficial Piloto (obtido da lista de tripulação). Antes mostrava sempre “SELF”.',
    ],
  },
  {
    version: '0.8.14.1',
    date: '2026-07-18',
    highlights: [
      'Correção: em alguns voos a tripulação não aparecia porque um pedaço de nome (3 letras, ex.: “RUI”) era lido como o aeroporto de chegada. O destino do voo passa a ser lido corretamente e a tripulação volta a aparecer. As escalas já importadas atualizam-se sozinhas.',
    ],
  },
  {
    version: '0.8.14',
    date: '2026-07-17',
    highlights: [
      'Leitura da escala mais robusta: a margem de leitura de cada dia ajusta-se sozinha ao número de voos, evitando de vez que um voo desapareça em dias com vários voos.',
      'Rede de segurança: a app compara cada dia com o resumo “Individual duty plan” do próprio PDF e assinala (⚠ verificar) se parecer faltar um voo, em vez de o mostrar em falta em silêncio.',
    ],
  },
  {
    version: '0.8.13.2',
    date: '2026-07-17',
    highlights: [
      'Correção: um voo do último dia de um bloco da escala podia desaparecer quando o dia tinha 3+ voos (ex.: LIS-OPO-LIS e depois LIS-SVQ a 30 Jul). O leitor do PDF passa a ler todos os voos desse dia. As escalas já importadas reprocessam sozinhas.',
    ],
  },
  {
    version: '0.8.13.1',
    date: '2026-07-10',
    highlights: [
      'Caderneta EASA imprimível: passa a ter as colunas de Descolagens e Aterragens (dia/noite), contando só as que voaste como PF, com subtotais por página e totais acumulados.',
    ],
  },
  {
    version: '0.8.13',
    date: '2026-07-05',
    highlights: [
      'Diário de bordo: em cada setor podes definir quem fez a descolagem e a aterragem (Eu / Colega) ao editar. A app calcula sozinha se cada uma foi de dia ou de noite (nascer/pôr do sol) e mostra-o na linha do voo.',
      'Totais como PF: descolagens e aterragens, dia e noite, contando só as que voaste. O export CSV passa a incluir descolagem dia/noite além da aterragem.',
    ],
  },
  {
    version: '0.8.12.2',
    date: '2026-07-05',
    highlights: [
      'Mapa da aeronave: mostra agora a ETA estimada até ao teu aeroporto (quando vem a caminho) e se está a subir, em cruzeiro ou a descer.',
    ],
  },
  {
    version: '0.8.12.1',
    date: '2026-07-05',
    highlights: [
      'Mapa da aeronave: passa a mostrar também quando a aeronave já aterrou (no solo), e destaca quando já está no teu aeroporto de partida.',
    ],
  },
  {
    version: '0.8.12',
    date: '2026-07-04',
    highlights: [
      'Onde está a aeronave: no dia do voo e antes de partires, o detalhe do voo mostra num mini-mapa a posição ao vivo da aeronave que vais voar, enquanto ela ainda está no ar (rumo, nível de voo, velocidade e distância ao teu aeroporto). Usa dados ADS-B abertos; só aparece quando a aeronave está a ser captada.',
    ],
  },
  {
    version: '0.8.11.5',
    date: '2026-07-04',
    highlights: [
      'Caderneta EASA no telemóvel: a tabela deixa de cortar as células — mostra-se à largura toda com deslize horizontal e texto maior. Ao imprimir/guardar em PDF continua a caber na folha A4.',
    ],
  },
  {
    version: '0.8.11.4',
    date: '2026-07-03',
    highlights: [
      'Diário de bordo: cabeçalho mais limpo — o título deixa de se partir em várias linhas e as ações (Adicionar / CSV / EASA) ficam alinhadas por baixo.',
    ],
  },
  {
    version: '0.8.11.3',
    date: '2026-07-03',
    highlights: [
      'Tripulação do simulador agora reconhecida corretamente (a secção “Crew Information on Ground Activity” é lida como grelha transposta, tal como a dos voos). As escalas já importadas reprocessam sozinhas.',
    ],
  },
  {
    version: '0.8.11.2',
    date: '2026-07-03',
    highlights: [
      'Sessão de simulador mostra agora o Início/Fim (UTC) e o local, além do check-in, e a tripulação escalada. As escalas já importadas reprocessam sozinhas.',
    ],
  },
  {
    version: '0.8.11.1',
    date: '2026-07-03',
    highlights: [
      'Correção: a tripulação escalada para o simulador passa a aparecer mesmo quando a sessão só traz o check-in (sem horas de início/fim).',
    ],
  },
  {
    version: '0.8.11',
    date: '2026-07-03',
    highlights: [
      'Tripulação escalada para o simulador: ao abrir um dia com sessão de Simulador/Formação, vês a tripulação do evento (com quem estás escalado), com função e toque para ver os voos partilhados. As escalas já importadas reprocessam sozinhas.',
      'Caderneta EASA: nova secção FSTD (dispositivos de treino de simulação) na folha imprimível, com data, tipo de FSTD, duração e total.',
    ],
  },
  {
    version: '0.8.10',
    date: '2026-06-28',
    highlights: [
      'Caderneta de voo EASA imprimível: no Diário, botão “EASA” → folha formatada (uma linha por setor, com subtotais por página e totais acumulados) → Imprimir / Guardar como PDF.',
      'Define a tua função (Comandante / Oficial Piloto) em Definições → Caderneta de voo (EASA); o tempo de bloco vai para essa coluna.',
    ],
  },
  {
    version: '0.8.9.6',
    date: '2026-06-27',
    highlights: [
      'Stand do FLIC: passa a indicar se é a Chegada ou a Partida (e o aeroporto), além do número — antes ficava ambíguo.',
    ],
  },
  {
    version: '0.8.9.5',
    date: '2026-06-27',
    highlights: [
      'Estatísticas, Mapa e Documentos passam a aparecer logo após importar a escala, sem ser preciso abrir o Diário primeiro.',
      'Reconhecido o código FAL(PD) (Falta com motivo): o dia deixa de ser ignorado e aparece como Falta. As escalas já importadas reprocessam sozinhas.',
      'Heatmap de atividade: passa a mostrar também as Faltas, a vermelho.',
    ],
  },
  {
    version: '0.8.9.4',
    date: '2026-06-27',
    highlights: [
      'Heatmap de atividade: além dos voos, mostra os dias de Simulador (laranja), Formação (teal) e Gabinete (roxo), cada um com a sua cor. O tipo de cada dia aparece ao tocar.',
    ],
  },
  {
    version: '0.8.9.3',
    date: '2026-06-27',
    highlights: [
      'Login automático ao CrewLink mais fiável: passa a funcionar mesmo quando a password é preenchida por um gestor de passwords (ex.: Bitwarden). Antes podia ficar por guardar e o formulário aparecia na mesma.',
      'Mensagem mais clara quando as portas/matrícula não aparecem: indica que vêm do AeroDataBox e que a chave é por dispositivo (Definições).',
    ],
  },
  {
    version: '0.8.9.2',
    date: '2026-06-27',
    highlights: [
      'Turbulência da rota recalibrada: deixa de marcar “elevada” numa travessia normal de jato (estava demasiado sensível). Os níveis ficam alinhados com os produtos de EDR, como a carta de turbulência (CAT) do Windy ao lado.',
    ],
  },
  {
    version: '0.8.9.1',
    date: '2026-06-27',
    highlights: [
      'Correção: um voo que ainda não partiu deixa de mostrar estados impossíveis (ex.: “Arrived”), e a matrícula/portas deixam de vir de uma operação de outro dia do mesmo voo. Sem dados disponíveis, fica uma indicação clara em vez de campos vazios.',
    ],
  },
  {
    version: '0.8.9',
    date: '2026-06-26',
    highlights: [
      'Matrícula da aeronave pelo FLIC no próprio dia do voo (LIS/OPO): mais atual (reflete trocas de última hora), funciona sem chave e fica registada no diário de bordo.',
      'Heatmap de atividade mais legível: meses e dias da semana identificados, grelha visível e toca num dia para veres a data e o bloco.',
    ],
  },
  {
    version: '0.8.8',
    date: '2026-06-25',
    highlights: [
      'Stand ao vivo (FLIC TAP): nos voos de/para Lisboa e Porto, o stand real aparece no banner no próprio dia.',
      'METAR/TAF descodificado na Meteo da rota, com categoria de voo (VFR/MVFR/IFR/LIFR) a cores.',
      'Nascer/pôr do sol e tempo noturno por setor, com barra dia/noite no banner do voo.',
      'Diário de bordo: tempo noturno por setor e exportação CSV no estilo EASA (IFR, noite, aterragens dia/noite).',
      '“Com quem voo”: toca num tripulante para ver todos os voos partilhados com esse colega.',
      'Pesquisa global (lupa no topo): voos, aeroportos, rotas, colegas, tipo de serviço e datas.',
      'Estatísticas: mapa de atividade anual (heatmap). Calendário: partilhar o mês como imagem.',
      'Login automático ao CrewLink quando há credenciais guardadas, com confirmação ao guardar/remover.',
      '⚠️ A tripulação por voo continua EM TESTES — confirma sempre na escala oficial do CrewLink (separador “PDFs”).',
    ],
  },
  {
    version: '0.8.7',
    date: '2026-06-25',
    highlights: [
      'Turbulência mais precisa: estimada em vários pontos da rota com o índice de Ellrod (shear + deformação), além do CAPE.',
      'Meteo da rota: o mapa passa a mostrar a camada de turbulência (CAT) ao nível de cruzeiro.',
      'O aviso de versão beta aparece sempre até marcares “Tomei conhecimento. Não voltar a mostrar o aviso.”.',
    ],
  },
  {
    version: '0.8.6',
    date: '2026-06-24',
    highlights: [
      'Tripulação por voo mais completa: Comandantes e Chefe de Cabine corretos, e os voos de regresso (mesmo no dia seguinte) já mostram a tripulação.',
      'A tua própria entrada deixa de aparecer na lista de tripulação.',
      'Definições → Acesso ao CrewLink: guarda o código de tripulante e password para preencherem automaticamente o download da escala.',
      'Mapa: base de dados mundial de aeroportos — qualquer destino passa a ser desenhado.',
      'Ao abrir, a escala é reprocessada automaticamente com as últimas melhorias, sem voltares a descarregar.',
      'Aviso de versão beta ao abrir e sempre em Definições → Sobre: em caso de dúvida, confirma na escala oficial (separador “PDFs”).',
    ],
  },
  {
    version: '0.8.5.2',
    date: '2026-06-24',
    highlights: [
      'Ao abrir um dia, a página começa no topo (primeiro voo) em vez de saltar para o fim.',
    ],
  },
  {
    version: '0.8.5.1',
    date: '2026-06-24',
    highlights: [
      'A tripulação aparece automaticamente nas escalas já importadas — sem teres de voltar a importar quando o reconhecimento melhora.',
    ],
  },
  {
    version: '0.8.5',
    date: '2026-06-24',
    highlights: [
      'Tripulação por voo: cada voo mostra a tripulação escalada no banner (ícone 👥). ⚠️ EM TESTES — confirma sempre na escala oficial do CrewLink.',
      'Correção: o banner do voo já é legível no modo escuro.',
    ],
  },
  {
    version: '0.8.4',
    date: '2026-06-23',
    highlights: [
      'Tutorial guiado: balões mostram como descarregar a escala na 1.ª utilização.',
      'Repete o tutorial em Definições → “Ver tutorial”.',
    ],
  },
  {
    version: '0.8.3.8',
    date: '2026-06-23',
    highlights: [
      'O diário de bordo lembra-se de que meses estão recolhidos ou expandidos.',
    ],
  },
  {
    version: '0.8.3.7',
    date: '2026-06-23',
    highlights: [
      'Diário de bordo: meses podem ser recolhidos/expandidos.',
      'Definições: nota de que a chave AeroDataBox é pessoal e gratuita.',
    ],
  },
  {
    version: '0.8.3.6',
    date: '2026-06-23',
    highlights: [
      'Diário de bordo agrupado por mês, com total de setores e bloco por mês.',
    ],
  },
  {
    version: '0.8.3.5',
    date: '2026-06-23',
    highlights: [
      'Botão para remover a chave AeroDataBox movido para junto do campo.',
    ],
  },
  {
    version: '0.8.3.4',
    date: '2026-06-23',
    highlights: [
      'Arranque mais rápido (a app carrega por partes) e melhorias de qualidade internas.',
    ],
  },
  {
    version: '0.8.3.3',
    date: '2026-06-23',
    highlights: [
      'Cálculos de voo mais corretos: recência, fusos horários do calendário e tempos de voo.',
    ],
  },
  {
    version: '0.8.3.2',
    date: '2026-06-23',
    highlights: [
      'Maior robustez: importação de cópias de segurança validada e apagar perfil mais seguro.',
    ],
  },
  {
    version: '0.8.3.1',
    date: '2026-06-23',
    highlights: [
      'Novo ícone com fundo transparente.',
    ],
  },
  {
    version: '0.8.3',
    date: '2026-06-23',
    highlights: [
      'Cópia de segurança: exporta tudo para um ficheiro e importa após reinstalar.',
    ],
  },
  {
    version: '0.8.2.3',
    date: '2026-06-23',
    highlights: [
      'Correção da instalação no ecrã principal (ícones maskable e manifest).',
    ],
  },
  {
    version: '0.8.2.2',
    date: '2026-06-23',
    highlights: [
      'Novo ícone da aplicação.',
    ],
  },
  {
    version: '0.8.2.1',
    date: '2026-06-23',
    highlights: [
      'Secção "Sobre" nas Definições com informação do criador.',
    ],
  },
  {
    version: '0.8.2',
    date: '2026-06-23',
    highlights: [
      'Notificações CrewLink: vê as alterações (antes → depois) antes de confirmar.',
      'Diário de bordo permanente e editável (mantém-se ao limpar a escala).',
      'Mapa de voos, Estatísticas e Documentos & recência.',
      'Alertas de check-in no .ics e no Google Calendar.',
      'Modo escuro.',
      'Aviso de novidades sempre que a app é atualizada.',
    ],
  },
];

// True when version a is strictly newer than b (numeric, dotted).
export function versionGreater(a: string, b: string): boolean {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

// Release notes newer than the given version (what the user hasn't seen yet).
export function notesSince(version: string | null): ReleaseNote[] {
  if (!version) return [];
  return RELEASE_NOTES.filter((n) => versionGreater(n.version, version));
}
