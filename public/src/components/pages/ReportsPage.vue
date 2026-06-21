<script>
import { api } from '../../services/api.js'

export default {
  name: 'ReportsPage',
  
  props: {
    userRoles: {
      type: Array,
      default: () => []
    }
  },
  
  data() {
    return {
      activeTab: 'work-orders',
      startDate: '',
      endDate: '',
      reportData: null,
      loading: false,
      
      // AI анализ
      aiAnalyzing: false,
      aiResult: null,
      showAiModal: false,
      
      // Настройки AI (только в коде)
      aiToken: 'sk-at-3r7r11TAY633pbUX3ynOg9zlQuz7Km5prJh3ydY05ec',
      aiModel: 'alltokens/owl-alpha',
      aiEndpoint: 'https://api.alltokens.ru/api/v1/chat/completions'
    }
  },
  
  created() {
    const today = new Date()
    const monthAgo = new Date()
    monthAgo.setMonth(monthAgo.getMonth() - 1)
    
    this.startDate = monthAgo.toISOString().split('T')[0]
    this.endDate = today.toISOString().split('T')[0]
  },
  
  async mounted() {
    await this.loadReport()
  },
  
  methods: {
    async loadReport() {
      this.loading = true
      const params = {
        startDate: this.startDate,
        endDate: this.endDate
      }
      
      try {
        let response
        switch (this.activeTab) {
          case 'work-orders':
            response = await api.getWorkOrdersReport(params)
            break
          case 'performance':
            response = await api.getPerformanceReport(params)
            break
          case 'assets':
            response = await api.getAssetReport(params)
            break
        }
        
        if (response && response.status === 'success') {
          this.reportData = response.data
        }
      } catch (error) {
        window.showToast('Ошибка загрузки отчета: ' + error.message, 'danger')
      } finally {
        this.loading = false
      }
    },
    
    /**
     * AI анализ отчета
     */
    async analyzeWithAI() {
      if (!this.reportData) {
        window.showToast('Сначала сформируйте отчет', 'warning')
        return
      }
      
      this.aiAnalyzing = true
      this.aiResult = null
      this.showAiModal = true
      
      try {
        const prompt = this.buildAIPrompt()
        
        const response = await fetch(this.aiEndpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.aiToken}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': window.location.href,
            'X-Title': 'Service Desk Reports'
          },
          body: JSON.stringify({
            model: this.aiModel,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: prompt
                  }
                ]
              }
            ]
          })
        })
        
        if (!response.ok) {
          const errorText = await response.text()
          let errorMessage = `HTTP ${response.status}: ${response.statusText}`
          try {
            const errorData = JSON.parse(errorText)
            errorMessage = errorData.message || errorData.error || errorMessage
          } catch (e) {}
          throw new Error(errorMessage)
        }
        
        const data = await response.json()
        
        if (data.choices && data.choices[0]?.message?.content) {
          this.aiResult = data.choices[0].message.content
        } else if (data.choices && data.choices[0]?.text) {
          this.aiResult = data.choices[0].text
        } else {
          this.aiResult = 'Неизвестный формат ответа'
        }
        
      } catch (error) {
        console.error('AI анализ:', error)
        this.aiResult = `❌ ${error.message}`
        window.showToast('Ошибка AI анализа', 'warning')
      } finally {
        this.aiAnalyzing = false
      }
    },
    
    buildAIPrompt() {
      const periodText = `Период: с ${this.formatDate(this.startDate)} по ${this.formatDate(this.endDate)}`
      let reportTypeText = ''
      let dataText = ''
      
      switch (this.activeTab) {
        case 'work-orders':
          reportTypeText = 'отчет по заявкам на обслуживание'
          dataText = this.formatWorkOrdersData()
          break
        case 'performance':
          reportTypeText = 'отчет по производительности исполнителей'
          dataText = this.formatPerformanceData()
          break
        case 'assets':
          reportTypeText = 'отчет по оборудованию'
          dataText = this.formatAssetsData()
          break
      }
      
      return `Ты — опытный бизнес-аналитик. Проанализируй ${reportTypeText}. ${periodText}

Данные отчета:
${dataText}

Предоставь анализ в следующем формате (используй маркированные списки и эмодзи):

📊 **Ключевые метрики**
- Краткая сводка основных показателей

📈 **Тренды и закономерности**
- Что бросается в глаза
- Какие тенденции прослеживаются

⚠️ **Проблемные зоны**
- Что требует внимания
- Где узкие места

💡 **Рекомендации**
- Конкретные шаги для улучшения ситуации

🎯 **Прогноз**
- Что ожидать в следующем периоде`
    },
    
    formatWorkOrdersData() {
      if (!this.reportData?.summary) return 'Нет данных'
      
      const s = this.reportData.summary
      const total = s.total || 1
      let text = `- Всего заявок: ${s.total || 0}
- Новых: ${s.new_count || 0}
- Выполнено: ${s.completed_count || 0}
- Отменено: ${s.cancelled_count || 0}
- Процент выполнения: ${((s.completed_count || 0) / total * 100).toFixed(1)}%
- Процент отмен: ${((s.cancelled_count || 0) / total * 100).toFixed(1)}%
`
      
      if (this.reportData.byCategory?.length) {
        text += '\nПо категориям:\n'
        this.reportData.byCategory.forEach(item => {
          text += `- ${item.category_name}: ${item.count}\n`
        })
      }
      
      return text
    },
    
    formatPerformanceData() {
      if (!this.reportData?.performers?.length) return 'Нет данных'
      
      let text = `Исполнителей: ${this.reportData.performers.length}\n`
      const sorted = [...this.reportData.performers]
        .sort((a, b) => (b.completed_orders || 0) - (a.completed_orders || 0))
      
      sorted.forEach((perf, i) => {
        const rate = perf.total_orders > 0 
          ? ((perf.completed_orders / perf.total_orders) * 100).toFixed(1) 
          : 0
        text += `${i + 1}. ${perf.performer_name}: ${perf.completed_orders}/${perf.total_orders} (${rate}%)\n`
      })
      
      return text
    },
    
    formatAssetsData() {
      if (!this.reportData?.assets?.length) return 'Нет данных'
      
      let text = `Оборудования: ${this.reportData.assets.length}\n`
      const sorted = [...this.reportData.assets]
        .sort((a, b) => (b.total_orders || 0) - (a.total_orders || 0))
      
      sorted.forEach((asset, i) => {
        text += `${i + 1}. ${asset.model} (№${asset.number}): ${asset.total_orders} заявок, последняя: ${this.formatDate(asset.last_order_date)}\n`
      })
      
      text += `\nТоп-3 проблемного: ${sorted.slice(0, 3).map(a => a.model).join(', ')}`
      return text
    },
    
    renderMarkdown(text) {
      if (!text) return ''
      
      let html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
      
      html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      html = html.replace(/\*(.*?)\*/g, '<em>$1</em>')
      html = html.replace(/^### (.*$)/gim, '<h5 class="mt-3 mb-2">$1</h5>')
      html = html.replace(/^## (.*$)/gim, '<h4 class="mt-3 mb-2">$1</h4>')
      html = html.replace(/^# (.*$)/gim, '<h3 class="mt-3 mb-2">$1</h3>')
      html = html.replace(/^[\s]*[-*] (.*$)/gim, '<li>$1</li>')
      html = html.replace(/^[\s]*\d+\. (.*$)/gim, '<li>$1</li>')
      html = html.replace(/(<li>.*?<\/li>)/gs, '<ul class="mb-2">$1</ul>')
      html = html.replace(/<\/ul>\s*<ul class="mb-2">/g, '')
      html = html.replace(/\n\n/g, '</p><p>')
      html = html.replace(/\n/g, '<br>')
      
      if (!html.startsWith('<')) html = '<p>' + html + '</p>'
      return html
    },
    
    formatDate(date) {
      if (!date) return '-'
      return new Date(date).toLocaleDateString('ru-RU')
    },
    
    closeAiModal() {
      this.showAiModal = false
    }
  }
}
</script>

<template>
  <div class="reports-page">
    <h3 class="mb-4">
      <i class="bi bi-bar-chart me-2"></i>
      Отчеты
    </h3>
    
    <!-- Выбор отчета -->
    <div class="card border-0 shadow-sm mb-4">
      <div class="card-body">
        <div class="row g-3 align-items-end">
          <div class="col-md-3">
            <label class="form-label">Тип отчета</label>
            <select v-model="activeTab" class="form-select" @change="loadReport">
              <option value="work-orders">По заявкам</option>
              <option value="performance">Производительность</option>
              <option value="assets">По оборудованию</option>
            </select>
          </div>
          <div class="col-md-3">
            <label class="form-label">Начало периода</label>
            <input v-model="startDate" type="date" class="form-control" @change="loadReport">
          </div>
          <div class="col-md-3">
            <label class="form-label">Конец периода</label>
            <input v-model="endDate" type="date" class="form-control" @change="loadReport">
          </div>
          <div class="col-md-3">
            <button class="btn btn-primary w-100" @click="loadReport" :disabled="loading">
              <i class="bi bi-arrow-repeat me-1"></i>
              Обновить
            </button>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Результаты отчета -->
    <div class="card border-0 shadow-sm">
      <div class="card-body">
        <!-- Кнопка AI анализа -->
        <div v-if="reportData" class="d-flex justify-content-end mb-3">
          <button 
            class="btn btn-primary" 
            @click="analyzeWithAI" 
            :disabled="aiAnalyzing"
          >
            <span v-if="aiAnalyzing">
              <span class="spinner-border spinner-border-sm me-2"></span>
              Анализирую...
            </span>
            <span v-else>AI Анализ</span>
          </button>
        </div>
        
        <!-- Загрузка -->
        <div v-if="loading" class="text-center py-5">
          <div class="spinner-border text-primary"></div>
          <p class="mt-2 text-muted">Формирование отчета...</p>
        </div>
        
        <!-- Нет данных -->
        <div v-else-if="!reportData" class="text-center py-5 text-muted">
          <i class="bi bi-bar-chart" style="font-size: 3rem;"></i>
          <p class="mt-2">Выберите параметры и нажмите "Обновить"</p>
        </div>
        
        <!-- Отчет по заявкам -->
        <div v-else-if="activeTab === 'work-orders'">
          <h5>Статистика по заявкам</h5>
          
          <div class="row g-3 mb-4">
            <div class="col-md-3" v-if="reportData.summary">
              <div class="border rounded p-3 text-center">
                <h3>{{ reportData.summary.total || 0 }}</h3>
                <small class="text-muted">Всего</small>
              </div>
            </div>
            <div class="col-md-3" v-if="reportData.summary">
              <div class="border rounded p-3 text-center">
                <h3>{{ reportData.summary.new_count || 0 }}</h3>
                <small class="text-muted">Новых</small>
              </div>
            </div>
            <div class="col-md-3" v-if="reportData.summary">
              <div class="border rounded p-3 text-center">
                <h3>{{ reportData.summary.completed_count || 0 }}</h3>
                <small class="text-muted">Выполнено</small>
              </div>
            </div>
            <div class="col-md-3" v-if="reportData.summary">
              <div class="border rounded p-3 text-center">
                <h3>{{ reportData.summary.cancelled_count || 0 }}</h3>
                <small class="text-muted">Отменено</small>
              </div>
            </div>
          </div>
          
          <div v-if="reportData.byCategory && reportData.byCategory.length" class="mb-4">
            <h6>По категориям</h6>
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>Категория</th>
                  <th>Количество</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in reportData.byCategory" :key="item.category_name">
                  <td>{{ item.category_name }}</td>
                  <td>{{ item.count }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        
        <!-- Отчет по производительности -->
        <div v-else-if="activeTab === 'performance'">
          <h5>Производительность исполнителей</h5>
          <table class="table" v-if="reportData.performers && reportData.performers.length">
            <thead>
              <tr>
                <th>Исполнитель</th>
                <th>Всего заявок</th>
                <th>Выполнено</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="perf in reportData.performers" :key="perf.performer_name">
                <td>{{ perf.performer_name }}</td>
                <td>{{ perf.total_orders }}</td>
                <td>{{ perf.completed_orders }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        
        <!-- Отчет по оборудованию -->
        <div v-else-if="activeTab === 'assets'">
          <h5>Статистика по оборудованию</h5>
          <table class="table" v-if="reportData.assets && reportData.assets.length">
            <thead>
              <tr>
                <th>Модель</th>
                <th>Серийный номер</th>
                <th>Всего заявок</th>
                <th>Последняя заявка</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="asset in reportData.assets" :key="asset.number">
                <td>{{ asset.model }}</td>
                <td>{{ asset.number }}</td>
                <td>{{ asset.total_orders }}</td>
                <td>{{ formatDate(asset.last_order_date) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
    
    <!-- Модальное окно AI анализа -->
    <div v-if="showAiModal" class="modal-backdrop-custom" @click.self="closeAiModal">
      <div class="ai-modal-card">
        <div class="ai-modal-header">
          <h5 class="mb-0">
            AI Анализ отчета
          </h5>
          <button class="btn-close" @click="closeAiModal"></button>
        </div>
        
        <div class="ai-modal-body">
          <!-- Загрузка -->
          <div v-if="aiAnalyzing" class="text-center py-5">
            <div class="ai-loading-icon mb-3">
              <span class="dot-pulse"></span>
            </div>
            <p class="text-muted">Анализирую данные...</p>
          </div>
          
          <!-- Результат -->
          <div v-else-if="aiResult" class="ai-result-content">
            <div class="markdown-content" v-html="renderMarkdown(aiResult)"></div>
          </div>
          
          <!-- Ошибка -->
          <div v-else class="text-center py-5 text-danger">
            <i class="bi bi-exclamation-triangle" style="font-size: 2rem;"></i>
            <p class="mt-2">Не удалось получить результат</p>
          </div>
        </div>
        
        <div class="ai-modal-footer">
          <small class="text-muted me-auto">
            {{ formatDate(startDate) }} — {{ formatDate(endDate) }}
          </small>
          <button class="btn btn-secondary btn-sm me-2" @click="closeAiModal">Закрыть</button>
          <button 
            v-if="!aiAnalyzing"
            class="btn btn-primary btn-sm" 
            @click="analyzeWithAI"
          >
            <i class="bi bi-arrow-repeat me-1"></i>Обновить
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>

.modal-backdrop-custom {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
}

.ai-modal-card {
  background: white;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  width: 90%;
  max-width: 800px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  animation: slideUp 0.3s ease-out;
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(30px); }
  to { opacity: 1; transform: translateY(0); }
}

.ai-modal-header {
  padding: 1.5rem;
  border-bottom: 1px solid #e9ecef;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.ai-modal-body {
  padding: 1.5rem;
  overflow-y: auto;
  flex: 1;
}

.ai-modal-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid #e9ecef;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.dot-pulse {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #667eea;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.5); opacity: 0.5; }
}

.markdown-content {
  line-height: 1.7;
  color: #333;
}

.markdown-content :deep(strong) { color: #2c3e50; font-weight: 600; }
.markdown-content :deep(h3) { color: #1a237e; font-size: 1.2rem; }
.markdown-content :deep(h4) { color: #283593; font-size: 1.1rem; }
.markdown-content :deep(h5) { color: #3949ab; font-size: 1rem; }
.markdown-content :deep(ul) { padding-left: 1.5rem; margin-bottom: 1rem; }
.markdown-content :deep(li) { margin-bottom: 0.3rem; }
.markdown-content :deep(p) { margin-bottom: 0.8rem; }
</style>