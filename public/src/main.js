import { createApp } from 'vue'
import App from './App.vue'
import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap-icons/font/bootstrap-icons.css'
import * as bootstrap from 'bootstrap'

window.bootstrap = bootstrap

import './../styles/main.css'

const app = createApp(App)
app.mount('#app')