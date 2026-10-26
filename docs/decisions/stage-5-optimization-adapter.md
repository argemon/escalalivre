# Etapa 5 — Adaptador OR-Tools decomposto e aplicação protegida

Relatório histórico da respectiva etapa. Código/comandos atuais e fechamento das pendências: [revisão da etapa 6](stage-6-final-review.md).

Data: 26/10/2026. Estado: saída local atendida; CI remota/etapa 6 pendentes. Ambiente do baseline preservado: Windows, SDK 10.0.402 selecionado por rollForward=latestFeature (global.json 10.0.201), Node v24.17.0/npm 11.13.0; HEAD 66659daa2bbfc2384605946ec5b553e0bcd51eed. Alterações anteriores não foram descartadas; não houve commit, push ou integração.

## Saída da etapa anterior e sequência comprovada

Etapa 4 conferida em AGENTS/plano/arquitetura/paridade/ADR 006: contratos parciais, registro extensível, matriz completa e testes puros presentes. Antes das mudanças: [184 puros](evidence/stage-5/analysis-baseline.txt), [365 backend](evidence/stage-5/backend-baseline.txt), [15 HTTP](evidence/stage-5/security-baseline.txt), sem falha. D1 continuava bloqueando a conclusão da etapa 5 e precisava de correção separada. CI remota permanecia pendente antes de integração.

1. Extração de componentes sem correção de regra: [365/365 backend](evidence/stage-5/extraction-backend.txt), inclusive a reprodução antiga de D1, aprovados antes da correção.
2. Correção separada no tradutor de cobertura e atualização da antiga caracterização para regressão do contrato. [Sonda antigo/corrigido](evidence/stage-5/D1-comparison.txt) reproduz D1 tanto para equipe quanto para funções direcionais: score 0,5 → 1, duas atribuições preservadas e uma pessoa disponível acrescentada. Essa correção alinha o modelo com o contrato C#/TS existente; nenhum horário histórico é removido para obter viabilidade.
3. Admissão de resultados implementada em Application/Domain, com reavaliação canônica e proteção contra novas violações, inclusive agravamento com o mesmo diagnóstico agregado. Casos puros usam porta falsa; as traduções/modelos são testados separadamente com OR-Tools real.

Componentes, limites, coeficientes, status e critérios de herança estão detalhados no [ADR 007](007-optimization-translators-and-admission.md). Não houve alteração de endpoint, envelope, arquivo, migração, peso ou granularidade. A proteção e D1 são mudanças deliberadas de comportamento descritas separadamente da extração.

## Verificações finais

| Verificação | Resultado | Evidência |
| --- | --- | --- |
| Domain/Application sem Infrastructure/API/OR-Tools | 197/197; 184 anteriores + 13 de conformidade/aplicação | [puro](evidence/stage-5/analysis-final.txt) |
| Adaptador, modelos reais e composição | 384/384; 365 anteriores + 19 casos de componentes | [backend](evidence/stage-5/backend-final.txt) |
| Frontend | 371/371; 369 anteriores + 2 regressões de D1 | [frontend](evidence/stage-5/frontend-final.txt) |
| Mesmo frontend em America/New_York | 371/371, TZ restaurado | [NY](evidence/stage-5/frontend-new-york.txt) |
| Cliente preserva em solverInvalid | 5/5 no arquivo de preservação, incluindo código acrescentado ao teste existente | [preservação](evidence/stage-5/frontend-preservation.txt) |
| Lint / frontend build | exit 0 | [lint](evidence/stage-5/lint-final.txt), [build](evidence/stage-5/frontend-build.txt) |
| API Release | zero avisos/erros | [API](evidence/stage-5/api-build.txt) |
| HTTP/worker Release | 16/16, incluindo novo teste para os dois casos de D1 | [HTTP](evidence/stage-5/security-final.txt) |

Os 58 documentos e hashes de leitura completos continuam sem alterações; os 20 contratos de regimes também foram preservados. A suíte HTTP compara TS/analyze/validate/solve sobre os 58 casos e verifica os dois novos casos de solver em arquivo separado, incluindo blocos, lacunas, score, campos dos diagnósticos e histórico. Não se exige uma escala exata entre alternativas ótimas.

Os modelos pequenos reais cobrem exclusividade diária; descanso com igualdade/um segundo nos dois lados; saldo semanal exato/excedido; ciclo que alcança ambos os lados; cobertura parcial viável; seleção e leitura preservando histórico; Unknown com prazo nativo zero; infeasibilidade forçada; ModelInvalid real; limites de 30.000 candidatos/300.000 passos e inclusão dos fixos no orçamento; coeficientes e clamp de preferência. Testes existentes continuam verificando pausas/semana, autorizações, busca excessiva e restrições na geração real. O overload de teste não altera o limite produtivo de 5s/um worker.

Casos puros rejeitam jornada nova inválida, conflito de descanso bilateral, lote com dois turnos na mesma data, agravamento de uma semana/ciclo já inválido, transferência de conflito de turno removido, alteração indevida do histórico e proposta incoerente de porta em insucesso. Aceitam adição válida não afetada por erro herdado e propagam cancelamento sem mutação.

Cancelamento, timeout externo, memória, fila/recuperação e liberação de slots continuam verificados pelo teste HTTP com processos reais; o store mantém seus testes de cancelamento e resultado obsoleto. Não foi adicionado cancelamento em processo à porta síncrona: o isolamento/supervisor continuam os anteriores.

## Falhas distinguidas e limites

Baseline desta entrega sem falhas. Uma falha intermediária foi introduzida somente nas fixtures novas: faltava planningPeriod para analyzeDocument do frontend, resultando em 369/371 ([log](evidence/stage-5/frontend-intermediate.txt)). As fixtures foram completadas com período, fuso e catálogo/IDs de função para testar o contrato atual, sem mudar produção nem os 58 casos congelados; verificação final 371/371. Não houve falha nova de regra identificada nos checks finais. A intermitência histórica do teste de fila com solve/1s continua como risco de ambiente; passou no baseline e na execução final, sem ampliar timeout.

CI remota Ubuntu/Node 22 e SDK exato 10.0.201 não foram executados; precisam passar antes da integração. A solução foi verificada localmente com roll-forward permitido pelo projeto. D1 deixa de bloquear a etapa 5 nos cenários reproduzidos, mas isso não constitui prova de equivalência de todos os modelos possíveis. Não houve medição comparativa de desempenho, memória ou tamanho do modelo; isso pertence à etapa 6. A função de admissão é conservadora para famílias novas de diagnósticos e requer contrato explícito para permitir adições nesse contexto.

## Próximos passos e rollback

Etapa 6 ainda não iniciada: testes de arquitetura mais amplos, migração/remoção das fachadas, medição nos mesmos cenários e validação da CI. Nenhuma migração de dados precisa ser revertida. Para rollback técnico, repor coordenador anterior e registros/fachada junto dos componentes; correção D1 e proteção da aplicação são partes independentes e não devem ser revertidas inadvertidamente com a extração. Cópias anteriores/staging em Documents/escalalivre-stage5; logs permanentes abaixo de evidence/stage-5.
