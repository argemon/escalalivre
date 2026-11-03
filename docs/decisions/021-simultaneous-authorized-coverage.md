# Cobertura simultânea autorizada e preferência de almoço

Data: 03/11/2026.

## Problema e decisão

Edson (STAFF) e Alex (Monitor) têm autorização explícita para cobrir a função
um do outro. O cálculo anterior reservava cada pessoa para uma única exigência
por bloco. Durante qualquer almoço, relatava uma função descoberta mesmo com
uma pessoa autorizada trabalhando. Essa semântica também estava no modelo do
gerador e influenciava suas escolhas de pausa e saída.

A pedido do usuário, cada pessoa presente passa a contar uma vez em cada
exigência de função para a qual está autorizada, conservando sua função
principal. As autorizações continuam direcionais e IDs explícitos continuam
prevalecendo sobre nomes antigos. Uma pessoa nunca conta duas vezes na mesma
função nem na cobertura de equipe. Pausas continuam sem cobertura. A mudança
vale para análise C#, análise TypeScript e modelo CP-SAT; o arquivo mantém o
mesmo formato, sem migração ou edição automática dos turnos salvos.

O desvio do almoço tinha penalidade inteira de aproximadamente um ponto por
30 minutos, misturada a um bônus de fechamento de 100 pontos. Passa a usar o
tempo civil completo entre entrada e início da pausa, comparado a PreferredAfter,
com penalidade de dois pontos por segundo de desvio. Assim, um minuto de desvio
supera o bônus de fechamento, sem arredondar desvios de meia hora para zero.
Usar datas completas também conserva a preferência em turnos noturnos.

Cobertura continua tendo prioridade. Restrições obrigatórias, rotina semanal,
intervalo fixo, histórico, carga contratada, margens de trabalho e orçamento de
busca permanecem. PreferredAfter continua preferência e não diagnóstico de erro.
As pausas antecipadas continuam sujeitas ao fallback com melhoria estrita de
cobertura. Não se promete 11h/12h para qualquer configuração: entrada, duração
da pausa, carga, fechamento e horários fixos podem exigir outra combinação.

## Reprodução e regressões

- Antes da correção, `edson-alex-staggered` retornou 0,889, embora um trabalhasse
  durante o almoço do outro; `single-authorized-person` retornou 0,5. Ambos agora
  exigem cobertura 1 em C# puro e TypeScript.
- O cenário compartilhado inclui autorização revogada, pausa simultânea e dois
  turnos da mesma pessoa com mínimo de equipe 2. Esses casos continuam com déficit.
- O teste real do gerador com entrada 07h30, trabalho líquido de 8h, pausa de 1h,
  saída 16h30 e PreferredAfter de 3h30 exige pausas alternadas às 11h e 12h,
  cobertura completa e rotina regular para um e três dias. A identidade de quem
  sai primeiro é livre.
- Teste de objetivo compara um minuto de atraso com o bônus de fechamento e
  verifica invariância ao transladar o turno através da meia-noite.
- O cenário D1 por função agora exige duas pessoas na mesma função B: continua
  comprovando que turnos históricos sobrepostos não multiplicam presença. O
  cenário de duas funções autorizadas passa explicitamente de 0,5 para 1.
- O teste de preferência de fechamento usa PreferredAfter de 4h para isolar
  esse critério, sem competir com uma preferência de pausa imediata.

O corpus diferencial e a integração HTTP/worker consomem os novos cenários.
A validação executada e seus limites estão registrados ao final desta decisão.

## Validação local

Windows, Node 24.17.0 e SDK .NET 10.0.402:

- `dotnet test EscalaLivre.slnx -c Release`: 780 aprovados (295 análise pura,
  439 adaptador, 33 API, 13 arquitetura).
- Frontend: 576 aprovados em America/Cuiaba e 576 em America/New_York.
- Comparação diferencial: 179 documentos aprovados em cada fuso, incluindo os
  cinco novos cenários; análise, validação, cobertura, lacunas e saldos.
- `npm --prefix frontend run build` e `npm --prefix frontend run lint`: aprovados.
- Integração HTTP completa anterior ao acréscimo do teste específico: 26/26.
  Depois, o novo teste de cobertura simultânea passou isoladamente: cinco
  documentos por analyze/validate e geração Edson/Alex por solve, com cobertura
  completa e almoços 11h/12h. Total de 27 testes HTTP verificados, sem alegar
  uma nova execução integral depois do acréscimo.

Os testes de timeout usavam a complexidade do antigo emparelhamento exclusivo.
A carga sintética foi ampliada com 2.000 turnos históricos sobrepostos e
fronteiras distintas, sem alterar prazos de produção. Os testes de timeout,
fila, cancelamento e recuperação voltaram a passar com a nova contagem.

O cenário de geração também foi verificado com intervalo variável de 1h a 2h
e fechamento às 17h30, por um e três dias. Não houve avaliação visual nem acesso
ao documento local salvo no navegador do usuário; os testes reproduzem os
dados relevantes fornecidos nas imagens. Turnos salvos não são reescritos:
novos horários exigem geração explícita. Sem publicação, push ou integração;
CI remota permanece necessária antes de integrar.
