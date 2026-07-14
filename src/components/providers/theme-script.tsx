/**
 * Script anti-FOUC de tema.
 * ----------------------------------------------------------------------
 * Se inyecta como primer elemento del <body> para ejecutarse de forma
 * síncrona ANTES del primer pintado. Lee la preferencia persistida y, si
 * no existe (o es "system"), cae a `prefers-color-scheme`. Así la clase
 * `dark` ya está aplicada cuando React hidrata: sin parpadeo de tema.
 *
 * No es un componente cliente: forma parte del HTML renderizado en servidor
 * y el navegador lo ejecuta inline. No contiene lógica de negocio.
 */

/** Clave única de almacenamiento del tema (compartida con ThemeProvider). */
export const THEME_STORAGE_KEY = "salon-os-theme";

const SCRIPT = `(function(){try{var k="${THEME_STORAGE_KEY}";var s=localStorage.getItem(k);var d=window.matchMedia("(prefers-color-scheme: dark)").matches;var dark=s==="dark"||((s===null||s==="system")&&d);document.documentElement.classList.toggle("dark",dark);}catch(e){}})();`;

export function ThemeScript(): React.ReactElement {
  // El contenido es una constante estática (sin entrada de usuario), por lo
  // que `dangerouslySetInnerHTML` es seguro aquí.
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
