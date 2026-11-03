# Substituições autorizadas por função

Data: 03/11/2026.

## Decisão de produto

A função pode autorizar diretamente uma ou várias outras funções. Exemplo:
Farmacêutico → Atendente; Gerente → Caixa e Vendedor. Todos os funcionários da
função principal herdam essas autorizações, inclusive novos cadastros. Enquanto
trabalha, uma pessoa pode atender sua própria função e cada função autorizada,
conforme a decisão 021. Continua contando uma única vez em cada exigência e na
equipe; não fornece cobertura durante sua pausa.

As autorizações são direcionais e não transitivas. Autorizar Gerente → Caixa
e Caixa → Vendedor não concede Gerente → Vendedor; marque essa função
explicitamente. Permissões individuais existentes continuam adicionais às
permissões da função. Desmarcar uma permissão individual não revoga uma
permissão herdada; o cadastro mostra a origem. A alteração da função atualiza
todos os seus funcionários sem gravar cópias da lista em cada pessoa.

## Contrato e implementação

`roles[].coverageRoleIds` é uma lista opcional de IDs, limitada a 50 destinos.
Ausência/null significa nenhum acréscimo por função. Arquivos anteriores mantêm
as permissões individuais, inclusive o contrato em que IDs explícitos vazios
prevalecem sobre nomes individuais antigos. Não existe migração que promova uma
autorização pessoal à função: isso poderia conceder permissão indevida a outras
pessoas. Renomear uma função conserva os vínculos por ID.

RoleCoveragePolicy é a política canônica C#. ScheduleRules delega a ela;
análise, diagnóstico de expediente, geração de candidatos, demanda contratada
e tradutor CP-SAT recebem o catálogo de funções. TypeScript recebe o mesmo
catálogo na análise e nas prévias. Uma prévia também considera a autorização
de cobertura fora do expediente, conservando restrições pessoais de dias.

DTOs/mapeadores preservam a lista e copiam suas coleções nas duas direções.
PlanningDocumentMapping congela as listas aninhadas no snapshot. Validação
estrutural no navegador limita as listas antes da migração, e frontend/backend
rejeitam IDs malformados/vazios e coleções excessivas. Documentos antigos
continuam aceitos sem mudança de versão. Turnos salvos e preferências de almoço
não são alterados por edição dessas autorizações.

## Interface

Na etapa Funções, o formulário mostra “Esta função também pode cobrir”, com
seleção múltipla e resumo das autorizações em cada função. A equipe mostra
separadamente as permissões herdadas e as individuais. A exclusão de uma função
fica bloqueada enquanto ela é referenciada em substituições, equipe, demanda
ou turnos; remova esses vínculos explicitamente antes de excluir.

## Regressões e verificação

`shared/role-coverage-scenarios.json` contém 12 documentos: gerente sozinho em
três funções, várias pessoas da mesma função, ausência e revogação de concessão,
direção, ausência de transitividade, união com concessão individual, pausa,
contagem de equipe, renomeação e autorização de demanda fora do expediente.
O corpus diferencial também os executa nos dois fusos.

Testes do formulário exercitam criação com duas permissões, herança por novo
funcionário, edição/revogação, preservação dos turnos e exclusão bloqueada por
referências. Testes puros C# protegem cópias dos DTOs e do snapshot. O adaptador
real gera cobertura com um gerente e sem permissões individuais. HTTP compara
os documentos em analyze/validate, exporta/importa o arquivo e usa o resultado
em solve; testa também a rejeição estrutural das novas listas.

A validação final e os limites da entrega são registrados abaixo.

## Validação local

Windows, Node 24.17.0 e SDK .NET 10.0.402:

- Suíte completa .NET: 796 aprovados (309 puros, 441 adaptador, 33 API e 13
  arquitetura). Depois, os testes específicos de geração foram ampliados para
  quatro combinações de carga contratada/legada e expediente normal/excepcional:
  4/4 aprovados, incluindo dois casos adicionais. Código de produção inalterado
  após a suíte completa; não se alega nova execução integral de 798 casos.
- Frontend: 595/595 em America/Cuiaba e 595/595 em America/New_York.
- Comparação diferencial: 191 documentos aprovados em cada fuso, incluindo
  todos os novos cenários.
- Lint e build frontend: aprovados. A compilação emite avisos de comentários da
  dependência Zod já existente; o roteiro final conserva o código de saída real.
- Integração HTTP/worker completa: 28/28 aprovados, com importação/exportação,
  análise/validação/geração, fila, timeout, cancelamento e proteções anteriores.
- Diff e links da documentação revisados.

Os testes do formulário verificam seus eventos e estado com React e o store;
não foi feita inspeção visual em navegador. Não houve acesso nem alteração ao
documento salvo no navegador do usuário. As autorizações precisam ser escolhidas
na etapa Funções; permissões individuais não foram promovidas automaticamente.
Sem publicação, push ou integração. CI remota permanece necessária antes de
integrar. A aplicação local preserva os arquivos anteriores em backup.
