<script>
import { api } from '../../services/api.js'

export default {
  name: 'UsersPage',
  
  props: {
    userRoles: {
      type: Array,
      default: () => []
    }
  },
  
  data() {
    return {
      users: [],
      departments: [],
      loading: false,
      saving: false,
      formErrors: {},
      form: {
        email: '',
        password: '',
        firstName: '',
        lastName: '',
        middleName: '',
        phone: '',
        position: '',
        departmentId: '',
        roles: []
      },
      modalInstance: null,
      isEditing: false,
      editingUserId: null
    }
  },
  
  computed: {
    isAdmin() {
      return this.userRoles.includes('admin')
    },
    
    modalTitle() {
      return this.isEditing ? 'Редактирование пользователя' : 'Создание пользователя'
    },
    
    saveButtonText() {
      return this.isEditing ? 'Сохранить изменения' : 'Создать пользователя'
    },
    
    availableRoles() {
      return [
        { value: 'customer', label: 'Заказчик', icon: 'bi-person' },
        { value: 'foreman', label: 'Бригадир', icon: 'bi-person-badge' },
        { value: 'installer', label: 'Монтажник', icon: 'bi-tools' }
      ]
    },
    
    availablePositions() {
      return [
        'Администратор',
        'Бригадир',
        'Монтажник',
        'Менеджер',
        'Диспетчер'
      ]
    }
  },
  
  async mounted() {
    await Promise.all([
      this.loadUsers(),
      this.loadDepartments()
    ])
  },
  
  methods: {
    async loadUsers() {
      this.loading = true
      try {
        const response = await api.getUsers()
        if (response.status === 'success') {
          this.users = response.data || []
        }
      } catch (error) {
        const message = error.response?.data?.message || error.message || 'Ошибка загрузки пользователей'
        window.showToast(message, 'danger')
      } finally {
        this.loading = false
      }
    },
    
    async loadDepartments() {
      try {
        const response = await api.getDepartments()
        if (response.status === 'success') {
          this.departments = response.data || []
        }
      } catch (error) {
        console.error('Error loading departments:', error)
      }
    },
    
    openCreateModal() {
      this.isEditing = false
      this.editingUserId = null
      this.resetForm()
      this.showModal()
    },
    
    openEditModal(user) {
      this.isEditing = true
      this.editingUserId = user.user_id
      
      this.form = {
        email: user.email || '',
        password: '',
        firstName: user.first_name || '',
        lastName: user.last_name || '',
        middleName: user.middle_name || '',
        phone: user.phone || '',
        position: user.position || '',
        departmentId: user.department_id || '',
        roles: [...(user.roles || [])]
      }
      
      this.clearFormErrors()
      this.showModal()
    },
    
    clearFormErrors() {
      this.formErrors = {
        email: '',
        password: '',
        firstName: '',
        lastName: '',
        general: ''
      }
    },
    
    validateForm() {
      this.clearFormErrors()
      let isValid = true
      
      if (!this.form.email || !this.form.email.trim()) {
        this.formErrors.email = 'Введите email'
        isValid = false
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.form.email)) {
        this.formErrors.email = 'Введите корректный email'
        isValid = false
      }
      
      if (!this.isEditing && !this.form.password) {
        this.formErrors.password = 'Введите пароль'
        isValid = false
      } else if (this.form.password && this.form.password.length < 6) {
        this.formErrors.password = 'Пароль должен содержать минимум 6 символов'
        isValid = false
      }
      
      if (!this.form.lastName || !this.form.lastName.trim()) {
        this.formErrors.lastName = 'Введите фамилию'
        isValid = false
      }
      
      if (!this.form.firstName || !this.form.firstName.trim()) {
        this.formErrors.firstName = 'Введите имя'
        isValid = false
      }
      
      return isValid
    },
    
    getErrorMessage(error) {
      if (error.response?.data?.message) {
        return error.response.data.message
      }
      if (error.response?.data?.errors) {
        const errors = error.response.data.errors
        if (Array.isArray(errors)) {
          return errors.map(e => e.message || e.msg).join('. ')
        }
      }
      return error.message || 'Произошла неизвестная ошибка'
    },
    
    async saveUser() {
      if (!this.validateForm()) {
        return
      }
      
      this.saving = true
      this.clearFormErrors()
      
      try {
        const userData = {
          email: this.form.email.trim(),
          firstName: this.form.firstName.trim(),
          lastName: this.form.lastName.trim(),
          middleName: this.form.middleName ? this.form.middleName.trim() : undefined,
          phone: this.form.phone ? this.form.phone.trim() : undefined,
          position: this.form.position || undefined,
          departmentId: this.form.departmentId || null,
          //roles: [...this.form.roles] // ✅ Отправляем роли вместе с основными данными
        }
        
        if (this.form.password) {
          userData.password = this.form.password
        }
        
        let response
        
        if (this.isEditing) {
          // Обновляем основные данные + роли одним запросом
          response = await api.updateUser(this.editingUserId, userData)
          
          if (response.status === 'success') {
            // Синхронизируем специальные роли (foreman/installer)
            await this.syncSpecialRoles(this.editingUserId)
            
            window.showToast('Пользователь успешно обновлён', 'success')
            this.hideModal()
            await this.loadUsers()
          }
        } else {
          response = await api.register(userData)
          
          if (response.status === 'success') {
            const userId = response.data?.id || response.data?.userId || response.data?.user?.id
            
            if (userId) {
              await this.syncSpecialRoles(userId)
            }
            
            window.showToast('Пользователь успешно создан', 'success')
            this.hideModal()
            await this.loadUsers()
          }
        }
      } catch (error) {
        const message = this.getErrorMessage(error)
        this.formErrors.general = message
        window.showToast(message, 'danger')
        
        if (message.toLowerCase().includes('email')) {
          this.formErrors.email = message
        }
        if (message.toLowerCase().includes('парол')) {
          this.formErrors.password = message
        }
      } finally {
        this.saving = false
      }
    },
    
    async syncSpecialRoles(userId) {
      const user = this.users.find(u => u.user_id === userId)
      const currentRoles = user ? (user.roles || []) : []
      const newRoles = this.form.roles || []
      
      // Обрабатываем только foreman и installer
      const specialRoles = ['foreman', 'installer']
      
      for (const role of specialRoles) {
        const currentlyHas = currentRoles.includes(role)
        const shouldHave = newRoles.includes(role)
        
        // Нужно добавить роль
        if (!currentlyHas && shouldHave) {
          try {
            if (role === 'foreman') {
              await api.makeForeman(userId)
              window.showToast('Пользователь назначен бригадиром', 'success')
            } else if (role === 'installer') {
              await api.makeInstaller(userId)
              window.showToast('Пользователь назначен монтажником', 'success')
            }
          } catch (error) {
            const message = this.getErrorMessage(error)
            // Убираем роль из формы, если не удалось добавить
            const index = this.form.roles.indexOf(role)
            if (index > -1) this.form.roles.splice(index, 1)
            window.showToast(`Ошибка: ${message}`, 'danger')
          }
        }
        
        // Нужно удалить роль
        if (currentlyHas && !shouldHave) {
          try {
            if (role === 'foreman') {
              await api.removeForeman(userId)
              window.showToast('Роль бригадира удалена', 'info')
            } else if (role === 'installer') {
              await api.removeInstaller(userId)
              window.showToast('Роль монтажника удалена', 'info')
            }
          } catch (error) {
            const message = this.getErrorMessage(error)
            // Возвращаем роль в форму, если не удалось удалить
            if (!this.form.roles.includes(role)) this.form.roles.push(role)
            
            if (message.includes('активные заявки') || message.includes('активными заявками')) {
              window.showToast(
                `Невозможно снять роль «${this.getRoleLabel(role)}». Завершите или переназначьте активные заявки.`,
                'warning',
                8000
              )
            } else {
              window.showToast(`Ошибка: ${message}`, 'danger')
            }
          }
        }
      }
    },
    
    async toggleForeman(user) {
      const isCurrentlyForeman = user.roles?.includes('foreman')
      
      try {
        if (isCurrentlyForeman) {
          const response = await api.removeForeman(user.user_id)
          window.showToast(response.message || 'Роль бригадира удалена', 'success')
        } else {
          const response = await api.makeForeman(user.user_id)
          window.showToast(response.message || 'Пользователь назначен бригадиром', 'success')
        }
        await this.loadUsers()
      } catch (error) {
        const message = this.getErrorMessage(error)
        
        if (message.includes('активные заявки') || message.includes('активными заявками')) {
          window.showToast(
            'Невозможно снять роль бригадира. У бригадира есть активные заявки. Завершите или переназначьте их.',
            'danger',
            8000
          )
        } else {
          window.showToast(message, 'danger')
        }
      }
    },
    
    async toggleInstaller(user) {
      const isCurrentlyInstaller = user.roles?.includes('installer')
      
      try {
        if (isCurrentlyInstaller) {
          const response = await api.removeInstaller(user.user_id)
          window.showToast(response.message || 'Роль монтажника удалена', 'success')
        } else {
          const response = await api.makeInstaller(user.user_id)
          window.showToast(response.message || 'Пользователь назначен монтажником', 'success')
        }
        await this.loadUsers()
      } catch (error) {
        const message = this.getErrorMessage(error)
        
        if (message.includes('активные заявки') || message.includes('активными заявками')) {
          window.showToast(
            'Невозможно снять роль монтажника. Монтажник состоит в бригаде с активными заявками.',
            'danger',
            8000
          )
        } else {
          window.showToast(message, 'danger')
        }
      }
    },
    
    async deleteUser(user) {
      const userName = this.getFullName(user)
      const confirmMessage = `Вы уверены, что хотите удалить пользователя «${userName}»?\n\nЭто действие нельзя отменить.`
      
      if (confirm(confirmMessage)) {
        try {
          const response = await api.deleteUser(user.user_id)
          window.showToast(response.message || 'Пользователь удалён', 'success')
          await this.loadUsers()
        } catch (error) {
          const message = this.getErrorMessage(error)
          
          if (message.includes('активные заявки') || message.includes('активными заявками')) {
            window.showToast(
              'Невозможно удалить пользователя. У него есть активные заявки. Завершите или переназначьте их.',
              'danger',
              8000
            )
          } else if (message.includes('самого себя')) {
            window.showToast('Вы не можете удалить свою учётную запись.', 'warning')
          } else {
            window.showToast(`Ошибка удаления: ${message}`, 'danger')
          }
        }
      }
    },
    
    showModal() {
      if (!this.modalInstance) {
        this.modalInstance = new bootstrap.Modal(this.$refs.modalElement)
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
        email: '',
        password: '',
        firstName: '',
        lastName: '',
        middleName: '',
        phone: '',
        position: '',
        departmentId: '',
        roles: []
      }
      this.clearFormErrors()
    },
    
    getRoleLabel(role) {
      const labels = {
        'admin': 'Администратор',
        'customer': 'Заказчик',
        'foreman': 'Бригадир',
        'installer': 'Монтажник'
      }
      return labels[role] || role
    },
    
    getRoleBadgeClass(role) {
      const classes = {
        'admin': 'bg-danger',
        'customer': 'bg-primary',
        'foreman': 'bg-success',
        'installer': 'bg-info'
      }
      return classes[role] || 'bg-secondary'
    },
    
    getFullName(user) {
      const parts = [user.last_name, user.first_name, user.middle_name]
      return parts.filter(Boolean).join(' ') || 'Не указано'
    }
  }
}
</script>

