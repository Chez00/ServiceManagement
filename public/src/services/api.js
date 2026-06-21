const baseUrl = '/api'
let token = localStorage.getItem('token')

export const api = {
  setToken(newToken) {
    token = newToken
    if (newToken) {
      localStorage.setItem('token', newToken)
    } else {
      localStorage.removeItem('token')
    }
  },

  getHeaders() {
    const headers = { 'Content-Type': 'application/json' }
    // Всегда проверяем актуальный токен
    const currentToken = token || localStorage.getItem('token')
    if (currentToken) {
      headers['Authorization'] = `Bearer ${currentToken}`
    }
    return headers
  },

  async request(endpoint, options = {}) {
    try {
      const url = `${baseUrl}${endpoint}`
      const config = {
        ...options,
        headers: {
          ...this.getHeaders(),
          ...options.headers
        }
      }

      console.log(`API Request: ${url}`, {
        hasAuth: !!config.headers['Authorization'],
        method: options.method || 'GET'
      })

      const response = await fetch(url, config)
      
      console.log(`API Response: ${url}`, {
        status: response.status,
        ok: response.ok
      })

      // Обработка 401
      if (response.status === 401) {
        console.warn('401 Unauthorized - attempting token refresh')
        
        // Пробуем обновить токен
        const refreshed = await this.refreshToken()
        if (refreshed) {
          console.log('Token refreshed, retrying request')
          // Повторяем запрос с новым токеном
          const retryConfig = {
            ...options,
            headers: {
              ...this.getHeaders(),
              ...options.headers
            }
          }
          const retryResponse = await fetch(url, retryConfig)
          
          if (retryResponse.ok) {
            const contentType = retryResponse.headers.get('content-type')
            if (contentType && contentType.includes('application/json')) {
              return await retryResponse.json()
            }
            return await retryResponse.text()
          }
        }
        
        // Если не удалось обновить - разлогиниваем
        console.warn('Token refresh failed, redirecting to login')
        this.clearAuth()
        window.location.hash = '#login'
        throw new Error('Сессия истекла. Пожалуйста, войдите снова.')
      }

      // Обработка ответа
      let data
      const contentType = response.headers.get('content-type')
      if (contentType && contentType.includes('application/json')) {
        data = await response.json()
      } else {
        data = await response.text()
      }

      if (!response.ok) {
        throw new Error(data.message || `Ошибка ${response.status}`)
      }

      return data
    } catch (error) {
      console.error('API request failed:', error.message)
      throw error
    }
  },

  async refreshToken() {
    const refreshToken = localStorage.getItem('refreshToken')
    if (!refreshToken) {
      console.warn('No refresh token found')
      return false
    }

    try {
      console.log('Attempting to refresh token...')
      const response = await fetch(`${baseUrl}/auth/refresh-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      })

      if (response.ok) {
        const data = await response.json()
        if (data.status === 'success' && data.data) {
          this.setToken(data.data.token)
          if (data.data.refreshToken) {
            localStorage.setItem('refreshToken', data.data.refreshToken)
          }
          console.log('Token refreshed successfully')
          return true
        }
      }
      
      console.warn('Token refresh failed:', response.status)
    } catch (error) {
      console.error('Token refresh error:', error)
    }
    
    return false
  },

  clearAuth() {
    token = null
    localStorage.removeItem('token')
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('user')
  },

  // Auth
  async login(email, password) {
    console.log('Login attempt:', { email })
    
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    })
    
    if (data.status === 'success' && data.data) {
      console.log('Login success, setting tokens')
      this.setToken(data.data.token)
      localStorage.setItem('refreshToken', data.data.refreshToken)
      localStorage.setItem('user', JSON.stringify(data.data.user))
    }
    
    return data
  },

  async logout() {
    try {
      await this.request('/auth/logout', { method: 'POST' })
    } catch (error) {}
    this.clearAuth()
  },

  async register(data) {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data)
    })
  },

  // Work Orders
  async getWorkOrders(params = {}) {
    const query = new URLSearchParams()
    Object.keys(params).forEach(key => {
      if (params[key]) query.append(key, params[key])
    })
    const qs = query.toString()
    return this.request(`/work-orders${qs ? '?' + qs : ''}`)
  },

  async getWorkOrder(id) {
    return this.request(`/work-orders/${id}`)
  },

  async createWorkOrder(data) {
    return this.request('/work-orders', {
      method: 'POST',
      body: JSON.stringify(data)
    })
  },

  async updateWorkOrder(id, data) {
    return this.request(`/work-orders/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    })
  },

  async deleteWorkOrder(id) {
    return this.request(`/work-orders/${id}`, { method: 'DELETE' })
  },

  // Assets
  async getAssets() {
    return this.request('/assets')
  },

  async getAsset(id) {
    return this.request(`/assets/${id}`)
  },

  async createAsset(data) {
    return this.request('/assets', {
      method: 'POST',
      body: JSON.stringify(data)
    })
  },

  async updateAsset(id, data) {
    return this.request(`/assets/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    })
  },

  async deleteAsset(id) {
    return this.request(`/assets/${id}`, { method: 'DELETE' })
  },

  // Crews
  async getCrews() {
    return this.request('/crews')
  },

  async getCrew(id) {
    return this.request(`/crews/${id}`)
  },

  // Добавлен метод getCrewById для совместимости
  async getCrewById(id) {
    return this.request(`/crews/${id}`)
  },

  async createCrew(data) {
    return this.request('/crews', {
      method: 'POST',
      body: JSON.stringify(data)
    })
  },

  // Добавлен метод updateCrew
  async updateCrew(id, data) {
    return this.request(`/crews/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    })
  },

  async deleteCrew(id) {
    return this.request(`/crews/${id}`, { method: 'DELETE' })
  },

  // Добавлены методы для управления монтажниками в бригаде
  async addInstallerToCrew(crewId, installerId) {
    return this.request(`/crews/${crewId}/installers`, {
      method: 'POST',
      body: JSON.stringify({ installerId })
    })
  },

  async removeInstallerFromCrew(crewId, installerId) {
    return this.request(`/crews/${crewId}/installers/${installerId}`, {
      method: 'DELETE'
    })
  },

  // Users
  async getUsers() {
    return this.request('/users')
  },

  async getUser(id) {
    return this.request(`/users/${id}`)
  },

  async updateUser(id, data) {
    return this.request(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    })
  },

  async deleteUser(id) {
    return this.request(`/users/${id}`, { method: 'DELETE' })
  },

  async makeForeman(userId) {
    return this.request(`/users/${userId}/make-foreman`, { method: 'POST' })
  },

  async makeInstaller(userId) {
    return this.request(`/users/${userId}/make-installer`, { method: 'POST' })
  },

  async removeForeman(userId) {
    return this.request(`/users/${userId}/remove-foreman`, { method: 'DELETE' })
  },

  async removeInstaller(userId) {
    return this.request(`/users/${userId}/remove-installer`, { method: 'DELETE' })
  },

  async getForemen() {
    return this.request('/users/foremen')
  },

  async getInstallers() {
    return this.request('/users/installers')
  },

  async getPerformers() {
    return this.request('/users/performers')
  },

  // Reports
  async getWorkOrdersReport(params = {}) {
    const query = new URLSearchParams(params).toString()
    return this.request(`/reports/work-orders${query ? '?' + query : ''}`)
  },

  async getPerformanceReport(params = {}) {
    const query = new URLSearchParams(params).toString()
    return this.request(`/reports/performance${query ? '?' + query : ''}`)
  },

  async getAssetReport(params = {}) {
    const query = new URLSearchParams(params).toString()
    return this.request(`/reports/assets${query ? '?' + query : ''}`)
  },

  // Performers
  async updatePerformerCrew(performerId, crewId) {
    return this.request(`/performers/${performerId}/assign-crew`, {
      method: 'PUT',
      body: JSON.stringify({ crewId })
    })
  },

  // Departments & Categories
  async getCategories() {
    return this.request('/categories')
  },

  async getDepartments() {
    return this.request('/departments')
  },
  async getAIAnalysis(data) {
  return this.request('/api/reports/ai-analysis', {
    method: 'POST',
    body: JSON.stringify(data)
  })
}
}