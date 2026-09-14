function relativeDate(daysAgo, hour = 10) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

function message(id, conversationId, role, content, createdAt, attachments = []) {
  return { id, conversationId, role, content, attachments, createdAt };
}

export function createMockConversations() {
  const salesId = "demo-sales";
  const stockId = "demo-stock";
  const everestId = "demo-everest";
  const planningId = "demo-planning";

  return [
    {
      id: salesId,
      title: "Analisar vendas das lojas",
      createdAt: relativeDate(0, 8),
      updatedAt: relativeDate(0, 9),
      messages: [
        message("sales-user-1", salesId, "user", "Quais pontos devo observar ao comparar as vendas das lojas?", relativeDate(0, 8)),
        message(
          "sales-assistant-1",
          salesId,
          "assistant",
          "### Roteiro de análise\n\nPara uma comparação consistente, use o mesmo período e observe:\n\n- faturamento total e por dia;\n- quantidade de vendas;\n- ticket médio;\n- participação de cada canal;\n- dias com comportamento fora do padrão.\n\n> Esta conversa é demonstrativa e não consulta dados reais do FAQ EB.",
          relativeDate(0, 8, 8)
        ),
        message(
          "sales-user-2",
          salesId,
          "user",
          "Mostre um exemplo de estrutura para organizar os dados.",
          relativeDate(0, 8, 9),
          [{ id: "sales-file-1", name: "vendas_agosto.xlsx", type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size: 184320, previewUrl: "" }]
        ),
        message(
          "sales-assistant-2",
          salesId,
          "assistant",
          "Uma tabela inicial pode seguir este formato:\n\n| Loja | Faturamento | Pedidos | Ticket médio |\n| --- | ---: | ---: | ---: |\n| Loja A | R$ 0,00 | 0 | R$ 0,00 |\n| Loja B | R$ 0,00 | 0 | R$ 0,00 |\n\nOs valores acima são apenas uma estrutura de exemplo. Para preparar os dados em JavaScript:\n\n```javascript\nconst resumoPorLoja = vendas.reduce((resumo, venda) => {\n  // Agrupar os registros por loja\n  return resumo;\n}, {});\n```",
          relativeDate(0, 8, 10)
        )
      ]
    },
    {
      id: stockId,
      title: "Relatório de estoque com um título longo para validar o truncamento",
      createdAt: relativeDate(0, 11),
      updatedAt: relativeDate(0, 11),
      messages: [
        message("stock-user-1", stockId, "user", "Como posso organizar um relatório de estoque?", relativeDate(0, 11)),
        message("stock-assistant-1", stockId, "assistant", "Separe o relatório por loja, produto, quantidade disponível e data da última contagem. **Nesta demonstração, nenhum estoque real é consultado.**", relativeDate(0, 11, 11))
      ]
    },
    {
      id: everestId,
      title: "Dúvidas sobre o Everest",
      createdAt: relativeDate(1, 15),
      updatedAt: relativeDate(1, 15),
      messages: [
        message("everest-user-1", everestId, "user", "O Browninho já consegue consultar o Everest?", relativeDate(1, 15)),
        message("everest-assistant-1", everestId, "assistant", "Ainda não. Esta primeira versão demonstra somente a experiência visual. A integração com fontes internas será adicionada em uma etapa futura.", relativeDate(1, 15, 15))
      ]
    },
    {
      id: planningId,
      title: "Planejamento de produção",
      createdAt: relativeDate(4, 9),
      updatedAt: relativeDate(4, 9),
      messages: [
        message("planning-user-1", planningId, "user", "Ajude a revisar um processo de planejamento de produção.", relativeDate(4, 9)),
        message("planning-assistant-1", planningId, "assistant", "Posso ajudar a estruturar as etapas e revisar o texto do processo. Nesta versão, a resposta é simulada e não altera planejamentos existentes.", relativeDate(4, 9, 9))
      ]
    }
  ];
}

export const AI_SUGGESTIONS = [
  "Analisar um documento",
  "Resumir uma planilha",
  "Me ajudar com um processo",
  "Criar uma imagem"
];

export const SIMULATED_ASSISTANT_RESPONSE =
  "Esta é uma resposta simulada do Browninho. A integração com a OpenAI será adicionada posteriormente.";
