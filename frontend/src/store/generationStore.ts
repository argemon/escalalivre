import { create } from "zustand";
import { cancelQueuedSolve, solveQueued, type JobProgress } from "../lib/queuedSolve";
import { generationProposal } from "../lib/generationProposal";
import { periodError, type PlanningPeriod } from "../lib/planningPeriod";
import type { EscalaLivreDocument, ScheduleResult } from "../types/schedule";
import { useScheduleStore } from "./scheduleStore";
type Proposal={submitted:EscalaLivreDocument;result:ScheduleResult;range:PlanningPeriod;preview:ReturnType<typeof generationProposal>};
type GenerationState = {active:boolean;cancelling:boolean;progress?:JobProgress;updatedAt:number;message?:string;proposal?:Proposal;start:(range?:PlanningPeriod)=>Promise<void>;cancel:()=>Promise<void>;confirmProposal:()=>void;rejectProposal:()=>void};
export const useGenerationStore=create<GenerationState>((set,get)=>({
 active:false,cancelling:false,updatedAt:0,
 start:async selectedRange=>{
  if(get().active)return;
  const submitted=useScheduleStore.getState().document,range=selectedRange??submitted.planningPeriod;
  set({active:true,cancelling:false,progress:undefined,message:undefined,proposal:undefined,updatedAt:Date.now()});useScheduleStore.getState().setSolverStatus("calculating");
  try{
   const invalid=periodError(range);if(invalid||range.start<submitted.planningPeriod.start||range.end>submitted.planningPeriod.end)throw new Error(invalid??"O recorte precisa estar dentro do período selecionado.");
   const calculation={...submitted,planningPeriod:range};
   const result=await solveQueued(calculation,progress=>set(progress.reconnecting?{progress}:{progress,updatedAt:Date.now()}));
   const current=useScheduleStore.getState();
   if(!result||current.document!==submitted){if(current.document===submitted)current.setSolverStatus("idle");set({message:result?"O planejamento mudou durante a espera. Gere novamente para usar os dados atuais.":"Geração cancelada. Seus turnos foram mantidos."});return;}
   const preview=generationProposal(submitted,result,range);current.setSolverStatus("idle");set({proposal:{submitted,result,range,preview},message:"Proposta pronta. Confira antes de aplicar; seus turnos ainda não foram alterados."});
  }catch(e){if(useScheduleStore.getState().document===submitted)useScheduleStore.getState().setSolverStatus("invalid");set({message:e instanceof Error?e.message:"Não foi possível gerar a escala."});}
  finally{set({active:false,cancelling:false});}
 },
 confirmProposal:()=>{const proposal=get().proposal;if(!proposal)return;const current=useScheduleStore.getState();if(current.document!==proposal.submitted){set({proposal:undefined,message:"O planejamento mudou. Gere uma nova proposta."});return;}try{generationProposal(current.document,proposal.result,proposal.range);current.applyGeneratedSchedule(proposal.submitted,proposal.result,proposal.range);if(useScheduleStore.getState().document===proposal.submitted){set({message:"A cópia recuperável não pôde ser criada. Resolva a recuperação e tente aplicar novamente."});return;}set({proposal:undefined,message:"Proposta aplicada. Você pode desfazer a operação."});}catch(e){set({message:e instanceof Error?e.message:"Não foi possível aplicar a proposta."});}},
 rejectProposal:()=>set({proposal:undefined,message:"Proposta descartada. O planejamento foi mantido."}),
 cancel:async()=>{const id=get().progress?.id;if(!id||!get().active||get().cancelling)return;set({cancelling:true,message:undefined});try{await cancelQueuedSolve(id);}catch{if(get().active)set({cancelling:false,message:"Não foi possível confirmar o cancelamento. Estamos acompanhando seu pedido; tente cancelar novamente."});}}
}));
