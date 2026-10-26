# Revisão final — EscalaLivre, etapa 6

Data: 26/10/2026. **Implementação revalidada localmente e CI remota conferida para o código de d40f887; aceite integral ainda aberto para calibração de desempenho representativo.** A [revalidação do código atual](stage-6-current-validation.md) registra nova recompilação dos fontes, matriz completa, ambiente, classificação de falhas e CI. Nenhum commit, push, integração ou publicação foi realizado na revalidação. As seções de sequência e validação original abaixo permanecem históricas.

Seguimento posterior: o [ADR 009](009-validated-operational-boundaries.md) registra a auditoria e os ajustes de tipos/unidades e mutabilidade da geração. Os resultados e a CI de d40f887 abaixo são o baseline histórico. O novo diff passou em 612 testes .NET, 373 frontend em cada fuso, lint/builds e 16 HTTP; CI desse diff ainda pendente antes de integrar.

## Mudanças e sequência verificada

Baseline da etapa 5 revalidado antes de alterar consumidores: [197 puros](evidence/stage-6/analysis-baseline.txt), [384 mistos](evidence/stage-6/backend-baseline.txt), [16 HTTP](evidence/stage-6/security-baseline.txt), sem falhas. Depois da migração, ainda com as classes antigas disponíveis, [207 puros](evidence/stage-6/analysis-migrated.txt), [366 adaptador](evidence/stage-6/adapter-migrated.txt) e [8 API](evidence/stage-6/api-migrated.txt) passaram: os mesmos 581 casos. Só então foram removidos os 23 fontes de teste antigos e seu projeto misto e IScheduleSolver/OrToolsScheduleSolver/LegacySolverComposition.

Testes usam os casos de uso e capacidades reais. Helpers de teste constroem capacidades separadas e não são uma nova fachada. Duplicações/delegações de transição C#/TS foram retiradas com consumidores migrados para políticas; novos modelos do solver não expõem tipos nativos pela superfície pública. Treze testes de arquitetura C# e dois frontend protegem as fronteiras. CI e solução agora separam os grupos; os comandos atuais estão no [guia](../testing.md).

A pendência temporal da fila foi tratada em ajuste de teste separado: a sonda depois dos solves concorrentes usa análise simples com o mesmo limite de 1s, um slot e fila zero; geração/recuperação de solve continuam cobertas com orçamento normal. Não se removeu a carga solve nem se ampliou timeout/limites de produção. O teste deixa de exigir inicialização nativa fria subsegundo como prova de liberação de slot.

## Revisão de aceite por etapa

| Etapa | Evidência de saída revisada | Situação |
| --- | --- | --- |
| 1 — Caracterização | Baseline, mapa de 26 famílias, decisões, fronteiras compartilhadas e reprodução D1 preservados; 58 documentos e hashes continuam iguais | Atendida localmente; relato original permanece histórico |
| 2 — Portas e análise | Analyze/Validate com avaliador comum, projeto/deployment puros, endpoints/envelopes e worker verificados; fachada retirada após migração | Atendida localmente |
| 3 — Tipos/agregados | Construção e invariantes, operações atômicas/coleções protegidas, conflitos carregáveis, round-trip atual/legado/migração idempotente | Atendida localmente; projeções de leitura primitivas mantidas por finalidade |
| 4 — Políticas/regimes | Seis políticas, registro de estratégias, desconhecidos/duplicados, contrato parcial/estimativa e 20 casos compartilhados | Atendida localmente |
| 5 — Adaptador/admissão | Seis famílias de tradução, limites/pesos/status, modelos reais, guarda contra novas violações e D1 equipe/função com paridade | Atendida localmente |
| 6 — Consolidação | Fachadas removidas, separação/arquitetura/validação local completas; comparação retrospectiva documentada | Revalidada localmente, CI conferida; limites representativos em aberto |

## Evidência nas seis dimensões

| Dimensão | Evidência implementada e verificada | Limite da conclusão |
| --- | --- | --- |
| Camadas | Grafo de projetos/assemblies, imports internos e superfície exportada; CP-SAT/PDF internos; API compõe capacidades | CI Ubuntu conferida na revalidação; merge de teste com os mesmos arquivos de d40f887 |
| DDD tático | PlanningSchedule/Settings e identidade/coleções protegidas; comandos/mudanças explícitas; conflitos de negócio continuam representáveis | Não se introduziram persistência, repositórios ou eventos sem necessidade |
| Modelagem de domínio | Janelas/pausas/período/unidades/configurações validados, DTOs e mapeadores com round-trip atual/legado | Projeções de leitura conservam primitivos e não são o agregado protegido |
| SOLID | Responsabilidades separadas; registros de regimes/famílias; contratos parciais e portas pequenas; consumidores sem fachada | Não é certificação binária nem prova de toda extensão futura |
| Consistência das regras | 58 hashes/documentos, 20 contratos, dois casos D1, avaliação comum e rejeição de novas violações/agregados agravados | Não equivale a prova universal de todos os modelos/ótimos possíveis |
| Testabilidade | Puro/adaptador/API/arquitetura/HTTP separados; ausência nativa no deployment puro; scanner testado com exemplos proibidos | Testes/métricas não substituem validação em ambiente e carga alvo |

## Validação completa local

