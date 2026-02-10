import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const MODEL_OPTIONS = ['qwen2.5:1.5b', 'qwen2.5:3b', 'deepseek-coder:6.7b']

const createMessage = (role, content = '') => ({
  id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  role,
  content,
  timestamp: new Date().toISOString(),
})

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
    if (/^`[^`]+`$/.test(segment)) {
      return <code key={idx}>{segment.slice(1, -1)}</code>
    }
    if (/^\*\*[^*]+\*\*$/.test(segment)) {
      return <strong key={idx}>{segment.slice(2, -2)}</strong>
    }
    if (/^\*[^*]+\*$/.test(segment)) {
      return <em key={idx}>{segment.slice(1, -1)}</em>
    }
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
    if (listMatch) {
      listItems.push(listMatch[1])
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
  const parts = content.split(/```([a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g)
  const blocks = []

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
      blocks.push(
        <pre key={`code-${i}`} className="code-block">
          <div className="code-header">{lang || 'code'}</div>
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
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [model, setModel] = useState('qwen2.5:1.5b')
  const [copiedId, setCopiedId] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [liveTranscript, setLiveTranscript] = useState('')
  const [autoSpeak, setAutoSpeak] = useState(true)
  const [voiceOptions, setVoiceOptions] = useState(['coqui-tts:en_ljspeech'])
  const [ttsVoice, setTtsVoice] = useState('coqui-tts:en_ljspeech')
  const abortRef = useRef(null)
  const recognitionRef = useRef(null)
  const audioRef = useRef(null)
  const audioUrlRef = useRef(null)
  const endRef = useRef(null)

  const canSend = useMemo(() => input.trim().length > 0 && !isLoading, [input, isLoading])
  const getNonEmptyMessages = (items) =>
    items.filter((item) => typeof item.content === 'string' && item.content.trim().length > 0)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, isLoading])

  useEffect(() => {
    const loadVoices = async () => {
      try {
        const response = await fetch('/api/voices')
        if (!response.ok) return
        const payload = await response.json()
        const rawVoices = payload?.voices
        const flattened = Array.isArray(rawVoices)
          ? rawVoices
          : rawVoices && typeof rawVoices === 'object'
            ? Object.keys(rawVoices)
            : []

        if (flattened.length) {
          setVoiceOptions(flattened)
          if (payload?.default_voice && flattened.includes(payload.default_voice)) {
            setTtsVoice(payload.default_voice)
          } else if (!flattened.includes(ttsVoice)) {
            setTtsVoice(flattened[0])
          }
        }
      } catch {
        // OpenTTS unavailable; keep default voice string.
      }
    }

    loadVoices()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    return () => {
      if (recognitionRef.current) recognitionRef.current.stop()
      if (audioRef.current) audioRef.current.pause()
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current)
    }
  }, [])

  const speakText = async (text) => {
    if (!autoSpeak || !text.trim()) return
    try {
      if (audioRef.current) {
        audioRef.current.pause()
      }
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current)
        audioUrlRef.current = null
      }

      const response = await fetch('/api/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: ttsVoice }),
      })
      if (!response.ok) return

      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      audioUrlRef.current = objectUrl
      const audio = new Audio(objectUrl)
      audioRef.current = audio
      audio.onended = () => {
        if (audioUrlRef.current) {
          URL.revokeObjectURL(audioUrlRef.current)
          audioUrlRef.current = null
        }
      }
      await audio.play()
    } catch {
      // Ignore playback errors to keep chat responsive.
    }
  }

  const streamResponse = async (nextMessages) => {
    const controller = new AbortController()
    abortRef.current = controller
    setIsLoading(true)

    const assistantMessage = createMessage('assistant', '')
    setMessages((prev) => [...prev, assistantMessage])

    let assistantText = ''
    let wasAborted = false

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: getNonEmptyMessages(nextMessages).map(({ role, content }) => ({ role, content })),
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
          assistantText += chunk
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessage.id ? { ...msg, content: msg.content + chunk } : msg,
            ),
          )
        }
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        wasAborted = true
        setMessages((prev) => prev.filter((msg) => msg.id !== assistantMessage.id || msg.content.trim()))
      } else {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessage.id && !msg.content
              ? { ...msg, content: `Error: ${error.message}` }
              : msg,
          ),
        )
      }
    } finally {
      setIsLoading(false)
      abortRef.current = null
      if (!wasAborted && assistantText.trim()) {
        speakText(assistantText)
      }
    }
  }

  const sendMessage = async (textOverride = '') => {
    const userText = (textOverride || input).trim()
    if (!userText || isLoading) return

    const cleanHistory = getNonEmptyMessages(messages)
    const nextMessages = [...cleanHistory, createMessage('user', userText)]
    setMessages(nextMessages)
    setInput('')
    setLiveTranscript('')
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
    if (audioRef.current) {
      audioRef.current.pause()
    }
  }

  const clearChat = () => {
    if (isLoading) return
    stopStreaming()
    setMessages([])
  }

  const copyMessage = async (id, content) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedId(id)
      window.setTimeout(() => setCopiedId(''), 1200)
    } catch {
      setCopiedId('')
    }
  }

  const startListening = () => {
    if (isLoading || isListening) return
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setMessages((prev) => [...prev, createMessage('assistant', 'Voice input is not supported in this browser.')])
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = 'en-US'
    recognition.interimResults = true
    recognition.continuous = false
    recognition.maxAlternatives = 1

    let finalText = ''
    recognition.onresult = (event) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalText += `${transcript} `
        } else {
          interim += transcript
        }
      }
      const cleanedFinal = finalText.trim()
      const cleanedInterim = interim.trim()
      setLiveTranscript(cleanedInterim)
      setInput(cleanedFinal || cleanedInterim)
    }

    recognition.onerror = () => {
      setIsListening(false)
      setLiveTranscript('')
    }

    recognition.onend = () => {
      setIsListening(false)
      setLiveTranscript('')
      const cleaned = finalText.trim()
      if (cleaned && !isLoading) {
        sendMessage(cleaned)
      }
    }

    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
  }

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
    }
    setIsListening(false)
  }

  const formatTime = (value) =>
    new Date(value || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

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
        <div className="title-wrap">
          <h1 className="app-title">Local GPT Voice</h1>
          <span className="active-model">{model}</span>
        </div>

        <div className="voice-controls">
          <select
            className="voice-select"
            value={ttsVoice}
            onChange={(e) => setTtsVoice(e.target.value)}
            disabled={isLoading}
          >
            {voiceOptions.map((voiceName) => (
              <option key={voiceName} value={voiceName}>
                {voiceName}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={`ghost-btn ${autoSpeak ? 'active' : ''}`}
            onClick={() => setAutoSpeak((value) => !value)}
          >
            {autoSpeak ? 'Speaker On' : 'Speaker Off'}
          </button>
          <button
            type="button"
            className={`ghost-btn ${isListening ? 'active' : ''}`}
            onClick={isListening ? stopListening : startListening}
            disabled={isLoading}
          >
            {isListening ? 'Listening...' : 'Mic'}
          </button>
        </div>

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

        <div className="header-actions">
          <button type="button" className="ghost-btn" onClick={clearChat} disabled={isLoading || !messages.length}>
            Clear
          </button>
          <button type="button" className="ghost-btn" onClick={stopStreaming} disabled={!isLoading}>
            Stop
          </button>
        </div>
      </header>

      {liveTranscript && (
        <div className="live-transcript">
          <span className="pulse-dot" />
          {liveTranscript}
        </div>
      )}

      <main className="chat-window">
        {messages.length === 0 && (
          <div className="empty-state">
            <p>Tap Mic and start speaking. I will answer in voice.</p>
          </div>
        )}
        <div className="messages">
          {messages.map((msg) => (
            <div key={msg.id} className={`message-row ${msg.role}`}>
              <div className={`avatar ${msg.role}`}>{msg.role === 'user' ? 'U' : 'AI'}</div>
              <div className={`message-bubble ${msg.role}`}>
                {msg.content ? <MessageContent content={msg.content} /> : isLoading ? <span className="typing-dots" /> : null}
                <div className="meta-row">
                  <span className="timestamp">{formatTime(msg.timestamp)}</span>
                  {msg.content ? (
                    <button
                      type="button"
                      className="copy-btn"
                      onClick={() => copyMessage(msg.id, msg.content)}
                      title="Copy message"
                    >
                      {copiedId === msg.id ? 'Copied' : 'Copy'}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      </main>

      <form className="composer" onSubmit={onSubmit}>
        <textarea
          rows={1}
          placeholder={isListening ? 'Listening...' : 'Type or use Mic'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={isLoading}
        />
        <div className="actions">
          {isLoading ? (
            <button type="button" className="icon-btn" onClick={stopStreaming} title="Stop generating">
              x
            </button>
          ) : (
            <button type="submit" className="icon-btn" disabled={!canSend} title="Send message">
              {'>'}
            </button>
          )}
        </div>
      </form>
    </div>
  )
}

export default App
