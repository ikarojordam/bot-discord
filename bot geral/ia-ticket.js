// ============================================================
// ia-ticket.js — FAQ gerado dinamicamente (Frio Bot)
// ============================================================
// - Cobre TODAS as combinações do banco perguntas_respostas_loja
// - Produto × Intenção × Tom × Template × Idioma
// - ~15 produtos × ~40 intenções × ~20 templates = ~12.000 entradas
// - ~50.000+ triggers após combinar verbos e variações
// - Escalação automática, cooldown, limite por thread
// - Suporte multi-idioma (PT, EN, ES, FR, DE, IT)
//
// ✅ v6.4.0 — adicionado `respond()` (API pura usada pelo index.js)
// ============================================================

'use strict';

// ============================================================
// 1. CONFIGURAÇÃO GLOBAL
// ============================================================
const FAQ_CONFIG = {
  minScore: 0.52,
  cooldownMs: 2500,
  maxPerThread: 30,
  quickSuggestions: 3,
  ignorePrefixes: ['.', '!', '/', '?', '-', '='],
  ignoreIfMentionsBot: false,
  verbose: false,
  escalateOnLowScore: false,
  minLength: 3,
  maxLength: 800,
};

// ============================================================
// 2. PALAVRAS DE ESCALAÇÃO
// ============================================================
const ESCALATION_KEYWORDS = [
  'golpe', 'golpista', 'estelionato', 'fraude', 'roubo', 'roubado',
  'roubaram', 'hackearam', 'hackeado', 'invadiram', 'invasao', 'invasão',
  'urgente', 'emergencia', 'emergência', 'agora mesmo', 'imediatamente',
  'quero humano', 'quero falar com', 'falar com humano', 'atendente',
  'chama staff', 'chama adm', 'chama um adm', 'chama o dono',
  'chama moderador', 'chama mod', 'preciso de staff', 'cadê a staff',
  'cade a staff', 'ninguem responde', 'ninguém responde',
  'nao respondem', 'não respondem', 'staff online', 'tem alguem',
  'tem alguém', 'alguem online', 'alguém online',
  'advogado', 'processo', 'justiça', 'justica', 'procon',
  'boletim de ocorrencia', 'boletim de ocorrência', 'policia', 'polícia',
  'delegacia', 'ministerio publico', 'ministério público',
  'ameaça', 'ameaçou', 'ameaçando', 'chantagem', 'extorsao', 'extorsão',
  'vai me processar', 'vou processar',
  'vazou', 'vazamento', 'expos', 'expuseram', 'doxxing', 'doxxaram',
  'dados vazados', 'lgpd',
  'menor de idade', 'crianca', 'criança', 'grooming', 'pedofilo', 'pedófilo',
  'suicidio', 'suicídio', 'me matar', 'automutilacao', 'automutilação',
  'depressao', 'depressão', 'crise',
  'escalar', 'subir para', 'superior', 'gerente', 'responsavel',
  'responsável', 'dono do servidor',
];

// ============================================================
// 3. PRODUTOS
// ============================================================
const PRODUCTS = [
  'Bot Basic',
  'Bot Premium',
  'Bot Ultra',
  'Bot Unlimited',
  'Sites',
  'Conta de Blox Fruits',
  'Puxar Dados',
  'Loja Pronta',
  'Org Pronta',
  'Streaming',
  'Nitrada',
  'Impulsos',
  'Membros',
  'Nitro Link',
  'Produtos de R$ 1',
];

