# Validação final das nove tasks operacionais

Data: 11/11/2026. Resultado: **01–09 CONCLUÍDAS LOCALMENTE**. Nenhuma task pendente. CI remota e integração ainda pendentes.

Checkout preservado: branch fix/minimum-lunch-and-inline-role-edit, HEAD 18fc7f479fde4f52b1ffa89a1816b814c9f37179. Sem commit, push, publicação ou troca de branch. O diff inicial continha apenas a pasta de instruções docs/tasks/. Alterações e evidências por task constam dos dez Markdown do executor.

## Revisão verificável

[Manifesto final de fontes](task-09-fontes.sha256): 133 arquivos novos/modificados de backend, frontend, shared e tools; SHA-256 do manifesto: 0b8d81f065138b6d363fd1a897ae4d1eaad63afc25013ffd445372d28b010e63. Inclui fontes/testes de todas as tasks, não apenas da 09. Os manifestos 01–08 registram seus estados incrementais anteriores. [Manifesto de evidências](evidencias-final.sha256) identifica logs e arquivos desta execução.

Revisão de fontes: preservação de histórico/segundos, campos opcionais e migrações, alocação exclusiva e grupo explícito, fixados/proposta, ausência e substituição, cópia/troca, resumo/ações e arquivo imutável de versões. Decisões de regra em ADR 024–028, cenários compartilhados e docs/rule-parity.md. Os 58 hashes originais não foram regravados; a única mudança intencional de cobertura histórica está isolada com asserções independentes no ADR 024/teste correspondente.

## Matriz local e rechecagens econômicas

Ambiente Windows, Node v24.17.0, .NET 10, Edge headless para os fluxos. A matriz completa foi executada uma vez; os logs originais, inclusive falhas, foram preservados. Após corrigir expectativas antigas e completar a revisão de fechamento, repetiram-se somente os grupos afetados. Portanto este relatório não afirma que houve uma segunda execução integral toda verde, nem que o workflow GitHub/Ubuntu foi aprovado.

| Grupo | Evidência e resultado final por escopo |
| --- | --- |
| Frontend lint/build | npm run lint --prefix frontend e npm run build --prefix frontend aprovados nos fontes finais; logs frontend-lint-final.log/frontend-build-final.log. |
| Solução .NET | dotnet build EscalaLivre.slnx -c Release --no-restore aprovado após ajustes finais, zero erros/avisos. |
| Domain/Application | Execução integral: 346 aprovados. Fechamento ampliado/rechecado depois: PublicationTests, 5 aprovados, incluindo novo caso compartilhado de preferências e limite de 48h. Inventário final coberto: 347. |
| Adaptadores reais | 462 aprovados na execução integral, OR-Tools e exportadores incluídos. Nenhuma mudança posterior em solver/exportadores. |
| API e arquitetura | 33 + 13 aprovados integralmente; 13 de arquitetura também rechecados após fechamento. |
| Frontend UTC/NY | 673 casos por fuso na matriz inicial: 671 aprovados e duas expectativas antigas falharam. Os grupos architecture/planning-insights passaram depois (19 por fuso). Publications passou nos fontes finais (10 por fuso, incluindo um caso novo). Inventário final coberto: 674 casos por fuso. |
| HTTP/fila/worker | 33 cenários exercitados: 31 passaram integralmente; dois testes antigos foram corrigidos e rechecados com sucesso (edição de função e histórico sobreposto). |
| Paridade C#/TS | 216 cenários em UTC e 216 em America/New_York aprovados, com imutabilidade, migração idempotente, turnos completos e substituição bilateral. Os nove casos específicos de decisão/preferências de fechamento também são compartilhados e testados em C#/TS. |
| Navegador | Fluxos de cada task registrados no seu MD; cenário final e exportação extensa descritos abaixo. |

No inventário final, 855 casos .NET e 674 frontend por fuso estão cobertos pela execução integral mais rechecagens pertinentes; esses números não são alegação de uma execução integral posterior às correções.

### Falhas encontradas e resolvidas

1. architecture.test.cjs ainda exigia dez políticas: inventário atualizado para doze (employment/absence), mantendo o scanner de dependências proibidas sobre todos os módulos.
2. planning-insights ainda aceitava geração sem status: agora verifica rejeição sem aplicar nem inventar status viável; respostas feasible/optimal continuam verificadas.
3. O fluxo HTTP antigo esperava que mudar cadastro reescrevesse turnos: agora confere preservação exata, diagnóstico de divergência após reload e mudança somente na regeneração explícita, conforme ADR 024.
4. O histórico HTTP comparava ausência e null de campos opcionais novos como diferentes: normaliza apenas pinned ausente/null para false e employeeIds ausente/null para null. Fixação verdadeira, listas exclusivas e todos os demais campos continuam comparados exatamente.

Logs locais: C:/Users/eargemon/Documents/operation-final-evidence/validation. summary.json conserva o resultado inicial; frontend-contract-recheck-UTC/NY.log, publication-recheck-UTC/NY.log, publication-dotnet-final.log, http-contract-recheck.log e http-history-recheck.log contêm as rechecagens. O primeiro recheck HTTP passou edição e revelou a diferença opcional de coverage; o último aprovou o histórico restante. Não há falha de teste pendente.

