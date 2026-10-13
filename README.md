# Academia Gaviões: Real WhatsApp Connect

PROJETO — MOTOR DE AUTOMAÇÃO WHATSAPP REAL

Academia Gaviões 24h — Bom Clima

Quero construir um sistema web profissional de automação de atendimento pelo WhatsApp, com conexão REAL a um WhatsApp existente através de QR Code REAL.

O foco deste projeto é exclusivamente:

CONEXÃO REAL DO WHATSAPP + ENVIO/RECEBIMENTO REAL + MOTOR DE AUTOMAÇÃO

Não crie CRM, cadastro de vendedores, funil comercial, relatórios, campanhas, estoque, financeiro ou qualquer outra funcionalidade que não esteja especificada abaixo.

1. OBJETIVO PRINCIPAL

O sistema deverá permitir:

WhatsApp existente → QR Code REAL → autenticação → WhatsApp conectado → receber mensagens → executar automações → enviar mensagens reais → identificar respostas → continuar ou encerrar automação.

Tudo deve funcionar de verdade.

Não quero protótipo visual.

Não quero mock.

Não quero dados falsos.

Não quero QR Code fictício.

Não quero botão que apenas altere o status para "conectado".

Não quero simulação de envio.

2. CONEXÃO DO WHATSAPP

A primeira opção de integração deve ser:

Whapi.Cloud

Utilize a API oficial/documentação atual disponível do provedor para implementar a conexão.

A conexão precisa permitir autenticar um WhatsApp existente através de QR Code REAL.

Fluxo:

Usuário acessa o sistema.

Clica em "Conectar WhatsApp".

Sistema cria/inicializa a sessão real.

Sistema solicita o QR Code real ao Whapi.Cloud.

Sistema exibe o QR Code.

Usuário escaneia o QR Code pelo aplicativo WhatsApp.

Sistema detecta a autenticação.

Sessão passa para CONNECTED.

Sistema identifica o número conectado.

Sessão permanece persistente.

Se houver algum impedimento técnico com Whapi.Cloud no ambiente, NÃO invente endpoints ou funcionalidades.

Nesse caso, utilize como alternativas:

Unipile

OpenWA

Mas somente se a integração realmente suportar a conexão por QR Code e envio/recebimento real.

3. QR CODE REAL

O QR Code precisa vir da sessão real do provedor.

Implementar:

geração do QR;

atualização do QR quando expirar;

indicação de "Aguardando leitura";

indicação de "QR expirado";

botão para gerar novo QR;

detecção automática de conexão;

status da sessão;

número conectado;

desconexão;

reconexão quando suportado.

Estados mínimos:

DISCONNECTED

CONNECTING

WAITING_QR

CONNECTED

DISCONNECTING

ERROR

Nunca utilizar QR estático ou gerado apenas para aparência.

4. SESSÃO PERSISTENTE

Depois que o usuário escanear o QR, não quero precisar escanear novamente sempre que:

atualizar a página;

fechar o navegador;

reiniciar o frontend;

reiniciar o backend;

publicar uma nova versão, quando a infraestrutura permitir persistência.

Armazene corretamente os identificadores/configurações necessários para recuperar a sessão através do provedor.

Ao abrir o sistema novamente:

verificar automaticamente o status real da sessão.

Se estiver conectada:

CONNECTED

Se estiver desconectada:

DISCONNECTED

5. ENVIO REAL DE MENSAGENS

Criar uma camada de integração de WhatsApp.

Exemplo conceitual:

WhatsAppProvider

Com métodos equivalentes a:

createSession()

getQRCode()

getStatus()

getConnectedNumber()

sendMessage()

receiveMessage()

disconnect()

Os nomes podem ser adaptados à API escolhida.

O importante é existir uma camada separada entre o motor de automação e o provedor.

Assim, o motor de automação não deve depender diretamente de endpoints específicos do Whapi.

6. RECEBIMENTO DE MENSAGENS

