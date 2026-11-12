# Instituto Canto Nativo

Site responsivo e PWA do Instituto Canto Nativo, agora com API local de cadastro e login. O cadastro guarda nome e e-mail em SQLite; a senha é derivada com `scrypt` e nunca é gravada em texto puro. As sessões usam cookie `HttpOnly` e tokens guardados como hash no banco.

## Rodar pelo VS Code

É necessário **Node.js 22.13.0 ou mais recente** (módulo SQLite integrado do Node). Extraia o ZIP, abra a pasta `instituto-canto-nativo` no VS Code e use Terminal → Novo Terminal:

```bash
npm start
```

Não é necessário rodar `npm install`: a API usa módulos integrados do Node. Abra <http://localhost:3000>. Para encerrar o servidor, volte ao terminal e pressione `Ctrl+C`.

Na primeira inicialização, o servidor cria automaticamente `data/canto-nativo.sqlite` e as tabelas definidas em `database/schema.sql`. O Node 22 pode exibir um aviso de que `node:sqlite` ainda está em desenvolvimento; no Node 22.13+ o banco funciona sem dependências adicionais.

## Ver o banco no Database Client

1. Deixe o servidor ligado ao menos uma vez para criar o banco.
2. No VS Code, abra a extensão **Database Client**, crie uma conexão **SQLite** e escolha o arquivo `data/canto-nativo.sqlite` dentro desta pasta.
3. Atualize a árvore de tabelas. `users` contém `id`, `name`, `email`, `password_hash` e `created_at`; `sessions` guarda somente o hash dos tokens de sessão e o prazo de validade.
4. O esquema inicial também está disponível em `database/schema.sql`.

O banco local e seus arquivos auxiliares são ignorados pelo Git. Para fazer uma cópia consistente, pare o servidor com `Ctrl+C` e copie `data/canto-nativo.sqlite`.

## Testar a API no Rapid API Client

A especificação OpenAPI está em `api/openapi.yaml`. Crie requisições para `http://localhost:3000` com os dados abaixo; nos métodos POST, selecione corpo JSON e `Content-Type: application/json`.

**Verificar API e banco — GET `/api/health`**

```json
{}
```

**Criar cadastro — POST `/api/auth/register`**

```json
{
  "name": "Ana Silva",
  "email": "ana@example.com",
  "password": "minha-senha-123"
}
```

Resposta esperada: `201 Created`, objeto `user` e cookie de sessão. Nome deve ter de 2 a 100 caracteres, e-mail válido e senha de 8 a 128 caracteres. E-mail já cadastrado retorna `409 Conflict`; erros de validação retornam `400`.

**Entrar — POST `/api/auth/login`**

```json
{
  "email": "ana@example.com",
  "password": "minha-senha-123"
}
```

**Ver a sessão atual — GET `/api/me`**

Este pedido retorna o usuário atual se o cliente mantiver o cookie `canto_nativo_session` recebido no cadastro/login. Se a extensão não o enviar automaticamente, habilite o cookie jar da coleção ou copie o valor do cookie `Set-Cookie` da resposta para um cabeçalho `Cookie` nesta requisição.

**Sair — POST `/api/auth/logout`**

Corpo JSON vazio: `{}`. Remove a sessão associada ao cookie.

A API não disponibiliza uma rota pública para listar usuários. Confira os registros pelo Database Client. Não use dados reais de pessoas no ambiente local de teste.

## PWA e build

- Manifesto: `public/manifest.json`.
- Service worker: `public/service-worker.js`; respostas de `/api/` nunca são armazenadas no cache offline.
- Ícones instaláveis: `public/icons/icon-192.png` e `public/icons/icon-512.png`.
- Símbolo de marca fornecido pelo Instituto: `public/assets/logo-beija-flor.png`; utilizado no cabeçalho, rodapé, favicon e ícones do app.
- Validação local do pacote: `npm run build`.

## Limite importante antes de publicar

O SQLite em `data/canto-nativo.sqlite` é uma configuração de **desenvolvimento local**. O arquivo não é enviado ao GitHub, e o sistema de arquivos de um serviço Render pode ser temporário; portanto, não publique cadastro real usando esse banco sem configurar armazenamento persistente e uma estratégia de banco apropriada para produção. O `render.yaml` já inicia a API como serviço Node, mas isso, por si só, não torna o arquivo SQLite persistente no Render.
