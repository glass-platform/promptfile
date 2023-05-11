import { transpileGlass } from '@glass-lang/glassc'
import fs from 'fs'
import path from 'path'
import * as vscode from 'vscode'
import { LanguageClient, TransportKind } from 'vscode-languageclient/node'
import { LeftPanelWebview, getInteroplationVariables } from './LeftWebviewProvider'
import { isGlassFile } from './util/isGlassFile'

let client: LanguageClient | null = null

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  // The server is implemented in node
  const languageServerModule = context.asAbsolutePath('out/language-server.js')

  client = new LanguageClient(
    'Glass',
    // If the extension is launched in debug mode then the debug server options are used
    // Otherwise the run options are used
    {
      run: { module: languageServerModule, transport: TransportKind.ipc },
      debug: {
        module: languageServerModule,
        transport: TransportKind.ipc,
        options: { execArgv: ['--nolazy', '--inspect=6009'] },
      },
    },
    {
      documentSelector: [
        { scheme: 'file', language: 'glass' },
        // { scheme: 'file', language: 'typescript' },
        // { scheme: 'file', language: 'typescriptreact' },
        // { scheme: 'file', language: 'javascript' },
        // { scheme: 'file', language: 'javascriptreact' },
      ],
      outputChannelName: 'Glass Language Server',
    }
  )
  await client.start()

  // Register rig view

  const leftPanelWebViewProvider = new LeftPanelWebview(context?.extensionUri, {})
  const view = vscode.window.registerWebviewViewProvider('left-panel-webview', leftPanelWebViewProvider)
  context.subscriptions.push(view)

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor && isGlassFile(editor.document)) {
        const text = editor.document.getText()
        const vars = getInteroplationVariables(text)

        if (leftPanelWebViewProvider._view.webview) {
          leftPanelWebViewProvider._view.webview.postMessage({
            command: 'updateInterpolationVariables',
            data: vars,
          })
        }
      }
    })
  )

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(event => {
      if (!event.document.fileName.endsWith('.glass')) {
        return
      }
      const activeEditor = vscode.window.activeTextEditor

      if (!activeEditor || activeEditor.document !== event.document) {
        return
      }

      if (leftPanelWebViewProvider._view.webview) {
        const text = event.document.getText()
        const vars = getInteroplationVariables(text)

        leftPanelWebViewProvider._view.webview.postMessage({
          command: 'updateInterpolationVariables',
          data: vars,
        })
      } else {
        console.log('webview not ready')
      }
    })
  )

  // end register rig

  // await executeGlassFile()

  let activeEditor = vscode.window.activeTextEditor

  const codeDecorations = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor('glass.code.background'),
    isWholeLine: true,
  })

  if (activeEditor) {
    updateDecorations()
  }

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(
      editor => {
        activeEditor = editor
        if (editor) {
          updateDecorations()
        }
      },
      null,
      context.subscriptions
    ),
    vscode.workspace.onDidChangeTextDocument(
      editor => {
        if (activeEditor && editor.document === activeEditor.document) {
          updateDecorations()
        }
      },
      null,
      context.subscriptions
    )
    // vscode.workspace.onDidCloseTextDocument(document => diagnosticCollection.delete(document.uri))
  )

  function updateDecorations() {
    if (!activeEditor) {
      console.log('no active editor')
      return
    }

    const regEx = /<(Code)>([\s\S]*?)<\/\1>/g
    const text = activeEditor.document.getText()
    const highlights = []

    let match = null

    while ((match = regEx.exec(text))) {
      const startPos = activeEditor.document.positionAt(match.index)
      const endPos = activeEditor.document.positionAt(match.index + match[0].length)

      // Update the start position to the next line after the opening tag
      const openingTagLine = startPos.line
      const contentStartLine = openingTagLine + 1
      const contentStartPosition = new vscode.Position(contentStartLine, 0)

      // Update the end position to the previous line before the closing tag
      const closingTagLine = endPos.line
      const contentEndLine = closingTagLine - 1
      const contentEndPosition = new vscode.Position(contentEndLine, Number.MAX_SAFE_INTEGER)

      // Create a range for the content between the opening and closing tags
      const range = new vscode.Range(contentStartPosition, contentEndPosition)
      highlights.push(range)
    }

    // console.log('highlights are', highlights)

    activeEditor.setDecorations(codeDecorations, highlights)
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('glass.transpileAll', async () => {
      const workspaceFolders = vscode.workspace.workspaceFolders
      if (workspaceFolders) {
        for (const workspaceFolder of workspaceFolders) {
          const outputDirectory: string = vscode.workspace.getConfiguration('glass').get('outputDirectory') as any
          const folderPath = workspaceFolder.uri.fsPath
          /* eslint no-template-curly-in-string: "off" */
          const outDir = outputDirectory.replace('${workspaceFolder}', folderPath)

          if (!fs.existsSync(outDir)) {
            fs.mkdirSync(outDir)
          }

          console.log('about to transpile')
          try {
            const output = transpileGlass(folderPath, folderPath, 'typescript', outDir)

            console.log({ output })

            fs.writeFileSync(path.join(outDir, 'glass.ts'), output)
          } catch (error) {
            console.error(error)
          }
        }
      }

      await vscode.window.showInformationMessage(`Transpiled all glass files!`)
    }),
    vscode.commands.registerCommand('glass.transpileCurrentFile', async () => {
      const editor = vscode.window.activeTextEditor
      if (editor) {
        const document = editor.document
        const filePath = document.uri.fsPath
        try {
          const file = filePath.split('/').slice(-1)[0]
          const code = transpileGlass(path.dirname(filePath), filePath, 'typescript', path.join(path.dirname(filePath)))

          // Fs.writeFileSync(path.join(outputDirectory, 'glassPrompts.ts'), code)
          // const code = processFile(filePath)
          await vscode.env.clipboard.writeText(code)
          await vscode.window.showInformationMessage(`Transpiled ${file} to clipboard.`)
        } catch (error) {
          console.error(error)
          throw error
        }
      }
    })
  )
}

// This method is called when your extension is deactivated
export async function deactivate() {
  if (client) {
    return await client.stop()
  }
}