Configurar webhook/eventos reais.

Quando alguém responder pelo WhatsApp:

WhatsApp → provedor → webhook → backend → sistema

O sistema deve registrar:

número do remetente;

número de destino;

conteúdo;

tipo da mensagem;

data/hora;

identificador da mensagem;

identificador do contato/conversa quando disponível;

evento recebido.

Não criar mensagens recebidas artificialmente.

7. MOTOR DE AUTOMAÇÃO

Criar um motor de automação genérico e persistente.

O motor deve funcionar independentemente da interface.

Estrutura:

TRIGGER → AÇÕES → CONDIÇÕES → ESPERA → NOVA AÇÃO → FINALIZAÇÃO

8. TRIGGER INICIAL

Criar inicialmente:

LEAD_CREATED

Quando um novo lead for criado:

LEAD_CREATED → iniciar automação

O sistema deve permitir futuramente adicionar outros gatilhos sem precisar reescrever todo o motor.

9. AÇÕES

Criar pelo menos estas ações:

SEND_MESSAGE

Envia uma mensagem real pelo WhatsApp conectado.

WAIT

Aguarda determinado período.

CHECK_CONDITION

Verifica uma condição.

END_AUTOMATION

Finaliza a automação.

Também pode existir:

PAUSE_AUTOMATION

RESUME_AUTOMATION

10. AUTOMAÇÃO INICIAL

Criar uma automação de exemplo:

Fluxo

LEAD_CREATED

↓

SEND_MESSAGE

↓

WAIT

↓

CHECK_CONDITION

Se o cliente respondeu:

END_AUTOMATION

Se o cliente NÃO respondeu:

SEND_MESSAGE

↓

WAIT

↓

CHECK_CONDITION

E assim sucessivamente, conforme a quantidade de etapas configurada.

11. RESPOSTA DO CLIENTE

Essa parte é fundamental.

Quando o cliente responder:

MESSAGE_RECEIVED

o sistema deve identificar se a mensagem pertence a uma conversa que possui uma automação ativa.

Se sim:

registrar a mensagem;

atualizar a conversa;

marcar que houve resposta;

cancelar/interromper a próxima ação de follow-up;

finalizar a execução quando essa for a regra da automação.

Exemplo:

Mensagem automática:

"Olá! Tudo bem? Gostaria de conhecer nossos planos?"

↓

Sistema aguarda 2 horas.

↓

Cliente responde:

"Oi, quero saber os valores."

↓

Sistema identifica a resposta.

↓

Automação é encerrada.

↓

NÃO enviar o próximo follow-up automático.

12. WAIT PERSISTENTE

NÃO utilize somente:

setTimeout()

setInterval()

ou qualquer mecanismo que dependa do processo permanecer ligado.

O WAIT precisa ser persistente.

Exemplo:

Ao executar:

WAIT 2 horas

salvar no banco:

nextRunAt = data/hora futura

e:

status = WAITING

Se o servidor reiniciar, o sistema deve continuar sabendo que aquela execução está aguardando.

Quando chegar nextRunAt, o worker deve continuar a automação.

13. ESTADOS DA EXECUÇÃO

Criar:

PENDING

RUNNING

WAITING

PAUSED

COMPLETED

CANCELLED

FAILED

14. IDEMPOTÊNCIA

Isso é obrigatório.

O sistema não pode enviar a mesma mensagem duas vezes porque:

o webhook chegou duplicado;

o servidor reiniciou;

o worker executou novamente;

ocorreu timeout;

houve retry;

o usuário atualizou a página.

Cada execução/ação/mensagem deve possuir identificador único ou mecanismo equivalente de idempotência.

Antes de enviar:

verificar se aquela ação já foi executada.

15. WEBHOOKS

Implementar webhook real para receber eventos do provedor.

O webhook precisa:

receber evento;

validar/autenticar quando aplicável;

identificar o tipo do evento;

registrar o evento;

