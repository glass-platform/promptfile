import { interpolateGlass } from './interpolateGlass'
import { interpolateGlassChat } from './interpolateGlassChat'

export interface ChatCompletionRequestMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
  name?: string
}

export async function runGlass(
  fileName: string,
  model: 'gpt-3.5-turbo' | 'gpt-4' | 'text-davinci-003' | 'curie' | 'babbage' | 'ada',
  initDoc: string,
  options: {
    openaiKey?: string
    progress?: (data: { nextDoc: string; rawResponse?: string }) => void
  }
): Promise<{
  initDoc: string
  finalDoc: string
}> {
  if (model === 'gpt-3.5-turbo' || model === 'gpt-4') {
    return await runGlassChat(fileName, model, initDoc, options)
  }
  return runGlassCompletion(fileName, model as any, initDoc, options)
}

/**
 * Takes a glass template string and interpolation variables and outputs an array of chat messages you can use to prompt ChatGPT API (e.g. gpt-3.5-turbo or gpt-4).
 */
export async function runGlassChat(
  fileName: string,
  model: 'gpt-3.5-turbo' | 'gpt-4',
  initDoc: string,
  options: {
    openaiKey?: string
    progress?: (data: { nextDoc: string; rawResponse?: string }) => void
  }
): Promise<{
  initDoc: string
  finalDoc: string
}> {
  const messages = interpolateGlassChat(fileName, initDoc)

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      // eslint-disable-next-line turbo/no-undeclared-env-vars
      Authorization: `Bearer ${options.openaiKey || process.env.OPENAI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages,
      model: model,
      stream: true,
    }),
  })

  const response = await handleStream(r, handleChatChunk, next => {
    if (options.progress) {
      options.progress({
        // going to be smart
        nextDoc: `${initDoc}

<Assistant>
${next}
</Assistant>

<User>

</User>

<Chat model="${model}" />
`,
        rawResponse: next,
      })
    }
  })

  return {
    initDoc,
    finalDoc: `${initDoc}

<Assistant>
${response}
</Assistant>

<User>

</User>

<Chat model="${model}" />`,
  }
}

/**
 * Takes a glass template string and interpolation variables and outputs an array of chat messages you can use to prompt ChatGPT API (e.g. gpt-3.5-turbo or gpt-4).
 */
export async function runGlassCompletion(
  fileName: string,
  model: 'text-davinci-003',
  initDoc: string,
  options: {
    openaiKey?: string
    progress?: (data: { nextDoc: string; rawResponse?: string }) => void
  }
): Promise<{
  initDoc: string
  finalDoc: string
}> {
  const prompt = interpolateGlass(fileName, initDoc)

  const r = await fetch('https://api.openai.com/v1/completions', {
    method: 'POST',
    headers: {
      // eslint-disable-next-line turbo/no-undeclared-env-vars
      Authorization: `Bearer ${options.openaiKey || process.env.OPENAI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      model: model,
      stream: true,
    }),
  })

  const response = await handleStream(r, handleCompletionChunk, next => {
    if (options.progress) {
      options.progress({
        nextDoc: `${initDoc}${next}<Completion model="${model}" />`,
        rawResponse: next,
      })
    }
  })

  return {
    initDoc,
    finalDoc: `${initDoc}${response}<Completion model="${model}" />`,
  }
}

async function handleStream(
  r: Response,
  processChunk: (currResult: string, eventData: any) => string,
  progress: (nextVal: string) => void
) {
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
        fullResult = processChunk(fullResult, eventData)
        progress(fullResult)
      }
    }

    // Continue reading the stream
    await readStream()
  }

  // Start reading the stream
  await readStream()
  return fullResult
}

function handleChatChunk(currResult: string, eventData: { choices: { delta: { content: string } }[] }) {
  if (eventData.choices[0].delta.content) {
    const newResult = currResult + eventData.choices[0].delta.content
    return newResult
  }
  return currResult
}

function handleCompletionChunk(currResult: string, eventData: { choices: { text: string }[] }) {
  if (eventData.choices[0].text) {
    const newResult = currResult + eventData.choices[0].text
    return newResult
  }
  return currResult
}
