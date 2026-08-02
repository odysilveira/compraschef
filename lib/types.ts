// Tipos do domínio — espelham docs/01-banco-de-dados.md (Supabase).
// Enquanto o Supabase não está configurado, os mesmos tipos alimentam a camada mock (lib/data).

export type Papel = "dono" | "gerente" | "lider" | "caixa";

export interface Perfil {
  id: string;
  nome: string;
  papel: Papel;
  ativo: boolean;
}

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
  ultimo_preco?: number;
  ultimo_preco_unidade_id?: string;
  atualizado_em?: string;
}

export type TipoLocal = "freezer" | "geladeira" | "prateleira" | "despensa";

export interface Local {
  id: string;
  nome: string;
  tipo: TipoLocal;
}

export type StatusCaixa = "vazia" | "cheia" | "em_uso";

export interface Caixa {
  id: string;
  numero: number;
  qr_code: string; // QR fixo da caixa física
  status: StatusCaixa;
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

export interface NotaFiscal {
  id: string;
  fornecedor_id: string;
  pedido_id?: string;
  numero: string;
  chave_acesso: string;
  cnpj_emitente?: string;
  razao_social_emitente?: string;
  xml_url?: string;
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

export interface Boleto {
  id: string;
  nota_id: string;
  numero_parcela?: string;
  valor: number;
  vencimento: string; // ISO date
  cnpj_beneficiario?: string;
  linha_digitavel?: string;
  status: StatusBoleto;
  documento_boleto_id?: string;
  status_conferencia?: "aguardando_documento" | "conferido" | "em_analise";
  conferido_em?: string;
  conferido_por?: string;
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
  observacao?: string;
}

export interface HistoricoPagamentoBoleto {
  id: string;
  boleto_id: string;
  nota_id: string;
  acao: "pagamento_informado" | "conciliado" | "divergencia_registrada";
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

export type OrigemContaPagar = "nfe" | "manual" | "recorrente";

export interface ContaPagar {
  id: string;
  fornecedor_id?: string;
  descricao: string;
  origem: OrigemContaPagar;
  documento_id?: string;
  categoria: string;
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
  validade?: string;
  divergencia?: string;
  foto_url?: string;
}

export type TipoMovimento = "entrada" | "baixa" | "producao" | "perda" | "ajuste_balanco";

export interface MovimentoEstoque {
  id: string;
  produto_id: string;
  caixa_id?: string;
  tipo: TipoMovimento;
  quantidade: number; // na unidade de uso; negativo = saída
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

// Banco completo em memória (camada mock)
export interface DB {
  perfis: Perfil[];
  pessoas: PessoaRH[];
  pagamentos_pessoas: PagamentoPessoa[];
  consumos_pessoas: ConsumoPessoa[];
  escala_slots: EscalaSlot[];
  convocacoes: ConvocacaoIntermitente[];
  /** Contas de onde o restaurante paga (origem). */
  contas_bancarias: ContaBancariaRestaurante[];
  unidades: Unidade[];
  fornecedores: Fornecedor[];
  categorias_produtos: CategoriaProduto[];
  produtos: Produto[];
  produto_codigos_barras: ProdutoCodigoBarras[];
  fornecedor_produtos: FornecedorProduto[];
  locais: Local[];
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
  precos_historico: PrecoHistorico[];
  integracao_eventos: IntegracaoEvento[];
  fichas_tecnicas_receitas?: ReceitaFichaTecnica[];
  fichas_tecnicas_versoes?: ReceitaFichaTecnicaVersao[];
  fichas_tecnicas?: FichaTecnica[];
  ficha_tecnica_custo_snapshots?: FichaTecnicaCustoSnapshot[];
}

export type FichaTecnicaStatus = "rascunho" | "publicada" | "arquivada";

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

export interface InformacaoNutricional {
  valor_energetico_kcal?: number;
  carboidratos_g?: number;
  proteinas_g?: number;
  gorduras_totais_g?: number;
  gorduras_saturadas_g?: number;
  gorduras_trans_g?: number;
  fibra_alimentar_g?: number;
  sodio_mg?: number;
}

export interface PegadaCarbono {
  co2_equivalente_g?: number; // CO2 equivalente em gramas
  categoria_impacto?: "baixo" | "medio" | "alto";
}

export interface FichaTecnicaPorcoesConfig {
  quantidade_porcoes: number; // rendimento em porções
  peso_por_porcao?: number; // peso ou volume por porção
  unidade_porcao_id?: string; // id da unidade da porção (ex: g, ml)
}

export interface FichaTecnicaIngrediente {
  id: string;
  tipo: TipoIngrediente;
  produto_id?: string; // FK -> produtos.id (se tipo === 'PRODUTO')
  sub_receita_id?: string; // FK -> fichas_tecnicas.id (se tipo === 'SUB_RECEITA')
  sub_receita_versao?: string; // versão esperada da sub-receita (opcional)
  quantidade: number; // na unidade informada abaixo
  unidade_id: string; // FK -> unidades.id
  custo_historico_snapshot?: number; // custo do ingrediente em centavos no momento em que a ficha foi publicada
}

export interface FichaTecnicaPasso {
  ordem: number; // 1, 2, 3...
  descricao: string;
  foto_url?: string;
  tempo_minutos?: number;
}

export interface FichaTecnica {
  id: string;
  codigo_externo?: string; // código para integração com ERP EaseEat
  nome: string;
  descricao?: string;
  status: FichaTecnicaStatus;
  versao: string; // ex: "1.0.0"
  rendimento_quantidade: number; // ex: 1.5 (quilos)
  rendimento_unidade_id: string; // FK -> unidades.id (ex: id de 'kg' ou 'L')
  porcoes_config?: FichaTecnicaPorcoesConfig;
  ingredientes: FichaTecnicaIngrediente[];
  passos: FichaTecnicaPasso[];
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
  versao_vigente_id?: string;
  criado_em: string; // ISO datetime
  atualizado_em: string; // ISO datetime
}

export interface ReceitaFichaTecnicaVersao {
  id: string;
  receita_id: string;
  numero_versao: string;
  status: FichaTecnicaStatus;
  ficha: FichaTecnica;
  publicada_em?: string; // ISO datetime
  snapshot_custo_id?: string;
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
  custo_por_unidade_rendimento: number; // custo por unidade de rendimento em centavos
  calculado_em: string; // ISO datetime
  detalhes_ingredientes: IngredienteCustoDetalhe[];
}
