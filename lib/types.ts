// Tipos do domínio — espelham docs/01-banco-de-dados.md (Supabase).
// Enquanto o Supabase não está configurado, os mesmos tipos alimentam a camada mock (lib/data).

export type Papel = "dono" | "gerente" | "lider" | "caixa";

export interface Perfil {
  id: string;
  nome: string;
  papel: Papel;
  ativo: boolean;
}

export interface Unidade {
  id: string;
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

export interface Produto {
  id: string;
  codigo_externo?: string;
  nome: string;
  categoria?: string;
  tipo: TipoProduto;
  unidade_compra_id?: string;
  unidade_uso_id: string;
  fator_conversao: number; // 1 unid. de compra = X unid. de uso
  codigo_barras?: string;
  estoque_minimo: number; // na unidade de uso
  validade_padrao_dias?: number;
  ativo: boolean;
}

export interface FornecedorProduto {
  id: string;
  fornecedor_id: string;
  produto_id: string;
  ultimo_preco?: number;
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

export interface NotaFiscal {
  id: string;
  fornecedor_id: string;
  pedido_id?: string;
  numero: string;
  chave_acesso: string;
  xml_url?: string;
  valor_total: number;
  emitida_em: string;
  importada_em: string;
  status: StatusNota;
  origem?: "manual" | "receita"; // 'receita' = baixada automaticamente pelo certificado
  itens_importados?: ItemNotaImportada[];
}

export type StatusBoleto = "travado" | "liberado" | "pago" | "suspeito";

export interface Boleto {
  id: string;
  nota_id: string;
  valor: number;
  vencimento: string; // ISO date
  cnpj_beneficiario?: string;
  linha_digitavel?: string;
  status: StatusBoleto;
  observacao?: string;
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

// Banco completo em memória (camada mock)
export interface DB {
  perfis: Perfil[];
  unidades: Unidade[];
  fornecedores: Fornecedor[];
  produtos: Produto[];
  fornecedor_produtos: FornecedorProduto[];
  locais: Local[];
  caixas: Caixa[];
  listas_compras: ListaCompras[];
  lista_itens: ListaItem[];
  cotacoes: Cotacao[];
  cotacao_itens: CotacaoItem[];
  pedidos: Pedido[];
  pedido_itens: PedidoItem[];
  notas_fiscais: NotaFiscal[];
  boletos: Boleto[];
  recebimentos: Recebimento[];
  recebimento_itens: RecebimentoItem[];
  movimentos_estoque: MovimentoEstoque[];
  balancos: Balanco[];
  balanco_itens: BalancoItem[];
  precos_historico: PrecoHistorico[];
  integracao_eventos: IntegracaoEvento[];
}
