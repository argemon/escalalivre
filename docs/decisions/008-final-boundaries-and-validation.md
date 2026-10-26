# ADR 008 — Consolidação de fronteiras e validação

Data: 26/10/2026. Estado: implementada e validada localmente; CI remota e calibração de desempenho representativo pendentes.

## Decisão

Os consumidores remanescentes da fachada eram testes. Antes de removê-la, foram migrados para GenerateSchedule/AnalyzeSchedule/ValidateSchedule reais e passaram nos mesmos 581 casos. Os helpers de composição de testes só constroem essas capacidades; não reintroduzem uma interface combinada. Foram então removidos IScheduleSolver, OrToolsScheduleSolver e LegacySolverComposition e os fontes/projeto mistos antigos, preservados em cópia de evidência de migração fora do checkout.

Separação: Analysis.Tests referencia somente Application; Adapter.Tests referencia Infrastructure e não API; Api.Tests cobre composição/fila; Architecture.Tests verifica todos os projetos por metadados/fontes; HTTP permanece execução Node independente. A CI reflete essas fronteiras e mantém um gate agregado backend, sem publicar nada.

Modelos/variáveis/termos/resultados de OR-Tools passam a membros internos de Infrastructure. Testes recebem acesso interno somente onde necessário; a API consegue registrar os componentes sem conhecer tipos nativos. O scanner inspeciona superfície exportada, inclusive genéricos aninhados, arrays/ref, interfaces/base, eventos, atributos e constraints, e tem exemplos negativos. Referências de projeto/assembly e imports das camadas internas são protegidos separadamente.

Helpers temporários de ScheduleRules/LaborRules/ScheduleWindow e reexports TS foram retirados depois de migrar consumidores às políticas. Construção de pausa usa VariableLimits, e filtros usam DailyLimit/Measure e EndOn canônicos. As operações continuam com os mesmos resultados observáveis: hashes/documentos/contratos, casos de geração, recuperação e formatos permanecem verificados. Projeções de leitura em ScheduleModels são mantidas por finalidade; não são agregados protegidos nem uma promessa de substituição total dos primitivos por objetos de valor.

## Validação e risco operacional herdado

A sonda do teste de fila que antes exigia solve frio em menos de 1s agora confirma recuperação por análise simples com o mesmo orçamento, um slot e fila zero. Os trabalhos concorrentes continuam sendo solve reais e devem retornar busy/limite/timeout. Geração/recuperação/cancelamento nativos continuam nos demais testes. Ajuste de contrato de teste separado da refatoração; nenhum prazo/limite de produção foi ampliado. As falhas históricas e o baseline anterior continuam nos relatórios, sem atribuição causal não medida.

Benchmark é uma reprodução retrospectiva do HEAD original e do snapshot final no mesmo ambiente. Mede duas entradas pequenas, cinco pares de processos, uma primeira chamada e uma chamada medida, ordem alternada, instrumentação simétrica de modelo. Não é medição histórica de 23/10 nem teste de carga. Envelopes min/mediana/máximo são alertas empíricos, sem percentual arbitrário ou gate de performance universal. Custos/formatos de modelo podem variar com a correção D1 e a admissão adicional.

## Aceite e consequências

Código/fachadas/contratos/testes locais atendidos; CI configurada não significa CI executada. Não marcar aceite integral enquanto o checkout final não passar em Ubuntu/Node 22. Também não afirmar ganho global, limites representativos ou qualidade numérica a partir desta amostra. Integração e publicação não foram realizadas. Histórico/arquivo não requerem migração nova nem rollback de dados.

Critérios por etapa e dimensão, falhas corrigidas e evidências: [relatório final](stage-6-final-review.md). Metodologia/dados: [medição](stage-6-performance.md).
