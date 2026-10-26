# ADR 002 — Tempo civil, intervalos e unidades

Data: 23/10/2026. Estado: contrato atual preservado; tipos internos implementados progressivamente na etapa 3 em 26/10/2026.

## Contexto

[Contrato temporal](../date-time.md), [ScheduleWindow](../../backend/EscalaLivre.Domain/Scheduling/ScheduleWindow.cs) e [civilTime.ts](../../frontend/src/lib/civilTime.ts) distinguem calendário da empresa e instante de atualização. WorkUnits/RestUnits são inteiros cujo significado depende do regime; WeeklyLimitHours é double. Records não validam sua construção.

## Decisão

- Período civil usa datas inicial/final inclusivas; inclui o turno inteiro pela data inicial. Na aritmética, converter explicitamente a extremidade final para o dia seguinte exclusivo quando necessário.
- Janelas de turno, pausa, disponibilidade e restrição usam data/hora civil da empresa com segundos, sem offset (DateTime Unspecified na representação C# atual). Interseções usam [início, fim); igualdade nas bordas não é sobreposição. Pausa positiva contida é representável; ser estritamente interna é conformidade diagnosticável. Ela não fornece cobertura.
- Horário de relógio, data civil, data/hora civil, duração, quantidade de dias e horas não são intercambiáveis. Os novos tipos têm unidades explícitas e protegem validade estrutural. Duração não será limitada a 23:59:59 como um relógio.
- Tempo de escala continua civil mesmo no horário de verão do dispositivo; não trocar a aritmética existente por conversões UTC. updatedAt continua instante UTC. O fuso IANA da empresa interpreta entradas legadas qualificadas pelas migrações identificadas.
- Semana começa domingo 00:00 e termina no domingo seguinte exclusivo; repartir trabalho e pausa na fronteira. Limite diário e ciclo pertencem à data inicial. Ciclo é móvel e conta datas distintas, sem âncora inventada.
- Preservar segundos e comparações atuais de igualdade; não converter cálculos para minutos inteiros. WeeklyLimitHours e arredondamentos públicos não serão alterados silenciosamente durante a introdução dos tipos.

## Consequências

Mappers mantêm JSON atual e migrações idempotentes. Cenários novos de um segundo e testes existentes de fronteira semanal servem de aceite. Grade de 30 minutos e escolhas discretas de pausa são limitações de busca, não precisão do domínio. Pontuação arredondada de 1 pode coexistir com lacuna de um segundo: consultar gaps para afirmar cobertura completa.

## Implementação e esclarecimento em 26/10/2026

CivilWindow/ShiftPause/CivilPlanningPeriod e Duration/DayCount/WholeHours/WeeklyHours foram introduzidos com propriedades somente leitura e construção validada. RegimeConfiguration separa variantes em dias/horas. Não houve arredondamento novo, conversão silenciosa de instantes ou troca de unidade do contrato. A contenção estrutural da pausa admite igualdade nas bordas para preservar a aceitação atual; o avaliador continua exigindo interior estrito via diagnóstico interval. Veja [ADR 005](005-validated-planning-and-transport.md).

Seguimento de consolidação: [ADR 008](008-final-boundaries-and-validation.md) e [revisão final](stage-6-final-review.md). Nomes/estados anteriores neste registro são históricos.
