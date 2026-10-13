# Corrigir o envio da automação

## Resultado esperado
Ao criar um lead com o número real, o sistema encontra a automação ativa, cria uma execução, envia a primeira mensagem pelo mesmo caminho já validado no envio manual e só então agenda a espera de 10 segundos.

## Implementação
- Cadastrar no banco a automação ativa `TESTE — LEAD FOLLOW-UP`, com gatilho `LEAD_CREATED` e cinco etapas: mensagem inicial, espera de 10 segundos, verificação de resposta, segunda mensagem e encerramento.
- Manter intactos QR Code, conexão, autenticação, provedor e integração de envio.
- Fazer o envio manual e o passo `SEND_MESSAGE` continuarem convergindo na mesma função compartilhada já existente.
- Corrigir a execução concorrente/idempotente para nunca avançar quando a mensagem ainda não foi confirmada pelo provedor.
- Registrar diagnóstico completo do lead, busca da automação, execução, número antes/depois da normalização, passo carregado, conteúdo, chamada compartilhada, resultado e ID confirmado.
- Retornar na criação do lead um resultado claro: automações encontradas, execuções iniciadas e resultado imediato do processamento.
- Manter a espera no banco por `next_run_at`; nenhum temporizador será usado como mecanismo do fluxo.

## Validação real
- Executar isoladamente um `SEND_MESSAGE` pelo motor para o número real `5511978819570`.
- Criar um novo lead com esse número e comprovar no banco: execução criada, mensagem `SENT` com ID do provedor e execução avançada somente após a confirmação.
- Processar novamente após 10 segundos para verificar a continuação persistente.
- Comparar os registros do envio manual e automático para confirmar que ambos usaram a mesma integração.
- Considerar o teste tecnicamente confirmado apenas com a resposta real do provedor; a confirmação visual de chegada no aparelho depende do usuário.

## Limite preservado
Nenhuma alteração será feita no QR Code, sessão, provedor, autenticação, endpoint ou função validada de envio do WhatsApp.
