// Tipos do domínio — espelham docs/01-banco-de-dados.md (Supabase).
// Enquanto o Supabase não está configurado, os mesmos tipos alimentam a camada mock (lib/data).

export type Papel = "dono" | "gerente" | "lider" | "caixa";

/** Vínculo jurídico/operacional no módulo RH (fase 1). */
export type TipoPessoaRH = "colaborador" | "intermitente" | "entregador" | "prestador_eventual";

export type FuncaoOperacional =
  | "administrador"
  | "gerente"
  | "cozinha"
  | "balcao"
  | "caixa"
  | "salao"
  | "entregador"
  | "custom";

export type ModuloAcesso =
  | "painel"
  | "recebimento"
  | "estoque"
  | "lista_compras"
  | "cotacoes"
  | "pedidos"
  | "financeiro"
  | "relatorios"
  | "cadastros"
  | "rh";

export type PermissoesModulos = Record<ModuloAcesso, boolean>;

/** Arquivo de contrato assinado guardado no perfil (demo local). */
export interface ContratoArquivoPessoa {
  nome_arquivo: string;
  tipo_arquivo: string;
  tamanho_bytes: number;
  enviado_em: string;
  /** Data URL (base64) para abrir/baixar no navegador. */
  data_url: string;
}

export type TipoDocumentoPessoa =
  | "contrato"
  | "esocial"
  | "aso"
  | "rg"
  | "ctps"
  | "cnh"
  | "outro";

export type StatusDocumentoPessoa = "presente" | "ausente" | "vencido" | "a_vencer";

export interface DocumentoPessoa {
  id: string;
  tipo: TipoDocumentoPessoa;
  rotulo: string;
  presente: boolean;
  /** Validade YYYY-MM-DD (ASO, CNH…). */
  validade?: string;
  arquivo?: ContratoArquivoPessoa;
  atualizado_em?: string;
}

export interface PessoaRH {
  id: string;
  nome: string;
  tipo: TipoPessoaRH;
  funcao: FuncaoOperacional;
  /** Preenchido quando funcao === "custom". */
  funcao_custom?: string;
  cargo?: string;
  telefone?: string;
  cpf?: string;
  observacao?: string;
  data_admissao?: string;
  valor_hora?: number;
  salario?: number;
  /** Valor fixo de adiantamento mensal (CLT). Não pode passar de 50% do salário. */
  adiantamento_valor?: number;
  chave_pix?: string;
  contrato_assinado?: boolean;
  esocial_ok?: boolean;
  /** Cópia do contrato assinado (PDF ou imagem) — demo em localStorage. */
  contrato_arquivo?: ContratoArquivoPessoa;
  /** Checklist de documentos (contrato, ASO, CNH…). */
  documentos?: DocumentoPessoa[];
  tem_acesso_sistema: boolean;
  login?: string;
  /** Demo local — trocar por hash quando Auth/Supabase existir. */
  senha?: string;
  /** Liga ao seletor de papel atual (db.perfis). */
  perfil_id?: string;
  papel_sistema?: Papel;
  permissoes: PermissoesModulos;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}

export type TipoPagamentoPessoa =
  | "salario"
  | "adiantamento"
  | "vale"
  | "intermitente_periodo"
  | "freela_hora"
  | "freela_servico"
  | "outro";

export type StatusPagamentoPessoa = "previsto" | "liberado" | "aguardando_conciliacao" | "pago";

export interface PagamentoPessoa {
  id: string;
  pessoa_id: string;
  tipo: TipoPagamentoPessoa;
  descricao?: string;
  /** Competência no formato YYYY-MM. */
  competencia?: string;
  vencimento: string;
  valor: number;
  /** Valor antes de descontos (salário bruto ou diária bruta). */
  valor_bruto?: number;
  desconto_consumo?: number;
  desconto_adiantamento?: number;
  /** Consumos abatidos neste pagamento. */
  consumo_ids?: string[];
  /** Vínculo com convocação intermitente (quando gerado pelo aceite). */
  convocacao_id?: string;
  horas?: number;
  valor_hora?: number;
  status: StatusPagamentoPessoa;
  pagamento_data?: string;
  pagamento_valor?: number;
  pagamento_banco_conta?: string;
  pagamento_responsavel?: string;
  pagamento_observacao?: string;
  pagamento_informado_em?: string;
  conciliado_em?: string;
  conciliado_por?: string;
  conciliacao_divergente?: boolean;
  conciliacao_divergencia_motivo?: string;
  conciliacao_divergencia_em?: string;
  criado_em: string;
  atualizado_em: string;
}

export type StatusConsumoPessoa = "pendente" | "descontado";

/** Consumo do restaurante pelo funcionário (item a item, com desconto). */
export interface ConsumoPessoa {
  id: string;
  pessoa_id: string;
  /** Data do consumo YYYY-MM-DD. */
  data: string;
  /** Competência YYYY-MM. */
  competencia: string;
  descricao: string;
  quantidade: number;
  preco_unitario: number;
  desconto_percentual: number;
  valor_bruto: number;
  valor_liquido: number;
  status: StatusConsumoPessoa;
  pagamento_id?: string;
  criado_em: string;
  atualizado_em: string;
}

export interface EscalaSlot {
  id: string;
  pessoa_id: string;
  /** Data do plantão YYYY-MM-DD. */
  data: string;
  /** HH:MM */
  hora_inicio: string;
  /** HH:MM */
  hora_fim: string;
  intervalo_min: number;
  funcao?: string;
  local?: string;
  observacao?: string;
  criado_em: string;
  atualizado_em: string;
}

export type StatusConvocacao =
  | "rascunho"
  | "enviada"
  | "aceita"
  | "recusada"
  | "silencio";

export interface ConvocacaoIntermitente {
  id: string;
  escala_slot_id: string;
  pessoa_id: string;
  /** ISO datetime da convocação. */
  convocada_em: string;
  status: StatusConvocacao;
  respondida_em?: string;
  texto_mensagem: string;
  valor_hora: number;
  horas_brutas: number;
  horas_pagas: number;
  valor_estimado: number;
  antecedencia_ok: boolean;
  criado_em: string;
  atualizado_em: string;
}


export type TipoBox = "NAO_CLASSIFICADO" | "RESERVA" | "OPERACIONAL" | "QUARENTENA";

