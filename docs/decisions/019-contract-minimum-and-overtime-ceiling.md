# Mínimo contratado, máximo com extras e saída antecipada

Data: 02/11/2026. Complementa a [geração de carga contratada](018-weekly-workload-generation.md).

## Pesquisa e significado

CLT não significa necessariamente remuneração por hora: o art. 64 distingue o
empregado mensalista no cálculo do salário-hora. Para planejamento, o dado
relevante é a jornada normal contratada. O MTE informa o limite geral normal de
8h diárias/44h semanais e define extras como trabalho além da jornada individual,
inclusive reduzida. O adicional mínimo é de 50%; compensação/banco dependem do
instrumento e prazo aplicáveis. O cadastro não apura folha nem certifica categorias
especiais. Fontes oficiais consultadas:

- [CLT, arts. 58, 59 e 64](https://www.planalto.gov.br/ccivil_03/decreto-lei/del5452compilado.htm).
- [Jornada normal — MTE](https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/perguntas-frequentes/jornada-de-trabalho/o-que-se-considera-jornada).
- [Horas extras — MTE](https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/perguntas-frequentes/jornada-de-trabalho/o-que-se-considera-horas).
- [Remuneração — MTE](https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/perguntas-frequentes/jornada-de-trabalho/de-que-forma-devera-ser).
- [Compensação — MTE](https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/perguntas-frequentes/jornada-de-trabalho/e-possivel-compensar-horas-sem).

## Contrato entregue

O editor chama `weeklyPlan.contractedSeconds` de mínimo semanal contratado:
trabalho líquido normal, distribuído por dia. `weeklyLimitHours` é o máximo total
semanal, incluindo extras autorizadas. Contrato 40h e teto 48h não obrigam 48h nem
liberam 8h extras em um único dia. Pausas, descanso, autorização individual,
compensação vigente, ciclo e limites diários continuam aplicáveis. Contrato normal
acima de 44h recebe aviso de configuração; documentos conflitantes são recuperáveis.

Correção intencional: o teto estrutural aceita até 168h, horas de uma semana,
em vez de confundir máximo total com o limite normal de 44h. Esse número não é
autorização de trabalho. `EffectiveWorkPolicy.WeeklyLimit` aplica o menor entre
teto e 44h sem autorização de extras; com autorização usa o teto explícito.
Diagnóstico, saldo de candidatos e restrição semanal consomem a política;
TypeScript mantém semântica equivalente. A referência de contratação continua
limitada a 44h normais, sem tratar extras como capacidade normal.

Arquivos antigos com teto até 44h mantêm comportamento e não recebem mínimo ou
autorização inferidos. Não há mudança de versão JSON ou migração. Arquivos com
teto maior exigem este leitor; leitores antigos podem rejeitá-los.

No funcionário, “Ajustar saída dos turnos salvos” salva explicitamente a saída de
cada turno do período. Conserva ID, entrada, pausa, função, origem e tags;
validação estrutural impede saída anterior à entrada ou pausa fora do turno.
O botão salva imediatamente e recalcula diagnóstico, independentemente das
alterações cadastrais ainda não salvas.

Exemplo: contrato de 40h em cinco dias de 8h, entrada 07:30 e pausa 12–13h.
Alterar a saída de segunda de 16:30 para 15:30 resulta em 39h planejadas e 1h
faltante na segunda e na semana. Relatório diário e escala semanal exibem a falta.
Dispensa explícita reduz a meta; saída menor sozinha não reduz. Isso representa
saldo da escala, sem apuração de ponto, dívida salarial ou banco automático.

O gerador mantém as prioridades cobertura, carga e preferências. Impossibilidade
de cumprir carga permanece visível; não se fabricam turnos sem demanda, não se
compensam faltas com extras de outro dia e falhas preservam o documento anterior.

## Verificação e limitações

Cenários compartilhados: saída antecipada de 1h, teto 48h com/sem autorização e
excesso do teto. Validação de arquivo: 44,1h, 168h e rejeição de 168,1h em empresa
e pessoa. Store: saldo imediato, preservação dos outros turnos e round-trip.
Adaptador real: geração com teto ampliado com/sem autorização de extras.

Matriz local: 748 testes .NET (276 análise, 426 adaptador, 33 API, 13 arquitetura),
25 HTTP/worker, diferencial de 158 documentos em Cuiabá e Nova York, lint e build
frontend aprovados. Frontend completo: 547 casos em Cuiabá antes dos dois novos
testes de edição, 548 em Nova York antes do último teste do componente. Após essas
adições, os 19 casos de carga/edição foram executados nos dois fusos, incluindo
acionamento do botão real do editor e rejeição da saída no meio da pausa.
Não se apresenta essa execução dirigida como nova execução integral de 549 casos.
Conteúdo, links locais e diff revisados, sem erros de whitespace. O build mantém
os avisos já existentes de anotação do Zod. A execução HTTP passou integralmente;
houve build/testes concorrentes no início, portanto não serve como medição de carga.

Windows, Node 24 e .NET 10; sem medição de desempenho ou revisão visual em
navegador nesta entrega. CI remota do diff é necessária antes de integrar.
Nenhum commit, envio, integração ou publicação foi realizado.

## Seguimento — integração autorizada

Após a entrega local, o usuário autorizou enviar todas as alterações à main.
A ausência de commit/envio acima registra o estado da entrega, anterior a essa
autorização. Esta decisão e a escala individual da decisão 020 seguem juntas;
a integração depende da aprovação integral do workflow Validate para o commit
enviado. O resultado remoto será conferido antes de efetivar a integração.
