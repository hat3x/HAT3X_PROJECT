'use client'
import { useEffect, useState } from 'react'
import { supabase, fetchRecentEvents } from '@/lib/supabase-command'
import type { BusEvent } from '@/lib/supabase-command'

const AGENT_POOL = [
  // Core intelligence
  { id: 'task-analyzer', name: 'Task Analyzer', role: 'Intelligence', vertical: 'core', icon: '🧠' },
  { id: 'capability-matcher', name: 'Capability Matcher', role: 'Intelligence', vertical: 'core', icon: '⚡' },
  { id: 'execution-planner', name: 'Execution Planner', role: 'Intelligence', vertical: 'core', icon: '📐' },
  { id: 'risk-assessor', name: 'Risk Assessor', role: 'Intelligence', vertical: 'core', icon: '🛡' },
  // Coordination
  { id: 'meeting-facilitator', name: 'Meeting Facilitator', role: 'Coordination', vertical: 'core', icon: '◎' },
  { id: 'checkpoint-monitor', name: 'Checkpoint Monitor', role: 'Coordination', vertical: 'core', icon: '◆' },
  { id: 'learning-officer', name: 'Learning Officer', role: 'Evolution', vertical: 'core', icon: '📈' },
  // PMs
  { id: 'pm-webs', name: 'PM Webs & Apps', role: 'PM', vertical: 'webs-apps', icon: '🌐' },
  { id: 'pm-chatbots', name: 'PM Chatbots', role: 'PM', vertical: 'chatbots', icon: '💬' },
  { id: 'pm-voz', name: 'PM Voz', role: 'PM', vertical: 'voz', icon: '🎙' },
  { id: 'pm-automatizaciones', name: 'PM Automatizaciones', role: 'PM', vertical: 'automatizaciones', icon: '⚙️' },
  { id: 'pm-operaciones', name: 'PM Operaciones', role: 'PM', vertical: 'operaciones', icon: '📋' },
  // Engineering
  { id: 'lead-programmer', name: 'Lead Programmer', role: 'Engineering', vertical: 'webs-apps', icon: '💻' },
  { id: 'typescript-reviewer', name: 'TS Reviewer', role: 'Engineering', vertical: 'webs-apps', icon: '🔍' },
  { id: 'security-reviewer', name: 'Security Reviewer', role: 'Engineering', vertical: 'security', icon: '🔒' },
  { id: 'database-reviewer', name: 'DB Reviewer', role: 'Engineering', vertical: 'database', icon: '🗄' },
  { id: 'tdd-guide', name: 'TDD Guide', role: 'Engineering', vertical: 'testing', icon: '✅' },
  { id: 'performance-optimizer', name: 'Perf Optimizer', role: 'Engineering', vertical: 'webs-apps', icon: '⚡' },
  { id: 'architect', name: 'Architect', role: 'Engineering', vertical: 'core', icon: '🏗' },
  { id: 'devops-engineer', name: 'DevOps', role: 'Engineering', vertical: 'deployment', icon: '🚀' },
  // Specialists
  { id: 'retell-specialist', name: 'Retell Specialist', role: 'Voice', vertical: 'voz', icon: '📞' },
  { id: 'elevenlabs-specialist', name: 'ElevenLabs Specialist', role: 'Voice', vertical: 'voz', icon: '🔊' },
  { id: 'rag-chatbot', name: 'RAG Builder', role: 'Chatbots', vertical: 'chatbots', icon: '🤖' },
  { id: 'whatsapp-specialist', name: 'WhatsApp Specialist', role: 'Chatbots', vertical: 'chatbots', icon: '📱' },
  { id: 'n8n-specialist', name: 'n8n Specialist', role: 'Automation', vertical: 'automatizaciones', icon: '🔗' },
  { id: 'crm-specialist', name: 'CRM Specialist', role: 'CRM', vertical: 'crm', icon: '👥' },
  { id: 'code-reviewer', name: 'Code Reviewer', role: 'Superpowers', vertical: 'webs-apps', icon: '📝' },
  { id: 'doc-updater', name: 'Doc Writer', role: 'Docs', vertical: 'documentation', icon: '📚' },
  { id: 'subagent-orchestrator', name: 'Subagent Orchestrator', role: 'Superpowers', vertical: 'core', icon: '◈' },
  { id: 'e2e-runner', name: 'E2E Runner', role: 'Testing', vertical: 'testing', icon: '🎯' },
]

const VERTICAL_COLOR: Record<string, string> = {
  core: '#3b82f6', 'webs-apps': '#8b5cf6', chatbots: '#06b6d4',
  voz: '#f59e0b', automatizaciones: '#10b981', security: '#ef4444',
  database: '#6366f1', testing: '#84cc16', deployment: '#f97316',
  documentation: '#64748b', crm: '#ec4899', operaciones: '#94a3b8',
}

