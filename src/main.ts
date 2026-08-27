import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { library } from "@fortawesome/fontawesome-svg-core";
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import './styles/global.scss'
import VApp from './VApp.vue'

import "overlayscrollbars/styles/overlayscrollbars.css";
import "json-tree-view-vue3/style.css";


// @ts-ignore
import {
  faCircleHalfStroke,
  faLock,
  faLockOpen,
  faCaretRight,
} from "@fortawesome/free-solid-svg-icons";

library.add(faCircleHalfStroke, faLock, faLockOpen, faCaretRight)

const app = createApp(VApp)

app.component("icon", FontAwesomeIcon);

app.use(ElementPlus)
app.mount('#app')
