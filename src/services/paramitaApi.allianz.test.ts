import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDashboard, getMovementByCaseId, filterMovementOrders } from './paramitaApi'
import type { MovementTracking } from '../types/movement'
import { isHumanAttention, isOperationalAttention } from '../utils/operationalMetrics'
import { getAllianzDocumentRows, getAllianzTimeline, getDisplayCaseId } from '../utils/movementPresentation'
import { getWorkflowStageLabel, getWorkflowStatusLabel, getWorkflowStatusPresentation } from '../utils/workflowPresentation'

const jsonResponse = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
const allianzDraft = (overrides: Partial<MovementTracking> = {}): MovementTracking => ({
  caseId: 'ALLIANZ#OT-0000099001',
  displayCaseId: '0000099001',
  insuranceCompany: 'ALLIANZ',
  movementLabel: 'Endoso',
  stageLabel: 'Borrador',
  statusLabel: 'Borrador Allianz preparado',
  workflowStatus: 'DRAFT_PREPARED',
  dashboardStatus: 'inProgress',
  operationalStatus: { code: 'DRAFT_PREPARED', label: 'Borrador preparado', description: 'Listo para Allianz.', requiresHumanAction: true },
  updatedAt: '2020-01-01T00:00:00.000Z',
  ...overrides,
})

beforeEach(() => {
  vi.restoreAllMocks()
  vi.stubEnv('VITE_API_URL', 'https://qa-api.example.com')
  vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: () => undefined, removeItem: () => undefined })
  vi.stubGlobal('window', { dispatchEvent: vi.fn() })
})