export type PosicaoFisicaBox = "FRENTE" | "TRAS" | "ISOLADA" | "OUTRA" | "NAO_INFORMADA";

export interface Perfil {
  id: string;
  nome: string;
  papel: Papel;
  ativo: boolean;
}

export interface Unidade {
  id: string;
  /** Código da unidade no EASE EAT. O id interno continua sendo próprio do ComprasChef. */
  codigo_externo?: string;
  nome: string;
  sigla: string;
}

export interface Fornecedor {
  id: string;
  codigo_externo?: string;
  nome: string;
  cnpj: string;
  whatsapp?: string;
  telefone?: string; // segundo contato — quando o WhatsApp não atende chamada
  email?: string;
  contato_nome?: string;
  prazo_entrega_dias?: number;
  pedido_minimo?: number;
  dias_atendimento?: string;
  horario_atendimento?: string;
  forma_pagamento: "boleto" | "pix";
  prazo_boleto_dias?: number;
  ativo: boolean;
}

export type TipoProduto = "comprado" | "produzido";

export interface CategoriaProduto {
  id: string;
  nome: string;
  codigo: string;
  ativo: boolean;
}

export interface Produto {
  id: string;
  codigo_externo?: string;
  nome: string;
  descricao?: string;
  foto_url?: string;
  categoria?: string;
  categoria_id?: string;
  tipo: TipoProduto;
  unidade_compra_id?: string;
  unidade_uso_id: string;
  fator_conversao: number; // 1 unid. de compra = X unid. de uso
  /** Unidade do conteúdo da embalagem (peça, ml…) — só orçamento/informação. */
  subunidade_id?: string;
  /** Quantas subunidades há em 1 unidade de uso (ex.: 1 pacote = 10000 peças). */
  quantidade_subunidade?: number;
  fator_correcao?: number;
  rendimento?: number;
  codigo_barras?: string;
  estoque_minimo: number; // na unidade de uso
  ponto_pedido?: number;
  estoque_maximo?: number;
  consumo_medio_mensal?: number;
  controla_lote?: boolean;
  controla_validade?: boolean;
  validade_padrao_dias?: number;
  fornecedor_padrao_id?: string;
  ncm?: string;
  cest?: string;
  origem_mercadoria?: string;
  cfop_padrao?: string;
  custo_unitario?: number;
  /** Conta do DRE gerencial (padrão na conferência de NF). */
  conta_dre_id?: string;
  /**
   * Se true, compras deste produto entram no CMV food.
   * Limpeza/embalagem operacional devem ficar false (vão para custo fixo de operação).
   */
  entra_no_cmv?: boolean;
  alergenicos?: FichaTecnicaAlergenicos;
  ativo: boolean;
}

export interface ProdutoCodigoBarras {
  id: string;
  produto_id: string;
  codigo_barras: string;
  principal: boolean;
}

export interface FornecedorProduto {
  id: string;
  fornecedor_id: string;
  produto_id: string;
  /** Código cProd/código de catálogo usado por este fornecedor. Não é o código do EASE EAT. */
  codigo_produto_fornecedor?: string;
  /** EAN/GTIN específico da embalagem vendida por este fornecedor. */
  codigo_barras_fornecedor?: string;
  /** Unidade em que este fornecedor costuma cotar/faturar o produto. */
  unidade_compra_id?: string;
  /** 1 unidade do fornecedor = X unidades de uso do ComprasChef. */
  fator_conversao?: number;
  /** Última conta DRE escolhida neste vínculo (memória da conferência). */
  conta_dre_id?: string;
  ultimo_preco?: number;
  ultimo_preco_unidade_id?: string;
  atualizado_em?: string;
}

/** Código do tipo de local (ex.: freezer, geladeira, ou customizado). */
export type TipoLocal = string;

/** Tipos de local cadastráveis (Cadastros → Locais → Gerenciar tipos). */
export interface TipoLocalCadastro {
  id: string;
  nome: string;
  /** Identificador estável usado em `Local.tipo`. */
  codigo: string;
  ativo: boolean;
}

export interface Local {
  id: string;
  nome: string;
  /** Código de um `TipoLocalCadastro`. */
  tipo: TipoLocal;
}

export type StatusCaixa = "vazia" | "cheia" | "em_uso";

export interface Caixa {
  id: string;
  numero: number;
  qr_code: string; // QR fixo da caixa física
  tipo_box: TipoBox;
  posicao_fisica: PosicaoFisicaBox;
  status: StatusCaixa;
  produto_operacional_alvo_id?: string;
  destinacao_operacional_inicio_em?: string;
  destinacao_operacional_responsavel_id?: string;
  produto_id?: string;
  quantidade?: number; // na unidade de uso
  data_envase?: string; // ISO date
  validade?: string; // ISO date
  local_id?: string;
  atualizado_em: string;
}

/** Saldo canônico de uma entrada. A caixa é o recipiente físico opcional do lote. */
export interface LoteEstoque {
  id: string;
  produto_id: string;
  recebimento_item_id?: string;
  origem: "recebimento" | "producao" | "manual";
  porcionado_por_id?: string;
  quantidade_inicial: number;
  quantidade_atual: number;
  data_entrada: string;
  validade?: string;
  criado_em: string;
  atualizado_em: string;
}

/** Parte de um lote armazenada em uma caixa física. Um lote pode ocupar várias caixas. */
export interface AlocacaoCaixa {
  id: string;
  lote_id: string;
  caixa_id: string;
  quantidade_inicial: number;
  quantidade_atual: number;
  criado_em: string;
  atualizado_em: string;
  finalizado_em?: string;
}

export type StatusLista = "rascunho" | "confirmada" | "em_cotacao" | "finalizada";

export interface ListaCompras {
  id: string;
  status: StatusLista;
  gerada_automaticamente: boolean;
  criada_por: string;
  criada_em: string;
}

export interface ListaItem {
  id: string;
  lista_id: string;
  produto_id: string;
  quantidade: number;
  unidade_id?: string; // opcional: troca a unidade de uso do produto neste pedido
  observacao?: string;
}

export type StatusCotacao = "enviada" | "respondida" | "expirada";

