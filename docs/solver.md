# Solver

O solver e implementado em `OrToolsScheduleSolver` usando CP-SAT do OR-Tools.

## Responsabilidades

- Gerar candidatos de turno por funcionario, dia e regime.
- Aplicar hard constraints de descanso minimo, disponibilidade, cobertura obrigatoria e limite semanal.
- Maximizar atribuicoes validas e cobertura.
- Validar escalas existentes sem reatribuir tudo.
- Detectar gaps operacionais e gerar sugestoes de contratacao.

## Hard constraints

- Descanso minimo configurado pela empresa.
- Limite semanal por funcionario.
- Restricoes e indisponibilidades individuais.
- Cobertura minima por funcao.
- Regras de regime day-based ou hour-based.

## Soft constraints futuras

- Preferencias de dias/turnos.
- Distribuicao justa.
- Menos horas extras.
- Menor troca de turno em relacao a uma escala anterior.
- Almoco movel com objetivo de cobrir buracos.
