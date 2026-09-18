import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Sidebar } from './components/Sidebar'
import { Icon } from './components/Icons'
import { MetricCard } from './components/MetricCard'
import { Filters } from './components/Filters'
import { Distribution } from './components/Distribution'
import { AttentionSummary } from './components/AttentionSummary'
import { Activity } from './components/Activity'
import { MovementTable } from './components/MovementTable'
import { MovementDrawer } from './components/MovementDrawer'
import { getDashboard, getMovementByCaseId, getMovements } from './services/paramitaApi'
import type { DashboardResponse, MovementFilters, MovementTracking } from './types/movement'
import './styles.css'
import './chart.css'

const pageContent: Record<string, { title: string; description: string }> = { Dashboard: { title: 'Seguimiento de movimientos', description: 'Consulta el estado y evolución de las OT procesadas por Paramita.' }, Movimientos: { title: 'Movimientos', description: 'Consulta y seguimiento de todas las OT procesadas por Paramita.' }, 'Requieren atención': { title: 'Requieren atención', description: 'Casos que necesitan intervención del equipo operativo.' }, 'Procesados en GNP': { title: 'Procesados en GNP', description: 'OT enviadas a GNP, completadas o rechazadas.' } }
const clock = (value: Date) => value.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
function App() {
  const queryClient = useQueryClient()
  const [sidebarOpen, setSidebarOpen] = useState(false), [active, setActive] = useState('Dashboard'), [filters, setFilters] = useState<MovementFilters>({ page: 1, pageSize: 6 }), [selected, setSelected] = useState<MovementTracking | null>(null)
  const dashboardQuery = useQuery({ queryKey: ['paramita-dashboard'], queryFn: getDashboard })
  const orderQuery = useQuery({ queryKey: ['paramita-order', selected?.caseId], queryFn: () => getMovementByCaseId(selected!.caseId), enabled: Boolean(selected?.caseId) })
  const dashboard = dashboardQuery.data
  const data = dashboard?.summary
  const filtered = useMemo(() => dashboard ? getMovements(filters, dashboard) : { items: [], total: 0 }, [dashboard, filters])
  const content = pageContent[active], isDashboard = active === 'Dashboard'
  const lastUpdate = dashboardQuery.dataUpdatedAt ? new Date(dashboardQuery.dataUpdatedAt) : null
  const updateFilters = (next: MovementFilters) => setFilters(next)
  const clearFilters = () => setFilters({ page: 1, pageSize: 6 })
  const applyNavigation = (item: string) => { setActive(item); setFilters(item === 'Requieren atención' ? { ...filters, status: '', attention: true, gnpOnly: false, page: 1 } : item === 'Procesados en GNP' ? { ...filters, status: '', attention: false, gnpOnly: true, page: 1 } : { ...filters, status: '', attention: false, gnpOnly: false, page: 1 }) }
  const metric = (key: string) => setFilters(key === 'total' ? { ...filters, status: '', attention: false, gnpOnly: false, page: 1 } : key === 'attention' ? { ...filters, attention: true, status: '', gnpOnly: false, page: 1 } : { ...filters, status: key, attention: false, gnpOnly: false, page: 1 })
  const openCase = (selection: string | MovementTracking) => { const caseId = typeof selection === 'string' ? selection : selection.caseId; const preview = dashboard?.orders.find(order => order.caseId === caseId); if (preview) setSelected(preview); else setSelected({ caseId, movementLabel: '—', stageLabel: '—', statusLabel: '—', dashboardStatus: 'pending', operationalStatus: { code: '', label: '—', description: '—', requiresHumanAction: false } }); void queryClient.prefetchQuery({ queryKey: ['paramita-order', caseId], queryFn: () => getMovementByCaseId(caseId), staleTime: 10 * 60 * 1000 }) }
  const refresh = async () => { await dashboardQuery.refetch(); if (selected?.caseId) await queryClient.refetchQueries({ queryKey: ['paramita-order', selected.caseId] }) }
  const displayOrder = orderQuery.data?.order ?? selected
  const errorMessage = dashboardQuery.isError ? 'No se pudo obtener la actualización más reciente. Se muestran los últimos datos disponibles.' : orderQuery.isError ? 'No se pudo obtener la actualización más reciente del detalle. Se muestran los últimos datos disponibles.' : ''
  const dashboardOverview = data && <><section className="metrics-grid"><MetricCard title="Total de OT" value={data.total} description="Casos registrados" icon="list" tone="navy" onClick={() => metric('total')} /><MetricCard title="Pendientes" value={data.pending} description="OT pendientes" icon="attention" tone="orange" onClick={() => metric('processing')} /><MetricCard title="En proceso" value={data.inProgress} description="OT en proceso" icon="gnp" tone="cyan" onClick={() => metric('gnpInProgress')} /><MetricCard title="Completadas" value={data.completed} description="Finalizadas" icon="grid" tone="green" onClick={() => metric('completed')} /><MetricCard title="Rechazadas / incidencias" value={data.rejected} description="Requieren seguimiento" icon="attention" tone="red" onClick={() => metric('rejected')} /></section><AttentionSummary summary={data} orders={dashboard?.orders ?? []} /><div className="two-column"><Distribution stages={dashboard?.stageDistribution ?? []} total={data.total} /><Activity items={dashboard?.recentActivity ?? []} orders={dashboard?.orders ?? []} onSelect={openCase} /></div></>
  return <div className="app-shell"><Sidebar active={active} onNavigate={applyNavigation} open={sidebarOpen} onClose={() => setSidebarOpen(value => !value)} /><main className="main-content"><header className="topbar"><div className="breadcrumb">Paramita <span>/</span> <b>{active}</b></div><div className="topbar-right"><span className="connection"><i /> Datos en vivo</span><div className="avatar">OP</div></div></header><div className="content"><div className="page-heading"><div><span className="eyebrow">CENTRO DE OPERACIONES</span><h1>{content.title}</h1><p>{content.description}</p></div><div className="refresh-area"><button className="refresh-button" onClick={() => void refresh()} disabled={dashboardQuery.isFetching}><Icon name="refresh" size={17} /> {dashboardQuery.isFetching ? 'Actualizando...' : 'Actualizar'}</button><span className="refresh-meta">Última actualización: {lastUpdate ? clock(lastUpdate) : '—'}</span></div></div>{errorMessage && <div className="error-banner">{errorMessage} <button onClick={() => void refresh()}>Reintentar</button></div>}{dashboardQuery.isPending && !dashboard ? <section className="panel initial-loading"><div className="loading-copy">Cargando información de Paramita…</div></section> : <>{isDashboard && dashboardOverview}<section className="panel movements-panel"><div className="panel-heading"><div><h2>{isDashboard ? 'Movimientos' : content.title}</h2><p>{isDashboard ? 'Consulta y seguimiento de todas las OT procesadas' : content.description}</p></div></div><Filters filters={filters} onChange={updateFilters} onClear={clearFilters} /><MovementTable items={filtered.items} loading={dashboardQuery.isPending && !dashboard} onSelect={openCase} total={filtered.total} page={filters.page ?? 1} pageSize={filters.pageSize ?? 6} onPage={page => updateFilters({ ...filters, page })} /></section></>}</div></main><MovementDrawer movement={displayOrder} loading={orderQuery.isFetching} onClose={() => setSelected(null)} /></div>
}
export default App