<template>
  <div class="users-page">
    <div class="d-flex justify-content-between align-items-center mb-4">
      <h3 class="mb-0">
        <i class="bi bi-person-gear me-2"></i>
        Управление пользователями
      </h3>
      <button v-if="isAdmin" class="btn btn-primary" @click="openCreateModal">
        <i class="bi bi-plus-lg me-1"></i>
        Создать пользователя
      </button>
    </div>

    <div class="card border-0 shadow-sm">
      <div class="table-responsive">
        <table class="table table-hover mb-0">
          <thead class="table-light">
            <tr>
              <th>ID</th>
              <th>ФИО</th>
              <th>Email</th>
              <th>Должность</th>
              <th>Отдел</th>
              <th>Роли</th>
              <th v-if="isAdmin">Действия</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td :colspan="isAdmin ? 7 : 6" class="text-center py-4">
                <div class="spinner-border text-primary"></div>
              </td>
            </tr>
            <tr v-else-if="users.length === 0">
              <td :colspan="isAdmin ? 7 : 6" class="text-center py-4 text-muted">
                <i class="bi bi-people" style="font-size: 2rem;"></i>
                <p class="mt-2 mb-0">Пользователи не найдены</p>
              </td>
            </tr>
            <tr v-for="user in users" :key="user.user_id">
              <td>
                <span class="badge bg-secondary">#{{ user.user_id }}</span>
              </td>
              <td>
                <div class="d-flex align-items-center">
                  <i class="bi bi-person-circle me-2 text-primary"></i>
                  {{ getFullName(user) }}
                </div>
              </td>
              <td>
                <i class="bi bi-envelope me-1 text-muted"></i>
                {{ user.email }}
              </td>
              <td>{{ user.position || '—' }}</td>
              <td>{{ user.department_name || '—' }}</td>
              <td>
                <span 
                  v-for="role in (user.roles || [])" 
                  :key="role" 
                  class="badge me-1"
                  :class="getRoleBadgeClass(role)">
                  {{ getRoleLabel(role) }}
                </span>
                <span v-if="!user.roles || user.roles.length === 0" class="text-muted">
                  Нет ролей
                </span>
              </td>
              <td v-if="isAdmin">
                <div class="btn-group btn-group-sm">
                  <button 
                    class="btn btn-outline-primary"
                    @click="openEditModal(user)"
                    title="Редактировать">
                    <i class="bi bi-pencil"></i>
                  </button>
                  <button 
                    class="btn btn-outline-danger"
                    @click="deleteUser(user)"
                    title="Удалить">
                    <i class="bi bi-trash"></i>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Модальное окно -->
    <div class="modal fade" ref="modalElement" tabindex="-1">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header bg-primary text-white">
            <h5 class="modal-title">
              <i class="bi" :class="isEditing ? 'bi-pencil-square' : 'bi-person-plus'"></i>
              {{ modalTitle }}
            </h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            
            <!-- Общая ошибка -->
            <div v-if="formErrors.general" class="alert alert-danger alert-dismissible fade show" role="alert">
              <i class="bi bi-exclamation-triangle-fill me-2"></i>
              <strong>Ошибка:</strong> {{ formErrors.general }}
              <button type="button" class="btn-close" @click="formErrors.general = ''"></button>
            </div>

            <div class="row">
              <!-- Основная информация -->
              <div class="col-md-6">
                <h6 class="text-muted mb-3">
                  <i class="bi bi-info-circle me-1"></i>
                  Основная информация
                </h6>
                
                <div class="mb-3">
                  <label class="form-label">
                    Email <span class="text-danger">*</span>
                  </label>
                  <input 
                    type="email" 
                    class="form-control"
                    :class="{ 'is-invalid': formErrors.email }"
                    v-model="form.email"
                    @input="formErrors.email = ''"
                    placeholder="user@example.com">
                  <div v-if="formErrors.email" class="invalid-feedback">{{ formErrors.email }}</div>
                </div>
                
                <div class="mb-3">
                  <label class="form-label">
                    Пароль 
                    <span v-if="!isEditing" class="text-danger">*</span>
                    <small v-else class="text-muted">(оставьте пустым, если не меняете)</small>
                  </label>
                  <input 
                    type="password" 
                    class="form-control"
                    :class="{ 'is-invalid': formErrors.password }"
                    v-model="form.password"
                    @input="formErrors.password = ''"
                    placeholder="Введите пароль">
                  <div v-if="formErrors.password" class="invalid-feedback">{{ formErrors.password }}</div>
                </div>
                
                <div class="mb-3">
                  <label class="form-label">
                    Фамилия <span class="text-danger">*</span>
                  </label>
                  <input 
                    type="text" 
                    class="form-control"
                    :class="{ 'is-invalid': formErrors.lastName }"
                    v-model="form.lastName"
                    @input="formErrors.lastName = ''"
                    placeholder="Иванов">
                  <div v-if="formErrors.lastName" class="invalid-feedback">{{ formErrors.lastName }}</div>
                </div>
                
                <div class="mb-3">
                  <label class="form-label">
                    Имя <span class="text-danger">*</span>
                  </label>
                  <input 
                    type="text" 
                    class="form-control"
                    :class="{ 'is-invalid': formErrors.firstName }"
                    v-model="form.firstName"
                    @input="formErrors.firstName = ''"
                    placeholder="Иван">
                  <div v-if="formErrors.firstName" class="invalid-feedback">{{ formErrors.firstName }}</div>
                </div>
                
                <div class="mb-3">
                  <label class="form-label">Отчество</label>
                  <input 
                    type="text" 
                    class="form-control" 
                    v-model="form.middleName"
                    placeholder="Иванович">
                </div>
              </div>
              
              <!-- Дополнительная информация -->
              <div class="col-md-6">
                <h6 class="text-muted mb-3">
                  <i class="bi bi-gear me-1"></i>
                  Дополнительная информация
                </h6>
                
                <div class="mb-3">
                  <label class="form-label">Телефон</label>
                  <input 
                    type="tel" 
                    class="form-control" 
                    v-model="form.phone"
                    placeholder="+7 (900) 123-45-67">
                </div>
                
                <div class="mb-3">
                  <label class="form-label">Должность</label>
                  <select class="form-select" v-model="form.position">
                    <option value="">Выберите должность</option>
                    <option 
                      v-for="pos in availablePositions" 
                      :key="pos" 
                      :value="pos">
                      {{ pos }}
                    </option>
                  </select>
                </div>
                
                <div class="mb-3">
                  <label class="form-label">Отдел</label>
                  <select class="form-select" v-model="form.departmentId">
                    <option value="">Выберите отдел</option>
                    <option 
                      v-for="dept in departments" 
                      :key="dept.department_id" 
                      :value="dept.department_id">
                      {{ dept.name }}
                    </option>
                  </select>
                </div>
                
                <div class="mb-3">
                  <label class="form-label">Роли</label>
                  <div class="border rounded p-3">
                    <div 
                      v-for="role in availableRoles" 
                      :key="role.value"
                      class="form-check m-2">
                      <input 
                        type="checkbox" 
                        class="form-check-input" 
                        :id="'role_' + role.value"
                        :value="role.value"
                        v-model="form.roles">
                      <label 
                        class="form-check-label" 
                        :for="'role_' + role.value">
                        <i :class="'bi ' + role.icon + ' me-1'"></i>
                        {{ role.label }}
                      </label>
                    </div>
                    
                    <div v-if="form.position === 'Администратор'" class="alert alert-info mt-3 mb-0 py-2 px-3">
                      <i class="bi bi-info-circle me-1"></i>
                      Администратор автоматически получает доступ ко всем функциям системы
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button 
              type="button" 
              class="btn btn-secondary" 
              data-bs-dismiss="modal">
              <i class="bi bi-x-circle me-1"></i>
              Отмена
            </button>
            <button 
              type="button" 
              class="btn btn-primary" 
              @click="saveUser" 
              :disabled="saving">
              <span v-if="saving" class="spinner-border spinner-border-sm me-1"></span>
              <i v-else class="bi" :class="isEditing ? 'bi-check-circle' : 'bi-plus-circle'"></i>
              {{ saveButtonText }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.users-page {
  padding: 1rem;
}

.table th, .table td {
  vertical-align: middle;
}

.badge {
  font-size: 0.85rem;
}

.btn-group .btn {
  padding: 0.25rem 0.5rem;
}

.form-check {
  transition: background-color 0.2s;
  padding: 0.5rem;
  border-radius: 0.25rem;
}

.form-check:hover {
  background-color: #f8f9fa;
}

.modal-header {
  border-bottom: none;
}

.modal-footer {
  border-top: none;
}

.alert {
  margin-bottom: 1rem;
}

.invalid-feedback {
  display: block;
}
</style>