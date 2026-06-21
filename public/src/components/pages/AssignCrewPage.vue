<script>
import { api } from '../../services/api.js'

export default {
  name: 'AssignCrewPage',
  
  props: {
    userRoles: {
      type: Array,
      default: () => []
    }
  },
  
  data() {
    return {
      workOrders: [],
      allCrews: [],
      loading: false,
      saving: false,
      selectedOrder: null,
      selectedCrew: null,
      viewOrder: null,
      modalInstance: null,
      viewModalInstance: null
    }
  },
  
  computed: {
    availableOrders() {
      return this.workOrders.filter(order => {
        return order.performer_id && !order.crew_id && order.foreman_id
      })
    }
  },
  
  async mounted() {
    await Promise.all([
      this.loadWorkOrders(),
      this.loadCrews()
    ])
  },
  
  methods: {
    async loadWorkOrders() {
      this.loading = true
      try {
        const response = await api.getWorkOrders({ limit: 100 })
        if (response.status === 'success') {
          const orders = response.data.workOrders || []
          
          const detailedOrders = await Promise.all(
            orders.map(async (order) => {
              if (order.performer_id) {
                try {
                  const detailResponse = await api.getWorkOrder(order.work_order_id)
                  if (detailResponse.status === 'success') {
                    return { ...order, ...detailResponse.data }
                  }
                } catch (e) {
                  console.error(`Error loading order ${order.work_order_id}:`, e)
                }
              }
              return order
            })
          )
          
          this.workOrders = detailedOrders
        }
      } catch (error) {
        window.showToast('Ошибка загрузки заявок: ' + error.message, 'danger')
      } finally {
        this.loading = false
      }
    },
    
    async loadCrews() {
      try {
        const response = await api.getCrews()
        if (response.status === 'success') {
          const crews = response.data || []
          
          const detailedCrews = await Promise.all(
            crews.map(async (crew) => {
              try {
                const detailResponse = await api.getCrew(crew.crew_id)
                if (detailResponse.status === 'success') {
                  return { ...crew, ...detailResponse.data }
                }
              } catch (e) {
                console.error(`Error loading crew ${crew.crew_id}:`, e)
              }
              return crew
            })
          )
          
          this.allCrews = detailedCrews
        }
      } catch (error) {
        console.error('Error loading crews:', error)
      }
    },
    
    getCrewsForForeman(foremanId) {
      if (!foremanId) return []
      return this.allCrews.filter(crew => crew.foreman_id === foremanId)
    },
    
    async viewOrderDetails(order) {
      try {
        // Загружаем полные данные заявки
        const response = await api.getWorkOrder(order.work_order_id)
        if (response.status === 'success') {
          this.viewOrder = {
            ...order,
            ...response.data
          }
          this.showViewModal()
        }
      } catch (error) {
        window.showToast('Ошибка загрузки заявки: ' + error.message, 'danger')
      }
    },
    
    openAssignModal(order) {
      this.selectedOrder = order
      this.selectedCrew = null
      this.showModal()
    },
    
    async assignCrew() {
      if (!this.selectedOrder || !this.selectedCrew) {
        window.showToast('Выберите бригаду', 'warning')
        return
      }
      
      this.saving = true
      try {
        await api.updatePerformerCrew(this.selectedOrder.performer_id, parseInt(this.selectedCrew))
        window.showToast('Бригада успешно назначена', 'success')
        this.hideModal()
        await this.loadWorkOrders()
      } catch (error) {
        window.showToast('Ошибка: ' + error.message, 'danger')
      } finally {
        this.saving = false
      }
    },
    
    showModal() {
      if (!this.modalInstance) {
        this.modalInstance = new bootstrap.Modal(this.$refs.assignModal)
      }
      this.modalInstance.show()
    },
    
    hideModal() {
      if (this.modalInstance) {
        this.modalInstance.hide()
      }
    },
    
    showViewModal() {
      if (!this.viewModalInstance) {
        this.viewModalInstance = new bootstrap.Modal(this.$refs.viewModal)
      }
      this.viewModalInstance.show()
    },
    
    hideViewModal() {
      if (this.viewModalInstance) {
        this.viewModalInstance.hide()
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
        'Низкий': 'bg-secondary',
        'Средний': 'bg-primary',
        'Высокий': 'bg-warning text-dark',
        'Критический': 'bg-danger'
      }
      return classes[priority] || 'bg-light text-dark'
    },
    
    formatDate(date) {
      if (!date) return '—'
      if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        const [year, month, day] = date.split('-')
        return `${day}.${month}.${year}`
      }
      if (typeof date === 'string' && date.includes('T')) {
        return new Date(date).toLocaleString('ru-RU')
      }
      return date
    },
    
    getFullName(person) {
      if (!person) return 'Не указан'
      const parts = [person.last_name, person.first_name, person.middle_name]
      return parts.filter(Boolean).join(' ') || 'Не указан'
    }
  }
}
</script>

