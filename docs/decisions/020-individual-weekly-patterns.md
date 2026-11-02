# Escala individual 5x2/6x1 e escolha dos dias pelo gerador

Data: 02/11/2026. Continuação da [carga contratada](018-weekly-workload-generation.md)
e do [mínimo/máximo](019-contract-minimum-and-overtime-ceiling.md).

## Problema e comportamento

Funcionamento da empresa, dias permitidos da pessoa e escala são conceitos
distintos. O ciclo em dias já limitava datas trabalhadas em janelas móveis, mas
o plano contratado fixava metas por dia da semana. Abrir sete dias e cobrar carga
em todos eles impedia escolher folgas corretamente.

O cadastro agora oferece padrão da empresa, 5x2, 6x1 e ciclo personalizado.
Selecionar 5x2/6x1 cria configuração individual e permite escolher dias e folgas
automaticamente ou restringir dias fixos. Preserva carga já configurada e teto;
quando não existe contrato, a escolha explícita sugere 40h/44h respectivamente,
para revisão. Não é migração nem inferência ao abrir arquivos. Salvar o cadastro
preserva turnos, pausas, IDs, origem e tags.

No modo automático, abertura e cobertura continuam limitando onde existe trabalho,
mas não impõem todos os dias abertos à pessoa. 5x2 permite até cinco datas de
trabalho em qualquer janela de sete, 6x1 até seis, incluindo histórico bilateral.
Não se promete bloco de cinco/seis dias consecutivos, folgas consecutivas ou
sábado/domingo fixos. Se demanda ou restrições impedirem completar a escala,
o resultado mostra déficit; não cria trabalho sem demanda para cumprir contagem.
Restrições, entrada fixa, descanso, pausas e teto semanal continuam obrigatórios.

## Modelo e políticas

`weeklyPlan.flexibleWorkDays` é opcional, inteiro 1–7 protegido na construção.
Ausente mantém exatamente a distribuição fixa anterior. Presente define quantos
dias podem receber a carga normal semanal; `dailySeconds` continua preservado
como referência para voltar à distribuição fixa, sem impor metas no automático.
DTOs/mapeadores explícitos e Zod preservam o campo; sem nova versão JSON.
Leitores anteriores não devem editar esses documentos: podem ignorar o campo.

`EmployeeSchedulePolicy` fornece o ciclo efetivo. `ContractWorkPolicy` fornece
alvo normal por turno e candidatos de duração; `FlexibleContractPolicy` calcula
cotas do recorte, reconhecimento e relatórios. A tradução usa a mesma semântica,
sem mover política de negócio para OR-Tools. No cliente, políticas puras equivalentes
ficam em `lib/policies`; alvos de trabalho foram separados da montagem dos
relatórios para não criar dependência circular.

Divisão usa segundos inteiros: candidatos incluem parte inteira e um segundo
adicional, com orçamento explícito dos segundos restantes. O objetivo limita crédito
normal por semana e esses adicionais, sem contar extras como cumprimento de carga.
Sem autorização de extras, o trabalho também fica limitado à carga normal ajustada.
Cobertura, carga e preferências mantêm prioridades e orçamento nativo anteriores.
Não há promessa de ótimo global nem ganho de desempenho.

No relatório automático, somente datas com turno ou dispensa recebem meta diária.
A carga restante aparece em `unassignedSeconds`, incluída no déficit semanal,
sem inventar turno ou marcar cada possível folga como falta. Exemplo: contrato
40h, quatro turnos de 8h: 8h ainda sem dia definido. Cinco turnos, um reduzido
para 7h: 1h faltante no dia e na semana. Excesso de outro dia não quita essa falta.

Recorte parcial: cotas = min(dias civis do recorte naquela semana, dias contratuais
menos datas já ocupadas por trabalho ou dispensa explícita fora do recorte).
Cada cota recebe a parte inteira da divisão da carga pelos dias contratuais;
segundos restantes ainda não reconhecidos ou dispensados no histórico são
reservados às cotas disponíveis, no máximo um por dia. Não se cobra novamente
o segundo já atendido fora do recorte nem se inventa histórico ausente.
Histórico continua consumindo teto civil e descanso nas duas
bordas. Dias fechados não reduzem a carga. No automático não há dia contratual
fixado para conceder crédito de feriado: fechamento impede candidatos, enquanto
dispensa de carga deve ser explícita. O modo fixo mantém a dispensa de feriado
anterior. Créditos do automático são limitados às cotas do recorte; não se
transformam sete dias de crédito em sete dias contratados num plano 5x2.

