# Etapa 3 — Tipos validados, planejamento protegido e round-trip

Relatório histórico da respectiva etapa. Código/comandos atuais e fechamento das pendências: [revisão da etapa 6](stage-6-final-review.md).

Data: 26/10/2026 (America/Cuiaba). Estado: implementação concluída; validação operacional pendente. Não integrar ou avançar à etapa 4 antes de resolver a falha HTTP descrita abaixo e confirmar a CI.

## Conferência da etapa anterior e baseline

Relidos AGENTS.md, plano, decisões de consistência/tempo/documentos conflitantes e [relatório da etapa 2](stage-2-analysis-extraction.md). Conferidos os mapeamentos de responsabilidades, fachada, projeto isolado na solução/CI e evidências de paridade. Antes de editar, foram reexecutados os testes isolados **64/64** e do adaptador **356/356**, sem falhas: [isolados](evidence/stage-3/analysis-baseline.txt), [backend](evidence/stage-3/backend-baseline.txt). Portanto, os critérios locais de saída da etapa 2 estavam atendidos.

O checkout já continha as entregas anteriores, inclusive alterações não commitadas; elas foram preservadas. Ambiente local: Windows win-x64, Node 24.17.0 e SDK .NET 10.0.402 por roll-forward autorizado no global.json. Mantêm-se as limitações de instalação/ambiente registradas anteriormente; não foi executada CI remota/Linux nem instalação limpa de dependências. Nenhum pacote, lockfile ou schema foi alterado nesta etapa.

## Implementação

| Área | Entrega |
| --- | --- |
| Tempo e unidades | [TemporalValues](../../backend/EscalaLivre.Domain/Planning/TemporalValues.cs): janelas civis, pausa, período inclusivo, duração em segundos, quantidade de dias, horas inteiras e limite semanal fracionário |
| Regime | [RegimeConfiguration](../../backend/EscalaLivre.Domain/Planning/RegimeConfiguration.cs): variantes em dias/horas, unidades explícitas e construção validada |
| Atribuição | [ScheduledAssignment](../../backend/EscalaLivre.Domain/Planning/ScheduledAssignment.cs): identidade, proprietário, janela e pausa contida; valores e tags imutáveis |
| Agregado | [PlanningSchedule](../../backend/EscalaLivre.Domain/Planning/PlanningSchedule.cs): operações explícitas/atômicas e substituição por data inicial, com histórico completo |
| Configuração | [PlanningSettings](../../backend/EscalaLivre.Domain/Planning/PlanningSettings.cs): snapshot profundo de empresa/pessoas separado das atribuições, com configurações tipadas |
| Transporte | [DTOs](../../backend/EscalaLivre.Application/Contracts/Documents/ScheduleDocumentDtos.cs) e [mapeador](../../backend/EscalaLivre.Application/Contracts/Documents/ScheduleDocumentMapper.cs): 15 contratos específicos em Application, usados por ScheduleJson |
| Mapeamento interno | [PlanningDocumentMapping](../../backend/EscalaLivre.Application/Planning/PlanningDocumentMapping.cs): envelope/projeção ↔ tipos protegidos, sem migração nem reparo silencioso |
| Comandos | [PlanningEditor](../../backend/EscalaLivre.Application/Planning/PlanningEditor.cs): edição explícita, novo documento e análise atualizada; instante atualizado fornecido pelo chamador |
| Geração | GenerateSchedule aplica a proposta por ReplacePeriod antes de avaliá-la; o otimizador não pode reescrever história fora do período |

A decisão detalhada é o [ADR 005](005-validated-planning-and-transport.md). Os records antigos de ScheduleModels permanecem projeções de leitura para a transição dos consumidores. Não se declara que seus construtores antigos agora garantem invariantes; as garantias são dos novos tipos, agregados e operações. A separação DTO/interno já está na fronteira real de JSON e na aplicação da geração, sem migrar todas as políticas de uma só vez.

## Comportamento preservado

- Nenhum campo interno novo aparece no arquivo. Mantêm-se camelCase, schemaVersion, IDs, catálogo/setup, nulos/opcionais, listas vazias, timestamps e campos de configuração. Não se adiciona ID de agregado ao JSON.
- Novos tipos rejeitam estrutura impossível e referências inválidas, mas aceitam turnos com descanso/jornada em conflito, múltiplos turnos na mesma data, pausa obrigatória ausente e divergência de função. Pausas positivas contidas podem tocar as bordas, pois o contrato atual carrega esse caso para diagnosticar interval.
- Configurar empresa não recalcula início, fim ou pausa. Editar explicitamente pessoa atualiza a função dos turnos, inclusive fora do período, conforme o contrato existente. Movimento conserva segundos, duração e deslocamento da pausa; mudança de dia remove autorização de feriado da data anterior.
- Substituição é atômica e usa a data de início. Mantém todo o histórico dos dois lados e turnos noturnos inteiros. Conflito de negócio não é condição para remover/recriar horário salvo.
- Migrações e recuperação existentes continuam nas fronteiras anteriores. O novo mapeador não interpreta offsets nem executa migrações; recebe o resultado de ScheduleJson. O importador mantém sua inferência de período legado. Repetir a ida e volta não desloca horários novamente.
- Endpoints, envelopes, isolamento do worker, códigos de diagnóstico, cobertura, score e busca do otimizador permanecem. Os 58 hashes de resultados completos anteriores não foram atualizados; D1 continua reproduzida.