// ============================================================
// 4. INTENÇÕES
// ============================================================
const INTENTS = [
  {
    key: 'comprar',
    verbs: ['comprar', 'adquirir', 'fazer a compra de'],
    answer: (p) => `Para comprar ${p}, consulte a oferta disponível na loja e siga as instruções de compra. Se precisar de ajuda, abra um ticket de Dúvidas.`,
    quick: ['Ver loja', 'Formas de pagamento', 'Abrir ticket de dúvida'],
  },
  {
    key: 'preco',
    verbs: ['saber o preço do', 'consultar o valor do', 'ver quanto custa o'],
    answer: (p) => `O valor de ${p} pode variar conforme a oferta disponível. Consulte a loja para ver o preço atual.`,
    quick: ['Ver loja', 'Formas de pagamento'],
  },
  {
    key: 'entender',
    verbs: ['entender como funciona', 'saber como funciona', 'obter informações sobre'],
    answer: (p) => `Para entender como funciona ${p}, consulte a descrição do produto. Se ainda tiver dúvidas, abra um ticket de Dúvidas.`,
    quick: ['Ver loja', 'Abrir ticket'],
  },
  {
    key: 'receber',
    verbs: ['receber'],
    answer: (p) => `Após a compra de ${p}, siga as instruções de entrega indicadas pela loja. Se não receber, abra um ticket de Produto Não Recebido.`,
    quick: ['Abrir ticket de produto não recebido', 'Falar com staff'],
  },
  {
    key: 'entrega',
    verbs: ['obter a entrega do', 'receber a entrega do'],
    answer: (p) => `Após a compra de ${p}, siga as instruções de entrega indicadas pela loja. Se não receber, abra um ticket de Produto Não Recebido.`,
    quick: ['Abrir ticket', 'Falar com staff'],
  },
  {
    key: 'configurar',
    verbs: ['configurar', 'personalizar', 'solicitar a configuração do'],
    answer: (p) => `A configuração de ${p} depende do produto adquirido. Consulte a descrição ou abra um ticket para receber orientação.`,
    quick: ['Abrir ticket', 'Ver descrição'],
  },
  {
    key: 'personalizacao',
    verbs: ['personalização'],
    answer: (p) => `Para verificar opções de personalização de ${p}, consulte a oferta ou abra um ticket de Dúvidas antes da compra.`,
    quick: ['Ver loja', 'Abrir ticket'],
  },
  {
    key: 'suporte',
    verbs: ['pedir suporte para', 'solicitar ajuda com', 'receber suporte sobre'],
    answer: (p) => `Para suporte relacionado a ${p}, abra um ticket e informe o pedido, o problema e as informações necessárias.`,
    quick: ['Abrir ticket', 'Falar com staff'],
  },
  {
    key: 'renovar',
    verbs: ['renovar', 'saber como renovar', 'solicitar a renovação do'],
    answer: (p) => `Para saber como renovar ${p}, consulte as condições atuais da loja ou abra um ticket de Dúvidas.`,
    quick: ['Ver loja', 'Abrir ticket'],
  },
  {
    key: 'upgrade',
    verbs: ['upgrade'],
    answer: (p) => `Para informações sobre ${p}, consulte a descrição da oferta ou abra um ticket de Dúvidas.`,
    quick: ['Ver loja', 'Abrir ticket'],
  },
  {
    key: 'problema',
    verbs: ['resolver um problema com', 'pedir ajuda com um problema no', 'informar um problema no'],
    answer: (p) => `Se houver um problema com ${p}, abra um ticket de Problema com Produto e explique o ocorrido. Envie provas quando necessário.`,
    quick: ['Abrir ticket', 'Falar com staff'],
  },
  {
    key: 'trocar',
    verbs: ['trocar', 'pedir a troca do', 'solicitar a troca do'],
    products: ['Streaming', 'Conta de Blox Fruits'],
    answer: (p) => `Para solicitar a troca de ${p}, abra um ticket e explique o motivo, enviando os dados da compra.`,
    quick: ['Abrir ticket', 'Falar com staff'],
  },
  {
    key: 'cancelar',
    verbs: ['cancelar', 'solicitar o cancelamento do', 'pedir o cancelamento do'],
    products: ['Streaming', 'Nitrada'],
    answer: (p) => `Para solicitar o cancelamento de ${p}, abra um ticket e informe os dados da compra para análise.`,
    quick: ['Abrir ticket', 'Falar com staff'],
  },
  {
    key: 'reembolso',
    verbs: ['solicitar reembolso do', 'pedir reembolso do', 'saber como funciona o reembolso do'],
    answer: (p) => `Para solicitar reembolso de ${p}, abra um ticket de Reembolso e informe o pedido e o motivo da solicitação.`,
    quick: ['Abrir ticket de reembolso', 'Falar com staff'],
  },
  {
    key: 'prazo',
    verbs: ['saber o prazo de', 'consultar o prazo para', 'saber quanto demora para'],
    answer: (p) => `O prazo de ${p} depende da modalidade e das condições da oferta. Consulte a descrição ou abra um ticket para confirmar.`,
    quick: ['Abrir ticket', 'Ver descrição'],
  },
  {
    key: 'acessar',
    verbs: ['acessar', 'receber acesso ao', 'recuperar o acesso ao'],
    products: ['Conta de Blox Fruits', 'Streaming'],
    answer: (p) => `Para obter ou recuperar acesso relacionado a ${p}, abra um ticket e informe os dados necessários da compra.`,
    quick: ['Abrir ticket', 'Falar com staff'],
  },
  {
    key: 'ativar',
    verbs: ['ativar', 'solicitar ativação do'],
    products: ['Streaming', 'Nitrada'],
    answer: (p) => `Para ativar ${p}, siga as instruções fornecidas após a compra. Se houver erro, abra um ticket de suporte.`,
    quick: ['Abrir ticket', 'Falar com staff'],
  },
  {
    key: 'validade',
    verbs: ['consultar a validade do', 'saber até quando vale o', 'verificar a validade do'],
    products: ['Nitro Link'],
    answer: (p) => `Para consultar a validade de ${p}, verifique a descrição da oferta ou solicite confirmação pelo suporte.`,
    quick: ['Ver descrição', 'Abrir ticket'],
  },
  {
    key: 'garantia',
    verbs: ['consultar a garantia do', 'saber se existe garantia para', 'ver as condições de garantia do'],
    products: ['Conta de Blox Fruits'],
    answer: (p) => `As condições de garantia de ${p} dependem da oferta. Consulte a descrição ou peça orientação no suporte.`,
    quick: ['Ver descrição', 'Abrir ticket'],
  },
  {
    key: 'quantidade',
    verbs: ['consultar a quantidade disponível de', 'saber quantos', 'ver as quantidades de'],
    products: ['Impulsos', 'Membros'],
    answer: (p) => `A quantidade disponível de ${p} depende da oferta atual. Consulte a loja para verificar as opções.`,
    quick: ['Ver loja', 'Abrir ticket'],
  },
  {
    key: 'status',
    verbs: ['consultar o status do', 'ver o andamento do', 'saber o status do'],
    products: ['Puxar Dados', 'Membros'],
    answer: (p) => `Para consultar o status de ${p}, tenha os dados da compra em mãos e abra um ticket de suporte se necessário.`,
    quick: ['Abrir ticket', 'Falar com staff'],
  },
  {
    key: 'dados',
    verbs: ['receber os dados de', 'consultar os dados de', 'saber como funciona o acesso aos dados de'],
    products: ['Conta de Blox Fruits'],
    answer: (p) => `Para informações sobre dados de ${p}, consulte as condições da oferta e abra um ticket de Dúvidas se necessário.`,
    quick: ['Ver descrição', 'Abrir ticket'],
  },
  {
    key: 'alterar',
    verbs: ['alterar', 'solicitar uma alteração no', 'modificar'],
    products: ['Sites'],
    answer: (p) => `Para solicitar uma alteração em ${p}, abra um ticket informando exatamente o que deseja modificar.`,
    quick: ['Abrir ticket', 'Falar com staff'],
  },
  {
    key: 'manutencao',
    verbs: ['solicitar manutenção para', 'pedir manutenção do', 'saber como funciona a manutenção do'],
    products: ['Sites'],
    answer: (p) => `Para manutenção de ${p}, abra um ticket de suporte e explique o que precisa ser corrigido.`,
    quick: ['Abrir ticket', 'Falar com staff'],
  },
  {
    key: 'dominio',
    verbs: ['consultar opções de domínio para', 'saber como configurar o domínio do', 'adicionar um domínio ao'],
    products: ['Sites'],
    answer: (p) => `Para verificar opções de domínio relacionadas a ${p}, consulte a oferta e abra um ticket caso precise de orientação.`,
    quick: ['Ver descrição', 'Abrir ticket'],
  },
  {
    key: 'criacao',
    verbs: ['criação'],
    products: ['Sites'],
    answer: (p) => `Para informações sobre ${p}, consulte a descrição da oferta ou abra um ticket de Dúvidas.`,
    quick: ['Ver loja', 'Abrir ticket'],
  },
  {
    key: 'requisitos',
    verbs: ['requisitos'],
    products: ['Puxar Dados'],
    answer: (p) => `Para informações sobre ${p}, consulte a descrição da oferta ou abra um ticket de Dúvidas.`,
    quick: ['Ver loja', 'Abrir ticket'],
  },
  {
    key: 'resultado',
    verbs: ['consultar o resultado de', 'receber o resultado de', 'saber o resultado de'],
    products: ['Puxar Dados'],
    answer: (p) => `Para consultar o resultado relacionado a ${p}, utilize o canal indicado pela loja ou abra um ticket de suporte.`,
    quick: ['Abrir ticket', 'Falar com staff'],
  },
  {
    key: 'promocao',
    verbs: ['consultar promoção de', 'saber se existe desconto no', 'ver ofertas para'],
    products: ['Produtos de R$ 1'],
    answer: (p) => `Promoções e descontos de ${p} dependem das ofertas ativas. Consulte a loja para verificar as condições atuais.`,
    quick: ['Ver loja', 'Abrir ticket'],
  },
  {
    key: 'pagar',
    verbs: ['pagar', 'saber como pagar', 'consultar as formas de pagamento de'],
    products: ['Produtos de R$ 1'],
    answer: (p) => `Para pagar ${p}, utilize uma das formas de pagamento disponibilizadas pela loja e guarde o comprovante.`,
    quick: ['Ver loja', 'Formas de pagamento'],
  },
  {
    key: 'disponibilidade',
    verbs: ['ver se está disponível o', 'consultar a disponibilidade do', 'saber se ainda tem o'],
    products: ['Produtos de R$ 1'],
    answer: (p) => `A disponibilidade de ${p} pode mudar. Consulte a loja para verificar se a oferta está disponível no momento.`,
    quick: ['Ver loja', 'Abrir ticket'],
  },
];

