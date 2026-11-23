import type { Checkpoint, MovementTracking } from '../types/movement'

type CaseReference = Pick<MovementTracking, 'caseId' | 'displayCaseId'>

export const getDisplayCaseId = (movement: CaseReference) => movement.displayCaseId || movement.caseId || '—'
export const isAllianz = (movement: Pick<MovementTracking, 'insuranceCompany'>) => movement.insuranceCompany?.toUpperCase() === 'ALLIANZ'
export const isAllianzDraftPrepared = (movement: Pick<MovementTracking, 'insuranceCompany' | 'workflowStatus'>) => isAllianz(movement) && movement.workflowStatus === 'DRAFT_PREPARED'
export const hasHumanReviewCondition = (movement: Pick<MovementTracking, 'reviewRequired' | 'supportReviewRequired' | 'workflowStatus'>) => movement.reviewRequired === true || movement.supportReviewRequired === true || movement.workflowStatus === 'REQUIRES_REVIEW' || movement.workflowStatus === 'SUPPORT_REVIEW_REQUIRED'
export const getStoredFilesIndicator = (movement: MovementTracking) => {
  const documentCount = getAllianzDocumentRows(movement).filter(document => document.status !== 'Pendiente').length
  if (documentCount) return `${documentCount} archivo${documentCount === 1 ? '' : 's'} almacenado${documentCount === 1 ? '' : 's'}`
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

const allianzDocumentNames: Record<string, string> = {
  ENDOSO_ALTA: 'Endoso de Alta',
  ENDOSO_BAJA: 'Endoso de Baja',
  REGISTRO_ASEGURADO: 'Registro de Asegurados',
}

const normalizedAllianzMovement = (movementType?: string | null) => movementType?.trim().toUpperCase()

const getAllianzDocumentMovement = (movement: MovementTracking) => {
  const runs = movement.allianz?.documentRuns ?? []
  return normalizedAllianzMovement(movement.movementType)
    ?? runs.map(run => normalizedAllianzMovement(run.movementType)).find(type => type === 'ALTA' || type === 'BAJA')
}

const requiredAllianzDocuments = (movement: MovementTracking) => {
  const movementType = getAllianzDocumentMovement(movement)
  if (movementType === 'BAJA') return ['ENDOSO_BAJA', 'REGISTRO_ASEGURADO']
  if (movementType === 'ALTA') return ['ENDOSO_ALTA', 'REGISTRO_ASEGURADO']

  // API responses predating movementType keep the established ALTA view.
  return ['ENDOSO_ALTA', 'REGISTRO_ASEGURADO']
}

const documentDownloadStatus = (identityValidation?: string | null) => {
  const identity = identityValidation?.trim().toUpperCase()
  if (!identity || identity === 'VERIFIED') return 'Descargado'
  return 'Descargado; pendiente de revisión documental'
}

export const getAllianzDocumentRows = (movement: MovementTracking) => {
  const notices = movement.allianzDocumentNotices ?? movement.allianz?.documentNotices ?? []
  const welcomeNotice = notices.find(notice => notice.stored === true && /carta[ _-]*bienvenida/i.test(notice.document?.filename ?? ''))
  const requiredDocuments = requiredAllianzDocuments(movement)
  const movementType = getAllianzDocumentMovement(movement)
  const completedRuns = (movement.allianz?.documentRuns ?? [])
    .filter(run => run.technicalStorageStatus === 'COMPLETED' && Boolean(run.noticeReceivedAt))
    .sort((left, right) => (right.completedAt ?? '').localeCompare(left.completedAt ?? ''))
  const documentStatus = (documentType: string) => {
    const run = completedRuns.find(candidate =>
      (!movementType || !candidate.movementType || normalizedAllianzMovement(candidate.movementType) === movementType)
      &&
      (!candidate.requiredDocuments?.length || candidate.requiredDocuments.includes(documentType))
      && candidate.documents?.[documentType]?.stored === true
      && candidate.documents?.[documentType]?.validated === true,
    )
    return run ? documentDownloadStatus(run.identityValidation) : 'Pendiente'
  }
  return [
    { name: 'Carta_Bienvenida.pdf', status: welcomeNotice ? 'Recibida y almacenada' : 'Pendiente' },
    ...requiredDocuments.map(documentType => ({ name: allianzDocumentNames[documentType] ?? documentType, status: documentStatus(documentType) })),
  ]
}
