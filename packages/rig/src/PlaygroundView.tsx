import {
  VSCodeButton,
  VSCodeDropdown,
  VSCodeOption,
  VSCodePanelView,
  VSCodeTextArea,
} from '@vscode/webview-ui-toolkit/react'
import { useEffect, useMemo, useState } from 'react'
import { RigFile, RigLog } from './rig'

interface PlaygroundViewProps {
  file: RigFile
  setFile: (file: RigFile) => void
  openaiKey: string
  postMessage: (action: string, data: any) => void
}

export const PlaygroundView = (props: PlaygroundViewProps) => {
  const { file, setFile, openaiKey, postMessage } = props

  const chatModels = useMemo(() => ['gpt-3.5-turbo', 'gpt-4'], [])
  const completionModels = useMemo(() => ['text-davinci-003', 'text-curie-001', 'text-babbage-001', 'text-ada-001'], [])

  const [isLoading, setIsLoading] = useState(false)

  const reset = () => {
    setFile({ ...file, values: {}, result: '', error: null })
  }

  const textColor = file.error ? '#F44747' : '#007ACC'

  const modelSelection = file.isChat ? chatModels : completionModels

  // register a callback for when the extension sends a message
  useEffect(() => {
    // when new chat streaming data comes in, update the result with the content delta
    function processCompletionStream(currResult: string, eventData: { choices: { text: string }[] }) {
      if (eventData.choices[0].text) {
        const newResult = currResult + eventData.choices[0].text
        setFile({ ...file, result: newResult })
        return newResult
      }
      return currResult
    }

    function processChatStream(currResult: string, eventData: { choices: { delta: { content: string } }[] }) {
      if (eventData.choices[0].delta.content) {
        const newResult = currResult + eventData.choices[0].delta.content
        setFile({ ...file, result: newResult })
        return newResult
      }
      return currResult
    }

    async function handleStreamResponse(r: Response, processCb: (currResult: string, eventData: any) => string) {
      if (!r.ok) {
        throw new Error(`HTTP error: ${r.status}`)
      }

      if (r.headers.get('content-type') !== 'text/event-stream') {
        throw new Error(`Expected "text/event-stream" content type, but received "${r.headers.get('content-type')}"`)
      }

      const reader = r.body!.getReader()
      const decoder = new TextDecoder()

      let fullResult = ''

      const readStream = async () => {
        const { done, value } = await reader.read()

        if (done) {
          console.log('Stream has been closed by the server.')
          return
        }

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data:')) {
            const content = line.slice('data:'.length).trim()
            if (content === '[DONE]') {
              break
            }
            const eventData = JSON.parse(content)
            fullResult = processCb(fullResult, eventData)
          }
        }

        // Continue reading the stream
        await readStream()
      }

      // Start reading the stream
      try {
        await readStream()
        return fullResult
      } catch (e: any) {
        setFile({ ...file, result: '', error: e.message })
      } finally {
        setIsLoading(false)
      }
    }

    async function fetchCompletion(prompt: string, args: any) {
      const logIndex = file.logs.length
      const log: RigLog = {
        isChat: false,
        file: file.filename,
        args,
        model: file.model,
        prompt,
      }

      const initLogs = [...file.logs, log]
      setFile({ ...file, logs: initLogs })

      const r = await fetch('https://api.openai.com/v1/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          model: file.model,
          stream: true,
        }),
      })
      const response = await handleStreamResponse(r, processCompletionStream)

      const newLogs = [...initLogs]
      newLogs[logIndex].result = response
      setFile({ ...file, logs: newLogs })
    }

    async function fetchChatCompletion(messages: any, args: any) {
      const logIndex = file.logs.length
      const log: RigLog = {
        isChat: true,
        file: file.filename,
        args,
        model: file.model,
        prompt: messages,
      }

      const initLogs = [...file.logs, log]
      setFile({ ...file, logs: initLogs })

      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages,
          model: file.model,
          stream: true,
        }),
      })
      const response = await handleStreamResponse(r, processChatStream)

      const newLogs = [...initLogs]
      newLogs[logIndex].result = response
      setFile({ ...file, logs: newLogs })
    }

    const cb = async (event: any) => {
      const message = event.data // The JSON data our extension sent

      switch (message.action) {
        case 'updateDocumentMetadata':
          const metadata = message.data
          setFile({
            ...file,
            isChat: metadata.isChat,
            variables: metadata.interpolationVariables,
            model: metadata.isChat
              ? chatModels.includes(file.model)
                ? file.model
                : completionModels[0]
              : completionModels.includes(file.model)
              ? file.model
              : completionModels[0],
          })
          break
        case 'execFileOutput':
          const { prompt, args } = message.data
          setFile({ ...file, result: '', error: null })
          setIsLoading(true)
          if (prompt instanceof Array) {
            await fetchChatCompletion(prompt, args)
          } else {
            await fetchCompletion(prompt, args)
          }
          break
      }
    }

    window.addEventListener('message', cb)
    return () => {
      window.removeEventListener('message', cb)
    }
  }, [chatModels, completionModels, openaiKey, file])

  const exec = () => {
    if (openaiKey === '') {
      postMessage('showMessage', { level: 'error', text: 'Please set `glass.openaiKey` in your extension settings.' })
      return
    }

    const interpolationVars: any = {}
    for (const variable of file.variables) {
      interpolationVars[variable] = file.values[variable]
    }
    postMessage('execCurrentFile', {
      variables: interpolationVars,
    })
  }

  return (
    <VSCodePanelView style={{ flexDirection: 'column', minHeight: '300px', paddingTop: '16px' }}>
      <div style={{ paddingBottom: '8px' }}>
        <div style={{ paddingBottom: '4px' }}>Model</div>
        <VSCodeDropdown
          id="model-dropdown"
          onChange={e => {
            const value = (e.target as any).value
            setFile({ ...file, model: value })
          }}
        >
          {modelSelection.map(m => (
            <VSCodeOption
              key={m}
              value={m}
              selected={m === file.model}
              onSelect={() => {
                setFile({ ...file, model: m })
              }}
            >
              {m}
            </VSCodeOption>
          ))}
        </VSCodeDropdown>
      </div>
      {file.variables.map((v, i) => (
        <div key={i} style={{ paddingBottom: '8px' }}>
          <div style={{ paddingBottom: '4px' }}>{v}</div>
          <VSCodeTextArea
            style={{ width: '100%' }}
            value={file.values[v] || ''}
            onInput={e => {
              const value = (e.target as any).value
              setFile({ ...file, values: { ...file.values, [v]: value } })
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.metaKey) {
                e.currentTarget.blur()
                exec()
              }
            }}
          />
        </div>
      ))}
      <div style={{ display: 'flex', paddingTop: '8px', paddingBottom: '8px' }}>
        <VSCodeButton id="run-button" onClick={() => exec()}>
          Send
        </VSCodeButton>
        <div style={{ flex: 1 }} />
        <VSCodeButton id="reset-button" appearance="secondary" onClick={() => reset()}>
          Reset
        </VSCodeButton>
      </div>
      <span key={file.filename} style={{ color: textColor, paddingTop: '16px', whiteSpace: 'pre-wrap' }}>
        {file.error ?? file.result}
        {isLoading && <span style={{ backgroundColor: '#007ACC' }}>A</span>}
      </span>
    </VSCodePanelView>
  )
}