Prévias automáticas não inventam horários em todos os dias antes de gerar. Após
a geração, calendário e tabela mostram os turnos salvos. O relatório distingue
carga sem dia definido das faltas dos turnos escolhidos.

## Pesquisa sobre as mudanças e limite jurídico

A EC 141/2026 foi publicada em 16/10/2026. Seus arts. 6º e 10 falam em **dois
meses**, e depois mais um ano, para as etapas de 42h/dois repousos e 40h. Os avisos
usam 16/12/2026 e 16/12/2027, por contagem de meses civis. Notícias oficiais também
divulgam 60 dias/15 de dezembro; essa diferença foi mantida explícita na pesquisa,
sem substituir o texto normativo por manchete. Fontes:

- [Texto original, Câmara](https://www2.camara.leg.br/legin/fed/emecon/2026/emendaconstitucional-141-16-outubro-2026-800062-publicacaooriginal-181622-pl.html).
- [Resumo de implementação, Câmara](https://especial.camara.leg.br/reducao-da-jornada-detrabalho-e-fim-da-escala-6x1/).
- [Notícia da promulgação, Senado](https://www12.senado.leg.br/noticias/materias/2026/10/16/congresso-promulga-o-fim-da-escala-6x1-e-aposentadoria-de-agentes-de-saude).

Há negociação coletiva de repousos na média mensal e enquadramentos específicos.
O sistema não possui os dados necessários para decidir todas essas hipóteses.
Por isso, `weeklyRestTransition` e `contractHoursTransition` são **avisos de
adequação**, baseados no fim do período planejado; não são novos erros de arquivo,
autorização coletiva, bloqueio universal ou conversão automática de 6x1 em 5x2.
O teto obrigatório configurado e as autorizações continuam explícitos. Não se
afirma conformidade jurídica completa nem se altera contrato/folgas silenciosamente.

## Verificação

Cenários compartilhados cobrem escolha de fim de semana, escala sem turnos,
saída antecipada, abertura em quatro dias, dispensas, histórico nas duas bordas,
6x1 de 44h, feriado sem crédito inferido, fronteiras da transição e segundos
restantes. Análise pura C#/TS e comparador verificam todos os saldos, inclusive
`unassignedSeconds`. O adaptador real verifica rodízio, bloqueios, fechamento,
5x2/6x1, dispensa sem reposição e divisão com segundos.

Testes do cadastro acionam o seletor real, alternam automático/fixo, preservam
dados e validam round-trip e limites estruturais. HTTP usa processos filhos reais
para analisar os cenários e gerar as duas escalas.

| Verificação local | Resultado |
| --- | --- |
| `dotnet test EscalaLivre.slnx -c Release --no-restore -m:1` | 774 aprovados: 294 análise, 434 adaptador, 33 API e 13 arquitetura |
| Frontend completo, Cuiabá e Nova York | 571 aprovados em cada fuso |
| Seletor de escala após a última revisão da troca para personalizado | 6 testes dirigidos aprovados; a matriz integral anterior não foi repetida após essa última alteração de interface |
| Paridade diferencial, Cuiabá e Nova York | 174 documentos em cada fuso; todos os campos de carga e códigos de transição comparados |
| Lint e build frontend | Aprovados após a última revisão; avisos já existentes de anotação do Zod |
| HTTP/worker Release | 26/26 aprovados, sem builds/testes pesados concorrentes |
| Conteúdo, links locais e diff | Revisados; sem erros de whitespace |

A primeira execução HTTP apontou serialização indevida de `flexibleWorkDays:null`
em planos antigos. O DTO agora omite o campo ausente, preservando o formato
anterior; a execução HTTP completa foi repetida com sucesso após a correção.
Os testes adicionais verificam que dispensa fora do recorte reserva uma cota,
segundo já reconhecido no histórico não é cobrado de novo e duas dispensas não
creditam duas vezes o único segundo restante.

Ambiente local: Windows, Node 24 e .NET 10. Sem revisão visual em navegador real,
medição de desempenho ou certificação de enquadramento jurídico. Sem commit,
envio, integração ou publicação; CI remota deste diff continua necessária antes
de integrar.

## Seguimento — integração autorizada

O usuário autorizou enviar todas as alterações à main após a conclusão local.
As referências anteriores a ausência de commit/envio registram aquele momento.
A entrega inclui mínimo contratado, máximo com extras, edição da saída, escala
individual, README e documentação. A integração exige o workflow Validate
integralmente aprovado para o head enviado; evidência local não substitui esse
gate. Nenhuma nova aprovação do usuário é necessária para concluir esse envio.
