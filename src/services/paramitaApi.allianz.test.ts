import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDashboard, getMovementByCaseId, filterMovementOrders } from './paramitaApi'
import type { MovementTracking } from '../types/movement'
import { isHumanAttention, isOperationalAttention } from '../utils/operationalMetrics'
import { getDisplayCaseId } from '../utils/movementPresentation'
import { getWorkflowStatusLabel, getWorkflowStatusPresentation } from '../utils/workflowPresentation'

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
})
