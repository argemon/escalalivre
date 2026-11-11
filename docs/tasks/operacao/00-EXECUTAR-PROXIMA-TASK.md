# EscalaLivre — execução sequencial das melhorias de operação

Plano criado em 11/11/2026. Este documento é o ponto de entrada para executar **todas as tasks com um único pedido, uma por vez, em sequência, até concluir**.

## Comando para o agente

Leia este arquivo e execute todas as tasks pendentes em sequência, uma por vez, até concluir o plano. Comece pela primeira ainda não concluída, leia seu Markdown, implemente o escopo completo, faça as validações pertinentes e registre os resultados nos dois arquivos. Ao concluir uma task, avance automaticamente para a seguinte sem pedir confirmação, sem aguardar novo pedido e sem encerrar a execução entre elas. Não implemente tasks simultaneamente.

Se existir uma task em andamento, retome-a. Se estiver bloqueada, tente resolver o impedimento dentro do escopo autorizado; se não conseguir, registre o bloqueio e não pule a sequência. Pare apenas quando todas estiverem concluídas, o usuário pedir para parar ou um impedimento real exigir informação, acesso ou decisão indisponível. Escolhas técnicas rotineiras não exigem confirmação. Não reinicie trabalho concluído nem repita verificações válidas sem motivo concreto.

Informe o progresso brevemente após cada task e continue trabalhando. Compactação de contexto não encerra a autorização: retome pelos registros. Uma interrupção externa pode exigir retomada da sessão; não prometa execução em segundo plano fora da sessão ativa.

## Uso no repositório

Coloque esta pasta, com seus dez arquivos Markdown, em `docs/tasks/operacao/` no repositório `argemon/escalalivre`. Os links entre os arquivos são relativos e devem ser mantidos. Os caminhos de código citados nas tasks são relativos à raiz do repositório.

O checkout encontrado na elaboração foi `C:\Users\eargemon\source\repos\escalalivre`, na branch `fix/minimum-lunch-and-inline-role-edit`, cujo conteúdo correspondia à main consultada, commit `2a322b0`. Isso é uma referência histórica: confira o estado atual antes de começar. Não presuma que uma funcionalidade continua ausente.

Leia o `AGENTS.md` aplicável e os documentos relevantes: `docs/architecture.md`, `docs/architecture-improvement-plan.md`, `docs/rule-parity.md` e `docs/testing.md`. Inspecione apenas o necessário à task selecionada. Preserve mudanças preexistentes e não troque de branch, descarte arquivos, publique ou faça push apenas por causa deste plano. Uma restrição real de escrita deve ser reportada; não simule que a implementação foi gravada no repositório.

## Ordem e controle persistente

Status permitidos: PENDENTE, EM ANDAMENTO, BLOQUEADA, CONCLUÍDA. Marque CONCLUÍDA somente com implementação e aceite sustentados por evidências. Conclusão local não significa integração ou CI aprovada.

| Ordem | Task | Status | Evidência / revisão |
| --- | --- | --- | --- |
| 01 | [Cadastro simples e rápido](01-cadastro-simples.md) | CONCLUÍDA | 28 testes, lint/build, fluxo Edge, XLSX; manifesto task-01-fontes.sha256 |
| 02 | [Preservação do histórico](02-preservacao-historico.md) | CONCLUÍDA | ADR 024; 32 puros, 14 adaptador, 44 frontend, HTTP, 196 paridade/fuso, Edge |
| 03 | [Cobertura confiável por função](03-cobertura-funcoes.md) | CONCLUÍDA | ADR 025; 81 puros, 11 adaptador, HTTP, 205 paridade, Edge |
| 04 | [Edição direta e desfazer](04-editor-turnos-desfazer.md) | CONCLUÍDA | editor direto, 4 testes/2 fusos, 40 relacionados, lint/build, Edge |
| 05 | [Fixação e geração preservando ajustes](05-fixar-e-regenerar.md) | CONCLUÍDA | ADR 026; pins/recorte, proposta, solver/HTTP, Edge, undo |
| 06 | [Ausências e substituições](06-ausencias-substituicoes.md) | CONCLUÍDA | ADR 027; 40 puros, 24 adaptador, paridade/2 fusos, HTTP, Edge |
| 07 | [Cópia de semana e troca de turnos](07-reutilizacao-trocas.md) | CONCLUÍDA | cópia civil/DST, colisões, troca atômica; 6 testes/fuso, Edge |
| 08 | [Resumo operacional com ações](08-resumo-operacional.md) | CONCLUÍDA | categorias/ações, 35 testes, lint/build, teclado/foco Edge |
| 09 | [Fechamento e divulgação](09-fechamento-divulgacao.md) | CONCLUÍDA | [ADR 028](../../decisions/028-publication-snapshots.md), snapshots/exportação/limites, cenário final e [validação geral](VALIDACAO-FINAL.md) |

Dependência linear: cada task depende das anteriores. Uma entrega não pode declarar como pronto um recurso reservado a outra task. Se um pré-requisito pequeno for indispensável, implemente o mínimo, registre-o e mantenha a divisão de escopo.

## Princípios obrigatórios

