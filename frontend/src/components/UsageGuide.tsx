import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { Button, IconButton } from "./ui";

const steps = [
  { title: "Configure a empresa", description: "Na lateral Configure sua escala, comece pela etapa Empresa. Clique em Configurar empresa e informe o nome, os dias e horários de funcionamento, a jornada e os intervalos." },
  { title: "Cadastre as funções", description: "Na etapa Funções, adicione os cargos da sua operação, como Vendedor, Caixa ou Segurança. Eles serão usados na cobertura e no cadastro da equipe." },
  { title: "Defina a cobertura", description: "Na etapa Cobertura, informe quantas pessoas de cada função são necessárias em cada dia e faixa de horário." },
  { title: "Adicione a equipe", description: "Na etapa Equipe, cadastre as pessoas, suas funções, jornadas e disponibilidades ou restrições individuais." },
  { title: "Escolha o período", description: "No cabeçalho, ajuste Início e Fim (inclusive) e clique em Aplicar período para definir as datas do planejamento." },
  { title: "Gere a escala", description: "Abra o Assistente de escala ou a etapa Revisar e gerar. Confira as informações e clique em Gerar escala. A geração precisa da API disponível; as prévias mostradas antes dela são apenas estimativas." },
  { title: "Revise o resultado", description: "Confira os conflitos, os intervalos e os horários em que faltam pessoas. Use as visualizações diária, semanal e mensal para revisar os turnos. Uma escala gerada pode ainda deixar demanda descoberta." },
  { title: "Guarde e compartilhe", description: "O planejamento fica neste dispositivo. Em Dados e opções → Exportar, baixe seu arquivo .escalalivre para guardar uma cópia ou abrir em outro computador com Importar. Use Imprimir para preparar a escala para o mural." },
];

export function UsageGuide({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="usage-guide-title"
      onClose={onClose}
      className="m-auto max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-xl overflow-auto rounded-2xl border border-border bg-card p-5 text-foreground shadow-xl backdrop:bg-black/60 sm:p-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="usage-guide-title" className="text-xl font-semibold">Como usar o EscalaLivre</h2>
          <p className="mt-1 text-sm text-muted-foreground">Da configuração à sua primeira escala, siga estes passos.</p>
        </div>
        <IconButton autoFocus title="Fechar guia" onClick={onClose}><X className="size-4" aria-hidden="true" /></IconButton>
      </div>
      <ol className="my-5 space-y-4">
        {steps.map((step, index) => (
          <li key={step.title} className="flex gap-3">
            <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{index + 1}</span>
            <div>
              <h3 className="text-sm font-semibold">{step.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.description}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="flex justify-end"><Button onClick={onClose}>Entendi</Button></div>
    </dialog>
  );
}