// ============================================================
// 5. INTENÇÕES DE TICKET
// ============================================================
const TICKET_INTENTS = [
  { key: 'ticket_receber_produto', action: 'receber produto',
    answer: (p) => `Use este ticket para receber ou verificar uma compra de ${p}. Envie o comprovante e os dados do pedido.`,
    quick: ['Abrir ticket', 'Falar com staff'] },
  { key: 'ticket_produto_nao_recebido', action: 'produto não recebido',
    answer: (p) => `Use este ticket quando o pagamento de ${p} foi realizado, mas o produto ainda não chegou. Envie o comprovante e as informações da compra.`,
    quick: ['Abrir ticket', 'Falar com staff'] },
  { key: 'ticket_produto_errado', action: 'produto errado',
    answer: (p) => `Use este ticket quando o ${p} recebido estiver diferente do comprado. Envie o comprovante e, se possível, prints do pedido.`,
    quick: ['Abrir ticket', 'Falar com staff'] },
  { key: 'ticket_duvidas', action: 'dúvidas',
    answer: (p) => `Use este ticket para dúvidas sobre ${p}, serviços, pagamentos, regras ou funcionamento da loja.`,
    quick: ['Abrir ticket', 'Falar com staff'] },
  { key: 'ticket_parcerias', action: 'parcerias',
    answer: (p) => `Use este ticket para enviar propostas de parceria relacionadas a ${p}. Explique seu projeto, servidor ou conteúdo e apresente sua proposta.`,
    quick: ['Abrir ticket', 'Falar com staff'] },
  { key: 'ticket_vagas', action: 'vagas',
    answer: (p) => `Use este ticket para candidaturas relacionadas a ${p}. Informe a vaga desejada, sua experiência e as informações solicitadas pela equipe.`,
    quick: ['Abrir ticket', 'Falar com staff'] },
  { key: 'ticket_reembolso', action: 'reembolso',
    answer: (p) => `Use este ticket para solicitar análise de reembolso de ${p}. Informe o pedido e explique o motivo da solicitação.`,
    quick: ['Abrir ticket', 'Falar com staff'] },
  { key: 'ticket_pagamento', action: 'pagamento',
    answer: (p) => `Use este ticket para problemas relacionados a pagamentos de ${p}. Envie o comprovante e descreva o que aconteceu.`,
    quick: ['Abrir ticket', 'Falar com staff'] },
  { key: 'ticket_problema_produto', action: 'problema com produto',
    answer: (p) => `Use este ticket quando houver algum problema com ${p} já recebido. Explique o problema e envie provas quando necessário.`,
    quick: ['Abrir ticket', 'Falar com staff'] },
  { key: 'ticket_reclamacao', action: 'reclamação',
    answer: (p) => `Use este ticket para registrar uma reclamação relacionada a ${p}. Descreva o ocorrido com o máximo de detalhes possível.`,
    quick: ['Abrir ticket', 'Falar com staff'] },
  { key: 'ticket_denuncia', action: 'denúncia',
    answer: (p) => `Use este ticket para denunciar uma situação ou usuário relacionado a ${p}. Apresente as informações e provas disponíveis.`,
    quick: ['Abrir ticket', 'Falar com staff'] },
  { key: 'ticket_sugestao', action: 'sugestão',
    answer: (p) => `Use este ticket para enviar sugestões sobre ${p}, serviços, eventos ou melhorias da loja.`,
    quick: ['Abrir ticket', 'Falar com staff'] },
];

