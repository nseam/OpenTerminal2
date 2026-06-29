import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import AutoImport from 'unplugin-auto-import/vite'
import VueFacingDecoratorHMR from 'vite-plugin-vue-facing-decorator-hmr'

const dtsAutoImports = true

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@shared': '/src',
    },
  },
  plugins: [
    vue(),
    vueJsx(),
    AutoImport({
      imports: [
        {
          'vue-facing-decorator': [
            'Component', 'Vue', 'Prop', 'Vanilla', 'Hook', 'Emit',
            'Ref', 'Watch', 'Provide', 'Inject', 'Model', 'Setup', 'toNative'
          ]
        }
      ],
      dts: dtsAutoImports,
    }),
    VueFacingDecoratorHMR(),
  ],
  assetsInclude: ['**/*.wasm'],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
})
