# Regras de geração e validação

O diagnóstico local (`frontend/src/lib/laborRules.ts`) e o domínio C# (`backend/EscalaLivre.Domain/Scheduling/ScheduleRules.cs`) implementam o mesmo contrato. `/analyze` e `/validate` usam o mesmo diagnóstico; `/solve` filtra candidatos por esse diagnóstico e acrescenta as restrições coletivas ao modelo. Nenhuma dessas operações corrige um turno salvo para esconder um conflito.

## Inventário e decisões

| Regra | Contrato adotado | Diagnóstico |
| --- | --- | --- |
| Identidade e função | Pessoa deve existir; função do turno deve ser a principal da pessoa. Normalizar não substitui a função do turno pela da pessoa. | `unknownEmployee`, `invalidShift` |
| Duração válida | Fim posterior ao início; pausa positiva, estritamente interna, com trabalho antes e depois. | `invalidShift`, `interval` |
| Intervalo obrigatório | Trabalho efetivo até 4h dispensa pausa; acima de 4h exige 15min; acima de 6h exige 1h; máximo de 2h. Trabalho efetivo desconta a pausa. | `interval` |
| Intervalo variável | Mínimo é o maior entre o mínimo da empresa, o obrigatório pela jornada e a duração do fechamento atravessado. Máximo é limitado a 2h; mínimo obrigatório prevalece sobre máximo menor configurado na empresa. | `interval` |
| Intervalo fixo | Horários devem coincidir exatamente com o intervalo da pessoa, inclusive a data. Início da pausa menor ou igual ao início do turno pertence ao dia seguinte; fim menor ou igual ao início da pausa pertence ao dia seguinte. Substitui os limites variáveis da empresa, preservando os limites obrigatórios da jornada. | `fixedInterval`, `interval` |
| Fechamento para almoço | Pausa deve cobrir todo o fechamento atravessado. Inclui o fechamento da operação iniciada no dia anterior. Quem trabalha durante o fechamento deve manter sua pausa fora dele; essa opção não dispensa pausa obrigatória. | `middayClosure` |
| Jornada configurada | Trabalho efetivo não pode exceder `defaultShiftDuration`, herdado da empresa ou próprio da pessoa. | `workload` |
| Regime em horas | Trabalho efetivo, descontada a pausa, não pode exceder `workUnits`. Descanso usa o maior entre `restUnits` em horas e o mínimo da empresa. | `regime`, `minimumRest` |
| Limite diário | Soma do trabalho efetivo dos turnos com início na mesma data: 8h ou 10h quando a pessoa permite horas extras. A configuração de horas extras não amplia automaticamente a jornada nem o regime. | `dailyLimit` |
| Um turno por dia | No máximo um turno por pessoa e data de início. Um turno noturno pertence inteiro à data de início para essa regra e para substituição. | `multipleShifts` |
| Limite semanal | Semana civil de domingo a sábado. Divide o trabalho e a pausa na meia-noite de domingo, considerando o histórico dos dois lados do período. | `weeklyLimit` |
| Disponibilidade | Quando informada, uma única janela deve conter o turno inteiro, incluindo a pausa. Janelas adjacentes não são unidas implicitamente. | `availability` |
| Restrições de horário | Qualquer sobreposição com o turno, inclusive durante a pausa, bloqueia o turno. Encostar no início/fim é permitido. | `availability` |
| Descanso | Intervalo entre fim e próximo início; verifica todos os turnos, inclusive sobrepostos e histórico anterior e posterior. O diagnóstico considera o maior fim anterior, não só o último início. Igualdade com o mínimo é permitida. | `minimumRest` |
| Regime em dias | Em qualquer janela móvel de `workUnits + restUnits` dias, no máximo `workUnits` datas distintas com início de turno. Sem uma fase de ciclo persistida, não se inventa uma âncora. Histórico posterior também restringe a geração. | `regime` |
| Dias de trabalho | Dias pessoais valem quando a pessoa não herda os padrões da empresa. Dias de operação da empresa valem salvo autorização específica. | `workingDay` |
| Expediente | Turno deve caber na união das janelas reais de operação, incluindo operações noturnas do dia anterior. Cobertura com autorização ou turno autorizado de feriado pode permitir a exceção, registrada como informação. | `outsideHours` |
| Feriados | Feriado fechado remove demanda normal e bloqueia turnos comuns. Autorização de feriado excepciona expediente, não disponibilidade, descanso, jornada ou pausa. | `holiday`, `outsideHours` |
| Entrada fixa | Início deve coincidir com `shiftStartsAt` na data do turno. | `fixedStart` |
| Trabalho noturno | Sem permissão, início antes de 06h ou fim depois de 22h da data de início é inválido. | `nightWork` |
| Cobertura por função | Substituição é direcional; a mesma pessoa não cobre duas exigências de função simultaneamente. Cobertura por equipe conta pessoas elegíveis. Sobreposições da mesma pessoa não duplicam sua capacidade. | Blocos de cobertura e lacunas |
| Pausas e cobertura | Pausa não fornece cobertura; fechamento remove demanda normal, mantendo exigências explicitamente autorizadas fora do expediente. Limites de turnos, pausas e exigências subdividem os blocos. | Blocos de cobertura e lacunas |
| Pontuação | Minutos cobertos ponderados pela quantidade exigida / minutos exigidos; arredondamento de 3 casas. Lacunas consecutivas da mesma função e déficit são agrupadas. | `coverageScore`, `gaps` |