## Novas evidências

O projeto isolado ganhou **93 casos** (64 → 157): valores/unidades/construção, operações de agregado, mapeamento dos 58 cenários, campos opcionais/IDs/setup, proteção de coleções e comandos de edição/configuração. O projeto de adaptador ganhou **8 casos** (356 → 364): sete documentos atuais com conflitos/noite/ciclo e um documento legado sem fuso/período e com instantes qualificados, repetindo importação/exportação.

[PlanningValueTests](../../backend/EscalaLivre.Analysis.Tests/PlanningValueTests.cs) cobre igualdade, segundos, virada do ano, interseção semiaberta, precisão/kind inválidos, dias inclusivos, duração de 24/36/100h, semana fracionária, números não finitos, ciclo com overflow e ausência de setters/init públicos nos valores novos.

[PlanningAggregateTests](../../backend/EscalaLivre.Analysis.Tests/PlanningAggregateTests.cs) cobre IDs vazios/duplicados, proprietário desconhecido, referência/identidade na edição, exclusão, movimento com pausa, falha de redimensionamento sem confirmação parcial, substituição atômica, histórico noturno e mudança explícita de função.

[PlanningMappingTests](../../backend/EscalaLivre.Analysis.Tests/PlanningMappingTests.cs) compara todos os campos com a projeção anterior lida sem o novo conversor, verifica o round-trip dos cenários aceitos sem mudar diagnósticos, preserva opcionais e distingue entrada estruturalmente rejeitada de conflitos carregáveis. Tenta mutar fontes originais, IList, dicionário e armazenamento acessível por sincronização pública. Há teste de proposta de geração que tenta descartar/alterar histórico e de cópias equivalentes sem dependência de identidade de lista.

[PlanningEditorTests](../../backend/EscalaLivre.Analysis.Tests/PlanningEditorTests.cs) verifica análise após configuração/edição, preservação de horários, conflito diagnosticável, entrada intacta em erro e mudança explícita de período/função. O double de geração da etapa 2 foi ajustado para incluir no pedido seu histórico preexistente, respeitando a pós-condição que agora é protegida; continuam as verificações de avaliação única, contêiner, decisões selecionadas e preservação da entrada.

[PlanningDocumentRoundTripTests](../../backend/EscalaLivre.Adapter.Tests/PlanningDocumentRoundTripTests.cs) verifica arquivos atuais e legados, formato sem campos internos, conversão civil uma única vez e recuperação de conflitos após múltiplos ciclos. As suítes existentes de aceitação estrutural, bytes máximos, exportação, migração identificada e recuperação local também foram executadas.

## Verificações

Comandos na raiz; TZ foi salvo/restaurado com try/finally; SECURITY_BUILD_CONFIGURATION=Release na integração. HTTP foi executado após as verificações pesadas, sem ampliar os timeouts existentes.

