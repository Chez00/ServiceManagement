<script>
import { api } from '../../services/api.js'

export default {
  name: 'LoginPage',
  
  emits: ['login-success'],
  
  data() {
    return {
      email: 'admin@example.com',
      password: '12345678',
      error: '',
      loading: false
    }
  },
  
  methods: {
    async handleLogin() {
      this.error = ''
      
      if (!this.email || !this.password) {
        this.error = 'Введите email и пароль'
        return
      }
      
      this.loading = true
      try {
        const response = await api.login(this.email, this.password)
        if (response.status === 'success') {
          this.$emit('login-success', response.data.user)
        } else {
          this.error = response.message || 'Ошибка входа'
        }
      } catch (error) {
        this.error = error.message || 'Ошибка входа'
      } finally {
        this.loading = false
      }
    }
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <div class="text-center mb-4">
        <div class="login-icon">
          <i class="bi bi-tools"></i>
        </div>
        <h2 class="mt-3">Система управления заявками</h2>
        
      </div>
      
      <div v-if="error" class="alert alert-danger alert-dismissible fade show">
        <i class="bi bi-exclamation-circle me-2"></i>{{ error }}
        <button type="button" class="btn-close" @click="error = ''"></button>
      </div>
      
      <form @submit.prevent="handleLogin">
        <div class="mb-3">
          <label class="form-label">
            <i class="bi bi-envelope me-1"></i>Email
          </label>
          <input 
            v-model="email" 
            type="email" 
            class="form-control form-control-lg" 
            placeholder="Введите email"
            required
            autofocus>
        </div>
        <div class="mb-4">
          <label class="form-label">
            <i class="bi bi-lock me-1"></i>Пароль
          </label>
          <input 
            v-model="password" 
            type="password" 
            class="form-control form-control-lg" 
            placeholder="Введите пароль"
            required>
        </div>
        <button type="submit" class="btn btn-primary w-100 btn-lg" :disabled="loading">
          <span v-if="loading" class="spinner-border spinner-border-sm me-2"></span>
          <i v-else class="bi bi-box-arrow-in-right me-2"></i>
          Войти в систему
        </button>
      </form>
      
      <div class="text-center mt-4">
        <!-- <small class="text-muted">
          Демо: <code>admin@example.com</code> / <code>password123</code>
        </small> -->
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  /* background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); */
}

.login-card {
  background: white;
  border-radius: 12px;
  padding: 40px;
  width: 100%;
  max-width: 420px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.3);
}

.login-icon {
  width: 80px;
  height: 80px;
  margin: 0 auto;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.login-icon i {
  font-size: 2.5rem;
  color: white;
}
</style>