# Jornada contratada — geração e diagnóstico (etapa 3)

Data: 02/11/2026. Continuação das etapas [1](016-weekly-workload-contract.md) e [2](017-weekly-workload-configuration.md). As alterações locais dessas entregas foram mantidas. Esta decisão implementa o contrato previsto; os relatos anteriores de capacidade indisponível são históricos.

## Problema e comportamento entregue

Com teto 44h e jornada padrão 8h, o modo legado continua produzindo candidatos de 8h, sem inferir carga contratada. Com `weeklyPlan` explícito, candidatos usam a distribuição do dia: uniforme 44h em cinco dias = 31680s (8h48); sexta reduzida = 32400s (9h) de segunda a quinta e 28800s (8h) na sexta; carga 40h não é ampliada até o teto 44h.

`ContractWorkPolicy` é a política canônica de meta, dispensa, limite normal, limite diário permitido, duração desejada e reconhecimento da carga. A política equivalente TS fica em lib/policies/weeklyWorkPlan. Não há regra jurídica própria no adaptador.

- Compensação válida na data inicial do turno permite jornada normal distribuída acima de 8h, limitada a 10h. Sem compensação vigente, o normal fica limitado a 8h. O regime em horas pode limitar ainda mais os candidatos. No modo contratado, autorização separada de extras permite até duas horas adicionais ao normal do dia, respeitando 10h e o teto semanal. O gerador não cria extras automaticamente para preencher meta; diagnóstico de turnos manuais distingue trabalho real de carga normal reconhecida.
- Ausência de plano mantém exatamente os limites anteriores de jornada/regime, autorização de extras e teto. `defaultShiftDuration` permanece gravado; o editor mostra esse campo no modo legado e a distribuição quando há plano. Nenhum teto vira carga, nem é ampliado por compensação ou extras.
- Disponibilidade e bloqueios continuam restrições obrigatórias. No modo contratado, a política de disponibilidade também fornece subjanela livre para gerar turno menor quando a jornada inteira não cabe; entrada fixa continua obrigatória. Não se altera turno salvo para fazê-lo caber.
- Teto semanal continua a soma civil domingo–sábado, repartindo turno e pausa na meia-noite de domingo, incluindo histórico nas duas bordas. Descanso, exclusividade por data inicial, ciclo, função, noite, entrada e expediente continuam pelas políticas existentes.

## Intervalos e cobertura

Mínimo=máximo=1h fixa a duração variável nos casos comuns. Faixa 1–2h continua permitindo escolhas. As exceções canônicas de fechamento e intervalo individual permanecem: fechamento atravessado pode ampliar mínimo e intervalo individual substitui faixa, sem dispensar limites obrigatórios nem margens de trabalho.

A rotina semanal continua obrigatória por pessoa/semana: início civil, deslocamento de data e duração. Sexta reduzida muda trabalho/saída, não flexibiliza pausa. Histórico bilateral, inclusive com segundos, ancora candidatos: durações e horários históricos elegíveis são incluídos na busca; conflitos históricos não podem ser ampliados.

Além da grade anterior, planos incluem a duração exata de pausa que completa a janela operacional sem encurtar o trabalho desejado. Exemplo: jornada 8h48, janela 07:30–17:30 e faixa 1–2h admitem 1h12 de pausa, quando elegível. Isso evita arredondar para 1h15 e perder três minutos. Preservados limites de candidatos, passos, duração nativa e margem de uma hora nas pontas.

A política canônica também fornece candidatos menores para o saldo semanal restante após o histórico bilateral, considerando combinações dos alvos diários da semana. Eles nunca aumentam o alvo de outro dia. Isso evita perder todo um dia quando o saldo só comporta uma jornada parcial. A busca permanece discreta: não se promete enumerar toda duração civil matematicamente possível.

Candidatos contratados devem atender alguma demanda positiva de função/equipe elegível fora da pausa. Não se criam turnos em dias sem demanda apenas para zerar saldo. Isso não exige que toda hora do turno tenha demanda nem que o funcionário seja indispensável à cobertura: cumprir contratos pode ocupar mais pessoas do que o mínimo de cobertura.

## Prioridades da busca

Para documentos com plano efetivo, a busca usa três objetivos sequenciais:

1. Minimizar déficit de cobertura em segundos × pessoas, sem arredondamento do score.
2. Fixar o valor de cobertura encontrado e maximizar trabalho normal reconhecido por dia, limitado à meta daquele dia.
3. Fixar também o valor de carga encontrado e aplicar preferências/desempates/ocupação anteriores.

