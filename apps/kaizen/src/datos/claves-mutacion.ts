/**
 * Claves de las mutaciones de usuario que existen hoy. Vive en su propio
 * módulo, sin importar nada nativo (AsyncStorage, NetInfo, el `QueryClient`),
 * para que cualquier hook pueda usarla sin arrastrar `cliente-consultas.ts`
 * completo a tests que no lo necesitan.
 *
 * Toda mutación de usuario nueva necesita su propia clave aquí, más su
 * `mutationFn` registrado con `setMutationDefaults` en `cliente-consultas.ts`
 * — ver AGENTS.md, sección de restricciones — o la cola offline no la
 * reproduce.
 */
export const CLAVE_MUTACION_GUARDAR_PERFIL = ['perfil', 'guardar'] as const
