import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import './styles/global.scss'
import VApp from './VApp.vue'

const app = createApp(VApp)
app.use(ElementPlus)
app.mount('#app')
