import type { Checkpoint, MovementTracking } from '../types/movement'

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

const allianzEventLabels: Record<string, string> = { TICKET_ASSIGNED: 'Ticket asignado', TICKET_CONFIRMATION: 'Solicitud registrada', MOVEMENT_ATTENDED: 'Movimiento atendido', NOTICE_RECEIVED: 'Aviso de emisión recibido' }
export const getAllianzStatusLabel = (status?: string | null) => allianzEventLabels[status?.toUpperCase() ?? ''] ?? status ?? '—'
export const getAllianzTimeline = (movement: MovementTracking): Checkpoint[] | undefined => {
  if (!isAllianz(movement)) return undefined
  return (movement.allianzReplyEvents ?? movement.allianz?.timeline ?? []).flatMap((event, index) => {
    const status = event.status?.toUpperCase() ?? ''
    const label = getAllianzStatusLabel(status)
    const timestamp = event.receivedAt ?? event.timestamp
    return allianzEventLabels[status] && timestamp ? [{ type: status, label, stageLabel: '', status: 'completed' as const, timestamp, description: event.ticket ? `Ticket Allianz ${event.ticket}` : null, reasonCodes: [], gnpTrackingOt: null, stage: null, index }] : []
  }).sort((a, b) => (a.timestamp ?? '').localeCompare(b.timestamp ?? '')).map(({ index: _index, ...checkpoint }) => checkpoint)
}

export const getAllianzDocumentRows = (movement: MovementTracking) => {
  const notices = movement.allianzDocumentNotices ?? movement.allianz?.documentNotices ?? []
  const welcomeNotice = notices.find(notice => notice.document?.filename === 'Carta_Bienvenida.pdf')
  return [
    { name: 'Carta_Bienvenida.pdf', status: welcomeNotice ? 'Recibida y almacenada' : 'Pendiente' },
    { name: 'Endoso de Alta', status: 'Pendiente' },
    { name: 'Registro de Asegurados', status: 'Pendiente' },
  ]
}