<template>
  <div class="assign-crew-page">
    <div class="d-flex justify-content-between align-items-center mb-4">
      <h3 class="mb-0">
        <i class="bi bi-people-fill me-2"></i>
        Назначение бригад на заявки
      </h3>
      <button class="btn btn-outline-primary" @click="loadWorkOrders" :disabled="loading">
        <i class="bi bi-arrow-repeat me-1"></i>
        Обновить
      </button>
    </div>

    <div class="card border-0 shadow-sm">
      <div class="table-responsive">
        <table class="table table-hover mb-0">
          <thead class="table-light">
            <tr>
              <th>ID</th>
              <th>Название заявки</th>
              <th>ТС</th>
              <th>Исполнитель</th>
              <th>Статус</th>
              <th>Приоритет</th>
              <th>Срок</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td colspan="8" class="text-center py-4">
                <div class="spinner-border text-primary"></div>
              </td>
            </tr>
            <tr v-else-if="availableOrders.length === 0">
              <td colspan="8" class="text-center py-4 text-muted">
                <i class="bi bi-check-circle" style="font-size: 2rem;"></i>
                <p class="mt-2 mb-0">Все заявки уже имеют назначенные бригады</p>
              </td>
            </tr>
            <tr v-for="order in availableOrders" :key="order.work_order_id">
              <td>
                <span class="badge bg-light text-dark">#{{ order.work_order_id }}</span>
              </td>
              <td>
                <div class="fw-semibold">{{ order.name }}</div>
                <small class="text-muted">{{ order.category_name || '' }}</small>
              </td>
              <td>
                <small>{{ order.asset_model || order.asset_number || '—' }}</small>
              </td>
              <td>
                {{ order.foreman_last_name }} {{ order.foreman_first_name }}
              </td>
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
              <td>
                <small>{{ formatDate(order.deadline) }}</small>
              </td>
              <td>
                <div class="btn-group btn-group-sm">
                  <button 
                    class="btn btn-outline-info" 
                    @click="viewOrderDetails(order)"
                    title="Просмотр заявки">
                    <i class="bi bi-eye"></i>
                  </button>
                  <button 
                    class="btn btn-primary" 
                    @click="openAssignModal(order)"
                    title="Назначить бригаду">
                    <i class="bi bi-people"></i>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Модальное окно просмотра заявки -->
    <div class="modal fade" ref="viewModal" tabindex="-1">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header bg-info text-white">
            <h5 class="modal-title">
              <i class="bi bi-clipboard-check me-2"></i>
              Заявка #{{ viewOrder?.work_order_id }}
            </h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body" v-if="viewOrder">
            <!-- Основная информация -->
            <div class="row mb-4">
              <div class="col-md-8">
                <h4>{{ viewOrder.name }}</h4>
                <div class="mb-3">
                  <span class="badge rounded-pill me-2" :class="getStatusClass(viewOrder.status)">
                    {{ viewOrder.status }}
                  </span>
                  <span class="badge rounded-pill" :class="getPriorityClass(viewOrder.priority)">
                    {{ viewOrder.priority }}
                  </span>
                </div>
              </div>
              <div class="col-md-4 text-md-end">
                <small class="text-muted">Создана: {{ formatDate(viewOrder.created_date) }}</small><br>
                <small class="text-muted">Срок: {{ formatDate(viewOrder.deadline) }}</small>
              </div>
            </div>

            <!-- Детали заявки -->
            <div class="row">
              <div class="col-md-6">
                <div class="card mb-3">
                  <div class="card-header bg-light">
                    <h6 class="mb-0">
                      <i class="bi bi-info-circle me-2"></i>
                      Основная информация
                    </h6>
                  </div>
                  <div class="card-body">
                    <div class="mb-2">
                      <small class="text-muted">Категория:</small>
                      <div>{{ viewOrder.category_name || 'Не указана' }}</div>
                    </div>
                    <div class="mb-2">
                      <small class="text-muted">Транспортное средство:</small>
                      <div>{{ viewOrder.asset_model || '—' }} ({{ viewOrder.asset_number || '—' }})</div>
                    </div>
                    <div class="mb-2">
                      <small class="text-muted">Заказчик:</small>
                      <div>{{ getFullName(viewOrder.customer) || 'Не указан' }}</div>
                    </div>
                    <div v-if="viewOrder.description" class="mb-0">
                      <small class="text-muted">Описание:</small>
                      <div class="mt-1">{{ viewOrder.description }}</div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div class="col-md-6">
                <div class="card mb-3">
                  <div class="card-header bg-light">
                    <h6 class="mb-0">
                      <i class="bi bi-people me-2"></i>
                      Исполнители
                    </h6>
                  </div>
                  <div class="card-body">
                    <div class="mb-2">
                      <small class="text-muted">Бригадир:</small>
                      <div>
                        <i class="bi bi-person-badge me-1"></i>
                        {{ viewOrder.foreman_last_name }} {{ viewOrder.foreman_first_name }}
                      </div>
                    </div>
                    <div class="mb-2">
                      <small class="text-muted">Бригада:</small>
                      <div>
                        <span v-if="viewOrder.crew_id" class="badge bg-success">
                          #{{ viewOrder.crew_id }}
                        </span>
                        <span v-else class="text-warning">
                          <i class="bi bi-exclamation-triangle me-1"></i>
                          Не назначена
                        </span>
                      </div>
                    </div>
                    <div v-if="viewOrder.installers && viewOrder.installers.length > 0">
                      <small class="text-muted">Монтажники:</small>
                      <ul class="list-unstyled mb-0 mt-1">
                        <li v-for="installer in viewOrder.installers" :key="installer.installer_id">
                          <i class="bi bi-person me-1"></i>
                          {{ getFullName(installer) }}
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Комментарий -->
            <div v-if="viewOrder.comment" class="card">
              <div class="card-header bg-light">
                <h6 class="mb-0">
                  <i class="bi bi-chat-dots me-2"></i>
                  Комментарий
                </h6>
              </div>
              <div class="card-body">
                {{ viewOrder.comment }}
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
              <i class="bi bi-x-circle me-1"></i>
              Закрыть
            </button>
            <button 
              type="button" 
              class="btn btn-primary"
              @click="hideViewModal(); openAssignModal(viewOrder)">
              <i class="bi bi-people me-1"></i>
              Назначить бригаду
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Модальное окно назначения бригады -->
    <div class="modal fade" ref="assignModal" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header bg-primary text-white">
            <h5 class="modal-title">
              <i class="bi bi-people-fill me-2"></i>
              Назначение бригады
            </h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div v-if="selectedOrder" class="mb-4">
              <div class="card bg-light">
                <div class="card-body">
                  <h6 class="mb-2">#{{ selectedOrder.work_order_id }} - {{ selectedOrder.name }}</h6>
                  <div class="row small">
                    <div class="col-6">
                      <p class="mb-1">
                        <i class="bi bi-person me-1"></i>
                        <strong>Бригадир:</strong><br>
                        {{ selectedOrder.foreman_last_name }} {{ selectedOrder.foreman_first_name }}
                      </p>
                    </div>
                    <div class="col-6">
                      <p class="mb-1">
                        <i class="bi bi-laptop me-1"></i>
                        <strong>ТС:</strong><br>
                        {{ selectedOrder.asset_model || selectedOrder.asset_number || '—' }}
                      </p>
                    </div>
                  </div>
                  <div class="row small">
                    <div class="col-6">
                      <span class="badge rounded-pill" :class="getStatusClass(selectedOrder.status)">
                        {{ selectedOrder.status }}
                      </span>
                    </div>
                    <div class="col-6">
                      <span class="badge rounded-pill" :class="getPriorityClass(selectedOrder.priority)">
                        {{ selectedOrder.priority }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="mb-3">
              <label class="form-label">
                <i class="bi bi-people me-1"></i>
                Выберите бригаду
              </label>
              
              <div v-if="selectedOrder && getCrewsForForeman(selectedOrder.foreman_id).length === 0" 
                   class="alert alert-warning">
                <i class="bi bi-exclamation-triangle me-2"></i>
                У этого бригадира нет созданных бригад. 
                <a href="#crews" class="alert-link">Создайте бригаду</a>
              </div>
              
              <select v-else-if="selectedOrder" v-model="selectedCrew" class="form-select">
                <option value="">Выберите бригаду...</option>
                <option 
                  v-for="crew in getCrewsForForeman(selectedOrder.foreman_id)" 
                  :key="crew.crew_id" 
                  :value="crew.crew_id">
                  Бригада #{{ crew.crew_id }}
                  <template v-if="crew.foreman_name"> - {{ crew.foreman_name }}</template>
                  ({{ crew.installer_count || 0 }} монтажников)
                </option>
              </select>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
              <i class="bi bi-x-circle me-1"></i>
              Отмена
            </button>
            <button 
              type="button" 
              class="btn btn-primary" 
              @click="assignCrew"
              :disabled="saving || !selectedCrew">
              <span v-if="saving" class="spinner-border spinner-border-sm me-1"></span>
              <i v-else class="bi bi-check-lg me-1"></i>
              Назначить
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.assign-crew-page {
  padding: 1rem;
}

.table th, .table td {
  vertical-align: middle;
}

.btn-group .btn {
  padding: 0.25rem 0.5rem;
}

.modal-body .card {
  border: 1px solid rgba(0,0,0,.125);
}

.badge {
  font-size: 0.85rem;
}

.card-header {
  border-bottom: 1px solid rgba(0,0,0,.125);
}
</style>