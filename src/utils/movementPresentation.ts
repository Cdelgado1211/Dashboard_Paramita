import type { MovementTracking } from '../types/movement'

type CaseReference = Pick<MovementTracking, 'caseId' | 'displayCaseId'>

export const getDisplayCaseId = (movement: CaseReference) => movement.displayCaseId || movement.caseId || '—'
export const isAllianz = (movement: Pick<MovementTracking, 'insuranceCompany'>) => movement.insuranceCompany?.toUpperCase() === 'ALLIANZ'
export const isAllianzDraftPrepared = (movement: Pick<MovementTracking, 'insuranceCompany' | 'workflowStatus'>) => isAllianz(movement) && movement.workflowStatus === 'DRAFT_PREPARED'
export const hasHumanReviewCondition = (movement: Pick<MovementTracking, 'reviewRequired' | 'supportReviewRequired' | 'workflowStatus'>) => movement.reviewRequired === true || movement.supportReviewRequired === true || movement.workflowStatus === 'REQUIRES_REVIEW' || movement.workflowStatus === 'SUPPORT_REVIEW_REQUIRED'
export const getStoredFilesIndicator = (movement: MovementTracking) => {
  const storedFiles = movement.allianz?.storedFiles ?? movement.allianz?.filesStored ?? movement.storedFiles
  if (typeof storedFiles === 'number') return storedFiles > 0 ? `${storedFiles} archivo${storedFiles === 1 ? '' : 's'} almacenado${storedFiles === 1 ? '' : 's'}` : 'Sin archivos almacenados'
  if (Array.isArray(storedFiles)) return storedFiles.length ? `${storedFiles.length} archivo${storedFiles.length === 1 ? '' : 's'} almacenado${storedFiles.length === 1 ? '' : 's'}` : 'Sin archivos almacenados'
  if (storedFiles && typeof storedFiles === 'object') return 'Archivos almacenados'
  if (storedFiles === true) return 'Archivos almacenados'
  if (movement.allianz?.documentCount) return `${movement.allianz.documentCount} archivo${movement.allianz.documentCount === 1 ? '' : 's'} almacenado${movement.allianz.documentCount === 1 ? '' : 's'}`
  return 'Sin archivos almacenados'
}
