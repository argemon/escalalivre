# Carga contratada obrigatória na geração

Data: 12/11/2026.

## Problema e comportamento

Na equipe de sete pessoas com contratos de 20h, 30h, 36h, 40h e 42h,
a geração podia cobrir toda a demanda e ainda deixar 26h normais evitáveis sem
planejamento. Carga contratada era um objetivo posterior à cobertura; candidatos
sem demanda relevante também eram descartados.

A carga normal devida passa a ser restrição obrigatória por pessoa e semana.
Demanda representa um mínimo de cobertura, sem limitar quantas pessoas da mesma
função podem trabalhar juntas. Pessoas contratadas podem receber turnos dentro
do funcionamento mesmo quando não há exigência de cobertura cadastrada.

`ContractMinimumPolicy` fornece os mínimos canônicos, considerando recorte,
histórico externo, dispensas/créditos explícitos e inativação. Os limites diário,
semanal, de ciclo e disponibilidade continuam obrigatórios. Distribuição fixa
que não soma o contrato exige ajuste antes de gerar, sem impedir recuperar ou
editar o documento. `ContractWorkConstraints` traduz o mínimo para OR-Tools e
centraliza o crédito antes calculado pelo objetivo. Cobertura, intervalo e
preferências só são otimizados dentro das soluções que cumprem os mínimos.

Na opção explícita de 42h/5x2 com 8h por dia, mantém-se a exceção solicitada:
o mínimo de geração é de 40h numa semana completa e o relatório conserva as 2h
normais faltantes. O editor sugere 8h24 ou complemento por extras autorizadas.
Extras são contabilizadas separadamente; não apagam a falta normal nem são
geradas automaticamente por esse aviso. Créditos totais e parciais preservam
a exceção somente nos dias/slots devidos.

## Falha e preservação

Se o mínimo não couber nas restrições, a geração retorna impedimento e mantém
todos os turnos anteriores. Esgotar o orçamento sem solução não comprova
inviabilidade: retorna timeout. Application revalida a carga da proposta e o
frontend aplica a política equivalente antes de aceitar o resultado. A análise
do rascunho mantém `workloadShortfall` como aviso; edição e recuperação continuam
permitidas. Não houve mudança de formato ou migração.

As tentativas de intervalo podem relaxar preferências quando estas impedem o
contrato. Um limite superior do crédito evita gastar busca numa preferência
de pausa impossível para jornadas curtas. As sugestões iniciais respeitam dias,
ciclo e histórico, distribuem cobertura e incluem pausas antecipadas quando
permitidas. Mantêm-se o orçamento nativo de cinco segundos e a supervisão do worker.

## Verificação

Regressão determinística em `shared/mixed-contract-generation.json`: sete pessoas,
248h normais planejadas, cobertura de 100% e somente 2h faltantes intencionais.
Também cobre demanda vazia, indisponibilidade impeditiva, preservação, inativação,
distribuição divergente e resultado falsamente bem-sucedido de um otimizador.

Os cenários compartilhados de carga incluem mínimos esperados e casos de crédito
total/parcial na exceção de 42h. São verificados no domínio puro e no TypeScript.
A integração HTTP verifica o adaptador real, os processos de cálculo e a paridade
da escala gerada. As verificações locais executadas constam no
[contrato de paridade](../rule-parity.md).
