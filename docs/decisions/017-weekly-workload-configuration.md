# Carga contratada, distribuição e interface — etapa 2

Data: 02/11/2026. Continuação do [contrato da etapa 1](016-weekly-workload-contract.md). Configuração preparatória implementada; suporte do gerador continua na etapa seguinte.

## Contrato entregue

`WorkloadRule.weeklyPlan` é opcional na empresa e no funcionário. Ausente/null mantém modo legado: não há meta inferida de `weeklyLimitHours` nem de `defaultShiftDuration`. Sem alteração de versões ou migração de dados: adição opcional ao formato 1.0.0. O leitor atual preserva esses campos; leitores antigos podem ignorá-los e perdê-los ao salvar, portanto não devem editar arquivos com plano novo. Esta entrega não promete aplicação de regras novas por leitores antigos. Documentos antigos continuam aceitos e não ganham plano ao importar, normalizar ou salvar.

Representação única: `contractedSeconds` inteiro positivo até 604800; `dailySeconds` com exatamente sete inteiros de 0 a 86400 na ordem domingo–sábado. Limites são estruturais/operacionais, não autorização legal de trabalho. Um valor de 31680 representa 8h48; 31681 mantém um segundo adicional. As coleções no domínio são copiadas para armazenamento imutável.

Os modelos uniforme e sexta reduzida são construtores dessa mesma representação; não há campo de modo persistido nem políticas concorrentes para cada modelo. Dias contratuais são escolhidos explicitamente no editor do modelo, separados dos dias de abertura. Na distribuição uniforme divide-se pelos dias escolhidos e atribuem-se segundos restantes na ordem domingo–sábado; na sexta reduzida fixa-se o trabalho da sexta e distribui-se o restante nos demais dias. A personalizada edita diretamente os mesmos sete valores. Aplicar modelo preserva a compensação existente; editar carga não redistribui dias silenciosamente. Ativar configuração começa com uma sugestão explícita de 40h/segunda–sexta, independente do teto; a escolha deve ser revisada pelo usuário.

`compensation`, também opcional dentro do plano, registra instrumento (texto não vazio de até 200 caracteres), início e fim inclusivos (1900–2100). Vigência invertida é estrutura inválida. `WeeklyCompensation.AppliesOn` resolve vigência; ter registro não comprova validade jurídica. Nenhum checkbox de horas extras cria compensação e nenhum plano liga extras. Ausência de compensação com distribuição acima de 8h é conflito informado, sem bloquear recuperação/edição. A análise de escalas continua legada nesta etapa; aplicar compensação aos limites diários, conferir vigência por turno e calcular saldo/dispensas são trabalho da etapa 3.

`WeeklyWorkPlanPolicy.Issues` e a política TypeScript equivalente apontam soma divergente, carga acima do teto, distribuição acima de 10h e falta de compensação acima de 8h. São avisos de configuração no editor, não novos erros estruturais do documento. O domínio protege formato/unidades; conflito de negócio não impede round-trip nem reescreve turnos. O mapeador converte DTOs explicitamente e o leitor JSON transforma erro estrutural do plano em `JsonException`.

Herança usa `inheritsCompanyDefaults` já existente: ligado, o plano efetivo vem da empresa; desligado, usa o plano individual (inclusive ausência explícita de plano). A mudança de herança e o salvamento de empresa/pessoa preservam os horários e pausas registrados. A atualização explícita de função mantém o contrato anterior.

## Interface e disponibilidade

Empresa e funcionário oferecem carga, distribuição, resumo por dia e semana e instrumento/vigência da compensação. O teto semanal continua campo separado. Durações do novo editor deixam os segundos visíveis e editáveis; a máscara antiga conserva sua apresentação padrão nos outros campos.

A prévia usa entrada e duração de pausa configuradas: 07:30 + 8h48 + 1h = 17:18; 07:30 + 9h + 1h = 17:30; 07:30 + 8h + 1h = 16:30. O cálculo está na política, não em componentes/Zustand. É uma estimativa aritmética, sem promessa de turno elegível: expediente, pausa individual, fechamento, descanso, ciclo e margem de trabalho continuam relevantes. No funcionário a prévia usa a pausa mínima da empresa, explicitamente apresentada; não substitui a pausa individual cadastrada.

