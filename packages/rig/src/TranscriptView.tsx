import { GlassContent } from '@glass-lang/glasslib'
import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { materialOceanic } from 'react-syntax-highlighter/dist/esm/styles/prism'

interface TranscriptViewProps {
  blocks: GlassContent[]
  sessionId: string
}

export const TranscriptView = (props: TranscriptViewProps) => {
  const { blocks, sessionId } = props
  const [autoScroll, setAutoScroll] = useState(true)
  const chatContainer = useRef<HTMLDivElement | null>(null)

  // Define a Markdown syntax highlighting component
  const CodeBlock = ({ language, value }: { language: string; value: string }) => {
    const handleCopy = () => {
      navigator.clipboard.writeText(value).catch(err => console.error('Could not copy text: ', err))
    }

    return (
      <div style={{ width: '100%', borderRadius: '4px', display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            fontSize: '12px',
            width: '100%',
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ opacity: 0.5 }}>{language}</div>
          <div
            onMouseEnter={(event: any) => {
              event.target.style.opacity = '1.0'
            }}
            onMouseLeave={(event: any) => {
              event.target.style.opacity = '0.5'
            }}
            style={{ cursor: 'pointer', opacity: 0.5 }}
            onClick={handleCopy}
          >
            Copy
          </div>
        </div>
        <SyntaxHighlighter language={language} style={materialOceanic}>
          {value}
        </SyntaxHighlighter>
      </div>
    )
  }

  const colorLookup: Record<string, string> = {
    User: '#5EC5E5',
    Assistant: '#4EC9B0',
  }

  const handleScroll = () => {
    if (!chatContainer.current) return

    const { scrollTop, scrollHeight, clientHeight } = chatContainer.current
    const atBottom = Math.abs(scrollHeight - scrollTop - clientHeight) < 5

    setAutoScroll(atBottom)
  }

  useEffect(() => {
    // Attach the scroll event handler
    const current = chatContainer.current
    chatContainer.current?.addEventListener('scroll', handleScroll)

    // Detach the handler when the component unmounts
    return () => {
      current?.removeEventListener('scroll', handleScroll)
    }
  }, [])

  useEffect(() => {
    // Only scroll automatically if the user is at the bottom of the chat
    if (autoScroll) {
      document.getElementById('end')?.scrollIntoView()
    }
  }, [blocks, autoScroll])

  function requestSummary(block: GlassContent): string | undefined {
    const modelAttr = block.attrs?.find(attr => attr.name === 'model')
    if (block.tag !== 'Assistant' || !modelAttr) {
      return undefined
    }
    return modelAttr.stringValue
  }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div
        ref={chatContainer}
        style={{
          flexDirection: 'column',
          overflowY: 'auto',
          overflowX: 'hidden',
          height: '100%',
          paddingLeft: '24px',
          paddingRight: '24px',
        }}
      >
        <div
          style={{
            paddingTop: '16px',
            paddingBottom: '16px',
            fontFamily: 'monospace',
            fontSize: '10px',
            opacity: 0.3,
            width: '100%',
            textAlign: 'center',
          }}
        >
          {sessionId}
        </div>
        {blocks.map((block, index) => {
          const summary = requestSummary(block)
          return (
            <div
              key={index}
              style={{
                display: 'flex',
                flexDirection: 'column',
                paddingBottom: '48px',
                fontStyle: block.tag === 'System' ? 'italic' : 'normal',
                width: '100%',
              }}
            >
              <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', paddingBottom: '4px' }}>
                <span
                  style={{
                    fontWeight: 'bold',
                    color: block.tag ? colorLookup[block.tag] : undefined,
                    fontStyle: 'italic',
                    fontSize: '12px',
                  }}
                >
                  {block.tag}
                </span>
                {summary && <span style={{ fontFamily: 'monospace', opacity: 0.5, fontSize: '10px' }}>{summary}</span>}
              </div>
              <ReactMarkdown
                components={{
                  code({ node, inline, className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || '')
                    return !inline && match ? (
                      <CodeBlock language={match[1]} value={String(children).replace(/\n$/, '')} {...props} />
                    ) : (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    )
                  },
                }}
              >
                {block.child?.content ?? ''}
              </ReactMarkdown>
            </div>
          )
        })}
        <div id={'end'} style={{ width: '100%', height: '0px' }} />
      </div>
    </div>
  )
}
