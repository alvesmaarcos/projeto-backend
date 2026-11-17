# GTECH — API de catálogo

API REST com Node.js, Express 5, MySQL, Sequelize, JWT, Jest e Swagger. Inclui CRUD de usuários, categorias e produtos, imagens locais e opções. A [especificação original](docs/requisitos-original.md) foi preservada; o contrato implementado está em [docs/openapi.js](docs/openapi.js).

## Setup

Requisitos: Node.js 22+, npm e MySQL 8.4 (ou Docker Compose).

```powershell
npm ci
Copy-Item .env.example .env
docker compose up -d --wait mysql
```

Edite `.env`: defina `JWT_SECRET` com pelo menos 32 caracteres aleatórios. Para gerar um segredo:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
npm run db:migrate
npm run dev
```

API em `http://localhost:3000`; [Swagger UI](http://localhost:3000/docs/); [OpenAPI JSON](http://localhost:3000/openapi.json).

Sem Docker, crie um banco MySQL `catalog` com charset `utf8mb4`, conceda ao usuário da aplicação permissões sobre esse banco e ajuste `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` e `DB_PASSWORD`. Credenciais do Compose são para desenvolvimento local. A aplicação não usa `sync()` nem modifica o esquema ao iniciar.

| Comando                    | Finalidade                                                            |
| -------------------------- | --------------------------------------------------------------------- |
| `npm start`                | Iniciar servidor                                                      |
| `npm run dev`              | Reiniciar durante desenvolvimento                                     |
| `npm run db:migrate`       | Aplicar migrations pendentes                                          |
| `npm run db:undo`          | Reverter a última migration; a inicial remove as tabelas e seus dados |
| `npm test`                 | Testes unitários e de integração                                      |
| `npm run test:unit`        | Testes sem banco                                                      |
| `npm run test:integration` | Testes com MySQL isolado                                              |

## Estrutura e banco

`src/routes` define rotas; `controllers` valida entrada e produz respostas; `services` concentra regras e transações; `models` define entidades; `middleware` trata autenticação e erros; `config` configura ambiente, conexão e migrations. `app.js` permite testes HTTP sem iniciar o servidor; `server.js` verifica o banco e gerencia o processo.

Tabelas: `users`, `categories`, `products`, `product_images`, `product_options` e `product_categories`. Email tem unicidade; o vínculo produto–categoria tem chave composta. Preços usam `DECIMAL(10,2)`, expostos como números JSON. Usuários, categorias e produtos têm `created_at` e `updated_at`.

Excluir produto remove filhos e vínculos; excluir categoria remove apenas vínculos. Há índices para preço, menu e chaves estrangeiras. A busca de produtos usa `EXISTS`, pagina antes de carregar associações em lote e evita contagem duplicada.

## Endpoints e acesso

| Método           | Rota                                      | Acesso                      |
| ---------------- | ----------------------------------------- | --------------------------- |
| POST             | `/v1/user`                                | Público: cadastro           |
| POST             | `/v1/user/token`                          | Público: login              |
| GET, PUT, DELETE | `/v1/user/:id`                            | JWT, apenas a própria conta |
| GET              | `/v1/category/search`, `/v1/category/:id` | Público                     |
| POST             | `/v1/category`                            | JWT                         |
| PUT, DELETE      | `/v1/category/:id`                        | JWT                         |
| GET              | `/v1/product/search`, `/v1/product/:id`   | Público                     |
| POST             | `/v1/product`                             | JWT                         |
| PUT, DELETE      | `/v1/product/:id`                         | JWT                         |

Cadastre um usuário com `firstname`, `surname`, `email`, `password` e `confirmPassword`. Senha: mínimo de oito caracteres e máximo de 72 bytes UTF-8. Faça login com email e senha e use `Authorization: Bearer <token>` ou **Authorize** no Swagger. JWT usa HS256, expira em uma hora por padrão (`JWT_EXPIRES_IN`) e deixa de funcionar quando a conta é excluída. Senhas usam bcrypt e nunca aparecem nas respostas.

POST de recursos retorna 201 com o registro criado; login/consultas retornam 200; PUT/DELETE retornam 204 sem corpo. Erros: `{ "error": { "message": "...", "details": [...] } }`, com `details` opcional. Validação/duplicidade: 400; autenticação: 401; acesso a outra conta: 403; recurso/rota ausente: 404; erro inesperado: 500 sem detalhes internos.

### Buscas

