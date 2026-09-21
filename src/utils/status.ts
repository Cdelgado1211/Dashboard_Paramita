export { getWorkflowStatusPresentation, getWorkflowStatusCategory, dashboardStatusToCategory, getWorkflowStatusLabel, getWorkflowStageLabel, workflowStatusLabels, workflowStageLabels } from './workflowPresentation'
export type { StatusCategory, StatusPresentation } from './workflowPresentation'
export const translateReason = (code?: string) => code ? code.replaceAll('_', ' ').toLowerCase().replace(/^./, c => c.toUpperCase()) : '—'