export interface Cotacao {
  id: string;
  lista_id: string;
  fornecedor_id: string;
  token: string;
  status: StatusCotacao;
  prazo_resposta: string; // ISO datetime
  canal: "whatsapp" | "email";
  enviada_em: string;
  respondida_em?: string;
}

export interface CotacaoItem {
  id: string;
  cotacao_id: string;
  produto_id: string;
  quantidade: number;
  unidade_id?: string; // herdada do item da lista, quando trocada
  preco_unitario?: number; // preenchido pelo fornecedor
  prazo_entrega_dias?: number;
  disponivel: boolean;
  substituto_descricao?: string;
  substituto_preco?: number;
}

export type StatusPedido =
  | "aguardando_aprovacao"
  | "aprovado"
  | "enviado"
  | "confirmado"
  | "entregue"
  | "cancelado";

export interface Pedido {
  id: string;
  cotacao_id?: string;
  fornecedor_id: string;
  status: StatusPedido;
  valor_total: number;
  analise_ia?: string;
  aprovado_por?: string;
  aprovado_em?: string;
  criado_em: string;
}

export interface PedidoItem {
  id: string;
  pedido_id: string;
  produto_id: string;
  quantidade: number;
  unidade_id?: string; // herdada da cotação, quando trocada
  preco_unitario: number;
}

export type StatusNota = "aguardando_conferencia" | "conferida" | "divergente";

// Item de uma nota trazida da Receita Federal (via certificado digital).
export interface ItemNotaImportada {
  descricao: string;
  codigo?: string; // cProd do fornecedor
  ean?: string; // código de barras
  unidade: string;
  quantidade: number;
  preco_unitario: number;
}

export interface HistoricoCorrecaoFornecedorNfe {
  id: string;
  nota_id: string;
  fornecedor_anterior_id?: string;
  fornecedor_novo_id: string;
  corrigido_em: string;
  corrigido_por: string;
  justificativa?: string;
}

/** NF-e mercadoria (55) vs NFS-e serviço municipal. */
export type TipoNotaFiscal = "nfe" | "nfse";

/**
 * Meio esperado/realizado do título.
 * `plataforma` = já debitado (iFood, Anota AI, etc.).
 * `dinheiro` / `cartao` = pago à vista no estabelecimento.
 */
export type MeioPagamentoNota = "boleto" | "pix" | "plataforma" | "dinheiro" | "cartao";

export interface NotaFiscal {
  id: string;
  fornecedor_id: string;
  pedido_id?: string;
  numero: string;
  /** NF-e: chave 44 dígitos. NFS-e: chave municipal (ex. NFS…). */
  chave_acesso: string;
  /** Distinto quando tipo=nfse (espelha chave_acesso ou chave própria). */
  chave_nfse?: string;
  tipo?: TipoNotaFiscal;
  cnpj_emitente?: string;
  razao_social_emitente?: string;
  xml_url?: string;
  /** Nome do PDF importado (NFS-e costuma vir só em PDF). */
  arquivo_pdf_nome?: string;
  descricao_servico?: string;
  municipio_emissao?: string;
  meio_pagamento_esperado?: MeioPagamentoNota;
  valor_total: number;
  emitida_em: string;
  importada_em: string;
  status: StatusNota;
  origem?: "manual" | "receita"; // 'receita' = baixada automaticamente pelo certificado
  itens_importados?: ItemNotaImportada[];
  sem_duplicatas_confirmado_em?: string;
  sem_duplicatas_confirmado_por?: string;
  sem_duplicatas_justificativa?: string;
  correcoes_fornecedor?: HistoricoCorrecaoFornecedorNfe[];
}

export type FormatoBoleto = "codigo_barras_bancario_44" | "linha_digitavel_bancaria_47" | "linha_digitavel_arrecadacao_48" | "invalido";

export type StatusBoleto = "travado" | "liberado" | "aguardando_conciliacao" | "pago" | "suspeito";

/**
 * Documento fiscal (NF-e/NFS-e) ligado ao pagamento.
 * PIX/serviço pode existir sem nota (`aguardando_nfse`) e vincular depois.
 */
export type StatusDocumentoFiscalPagamento =
  | "nao_aplicavel"
  | "aguardando_nfse"
  | "vinculado";

export interface Boleto {
  id: string;
  /** Ausente em cobrança PIX/serviço sem NFS-e ainda. */
  nota_id?: string;
  /** Fornecedor direto quando ainda não há nota vinculada. */
  fornecedor_id?: string;
  numero_parcela?: string;
  valor: number;
  vencimento: string; // ISO date
  cnpj_beneficiario?: string;
  linha_digitavel?: string;
  status: StatusBoleto;
  /** Título de NFS-e pode ser boleto bancário ou PIX. */
  meio_pagamento_esperado?: MeioPagamentoNota;
  documento_boleto_id?: string;
  status_conferencia?: "aguardando_documento" | "conferido" | "em_analise";
  /** Padrão implícito: vinculado se tem nota_id; aguardando_nfse se PIX sem nota. */
  status_documento_fiscal?: StatusDocumentoFiscalPagamento;
  conferido_em?: string;
  conferido_por?: string;
  pagamento_data?: string;
  pagamento_valor?: number;
  pagamento_banco_conta?: string;
  /** Nome/final do cartão quando meio = cartao (ex.: “Visa final 1234”). */
  pagamento_cartao?: string;
  pagamento_responsavel?: string;
  pagamento_observacao?: string;
  pagamento_informado_em?: string;
  observacao?: string;
}

export interface HistoricoPagamentoBoleto {
  id: string;
  boleto_id: string;
  nota_id?: string;
  acao: "pagamento_informado" | "conciliado";
  status_anterior: StatusBoleto;
  status_novo: StatusBoleto;
  data_pagamento: string;
  valor_pago: number;
  banco_conta: string;
  responsavel: string;
  observado_em: string;
  observacao?: string;
}

export interface DuplicataNotaTemporaria {
  numero_parcela?: string;
  vencimento: string;
  valor: number;
}

export type StatusContaPagar =
  | "aguardando_boleto"
  | "boleto_recebido"
  | "em_conferencia"
  | "compativel"
  | "divergente"
  | "bloqueado"
  | "aguardando_conciliacao"
  | "conciliado"
  | "cancelado";

export type OrigemContaPagar = "nfe" | "nfse" | "manual" | "recorrente";

