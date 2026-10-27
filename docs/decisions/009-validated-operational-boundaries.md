# ADR 009 — Tipos validados nas fronteiras operacionais

Data: 26/10/2026. Estado: implementado em duas etapas e validado localmente; CI do diff pendente antes de integração. Complementa ADRs [005](005-validated-planning-and-transport.md), [006](006-scheduling-policies-and-regime-contracts.md) e [007](007-optimization-translators-and-admission.md). Não introduz schema ou regra de escala nova.

## Auditoria e prioridade

Baseline: código de d40f8871238398bcab91bd081742986c244f4548, revalidado na [rodada anterior](stage-6-current-validation.md). As alterações documentais dessa rodada já estavam presentes e foram preservadas. A auditoria seguiu as chamadas de API/worker, casos de uso, gerador, tradutores, aplicação/edição e transporte/cliente; não confundiu declaração de projeção com garantia de invariantes.

| Caminho de produção | Risco identificado | Decisão aplicada ou limite deliberado |
| --- | --- | --- |
| ScheduleCandidateGenerator → configuração efetiva | WorkloadRule lido diretamente; chamada sem HTTP gerava candidatos mesmo com NaN/Infinity/limite semanal negativo | Construir PlanningSettings, resolver RegimeFor e consumir duração e variante tipadas; entrada inválida falha antes de enumerar candidatos |
| ScheduleModelInput → tradutores/objetivo | Configuração lida de listas/projeções externas podia divergir do snapshot validado | Settings congela configuração e Request referencia empresa/pessoas desse snapshot; sem nova cópia do documento inteiro/novo agregado |
| DayCycle/WeeklyWork/RestConstraints | workUnits/restUnits e long de ticks sem distinção de unidade | DayCycleConfiguration + DayCount, WeeklyHours + Duration, e descanso tipado; conversão para escalares somente no adaptador matemático |
| DayBasedRegime/HourBasedRegime | Uma estratégia aceitava regra de outro regime e reinterpretava horas como dias ou vice-versa | Mapeamento explícito RegimeConfiguration.From e exigência da variante correta antes de operar/estimar; IShiftRegime e registro extensível preservados |
| ScheduleCapacityPolicy | Cast de double finito muito grande para long produzia orçamento inválido silenciosamente | WeeklyHours na assinatura, conversão checked/floor; Duration para trabalho preservado, DayCount para datas já usadas |
| GenerateSchedule → ApplyGeneration | ReplacePeriod era chamado, mas depois se devolvia proposed, incluindo tags mutáveis do adaptador | Exportar somente o snapshot imutável do agregado e usar suas seleções para decisões; nenhum buffer externo cruza a admissão por referência |
| PlanningEditor → PlanningDocumentMapping → PlanningSchedule | Operações de escrita já passavam por Assign/Update/Move/ReplacePeriod/ChangePeriod/ChangeEmployeeRole | Mantidas; não substituir por with em projeções. Os DTOs de comandos continuam simples e atravessam o mapeador explícito |

As reproduções demonstram falhas de contrato interno; não constituem alegação de que o endpoint aceitava esses regimes inválidos. DocumentSafety já os rejeitava antes do worker. O caso de overflow usa um limite fora dos máximos do transporte para demonstrar a conversão insegura diretamente na política.

## Implementação incremental e evidência anterior à correção

1. Acrescentados testes sobre as APIs existentes: cinco casos puros falharam ([TRX original](evidence/domain-boundaries/analysis-red.trx)) e três do adaptador falharam ([TRX original](evidence/domain-boundaries/adapter-red.trx)), sem alteração produtiva. Reproduzem configuração incompatível, overflow e alias mutável após o agregado.
2. Protegidos configuração/unidades: 210 testes puros e 369 do adaptador passaram antes de corrigir a mutabilidade ([puro](evidence/domain-boundaries/configuration-analysis.trx), [adaptador](evidence/domain-boundaries/configuration-adapter.trx)). Os dois testes de mutabilidade ainda vermelhos foram excluídos somente desse check intermediário, explicitamente; a matriz final não usa filtro.
3. Fechada a saída do agregado e acrescentadas regressões de herança, buffers reutilizados durante avaliação, limites semanais fracionários, segundos e descanso em horas com OR-Tools real. A primeira rodada teve quatro falhas por comparações de referência em testes de preservação ([TRX](evidence/domain-boundaries/aggregate-adapter.trx)); valores/JSON estavam iguais. As asserções passaram a comparar o conteúdo completo, não apenas IDs/contagem. As regressões novas exigem imutabilidade e preservação de cada campo, sem remover cenários ou afrouxar restrições.
4. Um helper novo de análise ficou sem import de ScheduleResult, causando CS0246/CS0738 no primeiro rebuild completo ([log](evidence/domain-boundaries/intermediate-solution-build.txt)). Corrigida a importação; nenhuma suíte daquele build falho foi usada como validação atual. Rebuild e matriz completos repetidos com fontes corretos.