Comandos reproduzíveis principais: dotnet test backend/EscalaLivre.{Analysis,Adapter,Api,Architecture}.Tests/EscalaLivre.{Analysis,Adapter,Api,Architecture}.Tests.csproj -c Release (cada projeto separadamente); node --test frontend/tests/*.test.cjs com TZ=UTC e America/New_York; SECURITY_BUILD_CONFIGURATION=Release node backend/security.integration.cjs; node tools/parity-differential.cjs --output DIRETORIO nos dois fusos. Rechecagens usaram --filter FullyQualifiedName~PublicationTests e --test-name-pattern nos casos HTTP identificados. --no-build só foi usado após build atual correspondente.

## Cenário final de aceite

Loja fictícia Ipê criada a partir de documento vazio, cadastro inicial e geração de 01–07/11 pelo serviço/worker real. A proposta ótima foi aplicada pelo store de produção. Um turno teve saída ajustada em um segundo e foi fixado; outra pessoa foi cadastrada, uma ausência médica sem crédito foi registrada e um turno foi substituído atomicamente. A cópia para 08–14/11 criou novos IDs sem fixação implícita, mantendo todos os turnos anteriores e o fixado integralmente.

A interface Edge reconheceu a lacuna residual e fechou a versão 1. Baixou PDF equipe, PDF pessoa, XLSX e PNG em ZIP. Alterar o período/desfazer e recarregar o navegador não alterou a versão. Exportação/importação HTTP do arquivo nativo preservou exatamente o snapshot. Tags internas e categoria médica não foram copiadas para o snapshot nem para as saídas. O teste integra regras/store de produção, HTTP/worker e interface de fechamento/download; não afirma que repetiu manualmente os cadastros/edições já conferidos na UI das tasks anteriores.

Script local: C:/Users/eargemon/Documents/task9-final-browser.cjs. Artefatos fictícios em C:/Users/eargemon/Documents/operation-final-evidence: aceite.escalalivre, escala-v1.pdf, escala-v1-pessoa.pdf, escala-v1.xlsx, escala-v1.zip e fechamento.png. Scripts de navegador usam runtime Playwright local de verificação, sem dependência nova no produto.

## Conferência visual e de conteúdo

PDF e PNG do cenário pequeno foram renderizados/inspecionados; texto, horários com segundos, período, versão, nomes e legenda legíveis, sem sobreposição. Teste adicional retirou todos os cadastros do rascunho e exportou somente o snapshot com 60 turnos noturnos, pausas com segundos e nomes/funções longos: **15 páginas PDF, 15 PNGs 1000×1600 e 60 linhas de turno no XLSX**. Primeira e última página/imagem inspecionadas, inclusive cabeçalhos repetidos. Nenhuma imagem gigante; saída em ZIP com CRC íntegro.

pypdf conferiu datas/pausas e texto do PDF; XML do XLSX conferiu todos os horários/pausas, nomes e 65 linhas totais, sem elementos de fórmula; os testes de adaptador incluem nome iniciado por =HYPERLINK. Snapshot/saídas não contêm PRIVATE nem medical. Artefatos extensa.pdf/extensa.xlsx/extensa.zip e pagination-qa.json; scripts locais task9-pagination-browser.cjs e task9-artifact-qa.py. Poppler foi usado para renderização e inspeção visual, com a habilidade PDF.

## Limitações e integração

- Conclusão local. CI remota da revisão exata e revisão/integração continuam como gate antes de merge; nada foi enviado ao GitHub.
- PDF/XLSX requerem serviço de exportação disponível; PNG/nativo funcionam no dispositivo. Sem envio automático para terceiros.
- Arquivo de versões é imutável nas operações normais, sem assinatura/proteção contra edição externa. Até 10 versões, 1.000 turnos/200 pessoas por versão, 256 KiB individual/512 KiB total e limite nativo de 1 MiB. Ao exceder, reduzir período ou arquivar/exportar e iniciar outro documento, sem poda silenciosa.
- Permanecem as limitações explicitadas por task: importação limitada e validada; grupo único ativo de acumulação; busca local não exaustiva de substituição/alocação; troca exige participantes sem conflitos obrigatórios. Não há promessa de eliminar toda lacuna automaticamente.
- Build frontend conserva avisos não bloqueantes do Zod/Rollup e tamanho do bundle. Não são falhas de compilação ou testes.

Nenhum bloqueio de implementação restante. Próxima task: nenhuma.


## Ajuste solicitado após o aceite — exibição dos horários

Removida a identificação de localização dos horários em todas as saídas visíveis PDF, PNG e XLSX, incluindo cabeçalhos e legenda. A data/hora de fechamento exibida na interface e nas saídas passa a usar a apresentação do relógio do dispositivo, sem nome de localização. Novos documentos já obtêm a configuração do dispositivo automaticamente. Os horários salvos e os snapshots não são reescritos por esta alteração de apresentação. Metadados técnicos do arquivo e fixtures históricas de teste permanecem internos, sem impressão nas saídas.

Verificação: lint/build frontend e build API aprovados; cinco testes de PDF/exportação e dez de publicação aprovados. Edge gerou PDF/PNG/XLSX com 60 turnos e dispositivo simulado em outra configuração: a hora exibida correspondeu ao dispositivo. Texto de todas as páginas PDF e XML do XLSX sem identificadores de localização; PNG/PDF renderizados e inspecionados visualmente. Mantidos 15 páginas PDF/15 imagens e todos os horários/pausas com segundos. Evidências em C:/Users/eargemon/Documents/operation-time-display-evidence; scripts time-display-browser.cjs/time-display-qa.py em Documents. [Manifesto incremental](ajuste-exibicao-horarios.sha256) identifica os quatro fontes deste ajuste; o manifesto anterior é o registro histórico do aceite inicial. CI remota permanece pendente.