export interface ContaPagar {
  id: string;
  fornecedor_id?: string;
  descricao: string;
  origem: OrigemContaPagar;
  documento_id?: string;
  categoria: string;
  /** Conta do DRE gerencial (despesas fixas / serviços). */
  conta_dre_id?: string;
  centro_custo?: string;
  data_emissao: string;
  data_vencimento: string;
  valor_original: number;
  juros?: number;
  desconto?: number;
  valor_final: number;
  observacoes?: string;
  status: StatusContaPagar;
  criado_em: string;
  atualizado_em: string;
}

export interface ContaPagarHistorico {
  id: string;
  conta_pagar_id: string;
  acao: string;
  status_anterior: StatusContaPagar | null;
  status_novo: StatusContaPagar;
  data: string;
  responsavel: string;
  observacao?: string;
}

export interface DocumentoBoleto {
  id: string;
  conta_pagar_id?: string;
  nota_id?: string;
  boleto_id?: string;
  nome_arquivo: string;
  tipo_arquivo: string;
  tamanho_bytes: number;
  hash_sha256: string;
  /** Página do PDF quando o arquivo tem vários boletos (ex.: DANFE + 3 boletos). */
  pagina_pdf?: number;
  linha_informada?: string;
  codigo_canonico?: string;
  formato_boleto?: Exclude<FormatoBoleto, "invalido">;
  resultado_confronto?: "exata" | "parcial" | "divergente" | "sem_correspondencia" | "duplicada" | "multiplas_possibilidades";
  criterios_conferidos?: string[];
  divergencias?: string[];
  confirmado_em?: string;
  confirmado_por?: string;
  justificativa_confirmacao?: string;
  criado_em: string;
  criado_por: string;
}

export type StatusRecebimento = "ok" | "parcial" | "divergente";

export interface Recebimento {
  id: string;
  pedido_id: string;
  nota_id?: string;
  status: StatusRecebimento;
  recebido_por: string;
  recebido_em: string;
}

export interface RecebimentoItem {
  id: string;
  recebimento_id: string;
  produto_id: string;
  qtd_esperada: number;
  qtd_recebida: number;
  /** Quantidades originais antes da conversão para a unidade de uso. */
  qtd_esperada_origem?: number;
  qtd_recebida_origem?: number;
  unidade_origem_id?: string;
  fator_conversao_aplicado?: number;
  /** Conta DRE confirmada na conferência (pode diferir do padrão do produto). */
  conta_dre_id?: string;
  validade?: string;
  divergencia?: string;
  foto_url?: string;
}

export type TipoMovimento =
  | "entrada"
  | "baixa"
  | "producao"
  | "perda"
  | "ajuste_balanco"
  | "transferencia_boxes";

export interface MovimentoEstoque {
  id: string;
  produto_id: string;
  caixa_id?: string;
  caixa_origem_id?: string;
  caixa_destino_id?: string;
  lote_id?: string;
  tipo: TipoMovimento;
  motivo?: string;
  quantidade: number; // na unidade de uso; negativo = saída
  validade?: string;
  saldo_fisico_origem_antes?: number;
  saldo_fisico_origem_depois?: number;
  saldo_fisico_destino_antes?: number;
  saldo_fisico_destino_depois?: number;
  recebimento_id?: string;
  usuario_id: string;
  criado_em: string;
  sincronizado: boolean;
}

export interface Balanco {
  id: string;
  tipo: "insumos" | "produzidos";
  status: "em_andamento" | "concluido";
  realizado_por: string;
  iniciado_em: string;
  concluido_em?: string;
}

export interface BalancoItem {
  id: string;
  balanco_id: string;
  caixa_id: string;
  qtd_esperada: number;
  qtd_encontrada: number;
}

export type TipoEventoOperacaoBox =
  | "abertura"
  | "reposicao"
  | "fechamento"
  | "divergencia"
  | "ajuste_inventario"
  | "destinacao_operacional_ativada"
  | "destinacao_operacional_encerrada";

export type StatusDivergenciaOperacaoBox = "aberta" | "justificada" | "ajustada" | "concluida";

export interface EventoOperacaoBox {
  id: string;
  tipo: TipoEventoOperacaoBox;
  box_id: string;
  box_numero: number;
  qr_code: string;
  sessao_id: string;
  produto_id?: string;
  lote_id?: string;
  validade?: string;
  quantidade?: number;
  quantidade_esperada?: number;
  quantidade_contada?: number;
  quantidade_utilizavel?: number;
  necessidade_prevista?: number;
  reposicao_sugerida?: number;
  saldo_anterior?: number;
  saldo_posterior?: number;
  origem_box_id?: string;
  origem_qr_code?: string;
  destino_box_id?: string;
  destino_qr_code?: string;
  delta?: number;
  motivo?: string;
  justificativa?: string;
  status_divergencia?: StatusDivergenciaOperacaoBox;
  evento_referencia_id?: string;
  higienizacao_confirmada?: boolean;
  encerrado_por_id?: string;
  usuario_id: string;
  criado_em: string;
}

export interface PrecoHistorico {
  id: string;
  produto_id: string;
  fornecedor_id: string;
  preco: number;
  origem: "cotacao" | "nota";
  data: string; // ISO date
}

export interface IntegracaoEvento {
  id: string;
  direcao: "enviado" | "recebido";
  tipo: string; // ex: 'estoque_total', 'ficha_tecnica', 'consumo_vendas'
  payload: unknown;
  status: "pendente" | "ok" | "erro";
  tentativas: number;
  criado_em: string;
}

/** Conta bancária do restaurante (origem dos pagamentos). */
export type TipoContaBancaria = "corrente" | "poupanca" | "pagamento";

export interface ContaBancariaRestaurante {
  id: string;
  /** Nome do banco, ex.: Itaú, Bradesco */
  banco: string;
  tipo: TipoContaBancaria;
  /** Apelido opcional, ex.: “conta principal” */
  apelido?: string;
  agencia?: string;
  /** Número da conta (pode ser só final) */
  numero?: string;
  ativa: boolean;
  /** Preferida ao informar pagamento */
  padrao?: boolean;
  criado_em: string;
  atualizado_em: string;
}

