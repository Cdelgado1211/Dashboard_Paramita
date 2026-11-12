import type { DashboardResponse, InsuranceCompany, MovementFilters, MovementResponse, MovementTracking } from '../types/movement'
import { isOperationalAttention } from '../utils/operationalMetrics'
import { matchesWorkflowCategory } from '../utils/workflowCategories'
import { requestJson } from './apiClient'

async function request<T>(path: string): Promise<T> { return requestJson<T>(path) }
const insuranceCompanyQuery = (insuranceCompany: InsuranceCompany = 'ALL') => `?insuranceCompany=${encodeURIComponent(insuranceCompany)}`
export function getDashboard(insuranceCompany: InsuranceCompany = 'ALL'): Promise<DashboardResponse> { return request<DashboardResponse>(`/dashboard${insuranceCompanyQuery(insuranceCompany)}`) }
export function filterMovementOrders(orders: MovementTracking[], filters: MovementFilters): MovementTracking[] { const search = filters.search?.toLowerCase().trim(); return orders.filter(order => matchesWorkflowCategory(order.workflowStatus, filters.status) && (!filters.product || order.product === filters.product) && (!filters.attention || isOperationalAttention(order)) && (!filters.gnpOnly || Boolean(order.gnp?.trackingOt)) && (!search || [order.caseId, order.displayCaseId, order.policy, order.gnp?.trackingOt].some(value => value?.toLowerCase().includes(search))) && (!filters.from || (order.updatedAt ?? order.createdAt ?? '') >= filters.from) && (!filters.to || (order.updatedAt ?? order.createdAt ?? '') <= `${filters.to}T23:59:59`)) }
export function getMovements(filters: MovementFilters = {}, dashboard: DashboardResponse): MovementResponse { const orders = filterMovementOrders(dashboard.orders ?? [], filters); const page = filters.page ?? 1; const size = filters.pageSize ?? 6; return { items: orders.slice((page - 1) * size, page * size), total: orders.length } }
export function getMovementByCaseId(caseId: string, insuranceCompany: InsuranceCompany = 'ALL'): Promise<{ order: MovementTracking }> { return request<{ order: MovementTracking }>(`/orders/${encodeURIComponent(caseId)}${insuranceCompanyQuery(insuranceCompany)}`) }
