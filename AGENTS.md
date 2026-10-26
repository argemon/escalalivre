# Instruções de desenvolvimento — EscalaLivre

## Escopo e referências

Estas instruções se aplicam ao repositório inteiro. Antes de alterar regras ou arquitetura, consulte [arquitetura](docs/architecture.md), [plano de evolução](docs/architecture-improvement-plan.md) e [contrato de paridade](docs/rule-parity.md). O plano descreve o destino; não pressuponha que suas etapas já estejam implementadas.

## Limites entre camadas

- Domain contém conceitos, invariantes e políticas de negócio puros. Não depende de Application, HTTP, DI, persistência, serialização ou OR-Tools.
- Application orquestra casos de uso, converte contratos de entrada/saída e declara portas para serviços externos. Depende de Domain, sem depender de Infrastructure ou API.
- Infrastructure implementa portas e traduz decisões de domínio para OR-Tools, arquivos e exportadores. Não cria versões próprias das regras de negócio.
- API trata transporte, proteção HTTP, fila/worker e composição das dependências. Endpoints não decidem regras de escala. O isolamento de processos existente deve ser preservado.
- Frontend mantém apresentação, estado e diagnóstico local separados. Componentes e ações de Zustand não devem acumular cálculos de negócio já existentes em `src/lib`.
- Preserve a experiência local-first e a portabilidade do arquivo `.escalalivre`.

## SOLID aplicado

- **SRP:** separe diagnóstico, cobertura, sugestões, geração de candidatos, construção do modelo, execução e montagem da resposta por motivo de mudança. Extrair métodos sem separar essas responsabilidades não conclui a refatoração.
- **OCP:** acrescente regimes e famílias de restrições por implementações registradas na composição, evitando novos condicionais espalhados. Não crie um framework de plugins sem necessidade demonstrada.
- **LSP:** implementações de uma mesma porta devem cumprir as mesmas pré/pós-condições, códigos de falha e semântica de cancelamento quando aplicável. Regimes podem ter regras distintas, mas devem respeitar o contrato comum documentado.
- **ISP:** consumidores de análise/validação não devem depender da capacidade de otimizar. Prefira portas pequenas por capacidade, sem criar interfaces para toda classe ou função pura.
- **DIP:** a aplicação depende de portas; Infrastructure fornece implementações. Instanciação das estratégias concretas pertence à composição, não à fábrica de domínio nem ao caso de uso.

## DDD e invariantes

- Modele conceitos com comportamento quando houver invariantes reais: período civil, janela temporal, pausa e configuração de regime são candidatos. Use nomes da linguagem do negócio e unidades explícitas.
- Distingua contratos de arquivo/API de objetos de domínio. Introduza mapeadores progressivamente; não quebre o JSON para acomodar uma refatoração interna.
- Objetos de valor protegem sua validade estrutural na construção. Entidades/agregados controlam mudanças por operações explícitas e protegem suas coleções; `IReadOnlyList` sobre uma lista mutável não garante imutabilidade.
- Defina agregados pelo limite de consistência necessário à operação, documentando identidade e invariantes. Não transforme automaticamente o documento inteiro em um agregado gigante nem adicione repositórios sem persistência que os exija.
- Separe validade estrutural de conformidade da escala. Um turno estruturalmente válido pode violar descanso, disponibilidade ou jornada e precisa continuar carregável/editável com seus diagnósticos. Não impeça a recuperação de documentos apenas por conflitos de negócio.
- Mudanças cadastrais e de configuração preservam horários existentes. A atualização explícita de função já prevista no contrato de edição deve ser mantida. Migrações são identificadas e idempotentes.

## Consistência das regras

- Cada regra tem uma política canônica no domínio C#. Pré-validação, diagnóstico e tradução para restrições consomem a mesma semântica, incluindo limites, unidades e histórico.
- C# e TypeScript continuam implementações distintas; mantenha paridade verificável por cenários em `shared/`, sem prometer compartilhamento binário da regra.
- Diferencie invariantes estruturais, restrições obrigatórias, preferências e limites operacionais do gerador. Preferências alteram a função objetivo; não invalidam documentos.
- Preserve tempo civil da empresa, precisão de segundos, semana domingo–sábado, turnos noturnos, histórico nos dois lados do período, pausas sem cobertura e substituição direcional de funções conforme os contratos existentes.
- Não normalize ou corrija silenciosamente início, fim ou pausa para ocultar conflitos. Falha, cancelamento ou limite do gerador preserva o documento anterior.
- Qualquer correção intencional de comportamento exige cenário que reproduza o problema, decisão documentada em `docs/rule-parity.md` e atualização equivalente nas implementações afetadas.

## Testes e entrega

- Faça mudanças incrementais por responsabilidade, com comportamento caracterizado antes da extração. Não misture refatoração e alteração de regra no mesmo passo.
- Teste domínio e análise sem carregar OR-Tools, HTTP ou worker. Teste o adaptador real e a integração HTTP separadamente.
- Verifique contratos dos regimes, fronteiras temporais, paridade frontend/backend e preservação de dados. Não compare exatamente escalas ótimas alternativas; verifique restrições, objetivo e estado do resultado.
- Use a matriz de validação do plano. Mudanças de documentação exigem revisão de conteúdo, links e diff; mudanças de código exigem as verificações relevantes e a CI completa antes da integração.
- Registre por entrega o problema, comportamento preservado/alterado, verificações executadas e limitações. Não declare ganhos de desempenho nem notas de qualidade sem medição.