/** Origem do arquivo de extrato bancário. */
export type OrigemExtrato = "ofx" | "csv";

/** Status da linha persistida do extrato. */
export type StatusExtratoLinha = "aberta" | "conciliada" | "ignorada";

/** Alvo de conciliação a partir de um débito do extrato. */
export type AlvoExtratoLinha = "boleto" | "rh";

/** Lote de importação de extrato (OFX/CSV). */
export interface ExtratoImportacao {
  id: string;
  conta_bancaria_id?: string;
  origem: OrigemExtrato;
  arquivo_nome: string;
  importado_em: string;
  importado_por: string;
  linhas_total: number;
  debitos: number;
}

/** Movimentação persistida do extrato (não efêmera). */
export interface ExtratoLinha {
  id: string;
  importacao_id: string;
  conta_bancaria_id?: string;
  /** YYYY-MM-DD */
  data: string;
  /** Valor com sinal: negativo = débito (saída). */
  valor: number;
  tipo: "debito" | "credito" | "outro";
  descricao: string;
  /** ID estável do OFX — usado para dedupe. */
  fitid?: string;
  status: StatusExtratoLinha;
  alvo?: AlvoExtratoLinha;
  alvo_id?: string;
  conciliado_em?: string;
  conciliado_por?: string;
  observacao?: string;
}

/** Parâmetros de RH aplicados só após confirmar uma norma. */
export type ParametroNormaRh = "antecedencia_minima_dias";

export type StatusNormaRh = "pendente" | "aplicada" | "ignorada";

/** Configuração vigente do RH (escala, ponto, normas). */
export interface ConfigRh {
  /** Dias corridos mínimos entre convocação e serviço (padrão legal/demo: 3). */
  antecedencia_minima_dias: number;
  /** Horas após o fim do plantão para avisar falta de batida (padrão: 24). */
  aviso_ponto_horas: number;
  /**
   * Minutos de folga no espelho antes de marcar atraso / saída antecipada (padrão: 10).
   * Ex.: entrada 5 min depois do previsto com tolerância 10 → OK.
   */
  tolerancia_atraso_minutos: number;
  /** Conexão com REP Control iD (rede local do restaurante). */
  control_id?: ConfigControlId;
  atualizado_em: string;
}

/** Credenciais / host do REP iDClass (API HTTPS local). */
export interface ConfigControlId {
  /** IP ou hostname, sem protocolo (ex.: 192.168.0.129). */
  host: string;
  login: string;
  /** Senha do painel do relógio (mock local — não usar em produção compartilhada). */
  password: string;
  /** Usar mode=671 na exportação AFD (recomendado). */
  mode_671: boolean;
  ultima_sync_em?: string;
  /** Último NSR sincronizado (sync incremental). */
  ultimo_nsr?: number;
}

/**
 * Norma/publicação detectada para revisão humana.
 * Na demo, a “varredura” usa um catálogo interno; em produção viria de DOU/eSocial.
 */
export interface NormaRh {
  id: string;
  /** Chave estável da publicação (evita duplicar na verificação). */
  chave_fonte: string;
  titulo: string;
  resumo: string;
  /** Órgão ou fonte (ex.: DOU, eSocial, MTE). */
  fonte: string;
  /** URL oficial quando houver. */
  url_fonte?: string;
  /** Data da publicação YYYY-MM-DD. */
  publicado_em: string;
  /** Vigência sugerida YYYY-MM-DD. */
  vigencia_em?: string;
  relevancia: "alta" | "media" | "baixa";
  status: StatusNormaRh;
  /** Se preenchido, Confirmar aplica esse parâmetro no config_rh. */
  parametro?: ParametroNormaRh;
  valor_proposto?: number | string;
  valor_anterior?: number | string;
  detectado_em: string;
  revisado_em?: string;
  revisado_por?: string;
  criado_em: string;
  atualizado_em: string;
}

export type TipoBatidaPonto = "entrada" | "saida" | "intervalo_inicio" | "intervalo_fim";

export type OrigemBatidaPonto = "relogio" | "manual" | "aprovacao";

/** Batida de ponto (relógio, manual ou após aprovação da pendência). */
export interface BatidaPonto {
  id: string;
  pessoa_id: string;
  /** YYYY-MM-DD */
  data: string;
  /** HH:MM */
  hora: string;
  tipo: TipoBatidaPonto;
  origem: OrigemBatidaPonto;
  /** Vínculo com pendência que gerou a batida (se origem aprovacao). */
  pendencia_id?: string;
  criado_em: string;
  atualizado_em: string;
}

export type TipoFaltaPonto = "entrada" | "saida" | "ambos";

export type StatusPendenciaPonto =
  | "aguardando_aviso"
  | "aguardando_funcionario"
  | "proposta"
  | "aprovada"
  | "recusada"
  | "cancelada";

/**
 * Falta de digital detectada após o prazo (ex.: 24h).
 * Funcionário propõe horário; gestor confirma antes de gravar no espelho.
 */
export interface PendenciaPonto {
  id: string;
  pessoa_id: string;
  escala_slot_id?: string;
  /** Dia do plantão YYYY-MM-DD */
  data: string;
  tipo_falta: TipoFaltaPonto;
  horario_previsto_entrada?: string;
  horario_previsto_saida?: string;
  status: StatusPendenciaPonto;
  texto_aviso?: string;
  aviso_em?: string;
  proposta_entrada?: string;
  proposta_saida?: string;
  proposta_motivo?: string;
  proposta_em?: string;
  revisado_em?: string;
  revisado_por?: string;
  criado_em: string;
  atualizado_em: string;
}

/** Categoria da anotação livre no perfil. */
export type TipoAnotacaoPessoaRh = "elogio" | "aviso" | "observacao";

/** Nota livre no histórico da pessoa (faltas leves, elogios, observações). */
export interface AnotacaoPessoaRh {
  id: string;
  pessoa_id: string;
  /** Data de referência YYYY-MM-DD. */
  data: string;
  tipo: TipoAnotacaoPessoaRh;
  texto: string;
  autor?: string;
  criado_em: string;
  atualizado_em: string;
}

/** Nota formal 1–5 em avaliação periódica. */
export type NotaAvaliacaoPessoaRh = 1 | 2 | 3 | 4 | 5;

