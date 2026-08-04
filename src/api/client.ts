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
};