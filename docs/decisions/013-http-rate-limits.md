# Entrega 1 — cotas HTTP por endpoint e IP

Data: 31/10/2026. Escopo: proteção HTTP da API; sem publicação ou alteração das
regras de escala. `review/PLANO-CORRECAO.md` e `review/PARECER-PUBLICACAO.md` não
estavam disponíveis neste checkout; foram usados os requisitos da solicitação.

## Problema reproduzido antes da implementação

Os testes foram acrescentados primeiro em `backend/security.integration.cjs` e
executados contra a API Release anterior à correção:

- Após consumir a cota em `/solve`, POST `/SOLVE/` retornou 400 em vez de 429:
  o roteamento reconhecia a rota, mas a comparação literal ignorava a barra final.
- Esgotar as 1.200 consultas de um IP provocou 429 tanto para outro IP quanto para
  DELETE do primeiro IP, em vez dos 404 esperados para os tickets inexistentes.
- As regressões com cotas baixas também falharam: consultas/cancelamentos não
  tinham opções configuráveis nem orçamentos independentes por IP.

Comandos de reprodução, antes da mudança produtiva:

```powershell
dotnet build backend/EscalaLivre.Api/EscalaLivre.Api.csproj -c Release -m:1
$env:SECURITY_BUILD_CONFIGURATION='Release'
node --test --test-name-pattern='generation quota|job quotas|polling and cancellation|forged IP headers' backend/security.integration.cjs
node --test --test-name-pattern='exhausting polls' backend/security.integration.cjs
```

Resultado: quatro falhas na primeira seleção e uma na segunda, com as diferenças
de status descritas acima. Os testes usam HTTP/Kestrel reais; não simulam roteamento.

## Decisão e comportamento

`RequestQuota` declara a categoria nos metadados do endpoint. O limitador consulta
`HttpContext.GetEndpoint()` após `UseRouting`, sem inspecionar caminho ou ticket.
POST `/solve` e POST `/solve/jobs` recebem a mesma categoria de geração. A cota
de seis gerações/minuto por IP continua compartilhada e adicional à cota geral.

GET e DELETE de `/solve/jobs/{id}` recebem categorias distintas, particionadas por
categoria e IP remoto. Tickets inexistentes consomem cota antes da consulta à fila.
Caixa e barra final seguem a resolução do roteador. Rotas sem esses metadados
continuam na cota geral, inclusive caminhos não resolvidos.

Novas opções de `Protection`, validadas na inicialização (1–10.000):

| Opção | Padrão por IP/minuto | Justificativa |
| --- | --- | --- |
| `JobPollsPerMinute` | 1.200 | 20 consultas/minuto por usuário com polling de 3s; 60 usuários por NAT nominalmente |
| `JobCancellationsPerMinute` | 60 | Orçamento próprio para cancelar, sem consumo por consultas |

A concorrência global, a ausência de fila HTTP, os proxies explicitamente
confiáveis, CORS, `Retry-After`, fila/worker e seus limites permanecem preservados.
As cotas continuam janelas fixas de um minuto. Nenhum documento ou contrato de
negócio C#/TypeScript precisou mudar.

## Validação

- As cinco regressões que falharam antes passaram após a implementação.
- .NET Release: 646 testes aprovados (239 análise/domínio, 379 adaptador, 15 API,
  13 arquitetura). Os sete novos casos de API verificam padrões e fronteiras das opções.
- Teste HTTP adicional aprovado: corpo pendente ocupa a única vaga global;
  geração, consulta e cancelamento de outros IPs recebem 429 com `Retry-After`.
- HTTP/worker Release: 21/21 aprovados na suíte completa executada e 1/1 no teste
  de concorrência acrescentado durante essa execução, totalizando os 22 casos
  do arquivo final. Inclui geração real, fila, cancelamento, memória, deadlines,
  edição/preservação e paridade por HTTP, além das novas regressões.
- Frontend: lint e build aprovados; 469/469 testes em UTC e 469/469 em
  America/New_York.
- Diferencial puro C#/TypeScript: 142/142 cenários em cada um desses fusos.
- Revisão do conteúdo, links locais da documentação e `git diff --check` concluídos.

Comandos finais: `dotnet test EscalaLivre.slnx -c Release -m:1`,
`SECURITY_BUILD_CONFIGURATION=Release` com `node backend/security.integration.cjs`,
`node --test --test-name-pattern='global concurrency still' backend/security.integration.cjs`,
`npm --prefix frontend run lint`, `npm --prefix frontend run build`,
`node --test frontend/tests/*.test.cjs` e `node tools/parity-differential.cjs`.
Os dois últimos foram executados com `TZ=UTC` e `TZ=America/New_York`.
Ambiente local: Windows, SDK .NET 10.0.401 com roll-forward e Node 24.14.1.
Não substitui a CI Ubuntu/Node 22.

## Limitações

As cotas são em memória e por instância. Réplicas exigem proteção coordenada no
gateway/armazenamento compartilhado. Pessoas no mesmo NAT continuam compartilhando
as cotas do IP: não há identidade autenticada para separar usuários. O cálculo
nominal de 60 usuários não reserva margem para reconexões ou rajadas, nem mede
capacidade de carga. A cota de geração permanece em seis por minuto por IP.

A concorrência global pode impedir temporariamente até um cancelamento; separar
cotas não reserva vagas de execução. Não foi realizada medição de capacidade,
publicação ou CI remota deste diff. A CI remota completa continua necessária antes
da integração. Segurança do proxy depende de configurar somente endereços
confiáveis e sobrescrever cabeçalhos vindos do público, conforme [SECURITY](../SECURITY.md).
