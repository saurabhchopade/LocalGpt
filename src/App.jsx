import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const MODEL_OPTIONS = ['qwen2.5:1.5b', 'qwen2.5:3b', 'deepseek-coder:6.7b']

function App() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [model, setModel] = useState('qwen2.5:1.5b')
  const abortRef = useRef(null)
  const endRef = useRef(null)

  const canSend = useMemo(() => input.trim().length > 0 && !isLoading, [input, isLoading])
  const sanitizeMessages = (items) =>
    items.filter((item) => typeof item.content === 'string' && item.content.trim().length > 0)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, isLoading])

  const streamResponse = async (nextMessages) => {
    const controller = new AbortController()
    abortRef.current = controller
    setIsLoading(true)

    setMessages((prev) => [...prev, { role: 'assistant', content: '' }])

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: sanitizeMessages(nextMessages),
        }),
        signal: controller.signal,
      })

      if (!response.ok || !response.body) {
        const text = await response.text()
        throw new Error(text || 'Failed to stream response.')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let done = false

      while (!done) {
        const { value, done: streamDone } = await reader.read()
        done = streamDone
        if (value) {
          const chunk = decoder.decode(value, { stream: true })
          setMessages((prev) => {
            const updated = [...prev]
            const last = updated[updated.length - 1]
            if (last && last.role === 'assistant') {
              last.content += chunk
            }
            return updated
          })
        }
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        setMessages((prev) => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          if (last && last.role === 'assistant' && !last.content) {
            last.content = `Error: ${error.message}`
          }
          return updated
        })
      } else {
        setMessages((prev) => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          if (last && last.role === 'assistant' && !last.content) {
            updated.pop()
          }
          return updated
        })
      }
    } finally {
      setIsLoading(false)
      abortRef.current = null
    }
  }

  const sendMessage = async () => {
    const userText = input.trim()
    if (!userText || isLoading) return

    const cleanHistory = sanitizeMessages(messages)
    const nextMessages = [...cleanHistory, { role: 'user', content: userText }]
    setMessages(nextMessages)
    setInput('')
    await streamResponse(nextMessages)
  }

  const onSubmit = async (event) => {
    event.preventDefault()
    await sendMessage()
  }

  const stopStreaming = () => {
    if (abortRef.current) {
      abortRef.current.abort()
    }
  }

  const onKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      if (canSend) {
        sendMessage()
      }
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <h1 className="app-title">Local GPT</h1>
        <div className="model-picker">
          <select
            id="model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={isLoading}
          >
            {MODEL_OPTIONS.map((modelName) => (
              <option key={modelName} value={modelName}>
                {modelName}
              </option>
            ))}
          </select>
        </div>
      </header>

      <main className="chat-window">
        {messages.length === 0 && (
          <div className="empty-state">
            <p>How can I help you today?</p>
          </div>
        )}
        <div className="messages">
          {messages.map((msg, idx) => (
            <div key={idx} className={`message-row ${msg.role}`}>
              <div className={`avatar ${msg.role}`}>{msg.role === 'user' ? 'U' : 'AI'}</div>
              <div className={`message-bubble ${msg.role}`}>
                <div className="content">{msg.content}</div>
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      </main>

      <form className="composer" onSubmit={onSubmit}>
        <textarea
          rows={1}
          placeholder="Message Local GPT"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={isLoading}
        />
        <div className="actions">
          {isLoading ? (
            <button type="button" className="icon-btn" onClick={stopStreaming} title="Stop generating">
              ■
            </button>
          ) : (
            <button type="submit" className="icon-btn" disabled={!canSend} title="Send message">
              ↑
            </button>
          )}
        </div>
      </form>
    </div>
  )
}

export default App
