<script>
import { api } from '../../services/api.js'

export default {
  name: 'CrewsPage',
  
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
      crews: [],
      foremen: [],
      installers: [],
      loading: false,
      saving: false,
      showValidation: false,
      form: {
        foremanId: '',
        installerIds: []
      },
      modalInstance: null,
      viewModalInstance: null,
      selectedCrew: null,
      isEditing: false,
      editingCrewId: null
    }
  },
  
  computed: {
    isAdmin() {
      return this.userRoles.includes('admin') || this.currentUser?.position === 'Администратор'
    },
    
    isForeman() {
      return this.userRoles.includes('foreman') || this.currentUser?.position === 'Бригадир'
    },
    
    isInstaller() {
      return this.userRoles.includes('installer') || this.currentUser?.position === 'Монтажник'
    },
    
    // Получаем foremanId из currentUser (приоритет: прямое поле → вложенный объект)
    currentForemanId() {
      if (this.currentUser?.foremanId) return this.currentUser.foremanId
      if (this.currentUser?.foreman_id) return this.currentUser.foreman_id
      // Если есть вложенный объект foreman
      if (this.currentUser?.foreman?.foreman_id) return this.currentUser.foreman.foreman_id
      return null
    },
    
    modalTitle() {
      return this.isEditing ? 'Редактирование бригады' : 'Создание бригады'
    },
    
    saveButtonText() {
      return this.isEditing ? 'Сохранить изменения' : 'Создать бригаду'
    },
    
    // Фильтрованные бригады
    filteredCrews() {
      if (this.isAdmin) {
        return this.crews
      }
      
      if (this.isForeman && this.currentForemanId) {
        return this.crews.filter(crew => crew.foreman_id === this.currentForemanId)
      }
      
      if (this.isInstaller && this.currentUser?.installerId) {
        return this.crews.filter(crew => {
          if (crew.installers && Array.isArray(crew.installers)) {
            return crew.installers.some(installer => 
              installer.user_id === this.currentUser.id || 
              installer.installer_id === this.currentUser.installerId
            )
          }
          return false
        })
      }
      
      return []
    },
    
    canCreate() {
      return this.isAdmin || (this.isForeman && !!this.currentForemanId)
    }
  },
  
  async mounted() {
    console.log('=== CREWS PAGE MOUNTED ===')
    console.log('User roles:', this.userRoles)
    console.log('Current user:', JSON.parse(JSON.stringify(this.currentUser)))
    console.log('isAdmin:', this.isAdmin)
    console.log('isForeman:', this.isForeman)
    console.log('currentForemanId:', this.currentForemanId)
    
    if (this.isForeman && !this.currentForemanId) {
      console.warn('⚠️ Бригадир без foremanId, пытаемся получить через API...')
      await this.tryGetForemanId()
    }
    
    await Promise.all([
      this.loadCrews(),
      this.loadForemen(),
      this.loadInstallers()
    ])
    
    console.log('После загрузки:')
    console.log('- Бригады:', this.crews.length)
    console.log('- Бригадиры:', this.foremen.length)
    console.log('- Монтажники:', this.installers.length)
    console.log('- Отфильтровано:', this.filteredCrews.length)
  },
  
  methods: {
    // ✅ canEditCrew теперь МЕТОД, а не computed
    canEditCrew(crew) {
      if (!crew) return false
      if (this.isAdmin) return true
      if (this.isForeman && this.currentForemanId && crew.foreman_id === this.currentForemanId) return true
      return false
    },
    
    // ✅ canDeleteCrew теперь МЕТОД, а не computed
    canDeleteCrew(crew) {
      if (!crew) return false
      if (this.isAdmin) return true
      if (this.isForeman && this.currentForemanId && crew.foreman_id === this.currentForemanId) return true
      return false
    },
    
    async tryGetForemanId() {
      try {
        const response = await api.getForemen()
        if (response?.status === 'success' && response.data) {
          const currentUserForeman = response.data.find(f => 
            f.user_id === this.currentUser.id || 
            f.email === this.currentUser.email
          )
          if (currentUserForeman) {
            console.log('✅ Найден foreman_id через API:', currentUserForeman.foreman_id)
            this.currentUser.foremanId = currentUserForeman.foreman_id
          }
        }
      } catch (error) {
        console.error('Ошибка получения foreman_id:', error)
      }
    },
    
    async loadCrews() {
      this.loading = true
      try {
        const response = await api.getCrews()
        if (response.status === 'success') {
          const allCrews = response.data || []
          
          const detailedCrews = await Promise.allSettled(
            allCrews.map(async (crew) => {
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
          
          console.log(`Загружено ${this.crews.length} бригад, отфильтровано: ${this.filteredCrews.length}`)
        }
      } catch (error) {
        console.error('Ошибка загрузки бригад:', error)
      } finally {
        this.loading = false
      }
    },
    
    async loadForemen() {
      try {
        if (this.isAdmin) {
          const response = await api.getForemen()
          if (response.status === 'success') {
            this.foremen = response.data || []
          }
        } else if (this.isForeman) {
          try {
            const response = await api.getForemen()
            if (response.status === 'success' && response.data) {
              const myself = response.data.find(f => 
                f.user_id === this.currentUser.id || 
                f.email === this.currentUser.email
              )
              
              if (myself) {
                this.foremen = [myself]
                if (!this.currentUser.foremanId) {
                  this.currentUser.foremanId = myself.foreman_id
                }
              } else {
                this.foremen = [{
                  foreman_id: this.currentForemanId || this.currentUser.id,
                  last_name: this.currentUser.lastName || '',
                  first_name: this.currentUser.firstName || '',
                  middle_name: this.currentUser.middleName || ''
                }]
              }
            }
          } catch {
            this.foremen = [{
              foreman_id: this.currentForemanId || this.currentUser.id,
              last_name: this.currentUser.lastName || '',
              first_name: this.currentUser.firstName || ''
            }]
          }
        }
      } catch (error) {
        console.error('Error loading foremen:', error)
      }
    },
    
    async loadInstallers() {
      try {
        const response = await api.getInstallers()
        if (response.status === 'success') {
          this.installers = response.data || []
        }
      } catch (error) {
        console.error('Error loading installers:', error)
      }
    },
    
    openCreateModal() {
      if (!this.canCreate) {
        window.showToast?.('У вас нет прав на создание бригад', 'warning')
        return
      }
      
      this.isEditing = false
      this.editingCrewId = null
      this.showValidation = false
      this.resetForm()
      
      if (this.isForeman && !this.isAdmin && this.currentForemanId) {
        this.form.foremanId = this.currentForemanId
      }
      
      this.showModal()
    },
    
    async openEditModal(crew) {
      if (!this.canEditCrew(crew)) {
        window.showToast?.('У вас нет прав на редактирование этой бригады', 'warning')
        return
      }
      
      try {
        const response = await api.getCrewById(crew.crew_id)
        if (response.status === 'success') {
          const fullCrew = response.data
          this.isEditing = true
          this.editingCrewId = fullCrew.crew_id
          this.showValidation = false
          this.form = {
            foremanId: fullCrew.foreman_id || '',
            installerIds: fullCrew.installers ? fullCrew.installers.map(i => i.installer_id) : []
          }
          this.showModal()
        }
      } catch (error) {
        window.showToast?.('Ошибка загрузки данных бригады: ' + error.message, 'danger')
      }
    },
    
    async viewCrew(crew) {
      try {
        const response = await api.getCrewById(crew.crew_id)
        if (response.status === 'success') {
          this.selectedCrew = response.data
          this.showViewModal()
        }
      } catch (error) {
        window.showToast?.('Ошибка загрузки данных бригады: ' + error.message, 'danger')
      }
    },
    
    async saveCrew() {
      this.showValidation = true
      
      if (!this.form.foremanId) {
        window.showToast?.('Выберите бригадира', 'warning')
        return
      }
      
      if (this.form.installerIds.length === 0) {
        window.showToast?.('Выберите хотя бы одного монтажника', 'warning')
        return
      }
      
      if (this.isForeman && !this.isAdmin) {
        if (parseInt(this.form.foremanId) !== this.currentForemanId) {
          window.showToast?.('Вы можете создавать бригады только для себя', 'warning')
          return
        }
      }
      
      this.saving = true
      try {
        const data = {
          foremanId: parseInt(this.form.foremanId),
          installerIds: this.form.installerIds.map(id => parseInt(id))
        }
        
        let response
        if (this.isEditing) {
          response = await api.updateCrew(this.editingCrewId, data)
        } else {
          response = await api.createCrew(data)
        }
        
        if (response.status === 'success') {
          window.showToast?.(this.isEditing ? 'Бригада обновлена' : 'Бригада создана', 'success')
          this.hideModal()
          await this.loadCrews()
        }
      } catch (error) {
        window.showToast?.('Ошибка сохранения бригады: ' + error.message, 'danger')
      } finally {
        this.saving = false
      }
    },
    
    async deleteCrew(id) {
      if (!confirm(`Удалить бригаду #${id}?`)) return
      
      try {
        const response = await api.deleteCrew(id)
        if (response.status === 'success') {
          window.showToast?.('Бригада удалена', 'success')
          await this.loadCrews()
        }
      } catch (error) {
        window.showToast?.('Ошибка удаления: ' + error.message, 'danger')
      }
    },
    
    async removeInstallerFromCrew(installerId) {
      if (!this.selectedCrew) return
      if (!this.canEditCrew(this.selectedCrew)) {
        window.showToast?.('У вас нет прав на изменение этой бригады', 'warning')
        return
      }
      if (!confirm('Удалить монтажника из бригады?')) return
      
      try {
        const response = await api.removeInstallerFromCrew(this.selectedCrew.crew_id, installerId)
        if (response.status === 'success') {
          window.showToast?.('Монтажник удален', 'success')
          await this.viewCrew({ crew_id: this.selectedCrew.crew_id })
          await this.loadCrews()
        }
      } catch (error) {
        window.showToast?.('Ошибка: ' + error.message, 'danger')
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
    
    showViewModal() {
      if (!this.viewModalInstance) {
        this.viewModalInstance = new bootstrap.Modal(this.$refs.viewModalElement)
      }
      this.viewModalInstance.show()
    },
    
    resetForm() {
      this.form = {
        foremanId: (this.isForeman && !this.isAdmin && this.currentForemanId) 
          ? this.currentForemanId 
          : '',
        installerIds: []
      }
    },
    
    getForemanName(crew) {
      return crew?.foreman_name || 'Не назначен'
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
  <div class="crews-page">
    <div class="d-flex justify-content-between align-items-center mb-4">
      <h3 class="mb-0">
        <i class="bi bi-people me-2"></i>
        Управление бригадами
        <small v-if="isForeman && !isAdmin" class="text-muted ms-2 fs-6">(Мои бригады)</small>
      </h3>
      <button v-if="canCreate" class="btn btn-primary" @click="openCreateModal">
        <i class="bi bi-plus-lg me-1"></i>Создать бригаду
      </button>
    </div>

    <div class="card border-0 shadow-sm">
      <div class="table-responsive">
        <table class="table table-hover mb-0">
          <thead class="table-light">
            <tr><th>ID</th><th>Бригадир</th><th>Монтажников</th><th>Действия</th></tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td colspan="4" class="text-center py-4"><div class="spinner-border text-primary"></div></td>
            </tr>
            <tr v-else-if="filteredCrews.length === 0">
              <td colspan="4" class="text-center py-4 text-muted">
                <i class="bi bi-people" style="font-size: 2rem;"></i>
                <p class="mt-2 mb-0">Бригады не найдены</p>
              </td>
            </tr>
            <!-- ✅ Используем методы canEditCrew и canDeleteCrew -->
            <tr v-for="crew in filteredCrews" :key="crew.crew_id">
              <td><span class="badge bg-secondary">#{{ crew.crew_id }}</span></td>
              <td>
                {{ getForemanName(crew) }}
                <span v-if="isForeman && crew.foreman_id === currentForemanId" class="badge bg-success ms-1">Вы</span>
              </td>
              <td>
                <span class="badge bg-info">
                  {{ crew.installers ? crew.installers.length : (crew.installer_count || 0) }}
                </span>
              </td>
              <td>
                <div class="btn-group btn-group-sm">
                  <button class="btn btn-outline-info" @click="viewCrew(crew)"><i class="bi bi-eye"></i></button>
                  <button v-if="canEditCrew(crew)" class="btn btn-outline-primary" @click="openEditModal(crew)"><i class="bi bi-pencil"></i></button>
                  <button v-if="canDeleteCrew(crew)" class="btn btn-outline-danger" @click="deleteCrew(crew.crew_id)"><i class="bi bi-trash"></i></button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Модальное окно создания/редактирования -->
    <div class="modal fade" ref="modalElement" tabindex="-1">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header bg-light">
            <h5 class="modal-title">{{ modalTitle }}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="row">
              <div class="col-md-6">
                <label class="form-label">Бригадир <span class="text-danger">*</span></label>
                <select v-model="form.foremanId" class="form-select"
                        :class="{ 'is-invalid': showValidation && !form.foremanId }"
                        :disabled="!isAdmin">
                  <option value="">Выберите бригадира</option>
                  <option v-for="f in foremen" :key="f.foreman_id" :value="f.foreman_id">
                    {{ getFullName(f) }}
                  </option>
                </select>
              </div>
              <div class="col-md-6">
                <label class="form-label">Монтажники <span class="text-danger">*</span></label>
                <div class="border rounded p-2" style="max-height: 250px; overflow-y: auto;">
                  <div v-for="i in installers" :key="i.installer_id" class="form-check">
                    <input type="checkbox" :id="'inst_' + i.installer_id" :value="i.installer_id" v-model="form.installerIds" class="form-check-input">
                    <label :for="'inst_' + i.installer_id" class="form-check-label">{{ getFullName(i) }}</label>
                  </div>
                </div>
                <small>Выбрано: {{ form.installerIds.length }}</small>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" data-bs-dismiss="modal">Отмена</button>
            <button class="btn btn-primary" @click="saveCrew" :disabled="saving">
              {{ saveButtonText }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Модальное окно просмотра -->
    <div class="modal fade" ref="viewModalElement" tabindex="-1">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header bg-primary text-white">
            <h5 class="modal-title">Бригада #{{ selectedCrew?.crew_id }}</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body" v-if="selectedCrew">
            <h5>{{ getForemanName(selectedCrew) }}</h5>
            <p v-if="selectedCrew.installers?.length">
              Монтажники: {{ selectedCrew.installers.map(i => getFullName(i)).join(', ') }}
            </p>
            <p v-else class="text-muted">Нет монтажников</p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" data-bs-dismiss="modal">Закрыть</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.crews-page { padding: 1rem; }
.table th, .table td { vertical-align: middle; }
.btn-group .btn { padding: 0.25rem 0.5rem; }
</style>