const fs = require('fs')
const path = require('path')

// Carga las variables de apps/kaizen/.env.test en process.env antes de que
// Jest arranque, sin depender de `dotenv`. Si el fichero no existe (p. ej.
// no se ha corrido `supabase start` todavía), no falla aquí: los tests que
// necesiten las variables fallarán con un mensaje claro al leerlas.
const rutaEnvTest = path.join(__dirname, '.env.test')

if (fs.existsSync(rutaEnvTest)) {
  const contenido = fs.readFileSync(rutaEnvTest, 'utf-8')
  for (const linea of contenido.split('\n')) {
    const limpia = linea.trim()
    if (limpia === '' || limpia.startsWith('#')) continue
    const indice = limpia.indexOf('=')
    if (indice === -1) continue
    const clave = limpia.slice(0, indice).trim()
    const valor = limpia.slice(indice + 1).trim()
    if (clave) process.env[clave] = valor
  }
}

module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/*.integracion.test.ts'],
  transform: { '^.+\\.ts$': ['babel-jest', { presets: ['babel-preset-expo'] }] },
}