## Contratos preservados e nova garantia interna

PlanningSettings.RegimeFor resolve a herança uma vez em dicionário imutável, mantendo também a configuração própria da pessoa (inclusive quando inativa por herança). Composição não ganha conhecimento de novos regimes. As estratégias embutidas verificam a precondição já documentada, mas a porta/registro continuam aceitando implementações externas de teste sem condicionais no resolvedor.

O gerador conserva grades, opções de pausas, IDs, tags, filtros e limites; só muda a origem da configuração operacional. DayCyclePolicy usa a mesma contagem de datas e histórico bilateral. WeeklyLimitTicks conserva horas fracionárias e floor para ticks; não arredonda para minutos nem impõe percentuais/limites novos. Descanso continua o maior entre empresa e regime em horas. Nenhum prazo, orçamento, peso CP-SAT ou limite HTTP foi ampliado.

ApplyGeneration continua abrindo o documento por PlanningDocumentMapping, convertendo atribuições para ScheduledAssignment/CivilWindow/ShiftPause e aplicando ReplacePeriod. Compara a proposta com o conteúdo inteiro resultante (incluindo Kind, pausa, source, tags, ordem, IDs e histórico). Agora devolve a exportação imutável desse agregado, em vez de voltar à projeção fornecida pelo adaptador. Decisões usam as seleções já admitidas, mesmo que o adaptador reutilize seus buffers durante a análise. A garantia nova é isolamento contra mutação; identidade de referência/contêiner na geração bem-sucedida deixa de ser um contrato. Os insucessos continuam retornando as atribuições originais sem aplicar alterações.

JSON e arquivos existentes permanecem iguais por valor, sem migração/schema novo. DTOs, conversores, lockfiles e cenários congelados não foram alterados. Os 58 hashes completos, 20 contratos de regimes, cenários D1 e round-trips atuais/legados passaram. Pausa encostada na borda, conflitos herdados/sobrepostos, jornada e descanso em conflito continuam carregáveis/editáveis/diagnosticáveis; não se exige conformidade de negócio para abrir um agregado estruturalmente válido.

## Projeções que permanecem simples

- Application.Contracts.Documents e ScheduleRequests: strings, inteiros, doubles e datas são dados de transporte, com validação/mapeamento na entrada. Não foram criados wrappers para IDs, nomes de função, códigos, status, pesos ou contagens de apresentação.
- ScheduleModels: CompanyRules/Employee/ShiftAssignment/WorkloadRule continuam projeções de leitura e compatibilidade. Não são APIs protegidas de escrita. Diagnóstico, cobertura, sugestões, exportadores e frontend precisam apresentar dados conflitantes; não foram obrigados a construir uma escala conforme para analisá-la.
- Sobrecargas de leitura em EffectiveWorkPolicy/RestPolicy e DayCyclePolicy continuam disponíveis para diagnóstico e admissão. Os caminhos matemáticos de produção usam as variantes tipadas. Não se promete que toda função pura agora recebe um objeto de valor ou que as projeções, por si, são imutáveis.
- ScheduleModelInput e ScheduleResultReader ainda produzem/intermedeiam propostas com projeções de turnos. A admissão em Application exige o agregado antes de devolver uma geração aceita; a leitura intermediária do adaptador não equivale a confirmar uma edição.
- TypeScript mantém seus contratos simples e a validação estrutural existente em documentSchema/nativeDocument e formulários. Store/lifecycle continuam apresentação/coordenação local e implementações distintas do agregado C#. Esta entrega não migra Zustand para classes de domínio nem afirma proteção C# sobre setters locais. Não se introduziu lógica de negócio em React ou wrappers de unidades só para uniformidade.

## Validação final dos fontes

