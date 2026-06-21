<script>
export default {
  name: 'AppHeader',
  
  props: {
    user: {
      type: Object,
      default: null
    }
  },
  
  emits: ['logout'],
  
  methods: {
    toggleSidebar() {
      const sidebar = document.querySelector('.app-sidebar')
      if (sidebar) {
        sidebar.classList.toggle('show')
      }
    }
  }
}
</script>

<template>
  <header class="app-header">
    <div class="container-fluid h-100">
      <div class="d-flex align-items-center justify-content-between h-100">
        <div class="d-flex align-items-center">
          <button class="btn btn-link text-white me-3 d-md-none" @click="toggleSidebar">
            <i class="bi bi-list fs-4"></i>
          </button>
          <h4 class="mb-0">
            <!-- <i class="bi bi-tools me-2"></i> -->
            Система управления заявками
          </h4>
        </div>
        
        <div class="d-flex align-items-center gap-3">
          <div class="text-end d-none d-md-block">
            <div class="fw-semibold small">
              {{ user?.firstName }} {{ user?.lastName }}
            </div>
            <small class="text-white-50">
              {{ user?.position || 'Пользователь' }}
            </small>
          </div>
          
          <button class="btn btn-outline-light btn-sm" @click="$emit('logout')">
            <i class="bi bi-box-arrow-right me-1"></i>
            Выйти
          </button>
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 56px;
  background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%);
  color: white;
  z-index: 1030;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}
</style>