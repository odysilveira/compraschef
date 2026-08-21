import type { DB } from "@/lib/types";
import { LOCAL_ESTOQUE_SECO, LOCAL_GELADEIRA_2, produtosReais, UNIDADE_SACO } from "./catalogo";

// Datas relativas a "hoje" para a demonstração ficar sempre atual.
// Horário fixado ao meio-dia para servidor e navegador gerarem o MESMO valor
// (evita aviso de hidratação quando o minuto vira entre as duas renderizações).
function diasAtras(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
}
function diasAFrente(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
}
function soData(iso: string): string {
  return iso.slice(0, 10);
}

export const seedDB: DB = {
  perfis: [
    { id: "perfil-dono", nome: "Ody", papel: "dono", ativo: true },
    { id: "perfil-gerente", nome: "Márcia", papel: "gerente", ativo: true },
    { id: "perfil-lider", nome: "João", papel: "lider", ativo: true },
    { id: "perfil-caixa", nome: "Ana", papel: "caixa", ativo: true },
  ],

  unidades: [
    { id: "un-kg", codigo_externo: "KG", nome: "quilograma", sigla: "kg" },
    { id: "un-l", codigo_externo: "L", nome: "litro", sigla: "L" },
    { id: "un-un", codigo_externo: "UN", nome: "unidade", sigla: "un" },
    { id: "un-cx", codigo_externo: "CX", nome: "caixa", sigla: "cx" },
    { id: "un-fd", codigo_externo: "FD", nome: "fardo", sigla: "fd" },
    UNIDADE_SACO,
  ],

  categorias_produtos: [
    { id: "cat-sem-categoria", nome: "Sem categoria", codigo: "sem-categoria", ativo: true },
    { id: "cat-hortifruti", nome: "Hortifrúti", codigo: "hortifruti", ativo: true },
    { id: "cat-carnes", nome: "Carnes", codigo: "carnes", ativo: true },
    { id: "cat-laticinios", nome: "Laticínios", codigo: "laticinios", ativo: true },
    { id: "cat-mercearia", nome: "Mercearia", codigo: "mercearia", ativo: true },
    { id: "cat-producao", nome: "Produção", codigo: "producao", ativo: true },
  ],

  fornecedores: [
    {
      id: "forn-hortifruti",
      codigo_externo: "F001",
      nome: "Hortifruti São José",
      cnpj: "12.345.678/0001-90",
      whatsapp: "(11) 98888-1111",
      email: "vendas@hortisaojose.com.br",
      contato_nome: "Seu José",
      prazo_entrega_dias: 1,
      pedido_minimo: 150,
      dias_atendimento: "seg a sáb",
      horario_atendimento: "05h às 12h",
      forma_pagamento: "pix",
      ativo: true,
    },
    {
      id: "forn-frigorifico",
      codigo_externo: "F002",
      nome: "Frigorífico Boi Feliz",
      cnpj: "23.456.789/0001-01",
      whatsapp: "(11) 97777-2222",
      email: "pedidos@boifeliz.com.br",
      contato_nome: "Carlos",
      prazo_entrega_dias: 2,
      pedido_minimo: 400,
      dias_atendimento: "seg a sex",
      horario_atendimento: "08h às 17h",
      forma_pagamento: "boleto",
      prazo_boleto_dias: 28,
      ativo: true,
    },
    {
      id: "forn-distribuidora",
      codigo_externo: "F003",
      nome: "Distribuidora Ranchão",
      cnpj: "34.567.890/0001-12",
      whatsapp: "(11) 96666-3333",
      email: "comercial@ranchao.com.br",
      contato_nome: "Fernanda",
      prazo_entrega_dias: 3,
      pedido_minimo: 300,
      dias_atendimento: "seg a sex",
      horario_atendimento: "08h às 18h",
      forma_pagamento: "boleto",
      prazo_boleto_dias: 21,
      ativo: true,
    },
    {
      id: "forn-laticinios",
      codigo_externo: "F004",
      nome: "Laticínios Serra Azul",
      cnpj: "45.678.901/0001-23",
      whatsapp: "(11) 95555-4444",
      email: "vendas@serrazul.com.br",
      contato_nome: "Dona Rita",
      prazo_entrega_dias: 2,
      pedido_minimo: 200,
      dias_atendimento: "ter e qui",
      horario_atendimento: "07h às 15h",
      forma_pagamento: "boleto",
      prazo_boleto_dias: 14,
      ativo: true,
    },
    // Cadastro real para testar import do boleto PDF (CNPJ 37.681.455/0001-20)
    {
      id: "forn-adg-cakes",
      codigo_externo: "F005",
      nome: "ADG Cakes Embalagens",
      cnpj: "37.681.455/0001-20",
      forma_pagamento: "boleto",
      prazo_boleto_dias: 14,
      ativo: true,
    },
  ],

  produtos: [
    // Comprados
    { id: "prod-tomate", codigo_externo: "P101", nome: "Tomate italiano", categoria: "hortifrúti", tipo: "comprado", unidade_compra_id: "un-cx", unidade_uso_id: "un-kg", fator_conversao: 20, codigo_barras: "7891000100101", estoque_minimo: 10, validade_padrao_dias: 7, ativo: true },
    { id: "prod-cebola", codigo_externo: "P102", nome: "Cebola", categoria: "hortifrúti", tipo: "comprado", unidade_compra_id: "un-cx", unidade_uso_id: "un-kg", fator_conversao: 20, estoque_minimo: 8, validade_padrao_dias: 20, ativo: true },
    { id: "prod-alface", codigo_externo: "P103", nome: "Alface crespa", categoria: "hortifrúti", tipo: "comprado", unidade_compra_id: "un-cx", unidade_uso_id: "un-un", fator_conversao: 12, estoque_minimo: 12, validade_padrao_dias: 4, ativo: true },
    { id: "prod-file", codigo_externo: "P201", nome: "Filé mignon", categoria: "carnes", tipo: "comprado", unidade_compra_id: "un-kg", unidade_uso_id: "un-kg", fator_conversao: 1, codigo_barras: "7891000200201", estoque_minimo: 15, validade_padrao_dias: 90, ativo: true },
    { id: "prod-frango", codigo_externo: "P202", nome: "Peito de frango", categoria: "carnes", tipo: "comprado", unidade_compra_id: "un-kg", unidade_uso_id: "un-kg", fator_conversao: 1, estoque_minimo: 20, validade_padrao_dias: 90, ativo: true },
    { id: "prod-mucarela", codigo_externo: "P301", nome: "Queijo muçarela", categoria: "laticínios", tipo: "comprado", unidade_compra_id: "un-kg", unidade_uso_id: "un-kg", fator_conversao: 1, codigo_barras: "7891000300301", estoque_minimo: 10, validade_padrao_dias: 30, ativo: true },
    { id: "prod-creme", codigo_externo: "P302", nome: "Creme de leite", categoria: "laticínios", tipo: "comprado", unidade_compra_id: "un-cx", unidade_uso_id: "un-l", fator_conversao: 12, estoque_minimo: 8, validade_padrao_dias: 60, ativo: true },
    { id: "prod-azeite", codigo_externo: "P401", nome: "Azeite extra virgem", categoria: "mercearia", tipo: "comprado", unidade_compra_id: "un-cx", unidade_uso_id: "un-l", fator_conversao: 6, estoque_minimo: 4, validade_padrao_dias: 365, ativo: true },
    { id: "prod-farinha", codigo_externo: "P402", nome: "Farinha de trigo 00", categoria: "mercearia", tipo: "comprado", unidade_compra_id: "un-fd", unidade_uso_id: "un-kg", fator_conversao: 25, estoque_minimo: 25, validade_padrao_dias: 180, ativo: true },
    { id: "prod-arroz-arboreo", codigo_externo: "P403", nome: "Arroz arbóreo", categoria: "mercearia", tipo: "comprado", unidade_compra_id: "un-fd", unidade_uso_id: "un-kg", fator_conversao: 10, estoque_minimo: 10, validade_padrao_dias: 180, ativo: true },
    // Produzidos
    { id: "prod-bolonhesa", codigo_externo: "P901", nome: "Molho bolonhesa", categoria: "produção", tipo: "produzido", unidade_uso_id: "un-kg", fator_conversao: 1, estoque_minimo: 6, validade_padrao_dias: 5, ativo: true },
    { id: "prod-massa", codigo_externo: "P902", nome: "Massa fresca", categoria: "produção", tipo: "produzido", unidade_uso_id: "un-kg", fator_conversao: 1, estoque_minimo: 8, validade_padrao_dias: 3, ativo: true },
    { id: "prod-risoto-base", codigo_externo: "P903", nome: "Base de risoto de funghi", categoria: "produção", tipo: "produzido", unidade_uso_id: "un-kg", fator_conversao: 1, estoque_minimo: 4, validade_padrao_dias: 4, ativo: true },
    // Porcionamentos reais da cozinha (freezer/geladeira G e P + estoque seco)
    ...produtosReais(),
  ],

  produto_codigos_barras: [
    { id: "pcb-prod-tomate", produto_id: "prod-tomate", codigo_barras: "7891000100101", principal: true },
    { id: "pcb-prod-file", produto_id: "prod-file", codigo_barras: "7891000200201", principal: true },
    { id: "pcb-prod-mucarela", produto_id: "prod-mucarela", codigo_barras: "7891000300301", principal: true },
  ],
  fornecedor_produtos: [
    { id: "fp-1", fornecedor_id: "forn-hortifruti", produto_id: "prod-tomate", ultimo_preco: 7.9, atualizado_em: diasAtras(3) },
    { id: "fp-2", fornecedor_id: "forn-hortifruti", produto_id: "prod-cebola", ultimo_preco: 4.5, atualizado_em: diasAtras(3) },
    { id: "fp-3", fornecedor_id: "forn-hortifruti", produto_id: "prod-alface", ultimo_preco: 2.8, atualizado_em: diasAtras(3) },
    { id: "fp-4", fornecedor_id: "forn-frigorifico", produto_id: "prod-file", codigo_produto_fornecedor: "FBF-0101", codigo_barras_fornecedor: "7891000200201", unidade_compra_id: "un-kg", fator_conversao: 1, ultimo_preco: 62.0, ultimo_preco_unidade_id: "un-kg", atualizado_em: diasAtras(10) },
    { id: "fp-5", fornecedor_id: "forn-frigorifico", produto_id: "prod-frango", ultimo_preco: 16.5, atualizado_em: diasAtras(10) },
    { id: "fp-6", fornecedor_id: "forn-laticinios", produto_id: "prod-mucarela", ultimo_preco: 38.0, atualizado_em: diasAtras(7) },
    { id: "fp-7", fornecedor_id: "forn-laticinios", produto_id: "prod-creme", ultimo_preco: 9.8, atualizado_em: diasAtras(7) },
    { id: "fp-8", fornecedor_id: "forn-distribuidora", produto_id: "prod-azeite", codigo_produto_fornecedor: "AZ-500", unidade_compra_id: "un-cx", fator_conversao: 6, ultimo_preco: 42.0, ultimo_preco_unidade_id: "un-cx", atualizado_em: diasAtras(15) },
    { id: "fp-9", fornecedor_id: "forn-distribuidora", produto_id: "prod-farinha", ultimo_preco: 4.2, atualizado_em: diasAtras(15) },
    { id: "fp-10", fornecedor_id: "forn-distribuidora", produto_id: "prod-arroz-arboreo", ultimo_preco: 12.5, atualizado_em: diasAtras(15) },
    // Distribuidora também vende creme de leite e muçarela (concorrência p/ cotação)
    { id: "fp-11", fornecedor_id: "forn-distribuidora", produto_id: "prod-creme", ultimo_preco: 10.4, atualizado_em: diasAtras(20) },
    { id: "fp-12", fornecedor_id: "forn-distribuidora", produto_id: "prod-mucarela", ultimo_preco: 39.5, atualizado_em: diasAtras(20) },
  ],

  locais: [
    { id: "loc-freezer1", nome: "Freezer 1", tipo: "freezer" },
    { id: "loc-freezer2", nome: "Freezer 2", tipo: "freezer" },
    { id: "loc-geladeira1", nome: "Geladeira 1", tipo: "geladeira" },
    LOCAL_GELADEIRA_2,
    { id: "loc-prateleira", nome: "Prateleira seca", tipo: "prateleira" },
    { id: "loc-despensa", nome: "Despensa", tipo: "despensa" },
    LOCAL_ESTOQUE_SECO,
  ],

  caixas: [
    // Filé mignon em 2 caixas — FIFO deve apontar a nº 3 (mais antiga)
    { id: "cx-3", numero: 3, qr_code: "CXCHEF-003", tipo_box: "NAO_CLASSIFICADO", posicao_fisica: "NAO_INFORMADA", status: "cheia", produto_id: "prod-file", quantidade: 8, data_envase: soData(diasAtras(6)), validade: soData(diasAFrente(84)), local_id: "loc-freezer2", atualizado_em: diasAtras(6) },
    { id: "cx-7", numero: 7, qr_code: "CXCHEF-007", tipo_box: "NAO_CLASSIFICADO", posicao_fisica: "NAO_INFORMADA", status: "cheia", produto_id: "prod-file", quantidade: 10, data_envase: soData(diasAtras(2)), validade: soData(diasAFrente(88)), local_id: "loc-freezer1", atualizado_em: diasAtras(2) },
    // Frango
    { id: "cx-4", numero: 4, qr_code: "CXCHEF-004", tipo_box: "NAO_CLASSIFICADO", posicao_fisica: "NAO_INFORMADA", status: "cheia", produto_id: "prod-frango", quantidade: 12, data_envase: soData(diasAtras(4)), validade: soData(diasAFrente(86)), local_id: "loc-freezer1", atualizado_em: diasAtras(4) },
    { id: "cx-9", numero: 9, qr_code: "CXCHEF-009", tipo_box: "NAO_CLASSIFICADO", posicao_fisica: "NAO_INFORMADA", status: "em_uso", produto_id: "prod-frango", quantidade: 4, data_envase: soData(diasAtras(8)), validade: soData(diasAFrente(82)), local_id: "loc-geladeira1", atualizado_em: diasAtras(1) },
    // Hortifrúti
    { id: "cx-1", numero: 1, qr_code: "CXCHEF-001", tipo_box: "NAO_CLASSIFICADO", posicao_fisica: "NAO_INFORMADA", status: "cheia", produto_id: "prod-tomate", quantidade: 6, data_envase: soData(diasAtras(3)), validade: soData(diasAFrente(4)), local_id: "loc-geladeira1", atualizado_em: diasAtras(3) },
    { id: "cx-2", numero: 2, qr_code: "CXCHEF-002", tipo_box: "NAO_CLASSIFICADO", posicao_fisica: "NAO_INFORMADA", status: "cheia", produto_id: "prod-cebola", quantidade: 9, data_envase: soData(diasAtras(5)), validade: soData(diasAFrente(15)), local_id: "loc-despensa", atualizado_em: diasAtras(5) },
    // Laticínios
    { id: "cx-5", numero: 5, qr_code: "CXCHEF-005", tipo_box: "NAO_CLASSIFICADO", posicao_fisica: "NAO_INFORMADA", status: "cheia", produto_id: "prod-mucarela", quantidade: 7, data_envase: soData(diasAtras(9)), validade: soData(diasAFrente(21)), local_id: "loc-geladeira1", atualizado_em: diasAtras(9) },
    { id: "cx-6", numero: 6, qr_code: "CXCHEF-006", tipo_box: "NAO_CLASSIFICADO", posicao_fisica: "NAO_INFORMADA", status: "cheia", produto_id: "prod-creme", quantidade: 6, data_envase: soData(diasAtras(12)), validade: soData(diasAFrente(48)), local_id: "loc-prateleira", atualizado_em: diasAtras(12) },
    // Mercearia
    { id: "cx-8", numero: 8, qr_code: "CXCHEF-008", tipo_box: "NAO_CLASSIFICADO", posicao_fisica: "NAO_INFORMADA", status: "cheia", produto_id: "prod-farinha", quantidade: 18, data_envase: soData(diasAtras(20)), validade: soData(diasAFrente(160)), local_id: "loc-despensa", atualizado_em: diasAtras(20) },
    { id: "cx-10", numero: 10, qr_code: "CXCHEF-010", tipo_box: "NAO_CLASSIFICADO", posicao_fisica: "NAO_INFORMADA", status: "cheia", produto_id: "prod-arroz-arboreo", quantidade: 8, data_envase: soData(diasAtras(18)), validade: soData(diasAFrente(162)), local_id: "loc-despensa", atualizado_em: diasAtras(18) },
    // Produção própria — validades curtas (uma vence amanhã!)
    { id: "cx-11", numero: 11, qr_code: "CXCHEF-011", tipo_box: "NAO_CLASSIFICADO", posicao_fisica: "NAO_INFORMADA", status: "cheia", produto_id: "prod-bolonhesa", quantidade: 5, data_envase: soData(diasAtras(4)), validade: soData(diasAFrente(1)), local_id: "loc-geladeira1", atualizado_em: diasAtras(4) },
    { id: "cx-12", numero: 12, qr_code: "CXCHEF-012", tipo_box: "NAO_CLASSIFICADO", posicao_fisica: "NAO_INFORMADA", status: "cheia", produto_id: "prod-massa", quantidade: 6, data_envase: soData(diasAtras(1)), validade: soData(diasAFrente(2)), local_id: "loc-geladeira1", atualizado_em: diasAtras(1) },
    // Vazias, prontas para reuso
    { id: "cx-13", numero: 13, qr_code: "CXCHEF-013", tipo_box: "NAO_CLASSIFICADO", posicao_fisica: "NAO_INFORMADA", status: "vazia", atualizado_em: diasAtras(2) },
    { id: "cx-14", numero: 14, qr_code: "CXCHEF-014", tipo_box: "NAO_CLASSIFICADO", posicao_fisica: "NAO_INFORMADA", status: "vazia", atualizado_em: diasAtras(1) },
  ],

  // Um lote pode ser dividido entre várias caixas. As alocações abaixo guardam
  // quanto daquele lote está em cada recipiente físico.
  lotes_estoque: [
    { id: "lote-cx-3", produto_id: "prod-file", origem: "manual", quantidade_inicial: 8, quantidade_atual: 8, data_entrada: soData(diasAtras(6)), validade: soData(diasAFrente(84)), criado_em: diasAtras(6), atualizado_em: diasAtras(6) },
    { id: "lote-cx-7", produto_id: "prod-file", origem: "manual", quantidade_inicial: 10, quantidade_atual: 10, data_entrada: soData(diasAtras(2)), validade: soData(diasAFrente(88)), criado_em: diasAtras(2), atualizado_em: diasAtras(2) },
    { id: "lote-cx-4", produto_id: "prod-frango", origem: "manual", quantidade_inicial: 12, quantidade_atual: 12, data_entrada: soData(diasAtras(4)), validade: soData(diasAFrente(86)), criado_em: diasAtras(4), atualizado_em: diasAtras(4) },
    { id: "lote-cx-9", produto_id: "prod-frango", origem: "manual", quantidade_inicial: 4, quantidade_atual: 4, data_entrada: soData(diasAtras(8)), validade: soData(diasAFrente(82)), criado_em: diasAtras(8), atualizado_em: diasAtras(1) },
    { id: "lote-cx-1", produto_id: "prod-tomate", origem: "manual", quantidade_inicial: 6, quantidade_atual: 6, data_entrada: soData(diasAtras(3)), validade: soData(diasAFrente(4)), criado_em: diasAtras(3), atualizado_em: diasAtras(3) },
    { id: "lote-cx-2", produto_id: "prod-cebola", origem: "manual", quantidade_inicial: 9, quantidade_atual: 9, data_entrada: soData(diasAtras(5)), validade: soData(diasAFrente(15)), criado_em: diasAtras(5), atualizado_em: diasAtras(5) },
    { id: "lote-cx-5", produto_id: "prod-mucarela", origem: "manual", quantidade_inicial: 7, quantidade_atual: 7, data_entrada: soData(diasAtras(9)), validade: soData(diasAFrente(21)), criado_em: diasAtras(9), atualizado_em: diasAtras(9) },
    { id: "lote-cx-6", produto_id: "prod-creme", origem: "manual", quantidade_inicial: 6, quantidade_atual: 6, data_entrada: soData(diasAtras(12)), validade: soData(diasAFrente(48)), criado_em: diasAtras(12), atualizado_em: diasAtras(12) },
    { id: "lote-cx-8", produto_id: "prod-farinha", origem: "manual", quantidade_inicial: 18, quantidade_atual: 18, data_entrada: soData(diasAtras(20)), validade: soData(diasAFrente(160)), criado_em: diasAtras(20), atualizado_em: diasAtras(20) },
    { id: "lote-cx-10", produto_id: "prod-arroz-arboreo", origem: "manual", quantidade_inicial: 8, quantidade_atual: 8, data_entrada: soData(diasAtras(18)), validade: soData(diasAFrente(162)), criado_em: diasAtras(18), atualizado_em: diasAtras(18) },
    { id: "lote-cx-11", produto_id: "prod-bolonhesa", origem: "producao", porcionado_por_id: "perfil-lider", quantidade_inicial: 5, quantidade_atual: 5, data_entrada: soData(diasAtras(4)), validade: soData(diasAFrente(1)), criado_em: diasAtras(4), atualizado_em: diasAtras(4) },
    { id: "lote-cx-12", produto_id: "prod-massa", origem: "producao", porcionado_por_id: "perfil-lider", quantidade_inicial: 6, quantidade_atual: 6, data_entrada: soData(diasAtras(1)), validade: soData(diasAFrente(2)), criado_em: diasAtras(1), atualizado_em: diasAtras(1) },
  ],

  alocacoes_caixa: [
    ...[3, 7, 4, 9, 1, 2, 5, 6, 8, 10, 11, 12].map((numero) => {
      const caixa = `cx-${numero}`;
      const quantidades: Record<number, number> = { 3: 8, 7: 10, 4: 12, 9: 4, 1: 6, 2: 9, 5: 7, 6: 6, 8: 18, 10: 8, 11: 5, 12: 6 };
      return { id: `aloc-${caixa}`, lote_id: `lote-${caixa}`, caixa_id: caixa, quantidade_inicial: quantidades[numero], quantidade_atual: quantidades[numero], criado_em: diasAtras(1), atualizado_em: diasAtras(1) };
    }),
  ],

  listas_compras: [
    // Lista em cotação (gerou as cotações abaixo)
    { id: "lista-1", status: "em_cotacao", gerada_automaticamente: true, criada_por: "perfil-gerente", criada_em: diasAtras(2) },
    // Rascunho gerado hoje pelos alertas de estoque mínimo
    { id: "lista-2", status: "rascunho", gerada_automaticamente: true, criada_por: "perfil-gerente", criada_em: diasAtras(0) },
  ],

  lista_itens: [
    { id: "li-1", lista_id: "lista-1", produto_id: "prod-mucarela", quantidade: 15 },
    { id: "li-2", lista_id: "lista-1", produto_id: "prod-creme", quantidade: 12 },
    { id: "li-3", lista_id: "lista-1", produto_id: "prod-file", quantidade: 20, observacao: "Peça limpa, sem cordão" },
    { id: "li-4", lista_id: "lista-2", produto_id: "prod-tomate", quantidade: 20 },
    { id: "li-5", lista_id: "lista-2", produto_id: "prod-alface", quantidade: 24 },
    { id: "li-6", lista_id: "lista-2", produto_id: "prod-azeite", quantidade: 6 },
  ],

  cotacoes: [
    { id: "cot-1", lista_id: "lista-1", fornecedor_id: "forn-laticinios", token: "tok-serra-azul-abc123", status: "respondida", prazo_resposta: diasAFrente(1), canal: "whatsapp", enviada_em: diasAtras(2), respondida_em: diasAtras(1) },
    { id: "cot-2", lista_id: "lista-1", fornecedor_id: "forn-distribuidora", token: "tok-ranchao-def456", status: "respondida", prazo_resposta: diasAFrente(1), canal: "whatsapp", enviada_em: diasAtras(2), respondida_em: diasAtras(0) },
    { id: "cot-3", lista_id: "lista-1", fornecedor_id: "forn-frigorifico", token: "tok-boifeliz-ghi789", status: "enviada", prazo_resposta: diasAFrente(1), canal: "email", enviada_em: diasAtras(2) },
  ],

  cotacao_itens: [
    // Serra Azul respondeu (muçarela + creme)
    { id: "ci-1", cotacao_id: "cot-1", produto_id: "prod-mucarela", quantidade: 15, preco_unitario: 37.5, prazo_entrega_dias: 2, disponivel: true },
    { id: "ci-2", cotacao_id: "cot-1", produto_id: "prod-creme", quantidade: 12, preco_unitario: 9.6, prazo_entrega_dias: 2, disponivel: true },
    // Ranchão respondeu (muçarela mais cara — fora do padrão; creme indisponível com substituto)
    { id: "ci-3", cotacao_id: "cot-2", produto_id: "prod-mucarela", quantidade: 15, preco_unitario: 46.9, prazo_entrega_dias: 3, disponivel: true },
    { id: "ci-4", cotacao_id: "cot-2", produto_id: "prod-creme", quantidade: 12, disponivel: false, substituto_descricao: "Creme culinário 1L marca própria", substituto_preco: 8.9 },
    // Boi Feliz ainda não respondeu (filé)
    { id: "ci-5", cotacao_id: "cot-3", produto_id: "prod-file", quantidade: 20, disponivel: true },
  ],

  pedidos: [
    // Aguardando aprovação do dono — gerado da cotação da Serra Azul
    {
      id: "ped-1",
      cotacao_id: "cot-1",
      fornecedor_id: "forn-laticinios",
      status: "aguardando_aprovacao",
      valor_total: 15 * 37.5 + 12 * 9.6,
      analise_ia:
        "Recomendo a Laticínios Serra Azul para muçarela e creme de leite: preço da muçarela (R$ 37,50/kg) está 1,3% abaixo da última compra e 20% abaixo da concorrente Ranchão (R$ 46,90 — fora do padrão histórico). O prazo de 2 dias atende a necessidade e o pedido supera o mínimo de R$ 200 do fornecedor.",
      criado_em: diasAtras(0),
    },
    // Pedido antigo já entregue (histórico)
    { id: "ped-2", fornecedor_id: "forn-hortifruti", status: "entregue", valor_total: 318.4, criado_em: diasAtras(6) },
    // Pedido confirmado, entrega prevista hoje
    { id: "ped-3", fornecedor_id: "forn-frigorifico", status: "confirmado", valor_total: 1240.0, criado_em: diasAtras(3) },
  ],

  pedido_itens: [
    { id: "pi-1", pedido_id: "ped-1", produto_id: "prod-mucarela", quantidade: 15, preco_unitario: 37.5 },
    { id: "pi-2", pedido_id: "ped-1", produto_id: "prod-creme", quantidade: 12, preco_unitario: 9.6 },
    { id: "pi-3", pedido_id: "ped-2", produto_id: "prod-tomate", quantidade: 24, preco_unitario: 7.9 },
    { id: "pi-4", pedido_id: "ped-2", produto_id: "prod-cebola", quantidade: 12, preco_unitario: 4.5 },
    { id: "pi-5", pedido_id: "ped-2", produto_id: "prod-alface", quantidade: 27, preco_unitario: 2.8 },
    { id: "pi-6", pedido_id: "ped-3", produto_id: "prod-file", quantidade: 20, preco_unitario: 62.0 },
  ],

  notas_fiscais: [
    // Nota do pedido entregue — já conferida
    { id: "nf-1", fornecedor_id: "forn-hortifruti", pedido_id: "ped-2", numero: "45231", chave_acesso: "35260712345678000190550010000452311000452319", valor_total: 318.4, emitida_em: soData(diasAtras(5)), importada_em: diasAtras(5), status: "conferida" },
    // Nota da distribuidora aguardando conferência (boleto travado) — baixada da Receita
    { id: "nf-2", fornecedor_id: "forn-distribuidora", numero: "88102", chave_acesso: "35260734567890000112550010000881021000881029", valor_total: 654.0, emitida_em: soData(diasAtras(1)), importada_em: diasAtras(1), status: "aguardando_conferencia", origem: "receita",
      itens_importados: [
        { descricao: "AZEITE EXTRA VIRGEM 500ML CX", codigo: "AZ-500", ean: "", unidade: "cx", quantidade: 6, preco_unitario: 42.0 },
        { descricao: "ARROZ ARBOREO 1KG", codigo: "ARB-1", ean: "", unidade: "kg", quantidade: 30, preco_unitario: 13.4 },
      ] },
    // Nota do frigorífico (pedido confirmado) — baixada da Receita, gerou boleto suspeito
    { id: "nf-3", fornecedor_id: "forn-frigorifico", pedido_id: "ped-3", numero: "12904", chave_acesso: "35260723456789000101550010000129041000129046", valor_total: 1240.0, emitida_em: soData(diasAtras(1)), importada_em: diasAtras(0), status: "aguardando_conferencia", origem: "receita",
      itens_importados: [
        { descricao: "FILE MIGNON BOVINO RESFRIADO KG", codigo: "FBF-0101", ean: "7891000200201", unidade: "kg", quantidade: 20, preco_unitario: 62.0 },
      ] },
    // NF correspondente ao boleto real ADG (R$ 613,34 · venc. 07/08/2026 pelo fator)
    {
      id: "nf-adg-613",
      fornecedor_id: "forn-adg-cakes",
      numero: "61334",
      chave_acesso: "35260737681455000120550010000613341000613349",
      cnpj_emitente: "37.681.455/0001-20",
      razao_social_emitente: "ADG CAKES EMBALAGENS LTDA",
      valor_total: 613.34,
      emitida_em: soData(diasAtras(10)),
      importada_em: diasAtras(2),
      status: "conferida",
      origem: "manual",
    },
  ],

  boletos: [
    // Travado: mercadoria da nota nf-2 ainda não conferida
    { id: "bol-1", nota_id: "nf-2", valor: 654.0, vencimento: soData(diasAFrente(20)), cnpj_beneficiario: "34.567.890/0001-12", linha_digitavel: "34191.09008 81020.334567 89000.011206 5 98760000065400", status: "travado" },
    // Suspeito: CNPJ do boleto não bate com o CNPJ do fornecedor da nota (golpe do boleto!)
    { id: "bol-2", nota_id: "nf-3", valor: 1240.0, vencimento: soData(diasAFrente(3)), cnpj_beneficiario: "99.888.777/0001-66", linha_digitavel: "23791.22928 60000.123456 77000.045678 1 98760000124000", status: "suspeito", observacao: "CNPJ do beneficiário difere do CNPJ do fornecedor na nota — NÃO PAGAR sem confirmar por telefone" },
    // Liberado: conferência OK
    { id: "bol-3", nota_id: "nf-1", valor: 318.4, vencimento: soData(diasAFrente(2)), cnpj_beneficiario: "12.345.678/0001-90", status: "liberado" },
    // Parcela liberada para casar com o PDF real (sem linha — o import anexa)
    {
      id: "bol-adg-613",
      nota_id: "nf-adg-613",
      numero_parcela: "001",
      valor: 613.34,
      vencimento: "2026-08-07",
      cnpj_beneficiario: "37.681.455/0001-20",
      status: "liberado",
    },
  ],

  contas_pagar: [],
  conta_pagar_historico: [],
  documentos_boleto: [],
  boleto_pagamentos_historico: [],

  recebimentos: [
    // Recebimento OK do pedido hortifrúti — com uma divergência parcial no tomate
    { id: "rec-1", pedido_id: "ped-2", nota_id: "nf-1", status: "divergente", recebido_por: "perfil-lider", recebido_em: diasAtras(5) },
  ],

  recebimento_itens: [
    { id: "ri-1", recebimento_id: "rec-1", produto_id: "prod-tomate", qtd_esperada: 24, qtd_recebida: 20, validade: soData(diasAFrente(4)), divergencia: "Faltaram 4 kg — 1 caixa veio com fundo amassado, devolvida" },
    { id: "ri-2", recebimento_id: "rec-1", produto_id: "prod-cebola", qtd_esperada: 12, qtd_recebida: 12, validade: soData(diasAFrente(15)) },
    { id: "ri-3", recebimento_id: "rec-1", produto_id: "prod-alface", qtd_esperada: 27, qtd_recebida: 27, validade: soData(diasAFrente(3)) },
  ],

  movimentos_estoque: [
    { id: "mov-1", produto_id: "prod-tomate", caixa_id: "cx-1", tipo: "entrada", quantidade: 20, recebimento_id: "rec-1", usuario_id: "perfil-lider", criado_em: diasAtras(5), sincronizado: true },
    { id: "mov-2", produto_id: "prod-tomate", caixa_id: "cx-1", tipo: "baixa", quantidade: -8, usuario_id: "perfil-lider", criado_em: diasAtras(3), sincronizado: true },
    { id: "mov-3", produto_id: "prod-tomate", caixa_id: "cx-1", tipo: "baixa", quantidade: -6, usuario_id: "perfil-caixa", criado_em: diasAtras(1), sincronizado: true },
    { id: "mov-4", produto_id: "prod-file", caixa_id: "cx-3", tipo: "baixa", quantidade: -4, usuario_id: "perfil-lider", criado_em: diasAtras(2), sincronizado: true },
    { id: "mov-5", produto_id: "prod-bolonhesa", caixa_id: "cx-11", tipo: "producao", quantidade: 5, usuario_id: "perfil-lider", criado_em: diasAtras(4), sincronizado: true },
    { id: "mov-6", produto_id: "prod-massa", caixa_id: "cx-12", tipo: "producao", quantidade: 6, usuario_id: "perfil-lider", criado_em: diasAtras(1), sincronizado: false },
    { id: "mov-7", produto_id: "prod-frango", caixa_id: "cx-9", tipo: "baixa", quantidade: -5, usuario_id: "perfil-lider", criado_em: diasAtras(1), sincronizado: false },
    { id: "mov-8", produto_id: "prod-mucarela", caixa_id: "cx-5", tipo: "baixa", quantidade: -3, usuario_id: "perfil-caixa", criado_em: diasAtras(2), sincronizado: true },
  ],

  balancos: [
    { id: "bal-1", tipo: "produzidos", status: "concluido", realizado_por: "perfil-lider", iniciado_em: diasAtras(2), concluido_em: diasAtras(2) },
  ],

  balanco_itens: [
    { id: "bi-1", balanco_id: "bal-1", caixa_id: "cx-11", qtd_esperada: 5, qtd_encontrada: 5 },
    { id: "bi-2", balanco_id: "bal-1", caixa_id: "cx-12", qtd_esperada: 7, qtd_encontrada: 6 },
  ],

  eventos_box_operacional: [],

  precos_historico: [
    // Muçarela — série p/ gráfico e detecção de preço fora do padrão
    { id: "ph-1", produto_id: "prod-mucarela", fornecedor_id: "forn-laticinios", preco: 36.8, origem: "nota", data: soData(diasAtras(56)) },
    { id: "ph-2", produto_id: "prod-mucarela", fornecedor_id: "forn-laticinios", preco: 37.2, origem: "nota", data: soData(diasAtras(42)) },
    { id: "ph-3", produto_id: "prod-mucarela", fornecedor_id: "forn-distribuidora", preco: 39.5, origem: "cotacao", data: soData(diasAtras(35)) },
    { id: "ph-4", produto_id: "prod-mucarela", fornecedor_id: "forn-laticinios", preco: 38.0, origem: "nota", data: soData(diasAtras(28)) },
    { id: "ph-5", produto_id: "prod-mucarela", fornecedor_id: "forn-laticinios", preco: 38.0, origem: "nota", data: soData(diasAtras(14)) },
    { id: "ph-6", produto_id: "prod-mucarela", fornecedor_id: "forn-laticinios", preco: 37.5, origem: "cotacao", data: soData(diasAtras(1)) },
    { id: "ph-7", produto_id: "prod-mucarela", fornecedor_id: "forn-distribuidora", preco: 46.9, origem: "cotacao", data: soData(diasAtras(0)) },
    // Filé mignon
    { id: "ph-8", produto_id: "prod-file", fornecedor_id: "forn-frigorifico", preco: 58.0, origem: "nota", data: soData(diasAtras(60)) },
    { id: "ph-9", produto_id: "prod-file", fornecedor_id: "forn-frigorifico", preco: 59.5, origem: "nota", data: soData(diasAtras(45)) },
    { id: "ph-10", produto_id: "prod-file", fornecedor_id: "forn-frigorifico", preco: 60.0, origem: "nota", data: soData(diasAtras(30)) },
    { id: "ph-11", produto_id: "prod-file", fornecedor_id: "forn-frigorifico", preco: 62.0, origem: "nota", data: soData(diasAtras(10)) },
    // Tomate
    { id: "ph-12", produto_id: "prod-tomate", fornecedor_id: "forn-hortifruti", preco: 6.9, origem: "nota", data: soData(diasAtras(40)) },
    { id: "ph-13", produto_id: "prod-tomate", fornecedor_id: "forn-hortifruti", preco: 7.4, origem: "nota", data: soData(diasAtras(20)) },
    { id: "ph-14", produto_id: "prod-tomate", fornecedor_id: "forn-hortifruti", preco: 7.9, origem: "nota", data: soData(diasAtras(5)) },
  ],

  integracao_eventos: [
    { id: "ev-1", direcao: "enviado", tipo: "estoque_total", payload: { produto: "P101", total: 6 }, status: "ok", tentativas: 1, criado_em: diasAtras(1) },
    { id: "ev-2", direcao: "recebido", tipo: "ficha_tecnica", payload: { produto: "P901", insumos: [{ codigo: "P101", qtd: 0.6 }, { codigo: "P102", qtd: 0.2 }] }, status: "ok", tentativas: 1, criado_em: diasAtras(2) },
    { id: "ev-3", direcao: "enviado", tipo: "estoque_total", payload: { produto: "P902", total: 6 }, status: "pendente", tentativas: 0, criado_em: diasAtras(0) },
  ],
};
