import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { library } from "@fortawesome/fontawesome-svg-core";
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import './styles/global.scss'
import VApp from './VApp.vue'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import { vPopup } from './directives/popup';
import { AppRoamingState } from './api/data/AppRoamingState';
import { AppStaticSettings } from './api/data/AppStaticSettings';
  

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

for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

app.component("icon", FontAwesomeIcon);

app.use(ElementPlus)
app.directive('popup', vPopup)

app.config.globalProperties.$roamingState = AppRoamingState;
app.config.globalProperties.$settings = AppStaticSettings;

app.mount('#app')
