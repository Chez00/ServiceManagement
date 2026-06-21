<script>
import { api } from '../../services/api.js'

export default {
  name: 'DashboardPage',
  
  data() {
    return {
      stats: {
        total: 0,
        inProgress: 0,
        completed: 0,
        cancelled: 0
      },
      recentOrders: [],
      loading: false
    }
  },
  
  computed: {
    statsCards() {
      return [
        { 
          label: 'Всего заявок', 
          value: this.stats.total, 
          icon: 'bi-clipboard-check', 
          color: 'primary' 
        },
        { 
          label: 'В работе', 
          value: this.stats.inProgress, 
          icon: 'bi-clock-history', 
          color: 'warning' 
        },
        { 
          label: 'Выполнено', 
          value: this.stats.completed, 
          icon: 'bi-check-circle', 
          color: 'success' 
        },
        { 
          label: 'Отменено', 
          value: this.stats.cancelled, 
          icon: 'bi-x-circle', 
          color: 'danger' 
        }
      ]
    }
  },
  
  async mounted() {
    await this.loadDashboardData()
  },
  
  methods: {
    async loadDashboardData() {
      this.loading = true
      try {
        // Получаем все заявки одним запросом с достаточным лимитом
        const response = await api.getWorkOrders()
        
        if (response.status === 'success') {
          const orders = response.data.workOrders || response.data || []
          const pagination = response.data.pagination || {}
          
          // Последние 10 заявок
          this.recentOrders = Array.isArray(orders) ? orders.slice(0, 10) : []
          
          // Общая статистика
          this.stats = {
            total: pagination.total || orders.length,
            new: 0,
            inProgress: 0,
            completed: 0,
            cancelled: 0
          }
          
          // Подсчет по статусам
          if (Array.isArray(orders)) {
            orders.forEach(order => {
              switch (order.status) {
                case 'Новая':
                  this.stats.new++
                  break
                case 'В работе':
                  this.stats.inProgress++
                  break
                case 'Выполнена':
                  this.stats.completed++
                  break
                case 'Отменена':
                  this.stats.cancelled++
                  break
              }
            })
          }
        }
      } catch (error) {
        console.error('Error loading dashboard:', error)
        // Устанавливаем значения по умолчанию при ошибке
        this.recentOrders = []
        this.stats = {
          total: 0,
          new: 0,
          inProgress: 0,
          completed: 0,
          cancelled: 0
        }
      } finally {
        this.loading = false
      }
    },
    
    getStatusClass(status) {
      const classes = {
        'Новая': 'bg-info',
        'В работе': 'bg-warning text-dark',
        'Выполнена': 'bg-success',
        'Закрыта': 'bg-secondary',
        'Отменена': 'bg-danger'
      }
      return classes[status] || 'bg-secondary'
    },
    
    getPriorityClass(priority) {
      const classes = {
        'Низкий': 'bg-info',
        'Средний': 'bg-warning text-dark',
        'Высокий': 'bg-danger',
        'Критичный': 'bg-danger'
      }
      return classes[priority] || 'bg-secondary'
    },
    
    formatDate(date) {
      if (!date) return '-'
      return new Date(date).toLocaleDateString('ru-RU', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      })
    }
  }
}
</script>

<template>
  <div class="dashboard-page">
    <h3 class="mb-4">
      <i class="bi bi-speedometer2 me-2"></i>
      Панель управления
    </h3>
    
    <!-- Статистика -->
    <div class="row g-3 mb-4">
      <div class="col-xl-3 col-md-6" v-for="stat in statsCards" :key="stat.label">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-start">
              <div>
                <p class="text-muted mb-1 small">{{ stat.label }}</p>
                <h2 class="mb-0">{{ stat.value }}</h2>
              </div>
              <div class="stat-icon" :class="'bg-' + stat.color + '-subtle'">
                <i :class="'bi ' + stat.icon + ' text-' + stat.color"></i>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Последние заявки -->
    <div class="card border-0 shadow-sm">
      <div class="card-header bg-white d-flex justify-content-between align-items-center">
        <h5 class="mb-0">
          <i class="bi bi-clock-history me-2"></i>
          Последние заявки
        </h5>
        <a href="#work-orders" class="btn btn-sm btn-outline-primary">
          Все заявки <i class="bi bi-arrow-right ms-1"></i>
        </a>
      </div>
      <div class="table-responsive">
        <table class="table table-hover mb-0">
          <thead class="table-light">
            <tr>
              <th>ID</th>
              <th>Название</th>
              <th>ТС</th>
              <th>Статус</th>
              <th>Приоритет</th>
              <th>Дата создания</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td colspan="6" class="text-center py-4">
                <div class="spinner-border text-primary"></div>
              </td>
            </tr>
            <tr v-else-if="recentOrders.length === 0">
              <td colspan="6" class="text-center py-4 text-muted">
                <i class="bi bi-inbox" style="font-size: 2rem;"></i>
                <p class="mt-2 mb-0">Заявки не найдены</p>
              </td>
            </tr>
            <tr v-for="order in recentOrders" :key="order.work_order_id">
              <td>
                <a :href="'#work-orders'" class="fw-semibold text-decoration-none">
                  #{{ order.work_order_id }}
                </a>
              </td>
              <td>{{ order.name }}</td>
              <td>{{ order.asset_model || '-' }}</td>
              <td>
                <span class="badge rounded-pill" :class="getStatusClass(order.status)">
                  {{ order.status }}
                </span>
              </td>
              <td>
                <span class="badge rounded-pill" :class="getPriorityClass(order.priority)">
                  {{ order.priority }}
                </span>
              </td>
              <td>{{ formatDate(order.created_date) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.stat-icon i {
  font-size: 1.5rem;
}
</style>