Windows 10.0.26100/win-x64; SDK 10.0.402/runtime 10.0.13; Node 24.17.0/npm 11.13.0. global.json pede 10.0.201 com latestFeature; sem execução exata sem roll-forward ou npm ci local. Fuso padrão America/Cuiaba, TZ inicialmente ausente; America/New_York foi definido só no processo filho, preservando o ambiente pai. [Ambiente](evidence/domain-boundaries/environment.txt).

A matriz começou com recompilação integral atual, antes das suítes, seguida dos comandos da [matriz do plano](../architecture-improvement-plan.md). Os dotnet test compilaram os respectivos projetos; não houve --no-build. HTTP usou API Release recém-compilada e processos filhos reais, sem build/testes concorrentes. [Comandos, horários UTC e exit codes](evidence/domain-boundaries/final/results.json); [manifesto SHA-256 dos fontes/configurações validados](evidence/domain-boundaries/final/source-manifest.json).

| Verificação | Resultado | Evidência |
| --- | --- | --- |
| solution-build | exit 0 | [solution-build](evidence/domain-boundaries/final/solution-build.txt) |
| analysis | 215/215 | [analysis](evidence/domain-boundaries/final/analysis.txt) |
| adapter | 376/376 | [adapter](evidence/domain-boundaries/final/adapter.txt) |
| api | 8/8 | [api](evidence/domain-boundaries/final/api.txt) |
| architecture | 13/13 | [architecture](evidence/domain-boundaries/final/architecture.txt) |
| frontend | 373/373 | [frontend](evidence/domain-boundaries/final/frontend.txt) |
| frontend-new-york | 373/373 | [frontend-new-york](evidence/domain-boundaries/final/frontend-new-york.txt) |
| lint | exit 0 | [lint](evidence/domain-boundaries/final/lint.txt) |
| frontend-build | exit 0 | [frontend-build](evidence/domain-boundaries/final/frontend-build.txt) |
| api-build | exit 0 | [api-build](evidence/domain-boundaries/final/api-build.txt) |
| http-worker | 16/16 | [http-worker](evidence/domain-boundaries/final/http-worker.txt) |

Comandos na raiz: dotnet build EscalaLivre.slnx -c Release -t:Rebuild; dotnet test backend/EscalaLivre.{Analysis,Adapter,Api,Architecture}.Tests/EscalaLivre.{mesmo nome}.Tests.csproj -c Release (um comando por projeto); node --test frontend/tests/*.test.cjs, repetido com TZ=America/New_York; npm --prefix frontend run lint; npm --prefix frontend run build; dotnet build backend/EscalaLivre.Api/EscalaLivre.Api.csproj -c Release; SECURITY_BUILD_CONFIGURATION=Release no processo node backend/security.integration.cjs. Os argumentos exatos de cada processo estão no JSON acima.

Total .NET: 612 (215 puros + 376 adaptador + 8 API + 13 arquitetura), com 18 novos casos e todos os anteriores mantidos. Frontend 373 em cada fuso e HTTP 16. Build da solução/API sem avisos/erros; lint/build frontend aprovados. Nenhuma falha final, caso ignorado ou intermitência reproduzida. Falhas intermediárias de preparação/testes foram registradas acima, sem atribuí-las ao ambiente ou ocultá-las por repetição.

## Pendências e alcance

A CI remota previamente conferida para d40f887 permanece evidência do baseline, não deste diff. Novas alterações são locais e precisam de CI completa antes de integrar; nenhum commit/push/publicação/integração ou rerun remoto foi realizado. Não se afirma ganho de desempenho: validação adicional e snapshots têm custos não medidos nesta entrega. O [experimento anterior](stage-6-performance.md) não caracteriza este snapshot; calibração em carga representativa permanece aberta.

A entrega fecha os riscos comprovados acima, sem substituir todos os primitivos do sistema. Identidades/códigos e projeções de relatório não ganharam wrappers sem invariantes próprias. Futuras migrações devem partir de um risco/teste de operação concreto e preservar transporte, documentos conflitantes e políticas canônicas.

## Seguimento — extensibilidade em 27/10/2026

A CI [Validate #22](https://github.com/argemon/escalalivre/actions/runs/40377752675) foi conferida com sucesso para b8e88e3, que contém esta entrega. O [ADR 010](010-regime-extension-boundaries.md) evolui a seleção por variantes concretas para capacidades e extrai DayCycleLimit, mantendo a proteção de unidades descrita acima. Seus resultados locais e pendência de CI são próprios; os relatos anteriores de ausência de commit/push/CI descrevem a sessão original.