- Manter experiência local, sem login obrigatório, banco de dados ou persistência de servidor.
- Preservar o arquivo `.escalalivre`; novos campos persistidos precisam de contrato, limites, migração idempotente e round-trip.
- Regras canônicas em Domain C#; Application orquestra; Infrastructure adapta o solver/exportadores; API trata transporte; frontend mantém políticas puras separadas de React/Zustand.
- Alterações intencionais de regra devem atualizar `docs/rule-parity.md` e cenários compartilhados. Não remover testes antigos para esconder regressões: ajustar expectativas apenas com decisão explícita.
- Preservar tempo civil, segundos, turnos noturnos, histórico em ambos os lados do período e semana domingo–sábado.
- Documentos com conflitos de negócio continuam recuperáveis e editáveis; estrutura inválida é tratada separadamente.
- Operações em lote são atômicas; prévias não alteram o documento; confirmação obsoleta exige nova avaliação.
- Evitar abstrações genéricas, bibliotecas novas e refatorações fora do escopo sem necessidade demonstrada.

## Validação econômica — não testar tudo repetidamente

Esta orientação expressa a preferência do usuário para esta execução: validar o impacto de cada task, sem rodar a matriz inteira a cada ajuste. A CI completa exigida pelo repositório permanece como gate de integração.

1. Não rode a suíte completa como ritual de início. Leia as evidências existentes e identifique as áreas alteradas.
2. Para bug ou mudança de regra, crie primeiro um cenário representativo que caracterize o comportamento anterior. Para mudanças simples de apresentação, use inspeção e verificação do fluxo; não escreva testes que apenas espelham JSX.
3. Durante o desenvolvimento, rode o teste específico afetado. Depois de corrigir uma falha, repita o caso que falhou e o grupo diretamente impactado.
4. Ao finalizar a task, execute uma vez os grupos pertinentes, lint/build das partes alteradas e um fluxo funcional representativo. Se já passaram no mesmo estado de código, reutilize o resultado.
5. Mudanças de regras C#/TS exigem paridade focada; datas/horários exigem também os casos relevantes em outro fuso. Mudanças no solver exigem adaptador real; DTO/transporte/worker exigem integração pertinente. Não execute HTTP ou solver por mudanças exclusivamente visuais.
6. Registre comando, resultado, data, commit e/ou hash do diff dos fontes relevantes, além das limitações. Mudanças posteriores invalidam apenas verificações cujo escopo foi afetado. Alterar somente estes registros não invalida builds/testes de código.
7. Antes de integrar, executar a CI completa uma vez para a revisão exata. Se essa revisão já possui CI aprovada, não repetir a mesma matriz local integral apenas para duplicar evidência. Se não houver integração, registrar CI pendente sem apresentá-la como aprovada.
8. Benchmarks, testes de carga e reinstalação de dependências só se houver motivo concreto ligado à mudança. Não executar builds/testes pesados concorrentes com solver, HTTP ou medições.

Descubra os comandos atuais em `docs/testing.md` e nos manifests; não use contagens históricas de testes como meta. Use `dotnet test --filter` e arquivos específicos do runner Node quando adequados. Use `--no-build` apenas se os binários correspondem comprovadamente aos fontes atuais.

## Roteiro de execução contínua

1. Ler o controle e selecionar a primeira task não concluída; trabalhar somente nela até seu aceite.
2. Verificar checkout/diff e ler as instruções aplicáveis.
3. Marcar EM ANDAMENTO nos dois arquivos; inspecionar os componentes e contratos relevantes.
4. Implementar em incrementos, mantendo o estado anterior recuperável.
5. Conferir todos os critérios de aceite e executar a validação econômica.
6. Atualizar a seção de execução da task e esta tabela com evidências e limitações.
7. Informar o progresso brevemente e retornar ao passo 1, iniciando automaticamente a próxima task na mesma execução.
8. Depois da task 09, apresentar o resultado geral e encerrar. Se houver bloqueio antes disso, registrar o ponto de retomada e explicar a informação, acesso ou decisão indispensável.

Se todas estiverem concluídas, informar isso; não criar nova task automaticamente. A última task inclui o cenário final de ponta a ponta, sem reexecutar manualmente toda a história do projeto.

## Cenário final de aceite

Cadastrar uma loja e equipe; gerar uma semana; editar e fixar combinados; registrar ausência; substituir uma pessoa; copiar para a semana seguinte; fechar e exportar uma versão. Conferir preservação do histórico, dos ajustes e da versão divulgada. Usar equipe fictícia pequena e reproduzível.

## Registro da última execução

- Task: 01–09 CONCLUÍDAS LOCALMENTE. Nenhuma task pendente.
- Estado dos fontes verificado: baseline 18fc7f4, branch preservada; [manifesto final](task-09-fontes.sha256) cobre todos os fontes novos/modificados.
- Validação realizada: [relatório consolidado](VALIDACAO-FINAL.md); matriz local completa e rechecagens focadas aprovadas por escopo, paridade 216/2 fusos, cenário final e PDF/PNG/XLSX conferidos. CI remota e integração pendentes; sem commit/push.
- Próxima: nenhuma; plano encerrado localmente em 11/11/2026.
