<script>
import { api } from '../../services/api.js'

export default {
  name: 'WorkOrdersPage',
  
  props: {
    userRoles: {
      type: Array,
      default: () => []
    },
    currentUser: {
      type: Object,
      default: () => ({})
    }
  },
  
  data() {
    return {
      workOrders: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
      filters: { search: '', status: '', priority: '' },
      loading: false,
      saving: false,
      editingId: null,
      form: {
        name: '',
        categoryId: '',
        assetId: '',
        foremanId: '',
        priority: 'Средний',
        status: 'Новая',
        deadline: '',
        description: '',
        comment: '',
        observerIds: []
      },
      errors: {},
      categories: [],
      assets: [],
      foremen: [],
      crews: [],
      users: [],
      currentPerformerCrew: null,
      currentOrderData: null,
      modalInstance: null,
      searchTimeout: null,
      viewOnlyMode: false
    }
  },
  
  computed: {
    isEditing() {
      return this.editingId !== null
    },
    
    isAdmin() {
      return this.userRoles.includes('admin') || this.currentUser?.position === 'Администратор'
    },
    
    isForeman() {
      return this.userRoles.includes('foreman')
    },
    
    isInstaller() {
      return this.userRoles.includes('installer')
    },
    
    isCustomer() {
      return this.userRoles.includes('customer')
    },
    
    currentForemanId() {
      return this.currentUser?.foremanId || 
             this.currentUser?.foreman_id || 
             null
    },
    
    canCreate() {
      return this.isAdmin || this.isCustomer
    },
    
    canEdit() {
      return this.isAdmin || this.isForeman || this.isCustomer
    },
    
    canDelete() {
      return this.isAdmin
    },
    
    canChangeStatus() {
      return this.isAdmin || this.isForeman
    },
    
    canChangePerformer() {
      return this.isAdmin
    },
    
    startItem() {
      return (this.pagination.page - 1) * this.pagination.limit + 1
    },
    
    endItem() {
      return Math.min(this.pagination.page * this.pagination.limit, this.pagination.total)
    },
    
    visiblePages() {
      const pages = []
      const total = this.pagination.totalPages
      const current = this.pagination.page
      
      if (total <= 7) {
        for (let i = 1; i <= total; i++) pages.push(i)
      } else {
        pages.push(1)
        if (current > 3) pages.push('...')
        for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
          pages.push(i)
        }
        if (current < total - 2) pages.push('...')
        pages.push(total)
      }
      return pages
    },

    userRoleDisplay() {
      if (this.isAdmin) return 'Администратор'
      if (this.isForeman) return 'Бригадир'
      if (this.isInstaller) return 'Монтажник'
      if (this.isCustomer) return 'Заказчик'
      return 'Пользователь'
    }
  },
  
  async mounted() {
    console.log('WorkOrdersPage mounted, user:', this.currentUser?.email, 'roles:', this.userRoles)
    await this.loadSelectData()
    await this.loadWorkOrders()
  },
  
  beforeUnmount() {
    if (this.searchTimeout) clearTimeout(this.searchTimeout)
    if (this.modalInstance) {
      this.modalInstance.dispose()
      this.modalInstance = null
    }
  },
  
  methods: {
    // ==========================================
    // ПРОВЕРКА ПРАВ ДОСТУПА
    // ==========================================
    
    canEditOrder(order) {
      if (!order) return false
      if (this.isAdmin) return true
      if (this.isCustomer && order.customer_id === this.currentUser.customerId) return true
      if (this.isForeman && order.foreman_id === this.currentForemanId) return true
      if (this.isObserverOfOrder(order)) return true
      return false
    },
    
    canViewOrder(order) {
      if (!order) return false
      if (this.isAdmin) return true
      if (this.isObserverOfOrder(order)) return true
      if (this.isForeman && order.foreman_id === this.currentForemanId) return true
      if (this.isCustomer && order.customer_id === this.currentUser.customerId) return true
      return false
    },
    
    isObserverOfOrder(order) {
      if (!order?.observers?.length) return false
      return order.observers.some(o => (o.user_id || o.observer_id) === this.currentUser.id)
    },
    
    canChangeOrderStatus(order) {
      if (!order) return false
      if (this.isAdmin) return true
      if (this.isForeman && order.foreman_id === this.currentForemanId) return true
      return false
    },

    // ==========================================
    // ЗАГРУЗКА ДАННЫХ
    // ==========================================
    
    async loadSelectData() {
      try {
        const promises = [
          api.getCategories(),
          api.getAssets()
        ]
        
        if (this.isAdmin || this.isCustomer || this.isForeman) {
          promises.push(api.getForemen())
        } else {
          promises.push(Promise.resolve({ status: 'success', data: [] }))
        }
        
        if (this.isAdmin || this.isForeman) {
          promises.push(api.getUsers())
        } else {
          promises.push(Promise.resolve({ status: 'success', data: [] }))
        }
        
        if (this.isAdmin || this.isForeman || this.isInstaller) {
          promises.push(api.getCrews())
        } else {
          promises.push(Promise.resolve({ status: 'success', data: [] }))
        }
        
        const [catRes, assetRes, foremenRes, usersRes, crewsRes] = await Promise.allSettled(promises)
        
        this.categories = catRes.value?.data || []
        this.assets = assetRes.value?.data || []
        this.foremen = foremenRes.value?.data || []
        this.users = usersRes.value?.data || []
        
        // Загружаем бригады с деталями
        const crewsData = crewsRes.value?.data || []
        const detailedCrews = await Promise.allSettled(
          crewsData.map(async (crew) => {
            try {
              const detail = await api.getCrew(crew.crew_id)
              return detail?.data || crew
            } catch {
              return crew
            }
          })
        )
        this.crews = detailedCrews
          .filter(r => r.status === 'fulfilled')
          .map(r => r.value)
        
        console.log('✅ Данные загружены:', {
          categories: this.categories.length,
          assets: this.assets.length,
          foremen: this.foremen.length,
          users: this.users.length,
          crews: this.crews.length
        })
      } catch (error) {
        console.error('❌ Ошибка загрузки данных:', error)
      }
    },
    
    async loadWorkOrders() {
      this.loading = true
      try {
        const params = { page: this.pagination.page, limit: this.pagination.limit }
        if (this.filters.search) params.search = this.filters.search
        if (this.filters.status) params.status = this.filters.status
        if (this.filters.priority) params.priority = this.filters.priority
        
        const response = await api.getWorkOrders(params)
        
        if (response?.status === 'success' && response.data) {
          this.workOrders = response.data.workOrders || []
          this.pagination = response.data.pagination || this.pagination
        }
      } catch (error) {
        console.error('❌ Ошибка загрузки заявок:', error)
        window.showToast?.('Ошибка загрузки заявок', 'danger')
      } finally {
        this.loading = false
      }
    },

    // ==========================================
    // МОДАЛЬНОЕ ОКНО
    // ==========================================
    
    openCreateModal() {
      if (!this.canCreate) {
        window.showToast?.('У вас нет прав на создание заявок', 'warning')
        return
      }
      
      this.editingId = null
      this.currentPerformerCrew = null
      this.currentOrderData = null
      this.viewOnlyMode = false
      this.resetForm()
      this.errors = {}
      this.showModal()
    },
    
    async openEditModal(id) {
      try {
        let order = this.workOrders.find(o => o.work_order_id === id)
        
        if (!order) {
          const response = await api.getWorkOrder(id)
          if (response?.status === 'success' && response.data) {
            order = response.data
          }
        }
        
        if (!order) {
          window.showToast?.('Заявка не найдена', 'danger')
          return
        }
        
        if (!this.canEditOrder(order)) {
          window.showToast?.('У вас нет прав на редактирование этой заявки', 'warning')
          return
        }
        
        this.fillFormFromOrder(order)
        this.viewOnlyMode = false
        this.showModal()
      } catch (error) {
        console.error('Error opening edit modal:', error)
        window.showToast?.('Ошибка загрузки заявки', 'danger')
      }
    },
    
    async openViewModal(id) {
      try {
        let order = this.workOrders.find(o => o.work_order_id === id)
        
        if (!order) {
          const response = await api.getWorkOrder(id)
          if (response?.status === 'success' && response.data) {
            order = response.data
          }
        }
        
        if (!order) {
          window.showToast?.('Заявка не найдена', 'danger')
          return
        }
        
        if (!this.canViewOrder(order)) {
          window.showToast?.('У вас нет доступа к этой заявке', 'warning')
          return
        }
        
        this.fillFormFromOrder(order)
        this.viewOnlyMode = true
        this.showModal()
      } catch (error) {
        console.error('Error opening view modal:', error)
        window.showToast?.('Ошибка загрузки заявки', 'danger')
      }
    },
    
    fillFormFromOrder(order) {
      this.editingId = order.work_order_id
      this.currentOrderData = { ...order }
      
      console.log('📝 Заполнение формы:', {
        id: order.work_order_id,
        foreman_id: order.foreman_id,
        crew_id: order.crew_id,
        performer_name: order.performer_name
      })
      
      this.form = {
        name: order.name || '',
        categoryId: order.category_id || '',
        assetId: order.asset_id || '',
        foremanId: order.foreman_id || '',
        priority: order.priority || 'Средний',
        status: order.status || 'Новая',
        deadline: order.deadline || '',
        description: order.description || '',
        comment: order.comment || '',
        observerIds: order.observers?.map(o => o.user_id || o.observer_id).filter(Boolean) || []
      }
      
      this.errors = {}
      
      // ✅ Находим бригаду исполнителя
      this.findCurrentCrew(order)
    },
    
    findCurrentCrew(order) {
      // Ищем бригаду по crew_id или foreman_id
      if (order.crew_id) {
        this.currentPerformerCrew = this.crews.find(c => c.crew_id === order.crew_id) || null
      } else if (order.foreman_id) {
        this.currentPerformerCrew = this.crews.find(c => c.foreman_id === order.foreman_id) || null
      } else {
        this.currentPerformerCrew = null
      }
      
      console.log('🔍 Бригада исполнителя:', this.currentPerformerCrew?.crew_id || 'не найдена')
    },
    
    showModal() {
      if (!this.modalInstance) {
        const el = this.$refs.modalElement
        if (!el) return
        this.modalInstance = new bootstrap.Modal(el, { backdrop: 'static', keyboard: false })
      }
      this.modalInstance.show()
    },
    
    hideModal() {
      if (this.modalInstance) {
        this.modalInstance.hide()
      }
    },
    
    resetForm() {
      this.form = {
        name: '',
        categoryId: '',
        assetId: '',
        foremanId: '',
        priority: 'Средний',
        status: 'Новая',
        deadline: '',
        description: '',
        comment: '',
        observerIds: []
      }
      this.currentPerformerCrew = null
      this.errors = {}
    },

    // ==========================================
    // ОБРАБОТЧИКИ ИЗМЕНЕНИЙ
    // ==========================================
    
    onForemanChange() {
      const foremanId = this.form.foremanId ? parseInt(this.form.foremanId) : null
      
      console.log('🔄 Смена бригадира на:', foremanId)
      
      if (!foremanId) {
        this.currentPerformerCrew = null
        return
      }
      
      // ✅ Ищем бригаду выбранного бригадира среди ВСЕХ бригад
      const crew = this.crews.find(c => c.foreman_id === foremanId)
      
      if (crew) {
        console.log('✅ Найдена бригада #' + crew.crew_id + ' для бригадира #' + foremanId)
        this.currentPerformerCrew = { ...crew }
      } else {
        console.log('ℹ️ У бригадира #' + foremanId + ' нет бригады')
        this.currentPerformerCrew = null
      }
    },

    // ==========================================
    // СОХРАНЕНИЕ
    // ==========================================
    
    async saveWorkOrder() {
      this.errors = {}
      
      if (!this.form.name?.trim()) {
        this.errors.name = 'Введите название заявки'
      }
      if (!this.form.categoryId) {
        this.errors.categoryId = 'Выберите категорию'
      }
      if (!this.form.assetId) {
        this.errors.assetId = 'Выберите ТС'
      }
      
      if (Object.keys(this.errors).length > 0) return
      
      this.saving = true
      
      try {
        const data = {
          name: this.form.name.trim(),
          categoryId: parseInt(this.form.categoryId),
          assetId: parseInt(this.form.assetId),
          priority: this.form.priority,
          deadline: this.form.deadline || null,
          description: this.form.description?.trim() || null,
          comment: this.form.comment?.trim() || null
        }
        
        if (!this.isEditing) {
          // Создание
          data.status = 'Новая'
          if (this.form.foremanId) {
            data.foremanId = parseInt(this.form.foremanId)
            // При создании тоже ищем бригаду
            if (this.currentPerformerCrew?.crew_id) {
              data.crewId = this.currentPerformerCrew.crew_id
            }
          }
        } else {
          // Редактирование
          if (this.canChangeOrderStatus(this.currentOrderData)) {
            data.status = this.form.status
          }
          
          if (this.canChangePerformer) {
            const newForemanId = this.form.foremanId ? parseInt(this.form.foremanId) : null
            const oldForemanId = this.currentOrderData?.foreman_id
            
            // Отправляем foremanId только если он изменился
            if (newForemanId !== oldForemanId) {
              data.foremanId = newForemanId
            }
          }
        }
        
        // Наблюдатели
        if (this.isAdmin || this.isForeman || (this.isCustomer && !this.isEditing)) {
          data.observerIds = (this.form.observerIds || [])
            .filter(Boolean)
            .map(id => parseInt(id))
        }
        
        console.log('💾 Отправка данных:', data)
        
        let response
        if (this.isEditing) {
          response = await api.updateWorkOrder(this.editingId, data)
        } else {
          response = await api.createWorkOrder(data)
        }
        
        if (response?.status === 'success') {
          window.showToast?.(this.isEditing ? 'Заявка обновлена' : 'Заявка создана', 'success')
          this.hideModal()
          await this.loadWorkOrders()
        } else {
          throw new Error(response?.message || 'Операция не выполнена')
        }
      } catch (error) {
        const message = error.response?.data?.message || error.message || 'Неизвестная ошибка'
        console.error('❌ Ошибка сохранения:', message)
        window.showToast?.('Ошибка сохранения: ' + message, 'danger')
      } finally {
        this.saving = false
      }
    },
    
    async deleteOrder(id) {
      if (!this.canDelete) {
        window.showToast?.('У вас нет прав на удаление заявок', 'warning')
        return
      }
      
      if (!confirm(`Удалить заявку #${id}? Это действие нельзя отменить.`)) return
      
      try {
        const response = await api.deleteWorkOrder(id)
        if (response?.status === 'success') {
          window.showToast?.('Заявка удалена', 'success')
          await this.loadWorkOrders()
        }
      } catch (error) {
        const message = error.response?.data?.message || error.message || 'Ошибка удаления'
        window.showToast?.(message, 'danger')
      }
    },

    // ==========================================
    // ПАГИНАЦИЯ И ФИЛЬТРЫ
    // ==========================================
    
    changePage(page) {
      if (page >= 1 && page <= this.pagination.totalPages) {
        this.pagination.page = page
        this.loadWorkOrders()
      }
    },
    
    onSearchInput() {
      if (this.searchTimeout) clearTimeout(this.searchTimeout)
      this.searchTimeout = setTimeout(() => {
        this.pagination.page = 1
        this.loadWorkOrders()
      }, 500)
    },
    
    applyFilters() {
      this.pagination.page = 1
      this.loadWorkOrders()
    },
    
    resetFilters() {
      this.filters = { search: '', status: '', priority: '' }
      this.pagination.page = 1
      this.loadWorkOrders()
    },

    // ==========================================
    // ВСПОМОГАТЕЛЬНЫЕ
    // ==========================================
    
    getStatusClass(status) {
      const map = {
        'Новая': 'bg-info',
        'В работе': 'bg-warning text-dark',
        'Выполнена': 'bg-success',
        'Закрыта': 'bg-secondary',
        'Отменена': 'bg-danger'
      }
      return map[status] || 'bg-secondary'
    },
    
    getPriorityClass(priority) {
      const map = {
        'Низкий': 'bg-info',
        'Средний': 'bg-warning text-dark',
        'Высокий': 'bg-danger',
        'Критичный': 'bg-danger'
      }
      return map[priority] || 'bg-secondary'
    },
    
    isOverdue(order) {
      if (!order.deadline || order.status === 'Выполнена' || order.status === 'Закрыта') return false
      return new Date(order.deadline) < new Date(new Date().toDateString())
    },
    
    formatDate(date) {
      if (!date) return '—'
      try {
        if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
          const [y, m, d] = date.split('-')
          return `${d}.${m}.${y}`
        }
        return new Date(date).toLocaleDateString('ru-RU')
      } catch {
        return '—'
      }
    },
    
    getFullName(user) {
      if (!user) return 'Не указан'
      return [user.last_name, user.first_name, user.middle_name].filter(Boolean).join(' ') || 'Не указан'
    },
    
    getObserverNames(observers) {
      if (!observers?.length) return 'Нет'
      return observers.map(o => this.getFullName(o)).join(', ')
    }
  }
}
</script>

