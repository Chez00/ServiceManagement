<script>
export default {
  name: 'AppSidebar',
  
  props: {
    userRoles: {
      type: Array,
      default: () => []
    },
    currentPage: {
      type: String,
      default: 'dashboard'
    }
  },
  
  computed: {
    menuItems() {
      const items = [
        { page: 'dashboard', label: 'Панель управления', icon: 'bi-speedometer2' },
        { page: 'work-orders', label: 'Заявки', icon: 'bi-clipboard-check' },
        
      ]
      if(this.userRoles.includes('admin')){
        items.push(
          { page: 'assign-crew', label: 'Назначение бригад', icon: 'bi-people-fill' },
          { page: 'crews', label: 'Бригады', icon: 'bi-people' },
          { page: 'users', label: 'Пользователи', icon: 'bi-person-gear' },
          { page: 'assets', label: 'ТС', icon: 'bi-laptop' },
          { page: 'reports', label: 'Отчеты', icon: 'bi-bar-chart' }
      )
      }
      
      if (this.userRoles.includes('foreman')) {
        items.push(
          { page: 'assign-crew', label: 'Назначение бригад', icon: 'bi-people-fill' },
          { page: 'crews', label: 'Бригады', icon: 'bi-people' },
        )
      }
      if (this.userRoles.includes('сustomer')) {
        items.push(
          { page: 'assets', label: 'ТС', icon: 'bi-laptop' }
        )
      }
      
      return items
    }
  },
  
  methods: {
    closeOnMobile() {
      if (window.innerWidth < 768) {
        const sidebar = document.querySelector('.app-sidebar')
        if (sidebar) {
          sidebar.classList.remove('show')
        }
      }
    }
  }
}
</script>

<template>
  <aside class="app-sidebar">
    <div class="sidebar-header p-3 d-md-none">
      <h5 class="mb-0">Меню</h5>
    </div>
    
    <nav class="sidebar-nav">
      <a v-for="item in menuItems" 
         :key="item.page"
         :href="'#' + item.page"
         class="nav-link"
         :class="{ active: currentPage === item.page }"
         @click="closeOnMobile">
        <i :class="'bi ' + item.icon + ' me-2'"></i>
        <span>{{ item.label }}</span>
      </a>
    </nav>
  </aside>
</template>

<style scoped>
.app-sidebar {
  position: fixed;
  top: 56px;
  left: 0;
  bottom: 0;
  width: 250px;
  background: white;
  border-right: 1px solid #e5e7eb;
  overflow-y: auto;
  z-index: 1020;
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  border-bottom: 1px solid #e5e7eb;
  background: #f8fafc;
}

.sidebar-nav {
  flex: 1;
  padding: 0.5rem 0;
}

.nav-link {
  display: flex;
  align-items: center;
  padding: 0.75rem 1.25rem;
  color: #64748b;
  text-decoration: none;
  transition: all 0.2s;
  border-left: 3px solid transparent;
  font-size: 0.9rem;
}

.nav-link:hover {
  background: #f1f5f9;
  color: #1e293b;
}

.nav-link.active {
  background: #eff6ff;
  color: #2563eb;
  border-left-color: #2563eb;
  font-weight: 500;
}

.sidebar-footer {
  border-top: 1px solid #e5e7eb;
  background: #f8fafc;
}

@media (max-width: 768px) {
  .app-sidebar {
    transform: translateX(-100%);
    transition: transform 0.3s ease;
  }
  
  .app-sidebar.show {
    transform: translateX(0);
    box-shadow: 4px 0 10px rgba(0,0,0,0.1);
  }
}
</style>