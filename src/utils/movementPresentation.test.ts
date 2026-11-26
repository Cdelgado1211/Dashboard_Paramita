import { describe, expect, it } from 'vitest'
import { getMovementLabel } from './movementPresentation'

describe('getMovementLabel', () => {
  it('identifica una carta de antigüedad por el tipo de movimiento de negocio', () => {
    expect(getMovementLabel({ movementLabel: 'Modificación de asegurado', businessMovementType: 'RECOGNIZE_SENIORITY' })).toBe('Carta de antigüedad')
  })

  it('conserva una modificación convencional', () => {
    expect(getMovementLabel({ movementLabel: 'Modificación de asegurado', businessMovementType: 'MODIFY_INSURED' })).toBe('Modificación de asegurado')
  })

  it('no convierte altas de asegurado', () => {
    expect(getMovementLabel({ movementLabel: 'Alta de asegurado', businessMovementType: 'ADD_INSURED' })).toBe('Alta de asegurado')
  })

  it('conserva la etiqueta histórica para valores desconocidos', () => {
    expect(getMovementLabel({ movementLabel: 'Baja de asegurado', businessMovementType: 'UNKNOWN' })).toBe('Baja de asegurado')
  })

  it.each([undefined, null, ''])('conserva la etiqueta histórica sin businessMovementType (%s)', businessMovementType => {
    expect(getMovementLabel({ movementLabel: 'Modificación de asegurado', businessMovementType })).toBe('Modificación de asegurado')
  })
})