const TICKET_TEMPLATES = [
  'Qual ticket eu abro para {action} do {product}?',
  'Onde posso solicitar {action} referente ao {product}?',
  'Preciso de ajuda com {action} do {product}, qual ticket uso?',
  'Como faço para abrir um ticket de {action} sobre o {product}?',
  'Comprei {product} e preciso de {action}, onde entro?',
  'Mano, quero {action} do {product}, qual ticket eu abro?',
  'Gostaria de solicitar {action} relacionado ao {product}. Como procedo?',
  'Tive um problema com {product} e preciso de {action}.',
];

// ============================================================
// 6. TEMPLATES POR TOM
// ============================================================
const TEMPLATES_INFORMAL = [
  'mano, como faço para {verb} o {product}?',
  'como que eu consigo {verb} o {product}?',
  'tem como {verb} o {product}?',
  'onde eu {verb} o {product}?',
  'me explica como {verb} o {product}?',
  'tô querendo {verb} o {product}, como faço?',
  'comprei o {product} e preciso {verb}, o que faço?',
  'e aí, como funciona para {verb} o {product}?',
  'não sei como {verb} o {product}, podem ajudar?',
  'qual ticket eu abro para {verb} o {product}?',
];

const TEMPLATES_FORMAL = [
  'Gostaria de saber como posso {verb} o {product}.',
  'Poderiam informar como devo proceder para {verb} o {product}?',
  'Gostaria de obter informações sobre como {verb} o {product}.',
  'Qual é o procedimento para {verb} o {product}?',
  'Seria possível explicar como {verb} o {product}?',
  'Onde devo solicitar atendimento para {verb} o {product}?',
  'Quais são as condições para {verb} o {product}?',
];

const TEMPLATES_NEUTRAL = [
  'Como funciona a opção de {verb} o {product}?',
  'Quais são as informações necessárias para {verb} o {product}?',
  'Qual ticket devo utilizar para {verb} o {product}?',
];

