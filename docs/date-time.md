# Datas, horários e instantes

- Horários de relógio da empresa, entrada fixa e intervalo fixo: HH:mm:ss, sem data e sem fuso.
- Durações (jornada, descanso, intervalo mínimo/máximo): durações, nunca instantes. O formato de transporte atual é HH:mm:ss.
- Datas do planejamento e dos feriados: YYYY-MM-DD, sem conversão de fuso.
- Turnos, pausas, disponibilidade e restrições: data e hora civil da empresa, YYYY-MM-DDTHH:mm:ss, sem Z nem offset. A precisão da escala é de segundos.
- updatedAt: instante real ISO 8601 em UTC. Não serve para determinar o dia ou horário de um turno.

company.timeZone guarda o fuso IANA usado para interpretar dados legados com Z ou offset. O padrão para documentos antigos é America/Cuiaba; o campo pode ser alterado na configuração da empresa. Por exemplo 2026-10-21T13:00:00Z vira 2026-10-21T09:00:00 nesse fuso. Datas civis sem offset mantêm exatamente o relógio informado; não se deve remover o Z sem converter o instante. Alterar o fuso não desloca horários civis já cadastrados.

A restauração do armazenamento (versão 2) e a importação normalizam os campos temporais antes de inferir o período legado. Exportação e envio à API usam o mesmo normalizador. A API e o processo de cálculo compartilham conversores JSON que convertem valores com offset para o fuso da empresa e produzem DateTime Unspecified; não dependem do fuso do servidor. Atualizações são escritas em UTC.

O calendário trabalha com os componentes de relógio exibidos, grava data e hora civil e desloca a pausa pelo mesmo deslocamento do turno. Mudança de dia mantém o turno inteiro e remove a autorização de feriado da data anterior. Feriados, impressão e análise consultam as funções centrais de data e horário. A semana continua começando no domingo, com divisão das horas e pausas na virada da semana.
