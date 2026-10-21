# Período de planejamento

O documento contém planningPeriod com start e end no formato YYYY-MM-DD. As duas datas são inclusivas. O período pode ter de 1 a 31 dias, entre 1900 e 2100, e é editável no cabeçalho.

Calendário mensal, semanal e diário e análise de cobertura usam o mesmo período. A geração envia essas datas à API, de 00:00:00 do início até 23:59:59 do fim. Navegar no calendário não altera o período. Turnos fora do período são preservados como histórico e contexto de descanso e jornada. Operações que atravessam a meia-noite podem terminar no dia seguinte ao último dia de planejamento.

A importação e a restauração do armazenamento local migram documentos sem planningPeriod uma única vez: início no dia do primeiro turno e fim seis dias depois, preservando o comportamento anterior. Sem turnos, usam o dia atual. Novos documentos começam no dia atual com sete dias. Uma vez salvo, o período não depende mais dos turnos. O formato 1.0.0 continua aceitando documentos legados; exportações incluem o novo campo. A API preserva e valida o campo e rejeita requisições cujo período diverge do documento, quando ele está presente.