/** Avaliação formal no perfil (ciclos mensais; distinto de anotações livres). */
export interface AvaliacaoPessoaRh {
  id: string;
  pessoa_id: string;
  /** Competência YYYY-MM. */
  competencia: string;
  nota: NotaAvaliacaoPessoaRh;
  comentario?: string;
  avaliador?: string;
  criado_em: string;
  atualizado_em: string;
}


// Banco completo em memória (camada mock)
export interface DB {
  perfis: Perfil[];
  pessoas: PessoaRH[];
  pagamentos_pessoas: PagamentoPessoa[];
  consumos_pessoas: ConsumoPessoa[];
  /** Histórico livre no perfil (anotações). */
  anotacoes_pessoas?: AnotacaoPessoaRh[];
  /** Avaliações formais (nota 1–5 por competência). */
  avaliacoes_pessoas?: AvaliacaoPessoaRh[];
  escala_slots: EscalaSlot[];
  convocacoes: ConvocacaoIntermitente[];
  /** Contas de onde o restaurante paga (origem). */
  contas_bancarias: ContaBancariaRestaurante[];
  /** Lotes de importação de extrato bancário. */
  extrato_importacoes?: ExtratoImportacao[];
  /** Linhas persistidas do extrato (débitos/créditos). */
  extrato_linhas?: ExtratoLinha[];
  /** Parâmetros RH vigentes (normas + ponto). */
  config_rh?: ConfigRh;
  /** Fila de normas detectadas para revisão. */
  normas_rh?: NormaRh[];
  /** Batidas importadas do relógio ou aprovadas. */
  batidas_ponto?: BatidaPonto[];
  /** Faltas de ponto aguardando aviso / proposta / confirmação. */
  pendencias_ponto?: PendenciaPonto[];
  unidades: Unidade[];
  fornecedores: Fornecedor[];
  categorias_produtos: CategoriaProduto[];
  produtos: Produto[];
  /**
   * Uma vez true, a limpeza automática de produtos com nome em
   * título/minúsculas (mantendo CAIXA ALTA da NF) já foi aplicada.
   * v2 inclui também produzidos/porcionados (ex.: "4 Queijos G").
   */
  produtos_limpeza_nome_titulo_v1?: boolean;
  produtos_limpeza_nome_titulo_v2?: boolean;
  /** Uma vez true, reativou produtos desativados pela limpeza de nomes em título. */
  produtos_restauracao_nome_titulo_v1?: boolean;
  /**
   * Uma vez true, reaplicou a limpeza (Title Case fora; CAIXA ALTA fica)
   * após a restauração indevida.
   */
  produtos_limpeza_nome_titulo_v3?: boolean;
  /** Uma vez true, já sugeriu conta DRE nos produtos que estavam sem classificação. */
  produtos_sugestao_conta_dre_v1?: boolean;
  produto_codigos_barras: ProdutoCodigoBarras[];
  fornecedor_produtos: FornecedorProduto[];
  locais: Local[];
  /** Tipos de local cadastráveis (freezer, geladeira, customizados…). */
  tipos_local?: TipoLocalCadastro[];
  caixas: Caixa[];
  lotes_estoque: LoteEstoque[];
  alocacoes_caixa: AlocacaoCaixa[];
  listas_compras: ListaCompras[];
  lista_itens: ListaItem[];
  cotacoes: Cotacao[];
  cotacao_itens: CotacaoItem[];
  pedidos: Pedido[];
  pedido_itens: PedidoItem[];
  notas_fiscais: NotaFiscal[];
  boletos: Boleto[];
  boleto_pagamentos_historico: HistoricoPagamentoBoleto[];
  contas_pagar: ContaPagar[];
  conta_pagar_historico: ContaPagarHistorico[];
  documentos_boleto: DocumentoBoleto[];
  recebimentos: Recebimento[];
  recebimento_itens: RecebimentoItem[];
  movimentos_estoque: MovimentoEstoque[];
  balancos: Balanco[];
  balanco_itens: BalancoItem[];
  eventos_box_operacional: EventoOperacaoBox[];
  precos_historico: PrecoHistorico[];
  integracao_eventos: IntegracaoEvento[];
  fichas_tecnicas_receitas?: ReceitaFichaTecnica[];
  fichas_tecnicas_versoes?: ReceitaFichaTecnicaVersao[];
  fichas_tecnicas?: FichaTecnica[];
  ficha_tecnica_custo_snapshots?: FichaTecnicaCustoSnapshot[];
  /** Ids de fichas excluídas pelo usuário (impede reinserção do seed Italian). */
  fichas_tecnicas_excluidas_ids?: string[];
  /** Promoção Tour Londrina (CMV de combo separado dos canais). */
  tour_londrina?: ConfigTourLondrina;
  /** Fechamentos diários (CMV ponderado, Prime Cost, sobra). */
  fechamentos_dia?: FechamentoDia[];
  /** Plano de contas do DRE gerencial. */
  contas_dre?: ContaDre[];
  /** Equipamentos / imobilizado (depreciação mensal no DRE). */
  equipamentos?: Equipamento[];
}

/** Grupos do DRE gerencial (ordem de apresentação). */
export type GrupoContaDre =
  | "receitas"
  | "deducoes"
  | "custos_variaveis"
  | "fixo_operacao"
  | "fixo_ocupacao"
  | "fixo_pessoal"
  | "pessoal_variavel";

export interface ContaDre {
  id: string;
  grupo: GrupoContaDre;
  codigo: string;
  nome: string;
  ordem: number;
  ativo: boolean;
}

/** Imobilizado: compra não vira despesa; entra a depreciação mensal. */
export interface Equipamento {
  id: string;
  nome: string;
  valor_aquisicao: number;
  /** YYYY-MM-DD — início da depreciação. */
  data_inicio: string;
  /** Vida útil em meses (depreciação linear = valor ÷ meses). */
  vida_util_meses: number;
  /** Conta DRE da depreciação (padrão: operação / depreciação). */
  conta_dre_id?: string;
  observacao?: string;
  ativo: boolean;
}

export interface LinhaDrePeriodo {
  conta_id: string;
  grupo: GrupoContaDre;
  codigo: string;
  nome: string;
  valor: number;
}