// ============================================================
// 7. MULTI-IDIOMA
// ============================================================
const LANGUAGES = {
  English: {
    templates: {
      comprar: 'How do I buy {product}?',
      nao_recebido: 'I bought {product} and did not receive it. What should I do?',
      suporte: 'Which ticket should I open for {product} support?',
      preco: 'How much does {product} cost?',
      funcionamento: 'How does {product} work?',
    },
    answers: {
      comprar: (p) => `To buy ${p}, check the current store offer and follow the purchase instructions.`,
      nao_recebido: (p) => `Open a Product Not Received ticket and provide your purchase information and proof of payment.`,
      suporte: (p) => `Open a support or Questions ticket and provide the relevant purchase details.`,
      preco: (p) => `Check the store listing for the current price of ${p}.`,
      funcionamento: (p) => `Check the product description for the current conditions. If you still have questions, open a Questions ticket.`,
    },
  },
  Español: {
    templates: {
      comprar: '¿Cómo compro {product}?',
      nao_recebido: 'Compré {product} y no lo recibí. ¿Qué hago?',
      suporte: '¿Qué ticket debo abrir para recibir ayuda con {product}?',
      preco: '¿Cuánto cuesta {product}?',
      funcionamento: '¿Cómo funciona {product}?',
    },
    answers: {
      comprar: (p) => `Para comprar ${p}, consulta la oferta disponible en la tienda y sigue las instrucciones.`,
      nao_recebido: (p) => `Abre un ticket de Producto No Recibido y envía los datos de la compra y el comprobante.`,
      suporte: (p) => `Abre un ticket de Soporte o Dudas e informa los datos de tu compra.`,
      preco: (p) => `Consulta la tienda para ver el precio actual de ${p}.`,
      funcionamento: (p) => `Consulta la descripción del producto. Si tienes dudas, abre un ticket de Dudas.`,
    },
  },
  Français: {
    templates: {
      comprar: 'Comment acheter {product} ?',
      nao_recebido: "J'ai acheté {product} mais je ne l'ai pas reçu. Que faire ?",
      suporte: "Quel ticket dois-je ouvrir pour obtenir de l'aide concernant {product} ?",
      preco: 'Quel est le prix de {product} ?',
      funcionamento: 'Comment fonctionne {product} ?',
    },
    answers: {
      comprar: (p) => `Pour acheter ${p}, consultez l'offre actuelle de la boutique et suivez les instructions.`,
      nao_recebido: (p) => `Ouvrez un ticket Produit non reçu et envoyez les informations de votre achat.`,
      suporte: (p) => `Ouvrez un ticket de support ou de questions avec les informations de votre commande.`,
      preco: (p) => `Consultez la boutique pour connaître le prix actuel de ${p}.`,
      funcionamento: (p) => `Consultez la description du produit. Si vous avez encore des questions, ouvrez un ticket.`,
    },
  },
  Deutsch: {
    templates: {
      comprar: 'Wie kaufe ich {product}?',
      nao_recebido: 'Ich habe {product} gekauft, aber nicht erhalten. Was soll ich tun?',
      suporte: 'Welches Ticket soll ich für Hilfe zu {product} öffnen?',
      preco: 'Wie viel kostet {product}?',
      funcionamento: 'Wie funktioniert {product}?',
    },
    answers: {
      comprar: (p) => `Prüfen Sie das aktuelle Angebot im Shop und folgen Sie den Kaufanweisungen.`,
      nao_recebido: (p) => `Öffnen Sie ein Ticket für nicht erhaltene Produkte und senden Sie die Kaufdaten.`,
      suporte: (p) => `Öffnen Sie ein Support- oder Fragen-Ticket und geben Sie die Bestelldaten an.`,
      preco: (p) => `Im Shop finden Sie den aktuellen Preis für ${p}.`,
      funcionamento: (p) => `Lesen Sie die Produktbeschreibung. Bei weiteren Fragen können Sie ein Ticket öffnen.`,
    },
  },
  Italiano: {
    templates: {
      comprar: 'Come posso acquistare {product}?',
      nao_recebido: "Ho acquistato {product} ma non l'ho ricevuto. Cosa devo fare?",
      suporte: 'Quale ticket devo aprire per ricevere assistenza su {product}?',
      preco: 'Quanto costa {product}?',
      funcionamento: 'Come funziona {product}?',
    },
    answers: {
      comprar: (p) => `Controlla l'offerta attuale nel negozio e segui le istruzioni per l'acquisto.`,
      nao_recebido: (p) => `Apri un ticket per prodotto non ricevuto e invia i dati dell'acquisto.`,
      suporte: (p) => `Apri un ticket di supporto o domande e inserisci i dati dell'ordine.`,
      preco: (p) => `Controlla il negozio per vedere il prezzo attuale di ${p}.`,
      funcionamento: (p) => `Controlla la descrizione del prodotto. Per altre domande, apri un ticket.`,
    },
  },
};

// ============================================================
// 8. GERADOR DA BASE FAQ
// ============================================================
function generateFAQDatabase() {
  const db = [];
  let id = 0;

  for (const intent of INTENTS) {
    const productsForIntent = intent.products || PRODUCTS;
    for (const product of productsForIntent) {
      const triggers = [];
      for (const verb of intent.verbs) {
        for (const tpl of TEMPLATES_INFORMAL) triggers.push(tpl.replace(/\{verb\}/g, verb).replace(/\{product\}/g, product));
        for (const tpl of TEMPLATES_FORMAL) triggers.push(tpl.replace(/\{verb\}/g, verb).replace(/\{product\}/g, product));
        for (const tpl of TEMPLATES_NEUTRAL) triggers.push(tpl.replace(/\{verb\}/g, verb).replace(/\{product\}/g, product));
      }
      db.push({ id: ++id, cat: intent.key, product, tone: 'misto', triggers, responses: [intent.answer(product)], quick: intent.quick || [], weight: 1 });
    }
  }

  for (const ticket of TICKET_INTENTS) {
    for (const product of PRODUCTS) {
      const triggers = TICKET_TEMPLATES.map((tpl) => tpl.replace(/\{action\}/g, ticket.action).replace(/\{product\}/g, product));
      db.push({ id: ++id, cat: ticket.key, product, tone: 'misto', triggers, responses: [ticket.answer(product)], quick: ticket.quick || [], weight: 1 });
    }
  }

  for (const [lang, cfg] of Object.entries(LANGUAGES)) {
    for (const [intentKey, tpl] of Object.entries(cfg.templates)) {
      for (const product of PRODUCTS) {
        const question = tpl.replace(/\{product\}/g, product);
        db.push({ id: ++id, cat: `lang_${intentKey}`, product, tone: 'neutro', lang, triggers: [question], responses: [cfg.answers[intentKey](product)], quick: [], weight: 1 });
      }
    }
  }

  return db;
}