<template>
  <div class="work-orders-page">
    <!-- Заголовок -->
    <div class="d-flex justify-content-between align-items-center mb-4">
      <h3 class="mb-0">
        <i class="bi bi-clipboard-check me-2"></i>
        Управление заявками
        <small class="text-muted ms-2 fs-6">({{ userRoleDisplay }})</small>
      </h3>
      <button v-if="canCreate" class="btn btn-primary" @click="openCreateModal">
        <i class="bi bi-plus-lg me-1"></i>
        Создать заявку
      </button>
    </div>

    <!-- Фильтры -->
    <div class="card border-0 shadow-sm mb-4">
      <div class="card-body">
        <div class="row g-3">
          <div class="col-md-4">
            <div class="input-group">
              <span class="input-group-text"><i class="bi bi-search"></i></span>
              <input v-model="filters.search" type="text" class="form-control" 
                     placeholder="Поиск..." @input="onSearchInput">
            </div>
          </div>
          <div class="col-md-3">
            <select v-model="filters.status" class="form-select" @change="applyFilters">
              <option value="">Все статусы</option>
              <option value="Новая">Новая</option>
              <option value="В работе">В работе</option>
              <option value="Выполнена">Выполнена</option>
              <option value="Закрыта">Закрыта</option>
              <option value="Отменена">Отменена</option>
            </select>
          </div>
          <div class="col-md-3">
            <select v-model="filters.priority" class="form-select" @change="applyFilters">
              <option value="">Все приоритеты</option>
              <option value="Низкий">Низкий</option>
              <option value="Средний">Средний</option>
              <option value="Высокий">Высокий</option>
              <option value="Критичный">Критичный</option>
            </select>
          </div>
          <div class="col-md-2">
            <button class="btn btn-outline-secondary w-100" @click="resetFilters">
              <i class="bi bi-arrow-repeat me-1"></i>Сбросить
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Таблица заявок -->
    <div class="card border-0 shadow-sm">
      <div class="table-responsive">
        <table class="table table-hover mb-0 align-middle">
          <thead class="table-light">
            <tr>
              <th>№</th>
              <th>Название</th>
              <th>ТС</th>
              <th>Заказчик</th>
              <th>Статус</th>
              <th>Приоритет</th>
              <th>Исполнитель</th>
              <th>Наблюдатели</th>
              <th>Срок</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td colspan="10" class="text-center py-4">
                <div class="spinner-border text-primary"></div>
              </td>
            </tr>
            <tr v-else-if="workOrders.length === 0">
              <td colspan="10" class="text-center py-4 text-muted">
                <i class="bi bi-inbox" style="font-size: 2rem;"></i>
                <p class="mt-2 mb-0">Заявки не найдены</p>
              </td>
            </tr>
            <tr v-for="order in workOrders" :key="order.work_order_id"
                :class="{ 'table-danger': isOverdue(order), 'table-info': isObserverOfOrder(order) && !isOverdue(order) }">
              <td><span class="badge bg-light text-dark">#{{ order.work_order_id }}</span></td>
              <td>
                <a v-if="canEditOrder(order)" href="#" @click.prevent="openEditModal(order.work_order_id)"
                   class="text-decoration-none fw-semibold">{{ order.name }}</a>
                <a v-else-if="canViewOrder(order)" href="#" @click.prevent="openViewModal(order.work_order_id)"
                   class="text-decoration-none fw-semibold text-muted">{{ order.name }} <i class="bi bi-eye ms-1 small"></i></a>
                <span v-else class="fw-semibold text-muted">{{ order.name }}</span>
                <div v-if="order.category_name" class="small text-muted">{{ order.category_name }}</div>
              </td>
              <td><small>{{ order.asset_model || order.asset_number || '—' }}</small></td>
              <td><small>{{ getFullName(order.customer) }}</small></td>
              <td><span class="badge rounded-pill" :class="getStatusClass(order.status)">{{ order.status }}</span></td>
              <td><span class="badge rounded-pill" :class="getPriorityClass(order.priority)">{{ order.priority }}</span></td>
              <td>
                <div>
                  <small>{{ order.performer_name || 'Не назначен' }}</small>
                  <!-- ✅ Отображаем бригаду если есть -->
                  <span v-if="order.crew_id" class="badge bg-success ms-1" title="Бригада">
                    <i class="bi bi-people"></i> #{{ order.crew_id }}
                  </span>
                </div>
              </td>
              <td><small class="text-muted">{{ getObserverNames(order.observers) }}</small></td>
              <td>
                <small :class="{ 'text-danger fw-bold': isOverdue(order) }">
                  {{ formatDate(order.deadline) }}
                  <i v-if="isOverdue(order)" class="bi bi-exclamation-triangle-fill text-danger ms-1"></i>
                </small>
              </td>
              <td>
                <div class="btn-group btn-group-sm">
                  <button v-if="!isInstaller && canEditOrder(order)"
                          class="btn btn-outline-primary" @click="openEditModal(order.work_order_id)" title="Редактировать">
                    <i class="bi bi-pencil"></i>
                  </button>
                  <button v-else-if="canViewOrder(order)"
                          class="btn btn-outline-secondary" @click="openViewModal(order.work_order_id)" title="Просмотр">
                    <i class="bi bi-eye"></i>
                  </button>
                  <button v-if="canDelete" class="btn btn-outline-danger" 
                          @click="deleteOrder(order.work_order_id)" title="Удалить">
                    <i class="bi bi-trash"></i>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      
      <!-- Пагинация -->
      <div class="card-footer bg-white" v-if="pagination.totalPages > 1">
        <div class="d-flex justify-content-between align-items-center">
          <small class="text-muted">Показано {{ startItem }}-{{ endItem }} из {{ pagination.total }}</small>
          <nav>
            <ul class="pagination pagination-sm mb-0">
              <li class="page-item" :class="{ disabled: pagination.page <= 1 }">
                <a class="page-link" href="#" @click.prevent="changePage(pagination.page - 1)">
                  <i class="bi bi-chevron-left"></i>
                </a>
              </li>
              <li v-for="page in visiblePages" :key="page"
                  class="page-item" :class="{ active: page === pagination.page, disabled: page === '...' }">
                <a class="page-link" href="#" @click.prevent="page !== '...' && changePage(page)">{{ page }}</a>
              </li>
              <li class="page-item" :class="{ disabled: pagination.page >= pagination.totalPages }">
                <a class="page-link" href="#" @click.prevent="changePage(pagination.page + 1)">
                  <i class="bi bi-chevron-right"></i>
                </a>
              </li>
            </ul>
          </nav>
        </div>
      </div>
    </div>

    <!-- Модальное окно -->
    <div class="modal fade" ref="modalElement" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header bg-light">
            <h5 class="modal-title">
              <i :class="viewOnlyMode ? 'bi bi-eye' : (isEditing ? 'bi bi-pencil-square' : 'bi bi-plus-circle')"></i>
              {{ viewOnlyMode ? 'Просмотр заявки #' + editingId : (isEditing ? 'Редактирование заявки #' + editingId : 'Создание заявки') }}
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          
          <div class="modal-body">
            <div v-if="viewOnlyMode" class="alert alert-info mb-3">
              <i class="bi bi-eye me-2"></i><strong>Режим просмотра</strong>
            </div>
            
            <div class="row g-3">
              <!-- Название -->
              <div class="col-12">
                <label class="form-label">Название <span class="text-danger">*</span></label>
                <input v-model="form.name" type="text" class="form-control"
                       :class="{ 'is-invalid': errors.name }" placeholder="Кратко опишите проблему"
                       :readonly="viewOnlyMode">
                <div class="invalid-feedback">{{ errors.name }}</div>
              </div>
              
              <!-- Категория -->
              <div class="col-md-6">
                <label class="form-label">Категория <span class="text-danger">*</span></label>
                <select v-model="form.categoryId" class="form-select" :class="{ 'is-invalid': errors.categoryId }"
                        :disabled="viewOnlyMode">
                  <option value="">Выберите категорию</option>
                  <option v-for="cat in categories" :key="cat.category_id" :value="cat.category_id">{{ cat.name }}</option>
                </select>
                <div class="invalid-feedback">{{ errors.categoryId }}</div>
              </div>
              
              <!-- ТС -->
              <div class="col-md-6">
                <label class="form-label">Транспортное средство <span class="text-danger">*</span></label>
                <select v-model="form.assetId" class="form-select" :class="{ 'is-invalid': errors.assetId }"
                        :disabled="viewOnlyMode">
                  <option value="">Выберите ТС</option>
                  <option v-for="asset in assets" :key="asset.asset_id" :value="asset.asset_id">
                    {{ asset.model }} ({{ asset.number }})
                  </option>
                </select>
                <div class="invalid-feedback">{{ errors.assetId }}</div>
              </div>
              
              <!-- Исполнитель (бригадир) -->
              <div class="col-md-6">
                <label class="form-label">
                  Исполнитель (бригадир)
                  <span v-if="!canChangePerformer && isEditing" class="text-muted small">(только для администратора)</span>
                </label>
                <select v-model="form.foremanId" class="form-select"
                        :disabled="viewOnlyMode || (isEditing && !canChangePerformer)"
                        @change="onForemanChange">
                  <option value="">Не назначен</option>
                  <!-- ✅ Выводим ВСЕХ бригадиров -->
                  <option v-for="foreman in foremen" :key="foreman.foreman_id" :value="foreman.foreman_id">
                    {{ getFullName(foreman) }}
                  </option>
                </select>
                
                <!-- ✅ Отображение бригады выбранного бригадира -->
                <div v-if="currentPerformerCrew && form.foremanId" class="mt-2">
                  <div class="card bg-success bg-opacity-10 border-success">
                    <div class="card-body py-2 px-3">
                      <div class="d-flex align-items-center">
                        <i class="bi bi-people-fill text-success me-2"></i>
                        <div>
                          <strong>Бригада #{{ currentPerformerCrew.crew_id }}</strong>
                          <div class="small text-muted">
                            Бригадир: {{ currentPerformerCrew.foreman_name || getFullName(foremen.find(f => f.foreman_id === currentPerformerCrew.foreman_id)) }}
                          </div>
                          <div v-if="currentPerformerCrew.installers?.length" class="small text-muted">
                            Монтажники: {{ currentPerformerCrew.installers.map(i => getFullName(i)).join(', ') }}
                          </div>
                          <div v-if="currentPerformerCrew.installer_count" class="small text-muted">
                            Всего монтажников: {{ currentPerformerCrew.installer_count }}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div v-else-if="form.foremanId && !currentPerformerCrew" class="mt-2">
                  <div class="alert alert-warning py-2 mb-0">
                    <i class="bi bi-exclamation-triangle me-1"></i>
                    <small>У этого бригадира нет бригады. Он будет назначен без бригады.</small>
                  </div>
                </div>
              </div>
              
              <!-- Приоритет -->
              <div class="col-md-3">
                <label class="form-label">Приоритет</label>
                <select v-model="form.priority" class="form-select" :disabled="viewOnlyMode">
                  <option value="Низкий">Низкий</option>
                  <option value="Средний">Средний</option>
                  <option value="Высокий">Высокий</option>
                  <option value="Критичный">Критичный</option>
                </select>
              </div>
              
              <!-- Статус -->
              <div class="col-md-3">
                <label class="form-label">Статус</label>
                <select v-model="form.status" class="form-select"
                        :disabled="viewOnlyMode || !isEditing || !canChangeOrderStatus(currentOrderData)">
                  <option value="Новая">Новая</option>
                  <option value="В работе">В работе</option>
                  <option value="Выполнена">Выполнена</option>
                  <option value="Закрыта">Закрыта</option>
                  <option value="Отменена">Отменена</option>
                </select>
              </div>
              
              <!-- Срок -->
              <div class="col-md-6">
                <label class="form-label">Срок выполнения</label>
                <input v-model="form.deadline" type="date" class="form-control" :readonly="viewOnlyMode">
              </div>
              
              <!-- Наблюдатели -->
              <div class="col-md-6" v-if="isAdmin || isForeman">
                <label class="form-label">Наблюдатели</label>
                <div class="border rounded p-2" style="max-height: 150px; overflow-y: auto;">
                  <div v-if="users.length === 0" class="text-muted p-2">Нет доступных пользователей</div>
                  <div v-for="user in users" :key="user.user_id" class="form-check">
                    <input type="checkbox" class="form-check-input" :id="'obs_' + user.user_id"
                           :value="user.user_id" v-model="form.observerIds" :disabled="viewOnlyMode">
                    <label class="form-check-label" :for="'obs_' + user.user_id">
                      {{ getFullName(user) }}
                      <small class="text-muted">({{ user.position || 'Пользователь' }})</small>
                    </label>
                  </div>
                </div>
                <small class="text-muted">Выбрано: {{ form.observerIds.length }}</small>
              </div>
              
              <!-- Описание -->
              <div class="col-12">
                <label class="form-label">Описание</label>
                <textarea v-model="form.description" class="form-control" rows="3" :readonly="viewOnlyMode"></textarea>
              </div>
              
              <!-- Комментарий -->
              <div class="col-12">
                <label class="form-label">Комментарий</label>
                <textarea v-model="form.comment" class="form-control" rows="2" :readonly="viewOnlyMode"></textarea>
              </div>
            </div>
          </div>
          
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal" :disabled="saving">
              {{ viewOnlyMode ? 'Закрыть' : 'Отмена' }}
            </button>
            <button v-if="!viewOnlyMode" type="button" class="btn btn-primary" 
                    @click="saveWorkOrder" :disabled="saving">
              <span v-if="saving" class="spinner-border spinner-border-sm me-1"></span>
              {{ isEditing ? 'Обновить' : 'Создать' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.work-orders-page { padding: 1rem; }
.table th, .table td { vertical-align: middle; font-size: 0.9rem; }
.badge { font-size: 0.8rem; }
.btn-group .btn { padding: 0.25rem 0.5rem; }
.table-danger { --bs-table-bg: rgba(220, 53, 69, 0.05); }
.table-info { --bs-table-bg: rgba(13, 202, 240, 0.05); }
</style>