// src/tests/ayuda/solo-local.ts
//
// Guarda compartida para los ficheros de test que hacen `DELETE FROM` sin
// filtro sobre tablas de dinero (gastos, facturas, gastos_recurrentes,
// periodos_contrato). Hoy esos borrados son correctos porque `URL_PG` en cada
// fichero apunta a Supabase local, pero nada en el propio `DELETE` lo
// comprueba — y nada impide que un día esa cadena venga de una variable de
// entorno, o que alguien la cambie sin darse cuenta de qué tablas iban detrás.
//
// El coste de llamar a esto es una comparación de texto. El coste de NO
// llamarlo, el día que la cadena apunte a otro sitio, es irreversible: un
// `DELETE FROM gastos` o `DELETE FROM facturas` sin condición no se deshace.
export function soloLocal(cadenaConexion: string): void {
  if (!cadenaConexion.includes("127.0.0.1")) {
    throw new Error(
      "Este test hace DELETE sin filtro sobre tablas de dinero y solo debe " +
        `correr contra Supabase local. La cadena de conexión no apunta a ` +
        `127.0.0.1: «${cadenaConexion}». Abortado antes de borrar nada.`
    );
  }
}