export interface ResultadoDrePeriodo {
  ano_mes: string;
  linhas: LinhaDrePeriodo[];
  totais_por_grupo: Partial<Record<GrupoContaDre, number>>;
  receita_bruta: number;
  deducoes: number;
  receita_liquida: number;
  custos_variaveis: number;
  fixo_operacao: number;
  fixo_ocupacao: number;
  fixo_pessoal: number;
  pessoal_variavel: number;
  depreciacao_mes: number;
  resultado: number;
  /** CMV teórico dos fechamentos (vendas × custo da ficha). */
  cmv_fichas: number;
  /** Compras do mês de produtos com entra_no_cmv (food). */
  cmv_compras_food: number;
}

export type CanalFechamentoDia = "balcao" | "ifood" | "delivery_99";

export interface VendaPratoFechamentoDia {
  id: string;
  receita_id: string;
  nome: string;
  canal: CanalFechamentoDia;
  quantidade: number;
  /** Preço unitário praticado no canal (snapshot). */
  preco_unitario: number;
  /** Custo unitário da ficha (snapshot). */
  custo_unitario: number;
  /** Taxa % do canal no momento do lançamento. */
  taxa_percentual: number;
  /** Taxa fixa por unidade (se houver). */
  taxa_fixa: number;
}

export interface MaoObraFechamentoDia {
  id: string;
  pessoa_id: string;
  nome: string;
  tipo: "fixo_rateado" | "freela";
  valor: number;
  horas?: number;
}

/** Lançamento do dia: vendas + mão de obra + motoboy → índices. */
export interface FechamentoDia {
  id: string;
  /** YYYY-MM-DD */
  data: string;
  vendas: VendaPratoFechamentoDia[];
  mao_obra: MaoObraFechamentoDia[];
  /** Custo de motoboys / delivery próprio no dia. */
  custo_motoboy: number;
  /** Divisor para ratear salário mensal no dia (padrão 30). */
  dias_rateio_folha: number;
  observacao?: string;
  criado_em: string;
  atualizado_em: string;
}

export interface AdicionalTourLondrina {
  id: string;
  nome: string;
  preco_venda: number;
  custo: number;
}

export interface ConfigTourLondrina {
  pratos_elegiveis_ids: string[];
  adicionais_padrao: AdicionalTourLondrina[];
  atualizado_em?: string;
}

export type FichaTecnicaStatus = "rascunho" | "publicada" | "arquivada";

export type TipoReceitaFichaTecnica = "prato" | "sub_receita";

export type DificuldadeReceitaFichaTecnica = "facil" | "media" | "dificil";

/**
 * Canais ativos: balcao (= loja/Saipos/salão), ifood, delivery_99.
 * `salao` e `delivery_proprio` permanecem só por compatibilidade com fichas antigas.
 */
export type CanalVendaFichaTecnica =
  | "balcao"
  | "ifood"
  | "delivery_99"
  | "salao"
  | "delivery_proprio";

export type TipoMidiaFichaTecnica = "FOTO" | "VIDEO";

export type OrigemMidiaFichaTecnica = "ARQUIVO_LOCAL_TEMPORARIO" | "URL_EXTERNA";

export interface FichaTecnicaMidia {
  id: string;
  versao_id: string;
  tipo: TipoMidiaFichaTecnica;
  origem: OrigemMidiaFichaTecnica;
  nome_arquivo?: string;
  mime_type?: string;
  tamanho_bytes?: number;
  url: string;
  passo_id?: string;
  criado_em: string;
}

export interface FichaTecnicaCanalPreco {
  canal: CanalVendaFichaTecnica;
  preco_praticado: number;
  taxa_percentual: number;
  taxa_fixa: number;
  impostos_percentual: number;
  cmv_desejado_percentual: number;
}

export type TipoIngrediente = "PRODUTO" | "SUB_RECEITA";

export type PresencaAlergenico = "CONTEM" | "PODE_CONTER" | "NAO_INFORMADO";

export interface FichaTecnicaAlergenicos {
  gluten: PresencaAlergenico;
  lactose: PresencaAlergenico;
  ovos: PresencaAlergenico;
  peixes: PresencaAlergenico;
  crustaceos: PresencaAlergenico;
  soja: PresencaAlergenico;
  castanhas: PresencaAlergenico;
  amendoim: PresencaAlergenico;
  outros?: { nome: string; presenca: PresencaAlergenico }[];
}

export type OrigemInformacaoNutricional = "MANUAL" | "PDF" | "PLANILHA" | "CALCULADA" | "LAUDO";

export type StatusInformacaoNutricional =
  | "estimado"
  | "conferido"
  | "validado_por_nutricionista"
  | "validado_por_laudo";

export type UnidadeLinhaNutricional = "kcal" | "kJ" | "g" | "mg";

export type CodigoLinhaNutricional =
  | "valor_energetico_kcal"
  | "valor_energetico_kj"
  | "carboidratos_g"
  | "acucares_totais_g"
  | "acucares_adicionados_g"
  | "proteinas_g"
  | "gorduras_totais_g"
  | "gorduras_saturadas_g"
  | "gorduras_trans_g"
  | "fibra_alimentar_g"
  | "sodio_mg";

export interface LinhaInformacaoNutricional {
  codigo: CodigoLinhaNutricional;
  rotulo: string;
  unidade: UnidadeLinhaNutricional;
  valor_por_100: number | null;
  valor_por_porcao: number | null;
  vd_por_100?: number | null;
  vd_por_porcao?: number | null;
  ajuste_manual_por_100?: boolean;
  ajuste_manual_por_porcao?: boolean;
}

export interface InformacaoNutricional {
  origem: OrigemInformacaoNutricional;
  fonte_descricao: string;
  data_referencia?: string;
  responsavel?: string;
  status_validacao: StatusInformacaoNutricional;
  ultima_alteracao_em?: string;
  observacoes?: string;
  tamanho_porcao?: number;
  unidade_porcao?: "g" | "ml";
  medida_caseira?: string;
  quantidade_porcoes?: number;
  peso_volume_final?: number;
  unidade_peso_volume_final?: "g" | "ml";
  linhas: LinhaInformacaoNutricional[];
}