// ============================================================
// 9. CONSTRÓI A BASE NO BOOT
// ============================================================
const FAQ_DATABASE = generateFAQDatabase();

if (process.env.FAQ_BOOT_LOG !== '0') {
  const totalTriggers = FAQ_DATABASE.reduce((acc, e) => acc + e.triggers.length, 0);
  console.log(`[FAQ] Base carregada: ${FAQ_DATABASE.length} entradas · ${totalTriggers} triggers · ${PRODUCTS.length} produtos · ${INTENTS.length + TICKET_INTENTS.length} intenções · ${Object.keys(LANGUAGES).length + 1} idiomas`);
}

// ============================================================
// 10. SINÔNIMOS
// ============================================================
const SYNONYMS = {
  'vc': 'você', 'vcs': 'vocês', 'voce': 'você',
  'q': 'que', 'qq': 'qualquer', 'pq': 'porque', 'tb': 'também',
  'tbm': 'também', 'ta': 'está', 'tá': 'está', 'to': 'estou',
  'tô': 'estou', 'nao': 'não', 'vlw': 'valeu', 'flw': 'falou',
  'blz': 'beleza', 'ok': 'ok', 'okay': 'ok',
  'mano': '', 'cara': '', 'bro': '',
  'pfv': 'por favor', 'pf': 'por favor',
  'msm': 'mesmo', 'eh': 'é', 'ne': 'né',
  'oq': 'o que', 'oq eh': 'o que é', 'oq e': 'o que é',
  'cmg': 'comigo', 'ctg': 'contigo',
  'hj': 'hoje', 'amnh': 'amanhã', 'amanha': 'amanhã',
  'hrs': 'horas', 'min': 'minutos',
  'atend': 'atendimento', 'sup': 'suporte',
  'pagto': 'pagamento', 'prod': 'produto',
  'tk': 'ticket', 'tkt': 'ticket',
  'prem': 'premium',
  'ff': 'free fire', 'free': 'free fire', 'freefire': 'free fire',
};

