# Resumo operacional e ações

Task 08, 11/11/2026. O Assistente usa uma única lista priorizada, substituindo a enumeração anterior de lacunas/conflitos. Categorias: conflitos obrigatórios, falta de pessoas, falta de carga contratada e preferências/pontos de atenção. Percentual de cobertura permanece uma métrica separada, sem sinalizar sozinho conformidade da escala.

Lacunas derivam dos blocos canônicos de cobertura para preservar contexto perdido na fusão simples de gaps. Somente trechos consecutivos de mesmo dia, função, déficit, quantidades requerida/alocada e contribuições compatíveis são agrupados. Blocos que cruzam meia-noite são divididos por dia. Não se alteram os diagnósticos canônicos. Ocorrência é um diagnóstico ou trecho de bloco no dia; grupo reúne ocorrências compatíveis. Contadores distinguem grupos e ocorrências. Datas intermediárias de alertas semanais entram no filtro, respeitando fim exclusivo.

Falta de carga usa resumos diários e carga semanal sem dia definido, sem duplicar workloadShortfall. Avisos e sugestões existentes não viram conflitos obrigatórios. Mensagens, pessoa/função, data/faixa e quantidade aparecem primeiro; código técnico fica em detalhe secundário. A lista inicial é curta e pode mostrar todos os grupos. Filtros por categoria, dia e função conservam as contagens explícitas.

Localizar abre a data/pessoa correta na visão diária, inclusive contexto histórico fora da seleção, sem alterar o documento. Editar abre o turno exato ou uma escolha dos turnos abrangidos por um alerta semanal. Procurar substituto reutiliza validação de substituição da task 06 sem inventar ausência. Lacuna sem turno oferece alocação ou edição da demanda, nunca uma substituição fictícia. Revisar demanda só abre o editor no contexto de função/dia; não reduz nenhuma quantidade automaticamente.

Alocação avalia a faixa da lacuna e entradas habituais próximas, com duração/intervalo pelas políticas existentes e análise da proposta inteira. É uma busca local limitada, sem promessa de solução exaustiva ou cobertura total. Candidatos precisam reduzir a lacuna e ficar sem erros obrigatórios. Falta de candidato mostra impedimentos. Diálogos recalculam candidatos pelo documento atual e confirmações obsoletas são recusadas.

Os diálogos utilizados pelas ações recebem foco inicial, contenção de Tab/Shift+Tab, Escape e restauração de foco ao fechar. Rótulos e textos identificam as categorias sem depender de cor. Navegação diária foca a pessoa/data de destino.

Validação: cinco testes novos de agrupamento, contagem, filtros, contexto/candidatos e não mutação; com os grupos de intervalo/ausência, 35 aprovados. Edge verificou substituição sem evento inventado, alocação, revisão de demanda sem alteração, ausência de candidato, navegação por teclado e foco ao abrir/fechar. Lint/build frontend aprovados. Não houve alteração de regras C#/solver; CI e integração pendentes.
