export type WorkflowCategory = 'all' | 'processing' | 'readyForGnp' | 'gnpInProgress' | 'attention' | 'completed' | 'rejected'
export const workflowCategoryOptions: { value: WorkflowCategory; label: string; description: string }[] = [
  { value: 'all', label: 'Todos los estados', description: 'Muestra todas las OT, sin importar su estado técnico.' },
  { value: 'processing', label: 'Recibidas / en procesamiento', description: 'OT recibidas o todavía procesándose internamente.' },
  { value: 'readyForGnp', label: 'Listas para envío a GNP', description: 'Casos validados y preparados para envío al portal.' },
  { value: 'gnpInProgress', label: 'En proceso en GNP', description: 'Movimientos ya enviados y actualmente en seguimiento.' },
  { value: 'attention', label: 'Requieren atención', description: 'Casos con información faltante, revisión requerida o error técnico.' },
  { value: 'completed', label: 'Completadas', description: 'Movimientos finalizados correctamente.' },
  { value: 'rejected', label: 'Rechazadas', description: 'Movimientos rechazados o cancelados.' },
]
const categoryStatuses: Record<Exclude<WorkflowCategory, 'all'>, string[]> = {
  processing: ['RECEIVED', 'PROCESSING', 'READY_FOR_REPROCESSING'], readyForGnp: ['READY_FOR_GNP'], gnpInProgress: ['QUEUED_FOR_GNP', 'GNP_SUBMITTING', 'GNP_IN_PROGRESS'], attention: ['WAITING_FOR_INFORMATION', 'REQUIRES_REVIEW', 'FAILED_TECHNICAL', 'GNP_RETRY_SCHEDULED', 'SUPPORT_REVIEW_REQUIRED'], completed: ['GNP_COMPLETED'], rejected: ['GNP_REJECTED']
}
export function matchesWorkflowCategory(workflowStatus: string | null | undefined, category?: string) { if (!category || category === 'all') return true; return category in categoryStatuses ? categoryStatuses[category as Exclude<WorkflowCategory, 'all'>].includes(workflowStatus ?? '') : true }
