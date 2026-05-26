#!/usr/bin/env node

/**
 * Script para actualizar los PMs principales con referencias a subagentes
 */

const fs = require('fs');
const path = require('path');

class PMUpdater {
  constructor() {
    this.verticals = ['automatizaciones', 'chatbots', 'operaciones', 'voz', 'webs-apps'];
  }

  async updateAll() {
    console.log('🔄 Actualizando PMs principales con referencias a subagentes...\n');

    for (const vertical of this.verticals) {
      await this.updatePM(vertical);
    }

    console.log('\n✅ Todos los PMs actualizados exitosamente');
  }

  async updatePM(vertical) {
    const pmPath = path.join(__dirname, '..', 'agents', vertical, 'CLAUDE.md');
    const subagentesDir = path.join(__dirname, '..', 'agents', vertical, 'subagentes');

    // Verificar si existe el PM y hay subagentes
    if (!fs.existsSync(pmPath)) {
      console.log(`⚠️  No existe PM para ${vertical}`);
      return;
    }

    if (!fs.existsSync(subagentesDir)) {
      console.log(`⚠️  No hay subagentes para ${vertical}`);
      return;
    }

    // Leer subagentes
    const subagentes = this.getSubagentes(subagentesDir);
    if (subagentes.length === 0) {
      console.log(`⚠️  No se encontraron subagentes en ${vertical}`);
      return;
    }

    // Leer y actualizar CLAUDE.md
    const content = fs.readFileSync(pmPath, 'utf8');
    const updatedContent = this.insertSubagentesSection(content, subagentes, vertical);

    fs.writeFileSync(pmPath, updatedContent);
    console.log(`✅ ${vertical}: ${subagentes.length} subagentes referenciados`);
  }

  getSubagentes(subagentesDir) {
    const subagentes = [];
    const entries = fs.readdirSync(subagentesDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const claudePath = path.join(subagentesDir, entry.name, 'CLAUDE.md');
        if (fs.existsSync(claudePath)) {
          const content = fs.readFileSync(claudePath, 'utf8');

          // Extraer información del frontmatter
          const nameMatch = content.match(/^name: (.+)$/m);
          const descMatch = content.match(/^description: (.+)$/m);
          const emojiMatch = content.match(/^emoji: (.+)$/m);

          subagentes.push({
            id: entry.name,
            name: nameMatch ? nameMatch[1] : entry.name,
            description: descMatch ? descMatch[1] : '',
            emoji: emojiMatch ? emojiMatch[1] : '🤖',
            path: `subagentes/${entry.name}/`
          });
        }
      }
    }

    return subagentes.sort((a, b) => a.name.localeCompare(b.name));
  }

  insertSubagentesSection(content, subagentes, vertical) {
    const section = this.generateSubagentesSection(subagentes, vertical);

    // Buscar dónde insertar (después de ## Briefing o antes de ## Catálogo/Subagentes)
    const briefingMatch = content.match(/(## Briefing[\s\S]*?\n)(## |---)/);

    if (briefingMatch) {
      // Insertar después del Briefing
      const insertIndex = content.indexOf(briefingMatch[0]) + briefingMatch[0].length;
      return content.substring(0, insertIndex) + '\n' + section + '\n' + content.substring(insertIndex);
    }

    // Si no hay Briefing, insertar antes de la primera sección grande
    const firstSection = content.search(/\n## (Catálogo|Subagentes|Estructura|Métricas)/);
    if (firstSection !== -1) {
      return content.substring(0, firstSection) + '\n' + section + '\n' + content.substring(firstSection);
    }

    // Si no se encuentra ningún patrón, agregar al final
    return content + '\n' + section;
  }

  generateSubagentesSection(subagentes, vertical) {
    let section = `---

## 🎭 Subagentes Especializados Disponibles

> **${subagentes.length} subagentes** listos para delegación automática
> Cada subagente es un especialista en un dominio específico

Para activar un subagente, usa delegación directa:

\`\`\`
[DELEGAR]
PM: ${vertical}
Subagente: "[nombre-del-subagente]"
Tarea: "[descripción específica]"
Contexto: {proyecto completo}
\`\`\`

### Directorio de Subagentes

`;

    // Agrupar por categoría (basado en el ID)
    const grouped = this.groupSubagentes(subagentes);

    Object.entries(grouped).forEach(([category, agents]) => {
      section += `\n#### ${category} (${agents.length})\n\n`;
      agents.forEach(agent => {
        section += `- **${agent.emoji} ${agent.name}** - ${agent.description}\n`;
      });
    });

    section += `
### Reglas de Delegación

1. **Delega en paralelo** cuando las tareas son independientes
2. **Proporciona contexto completo** del proyecto principal
3. **Sé específico** en el objetivo del subagente
4. **Establece deadline** claro para la tarea
5. **Revisa entregables** antes de integrar al proyecto principal

`;

    return section;
  }

  groupSubagentes(subagentes) {
    const grouped = {};

    subagentes.forEach(agent => {
      // Extraer categoría del ID (ej: "engineering-ai-engineer" -> "Engineering")
      const parts = agent.id.split('-');
      let category = 'General';

      if (parts.length >= 2) {
        category = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
      }

      if (!grouped[category]) {
        grouped[category] = [];
      }

      grouped[category].push(agent);
    });

    return grouped;
  }
}

// Ejecutar
const updater = new PMUpdater();
updater.updateAll().catch(console.error);