`Lunch.PreferredAfter`, dias de folga preferidos, pesos de preferências e preferência por abertura/fechamento orientam a escolha do gerador; não tornam um documento inválido. A geração procura entradas e pausas em passos discretos e possui limites de tempo e complexidade: validação de um documento não implica que o gerador consiga reproduzir exatamente seus horários. Uma falha de geração conserva os dados anteriores.

A validação estrutural de importação/API é uma etapa anterior: tipos, referências, limites de tamanho e faixas de valores não são diagnósticos de escala. O período de planejamento determina a demanda e a substituição; o documento completo fornece o histórico das restrições.

## Normalização, migração e edição

`changed()` foi removida. O ciclo de vida fica explícito em `frontend/src/lib/documentLifecycle.ts`:

- `normalizeDocument`: normaliza referências de funções; não converte datas, recalcula fim, insere pausa ou altera horários de turnos.
- `migrateDocument`: converte formatos legados e devolve as migrações aplicadas. Identificadores: `company-time-zone-v1`, `qualified-times-to-company-civil-v1`, `schedule-second-precision-v1`, `explicit-planning-period-v1` e `utc-update-instant-v1`. Rodar novamente é idempotente.
- `replaceAssignment` e ações explícitas do store: criação, edição, movimento e exclusão. Alterar regras da empresa ou da pessoa recalcula diagnósticos, preservando início, fim e pausa existentes. Alterar a função da pessoa atualiza a função de seus turnos como parte dessa edição explícita.

`intervalFor` constrói pausas para novos turnos manuais e prévias. Não participa da normalização nem da recuperação de turnos existentes. Importações e restaurações passam pela migração identificada e validação estrutural antes de entrar no estado. A análise pode converter a representação em uma cópia temporária para leitura; não escreve horários no documento recebido.

Datas de escala usam tempo civil da empresa. A aritmética em `civilTime.ts` é independente do fuso do dispositivo e de seu horário de verão. Veja também [contrato de datas](date-time.md), [preservação de turnos](generation-preservation.md) e [recuperação](recovery.md).

## Cenários compartilhados e verificação

`shared/rule-scenarios.json` contém 49 documentos com códigos esperados. Abrange limites de pausa, intervalo fixo, fechamento, jornadas líquidas, disponibilidade, descanso, ciclo, semana, feriados, entrada fixa, função e mudança de horário de verão no dispositivo. Os cenários de geração delimitam disponibilidade para isolar a regra em teste sem depender da busca de uma operação aberta 24h.

- `frontend/tests/rules.test.cjs` verifica os códigos esperados, imutabilidade dos documentos, normalização idempotente, migração identificada e preservação de horários ao editar configurações.
- `backend/EscalaLivre.Tests/SharedRulesTests.cs` lê o mesmo arquivo, compara análise e validação e revalida as escalas geradas.
- `backend/security.integration.cjs` envia esses documentos à API real, passando pelo worker. Compara frontend, `/analyze` e `/validate` por código, gravidade, pessoa, início, fim e função; compara também todos os blocos de cobertura, lacunas e pontuação. Para os cenários de geração, compara `/solve` com a análise local da escala retornada. A redação traduzida das mensagens não integra esse contrato.

Comandos na raiz do repositório:

```powershell
node --test frontend/tests/rules.test.cjs
dotnet test backend/EscalaLivre.Tests/EscalaLivre.Tests.csproj -c Release
dotnet build backend/EscalaLivre.Api/EscalaLivre.Api.csproj -c Release
$env:SECURITY_BUILD_CONFIGURATION='Release'
node --test backend/security.integration.cjs
```

Para verificar independência do fuso do dispositivo, execute os testes frontend também com `$env:TZ='America/New_York'`.
