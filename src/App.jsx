import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const MODEL = 'qwen2.5:1.5b'

const nowIso = () => new Date().toISOString()

const createMessage = (role, content = '') => ({
  id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  role,
  content,
  timestamp: nowIso(),
})

const createConversation = (title = 'New Chat') => ({
  id: `conv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  title,
  pinned: false,
  createdAt: nowIso(),
  updatedAt: nowIso(),
  messages: [],
})

const formatTime = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

const isSameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate()

const sanitizeMessages = (messages = []) =>
  messages.filter(
    (message) =>
      message &&
      ['user', 'assistant', 'system'].includes(message.role) &&
      typeof message.content === 'string' &&
      message.content.trim().length > 0,
  )

const escapeHtml = (value) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')

const highlightCodeToHtml = (code, lang = '') => {
  const language = (lang || '').toLowerCase()
  let html = escapeHtml(code)
  const keywordSet = /(const|let|var|function|return|if|else|for|while|class|import|from|export|async|await|def|print|True|False|None|public|private|new|try|catch|finally|interface|type)\b/g
  const stringSet = /(".*?"|'.*?'|`[\s\S]*?`)/g
  const numberSet = /\b(\d+)\b/g
  const commentSet = /(\/\/.*$|#.*$)/gm

  if (['js', 'jsx', 'ts', 'tsx', 'python', 'py', 'java', 'c', 'cpp', 'go'].includes(language)) {
    html = html.replace(commentSet, '<span class="token-comment">$1</span>')
    html = html.replace(stringSet, '<span class="token-string">$1</span>')
    html = html.replace(keywordSet, '<span class="token-keyword">$1</span>')
    html = html.replace(numberSet, '<span class="token-number">$1</span>')
  } else if (language === 'json') {
    html = html.replace(stringSet, '<span class="token-string">$1</span>')
    html = html.replace(numberSet, '<span class="token-number">$1</span>')
  }

  return html
}

const renderInline = (text) => {
  const segments = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean)
  return segments.map((segment, idx) => {
    if (/^`[^`]+`$/.test(segment)) return <code key={idx}>{segment.slice(1, -1)}</code>
    if (/^\*\*[^*]+\*\*$/.test(segment)) return <strong key={idx}>{segment.slice(2, -2)}</strong>
    if (/^\*[^*]+\*$/.test(segment)) return <em key={idx}>{segment.slice(1, -1)}</em>
    return <span key={idx}>{segment}</span>
  })
}

const renderMarkdownText = (text) => {
  const lines = text.split('\n')
  const blocks = []
  let listItems = []

  const flushList = () => {
    if (listItems.length) {
      blocks.push(
        <ul key={`ul-${blocks.length}`}>
          {listItems.map((item, idx) => (
            <li key={idx}>{renderInline(item)}</li>
          ))}
        </ul>,
      )
      listItems = []
    }
  }

  lines.forEach((line) => {
    const listMatch = line.match(/^[-*]\s+(.*)$/)
    const numberMatch = line.match(/^\d+\.\s+(.*)$/)
    if (listMatch || numberMatch) {
      listItems.push((listMatch || numberMatch)[1])
      return
    }

    flushList()
    if (!line.trim()) {
      blocks.push(<div key={`space-${blocks.length}`} className="line-space" />)
      return
    }
    blocks.push(
      <p key={`p-${blocks.length}`} className="md-line">
        {renderInline(line)}
      </p>,
    )
  })

  flushList()
  return blocks
}

