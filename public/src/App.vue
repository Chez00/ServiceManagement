<script>
import AppHeader from './components/layout/AppHeader.vue'
import AppSidebar from './components/layout/AppSidebar.vue'
import ToastContainer from './components/common/ToastContainer.vue'
import LoginPage from './components/pages/LoginPage.vue'
import DashboardPage from './components/pages/DashboardPage.vue'
import WorkOrdersPage from './components/pages/WorkOrdersPage.vue'
import AssetsPage from './components/pages/AssetsPage.vue'
import CrewsPage from './components/pages/CrewsPage.vue'
import UsersPage from './components/pages/UsersPage.vue'
import ReportsPage from './components/pages/ReportsPage.vue'
import AssignCrewPage from './components/pages/AssignCrewPage.vue'
import { api } from './services/api.js'

export default {
  name: 'App',
  
  components: {
    AppHeader,
    AppSidebar,
    ToastContainer,
    LoginPage,
    DashboardPage,
    WorkOrdersPage,
    AssetsPage,
    CrewsPage,
    UsersPage,
    ReportsPage,
    AssignCrewPage
  },
  
  data() {
    return {
      isAuthenticated: false,
      currentUser: null,
      userRoles: [],
      currentPage: 'dashboard'
    }
  },
  
  created() {
    this.checkAuth()
    window.addEventListener('hashchange', this.handleHashChange)
    this.handleHashChange()
  },
  
  methods: {
    checkAuth() {
      const token = localStorage.getItem('token')
      if (token) {
        const user = JSON.parse(localStorage.getItem('user') || 'null')
        if (user) {
          this.currentUser = user
          this.userRoles = user.roles || []
          this.isAuthenticated = true
        }
      }
    },
    
    handleHashChange() {
      const hash = window.location.hash.slice(1) || 'dashboard'
      const validPages = [
        'dashboard', 
        'work-orders', 
        'assets', 
        'crews', 
        'users', 
        'reports',
        'assign-crew'
      ]
      
      if (!this.isAuthenticated) {
        window.location.hash = '#login'
        return
      }
      
      if (hash === 'login' && this.isAuthenticated) {
        window.location.hash = '#dashboard'
        return
      }
      
      this.currentPage = validPages.includes(hash) ? hash : 'dashboard'
    },
    
    handleLoginSuccess(user) {
      this.currentUser = user
      this.userRoles = user.roles || []
      this.isAuthenticated = true
      window.location.hash = '#dashboard'
    },
    
    async handleLogout() {
      try {
        await api.logout()
      } catch (e) {}
      
      localStorage.removeItem('token')
      localStorage.removeItem('refreshToken')
      localStorage.removeItem('user')
      
      this.isAuthenticated = false
      this.currentUser = null
      this.userRoles = []
      window.location.hash = '#login'
    }
  }
}
</script>

<template>
  <div id="app-root">
    <AppHeader 
      v-if="isAuthenticated"
      :user="currentUser"
      @logout="handleLogout"
    />
    
    <div class="app-layout" v-if="isAuthenticated">
      <AppSidebar 
        :user-roles="userRoles"
        :current-page="currentPage"
      />
      
      <main class="main-content">
        <DashboardPage v-if="currentPage === 'dashboard'" />
        
        <!-- Исправлено: добавлен :current-user -->
        <WorkOrdersPage 
          v-if="currentPage === 'work-orders'"
          :user-roles="userRoles"
          :current-user="currentUser"
        />
        
        <AssetsPage 
          v-if="currentPage === 'assets'"
          :user-roles="userRoles"
          :current-user="currentUser"
        />
        
        <CrewsPage 
          v-if="currentPage === 'crews'"
          :user-roles="userRoles"
          :current-user="currentUser"
        />
        
        <UsersPage 
          v-if="currentPage === 'users'"
          :user-roles="userRoles"
          :current-user="currentUser"
        />
        
        <ReportsPage 
          v-if="currentPage === 'reports'"
          :user-roles="userRoles"
          :current-user="currentUser"
        />
        
        <AssignCrewPage 
          v-if="currentPage === 'assign-crew'"
          :user-roles="userRoles"
          :current-user="currentUser"
        />
      </main>
    </div>
    
    <LoginPage 
      v-if="!isAuthenticated"
      @login-success="handleLoginSuccess"
    />
    
    <ToastContainer />
  </div>
</template>

<style>
#app-root {
  min-height: 100vh;
}

.app-layout {
  display: flex;
  min-height: calc(100vh - 56px);
  margin-top: 56px;
}

.main-content {
  margin-left: 250px;
  padding: 24px;
  flex: 1;
  max-width: calc(100% - 250px);
  min-height: calc(100vh - 56px);
  background-color: #f5f7fa;
}

@media (max-width: 768px) {
  .main-content {
    margin-left: 0;
    max-width: 100%;
    padding: 16px;
  }
}
</style>