| Comando/verificação | Resultado final | Evidência |
| --- | --- | --- |
| dotnet test backend/EscalaLivre.Analysis.Tests/EscalaLivre.Analysis.Tests.csproj -c Release | 157 aprovados, sem Infrastructure/API/OR-Tools | [isolados](evidence/stage-3/analysis-final.txt) |
| dotnet test backend/EscalaLivre.Tests/EscalaLivre.Tests.csproj -c Release | 364 aprovados | [backend](evidence/stage-3/backend-final.txt) |
| node --test frontend/tests/*.test.cjs | 349 aprovados | [frontend](evidence/stage-3/frontend-final.txt) |
| Mesmo comando com TZ=America/New_York | 349 aprovados | [fuso](evidence/stage-3/frontend-new-york-final.txt) |
| npm --prefix frontend run lint | exit 0 | [lint](evidence/stage-3/lint-final.txt) |
| npm --prefix frontend run build | exit 0 | [build](evidence/stage-3/frontend-build-final.txt) |
| dotnet build backend/EscalaLivre.Api/EscalaLivre.Api.csproj -c Release | exit 0; zero avisos/erros | [API](evidence/stage-3/api-build-final.txt) |
| node backend/security.integration.cjs, Release | últimas duas execuções: 14/15; paridade aprovada, falha no teste de deadline de 1s. Houve execuções anteriores 15/15 | [final](evidence/stage-3/security-final.txt), [execução anterior aprovada](evidence/stage-3/security-earlier-pass.txt) |

O baseline .NET não apresentou falhas. Houve uma falha intermediária de compilação introduzida na preparação dos DTOs: dois nomes de propriedades opcionais foram renomeados junto com seus tipos; foi corrigida antes de executar os testes de compatibilidade ([log](evidence/stage-3/analysis-intermediate.txt)). Os erros de compilação foram resolvidos; a falha operacional restante está descrita abaixo. A revisão de coleções confirmou o acesso a arrays via SyncRoot em wrappers somente leitura; os novos snapshots foram reforçados com coleções imutáveis do framework, sem pacote novo, e as verificações .NET/HTTP foram repetidas. Não se afirma ganho de desempenho a partir desses logs.

As últimas duas execuções HTTP tiveram 14/15: o teste existente `wall-clock deadline includes result analysis and the API recovers`, configurado com WorkerTimeoutSeconds=1, recebeu 504 em vez de 200 na chamada simples posterior. Os logs registram 1047ms e 1043ms nessas chamadas ([primeira falha](evidence/stage-3/security-intermediate-timeout.txt), [final](evidence/stage-3/security-final.txt)). O mesmo caso também falhou quando executado sozinho ([teste focal atual](evidence/stage-3/security-deadline-focused.txt)). Outras execuções completas desta etapa passaram. Nenhum limite ou teste foi alterado para obter aprovação; a validação final não é declarada verde.

Para distinguir preexistência de impacto novo, foi criada uma cópia separada do backend/shared em Documents, sem bin/obj e sem Domain/Planning, Application/Planning ou Contracts/Documents da etapa 3. Foram restaurados GenerateSchedule, ServiceCollectionExtensions e CalculationWorker preparados na etapa 2; ScheduleJson foi restaurado do HEAD (não tinha sido alterado na etapa 2). O mesmo teste e global.json foram mantidos, com build Release ([build anterior](evidence/stage-3/comparison-build.txt)). **O teste focal também falhou nessa composição anterior**, no mesmo assert 504 em vez de 200, com chamada de recuperação registrada em 1030ms ([comparação](evidence/stage-3/comparison-deadline.txt)). A cópia não alterou o checkout original.

Isso comprova que a falha é reproduzível sem a implementação da etapa 3 no ambiente atual. Não comprova a causa ambiental exata nem quantifica eventual impacto de startup da mudança; não é um benchmark. A sensibilidade a 1s já estava pendente desde a etapa 1, mas agora há evidência específica desse segundo teste também na composição anterior. Estabilidade HTTP e CI continuam sendo bloqueios de integração/avanço.

## Saída e pendências

Critérios de construção, operações e round-trip atendidos: os novos tipos protegem estrutura/identidade/coleções e conflitos continuam carregáveis/editáveis. **A saída completa da etapa 3 ainda depende da validação operacional:** a última suíte HTTP ficou em 14/15, apesar de a comparação de regras/contratos ter passado. Documentação e ADRs atualizados; não avançar à etapa 4 nem integrar antes de investigar a falha e confirmar a CI.

- Executar CI Linux/Node 22 antes da integração; ambiente local usa roll-forward e dependências existentes.
- D1 continua pendente para correção separada. O controle estrutural de histórico não corrige a contagem de atribuições sobrepostas no modelo nem rejeita novas violações de negócio obrigatórias; essa proteção continua na etapa 5.
- Investigar a sensibilidade dos testes existentes com timeout de 1s, agora também observada no teste de recuperação após deadline; uma nova aprovação não a resolve. Não houve ampliação de prazo.
- Os consumidores de políticas/adaptadores ainda usam projeções de compatibilidade. Migrá-los progressivamente ao aproveitar tipos/políticas nas etapas 4–5, sem prometer que todos os records antigos foram removidos. A fachada IScheduleSolver permanece até a consolidação.
- PlanningEditor fornece comandos internos, sem novos endpoints ou mudança dos comandos locais TypeScript. Não foram introduzidos banco, repositórios, eventos ou nova migração de arquivo.

Rollback: reverter os arquivos desta etapa (tipos, DTOs/mapeadores, comando de geração/edição e testes), preservando os cenários/hashes e a extração anteriores. Não há migração destrutiva ou schema a reverter.

## Encerramento local da pendência durante a etapa 4 — 26/10/2026

Os resultados acima registram o fechamento original da etapa 3 e permanecem como evidência. Antes da extração seguinte foram revalidados 157/157 testes puros, 364/364 de adaptador e a suíte HTTP original em 15/15, com a falha de 1s reproduzida isoladamente. O teste de recuperação da análise foi ajustado separadamente para usar analyze também na sonda posterior, sem ampliar timeout, e reforçado com um único slot e fila zero. A suíte completa do gate passou 15/15 antes de aplicar políticas. Detalhes, justificativa e limites no [relatório da etapa 4](stage-4-domain-policies.md). Saída local encerrada por esse contrato; não se afirma estabilidade de solve frio em menos de 1s nem CI remota aprovada.
