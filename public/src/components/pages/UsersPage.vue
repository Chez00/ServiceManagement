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
        window.showToast('Ошибка загрузки пользователей: ' + error.message, 'danger')
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
        password: '', // Пароль не заполняем при редактировании
        firstName: user.first_name || '',
        lastName: user.last_name || '',
        middleName: user.middle_name || '',
        phone: user.phone || '',
        position: user.position || '',
        departmentId: user.department_id || '',
        roles: user.roles || []
      }
      
      this.showModal()
    },
    
    async saveUser() {
      // Валидация
      if (!this.form.email) {
        window.showToast('Введите email', 'warning')
        return
      }
      
      if (!this.isEditing && !this.form.password) {
        window.showToast('Введите пароль', 'warning')
        return
      }
      
      if (!this.form.lastName || !this.form.firstName) {
        window.showToast('Введите фамилию и имя', 'warning')
        return
      }
      
      this.saving = true
      
      try {
        const userData = {
          email: this.form.email,
          firstName: this.form.firstName,
          lastName: this.form.lastName,
          middleName: this.form.middleName,
          phone: this.form.phone,
          position: this.form.position,
          departmentId: this.form.departmentId || null
        }
        
        // Добавляем пароль только при создании или если он был изменен
        if (this.form.password) {
          userData.password = this.form.password
        }
        
        let response
        
        if (this.isEditing) {
          // Обновляем пользователя
          response = await api.updateUser(this.editingUserId, userData)
        } else {
          // Создаем пользователя
          response = await api.register(userData)
        }
        
        if (response.status === 'success') {
          const userId = this.isEditing ? this.editingUserId : response.data.userId
          
          // Управление ролями
          if (userId) {
            await this.updateUserRoles(userId)
          }
          
          window.showToast(
            this.isEditing ? 'Пользователь обновлен' : 'Пользователь создан', 
            'success'
          )
          this.hideModal()
          await this.loadUsers()
        }
      } catch (error) {
        window.showToast('Ошибка сохранения: ' + error.message, 'danger')
      } finally {
        this.saving = false
      }
    },
    
    async updateUserRoles(userId) {
      try {
        // Получаем текущие роли пользователя
        const user = this.users.find(u => u.user_id === userId)
        const currentRoles = user ? (user.roles || []) : []
        const newRoles = this.form.roles || []
        
        // Определяем, какие роли добавить и удалить
        const rolesToAdd = newRoles.filter(role => !currentRoles.includes(role))
        const rolesToRemove = currentRoles.filter(role => !newRoles.includes(role))
        
        // Добавляем новые роли
        for (const role of rolesToAdd) {
          try {
            if (role === 'foreman') {
              await api.makeForeman(userId)
            } else if (role === 'installer') {
              await api.makeInstaller(userId)
            }
          } catch (error) {
            console.error(`Error adding role ${role}:`, error)
          }
        }
        
        // Удаляем старые роли
        for (const role of rolesToRemove) {
          try {
            if (role === 'foreman') {
              await api.removeForeman(userId)
            } else if (role === 'installer') {
              await api.removeInstaller(userId)
            }
          } catch (error) {
            console.error(`Error removing role ${role}:`, error)
          }
        }
      } catch (error) {
        console.error('Error updating roles:', error)
        throw error
      }
    },
    
    async toggleForeman(user) {
      try {
        if (user.roles && user.roles.includes('foreman')) {
          await api.removeForeman(user.user_id)
          window.showToast('Роль бригадира удалена', 'success')
        } else {
          await api.makeForeman(user.user_id)
          window.showToast('Пользователь назначен бригадиром', 'success')
        }
        await this.loadUsers()
      } catch (error) {
        window.showToast('Ошибка: ' + error.message, 'danger')
      }
    },
    
    async toggleInstaller(user) {
      try {
        if (user.roles && user.roles.includes('installer')) {
          await api.removeInstaller(user.user_id)
          window.showToast('Роль монтажника удалена', 'success')
        } else {
          await api.makeInstaller(user.user_id)
          window.showToast('Пользователь назначен монтажником', 'success')
        }
        await this.loadUsers()
      } catch (error) {
        window.showToast('Ошибка: ' + error.message, 'danger')
      }
    },
    
    async deleteUser(id) {
      if (confirm('Вы уверены, что хотите удалить этого пользователя? Это действие нельзя отменить.')) {
        try {
          await api.deleteUser(id)
          window.showToast('Пользователь удален', 'success')
          await this.loadUsers()
        } catch (error) {
          window.showToast('Ошибка удаления: ' + error.message, 'danger')
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
                    @click="deleteUser(user.user_id)"
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

    <!-- Модальное окно создания/редактирования пользователя -->
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
                    v-model="form.email"
                    placeholder="user@example.com">
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
                    v-model="form.password"
                    placeholder="Введите пароль">
                </div>
                
                <div class="mb-3">
                  <label class="form-label">
                    Фамилия <span class="text-danger">*</span>
                  </label>
                  <input 
                    type="text" 
                    class="form-control" 
                    v-model="form.lastName"
                    placeholder="Иванов">
                </div>
                
                <div class="mb-3">
                  <label class="form-label">
                    Имя <span class="text-danger">*</span>
                  </label>
                  <input 
                    type="text" 
                    class="form-control" 
                    v-model="form.firstName"
                    placeholder="Иван">
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
</style>