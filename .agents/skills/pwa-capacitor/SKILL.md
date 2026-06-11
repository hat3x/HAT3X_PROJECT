# Skill: pwa-capacitor

**Invocación:** `/pwa-capacitor`

**Propósito:** Convierte webs React/Vite/Next.js en apps instalables (PWA) o apps nativas (iOS/Android) con Capacitor. Cubre todo el ciclo: manifest, service worker, build nativo, firma y distribución.

---

## Trigger

Se activa cuando el usuario quiere que su web funcione como app en móvil, pide compilar para iOS/Android, o quiere implementar "Añadir a pantalla de inicio".

---

## Ruta 1: PWA (más rápida, sin App Store)

### Requisitos mínimos
- HTTPS obligatorio (excepto localhost)
- `manifest.json` con nombre, iconos y `display: standalone`
- Service Worker registrado

### Setup con vite-plugin-pwa
```bash
npm install -D vite-plugin-pwa
```

```ts
// vite.config.ts
import { VitePWA } from 'vite-plugin-pwa'

VitePWA({
  registerType: 'autoUpdate',
  manifest: {
    name: 'Nombre completo',
    short_name: 'NombreCorto',
    description: 'Descripción de la app',
    theme_color: '#HEXCOLOR',
    background_color: '#HEXCOLOR',
    display: 'standalone',
    orientation: 'portrait',
    start_url: '/',
    lang: 'es',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
        handler: 'NetworkFirst',
        options: { cacheName: 'api-cache', networkTimeoutSeconds: 10 }
      }
    ]
  }
})
```

### Iconos necesarios
- 192×192 px — Android home screen
- 512×512 px — Splash screen y Play Store
- 180×180 px — Apple touch icon (Safari iOS)
- Herramienta: https://realfavicongenerator.net

### Meta tags iOS (en index.html)
```html
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="NombreApp">
<link rel="apple-touch-icon" href="/icon-180.png">
```

---

## Ruta 2: Capacitor (APK / IPA nativo)

### Prerequisitos
- Android Studio instalado (Android)
- Xcode + cuenta Apple Developer (iOS)
- Java 17+ y variables de entorno configuradas

### Setup inicial
```bash
npm install @capacitor/core @capacitor/cli
npm install @capacitor/android @capacitor/ios
npx cap init [AppName] [com.empresa.app] --web-dir dist
```

### Flujo de desarrollo
```bash
# 1. Build web
npm run build

# 2. Sincronizar con plataforma nativa
npx cap sync

# 3. Abrir en IDE nativo
npx cap open android   # Abre Android Studio
npx cap open ios       # Abre Xcode

# 4. En Android Studio: Build > Generate Signed APK
# 5. En Xcode: Product > Archive
```

### Plugins esenciales
```bash
npm install @capacitor/camera          # Cámara
npm install @capacitor/push-notifications  # Notificaciones push
npm install @capacitor/local-notifications # Notificaciones locales
npm install @capacitor/haptics         # Vibración táctil
npm install @capacitor/status-bar      # Barra de estado
npm install @capacitor/splash-screen   # Splash screen
npm install @capacitor/app             # Eventos de app (background/foreground)
```

### capacitor.config.ts
```ts
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.empresa.app',
  appName: 'Nombre App',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#0F0D0A',
      androidSplashResourceName: 'splash',
      showSpinner: false
    }
  }
};
```

---

## Checklist de entrega

### PWA
- [ ] Lighthouse PWA score = 100
- [ ] "Instalable" sin errores en Chrome DevTools > Application
- [ ] Funciona offline (al menos con datos cacheados)
- [ ] Iconos en todos los tamaños
- [ ] `theme_color` coincide con el diseño

### Capacitor
- [ ] APK firmado con keystore de producción
- [ ] Splash screen y icono correctos
- [ ] Permisos mínimos en AndroidManifest.xml
- [ ] Sin `http://` en producción (solo `https://`)
- [ ] Probado en dispositivo físico, no solo emulador
