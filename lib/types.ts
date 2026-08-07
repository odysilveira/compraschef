// Tipos do domínio — espelham docs/01-banco-de-dados.md (Supabase).
// Enquanto o Supabase não está configurado, os mesmos tipos alimentam a camada mock (lib/data).

export type Papel = "dono" | "gerente" | "lider" | "caixa";

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
  observacao?: string;
}

export interface HistoricoPagamentoBoleto {
  id: string;
  boleto_id: string;
  nota_id: string;
  acao: "pagamento_informado";
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

// Banco completo em memória (camada mock)
export interface DB {
  perfis: Perfil[];
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
  eventos_box_operacional: EventoOperacaoBox[];
  precos_historico: PrecoHistorico[];
  integracao_eventos: IntegracaoEvento[];
  fichas_tecnicas_receitas?: ReceitaFichaTecnica[];
  fichas_tecnicas_versoes?: ReceitaFichaTecnicaVersao[];
  fichas_tecnicas?: FichaTecnica[];
  ficha_tecnica_custo_snapshots?: FichaTecnicaCustoSnapshot[];
}

export type FichaTecnicaStatus = "rascunho" | "publicada" | "arquivada";

export type TipoReceitaFichaTecnica = "prato" | "sub_receita";

export type DificuldadeReceitaFichaTecnica = "facil" | "media" | "dificil";

export type CanalVendaFichaTecnica = "salao" | "balcao" | "delivery_proprio" | "ifood";

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
