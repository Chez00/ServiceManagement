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
      return this.userRoles.includes('foreman') || this.currentUser?.position === 'Бригадир'
    },
    
    isInstaller() {
      return this.userRoles.includes('installer') || this.currentUser?.position === 'Монтажник'
    },
    
    isCustomer() {
      return this.userRoles.includes('customer') || this.currentUser?.position === 'Заказчик'
    },
    
    // ✅ Получаем foremanId разными способами
    currentForemanId() {
      return this.currentUser?.foremanId || 
             this.currentUser?.foreman_id ||
             this.currentOrderData?.foreman_id ||
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
    
    // ✅ Доступные бригады для бригадира
    availableForemanCrews() {
      const foremanId = this.currentForemanId
      
      console.log('🔍 availableForemanCrews - foremanId:', foremanId)
      console.log('🔍 Все бригады:', this.crews.map(c => ({ 
        crew_id: c.crew_id, 
        foreman_id: c.foreman_id,
        foreman_name: c.foreman_name 
      })))
      
      if (!foremanId) return []
      
      const filtered = this.crews.filter(crew => crew.foreman_id === foremanId)
      console.log('🔍 Отфильтрованные бригады:', filtered)
      
      return filtered
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
    console.log('=== WORK ORDERS PAGE MOUNTED ===')
    console.log('User:', this.currentUser)
    console.log('Roles:', this.userRoles)
    console.log('isAdmin:', this.isAdmin)
    console.log('isForeman:', this.isForeman)
    console.log('isInstaller:', this.isInstaller)
    console.log('isCustomer:', this.isCustomer)
    console.log('foremanId:', this.currentForemanId)
    
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
    // МЕТОДЫ ПРОВЕРКИ ПРАВ ДОСТУПА
    // ==========================================
    
    canEditOrder(order) {
      if (!order) return false
      if (this.isAdmin) return true
      
      if (this.isCustomer && order.customer_id === this.currentUser.customerId) {
        return true
      }
      
      if (this.isForeman) {
        if (order.foreman_id && order.foreman_id === this.currentForemanId) return true
        
        const foremanFullName = `${order.foreman_last_name || ''} ${order.foreman_first_name || ''}`.trim().toLowerCase()
        const currentUserFullName = `${this.currentUser.lastName || ''} ${this.currentUser.firstName || ''}`.trim().toLowerCase()
        
        if (foremanFullName && foremanFullName === currentUserFullName) return true
        
        if (order.performer_name) {
          const performerName = order.performer_name.toLowerCase()
          if (performerName === currentUserFullName || 
              performerName.includes(currentUserFullName) ||
              currentUserFullName.includes(performerName)) return true
        }
        
        if (order.performer_id && order.performer_id === this.currentUser.id) return true
      }
      
      if (this.canEdit && this.isObserverOfOrder(order)) return true
      
      return false
    },
    
    canViewOrder(order) {
      if (!order) return false
      if (this.isAdmin) return true
      if (this.isObserverOfOrder(order)) return true
      
      if (this.isForeman) {
        if (order.foreman_id && order.foreman_id === this.currentForemanId) return true
        
        const foremanName = `${order.foreman_last_name || ''} ${order.foreman_first_name || ''}`.trim().toLowerCase()
        const userName = `${this.currentUser.lastName || ''} ${this.currentUser.firstName || ''}`.trim().toLowerCase()
        
        if (foremanName && foremanName === userName) return true
        
        if (order.performer_name) {
          const performerName = order.performer_name.toLowerCase()
          if (performerName === userName || performerName.includes(userName)) return true
        }
        
        return false
      }
      
      if (this.isCustomer) {
        if (order.customer_id && order.customer_id === this.currentUser.id) return true
        
        const customerName = `${order.customer_last_name || ''} ${order.customer_first_name || ''}`.trim().toLowerCase()
        const userName = `${this.currentUser.lastName || ''} ${this.currentUser.firstName || ''}`.trim().toLowerCase()
        
        if (customerName && customerName === userName) return true
        
        return false
      }
      
      if (this.isInstaller) {
        if (order.crew_id && this.crews.length > 0) {
          const crew = this.crews.find(c => c.crew_id === order.crew_id)
          if (crew && crew.installers && Array.isArray(crew.installers)) {
            const isInCrew = crew.installers.some(installer => {
              const userId = installer.user_id || installer.id
              return userId === this.currentUser.id
            })
            if (isInCrew) return true
          }
        }
        
        if (order.performer_name) {
          const performerName = order.performer_name.toLowerCase()
          const userName = `${this.currentUser.lastName || ''} ${this.currentUser.firstName || ''}`.trim().toLowerCase()
          if (performerName.includes(userName) || userName.includes(performerName)) return true
        }
        
        return false
      }
      
      return false
    },
    
    isObserverOfOrder(order) {
      if (!order || !order.observers || !Array.isArray(order.observers)) return false
      const userId = this.currentUser.id
      return order.observers.some(observer => {
        const observerId = observer.user_id || observer.observer_id || observer.id
        return observerId === userId
      })
    },
    
    canChangeOrderStatus(order) {
      if (!order) return false
      if (this.isAdmin) return true
      
      if (this.isForeman) {
        if (order.foreman_id && order.foreman_id === this.currentForemanId) return true
        
        const foremanFullName = `${order.foreman_last_name || ''} ${order.foreman_first_name || ''}`.trim().toLowerCase()
        const currentUserFullName = `${this.currentUser.lastName || ''} ${this.currentUser.firstName || ''}`.trim().toLowerCase()
        
        if (foremanFullName && foremanFullName === currentUserFullName) return true
        
        if (order.performer_name) {
          const performerName = order.performer_name.toLowerCase()
          if (performerName === currentUserFullName || performerName.includes(currentUserFullName)) return true
        }
      }
      
      return false
    },
    
    canChangeOrderCrew(order) {
      if (!order) return false
      if (this.isAdmin) return true
      
      if (this.isForeman) {
        if (order.foreman_id && order.foreman_id === this.currentForemanId) return true
        
        const foremanFullName = `${order.foreman_last_name || ''} ${order.foreman_first_name || ''}`.trim().toLowerCase()
        const currentUserFullName = `${this.currentUser.lastName || ''} ${this.currentUser.firstName || ''}`.trim().toLowerCase()
        
        if (foremanFullName && foremanFullName === currentUserFullName) return true
        
        if (order.performer_name) {
          const performerName = order.performer_name.toLowerCase()
          if (performerName === currentUserFullName || performerName.includes(currentUserFullName)) return true
        }
      }
      
      return false
    },

    // ==========================================
    // МЕТОДЫ ЗАГРУЗКИ ДАННЫХ
    // ==========================================
    
    async loadSelectData() {
      try {
        const promises = [
          api.getCategories(),
          api.getAssets()
        ]
        
        // ✅ Бригадиры нужны всем, кроме монтажника
        if (this.isAdmin || this.isCustomer || this.isForeman) {
          promises.push(api.getForemen())
        } else {
          promises.push(Promise.resolve({ status: 'success', data: [] }))
        }
        
        // ✅ Пользователи нужны админу и бригадиру (для наблюдателей)
        if (this.isAdmin || this.isForeman) {
          promises.push(api.getUsers())
        } else {
          promises.push(Promise.resolve({ status: 'success', data: [] }))
        }
        
        // ✅ Бригады нужны админу, бригадиру и монтажнику
        if (this.isAdmin || this.isForeman || this.isInstaller) {
          promises.push(api.getCrews())
        } else {
          promises.push(Promise.resolve({ status: 'success', data: [] }))
        }
        
        const results = await Promise.allSettled(promises)
        const [categoriesResult, assetsResult, foremenResult, usersResult, crewsResult] = results
        
        // Категории
        if (categoriesResult.status === 'fulfilled' && 
            categoriesResult.value?.status === 'success' && 
            categoriesResult.value.data) {
          this.categories = categoriesResult.value.data
        } else {
          this.categories = []
        }
        
        // Активы
        if (assetsResult.status === 'fulfilled' && 
            assetsResult.value?.status === 'success' && 
            assetsResult.value.data) {
          this.assets = assetsResult.value.data
        } else {
          this.assets = []
        }
        
        // Бригадиры
        if (foremenResult.status === 'fulfilled' && 
            foremenResult.value?.status === 'success' && 
            foremenResult.value.data) {
          this.foremen = foremenResult.value.data
          console.log('✅ Загружены бригадиры:', this.foremen.length)
        } else {
          this.foremen = []
        }
        
        // Пользователи
        if (usersResult.status === 'fulfilled' && 
            usersResult.value?.status === 'success' && 
            usersResult.value.data) {
          this.users = usersResult.value.data
          console.log('✅ Загружены пользователи:', this.users.length)
        } else {
          this.users = []
        }
        
        // Бригады
        if (crewsResult.status === 'fulfilled' && 
            crewsResult.value?.status === 'success' && 
            crewsResult.value.data) {
          const crews = crewsResult.value.data
          console.log('✅ Загружены бригады (базовые):', crews.length)
          
          // Загружаем детальную информацию
          const detailedCrews = await Promise.allSettled(
            crews.map(async (crew) => {
              try {
                const detailRes = await api.getCrew(crew.crew_id)
                if (detailRes?.status === 'success' && detailRes.data) {
                  return { ...crew, ...detailRes.data }
                }
              } catch (e) {
                console.error('Error loading crew details:', e)
              }
              return crew
            })
          )
          
          this.crews = detailedCrews
            .filter(result => result.status === 'fulfilled')
            .map(result => result.value)
          
          console.log('✅ Загружены бригады (детальные):', this.crews.length)
          console.log('✅ Бригады для текущего бригадира:', this.availableForemanCrews.length)
        } else {
          this.crews = []
        }
        
      } catch (error) {
        console.error('❌ Ошибка загрузки данных:', error)
        this.categories = []
        this.assets = []
        this.foremen = []
        this.users = []
        this.crews = []
      }
    },
    
    async loadWorkOrders() {
      this.loading = true
      try {
        const params = { 
          page: this.pagination.page, 
          limit: this.pagination.limit 
        }
        
        if (this.filters.search) params.search = this.filters.search
        if (this.filters.status) params.status = this.filters.status
        if (this.filters.priority) params.priority = this.filters.priority
        
        const response = await api.getWorkOrders(params)
        
        if (response?.status === 'success' && response.data) {
          this.workOrders = response.data.workOrders || []
          this.pagination = response.data.pagination || this.pagination
          console.log('✅ Загружены заявки:', this.workOrders.length)
        } else {
          throw new Error('Invalid response format')
        }
      } catch (error) {
        console.error('❌ Ошибка загрузки заявок:', error)
        window.showToast?.('Ошибка загрузки заявок: ' + (error.message || 'Неизвестная ошибка'), 'danger')
        this.workOrders = []
      } finally {
        this.loading = false
      }
    },

    // ==========================================
    // МЕТОДЫ РАБОТЫ С МОДАЛЬНЫМ ОКНОМ
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
    
    async openViewModal(id) {
      try {
        const order = this.workOrders.find(o => o.work_order_id === id)
        
        if (!order) {
          const response = await api.getWorkOrder(id)
          if (response?.status === 'success' && response.data) {
            if (!this.canViewOrder(response.data)) {
              window.showToast?.('У вас нет доступа к этой заявке', 'warning')
              return
            }
            this.fillFormFromOrder(response.data)
          } else {
            throw new Error('Failed to load order')
          }
        } else {
          if (!this.canViewOrder(order)) {
            window.showToast?.('У вас нет доступа к этой заявке', 'warning')
            return
          }
          this.fillFormFromOrder(order)
        }
        
        this.viewOnlyMode = true
        this.showModal()
      } catch (error) {
        console.error('Error opening view modal:', error)
        window.showToast?.('Ошибка загрузки заявки: ' + (error.message || 'Неизвестная ошибка'), 'danger')
      }
    },
    
    async openEditModal(id) {
      try {
        const order = this.workOrders.find(o => o.work_order_id === id)
        
        if (!order) {
          const response = await api.getWorkOrder(id)
          if (response?.status === 'success' && response.data) {
            if (!this.canEditOrder(response.data)) {
              window.showToast?.('У вас нет прав на редактирование этой заявки', 'warning')
              return
            }
            this.fillFormFromOrder(response.data)
          } else {
            throw new Error('Failed to load order')
          }
        } else {
          if (!this.canEditOrder(order)) {
            window.showToast?.('У вас нет прав на редактирование этой заявки', 'warning')
            return
          }
          this.fillFormFromOrder(order)
        }
        
        this.viewOnlyMode = false
        this.showModal()
      } catch (error) {
        console.error('Error opening edit modal:', error)
        window.showToast?.('Ошибка загрузки заявки: ' + (error.message || 'Неизвестная ошибка'), 'danger')
      }
    },
    
    fillFormFromOrder(order) {
      this.editingId = order.work_order_id
      this.currentOrderData = order
      
      console.log('📝 Заполнение формы заявки:', {
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
        observerIds: order.observers && Array.isArray(order.observers) 
          ? order.observers.map(o => o.user_id || o.observer_id || o.id).filter(Boolean)
          : []
      }
      
      this.errors = {}
      
      // ✅ Ищем бригаду
      if (order.crew_id) {
        const crew = this.crews.find(c => c.crew_id === order.crew_id)
        console.log('🔍 Поиск бригады по crew_id:', order.crew_id, 'Найдена:', !!crew)
        this.currentPerformerCrew = crew || null
      } else if (order.foreman_id) {
        const crew = this.crews.find(c => c.foreman_id === order.foreman_id)
        console.log('🔍 Поиск бригады по foreman_id:', order.foreman_id, 'Найдена:', !!crew)
        this.currentPerformerCrew = crew || null
      } else {
        this.currentPerformerCrew = null
      }
    },
    
    showModal() {
      if (!this.modalInstance) {
        const modalElement = this.$refs.modalElement
        if (!modalElement) {
          console.error('Modal element not found')
          return
        }
        this.modalInstance = new bootstrap.Modal(modalElement, {
          backdrop: 'static',
          keyboard: false
        })
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
      this.errors = {}
    },

    // ==========================================
    // МЕТОДЫ СОХРАНЕНИЯ И УДАЛЕНИЯ
    // ==========================================
    
    async changeCrew(crewId) {
      if (!this.currentOrderData?.performer_id) {
        window.showToast?.('Нет исполнителя для назначения бригады', 'warning')
        return
      }
      
      if (!this.canChangeOrderCrew(this.currentOrderData)) {
        window.showToast?.('У вас нет прав на смену бригады', 'warning')
        return
      }
      
      try {
        const response = await api.updatePerformerCrew(this.currentOrderData.performer_id, crewId)
        if (response?.status === 'success') {
          window.showToast?.('Бригада изменена', 'success')
          
          const crew = this.crews.find(c => c.crew_id === crewId)
          this.currentPerformerCrew = crew || null
          
          await this.loadWorkOrders()
        } else {
          throw new Error(response?.message || 'Failed to update crew')
        }
      } catch (error) {
        console.error('Error changing crew:', error)
        window.showToast?.('Ошибка изменения бригады: ' + (error.message || 'Неизвестная ошибка'), 'danger')
      }
    },
    
    onForemanChange() {
      console.log('🔄 Смена бригадира на:', this.form.foremanId)
      
      if (!this.isEditing) {
        this.currentPerformerCrew = null
        return
      }
      
      if (this.form.foremanId) {
        // ✅ Ищем бригаду среди ВСЕХ загруженных
        const crew = this.crews.find(c => c.foreman_id === parseInt(this.form.foremanId))
        this.currentPerformerCrew = crew || null
        console.log('🔍 Найдена бригада:', crew)
      } else {
        this.currentPerformerCrew = null
      }
    },
    
    async saveWorkOrder() {
      this.errors = {}
      
      if (!this.form.name || !this.form.name.trim()) {
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
          description: this.form.description ? this.form.description.trim() : null,
          comment: this.form.comment ? this.form.comment.trim() : null
        }
        
        if (!this.isEditing) {
          data.status = 'Новая'
          if (this.form.foremanId) {
            data.foremanId = parseInt(this.form.foremanId)
          }
        } else {
          if (this.canChangeOrderStatus(this.currentOrderData)) {
            data.status = this.form.status
          }
          
          if (this.canChangePerformer) {
            data.foremanId = this.form.foremanId ? parseInt(this.form.foremanId) : null
          }
        }
        
        // ✅ Наблюдатели
        if (this.isAdmin || 
            (this.isForeman && this.canEditOrder(this.currentOrderData)) ||
            (this.isCustomer && !this.isEditing)) {
          if (this.form.observerIds && this.form.observerIds.length > 0) {
            data.observerIds = this.form.observerIds.filter(Boolean).map(id => parseInt(id))
          } else {
            data.observerIds = []
          }
        }
        
        console.log('💾 Сохранение заявки:', data)
        
        let response
        if (this.isEditing) {
          response = await api.updateWorkOrder(this.editingId, data)
        } else {
          response = await api.createWorkOrder(data)
        }
        
        if (response?.status === 'success') {
          window.showToast?.(
            this.isEditing ? 'Заявка обновлена' : 'Заявка создана',
            'success'
          )
          this.hideModal()
          await this.loadWorkOrders()
        } else {
          throw new Error(response?.message || 'Operation failed')
        }
      } catch (error) {
        console.error('Error saving work order:', error)
        window.showToast?.('Ошибка сохранения: ' + (error.message || 'Неизвестная ошибка'), 'danger')
      } finally {
        this.saving = false
      }
    },
    
    async deleteOrder(id) {
      if (!this.canDelete) {
        window.showToast?.('У вас нет прав на удаление заявок', 'warning')
        return
      }
      
      if (!confirm(`Вы уверены, что хотите удалить заявку #${id}? Это действие нельзя отменить.`)) {
        return
      }
      
      try {
        const response = await api.deleteWorkOrder(id)
        if (response?.status === 'success') {
          window.showToast?.('Заявка успешно удалена', 'success')
          await this.loadWorkOrders()
        } else {
          throw new Error(response?.message || 'Failed to delete order')
        }
      } catch (error) {
        console.error('Error deleting order:', error)
        window.showToast?.('Ошибка удаления: ' + (error.message || 'Неизвестная ошибка'), 'danger')
      }
    },
    
    // ==========================================
    // МЕТОДЫ ПАГИНАЦИИ И ФИЛЬТРАЦИИ
    // ==========================================
    
    changePage(page) {
      if (typeof page === 'number' && page >= 1 && page <= this.pagination.totalPages) {
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
    // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
    // ==========================================
    
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
    
    isOverdue(order) {
      if (!order.deadline || order.status === 'Выполнена' || order.status === 'Закрыта') {
        return false
      }
      const deadline = new Date(order.deadline)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      return deadline < today
    },
    
    formatDate(date) {
      if (!date) return '—'
      try {
        if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
          const [year, month, day] = date.split('-')
          return `${day}.${month}.${year}`
        }
        if (typeof date === 'string' && date.includes('T')) {
          return new Date(date).toLocaleDateString('ru-RU')
        }
        return new Date(date).toLocaleDateString('ru-RU')
      } catch (e) {
        return '—'
      }
    },
    
    getFullName(user) {
      if (!user) return 'Не указан'
      const parts = [user.last_name, user.first_name, user.middle_name]
      return parts.filter(Boolean).join(' ') || 'Не указан'
    },
    
    getObserverNames(observers) {
      if (!observers || !Array.isArray(observers) || observers.length === 0) {
        return 'Нет наблюдателей'
      }
      return observers.map(o => this.getFullName(o)).join(', ')
    }
  }
}
</script>

<template>
  <div class="work-orders-page">
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

    <!-- Таблица -->
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
                  <span v-if="order.crew_id" class="badge bg-success ms-1" :title="'Бригада #' + order.crew_id">
                    <i class="bi bi-people"></i> {{ order.crew_id }}
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
                  <!-- Просмотр -->
                  <button v-if="canViewOrder(order) && !canEditOrder(order) && !isInstaller"
                          class="btn btn-outline-secondary" @click="openViewModal(order.work_order_id)" title="Просмотр">
                    <i class="bi bi-eye"></i>
                  </button>
                  <!-- Просмотр для монтажника -->
                  <button v-if="isInstaller && canViewOrder(order)"
                          class="btn btn-outline-info" @click="openViewModal(order.work_order_id)" title="Просмотр">
                    <i class="bi bi-eye"></i>
                  </button>
                  <!-- Редактирование -->
                  <button v-if="!isInstaller && canEditOrder(order)"
                          class="btn btn-outline-primary" @click="openEditModal(order.work_order_id)" title="Редактировать">
                    <i class="bi bi-pencil"></i>
                  </button>
                  <!-- Удаление -->
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
              <div class="col-12">
                <label class="form-label">Название <span class="text-danger">*</span></label>
                <input v-model="form.name" type="text" class="form-control"
                       :class="{ 'is-invalid': errors.name }" placeholder="Кратко опишите проблему"
                       :readonly="viewOnlyMode || (!canEditOrder(currentOrderData) && isEditing)">
                <div class="invalid-feedback">{{ errors.name }}</div>
              </div>
              
              <div class="col-md-6">
                <label class="form-label">Категория <span class="text-danger">*</span></label>
                <select v-model="form.categoryId" class="form-select" :class="{ 'is-invalid': errors.categoryId }"
                        :disabled="viewOnlyMode || (!canEditOrder(currentOrderData) && isEditing)">
                  <option value="">Выберите</option>
                  <option v-for="cat in categories" :key="cat.category_id" :value="cat.category_id">{{ cat.name }}</option>
                </select>
                <div class="invalid-feedback">{{ errors.categoryId }}</div>
              </div>
              
              <div class="col-md-6">
                <label class="form-label">ТС <span class="text-danger">*</span></label>
                <select v-model="form.assetId" class="form-select" :class="{ 'is-invalid': errors.assetId }"
                        :disabled="viewOnlyMode || (!canEditOrder(currentOrderData) && isEditing)">
                  <option value="">Выберите</option>
                  <option v-for="asset in assets" :key="asset.asset_id" :value="asset.asset_id">
                    {{ asset.model }} ({{ asset.number }})
                  </option>
                </select>
                <div class="invalid-feedback">{{ errors.assetId }}</div>
              </div>
              
              <!-- Исполнитель -->
              <div class="col-md-6">
                <label class="form-label">
                  Исполнитель (бригадир)
                  <span v-if="viewOnlyMode || (isEditing && !canChangePerformer)" class="text-muted small">(только просмотр)</span>
                </label>
                <select v-model="form.foremanId" class="form-select"
                        :disabled="viewOnlyMode || (isEditing && !canChangePerformer)"
                        @change="onForemanChange">
                  <option value="">Не назначен</option>
                  <option v-for="foreman in foremen" :key="foreman.foreman_id" :value="foreman.foreman_id">
                    {{ getFullName(foreman) }}
                  </option>
                </select>
                
                <!-- Бригада -->
                <template v-if="isEditing || viewOnlyMode">
                  <div v-if="currentPerformerCrew" class="mt-2">
                    <div class="card bg-success bg-opacity-10 border-success">
                      <div class="card-body py-2 px-3">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                          <div>
                            <i class="bi bi-people-fill text-success me-2"></i>
                            <strong>Бригада #{{ currentPerformerCrew.crew_id }}</strong>
                          </div>
                          <div v-if="!viewOnlyMode && canChangeOrderCrew(currentOrderData)" class="dropdown">
                            <button class="btn btn-sm btn-outline-success dropdown-toggle" data-bs-toggle="dropdown">
                              <i class="bi bi-arrow-repeat"></i> Сменить
                            </button>
                            <ul class="dropdown-menu">
                              <li v-for="crew in availableForemanCrews" :key="crew.crew_id">
                                <a class="dropdown-item" href="#" @click.prevent="changeCrew(crew.crew_id)">
                                  Бригада #{{ crew.crew_id }}
                                </a>
                              </li>
                              <li v-if="availableForemanCrews.length === 0">
                                <span class="dropdown-item text-muted">Нет доступных бригад</span>
                              </li>
                            </ul>
                          </div>
                        </div>
                        <div class="small">
                          <div><strong>Бригадир:</strong> {{ currentPerformerCrew.foreman_name || 'Не указан' }}</div>
                          <div v-if="currentPerformerCrew.installers?.length">
                            <strong>Монтажники:</strong>
                            <span v-for="(inst, i) in currentPerformerCrew.installers" :key="inst.installer_id || i">
                              {{ getFullName(inst) }}{{ i < currentPerformerCrew.installers.length - 1 ? ', ' : '' }}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div v-else-if="form.foremanId" class="mt-2">
                    <div class="alert alert-warning py-2 mb-0">
                      <i class="bi bi-exclamation-triangle me-1"></i>
                      <small>Бригада ещё не назначена</small>
                    </div>
                  </div>
                </template>
              </div>
              
              <div class="col-md-3">
                <label class="form-label">Приоритет</label>
                <select v-model="form.priority" class="form-select"
                        :disabled="viewOnlyMode || (!canEditOrder(currentOrderData) && isEditing)">
                  <option value="Низкий">Низкий</option>
                  <option value="Средний">Средний</option>
                  <option value="Высокий">Высокий</option>
                  <option value="Критичный">Критичный</option>
                </select>
              </div>
              
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
              
              <div class="col-md-6">
                <label class="form-label">Срок выполнения</label>
                <input v-model="form.deadline" type="date" class="form-control"
                       :readonly="viewOnlyMode || (!canEditOrder(currentOrderData) && isEditing)">
              </div>
              
              <!-- Наблюдатели -->
              <div class="col-md-6" v-if="isAdmin || isForeman">
                <label class="form-label">Наблюдатели</label>
                <div class="border rounded p-2" style="max-height: 150px; overflow-y: auto;">
                  <div v-if="users.length === 0" class="text-muted p-2">Нет пользователей</div>
                  <div v-for="user in users" :key="user.user_id" class="form-check">
                    <input type="checkbox" class="form-check-input" :id="'obs_' + user.user_id"
                           :value="user.user_id" v-model="form.observerIds"
                           :disabled="viewOnlyMode">
                    <label class="form-check-label" :for="'obs_' + user.user_id">
                      {{ getFullName(user) }}
                      <small class="text-muted">({{ user.position || 'Пользователь' }})</small>
                    </label>
                  </div>
                </div>
                <small class="text-muted">Выбрано: {{ form.observerIds.length }}</small>
              </div>
              
              <div class="col-12">
                <label class="form-label">Описание</label>
                <textarea v-model="form.description" class="form-control" rows="3" 
                          :readonly="viewOnlyMode || (!canEditOrder(currentOrderData) && isEditing)"></textarea>
              </div>
              
              <div class="col-12">
                <label class="form-label">Комментарий</label>
                <textarea v-model="form.comment" class="form-control" rows="2" 
                          :readonly="viewOnlyMode || (!canEditOrder(currentOrderData) && isEditing)"></textarea>
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
.dropdown-menu { min-width: 250px; }
</style>