Cada prioridade inferior conserva a anterior por igualdade condicionada à tentativa. Não há peso de preferência capaz de trocar um segundo de cobertura ou carga. Os bloqueios de objetivos da primeira tentativa são liberados antes da tentativa que permite antecipar almoço; esta continua aceita apenas com redução estrita de falta de cobertura. A rotina de pausa nunca é relaxada.

As fases compartilham o orçamento existente de até cinco segundos de busca nativa e um worker. Uma fase não ótima fixa somente seu melhor valor encontrado; fases seguintes não provam a otimalidade global da prioridade anterior. O resultado fica feasible quando faltar essa prova; optimal exige provas em todas as fases executadas até a última, dentro da tentativa. Uma fase inferior sem resultado preserva o incumbente anterior; sem incumbente inicial, a geração falha e preserva o documento. A política anterior de antecipação ainda pode escolher a primeira tentativa sem provar superioridade matemática sobre todas as antecipadas. Não se promete escala ótima específica nem cobertura/carga integral sob limite de busca.

A sugestão inicial de rotinas usa trabalho reconhecido antes de desempatar por permanência em documentos com plano, mantendo o modelo como autoridade. Um caso de faixa variável inicialmente terminou em timeout na primeira fase; maior reserva inicial dentro do mesmo orçamento e sugestão de rotina corrigiram a reprodução local. Isso não é medição de desempenho nem garantia geral de solução em cinco segundos.

## Feriados, afastamentos e recortes

Feriado fechado dispensa a meta daquele dia e não redistribui horas. Trabalho autorizado de feriado é preservado e continua sujeito aos limites normais/diários/semanais; a dispensa não transforma seu limite normal em zero. Trabalho em feriado dispensado não é contado novamente como carga reconhecida de outro dia.

A representação nova opcional `employee.contractLeaves` registra **data civil e segundos de trabalho líquido explicitamente dispensados**. Cada entrada usa data entre 1900–2100 e 1–86400 segundos, com o mesmo limite de quantidade das janelas pessoais. Múltiplos créditos do dia são somados e limitados à sua meta; feriado e afastamento no mesmo dia não duplicam dispensa. Um afastamento integral pode dispensar todo o alvo; parcial deduz somente o crédito líquido informado. Não se atribui crédito a pausas.

Esta é uma dispensa quantitativa de carga, não um sistema de folha/atestados nem uma janela de ausência física. Quando existir horário indisponível de afastamento parcial, ele deve ser registrado também nos bloqueios, como explica a interface. O sistema não adivinha qual parte de uma janela genérica é remunerada nem converte disponibilidade/restrição em crédito. Essa representação evita calcular crédito usando uma pausa variável que o solver ainda não escolheu. No afastamento integral com alvo zerado não são gerados turnos para reposição. Não há banco/compensação automática entre dias ou semanas.

Período parcial cobra somente metas das datas iniciais dentro do recorte. O relatório agrupa por semana e expõe separadamente trabalho histórico fora do recorte, sem somá-lo de novo ao atendimento do recorte. Histórico continua consumindo teto e restringindo descanso/ciclo/rotina. Trabalho noturno pertence à data inicial para meta/relatório e é repartido somente para o teto semanal, conforme contrato anterior.

## Diagnóstico, resultados e arquivos

`ScheduleResult.workloads` é opcional, ausente na serialização nativa do resultado legado sem plano. Para cada pessoa/semana do recorte fornece carga contratada nominal, soma nominal dos dias, dispensa, prevista ajustada, trabalho planejado real, reconhecido como normal, saldo não atendido, excesso e histórico, além dos mesmos valores diários.

Reconhecimento diário = min(trabalho real não negativo, meta ajustada, limite normal permitido). Saldo semanal é a **soma das faltas diárias**, não a diferença líquida compensada entre dias. Excesso é separado: uma hora extra na segunda não apaga uma falta na terça. Saldo não atendido gera warning workloadShortfall e apresentação explícita no painel, mesmo com cobertura 100%; não invalida o arquivo nem causa rejeição da solução. A carga pode estar cumprida com falta de cobertura e vice-versa.

Configurações incoerentes de soma/teto/compensação permanecem carregáveis e recebem avisos; limites obrigatórios reais continuam impedindo trabalho indevido. Análise e validação C#/TS usam a mesma semântica. Admissão reanalisa a proposta completa; novos erros obrigatórios, falha, cancelamento, timeout sem solução ou rejeição mantêm o documento anterior. O protocolo de processo filho e limites HTTP/worker não mudaram.

Campos opcionais não exigem migração: arquivos antigos continuam sem plano/crédito inferido. Leitores antigos podem ignorar novos campos e não devem regravar arquivos com plano/dispensa novos, conforme etapa 2. Salvar configurações preserva ID, função conforme edição explícita, horários, pausas, source, tags e histórico.