export interface PegadaCarbono {
  co2_equivalente_g?: number; // legado: CO2 equivalente em gramas
  categoria_impacto?: "baixo" | "medio" | "alto"; // legado
  valor_co2e?: number;
  unidade_referencia?: "kgCO2e/kg" | "kgCO2e/l" | "kgCO2e/un" | string;
  fonte?: string;
  data_referencia?: string;
  metodologia?: string;
  observacao?: string;
}

export interface FichaTecnicaPorcoesConfig {
  quantidade_porcoes: number; // rendimento em porções
  peso_por_porcao?: number; // peso ou volume por porção
  unidade_porcao_id?: string; // id da unidade da porção (ex: g, ml)
}

export interface FichaTecnicaConfiguracaoPorcionamento {
  id: string;
  codigo?: string;
  nome: string;
  quantidade_por_porcao: number;
  unidade: string;
  quantidade_porcoes_teorica: number;
  ativa: boolean;
  embalagem_nome?: string;
  custo_embalagem_centavos?: number;
}

export interface FichaTecnicaIngredienteConversaoSnapshot {
  unidade_informada: string;
  unidade_base: string;
  fator_conversao_aplicado: number;
  quantidade_convertida: number;
  origem_conversao: string;
  snapshot_em: string;
}

export interface FichaTecnicaIngrediente {
  id: string;
  tipo: TipoIngrediente;
  produto_id?: string; // FK -> produtos.id (se tipo === 'PRODUTO')
  sub_receita_id?: string; // FK -> fichas_tecnicas.id (se tipo === 'SUB_RECEITA')
  sub_receita_versao?: string; // versão esperada da sub-receita (opcional)
  quantidade: number; // na unidade informada abaixo
  quantidade_bruta?: number;
  quantidade_liquida?: number;
  fator_correcao?: number;
  percentual_perda?: number;
  unidade_id: string; // FK -> unidades.id
  fornecedor_referencia_id?: string;
  custo_historico_snapshot?: number; // custo do ingrediente em centavos no momento em que a ficha foi publicada
  conversao_snapshot?: FichaTecnicaIngredienteConversaoSnapshot;
}

export interface FichaTecnicaPassoItemIngrediente {
  ingrediente_receita_id: string;
  quantidade_utilizada?: number;
  unidade?: string;
  observacao?: string;
}

export interface FichaTecnicaPasso {
  id?: string;
  ordem: number; // 1, 2, 3...
  titulo?: string;
  descricao: string;
  foto_url?: string;
  tempo_minutos?: number;
  temperatura_celsius?: number;
  itens_ingredientes?: FichaTecnicaPassoItemIngrediente[];
}

export interface FichaTecnica {
  id: string;
  codigo_externo?: string; // código para integração com ERP EaseEat
  nome: string;
  descricao?: string;
  foto_url?: string;
  tipo_receita?: TipoReceitaFichaTecnica;
  categoria_id?: string;
  dificuldade?: DificuldadeReceitaFichaTecnica;
  tempo_preparo_minutos?: number;
  tempo_coccao_minutos?: number;
  equipamentos?: string[];
  instrucoes_armazenamento?: string;
  status: FichaTecnicaStatus;
  versao: string; // ex: "1.0.0"
  rendimento_quantidade: number; // ex: 1.5 (quilos)
  rendimento_unidade_id: string; // FK -> unidades.id (ex: id de 'kg' ou 'L')
  configuracoes_porcionamento?: FichaTecnicaConfiguracaoPorcionamento[];
  porcionamento_ativo_id?: string;
  porcoes_config?: FichaTecnicaPorcoesConfig;
  canais_preco?: FichaTecnicaCanalPreco[];
  custo_preparacao_centavos?: number;
  custo_coccao_centavos?: number;
  custo_montagem_centavos?: number;
  ingredientes: FichaTecnicaIngrediente[];
  passos: FichaTecnicaPasso[];
  midias?: FichaTecnicaMidia[];
  alergenicos: FichaTecnicaAlergenicos;
  informacao_nutricional?: InformacaoNutricional;
  pegada_carbono?: PegadaCarbono;
  criado_em: string; // ISO datetime
  atualizado_em: string; // ISO datetime
}

export interface ReceitaFichaTecnica {
  id: string;
  codigo: string;
  nome: string;
  descricao?: string;
  tipo?: TipoReceitaFichaTecnica;
  categoria_id?: string;
  versao_vigente_id?: string;
  criado_por?: string;
  atualizado_por?: string;
  criado_em: string; // ISO datetime
  atualizado_em: string; // ISO datetime
}

export interface EventoHistoricoReceitaVersao {
  id: string;
  versao_id: string;
  acao: "criacao" | "alteracao_rascunho" | "publicacao";
  responsavel: string;
  em: string;
  detalhes?: string;
}

export interface ReceitaFichaTecnicaVersao {
  id: string;
  receita_id: string;
  numero_versao: string;
  status: FichaTecnicaStatus;
  rendimento_total?: number;
  unidade_rendimento?: string;
  configuracoes_porcionamento?: FichaTecnicaConfiguracaoPorcionamento[];
  ficha: FichaTecnica;
  criado_por?: string;
  atualizado_por?: string;
  publicado_por?: string;
  publicada_em?: string; // ISO datetime
  snapshot_custo_id?: string;
  historico?: EventoHistoricoReceitaVersao[];
  criado_em: string; // ISO datetime
  atualizado_em: string; // ISO datetime
}

export interface IngredienteCustoDetalhe {
  tipo: TipoIngrediente;
  id: string; // produto_id ou sub_receita_id
  nome: string;
  quantidade: number;
  unidade_sigla: string;
  custo_unitario_periodo: number; // em centavos
  custo_calculado: number; // em centavos
}

export interface FichaTecnicaCustoSnapshot {
  id: string;
  ficha_tecnica_id: string;
  versao: string;
  custo_total: number; // custo total em centavos
  custo_por_porcao: number; // custo por porção em centavos (0 se não configurado)
  custos_por_configuracao_porcionamento?: {
    configuracao_id: string;
    configuracao_codigo?: string;
    nome: string;
    custo_por_porcao: number;
    quantidade_porcoes_teorica: number;
    unidade: string;
  }[];
  custo_por_unidade_rendimento: number; // custo por unidade de rendimento em centavos
  calculado_em: string; // ISO datetime
  detalhes_ingredientes: IngredienteCustoDetalhe[];
}
