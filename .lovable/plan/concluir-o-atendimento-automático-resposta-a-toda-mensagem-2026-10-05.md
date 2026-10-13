# Concluir o atendimento automático (resposta a toda mensagem)

## O que já está pronto
- Mensagem do cliente interrompe os lembretes e coloca o lead em "conversando".
- Mensagens seguidas são agrupadas (5s) e respondidas uma única vez, sem duplicar.
- A IA lê o histórico, identifica a intenção e responde só com o que estiver cadastrado.
- Pedido para não receber mais mensagens cancela a automação.

## O que falta fazer
1. **Tela "Respostas"** (novo item no menu)
   - Campo de texto livre com as informações da academia (preços, planos, horários, endereço, link de matrícula, Wellhub/TotalPass etc.).
   - Resposta genérica editável.
   - Lista de intenções: nome, exemplos, resposta, respostas alternativas, prioridade, ativo/inativo; adicionar, editar e excluir.
2. **Leads em Automação**
   - Mostrar também os leads "conversando" e com falha, para que não sumam da lista ao responder.
   - Novos status: Automação ativa, Aguardando próxima etapa, Cliente respondeu, Respondendo automaticamente, Atendimento assumido, Pausada, Concluída, Cancelada.
   - Botão **Assumir atendimento**: para na hora a sequência e as respostas automáticas; o lead sai da lista.
   - Contagem "Próxima mensagem em" mantida.
3. **Ajustes de segurança da IA**
   - Pedir a resposta em formato estruturado (exigido pelo modelo atual), em vez de texto livre.
   - Se a IA falhar, enviar a resposta genérica em vez de ficar calado.
4. **Verificação**
   - Conferir que o sistema compila sem erros.
   - Teste real: criar lead com o seu número, responder "Oi" e "Quanto custa?" e confirmar a resposta automática no WhatsApp; depois clicar em Assumir atendimento e confirmar que nada mais é enviado.

## Dependência
As respostas só serão úteis com as informações reais da academia. Sem elas, o sistema responderá com a mensagem genérica ou dirá que vai verificar com um consultor. Nada será inventado.

## Detalhes técnicos
- Novo status de execução `TAKEN_OVER`; `setExecutionStatus` ganha a ação `TAKEOVER` (a partir de qualquer status ativo, inclusive `CONVERSING`) e limpa `pending_reply_at`.
- Lista ativa em `queue.functions.ts` passa a incluir `CONVERSING`; `CANCEL`/`PAUSE` também aceitam `CONVERSING`.
- `ai-reply.server.ts`: adicionar `text.format` com `json_schema` estrito `{intent, reply, optOut, needsHuman}`; em erro, `runPendingReplies` envia `fallback_reply`.
- Novas server functions `src/lib/responses.functions.ts` (listar/salvar/excluir intenções; ler/salvar `business_info`) usando o cliente de servidor; rota `src/routes/respostas.tsx` com head próprio; item no `Nav`.
- Sem alterações em conexão, QR Code, provedor, envio manual ou recebimento.