- Categorias: `limit`, `page`, `fields`, `use_in_menu=true|false`.
- Produtos: `limit`, `page`, `fields`, `match`, `category_ids`, `price-range`, `option[ID]`.
- Padrões: `limit=12`, `page=1`, ordem crescente por ID. `limit` aceita 1–100 ou -1 (todos; página ignorada e retornada como 1).
- Resposta: `{ "data": [], "total": 0, "limit": 12, "page": 1 }`. Total considera registros filtrados antes de paginar.
- `fields=name,slug` seleciona campos públicos; nomes desconhecidos são rejeitados. Em produtos também aceita `images`, `options` e `category_ids`.
- `match` busca trecho literal em nome/descrição; `price-range=100-200` é inclusivo sobre `price`.
- `category_ids=1,2` aceita qualquer categoria listada. `option[45]=GG,PP` aceita qualquer valor da opção de ID 45. Filtros distintos se combinam por AND.

### Produtos, imagens e opções

```json
{
  "name": "Tênis esportivo",
  "slug": "tenis-esportivo",
  "price": 120.5,
  "price_with_discount": 100,
  "stock": 5,
  "category_ids": [],
  "options": [{ "title": "Tamanho", "values": ["M", "G"], "radius": "4px" }]
}
```

PUT é parcial: campos omitidos são preservados; `category_ids` substitui vínculos (array vazio remove todos). Em `images`/`options`, itens sem ID criam registros, com ID atualizam e com `deleted: true` excluem. IDs devem pertencer ao produto e não se repetir. Omissão ou array vazio de imagens/opções preserva os registros existentes.

Novas imagens exigem `type` (`image/png`, `image/jpeg`, `image/jpg`) e `content` em base64 puro, sem prefixo `data:`. Limites: 5 MB/imagem, 25 milhões de pixels, 20 operações de imagem/requisição e 40 MB no JSON. O conteúdo é decodificado e validado antes de gravar. A resposta retorna `/media/<uuid>.<ext>`; na atualização essa mesma URL pode ser mantida, mas URLs externas não são importadas. `UPLOAD_DIR` define o armazenamento (padrão `uploads`).

Opções usam `values` como array, aceitando `value` como alias (não envie ambos). `radius` aceita inteiro não negativo ou texto como `4px`, retornando inteiro. Os valores são armazenados separados por vírgulas, com limite conjunto de 255 caracteres; valores individuais com vírgulas são rejeitados. Novas opções exigem `title` e `values`; padrão: `shape=square`, `type=text`, `radius=0`.

Alterações de produto e relacionamentos usam transações. Arquivos novos são removidos em rollback; substituídos/excluídos são removidos após commit. O filesystem não participa da transação SQL: interrupção abrupta ou falha de disco pode deixar arquivos órfãos; falhas de limpeza são registradas. Em produção, o diretório deve ter armazenamento persistente.

## Testes

```powershell
docker compose --profile test up -d --wait mysql-test
npm test
docker compose --profile test stop mysql-test
```

MySQL de teste: porta 3307, armazenamento temporário, separado do desenvolvimento. A suíte redefine `catalog_test`, aplica/reverte/reaplica migrations e testa autenticação, autorização, CRUD, filtros, paginação, cascatas, rollback e arquivos. Use um banco dedicado sem dados a preservar.

Para outro MySQL, crie `.env.test` com `TEST_DB_HOST`, `TEST_DB_PORT`, `TEST_DB_NAME`, `TEST_DB_USER`, `TEST_DB_PASSWORD`. O nome deve terminar em `_test`; configurações do banco de desenvolvimento não são usadas como destino. Testes executam sequencialmente. Arquivos de integração ficam em `test-uploads/`, ignorado pelo Git.

## Decisões sobre a especificação

- Cadastro/login públicos; token ausente/inválido retorna 401, corrigindo a contradição entre 400 e 401.
- Dados de usuário são privados ao titular. Não há perfis administrativos: qualquer conta autenticada escreve no catálogo.
- Preços usam decimal em vez de float. `price_with_discount=0` é aceito conforme exemplos originais.
- PUT preserva campos omitidos; aliases e formatos de opções foram normalizados conforme descrito acima.
- Booleanos no JSON devem ser booleanos reais. Campos desconhecidos, números inválidos e referências inexistentes retornam 400.
- Produtos desabilitados continuam acessíveis nas consultas, pois o contrato não define filtro por `enabled`.

Referências: [Express 5](https://expressjs.com/en/guide/error-handling/), [transações Sequelize](https://sequelize.org/docs/v6/other-topics/transactions/), [migrations Sequelize](https://sequelize.org/docs/v6/other-topics/migrations/).
