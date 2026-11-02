# Jornada semanal e intervalos — etapa 1

Data: 02/11/2026. Estado: investigação e contrato proposto para as próximas etapas; **nenhuma regra de produção alterada**. O checkout estava limpo (`git status --short` sem saída). Foram consultados AGENTS.md, arquitetura, plano e contrato de paridade; o destino abaixo não descreve capacidades já implementadas.

## Evidência do comportamento atual

Empresa segunda–sexta 07:30–17:30, jornada padrão 8h, teto 44h, pausa 1–2h:

- `ScheduleCandidateGenerator` usa `DefaultShiftDuration` como trabalho desejado, soma a pausa e limita a permanência à janela operacional. Não distribui o teto pelos dias. Com entrada 07:30 e pausa 1h termina 16:30; com 2h termina 17:30; ambos trabalham 8h. Uma janela menor pode produzir trabalho menor, sujeito aos filtros.
- `WeeklyWorkConstraints` impõe somente soma <= saldo do teto descontado do histórico. Não existe carga contratada nem penalidade por não completar 44h. Cinco turnos de 8h dão 40h, corretamente para o contrato atual.
- `ScheduleObjective` combina falta de cobertura, ocupação e custo por candidato, com preferências e pequeno incentivo ao fechamento. Não minimiza duração da pausa. Não há promessa de escolher sempre 1h ou 2h, nem de uma escala ótima específica.
- `EffectiveWorkPolicy.DailyLimit` permite 8h sem autorização e 10h com `AllowsOvertime`. Essa autorização não amplia a jornada padrão, o limite do regime em horas ou o teto semanal. Configurar 9h sem autorização deixa os candidatos de 9h inelegíveis; autorizar extras mantendo padrão 8h continua gerando 8h.
- `IntervalPolicy.VariableLimits`: mínimo efetivo é o maior entre empresa, obrigação pela jornada e fechamento atravessado; esse mínimo prevalece sobre máximo menor da empresa, até o limite obrigatório de 2h. Mínimo=máximo=1h fixa **a duração variável** nos turnos de 8h comuns; não fixa o horário. Fechamento 12–14h pode exigir 2h mesmo com 1h/1h. Intervalo individual 11:30–13h substitui limites variáveis e mantém 90min; continua sujeito à pausa obrigatória e ao fechamento. Se incompatível, pode não haver candidato. Não se corrige cadastro silenciosamente.
- `WeeklyIntervalPolicy`/`WeeklyIntervalConstraints` exigem um início civil, deslocamento de data e duração por pessoa/semana domingo–sábado, com âncoras históricas bilaterais. Pausas curtas/ausentes e conflitos históricos seguem o contrato documentado de rotina. Isso é obrigação da geração, não novo erro de arquivo.
- `IntervalTimingPolicy` conserva uma hora trabalhada nas duas pontas das novas pausas. A antecipação de PreferredAfter continua condicionada à redução estrita do déficit encontrada pela busca; não altera duração nem rotina.

Evidência executável: [novos testes](../../backend/EscalaLivre.Adapter.Tests/WeeklyWorkCharacterizationTests.cs) verificam candidatos de 8h, total gerado 40h com teto 44h, teto 40h aceito/39,999h rejeitado ao forçar cinco turnos, interação autorização/padrão/limite diário e exceções de 1h/1h. Complementam [VariableIntervalTests](../../backend/EscalaLivre.Adapter.Tests/VariableIntervalTests.cs), [WeeklyIntervalTests](../../backend/EscalaLivre.Adapter.Tests/WeeklyIntervalTests.cs), e os testes puros [WeeklyIntervalPolicyTests](../../backend/EscalaLivre.Analysis.Tests/WeeklyIntervalPolicyTests.cs). Não há alteração de hashes ou expectativas antigas para acomodar mudança de produção.

## Pesquisa oficial e limite jurídico

Consulta em 02/11/2026:

- [CLT consolidada pela Câmara](https://www2.camara.leg.br/legin/fed/declei/1940-1949/decreto-lei-5452-1-maio-1943-415500-normaatualizada-pe.html): art. 58 trata da duração normal diária; art. 59 distingue horas extras (até duas por dia e adicional mínimo de 50%) de compensação. Seus §§2, 5 e 6 distinguem instrumentos e prazos: coletivo até um ano, individual escrito até seis meses e compensação no mesmo mês por acordo individual tácito ou escrito. O §2 prevê limite diário de dez horas. Art. 71 prevê pausa de 1–2h acima de seis horas, 15min acima de quatro até seis e exclusão da pausa do trabalho; há exceções legais. Art. 611-A, III permite negociação coletiva do intervalo, respeitando mínimo de 30min acima de seis horas. Essas exceções não estão sendo implementadas.
- [Perguntas frequentes do MTE](https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/perguntas-frequentes): orientação consultada ainda apresenta 8h/44h e diferencia compensação de horas extras e seus instrumentos.
- [Constituição consolidada na Câmara](https://www2.camara.leg.br/legin/fed/consti/1988/constituicao-1988-5-outubro-1988-322142-normaatualizada-pl.html): a pesquisa retornou redação de 40h no art. 7º, XIII atribuída à EC 141/2026, com remissão a disposições transitórias, enquanto a orientação do MTE acima ainda informa 44h. O acesso direto ao Planalto retornou bloqueio. **Não se conclui desta pesquisa que 44h seja o teto legal universal vigente**. Confirmar vigência/transição e instrumento aplicável antes de liberar novos presets como juridicamente adequados.

Os exemplos 44h abaixo são aritmética e configuração solicitada do produto, sujeitos aos limites efetivamente aplicáveis. A aplicação não comprova validade de acordo nem substitui avaliação da categoria. Rotina semanal idêntica, margem de uma hora nas pontas, prioridades do otimizador e tratamento de saldo são decisões do produto, não obrigações deduzidas desses artigos. Pesquisa jurídica pendente não impede caracterizar o sistema nem especificar conceitos separados.

## Contrato proposto (a implementar em etapas separadas)

1. Separar teto semanal obrigatório, carga contratada normal opcional, plano de distribuição diária e duração/horário de pausa. Carga e duração diária são trabalho líquido, em segundos civis. Pausa não conta como trabalho nem cobertura. Carga não pode superar teto aplicável; configurar meta incompatível deve informar conflito, sem reescrever turnos nem tratar documento recuperável como corrompido.
2. Ausência de carga significa modo legado, sem meta inferida. Herança empresa/pessoa deve ser explícita: pessoa pode herdar ou configurar plano próprio. A edição da configuração só recalcula diagnósticos. Plano novo exige carga explícita e distribuição coerente; não transformar `DefaultShiftDuration` antigo em autorização de compensação.
3. Uniforme: dividir a carga pelos dias contratuais definidos (não pelos dias em que houve cobertura). Em cinco dias, 44h = 8h48 por dia. Para carga não divisível em segundos, distribuir segundos restantes em ordem civil dos dias contratuais e exibir resultado. Sexta reduzida: informar a duração da sexta e dividir o restante nos outros dias; 44h com sexta 8h = 9h de segunda a quinta. Personalizada: mapa de segundos por dia da semana, soma exatamente igual à carga; dia sem trabalho tem zero. Não deduzir dias contratuais somente da abertura da empresa.
4. Compensação semanal é autorização/configuração própria, com referência ao instrumento e vigência, distinta de `AllowsOvertime`. Com compensação configurada, 8h48/9h distribuídas podem ser jornada normal sem marcar extras. Sem ela, não liberar automaticamente trabalho normal acima de 8h. Extras continuam autorização separada, limitadas pelas demais regras e nunca usadas implicitamente para preencher meta. Não implementar banco entre semanas ou cálculo de folha nesta evolução.
5. A distribuição define alvo e limite normal do dia, sem transferir automaticamente falta de um dia para outro. O gerador deve procurar atingi-lo, admitindo falta quando as restrições/cobertura impedem. Trabalho acima dele requer autorização separada de extras e limites pertinentes. O teto semanal permanece obrigatório mesmo com extras; não o ampliar a partir da carga ou do checkbox antigo. Regimes em horas e ciclos continuam impondo suas capacidades; combinações incompatíveis são explicadas, não contornadas.
6. Semana civil domingo–sábado. Para alvo diário usar a data inicial do turno; para teto semanal continuar repartindo trabalho/pausa na virada de domingo. Relatórios distinguem essas bases, especialmente em turnos noturnos. Histórico preservado anterior e posterior participa do teto, descanso, ciclo e rotina; geração parcial não recebe um orçamento semanal novo.
7. Feriado fechado dispensa o alvo daquele dia sem redistribuir suas horas; relatório separa carga nominal, dispensa e meta ajustada. Autorização para trabalhar no feriado não cria automaticamente meta nem quita dispensa duas vezes. Afastamento integral explicitamente registrado dispensa alvo do dia; parcial explicitamente registrado deduz apenas trabalho planejado atingido, sem descontar pausa. A representação de afastamento ainda não existe como crédito contratual: restrição/disponibilidade genérica bloqueia trabalho mas não equivale a afastamento remunerado e não reduz meta automaticamente.
8. Período parcial: calcular meta apenas dos dias de início dentro do recorte; mostrar também contexto semanal e trabalho preservado. Não prorratear por dias corridos nem cobrar 44h num recorte de dois dias. Histórico fora do recorte consome teto e ancora rotina, mas não é somado novamente como atendimento à meta do recorte. Não inventar horas históricas ausentes.
9. Saldo não atendido = max(0, meta ajustada do recorte - trabalho normal reconhecido no recorte); apresentar também faltas por dia e excesso separadamente, sem compensação silenciosa entre dias. É diagnóstico de planejamento, não dívida salarial ou erro estrutural. Cobertura e saldo são métricas distintas: cobertura completa pode coexistir com carga incompleta e vice-versa. Prioridade proposta: restrições obrigatórias; minimizar déficit de cobertura; minimizar falta contratada; preferências e desempates. Usar prioridades verificáveis, sem inventar pesos que possam inverter essa ordem. Não acrescentar turnos sem demanda só para zerar saldo; reportar falta por ausência de demanda. A rotina pode produzir saldo/lacunas e continua obrigatória. Falha/cancelamento/limite preservam documento anterior.

### Distribuição diária × rotina semanal de pausa

Manter um único início civil, deslocamento e duração de pausa por pessoa/semana para todos os turnos com pausa. Uma sexta mais curta muda saída/trabalho, **não** a pausa. Turnos que legitimamente dispensam pausa não criam nova rotina. O plano deve caber ao redor da mesma pausa, com margem nas pontas, fechamento e intervalo individual respeitados. Histórico bilateral e feriados autorizados continuam ancorando; rotinas históricas divergentes impedem acrescentar pausa à semana conforme política atual.

Exemplos com entrada fixa 07:30 e pausa comum 12–13h: uniforme 8h48 sai 17:18; segunda–quinta 9h saem 17:30, sexta 8h sai 16:30. Com intervalo de 2h a janela 07:30–17:30 comporta apenas 8h líquidas; não cabe 8h48 nem 9h. Não reduzir pausa em apenas um dia, mudar rotina, ultrapassar fechamento ou ligar extras para esconder essa incompatibilidade. Oferecer explicitamente revisar duração comum da pausa, expediente, entrada ou plano; com 1h/1h e sem exceções a duração é 1h em todos esses dias.

### Arquivos e arquitetura

Nenhuma alteração JSON nesta entrega. Evolução futura deve versionar campos opcionais e migração identificada/idempotente, preservando IDs, segundos, pausas, metadados e histórico. Arquivo antigo mantém teto e jornada padrão e permanece sem carga contratada; não inferir 44h contratadas nem 40h contratadas. Novo salvamento não exige ativar plano. Testar round-trip antes/depois e comportamento em leitor antigo; não prometer que leitor antigo aplicará novas regras que desconhece. Documentar suporte de versões antes de publicar.

Políticas canônicas e valores no Domain; Application mapeia/orquestra; Infrastructure gera durações e traduz alvos/limites sem duplicar regra. Composição registra famílias, API mantém worker isolado. TypeScript implementa diagnóstico equivalente com cenários em shared; frontend apresenta meta/saldo sem recalcular negócio em componentes/store.

## Aceitação e matriz das próximas etapas

| Cenário | Resultado esperado futuro | Verificação |
| --- | --- | --- |
| Legado 8h/44h/1–2h | Sem carga inferida; comportamento caracterizado preservado | Arquivo, puro, adaptador e TS |
| 44h uniforme / pausa 1h | 5 × 8h48, compensação explícita, sem extras | Puro, candidatos, modelo e HTTP |
| 44h sexta reduzida | 4 × 9h + 8h, mesma pausa na sexta | Puro, modelo e admissão |
| Plano personalizado inconsistente | Explicar soma/dias inválidos sem reparar horários salvos | DTO, domínio, TS e recuperação |
| Carga 40h / teto 44h | Meta 40h; teto não vira meta e extras não viram normal | Paridade e otimização |
| Pausa 1h/1h; fechamento 2h; individual 90min | Exceções explícitas atuais preservadas | Caracterização e shared |
| 44h / janela 10h / pausa 2h | Informar falta; não quebrar rotina nem expediente | Modelo e resultado |
| Sexta menor incompatível com pausa histórica | Histórico intacto e falta explicada | Modelo/admissão, duas bordas |
| Feriado em dia de 8h48 | Dispensa 8h48; sem redistribuição automática | Shared C#/TS/HTTP |
| Afastamento integral/parcial e restrição genérica | Créditos explícitos distintos de bloqueio genérico | Política pura, arquivo e TS |
| Recorte terça–quarta com histórico segunda/sexta | Meta dos dois dias; teto e rotina da semana inteira | Puro, adaptador, HTTP |
| Noite sábado–domingo e pausa na virada | Teto repartido em segundos; rotina/data inicial preservadas | Shared em dois fusos |
| Cobertura completa/carga incompleta e inverso | Indicadores separados; prioridades conforme contrato | Pequenos modelos com objetivo verificável |
| Extras ligadas/desligadas e compensação ligada/desligada | Quatro combinações, sem autorização implícita | Puro, adaptador e TS |
| Falha, timeout, cancelamento e legado conflitante | Documento anterior preservado por conteúdo | Aplicação, API/worker e arquivo |

Sequência: etapa 2 modela conceitos/DTOs/migração e diagnóstico com shared, sem misturar extração e alteração de regra; etapa 3 altera candidatos/tradução/objetivo/admissão por responsabilidade; etapa 4 entrega controles e explicações frontend. Cada mudança intencional registra decisão de paridade e expectativas novas antes de mudar produção. Rodar matriz de docs/testing.md por impacto e CI completa antes de integrar: puros sem OR-Tools, adaptador real, API, arquitetura, frontend em Cuiabá/NY, diferencial nos dois fusos, lint/build e HTTP/worker. Comparar restrições/objetivo/status, nunca escalas ótimas exatas.

Pendências: confirmar enquadramento jurídico e transição das fontes divergentes antes de liberar presets; definir versão pública e representação de afastamentos na etapa de modelagem. Não há decisão de produto bloqueando esta caracterização: as escolhas acima constituem proposta revisável, não implementação nem certificação legal.

## Verificações desta entrega

- `dotnet test backend/EscalaLivre.Adapter.Tests/EscalaLivre.Adapter.Tests.csproj -c Release --no-restore --filter FullyQualifiedName~WeeklyWorkCharacterizationTests`: 10/10 aprovados.
- `dotnet test EscalaLivre.slnx -c Release --no-restore -m:1`: 708/708 aprovados (407 adaptador, 255 puros, 33 API, 13 arquitetura), sem falhas/ignorados. SDK local 10.0.401, Windows. As primeiras tentativas no ambiente restrito terminaram sem executar testes; `dotnet --info` identificou acesso negado ao gerenciador de serviços do Windows. Execução autorizada fora dessa restrição passou.
- Conteúdo, referências locais e diff revisados; `git diff --check` sem erros (somente aviso de conversão LF/CRLF do Git).
- Frontend, diferencial e HTTP não foram repetidos nesta entrega restrita a documentação e testes C#; não houve mudança em produção, cenários compartilhados, JSON ou frontend. CI completa permanece necessária antes de qualquer integração. Não houve commit, integração ou publicação.