impedir processamento duplicado;

encaminhar para o motor de automação;

responder corretamente ao provedor.

Não criar webhook fictício.

16. BANCO DE DADOS

Criar somente as estruturas necessárias para o motor.

Estruturas mínimas:

Automations

id

name

status

trigger

createdAt

updatedAt

AutomationSteps

id

automationId

order

type

configuration

AutomationExecutions

id

automationId

contactId/phone

status

currentStep

nextRunAt

startedAt

completedAt

updatedAt

AutomationLogs

id

executionId

stepId

event

status

data

createdAt

Messages

id

providerMessageId

phone

direction

content

type

status

createdAt

WhatsAppSession

id

provider

session/channel identifier

connectedNumber

status

createdAt

updatedAt

Adaptar os campos conforme a API e banco escolhidos.

17. CONTROLE DE HORÁRIO

Permitir configurar horário permitido para envio.

Exemplo:

horário inicial;

horário final;

dias permitidos.

Se chegar o momento de enviar uma mensagem fora do horário permitido:

não enviar imediatamente.

Reagendar para o próximo horário permitido.

18. RETRIES

Implementar retry controlado para falhas temporárias.

Exemplo:

PENDING → tentativa → FAILED TEMPORÁRIO → RETRY → sucesso

Não criar loop infinito.

Registrar todas as tentativas.

Se atingir o limite:

FAILED

19. INTERFACE

A interface deve ser simples.

Não construir CRM.

Não construir dashboard comercial complexo.

Criar somente:

WhatsApp

Conectar WhatsApp

QR Code

Status

Número conectado

Desconectar

Reconectar

Automações

Lista de automações

Criar automação

Editar automação

Ativar/desativar

Configurar etapas

Execuções

execução;

contato/número;

status;

etapa atual;

próxima execução;

logs.

20. EDITOR DE AUTOMAÇÃO

Criar um editor simples onde seja possível montar:

TRIGGER

↓

SEND_MESSAGE

↓

WAIT

↓

CHECK_CONDITION

↓

SEND_MESSAGE

↓

WAIT

↓

END

Cada etapa deve possuir configuração própria.

Exemplo:

SEND_MESSAGE

Mensagem:

"Olá! Tudo bem? Somos da Academia Gaviões 24h 🦅"

WAIT

Tempo:

2 horas

CHECK_CONDITION

Condição:

cliente respondeu = true

21. TESTE REAL

Criar uma ferramenta de teste chamada:

TESTE-GAVIOES

Depois que o WhatsApp estiver realmente conectado, executar cinco mensagens reais, com aproximadamente 2 segundos entre elas:

🦅 TESTE 1 — Conexão do WhatsApp realizada com sucesso.

💬 TESTE 2 — O sistema conseguiu enviar uma mensagem.

📲 TESTE 3 — O envio automático está funcionando.

🤖 TESTE 4 — O módulo de automação está funcionando.

✅ TESTE 5 — Gaviões Bom Clima: teste concluído.

O teste só pode mostrar "sucesso" quando a API/provedor confirmar o envio.

22. TESTES OBRIGATÓRIOS DO MOTOR

TESTE 1 — Sem resposta

Lead criado.

↓

Automação inicia.

↓

Mensagem real enviada.

↓

WAIT.

↓

Cliente não responde.

↓

Próxima mensagem real enviada.

TESTE 2 — Cliente responde

Lead criado.

↓

Mensagem real enviada.

↓

Cliente responde.

↓

Webhook recebido.

↓

Sistema identifica resposta.

↓

Automação encerrada.

↓

Nenhum follow-up é enviado.

TESTE 3 — Reinício

Iniciar automação.

↓

Entrar em WAIT.

↓

Reiniciar backend.

↓

Automação continua corretamente.

TESTE 4 — Evento duplicado

Enviar/processar o mesmo evento duas vezes.

Resultado:

não pode enviar duas mensagens.

