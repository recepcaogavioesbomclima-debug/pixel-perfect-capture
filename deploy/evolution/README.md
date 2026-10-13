# Evolution API — implantação

A Evolution API precisa de um servidor sempre ligado (Docker, Postgres, Redis) e
não roda dentro da hospedagem do app. Use uma VPS (ex.: Hostinger, Contabo, DigitalOcean,
2 GB RAM) ou um serviço gerenciado de Evolution API.

1. Na VPS: instale Docker, copie esta pasta, `cp .env.example .env`, edite a chave e a URL.
2. `docker compose up -d` e aponte um domínio com HTTPS (Caddy/Nginx) para a porta 8080.
3. No app: Configurações → informe URL, API Key (= AUTHENTICATION_API_KEY) e nome da instância → Salvar.
4. Tela WhatsApp → gerar QR Code, escanear, e clicar em Registrar webhook.

Trocar de servidor depois é só alterar a URL/chave em Configurações.