const VERTICAL_LABEL: Record<string, string> = {
  core: 'Core', 'webs-apps': 'Webs & Apps', chatbots: 'Chatbots',
  voz: 'Voz', automatizaciones: 'Automatizaciones', security: 'Security',
  database: 'Database', testing: 'Testing', deployment: 'Deployment',
  documentation: 'Docs', crm: 'CRM', operaciones: 'Operaciones',
}

type AgentStatus = 'working' | 'online' | 'idle'

export default function EquipoPage() {
  const [agentStatus, setAgentStatus] = useState<Record<string, AgentStatus>>({})

  useEffect(() => {
    const initial: Record<string, AgentStatus> = {}
    AGENT_POOL.forEach(a => { initial[a.id] = 'idle' })
    setAgentStatus(initial)

    fetchRecentEvents(50).then((events: BusEvent[]) => {
      const fiveMinAgo = Date.now() - 5 * 60 * 1000
      setAgentStatus(prev => {
        const next = { ...prev }
        AGENT_POOL.forEach(a => { next[a.id] = 'online' })
        events.forEach(ev => {
          if (ev.agent_id && new Date(ev.created_at).getTime() > fiveMinAgo) {
            next[ev.agent_id] = 'working'
          }
        })
        return next
      })
    })

    const channel = supabase
      .channel('equipo-watch')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bus_events' }, (p) => {
        const ev = p.new as BusEvent
        if (!ev.agent_id) return
        setAgentStatus(prev => ({ ...prev, [ev.agent_id!]: 'working' }))
        setTimeout(() => {
          setAgentStatus(prev => ({ ...prev, [ev.agent_id!]: 'online' }))
        }, 30000)
      })
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [])

  const STATUS_DOT: Record<AgentStatus, { color: string; label: string }> = {
    working: { color: '#3b82f6', label: 'Trabajando' },
    online: { color: '#10b981', label: 'Disponible' },
    idle: { color: '#334155', label: 'Inactivo' },
  }

  const byVertical = AGENT_POOL.reduce<Record<string, typeof AGENT_POOL>>((acc, a) => {
    if (!acc[a.vertical]) acc[a.vertical] = []
    acc[a.vertical].push(a)
    return acc
  }, {})

  const workingCount = Object.values(agentStatus).filter(s => s === 'working').length
  const onlineCount = Object.values(agentStatus).filter(s => s === 'online').length

  return (
    <div style={{ padding: 32 }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>Equipo — Oficina Virtual</h1>
        <p style={{ fontSize: 13, color: '#64748b', fontFamily: 'monospace' }}>
          {AGENT_POOL.length} agentes ·{' '}
          <span style={{ color: '#3b82f6' }}>{workingCount} trabajando</span>{' '}·{' '}
          <span style={{ color: '#10b981' }}>{onlineCount} disponibles</span>
        </p>
      </div>

      {Object.entries(byVertical).map(([vertical, agents]) => (
        <div key={vertical} style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ width: 3, height: 16, borderRadius: 2, background: VERTICAL_COLOR[vertical] ?? '#3b82f6' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'monospace' }}>
              {VERTICAL_LABEL[vertical] ?? vertical}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: 10 }}>
            {agents.map((agent) => {
              const status: AgentStatus = agentStatus[agent.id] ?? 'idle'
              const dot = STATUS_DOT[status]
              const isWorking = status === 'working'

              return (
                <div
                  key={agent.id}
                  style={{
                    background: isWorking ? '#0a1929' : '#07101f',
                    border: `1px solid ${isWorking ? '#1e4080' : '#0f2040'}`,
                    borderRadius: 10,
                    padding: '14px 12px',
                    transition: 'border-color 0.3s, background 0.3s',
                  }}
                >
                  <div style={{
                    width: 38, height: 38, borderRadius: 8,
                    background: `${VERTICAL_COLOR[agent.vertical] ?? '#3b82f6'}12`,
                    border: `1px solid ${VERTICAL_COLOR[agent.vertical] ?? '#3b82f6'}25`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18, marginBottom: 10,
                  }}>
                    {agent.icon}
                  </div>

                  <div style={{ fontSize: 12, fontWeight: 500, color: status === 'idle' ? '#475569' : '#cbd5e1', marginBottom: 2, lineHeight: 1.3 }}>
                    {agent.name}
                  </div>
                  <div style={{ fontSize: 11, color: '#334155', fontFamily: 'monospace', marginBottom: 10 }}>
                    {agent.role}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: dot.color,
                      boxShadow: isWorking ? `0 0 6px ${dot.color}80` : 'none',
                    }} />
                    <span style={{ fontSize: 10, color: dot.color, fontFamily: 'monospace' }}>{dot.label}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
