import { useState } from 'react'
import { useTaskStore } from './store'

const cardStyle = {
  maxWidth: 560,
  margin: '48px auto',
  padding: 24,
  borderRadius: 24,
  background: 'linear-gradient(180deg, #fff7ed 0%, #ffffff 100%)',
  border: '1px solid #fed7aa',
  boxShadow: '0 24px 60px rgba(154, 52, 18, 0.10)',
  fontFamily: '"Segoe UI", sans-serif',
} satisfies React.CSSProperties

export function App() {
  const {
    tasks,
    addTask,
    clearCompleted,
    errorMessage,
    lastSyncSource,
    markAllDone,
    resetDemo,
    syncStatus,
    syncTasks,
    toggleTask,
  } = useTaskStore()
  const [input, setInput] = useState('')

  function handleAdd() {
    const value = input.trim()
    if (!value) return

    addTask(value)
    setInput('')
  }

  const remaining = tasks.filter((task) => !task.done).length
  const statusColor = syncStatus === 'error' ? '#b91c1c' : syncStatus === 'ready' ? '#166534' : '#9a3412'
  const statusCopy = errorMessage
    ? `${syncStatus} from ${lastSyncSource} · ${errorMessage}`
    : `${syncStatus} from ${lastSyncSource}`

  return (
    <main style={{ minHeight: '100vh', padding: '24px', background: 'linear-gradient(180deg, #fffbeb 0%, #fff 55%, #fff7ed 100%)' }}>
      <section style={cardStyle}>
        <p style={{ margin: 0, color: '#9a3412', fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          AI Runtime Harness Example
        </p>
        <h1 style={{ margin: '10px 0 8px', fontSize: 34, lineHeight: 1.1, color: '#431407' }}>
          Task Dashboard
        </h1>
        <p style={{ margin: '0 0 20px', color: '#7c2d12' }}>
          A small React + Zustand app for inspecting DOM, component state, store state, console, network data, and semantic actions.
        </p>

        <div
          id="sync-status"
          data-status={syncStatus}
          style={{
            marginBottom: 16,
            padding: '10px 12px',
            borderRadius: 14,
            background: errorMessage ? '#fef2f2' : '#fff7ed',
            border: `1px solid ${errorMessage ? '#fecaca' : '#fed7aa'}`,
            color: statusColor,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Sync status: {statusCopy}
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
          <input
            id="task-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && handleAdd()}
            placeholder="Add a new task"
            style={{
              flex: '1 1 260px',
              padding: '12px 14px',
              borderRadius: 14,
              border: '1px solid #fdba74',
              background: '#fff',
            }}
          />
          <button
            id="add-btn"
            onClick={handleAdd}
            style={{
              padding: '12px 16px',
              borderRadius: 14,
              border: 'none',
              background: '#ea580c',
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Add task
          </button>
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
          <button
            id="sync-btn"
            onClick={() => { void syncTasks() }}
            disabled={syncStatus === 'loading'}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid #fdba74',
              background: '#fff',
              color: '#9a3412',
              cursor: syncStatus === 'loading' ? 'progress' : 'pointer',
            }}
          >
            {syncStatus === 'loading' ? 'Syncing…' : 'Sync mocked API'}
          </button>
          <button
            id="mark-all-btn"
            onClick={markAllDone}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid #fdba74',
              background: '#fff',
              color: '#9a3412',
              cursor: 'pointer',
            }}
          >
            Mark all done
          </button>
          <button
            id="reset-btn"
            onClick={resetDemo}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid #fdba74',
              background: '#fff',
              color: '#9a3412',
              cursor: 'pointer',
            }}
          >
            Reset demo
          </button>
        </div>

        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
          {tasks.map((task) => (
            <li
              key={task.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 14px',
                borderRadius: 16,
                background: task.done ? '#ffedd5' : '#fff',
                border: '1px solid #fed7aa',
              }}
            >
              <input
                id={`task-${task.id}`}
                type="checkbox"
                checked={task.done}
                onChange={() => toggleTask(task.id)}
              />
              <label
                htmlFor={`task-${task.id}`}
                style={{
                  color: '#431407',
                  textDecoration: task.done ? 'line-through' : 'none',
                }}
              >
                {task.text}
              </label>
            </li>
          ))}
        </ul>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
          <div
            id="task-count"
            style={{
              color: '#9a3412',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {remaining} remaining
          </div>
          <button
            id="clear-btn"
            onClick={clearCompleted}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid #fdba74',
              background: '#fff7ed',
              color: '#9a3412',
              cursor: 'pointer',
            }}
          >
            Clear completed
          </button>
        </div>
      </section>
    </main>
  )
}
