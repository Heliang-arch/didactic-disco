const API_BASE = '';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error || '请求失败');
  }
  return data.data;
}

export const api = {
  // 煤种字典
  getCoalKinds: () => request<any[]>('/api/coal-kinds'),
  getCoalKindsTree: () => request<any[]>('/api/coal-kinds/tree'),
  createCoalKind: (data: any) => request('/api/coal-kinds', { method: 'POST', body: JSON.stringify(data) }),
  updateCoalKind: (id: number, data: any) => request(`/api/coal-kinds/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCoalKind: (id: number) => request(`/api/coal-kinds/${id}`, { method: 'DELETE' }),

  // 煤名→煤种映射
  getCoalToKinds: () => request<any[]>('/api/coal-to-kinds'),
  createCoalToKind: (data: any) => request('/api/coal-to-kinds', { method: 'POST', body: JSON.stringify(data) }),
  updateCoalToKind: (id: number, data: any) => request(`/api/coal-to-kinds/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCoalToKind: (id: number) => request(`/api/coal-to-kinds/${id}`, { method: 'DELETE' }),

  // 配比管理
  getYcpbList: (page = 1, pageSize = 20) => request<any>(`/api/ycpb?page=${page}&pageSize=${pageSize}`),
  getYcpb: (id: number) => request<any>(`/api/ycpb/${id}`),
  createYcpb: (data: any) => request<any>('/api/ycpb', { method: 'POST', body: JSON.stringify(data) }),
  updateYcpb: (id: number, data: any) => request(`/api/ycpb/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteYcpb: (id: number) => request(`/api/ycpb/${id}`, { method: 'DELETE' }),

  // 预测
  predict: (data: any) => request<any>('/api/ycpb/predict', { method: 'POST', body: JSON.stringify(data) }),
  optimize: (data: any) => request<any>('/api/ycpb/optimize', { method: 'POST', body: JSON.stringify(data) }),

  // 合同指标
  getContracts: (params?: any) => {
    const q = new URLSearchParams(params).toString();
    return request<any[]>(`/api/contracts${q ? '?' + q : ''}`);
  },
  createContract: (data: any) => request<any>('/api/contracts', { method: 'POST', body: JSON.stringify(data) }),
  deleteContract: (id: number) => request(`/api/contracts/${id}`, { method: 'DELETE' }),

  // 库存
  getCoalStocks: (params?: any) => {
    const q = new URLSearchParams(params).toString();
    return request<any[]>(`/api/coal-stocks${q ? '?' + q : ''}`);
  },
  createCoalStock: (data: any) => request('/api/coal-stocks', { method: 'POST', body: JSON.stringify(data) }),
  deleteCoalStock: (id: number) => request(`/api/coal-stocks/${id}`, { method: 'DELETE' }),

  // 煤价格
  getCoalPrices: (params?: any) => {
    const q = new URLSearchParams(params).toString();
    return request<any[]>(`/api/coal-prices${q ? '?' + q : ''}`);
  },
  createCoalPrice: (data: any) => request('/api/coal-prices', { method: 'POST', body: JSON.stringify(data) }),
  deleteCoalPrice: (id: number) => request(`/api/coal-prices/${id}`, { method: 'DELETE' }),

  // 化产品价格
  getChemPrices: () => request<any[]>('/api/chem-prices'),
  createChemPrice: (data: any) => request('/api/chem-prices', { method: 'POST', body: JSON.stringify(data) }),
  deleteChemPrice: (id: number) => request(`/api/chem-prices/${id}`, { method: 'DELETE' }),

  // 仪表盘
  getDashboard: () => request<any>('/api/dashboard'),

  // === 库存分析 ===
  getInventoryBoard: () => request<any>('/api/inventory-analysis/board'),
  getInventoryAlerts: () => request<any>('/api/inventory-analysis/alerts'),
  getInventoryDepletion: () => request<any>('/api/inventory-analysis/depletion'),
  getInventoryStructureTrend: () => request<any>('/api/inventory-analysis/structure-trend'),
  getQualityRisk: () => request<any>('/api/inventory-analysis/quality-risk'),

  // === 供应分析 ===
  getSupplyReliability: () => request<any[]>('/api/supply-analysis/reliability'),
  getSupplyTrend: (coalName: string) => request<any>(`/api/supply-analysis/trend/${encodeURIComponent(coalName)}`),
  getSupplyFrequency: () => request<any[]>('/api/supply-analysis/frequency'),

  // === 成本优化 ===
  getComprehensiveCost: () => request<any>('/api/cost-optimization/comprehensive'),
  optimizeByCost: (data: any) => request<any>('/api/cost-optimization/optimize', { method: 'POST', body: JSON.stringify(data) }),
  calcSensitivity: (data: any) => request<any>('/api/cost-optimization/sensitivity', { method: 'POST', body: JSON.stringify(data) }),

  // === 需求预测 ===
  getDemandForecast: () => request<any[]>('/api/demand-forecast'),
  getDemandForecastByCoal: (coalName: string) => request<any>(`/api/demand-forecast/${encodeURIComponent(coalName)}`),
  getDemandForecastSummary: () => request<any[]>('/api/demand-forecast/summary'),

  // === 发运记录 ===
  getShipments: (params?: any) => {
    const q = new URLSearchParams(params).toString();
    return request<any[]>(`/api/shipments${q ? '?' + q : ''}`);
  },
  createShipment: (data: any) => request('/api/shipments', { method: 'POST', body: JSON.stringify(data) }),
  deleteShipment: (id: number) => request(`/api/shipments/${id}`, { method: 'DELETE' }),

  // === 初始库存 ===
  getInitialStocks: () => request<any[]>('/api/initial-stocks'),
  createInitialStock: (data: any) => request('/api/initial-stocks', { method: 'POST', body: JSON.stringify(data) }),

  // === 持有成本参数 ===
  getHoldingCostParams: () => request<any>('/api/holding-cost-params'),
  updateHoldingCostParams: (data: any) => request('/api/holding-cost-params', { method: 'POST', body: JSON.stringify(data) }),
};
