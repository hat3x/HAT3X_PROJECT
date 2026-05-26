#!/usr/bin/env node

/**
 * Script de conversión de agentes externos a subagentes HAT3X
 * Procesa los 182 agentes de agency-agents/ y los convierte a subagentes
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// Mapeo de categorías a verticales HAT3X
const CATEGORY_TO_VERTICAL = {
  // Webs y Apps - 50 agentes
  'engineering': 'webs-apps',
  'design': 'webs-apps',
  'spatial-computing': 'webs-apps',
  'testing': 'webs-apps',

  // Automatizaciones - 25 agentes
  'integrations': 'automatizaciones',

  // Chatbots - 35 agentes
  'marketing': 'chatbots',
  'sales': 'chatbots',

  // Voz - 15 agentes
  //'voice-prompt-engineering': 'voz', // Ya existe en HAT3X

  // Operaciones - 47 agentes
  'academic': 'operaciones',
  'product': 'operaciones',
  'project-management': 'operaciones',
  'strategy': 'operaciones',
  'support': 'operaciones',
  'specialized': 'operaciones',
  'paid-media': 'operaciones'
};

// Asignaciones especiales para agentes individuales
const AGENT_SPECIAL_MAPPING = {
  // Specialized que van a otras verticales
  'specialized-mcp-builder': 'webs-apps',
  'specialized-lsp-index-engineer': 'webs-apps',
  'specialized-developer-advocate': 'webs-apps',
  'specialized-automation-governance-architect': 'automatizaciones',
  'specialized-workflow-architect': 'automatizaciones',
  'specialized-data-consolidation-agent': 'automatizaciones',
  'specialized-report-distribution-agent': 'automatizaciones',
  'specialized-sales-data-extraction-agent': 'automatizaciones',
  'specialized-recruitment-specialist': 'chatbots',
  'specialized-identity-graph-operator': 'chatbots',
  'specialized-blockchain-security-auditor': 'operaciones',
  'specialized-compliance-auditor': 'operaciones',
  'specialized-salesforce-architect': 'operaciones',
  'specialized-document-generator': 'operaciones',
  'specialized-civil-engineer': 'operaciones',
  'specialized-cultural-intelligence-strategist': 'operaciones',
  'specialized-french-consulting-market': 'operaciones',
  'specialized-korean-business-navigator': 'operaciones',
  'specialized-model-qa': 'operaciones',
  'specialized-zk-steward': 'operaciones',
  'specialized-corporate-training-designer': 'operaciones',
  'specialized-healthcare-marketing-compliance': 'operaciones',
  'specialized-accounts-payable-agent': 'operaciones',
  'specialized-agentic-identity-trust': 'operaciones',
  'specialized-supply-chain-strategist': 'operaciones',
  'specialized-study-abroad-advisor': 'operaciones',

  // Testing que son específicos
  'testing-accessibility-auditor': 'webs-apps',
  'testing-api-tester': 'webs-apps',
  'testing-performance-benchmarker': 'webs-apps',
  'testing-evidence-collector': 'operaciones',
  'testing-reality-checker': 'operaciones',
  'testing-test-results-analyzer': 'operaciones',
  'testing-tool-evaluator': 'operaciones',
  'testing-workflow-optimizer': 'automatizaciones',

  // Support que van a voz
  'support-support-responder': 'chatbots',
  'support-executive-summary-generator': 'voz',
  'support-analytics-reporter': 'operaciones',
  'support-finance-tracker': 'operaciones',
  'support-infrastructure-maintainer': 'automatizaciones',
  'support-legal-compliance-checker': 'operaciones',

  // Marketing específicos para voz
  'marketing-podcast-strategist': 'voz',
  'marketing-livestream-commerce-coach': 'voz',

  // Engineering específicos
  'engineering-email-intelligence-engineer': 'automatizaciones',
  'engineering-devops-automator': 'automatizaciones',
  'engineering-incident-response-commander': 'automatizaciones',
  'engineering-technical-writer': 'operaciones'
};

// Colores y emojis por vertical
const VERTICAL_STYLES = {
  'webs-apps': { color: 'blue', emoji: '🚀' },
  'automatizaciones': { color: 'purple', emoji: '⚡' },
  'chatbots': { color: 'green', emoji: '💬' },
  'voz': { color: 'orange', emoji: '🎙️' },
  'operaciones': { color: 'gray', emoji: '📊' }
};

class AgentConverter {
  constructor() {
    this.stats = {
      total: 0,
      processed: 0,
      errors: 0,
      byVertical: {
        'webs-apps': 0,
        'automatizaciones': 0,
        'chatbots': 0,
        'voz': 0,
        'operaciones': 0
      }
    };
  }

  async convert() {
    console.log('🎭 Iniciando conversión de agentes a subagentes HAT3X...\n');

    // Procesar todos los archivos .md en agency-agents
    const agentsDir = path.join(__dirname, '..', 'agency-agents');
    await this.processDirectory(agentsDir);

    this.printStats();
    this.generateMasterIndex();
  }

  async processDirectory(dir, category = '') {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'examples') {
        // Determinar categoría
        const newCategory = category ? `${category}-${entry.name}` : entry.name;
        await this.processDirectory(fullPath, newCategory);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        // Ignorar archivos de documentación
        if (['README.md', 'CONTRIBUTING.md', 'LICENSE.md'].includes(entry.name)) continue;
        if (entry.name.includes('EXECUTIVE-BRIEF') || entry.name.includes('QUICKSTART')) continue;

        await this.processAgentFile(fullPath, category, entry.name);
      }
    }
  }

  async processAgentFile(filePath, category, filename) {
    try {
      this.stats.total++;

      const content = fs.readFileSync(filePath, 'utf8');
      const agentInfo = this.parseAgent(content, filename, category);

      if (!agentInfo) {
        console.log(`⚠️  Ignorando: ${filename} (no es un agente válido)`);
        return;
      }

      // Determinar vertical
      const vertical = this.determineVertical(agentInfo, category, filename);
      if (!vertical) {
        console.log(`❌ No se pudo mapear: ${agentInfo.id}`);
        this.stats.errors++;
        return;
      }

      // Crear subagente
      await this.createSubagent(agentInfo, vertical);

      this.stats.processed++;
      this.stats.byVertical[vertical]++;

      console.log(`✅ ${agentInfo.name} → ${vertical}`);

    } catch (error) {
      console.log(`❌ Error procesando ${filename}: ${error.message}`);
      this.stats.errors++;
    }
  }

  parseAgent(content, filename, category) {
    // Extraer frontmatter si existe
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    let frontmatter = {};

    if (frontmatterMatch) {
      try {
        frontmatter = yaml.load(frontmatterMatch[1]) || {};
      } catch (e) {
        // Ignorar error de frontmatter
      }
    }

    // Extraer nombre del archivo
    const nameFromFile = filename
      .replace('.md', '')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());

    // Crear ID único
    const id = `${category}-${filename.replace('.md', '')}`;

    return {
      id,
      name: frontmatter.name || nameFromFile,
      description: frontmatter.description || '',
      color: frontmatter.color,
      emoji: frontmatter.emoji,
      vibe: frontmatter.vibe,
      content,
      category,
      filename
    };
  }

  determineVertical(agentInfo, category, filename) {
    // Primero verificar mapeos especiales
    const specialKey = `${category}-${filename.replace('.md', '')}`;
    if (AGENT_SPECIAL_MAPPING[specialKey]) {
      return AGENT_SPECIAL_MAPPING[specialKey];
    }

    // Luego por categoría
    const baseCategory = category.split('-')[0];
    if (CATEGORY_TO_VERTICAL[baseCategory]) {
      return CATEGORY_TO_VERTICAL[baseCategory];
    }

    if (CATEGORY_TO_VERTICAL[category]) {
      return CATEGORY_TO_VERTICAL[category];
    }

    // Default a operaciones si no se puede determinar
    return 'operaciones';
  }

  async createSubagent(agentInfo, vertical) {
    // Crear estructura de directorios
    const subagentDir = path.join(
      __dirname, '..', 'agents', vertical, 'subagentes', agentInfo.id
    );

    if (!fs.existsSync(subagentDir)) {
      fs.mkdirSync(subagentDir, { recursive: true });
    }

    // Determinar estilo
    const style = VERTICAL_STYLES[vertical];

    // Generar contenido CLAUDE.md
    const claudeContent = this.generateClaudeContent(agentInfo, vertical, style);

    // Escribir archivo
    const claudePath = path.join(subagentDir, 'CLAUDE.md');
    fs.writeFileSync(claudePath, claudeContent);
  }

  generateClaudeContent(agentInfo, vertical, style) {
    const { name, description, content, id } = agentInfo;

    // Extraer secciones del contenido original
    const identity = this.extractSection(content, 'Identity', 'Your Identity');
    const mission = this.extractSection(content, 'Core Mission', 'Your Core Mission');
    const deliverables = this.extractSection(content, 'Deliverables');

    return `---
name: ${name}
description: ${description || `Subagente especializado en ${name}`}
color: ${style.color}
emoji: ${style.emoji}
vibe: ${agentInfo.vibe || `Especialista en ${name.toLowerCase()}`}
vertical: ${vertical}
source: agency-agents/${agentInfo.category}/${agentInfo.filename}
tags: [${agentInfo.category}, subagente]
---

# ${name}

> Subagente especializado de HAT3X - Vertical: ${vertical}
> Fuente: agency-agents/${agentInfo.category}/${agentInfo.filename}

## 🧠 Identity & Expertise

${identity || `Eres ${name}, un especialista en tu dominio con experiencia práctica en producción.`}

## 🎯 Core Mission

${mission || `Tu misión es apoyar al PM de ${vertical} en tareas especializadas relacionadas con ${name.toLowerCase()}.`}

## 📋 Deliverables

${deliverables || `- Análisis y recomendaciones especializadas
- Código y configuraciones cuando aplica
- Documentación de procesos y mejores prácticas`}

## 🤝 Workflow Integration

Cuando el PM de ${vertical} te delega una tarea:

1. **Recibe contexto completo** del proyecto principal
2. **Ejecuta tu especialidad** enfocándote en tu dominio
3. **Entrega resultados específicos** al PM principal
4. **Comunica dependencias** o bloqueadores inmediatamente

## ✅ Success Metrics

- Calidad de las entregables según estándares del dominio
- Tiempo de ejecución acorde a la complejidad
- Claridad en la comunicación de resultados
- Identificación proactiva de riesgos

## 🚀 Example Invocation

**PM de ${vertical} dice:**
> "Activa modo ${name} y ayúdame con [tarea específica]"

**Tu respuesta:**
> Entiendo, voy a [acción específica] enfocándome en [aspectos clave]. Entregaré [resultado esperado] en [tiempo estimado]."
`;
  }

  extractSection(content, ...sectionNames) {
    // Buscar sección por diferentes patrones
    for (const sectionName of sectionNames) {
      const patterns = [
        // ## Sección\n\nContenido\n\n##
        new RegExp(`##[^\n]*${sectionName}[^\n]*\n+([\\s\\S]*?)(?=\n##|$)`),
        // ### Sección\n\nContenido\n\n###
        new RegExp(`###[^\n]*${sectionName}[^\n]*\n+([\\s\\S]*?)(?=\n###|$)`),
        // **Sección**\n\nContenido\n\n
        new RegExp(`\\*\\*[^\n]*${sectionName}[^\n]*\\*\\*\n+([\\s\\S]*?)(?=\n\n|$)`)
      ];

      for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match && match[1] && match[1].trim()) {
          return match[1].trim();
        }
      }
    }

    return '';
  }

  printStats() {
    console.log('\n📊 Estadísticas de conversión:');
    console.log(`Total de agentes encontrados: ${this.stats.total}`);
    console.log(`Agentes procesados: ${this.stats.processed}`);
    console.log(`Errores: ${this.stats.errors}`);
    console.log('\nPor vertical:');
    Object.entries(this.stats.byVertical).forEach(([vertical, count]) => {
      console.log(`  ${vertical}: ${count} agentes`);
    });
  }

  generateMasterIndex() {
    const indexPath = path.join(__dirname, '..', 'agents', 'SUBAGENTES-MAESTRO.md');

    let indexContent = `# Índice Maestro de Subagentes HAT3X

> **182 subagentes** integrados desde agency-agents
> **Última actualización:** ${new Date().toISOString()}

## Resumen por Vertical

`;

    Object.entries(this.stats.byVertical).forEach(([vertical, count]) => {
      indexContent += `- **${vertical}**: ${count} subagentes\n`;
    });

    indexContent += `
## Directorio Completo

`;

    // Leer todos los subagentes creados
    const agentsDir = path.join(__dirname, '..', 'agents');
    const verticals = fs.readdirSync(agentsDir)
      .filter(dir => fs.statSync(path.join(agentsDir, dir)).isDirectory());

    verticals.forEach(vertical => {
      const subagentesDir = path.join(agentsDir, vertical, 'subagentes');
      if (!fs.existsSync(subagentesDir)) return;

      const subagentes = fs.readdirSync(subagentesDir);
      if (subagentes.length === 0) return;

      indexContent += `\n### ${vertical.toUpperCase()} (${subagentes.length} subagentes)\n\n`;

      subagentes.forEach(subagent => {
        const claudePath = path.join(subagentesDir, subagent, 'CLAUDE.md');
        if (fs.existsSync(claudePath)) {
          const content = fs.readFileSync(claudePath, 'utf8');
          const nameMatch = content.match(/^name: (.+)$/m);
          const descMatch = content.match(/^description: (.+)$/m);

          const name = nameMatch ? nameMatch[1] : subagent;
          const desc = descMatch ? descMatch[1] : '';

          indexContent += `- **${name}** - ${desc}\n`;
        }
      });
    });

    indexContent += `
## Uso

Para activar un subagente, el PM de cada vertical puede delegar:

\`\`\`
[DELEGAR]
PM: [nombre-vertical] (ej: webs-apps, automatizaciones, chatbots, voz, operaciones)
Subagente: "[nombre-del-subagente]"
Tarea: "[descripción específica]"
Contexto: {proyecto completo}
\`\`\`

## Mantenimiento

Para regenerar este índice o actualizar subagentes:
\`\`\`bash
node scripts/convert-agents.js
\`\`\`
`;

    fs.writeFileSync(indexPath, indexContent);
    console.log(`\n📄 Índice maestro generado: agents/SUBAGENTES-MAESTRO.md`);
  }
}

// Ejecutar
const converter = new AgentConverter();

// Si se pasa --index solo regenerar el índice
if (process.argv.includes('--index')) {
  console.log('📄 Regenerando índice maestro...\n');
  converter.generateMasterIndex();
  console.log('\n✅ Índice regenerado exitosamente');
} else {
  converter.convert().catch(console.error);
}
