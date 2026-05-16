# Regras De Negocio

## Empresa

- Horario de funcionamento.
- Dias de funcionamento.
- Jornada padrao.
- Regra de almoco.
- Descanso minimo.
- Cobertura minima por funcao.

## Funcionarios

Cada funcionario pode herdar o padrao da empresa ou sobrescrever sua propria jornada, disponibilidade, restricoes, preferencias, hora extra, noturno e folgas.

## Intervalos

Intervalos nao sao fixos. O modelo permite mover, aumentar e otimizar almoco, respeitando minimo legal e maximo operacional.

## Buracos operacionais

Um buraco existe quando a cobertura real e menor que a minima para uma funcao em uma faixa horaria. Exemplo:

```text
Sabado 18h-22h:
Falta 1 vendedor
```

## Contratacao

Sugestoes sao derivadas de gaps recorrentes e indicam funcao, carga semanal e janelas ideais.
