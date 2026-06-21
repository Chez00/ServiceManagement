<script>
export default {
  name: 'ToastContainer',
  
  data() {
    return {
      toasts: []
    }
  },
  
  mounted() {
    window.showToast = this.showToast
  },
  
  methods: {
    showToast(message, type = 'info', duration = 4000) {
      const id = Date.now() + Math.random()
      
      this.toasts.push({ id, message, type })
      
      setTimeout(() => {
        this.removeToast(id)
      }, duration)
    },
    
    removeToast(id) {
      const index = this.toasts.findIndex(t => t.id === id)
      if (index > -1) {
        this.toasts.splice(index, 1)
      }
    },
    
    getIcon(type) {
      const icons = {
        success: 'bi-check-circle-fill',
        danger: 'bi-exclamation-triangle-fill',
        warning: 'bi-exclamation-triangle-fill',
        info: 'bi-info-circle-fill'
      }
      return icons[type] || icons.info
    }
  }
}
</script>

<template>
  <div class="toast-container position-fixed top-0 end-0 p-3">
    <div v-for="toast in toasts" 
         :key="toast.id"
         class="toast align-items-center border-0 show"
         :class="'text-bg-' + toast.type"
         role="alert">
      <div class="d-flex">
        <div class="toast-body">
          <i :class="'bi ' + getIcon(toast.type) + ' me-2'"></i>
          {{ toast.message }}
        </div>
        <button type="button" 
                class="btn-close btn-close-white me-2 m-auto" 
                @click="removeToast(toast.id)"></button>
      </div>
    </div>
  </div>
</template>