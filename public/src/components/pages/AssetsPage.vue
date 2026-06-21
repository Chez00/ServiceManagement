<script>
import { api } from '../../services/api.js'

export default {
  name: 'AssetsPage',
  
  props: {
    userRoles: {
      type: Array,
      default: () => []
    }
  },
  
  data() {
    return {
      assets: [],
      loading: false,
      saving: false,
      editingId: null,
      form: {
        model: '',
        number: ''
      },
      errors: {},
      modalInstance: null
    }
  },
  
  computed: {
    canEdit() {
      return this.userRoles.includes('foreman') || this.userRoles.includes('admin')
    }
  },
  
  async mounted() {
    await this.loadAssets()
  },
  
  methods: {
    async loadAssets() {
      this.loading = true
      try {
        const response = await api.getAssets()
        if (response.status === 'success') {
          this.assets = response.data || []
        }
      } catch (error) {
        window.showToast('Ошибка загрузки ТС: ' + error.message, 'danger')
      } finally {
        this.loading = false
      }
    },
    
    openCreateModal() {
      this.editingId = null
      this.resetForm()
      this.errors = {}
      this.showModal()
    },
    
    async openEditModal(id) {
      try {
        const response = await api.getAsset(id)
        if (response.status === 'success') {
          const asset = response.data
          this.editingId = asset.asset_id
          this.form = {
            model: asset.model || '',
            number: asset.number || ''
          }
          this.errors = {}
          this.showModal()
        }
      } catch (error) {
        window.showToast('Ошибка загрузки ТС: ' + error.message, 'danger')
      }
    },
    
    async saveAsset() {
      this.errors = {}
      
      if (!this.form.model.trim()) this.errors.model = 'Введите модель'
      if (!this.form.number.trim()) this.errors.number = 'Введите серийный номер'
      
      if (Object.keys(this.errors).length > 0) return
      
      this.saving = true
      try {
        const data = {
          model: this.form.model.trim(),
          number: this.form.number.trim()
        }
        
        let response
        if (this.editingId) {
          response = await api.updateAsset(this.editingId, data)
        } else {
          response = await api.createAsset(data)
        }
        
        if (response.status === 'success') {
          window.showToast(
            this.editingId ? 'ТС обновлено' : 'ТС добавлено',
            'success'
          )
          this.hideModal()
          await this.loadAssets()
        }
      } catch (error) {
        window.showToast('Ошибка сохранения: ' + error.message, 'danger')
      } finally {
        this.saving = false
      }
    },
    
    async deleteAsset(id) {
      if (confirm(`Удалить ТС #${id}?`)) {
        try {
          await api.deleteAsset(id)
          window.showToast('ТС удалено', 'success')
          await this.loadAssets()
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
      this.form = { model: '', number: '' }
    }
  }
}
</script>

<template>
  <div class="assets-page">
    <div class="d-flex justify-content-between align-items-center mb-4">
      <h3 class="mb-0">
        <i class="bi bi-laptop me-2"></i>
        Управление ТС
      </h3>
      <button v-if="canEdit" class="btn btn-primary" @click="openCreateModal">
        <i class="bi bi-plus-lg me-1"></i>
        Добавить ТС
      </button>
    </div>

    <div class="card border-0 shadow-sm">
      <div class="table-responsive">
        <table class="table table-hover mb-0">
          <thead class="table-light">
            <tr>
              <th>№</th>
              <th>Модель</th>
              <th>Серийный номер</th>
              <th v-if="canEdit">Действия</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td :colspan="canEdit ? 4 : 3" class="text-center py-4">
                <div class="spinner-border text-primary"></div>
              </td>
            </tr>
            <tr v-else-if="assets.length === 0">
              <td :colspan="canEdit ? 4 : 3" class="text-center py-4 text-muted">
                <i class="bi bi-laptop" style="font-size: 2rem;"></i>
                <p class="mt-2 mb-0">ТС не найдено</p>
              </td>
            </tr>
            <tr v-for="(asset, index) in assets" :key="asset.asset_id">
              <td>{{ index + 1}}</td>
              <td>{{ asset.model }}</td>
              <td><code>{{ asset.number }}</code></td>
              <td v-if="canEdit">
                <div class="btn-group btn-group-sm">
                  <button class="btn btn-outline-primary" @click="openEditModal(asset.asset_id)">
                    <i class="bi bi-pencil"></i>
                  </button>
                  <button class="btn btn-outline-danger" @click="deleteAsset(asset.asset_id)">
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
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">
              {{ editingId ? 'Редактирование' : 'Добавление' }} ТС
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="mb-3">
              <label class="form-label">Модель <span class="text-danger">*</span></label>
              <input v-model="form.model" type="text" class="form-control"
                     :class="{ 'is-invalid': errors.model }">
              <div class="invalid-feedback">{{ errors.model }}</div>
            </div>
            <div class="mb-3">
              <label class="form-label">Серийный номер <span class="text-danger">*</span></label>
              <input v-model="form.number" type="text" class="form-control"
                     :class="{ 'is-invalid': errors.number }">
              <div class="invalid-feedback">{{ errors.number }}</div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Отмена</button>
            <button type="button" class="btn btn-primary" @click="saveAsset" :disabled="saving">
              {{ editingId ? 'Обновить' : 'Добавить' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>