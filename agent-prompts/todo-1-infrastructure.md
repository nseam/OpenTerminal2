Initialize a NPM project named `OpenTerminal` in the root folder of this VS Code project. Don't create separate folder for the project. Let the project  consist of those features:

- It will use `Vue 3` with `Vite` and TypeScript language.

- When creating Vue components, make an empty newlines after those tags, and before they ends: `<template> ... </template>`, `<script> ... </script>`, `<style> ... </style>`. Also make sure that content of those tags are indented.

- Let the `vue-tsc` npm package be in version `^3.0.1`

- I want to use `@vue/language-server` npm package with version `~3.0.0`.

- Add this configuration to the VS Code workspace file:

```
"typescript.tsdk": "node_modules/typescript/lib",
"typescript.enablePromptUseWorkspaceTsdk": true,
"typescript.tsc.autoDetect": "off",
"vue.server.path": "node_modules/@vue/language-server",
"editor.tabSize": 2,
"editor.insertSpaces": true,
"editor.detectIndentation": false,
"files.trimTrailingWhitespace": true,
"files.insertFinalNewline": true,
```

- I don't want to use `.js` files for configuration, only `.ts` files and `.json` files if configuration files can't be inside `.ts` files.

- All Vue components should have preceding `V` in their name. E.g., `VApp` instead of `App`. The same with the component file names. Please don't add `v-` into CSS/SCSS class names. Also, instead of adding `__` separators in the class names, just use `-` instead.

- It will use two spaces per indentation in the `.ts` files and `.vue` files.

- I want to be able to use TypeScript annotations within the code. Note that this requires `experimentalDecorators` and `experimentalDecorators` enabled in the `tsconfig.json`.

- I want to use `vue-facing-decorator` npm package so I can use annotations within Vue code to annotate class properties and methods as I will use Options API in this way:

```
<!-- TEMPLATE -->

<template>

  <div class="component-name row">

  </div>

</template>


<!-- SCRIPT -->

<script lang="ts">

  @Component()
  class VComponentName extends Vue
  {

  }

  export default toNative(VComponentName);

</script>


<!-- STYLE -->

<style lang="scss" scoped>


</style>
```

Always use the above template when creating new Vue component. Also make sure the `component-name` CSS class is the lower-cased and dashed name of the component without the preceding `V` letter, e.g. component `VGreedyMonkey` should have class name `greedy-monkey`.

- I want to use `unplugin-auto-import/vite` plugin for the `Vite` so I can use `AutoImport` to import classes and decorators from `vue-facing-decorator` npm package. Configure the plugin in such a way:

```
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
})
```

- I want to use `scss` within Vue's `<style lang="scss"> ... </style>` blocks.

- Ensure that in all style files and Vue components we always do `@use "file"` before any `@import "file"` so we don't have error: `Error: @use rules must be written before any other rules.`.

- When importing `tailwindcss` style file from any `.scss` or `.vue` files, use `@use "tailwindcss"` instead of `@import "tailwindcss"`. Those imports are probably wrong in the `tailwind.scss` and `global.scss` files. Also, let the `global.scss` file do `@forward "tailwind.scss";` instead of importing `tailwindcss` as a package.

- Let the existing `tailwind.scss` style (the one you will create) file consist of:

```
@layer properties, theme, base, components, utilities;

@use "tailwindcss";

@utility row {
  display: flex;
  flex: 1 1 0%;
  flex-direction: row;
}

@utility row-0 {
  display: flex;
  flex: 0 0 auto;
  flex-direction: row;
}

@utility col {
  display: flex;
  flex: 1 1 0%;
  flex-direction: column;
}

@utility col-0 {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
}

@theme {
    --breakpoint-w0: calc(640px * 0.5);
    --breakpoint-w1: calc(640px * 1);
    --breakpoint-w2: calc(640px * 1.25);
    --breakpoint-w3: calc(640px * 1.5);
    --breakpoint-w4: calc(640px * 1.75);
    --breakpoint-w5: calc(640px * 2);
    --breakpoint-w6: calc(640px * 2.25);
    --breakpoint-w7: calc(640px * 2.5);
    --breakpoint-w8: calc(640px * 2.75);
    --breakpoint-w9: calc(640px * 3);
    --container-w100: 100px;
    --container-w200: 200px;
    --container-w300: 300px;
    --container-w400: 400px;
    --container-w500: 500px;
    --container-w600: 600px;
    --container-w700: 700px;
    --container-w800: 800px;
    --container-w900: 900px;
    --container-w1000: 1000px;
}
```

When adding classes to HTML components use `row` when the container is a flex row and `col` if the container is a flex column. Don't use `flex` nor `flex-*` classes like `flex-1`. If container shouldn't grow then use `row-0` and `col-0` classes. Also use `tailwindcss` classes where possible.

Ensure that tailwind's utility classes are available in all `.scss` and `.vue` files, because they probable are not.

- Ensure that `tailwind.scss` is globally imported, so the `tailwindcss` utility classes are available in all other `.scss` files and in all Vue component files.

- I want to use `@tailwindcss/container-queries` plugin for the `tailwindcss`. Note that in order to use it you must use `@plugin "@tailwindcss/container-queries";`

- I want to use `postcss` npm package.

- I want to use `vite-plugin-vue-facing-decorator-hmr` Vite plugin.

- I want to use `@tailwindcss/postcss` and `postcss-import` plugins for the `postcss` npm package, so `tailwindcss` classes are properly compiled. Note that `postcss` configuration should include those plugins:

```
require('@tailwindcss/postcss'),
require('postcss-import')
```

- Ensure that `tailwindcss` config file includes all `.vue`, `.js`, `.ts`, `.jsx`, `.tsx` files under the `src` folder. This can be done via `@source` command in the global `.scss` file.

- I want the VApp component to be full height (`height: 100vh`, `max-height: 100vh` equivalent) with `overflow: hidden` so the application will act as a desktop application. Page should not be scrollable and the header should be on the page (don't use any `position: fixed` or `position: absolute` for the header.

- I want to use dark backgrounds for the page and light gray text for all elements. Ensure that all Vue components you created are like that.

- I want you to use `element-plus` npm package for the user interface components withing Vue templates. I want you to use PascalCase naming for the `element-plus` components, i.e., `<ElButton />` instead of `<el-button />`. Configure ElementPlus to always use dark mode which could be done by modifying `index.html` file with: `<html class="dark">` and then doing such an imports in the `main.ts` file:

```
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
```

- I want to use `three` npm package for 3d rendering.

Please also install `@types/three` npm package so the Three.js types will be available in the editor.

- I want to use `json-tree-view-vue3` npm package so I can display JSON data using Vue component.

- I want to use `@vitejs/plugin-vue-jsx` plugin for Vite.

- I want to use `Inter` font from the Google Fonts as a default font for the page.

- Configure `Vite` to serve `.wasm` files with the `application/wasm` MIME type as I want to be able to use emscripten compiled code withing the browser.

- Use only most recent npm packages' versions.

- Verify that all files that uses Vue functions import them correctly, e.g., `reactive()` function need to be imported.

- Modify Vite config so `@shared` alias redirectes `/src`, so importing `@shared/api/Known.ts` will effectively import `/src/api/Known.ts` file. Note that I will use that alias in the browser, not a Node.js environment, so we can't use Node.js's `resolve` method.

- After you will do everything, please test if the projects build correctly and there are no warnings or errors. If there will be any warning or errors then please fix them and rebuild the project. Do that until you fix all the issues.
