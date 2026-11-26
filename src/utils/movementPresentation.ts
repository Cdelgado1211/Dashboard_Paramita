type MovementPresentation = {
  businessMovementType?: string | null
  movementLabel: string
}

export function getMovementLabel({ businessMovementType, movementLabel }: MovementPresentation): string {
  return businessMovementType === 'RECOGNIZE_SENIORITY' ? 'Carta de antigüedad' : movementLabel
}