TESTE 5 — Falha temporária

Simular uma falha realista de API.

O sistema deve:

registrar erro;

tentar novamente;

respeitar limite;

não duplicar mensagens.

23. SEGURANÇA

Nunca colocar tokens ou credenciais diretamente no frontend.

Utilizar variáveis de ambiente/secrets.

Exemplo:

WHAPI_API_TOKEN

ou as credenciais equivalentes exigidas pelo provedor escolhido.

Nunca exibir tokens no navegador.

Nunca salvar credenciais em código-fonte.

24. LOGS

Registrar claramente:

conexão;

desconexão;

geração de QR;

QR expirado;

webhook recebido;

mensagem recebida;

mensagem enviada;

falha de envio;

retry;

início de automação;

execução de etapa;

WAIT;

encerramento;

cancelamento;

erro.

Os logs devem permitir descobrir exatamente o que aconteceu.

25. REGRA MAIS IMPORTANTE

NÃO quero que você diga que algo está funcionando apenas porque a interface mostra "funcionando".

O sistema só pode considerar:

WhatsApp conectado

quando a integração real confirmar a conexão.

Só pode considerar:

Mensagem enviada

quando o provedor retornar confirmação real.

Só pode considerar:

Mensagem recebida

quando houver evento/webhook real.

26. PROIBIDO

É PROIBIDO:

QR falso;

QR estático;

WhatsApp simulado;

mensagens mockadas;

webhook falso;

API inventada;

endpoint inventado;

status falso;

botão que apenas muda texto;

banco com dados fictícios para simular funcionamento;

setTimeout como mecanismo principal de WAIT;

criar funcionalidades que não foram solicitadas.

27. PRIORIDADE DO PROJETO

A ordem de prioridade é:

1. WhatsApp REAL

2. QR Code REAL

3. Envio REAL

4. Recebimento REAL

5. Webhooks REAIS

6. Motor de automação persistente

7. WAIT persistente

8. Idempotência

9. Interface

Não sacrifique o funcionamento real para deixar a interface bonita.

28. SE ALGO NÃO FOR POSSÍVEL

Se alguma funcionalidade não puder ser implementada no ambiente atual:

NÃO SIMULE.

Informe exatamente:

qual integração está faltando;

qual credencial é necessária;

qual API precisa ser configurada;

qual limitação existe;

qual parte precisa de configuração externa.

Não invente uma solução falsa apenas para apresentar a tela funcionando.

29. RESULTADO FINAL ESPERADO

Quando terminar, eu quero conseguir fazer exatamente isto:

ETAPA 1

Abrir o sistema.

ETAPA 2

Clicar:

CONECTAR WHATSAPP

ETAPA 3

Receber um QR CODE REAL.

ETAPA 4

Escanear o QR pelo WhatsApp do celular.

ETAPA 5

Sistema reconhecer:

🟢 WhatsApp conectado

ETAPA 6

Criar uma automação:

LEAD_CREATED

↓

SEND_MESSAGE

↓

WAIT 2 HORAS

↓

CHECK_CONDITION

ETAPA 7

Criar um lead.

ETAPA 8

O WhatsApp realmente enviar a primeira mensagem.

ETAPA 9

Se o cliente responder:

automação encerra.

ETAPA 10

Se não responder:

aguarda o período configurado e envia o próximo follow-up.

Tudo isso deve continuar funcionando mesmo depois de reiniciar o servidor.

INSTRUÇÃO FINAL

Construa o sistema completo seguindo exatamente essas especificações.

Não adicione funcionalidades fora do escopo.

Não simplifique a conexão do WhatsApp.

Não substitua QR real por API simulada.

Não substitua envio real por mock.

Não considere o projeto concluído até que o WhatsApp possa ser conectado por QR REAL e uma mensagem possa ser enviada e recebida de forma REAL.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://automacaogavioesbomclima.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/66c20f1c-3696-4b55-9698-125daf3f23ac).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