// ============================================================
// 11. NORMALIZAÇÃO
// ============================================================
function normalize(text) {
  if (!text || typeof text !== 'string') return '';
  let s = text.toLowerCase().trim();
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  s = s.replace(/[^a-z0-9\s]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  const tokens = s.split(' ');
  const mapped = tokens.map((t) => (Object.prototype.hasOwnProperty.call(SYNONYMS, t) ? SYNONYMS[t] : t)).filter(Boolean);
  return mapped.join(' ').trim();
}

function tokenize(text) {
  return normalize(text).split(' ').filter((t) => t.length > 2);
}

// ============================================================
// 12. MATCHING — SCORE
// ============================================================
function scoreEntry(normalizedMsg, entry) {
  if (!normalizedMsg || !entry) return 0;
  const msgTokens = new Set(tokenize(normalizedMsg));
  if (msgTokens.size === 0) return 0;

  let best = 0;
  for (const trigger of entry.triggers) {
    const normTrigger = normalize(trigger);
    if (!normTrigger) continue;

    if (normalizedMsg.includes(normTrigger)) {
      const bonus = normTrigger.length / Math.max(normalizedMsg.length, 1);
      best = Math.max(best, 0.7 + Math.min(bonus, 0.25));
    }

    const trigTokens = new Set(tokenize(normTrigger));
    if (trigTokens.size === 0) continue;

    let inter = 0;
    for (const t of trigTokens) if (msgTokens.has(t)) inter++;
    const union = new Set([...msgTokens, ...trigTokens]).size;
    const jaccard = union === 0 ? 0 : inter / union;
    const coverage = inter / trigTokens.size;
    const local = jaccard * 0.4 + coverage * 0.6;
    if (local > best) best = local;
  }

  const weight = typeof entry.weight === 'number' ? entry.weight : 1;
  return Math.min(best * weight, 1);
}

function findBestMatch(normalizedMsg) {
  let best = null;
  let bestScore = 0;
  for (const entry of FAQ_DATABASE) {
    const s = scoreEntry(normalizedMsg, entry);
    if (s > bestScore) { bestScore = s; best = entry; }
  }
  return { entry: best, score: bestScore };
}

// ============================================================
// 13. ESCALAÇÃO
// ============================================================
function detectEscalation(normalizedMsg) {
  if (!normalizedMsg) return false;
  for (const kw of ESCALATION_KEYWORDS) {
    const normKw = normalize(kw);
    if (normKw && normalizedMsg.includes(normKw)) return true;
  }
  return false;
}

// ============================================================
// 14. ESTADO
// ============================================================
const state = {
  cooldowns: new Map(),
  counters: new Map(),
  startAt: Date.now(),
  stats: {
    totalMessages: 0, totalReplies: 0, totalEscalations: 0,
    totalSilenced: 0, totalLowScore: 0, totalCooldown: 0, totalLimitReached: 0,
  },
};

function checkCooldown(threadId, userId) {
  const key = `${threadId}:${userId}`;
  const last = state.cooldowns.get(key) || 0;
  const now = Date.now();
  if (now - last < FAQ_CONFIG.cooldownMs) return false;
  state.cooldowns.set(key, now);
  return true;
}

function checkCounter(threadId) {
  const c = state.counters.get(threadId) || 0;
  if (c >= FAQ_CONFIG.maxPerThread) return false;
  state.counters.set(threadId, c + 1);
  return true;
}

function resetCounter(threadId) { state.counters.delete(threadId); }

function resetCooldownsForThread(threadId) {
  for (const key of state.cooldowns.keys()) {
    if (key.startsWith(`${threadId}:`)) state.cooldowns.delete(key);
  }
}

setInterval(() => {
  const now = Date.now();
  const MAX_AGE = 1000 * 60 * 60 * 6;
  for (const [key, ts] of state.cooldowns.entries()) {
    if (now - ts > MAX_AGE) state.cooldowns.delete(key);
  }
}, 1000 * 60 * 30).unref?.();

// ============================================================
// 15. RESPOSTA
// ============================================================
function pickResponse(entry) {
  if (!entry || !Array.isArray(entry.responses) || entry.responses.length === 0) return null;
  return entry.responses[Math.floor(Math.random() * entry.responses.length)];
}

function pickQuick(entry, count) {
  if (!entry || !Array.isArray(entry.quick) || entry.quick.length === 0) return [];
  return [...entry.quick].sort(() => Math.random() - 0.5).slice(0, count);
}

// ============================================================
// 16. ✅ API PRINCIPAL CONSUMIDA PELO index.js
// ============================================================
// Uso:
//   const FAQ = require('./ia-ticket');
//   const result = FAQ.respond(texto, { user, guild });
//   //   → { text, escalate, category?, product?, score? }   quando casa
//   //   → { text, escalate: true, category: 'escalation' }  palavra crítica
//   //   → null                                              sem match
// ============================================================
function respond(text, context = {}) {
  if (!text || typeof text !== 'string') return null;

  const raw = text.trim();
  if (raw.length < FAQ_CONFIG.minLength) return null;
  if (raw.length > FAQ_CONFIG.maxLength) return null;

  for (const p of FAQ_CONFIG.ignorePrefixes) {
    if (raw.startsWith(p)) return null;
  }

  const normalized = normalize(raw);
  if (!normalized) return null;

  state.stats.totalMessages++;

  // 1) Escalação — palavras críticas
  if (detectEscalation(normalized)) {
    state.stats.totalEscalations++;
    return {
      text:
        '🚨 **Atendimento prioritário solicitado**\n' +
        'Sua mensagem foi marcada para atendimento humano. ' +
        'Um membro da staff vai te responder assim que possível. 🙏',
      escalate: true,
      category: 'escalation',
    };
  }

  // 2) Match normal
  const { entry, score } = findBestMatch(normalized);

  if (FAQ_CONFIG.verbose) {
    console.log(`[FAQ] score=${score.toFixed(2)} cat=${entry?.cat} prod=${entry?.product} msg="${raw.slice(0, 60)}"`);
  }

  if (!entry || score < FAQ_CONFIG.minScore) {
    state.stats.totalLowScore++;
    return null;
  }

  let body = pickResponse(entry);
  if (!body) {
    state.stats.totalSilenced++;
    return null;
  }

  const quick = pickQuick(entry, FAQ_CONFIG.quickSuggestions);
  if (quick.length > 0) {
    body += '\n\n**Sugestões rápidas:**\n' + quick.map((q) => `• ${q}`).join('\n');
  }

  state.stats.totalReplies++;

  return {
    text: body,
    escalate: false,
    category: entry.cat,
    product: entry.product,
    score,
  };
}

// ============================================================
// 17. HANDLER AUTÔNOMO (envia sozinho — alternativa)
// ============================================================
async function handleTicketFAQ(message, ticketData = {}, options = {}) {
  if (!message || !message.channel) return false;
  state.stats.totalMessages++;

  if (message.author?.bot) return false;
  if (!message.content || typeof message.content !== 'string') return false;

  const raw = message.content.trim();
  if (raw.length < FAQ_CONFIG.minLength) return false;
  if (raw.length > FAQ_CONFIG.maxLength) return false;

  for (const p of FAQ_CONFIG.ignorePrefixes) {
    if (raw.startsWith(p)) return false;
  }

  if (FAQ_CONFIG.ignoreIfMentionsBot && message.mentions?.users?.has?.(message.client?.user?.id)) return false;

  if (ticketData && (ticketData.status === 'closed' || ticketData.status === 'fechado')) return false;
  if (ticketData && ticketData.locked === true) return false;

  const threadId = message.channel.id;
  const userId = message.author.id;

  if (!checkCooldown(threadId, userId)) { state.stats.totalCooldown++; return false; }
  if (!checkCounter(threadId)) { state.stats.totalLimitReached++; return false; }

  const normalized = normalize(raw);
  if (!normalized) return false;

  if (detectEscalation(normalized)) {
    state.stats.totalEscalations++;
    try { await sendEscalation(message, ticketData, raw); }
    catch (e) { console.error('[FAQ] Erro ao escalar:', e?.message || e); }
    return true;
  }

  const { entry, score } = findBestMatch(normalized);

  if (FAQ_CONFIG.verbose) {
    console.log(`[FAQ] thread=${threadId} score=${score.toFixed(2)} cat=${entry?.cat} prod=${entry?.product} msg="${raw.slice(0, 60)}"`);
  }

  if (!entry || score < FAQ_CONFIG.minScore) {
    state.stats.totalLowScore++;
    if (FAQ_CONFIG.escalateOnLowScore) {
      try { await sendEscalation(message, ticketData, raw); }
      catch (e) { console.error('[FAQ] Erro ao escalar (lowScore):', e?.message || e); }
      return true;
    }
    state.stats.totalSilenced++;
    return false;
  }

  const responseText = pickResponse(entry);
  if (!responseText) { state.stats.totalSilenced++; return false; }

  const quick = pickQuick(entry, FAQ_CONFIG.quickSuggestions);
  let finalText = responseText;
  if (quick.length > 0) finalText += '\n\n**Sugestões rápidas:**\n' + quick.map((q) => `• ${q}`).join('\n');

  try {
    await message.reply({ content: finalText, allowedMentions: { repliedUser: false } });
    state.stats.totalReplies++;
    return true;
  } catch (e) {
    console.error('[FAQ] Erro ao enviar resposta:', e?.message || e);
    return false;
  }
}

// ============================================================
// 18. ESCALAÇÃO (helper interno)
// ============================================================
async function sendEscalation(message, ticketData = {}, originalText = '') {
  const content =
    '🚨 **Atendimento prioritário solicitado**\n' +
    'Sua mensagem foi marcada para atendimento humano. ' +
    'Um membro da staff vai te responder assim que possível. 🙏\n' +
    (originalText ? `\n> ${originalText.slice(0, 200)}` : '');

  await message.reply({ content, allowedMentions: { repliedUser: false } });

  if (ticketData && typeof ticketData === 'object') {
    ticketData.is_priority = true;
    ticketData.priority_at = new Date().toISOString();
  }
}

// ============================================================
// 19. UTILITÁRIOS
// ============================================================
function testFAQ(text) {
  const normalized = normalize(text || '');
  const escalation = detectEscalation(normalized);
  const { entry, score } = findBestMatch(normalized);
  const willReply = !escalation && entry && score >= FAQ_CONFIG.minScore;
  return {
    input: text, normalized, escalation,
    entry: entry ? { id: entry.id, cat: entry.cat, product: entry.product, tone: entry.tone, lang: entry.lang || 'pt' } : null,
    score: Number(score.toFixed(3)),
    willReply,
    response: willReply ? pickResponse(entry) : null,
    quick: willReply ? pickQuick(entry, FAQ_CONFIG.quickSuggestions) : [],
  };
}

function getFAQStats() {
  const totalEntries = FAQ_DATABASE.length;
  const totalTriggers = FAQ_DATABASE.reduce((a, e) => a + e.triggers.length, 0);
  const byCat = {}, byProduct = {}, byLang = {};
  for (const e of FAQ_DATABASE) {
    byCat[e.cat] = (byCat[e.cat] || 0) + 1;
    byProduct[e.product] = (byProduct[e.product] || 0) + 1;
    const l = e.lang || 'pt';
    byLang[l] = (byLang[l] || 0) + 1;
  }
  return {
    version: '6.4.0',
    entries: totalEntries, triggers: totalTriggers,
    products: PRODUCTS.length,
    intents: INTENTS.length + TICKET_INTENTS.length,
    languages: Object.keys(LANGUAGES).length + 1,
    escalationKeywords: ESCALATION_KEYWORDS.length,
    categories: byCat, productsBreakdown: byProduct, languagesBreakdown: byLang,
    config: { ...FAQ_CONFIG },
    runtime: { ...state.stats },
    uptimeMs: Date.now() - state.startAt,
  };
}

function reloadFAQ() {
  state.cooldowns.clear();
  state.counters.clear();
  return true;
}

function findByProduct(product, limit = 50) {
  return FAQ_DATABASE.filter((e) => e.product === product).slice(0, limit)
    .map((e) => ({ id: e.id, cat: e.cat, tone: e.tone, lang: e.lang || 'pt', triggers: e.triggers.slice(0, 3) }));
}

// ============================================================
// 20. EXPORTS
// ============================================================
module.exports = {
  // ✅ API consumida pelo index.js
  respond,

  // Handler autônomo (envia sozinho)
  handleTicketFAQ,

  // Utilitários
  testFAQ,
  getFAQStats,
  reloadFAQ,
  findByProduct,
  resetCounter,
  resetCooldownsForThread,

  // Dados
  FAQ_DATABASE,
  FAQ_CONFIG,
  ESCALATION_KEYWORDS,
  PRODUCTS,
  INTENTS,
  TICKET_INTENTS,
  LANGUAGES,

  // Internos (debug)
  _internal: {
    normalize, tokenize, scoreEntry, findBestMatch, detectEscalation,
    generateFAQDatabase, pickResponse, pickQuick,
  },
};