| Verificação | Resultado | Evidência |
| --- | --- | --- |
| Domain/Application puros | 207/207 | [puro](evidence/stage-6/analysis-final.txt) |
| Adaptador real e arquivos/PDF/recuperação | 366/366 | [adaptador](evidence/stage-6/adapter-final.txt) |
| API: composição/fila/memória | 8/8 | [API](evidence/stage-6/api-final.txt) |
| Arquitetura C# | 13/13 | [arquitetura](evidence/stage-6/architecture-final.txt) |
| Frontend: regras, contratos, recuperação, store, edição e arquitetura | 373/373 | [frontend](evidence/stage-6/frontend-final.txt) |
| Frontend com TZ=America/New_York | 373/373; TZ restaurado | [fuso](evidence/stage-6/frontend-new-york-final.txt) |
| Lint/frontend build | exit 0 | [lint](evidence/stage-6/lint-final.txt), [build](evidence/stage-6/frontend-build-final.txt) |
| Solução inteira/API Release | zero avisos/erros | [solução](evidence/stage-6/solution-build-final.txt), [API build](evidence/stage-6/api-build-final.txt) |
| HTTP/API/worker real | 16/16 | [HTTP](evidence/stage-6/security-final.txt) |

Total .NET: 594 casos, sendo os 581 anteriores mais 13 de arquitetura, sem diminuir cobertura para remover a fachada. HTTP inclui frontend/analyze/validate/solve, cobertura/lacunas/score, documentos civis/legados, fluxos de edição/geração, revogação/função, token/fila, limites de entrada/memória/tempo e cancelamento com processo filho real. A recuperação do cliente e a preservação em falha/cancelamento seguem verificadas. Preferências, limites operacionais, endpoints e formatos não foram alterados nesta etapa.

## Desempenho e pendências

Foi feita [comparação retrospectiva](stage-6-performance.md) com os mesmos cenários, SDK/runtime e máquina, cinco pares por caso/operação. Resultados mistos: solve de 8h 14,079 → 7,028ms; solve de 4h 1,256 → 1,538ms, com crescimento do modelo/alocação no segundo. Não há ganho global demonstrado. Limites min/máximo observados são alertas locais derivados do baseline; calibração de orçamento representativo de regressão permanece pendente, sem percentuais arbitrários.

- [x] Código, documentação atual, remoções e validação local executados; hashes/lockfile/global.json preservados.
- [x] CI separada por fronteira e fuso alternativo configurados; nome do gate backend anterior preservado.
- [x] Reprodução local de tempo, memória e tamanho de modelo registrada, com dados brutos/manifestos.
- [x] CI remota Ubuntu/Node 22 conferida em 26/10/2026: Validate #20, todos os seis jobs verdes, associada a d40f887. Checkout remoto 0f32fa5 (merge de teste), com diferença de arquivos vazia para d40f887; detalhes e evidências na [revalidação do código atual](stage-6-current-validation.md). A afirmação anterior de CI não executada descrevia a sessão de implementação.
- [ ] Carga representativa e calibração de gates de desempenho no ambiente alvo. Os dois casos pequenos não sustentam um orçamento de produção.

Ambiente local: Windows, SDK selecionado 10.0.402/runtime 10.0.13, Node 24.17.0/npm 11.13.0. global.json pede 10.0.201 e permite latestFeature, portanto a seleção local cumpre a configuração; execução exata sem roll-forward não foi feita. Ubuntu/Node 22 não estavam disponíveis localmente; não se instalou WSL nem se publicou código para simular CI. Dependências existentes respeitam o lockfile; reinstalação limpa com npm ci será feita pelo workflow, não foi alegada nesta sessão.

A matriz atual repetiu 594 testes .NET, 373 frontend em cada fuso e 16 HTTP, além de recompilação integral/lint/builds; todos passaram na primeira execução. Não houve falha de produto ou ambiente nas verificações, nem intermitência reproduzida. Nenhum código/teste/limite de produção precisou ser alterado. SDK exato 10.0.201 sem roll-forward e calibração representativa continuam sem evidência própria; a CI observada usou 10.0.403/Node 22.23.3.

## Falhas introduzidas, revisão e evidências históricas

Houve falha intermediária CS7036 porque o script de consolidação não reconheceu separadores Windows e migrou uma chamada sem sua sobrecarga ([log](evidence/stage-6/architecture-first.txt)); o script foi corrigido e todas as verificações afetadas passaram. Na revisão, o regex inicial de imports estava escapado incorretamente no gerador; foi corrigido antes do aceite, com teste explícito de alias/static/ordinary e verificação de não vacuidade. Não se tratou o primeiro verde como prova suficiente. Ao estender a mesma proteção aos projetos de teste, um escape de caractere gerou uma falha de compilação somente no teste ([log](evidence/stage-6/architecture-boundaries-intermediate.txt)); foi substituído por código de caractere explícito e o teste final passou.

O baseline desta etapa não tinha falha. As intermitências de 1s e erros de preparação das etapas anteriores continuam em seus relatórios/logs. Não foram apagados para declarar sucesso. Os documentos/códigos de diagnóstico congelados não foram atualizados para ocultar mudança de regra. A correção D1 e a guarda de admissão já eram mudanças deliberadas da etapa 5, preservadas aqui.

Relatórios antigos mantêm comandos/nomes históricos; links de fonte retirados foram redirecionados ou anotados. Raiz atual: [arquitetura](../architecture.md), [paridade](../rule-parity.md), [testes](../testing.md), [ADR 008](008-final-boundaries-and-validation.md). Staging/cópias retiradas e manifestos de migração ficam em Documents/escalalivre-stage6; fontes/rotinas reproduzíveis e logs relevantes foram preservados no repositório. Nenhuma migração de arquivo/dados foi necessária.