## Cenários e evidências

[contract-work-scenarios.json](../../shared/contract-work-scenarios.json) possui doze documentos: 44h uniforme/sexta, 40h, dispensa de feriado/afastamento parcial/integral, restrição sem crédito, recorte com histórico bilateral, compensação vencida, extras sem crédito normal indevido, falta sem transferência entre dias, configuração individual e noite sábado–domingo, além de reconhecimento limitado pelo regime em horas. Expectativas independentes verificam totais e códigos em testes puros C#/TS; o comparador diferencial também confere todos os campos dos relatórios e mantém os cenários anteriores.

`ContractGenerationTests` usa OR-Tools real para totais, pausas constantes, faixa variável, indisponibilidade, dispensas, falta de demanda, falta de compensação, pessoa com plano próprio, intervalo individual, histórico com segundos nas duas bordas e noite. Pequenos modelos isolam cobertura antes de carga e carga antes de preferência por fechamento. Testes existentes mantêm regimes, fechamento, conflitos históricos, rejeição/admissão, cancelamento e preservação em falhas.

HTTP executa os novos documentos pelo worker comparando C#/TS e relatórios; gera 44h uniforme/sexta e verifica diagnóstico após a geração, além de round-trip e rejeição estrutural. As suítes não comparam escalas ótimas específicas.

Verificações finais e limitações de ambiente serão registradas abaixo. CI remota continua pendente antes de qualquer integração: esta sessão não faz commit, push, integração ou publicação. A pendência jurídica das fontes da etapa 1 continua; configuração aritmética de 44h não certifica enquadramento legal.

## Matriz executada e resultado local

| Verificação | Evidência |
| --- | --- |
| `dotnet test EscalaLivre.slnx -c Release --no-restore -m:1` | 738 aprovados: 272 puros, 420 adaptador, 33 API, 13 arquitetura; sem falhas/ignorados |
| `dotnet build EscalaLivre.slnx -c Release --no-restore` | Aprovado, zero avisos/erros |
| Frontend completo, TZ=America/Cuiaba | 539/539 aprovados |
| Frontend completo, TZ=America/New_York | 539/539 aprovados; TZ restaurado após execução |
| `node tools/parity-differential.cjs`, Cuiabá e Nova York | 154 documentos por fuso aprovados, incluindo os doze novos; diagnóstico, cobertura, lacunas, score e todos os campos de carga/relatórios |
| `npm --prefix frontend run lint` e `npm --prefix frontend run build` | Aprovados; build conserva os avisos já existentes de anotação do Zod |
| `SECURITY_BUILD_CONFIGURATION=Release; node backend/security.integration.cjs` | 25/25 aprovados na execução integral, com API e worker reais; também repetidos integralmente após o ajuste das preferências em disponibilidade parcial |
| Conteúdo, links locais e `git diff --check` | Revisados; sem erro de diff, somente avisos de conversão LF/CRLF |

A última revisão trocou apenas a redação dos avisos de configuração por uma mensagem sem códigos técnicos na apresentação. Após essa troca, os 272 testes puros e 13 casos frontend de carga/arquivo foram repetidos, assim como lint/build. Códigos, unidades, protocolos e semântica não mudaram nessa revisão textual; não se repetiu toda a matriz depois dela.

A correção das marcas de abertura/fechamento garante que uma subjanela de disponibilidade (ex.: 10–15h numa empresa 07:30–17:30) não receba preferências de abrir/fechar a empresa. A regressão verifica candidato menor, falta informada e significado das preferências; não escolhe uma escala ótima específica.

A busca também compara incumbentes pela cobertura canônica, crédito normal e preferência antes de aceitar uma fase inferior: uma solução apenas feasible pode não recuperar sequer a sugestão anterior, e a alocação interna pode subcontar cobertura. Nesses casos mantém-se o resultado anterior, com status feasible. Isso complementa as igualdades do modelo sem criar uma regra de cobertura alternativa.

Ambiente: Windows, SDK .NET 10.0.401 e Node 24.14.1, dependências locais existentes. Os resultados não certificam Ubuntu/Node 22, desempenho representativo nem revisão visual em navegador real. A busca permanece discreta e limitada; pode devolver déficit ou falhar preservando o documento mesmo quando houver solução matemática não encontrada.

**CI remota completa pendente antes de integrar.** Não foi disparada CI para esse diff local: a sessão mantém as alterações sem commit/push, conforme solicitado. Não houve integração ou publicação. A matriz local executada não é apresentada como validação completa de CI. Os registros históricos das etapas 1/2 permanecem preservados; seus números e estados não descrevem o novo diff.
