# Intervalo automático mínimo — 03/11/2026

Pedido: preferir o menor intervalo da empresa; ampliar somente quando reduz
lacunas. Reprodução anterior: MinimumIntervalGenerationTests encontrou 2h em vez
de 1h com cobertura parcial idêntica; ao cobrir até 17h, escolheu 45 minutos
adicionais quando 30 bastavam. Duas de cinco regressões falharam antes da correção.
Uma reprodução complementar com expediente até 17:30 e demanda até 16:30 gerou
12:30–14:30 para uma das pessoas, tanto em um dia quanto em três dias, embora
duas pausas de uma hora bastassem. Essas duas regressões também falharam antes
da correção e passaram depois.

Decisão: uma busca inicial admite somente a duração mínima efetiva (empresa,
exigência da jornada e fechamento). Uma busca com pausas ampliadas só substitui
esse resultado se diminuir estritamente o déficit canônico em ticks × pessoas.
Empate, falha ou prazo esgotado conservam a solução mínima. A ampliação não serve
apenas para ganhar bônus de fechamento ou transferir uma lacuna para outro horário.
Quando necessária, a busca ordena cobertura, menor ampliação total, crédito de
carga contratada e preferências. Não usa soma de pesos para trocar essas prioridades.

Antecipação continua sujeita à comparação de cobertura dentro de cada tentativa.
As buscas compartilham um modelo, o orçamento de construção e até cinco segundos
de busca nativa. Pausas fixas, rotinas ancoradas pelo histórico e feriados autorizados
são preservados. Limites operacionais significam que se comparam soluções
encontradas; não se promete prova de necessidade global para toda entrada.

IntervalPolicy.Extension é uma preferência de geração. O equivalente TypeScript
e os cenários compartilhados verificam mínimo da empresa, jornada, segundos,
fechamento, pausa fixa e noite. A prévia usa o mínimo efetivo, pois não faz busca
de cobertura. Análise de arquivos e edição manual não ganham erro novo. Nenhum
campo JSON, migração, regra de carga ou duração legal é alterado.

Verificação local concluída:

- `dotnet test EscalaLivre.slnx -c Release --no-restore -m:1`: 815 aprovados
  (449 adaptador, 320 puros, 33 API e 13 arquitetura).
- `node --test tests/*.test.cjs`: 609 aprovados no frontend em cada um dos fusos
  Cuiabá e Nova York. Inclui 11 cenários compartilhados C#/TS de preferência,
  mínimo na prévia e preservação do intervalo explicitamente solicitado.
- Build e lint do frontend aprovados; apenas os avisos de anotação preexistentes
  do Zod durante o build.
- `SECURITY_BUILD_CONFIGURATION=Release node --test backend/security.integration.cjs`:
  29/29 aprovados com API/worker reais. O novo caso verifica três dias, permissões
  simultâneas por função, pausas mínimas, ampliação total de apenas 30 minutos,
  rotina semanal e paridade do resultado com a análise TypeScript.
- Diff e links revisados. As expectativas antigas que esticavam o intervalo da
  prévia, ou apenas transferiam uma lacuna sem reduzir déficit, foram atualizadas
  conforme a mudança explícita de contrato.

Preparação para envio ao repositório: a comparação diferencial isolada também
passou com 191 documentos em Cuiabá e 191 em Nova York, recompilando o probe
puro atual. README e documentação do gerador foram alinhados às prioridades e à
edição de função dentro do próprio cartão; links locais e diff foram revisados.

As evidências acima são locais; a CI remota verifica o commit enviado. Não houve
nova medição de desempenho. A busca continua limitada aos candidatos e ao prazo
existentes; nenhuma garantia geral de otimalidade ou ganho de desempenho é afirmada.