const MessageContent = ({ content }) => {
  const [copiedCodeId, setCopiedCodeId] = useState('')
  const parts = content.split(/```([a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g)
  const blocks = []

  const copyCodeSnippet = async (code, snippetId) => {
    try {
      await navigator.clipboard.writeText(code)
      setCopiedCodeId(snippetId)
      window.setTimeout(() => setCopiedCodeId(''), 1400)
    } catch {
      setCopiedCodeId('')
    }
  }

  for (let i = 0; i < parts.length; i += 1) {
    if (i % 3 === 0) {
      const text = parts[i]
      if (text?.trim()) {
        blocks.push(
          <div key={`text-${i}`} className="md-block">
            {renderMarkdownText(text)}
          </div>,
        )
      }
    } else if (i % 3 === 1) {
      const lang = parts[i] || ''
      const code = parts[i + 1] || ''
      const snippetId = `snippet-${i}`
      blocks.push(
        <pre key={`code-${i}`} className="code-block">
          <div className="code-header">
            <span className="code-lang">{lang || 'code'}</span>
            <button
              type="button"
              className={`code-copy-btn ${copiedCodeId === snippetId ? 'copied' : ''}`}
              onClick={() => copyCodeSnippet(code, snippetId)}
            >
              {copiedCodeId === snippetId ? 'Copied' : 'Copy code'}
            </button>
          </div>
          <code dangerouslySetInnerHTML={{ __html: highlightCodeToHtml(code, lang) }} />
        </pre>,
      )
      i += 1
    }
  }

  if (!blocks.length) {
    return <div className="md-block">{renderMarkdownText(content)}</div>
  }
  return <>{blocks}</>
}

function App() {
  const [conversations, setConversations] = useState([
    {
      ...createConversation('ChatAI'),
      pinned: true,
    },
    createConversation('Image of sun'),
    createConversation('Data Analyst'),
  ])
  const [activeConversationId, setActiveConversationId] = useState(conversations[0].id)
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [speechError, setSpeechError] = useState('')
  const recognitionRef = useRef(null)
  const endRef = useRef(null)
  const abortRef = useRef(null)
  const messagesRef = useRef(null)

  const activeConversation = useMemo(
    () => conversations.find((item) => item.id === activeConversationId) || conversations[0],
    [conversations, activeConversationId],
  )

  const grouped = useMemo(() => {
    const today = new Date()
    const yesterday = new Date()
    yesterday.setDate(today.getDate() - 1)
    const saved = []
    const todayItems = []
    const yesterdayItems = []

    conversations.forEach((conversation) => {
      if (conversation.pinned) {
        saved.push(conversation)
        return
      }
      const updatedAt = new Date(conversation.updatedAt)
      if (isSameDay(updatedAt, today)) {
        todayItems.push(conversation)
      } else if (isSameDay(updatedAt, yesterday)) {
        yesterdayItems.push(conversation)
      } else {
        todayItems.push(conversation)
      }
    })

    return { saved, todayItems, yesterdayItems }
  }, [conversations])

  const updateActiveConversation = (updater) => {
    setConversations((prev) =>
      prev.map((conversation) =>
        conversation.id === activeConversationId ? updater(conversation) : conversation,
      ),
    )
  }

  const createNewChat = () => {
    if (isLoading) return
    const next = createConversation()
    setConversations((prev) => [next, ...prev])
    setActiveConversationId(next.id)
    setInput('')
  }

  const deleteConversation = (conversationId) => {
    if (!conversationId) return
    if (conversationId === activeConversationId && isLoading) {
      stopGenerating()
    }

    let nextActiveId = activeConversationId
    setConversations((prev) => {
      const filtered = prev.filter((conversation) => conversation.id !== conversationId)
      if (filtered.length === 0) {
        const fallback = createConversation()
        nextActiveId = fallback.id
        return [fallback]
      }
      if (activeConversationId === conversationId) {
        nextActiveId = filtered[0].id
      }
      return filtered
    })

    if (nextActiveId !== activeConversationId) {
      setActiveConversationId(nextActiveId)
    }
  }

  const stopGenerating = () => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    setIsLoading(false)
  }

  const streamAssistantReply = async (messagesForApi) => {
    const cleanedMessages = sanitizeMessages(messagesForApi)
    if (cleanedMessages.length === 0) {
      updateActiveConversation((conversation) => ({
        ...conversation,
        updatedAt: nowIso(),
        messages: [
          ...conversation.messages,
          createMessage('assistant', 'Error: No valid message found to send. Please type and try again.'),
        ],
      }))
      return
    }

    const assistantPlaceholder = createMessage('assistant', '')
    updateActiveConversation((conversation) => ({
      ...conversation,
      updatedAt: nowIso(),
      messages: [...conversation.messages, assistantPlaceholder],
    }))

    const controller = new AbortController()
    abortRef.current = controller
    setIsLoading(true)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: MODEL,
          messages: cleanedMessages.map(({ role, content }) => ({ role, content })),
        }),
      })

      if (!response.ok || !response.body) {
        const err = await response.text()
        throw new Error(err || 'Unable to stream response')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let done = false
      while (!done) {
        const { value, done: streamDone } = await reader.read()
        done = streamDone
        if (!value) continue
        const chunk = decoder.decode(value, { stream: true })
        updateActiveConversation((conversation) => ({
          ...conversation,
          updatedAt: nowIso(),
          messages: conversation.messages.map((message) =>
            message.id === assistantPlaceholder.id
              ? { ...message, content: `${message.content}${chunk}` }
              : message,
          ),
        }))
      }
    } catch (error) {
      const aborted = error?.name === 'AbortError'
      updateActiveConversation((conversation) => ({
        ...conversation,
        updatedAt: nowIso(),
        messages: aborted
          ? conversation.messages.filter(
              (message) => message.id !== assistantPlaceholder.id || message.content.trim(),
            )
          : conversation.messages.map((message) =>
              message.id === assistantPlaceholder.id
                ? { ...message, content: `Error: ${error.message}` }
                : message,
            ),
      }))
    } finally {
      setIsLoading(false)
      abortRef.current = null
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 20)
      // Text-to-speech disabled. Keep speech-to-text input only.
    }
  }

  const sendMessage = async (suggested = '') => {
    if (isLoading) return
    const raw = (suggested || input).trim()
    if (!raw) return
    const userMessage = createMessage('user', raw)
    const nextTitle = raw.length > 30 ? `${raw.slice(0, 30)}...` : raw
    const currentConversation = conversations.find(
      (conversation) => conversation.id === activeConversationId,
    )
    const safeConversation = currentConversation || createConversation()
    const targetConversationId = safeConversation.id
    const existingMessages = safeConversation.messages || []
    const messagesForApi = [...existingMessages, userMessage]
    const nextConversationTitle =
      existingMessages.length === 0 ? nextTitle : safeConversation.title || 'New Chat'

    setConversations((prev) => {
      const exists = prev.some((conversation) => conversation.id === targetConversationId)
      if (!exists) {
        return [
          {
            ...safeConversation,
            title: nextConversationTitle,
            updatedAt: nowIso(),
            messages: messagesForApi,
          },
          ...prev,
        ]
      }
      return prev.map((conversation) =>
        conversation.id === targetConversationId
          ? {
              ...conversation,
              title: nextConversationTitle,
              updatedAt: nowIso(),
              messages: messagesForApi,
            }
          : conversation,
      )
    })
    setActiveConversationId(targetConversationId)

    setInput('')
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 20)
    await streamAssistantReply(messagesForApi)
  }

  const toggleVoiceInput = () => {
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop()
      return
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setSpeechError('Speech recognition is not supported in this browser.')
      return
    }
    setSpeechError('')
    const recognition = new SpeechRecognition()
    recognition.lang = 'en-US'
    recognition.interimResults = true
    recognition.continuous = false

    recognition.onstart = () => setIsListening(true)
    recognition.onresult = (event) => {
      let transcript = ''
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        transcript += event.results[i][0]?.transcript || ''
      }
      setInput(transcript.trim())
    }
    recognition.onerror = (event) => {
      setSpeechError(`Voice error: ${event.error}`)
      setIsListening(false)
      recognitionRef.current = null
    }
    recognition.onend = () => {
      setIsListening(false)
      recognitionRef.current = null
    }

    recognitionRef.current = recognition
    recognition.start()
  }

  const onKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      sendMessage()
    }
  }

  useEffect(() => {
    const container = messagesRef.current
    if (!container || !activeConversation || activeConversation.messages.length === 0) return
    container.scrollTop = container.scrollHeight
  }, [activeConversation, activeConversationId, isLoading])

  const renderConversationButtons = (items) =>
    items.map((conversation) => (
      <div key={conversation.id} className={`chat-row-wrap ${activeConversationId === conversation.id ? 'active' : ''}`}>
        <button
          className={`chat-row ${activeConversationId === conversation.id ? 'active' : ''}`}
          type="button"
          onClick={() => setActiveConversationId(conversation.id)}
        >
          {conversation.title}
        </button>
        <button
          className="chat-delete-btn"
          type="button"
          onClick={() => deleteConversation(conversation.id)}
          title="Delete chat"
        >
          ×
        </button>
      </div>
    ))

  const promptSuggestion =
    'What are the key benefits of Product 1 that I should highlight to potential clients?'

  const hasMessages = activeConversation?.messages.length > 0

  return (
    <div className="page-shell">
      <div className="ui-frame">
        <aside className="sidebar-rail">
          <div className="avatar-orb" />
          <div className="rail-icons">
            <button className="rail-btn active" type="button">💬</button>
            <button className="rail-btn" type="button">🎧</button>
            <button className="rail-btn" type="button">⚡</button>
            <button className="rail-btn" type="button">🧩</button>
            <button className="rail-btn" type="button">🪪</button>
            <button className="rail-btn" type="button">🗂️</button>
            <button className="rail-btn new-badge" type="button">👥</button>
          </div>
          <div className="rail-footer">
            <button className="rail-btn" type="button">☼</button>
            <div className="profile-chip">S</div>
          </div>
        </aside>

        <aside className="sidebar-panel">
          <div className="panel-title-row">
            <h3>Chat</h3>
            <span>⌕</span>
          </div>
          <button className="new-chat-btn" type="button" onClick={createNewChat}>+ New Chat ✦</button>
          <section className="chat-group">
            <h4>Saved</h4>
            {renderConversationButtons(grouped.saved)}
          </section>
          <section className="chat-group">
            <h4>Today</h4>
            {renderConversationButtons(grouped.todayItems)}
          </section>
          <section className="chat-group">
            <h4>Yesterday</h4>
            {renderConversationButtons(grouped.yesterdayItems)}
          </section>
          <button className="upgrade-btn" type="button">Upgrade to Pro</button>
        </aside>

        <main className="workspace">
          <header className="workspace-header">
            <div className="model-pill">Orbita GPT <span>Plus</span></div>
            <div className="header-actions">
              <button type="button">Configuration ⚙</button>
              <button type="button">Share ⤴</button>
              <button type="button" className="primary" onClick={createNewChat}>New Chat ✦</button>
            </div>
          </header>

          <div className={`workspace-body ${hasMessages ? 'chat-mode' : ''}`}>
            {!hasMessages && (
              <section className="hero-content">
                <div className="center-orb" />
                <h1>Hi, there 👋</h1>
                <p>Tell us what you need, and we&apos;ll handle the rest.</p>

                <div className="cards-row">
                  <article className="profile-card">
                    <div className="profile-top">
                      <span>🧿 Sam Lee</span>
                      <small>Data Assistant</small>
                    </div>
                    <p>Designed to help manage sales processes and maximize customer engagement.</p>
                  </article>
                  <article className="task-card">
                    <div className="task-row">Answer RFP documentation</div>
                    <div className="task-row">Conduct a competitor analysis</div>
                    <div className="task-row">Provide feedback on communication</div>
                    <div className="task-footer">
                      <span>Tasks</span>
                      <button type="button">View AI</button>
                    </div>
                  </article>
                  <article className="prompt-card" onClick={() => sendMessage(promptSuggestion)}>
                    <p>{promptSuggestion}</p>
                    <span>Suggested prompt</span>
                  </article>
                </div>

                <div className="pill-row">
                  <button type="button" className="shortcut-pill" onClick={() => setInput('Connect my calendar and summarize upcoming meetings.')}>
                    Connect Calendar
                  </button>
                  <button type="button" className="shortcut-pill" onClick={() => setInput('Create a project plan with milestones for a demo app.')}>
                    Demo Task
                  </button>
                  <button type="button" className="shortcut-pill" onClick={() => setInput('Show integration options for CRM and Slack.')}>
                    Browse Integrations
                  </button>
                  <button type="button" className="shortcut-pill" onClick={() => setInput('Summarize shared notes and list action items.')}>
                    Shared in Notes
                  </button>
                </div>
              </section>
            )}

            {hasMessages && (
              <section className="messages-wrap" ref={messagesRef}>
                {activeConversation.messages.map((message) => (
                  <article key={message.id} className={`message ${message.role}`}>
                    <div className="message-content">
                      {message.content ? <MessageContent content={message.content} /> : isLoading ? '...' : ''}
                    </div>
                    <div className="message-time">{formatTime(message.timestamp)}</div>
                  </article>
                ))}
                <div ref={endRef} />
              </section>
            )}

            <footer className="composer-wrap">
              <div className="composer-input-wrap">
                <input
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder={isListening ? 'Listening...' : 'Ask me anything...'}
                />
                {speechError && <div className="speech-error">{speechError}</div>}
                <div className="composer-actions">
                  <div className="right-actions">
                    <button type="button" onClick={toggleVoiceInput}>{isListening ? 'Stop Voice' : 'Voice'}</button>
                    <button type="button" className="send-btn" onClick={isLoading ? stopGenerating : () => sendMessage()}>
                      {isLoading ? 'Stop' : '↑ Send'}
                    </button>
                  </div>
                </div>
              </div>
              <p>
                Centra may display inaccurate info, so please double check the response.
                <a href="/"> Your Privacy</a> &amp; Orbita GPT
              </p>
            </footer>
          </div>
        </main>
      </div>
    </div>
  )
}

export default App