A duração de intervalo aparece como fixa quando mínimo=máximo, ou faixa quando diferentes. A mensagem mantém exceções de fechamento atravessado e intervalo individual. Nenhuma mudança na política de intervalos: um mesmo início civil/deslocamento/duração por pessoa e semana continua obrigatório na geração; sexta reduzida não flexibiliza essa rotina.

A geração fica indisponível quando qualquer funcionário tem plano efetivo. O painel desabilita o botão e explica o motivo; clientes HTTP direto/fila do frontend rejeitam antes de enviar. `GenerateSchedule` também rejeita antes de chamar o otimizador, retornando estado invalid com solverInvalid e documento anterior. É bloqueio de capacidade na Application, não alteração das regras de candidatos/OR-Tools. Empresa com plano, mas todos os funcionários com configuração própria sem plano, continua no modo legado. A edição manual e análise existentes permanecem disponíveis; não se afirma que já analisam carga/saldo/compensação.

## Evidência e próximos passos

[Fixtures compartilhadas](../../shared/weekly-work-plan-scenarios.json) têm oito distribuições/conflitos e quatro saídas esperadas, consumidos independentemente por C# puro e TypeScript. Abrangem 44h uniforme, sexta reduzida, segundos restantes em dias fora de ordem, 40h, soma inválida, teto menor, compensação explícita e excesso diário. Testes adicionais verificam imutabilidade, vigência inclusiva, mapeadores, JSON legado/novo/inválido, herança, preservação de todos os campos dos turnos no store/arquivo, idempotência das migrações existentes, bloqueio anterior ao otimizador/rede e controles reais do editor (sem navegador).

Próxima etapa: consumir o plano na geração e admissão, substituir o limite normal legado somente sob compensação vigente, contabilizar carga e saldo separadamente de cobertura, dispensa em feriado/afastamento e recortes bilaterais. Usar a matriz da etapa 1 e docs/testing.md. Afastamentos e cálculo de folha/banco entre semanas não foram introduzidos. A pendência jurídica da etapa 1 continua registrada; os modelos são aritméticos, não presets de conformidade legal.

## Validação local desta entrega

- `dotnet test EscalaLivre.slnx -c Release --no-restore -m:1`: 712 aprovados (407 adaptador, 259 puros, 33 API, 13 arquitetura). Após adicionar as quatro fronteiras de vigência ao mesmo teste compartilhado, repetição direcionada de `WeeklyWorkPlanTests`: 4/4 aprovados.
- `node --test frontend/tests/*.test.cjs`: execução final 527/527 em America/Cuiaba e 527/527 em America/New_York. Inclui teste de máscara com segundos inicialmente zero e controles do editor; não houve teste visual em navegador real nesta entrega.
- Lint e build frontend aprovados; build mantém os avisos existentes de anotação do Zod. Ambiente local Windows, Node 24.14.1 e SDK .NET 10.0.401.
- `node tools/parity-differential.cjs`: 142 documentos aprovados em Cuiabá e em Nova York. As políticas novas são verificadas pelos oito cenários, quatro saídas e quatro fronteiras de vigência compartilhados; o corpus diferencial legado não foi alterado para acomodar o plano novo.
- `SECURITY_BUILD_CONFIGURATION=Release; node backend/security.integration.cjs`: 23/23 anteriores aprovados. Depois, novo teste `weekly plan contracts` executado isoladamente: 1/1 aprovado (round-trip do plano/turnos, bloqueio em solve pelo worker e HTTP 400 para estrutura inválida). A suíte HTTP inteira com esse novo caso junto não foi repetida. Na primeira execução do novo caso, a comparação encontrou `roleId:null` já emitido pela API em vez de campo ausente; a comparação final verifica essa equivalência opcional explicitamente e preserva os demais campos integralmente.
- A primeira suíte frontend encontrou mocks antigos sem a dependência nova e contagem fixa de seis políticas no scanner de arquitetura. Mocks atualizados para o contrato novo e scanner ampliado para sete políticas, mantendo a verificação de dependências em todas. Repetições direcionada e completas passaram.
- Links locais, conteúdo e diff revisados. Nenhum fonte do adaptador, peso, orçamento, candidato ou rotina de pausa foi alterado. Mudanças locais da etapa 1 preservadas.
- CI remota ainda necessária antes de integrar. Sem commit, integração ou publicação; sem alegação de ganho de desempenho ou certificação jurídica.
