import { getWorkflowStatusPresentation } from '../utils/status'
export function StatusBadge({ status, label }: { status?: string | null; label?: string | null }) { const p = getWorkflowStatusPresentation(status, label); return <span className={`status-badge ${p.category}`}><span className="status-dot">{p.icon}</span>{p.label}</span> }