describe('Allianz phase 1 API compatibility', () => {
  it('sends the selected insurer to dashboard and encodes an Allianz case ID for detail', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ orders: [] })))
    vi.stubGlobal('fetch', fetchMock)

    await getDashboard('ALLIANZ')
    await getMovementByCaseId('ALLIANZ#OT-0000099001', 'ALLIANZ')

    expect(fetchMock.mock.calls[0][0]).toBe('https://qa-api.example.com/dashboard?insuranceCompany=ALLIANZ')
    expect(fetchMock.mock.calls[1][0]).toBe('https://qa-api.example.com/orders/ALLIANZ%23OT-0000099001?insuranceCompany=ALLIANZ')
  })

  it('uses displayCaseId for presentation and for dashboard searching without changing the internal case ID', () => {
    const order = allianzDraft()
    expect(getDisplayCaseId(order)).toBe('0000099001')
    expect(filterMovementOrders([order], { search: '0000099001' })).toEqual([order])
    expect(order.caseId).toBe('ALLIANZ#OT-0000099001')
  })

  it('does not flag an Allianz prepared draft as operational attention without a review condition', () => {
    const order = allianzDraft()
    expect(isHumanAttention(order)).toBe(false)
    expect(isOperationalAttention(order)).toBe(false)
    expect(filterMovementOrders([order], { attention: true })).toEqual([])
  })

  it('keeps real Allianz review conditions visible as attention', () => {
    const order = allianzDraft({ reviewRequired: true })
    expect(isHumanAttention(order)).toBe(true)
    expect(isOperationalAttention(order)).toBe(true)
    expect(filterMovementOrders([order], { attention: true })).toEqual([order])
  })

  it('presents Allianz draft workflow states with their QA labels', () => {
    expect(getWorkflowStatusLabel('DRAFT_PREPARED')).toBe('Borrador Allianz preparado')
    expect(getWorkflowStatusLabel('ALLIANZ_DRAFT')).toBe('Preparación de borrador Allianz')
    expect(getWorkflowStatusPresentation('DRAFT_PREPARED').category).toBe('info')
  })

  it('maps the four persisted Allianz reply events in chronological order without inventing timestamps', () => {
    const order = allianzDraft({ workflowStage: 'ALLIANZ_TRACKING', allianzReplyEvents: [
      { status: 'NOTICE_RECEIVED', receivedAt: '2026-11-17T00:29:22Z', ticket: '9999007' },
      { status: 'TICKET_ASSIGNED', receivedAt: '2026-11-16T19:59:33Z', ticket: '9999007' },
      { status: 'TICKET_CONFIRMATION', receivedAt: '2026-11-16T21:31:22Z', ticket: '9999007' },
      { status: 'MOVEMENT_ATTENDED', receivedAt: '2026-11-16T21:58:18Z', ticket: '9999007' },
    ] })
    expect(getAllianzTimeline(order)?.map(event => [event.label, event.timestamp])).toEqual([
      ['Ticket asignado', '2026-11-16T19:59:33Z'],
      ['Solicitud registrada', '2026-11-16T21:31:22Z'],
      ['Movimiento atendido', '2026-11-16T21:58:18Z'],
      ['Aviso de emisión recibido', '2026-11-17T00:29:22Z'],
    ])
    expect(getWorkflowStageLabel('ALLIANZ_TRACKING')).toBe('Seguimiento Allianz')
  })

  it('also accepts the sanitized allianz.timeline shape delivered by the consolidated Dashboard API', () => {
    const order = allianzDraft({ allianz: { ticket: '9999007', timeline: [{ status: 'TICKET_ASSIGNED', receivedAt: '2026-11-16T19:59:33Z', ticket: '9999007' }] } })
    expect(getAllianzTimeline(order)?.map(event => event.label)).toEqual(['Ticket asignado'])
  })

  it('keeps NOTICE_RECEIVED documentary work pending and exposes no download URL', () => {
    const order = allianzDraft({ allianzDocumentNotices: [{ status: 'DOCUMENT_NOTICE_RECEIVED', receivedAt: '2026-11-17T00:29:22Z', stored: true, documentDownloaded: false, documentValidated: false, document: { filename: 'Carta_Bienvenida.pdf' } }] })
    expect(getAllianzDocumentRows(order)).toEqual([
      { name: 'Carta_Bienvenida.pdf', status: 'Recibida y almacenada' },
      { name: 'Endoso de Alta', status: 'Pendiente' },
      { name: 'Registro de Asegurados', status: 'Pendiente' },
    ])
  })

  it('accepts sanitized document notices when the API nests them in the Allianz summary', () => {
    const order = allianzDraft({ allianz: { documentNotices: [{ stored: true, document: { filename: 'Carta_Bienvenida.pdf' } }] } })
    expect(getAllianzDocumentRows(order)[0]).toEqual({ name: 'Carta_Bienvenida.pdf', status: 'Recibida y almacenada' })
  })

  it('renders no invented Allianz events when the API has none and leaves GNP checkpoints untouched', () => {
    expect(getAllianzTimeline(allianzDraft({ allianzReplyEvents: [] }))).toEqual([])
    expect(getAllianzTimeline({ ...allianzDraft(), insuranceCompany: 'GNP' })).toBeUndefined()
  })

  it('does not confuse Allianz tracking or earlier statuses with an issuance notice', () => {
    expect(getWorkflowStageLabel('ALLIANZ_TRACKING')).toBe('Seguimiento Allianz')
    expect(getWorkflowStatusLabel('TICKET_ASSIGNED')).toBe('Ticket asignado')
    expect(getWorkflowStatusLabel('MOVEMENT_ATTENDED')).toBe('Movimiento atendido')
    expect(getWorkflowStatusLabel('TICKET_ASSIGNED')).not.toBe('Aviso de emisión recibido')
    expect(getWorkflowStatusLabel('MOVEMENT_ATTENDED')).not.toBe('Aviso de emisión recibido')
  })

  it('shows structurally checked stored PDFs as downloaded but pending documentary review', () => {
    const order = allianzDraft({ allianz: { documentNotices: [{ stored: true, document: { filename: 'Carta_Bienvenida (1).pdf' } }], documentRuns: [{ noticeReceivedAt: '2026-11-20T21:57:01Z', technicalStorageStatus: 'COMPLETED', identityValidation: 'STRUCTURAL_ONLY', completedAt: '2026-11-20T22:10:43Z', documents: { ENDOSO_ALTA: { stored: true, validated: true }, REGISTRO_ASEGURADO: { stored: true, validated: true } } }] } })
    expect(getAllianzDocumentRows(order)).toEqual([
      { name: 'Carta_Bienvenida.pdf', status: 'Recibida y almacenada' },
      { name: 'Endoso de Alta', status: 'Descargado; pendiente de revisión documental' },
      { name: 'Registro de Asegurados', status: 'Descargado; pendiente de revisión documental' },
    ])
  })

  it('keeps partial downloads and unrelated or failed attempts pending', () => {
    const order = allianzDraft({ allianz: { documentRuns: [
      { noticeReceivedAt: null, technicalStorageStatus: 'COMPLETED', identityValidation: 'STRUCTURAL_ONLY', documents: { ENDOSO_ALTA: { stored: true, validated: true } } },
      { noticeReceivedAt: '2026-11-20T21:57:01Z', technicalStorageStatus: 'FAILED', identityValidation: 'STRUCTURAL_ONLY', documents: { REGISTRO_ASEGURADO: { stored: true, validated: true } } },
      { noticeReceivedAt: '2026-11-20T21:57:01Z', technicalStorageStatus: 'COMPLETED', identityValidation: 'STRUCTURAL_ONLY', completedAt: '2026-11-20T22:10:43Z', documents: { ENDOSO_ALTA: { stored: true, validated: true } } },
    ] } })
    expect(getAllianzDocumentRows(order).slice(1)).toEqual([
      { name: 'Endoso de Alta', status: 'Descargado; pendiente de revisión documental' },
      { name: 'Registro de Asegurados', status: 'Pendiente' },
    ])
  })
})
