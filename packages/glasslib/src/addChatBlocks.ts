import { ChatBlock } from './parseChatBlocks'
import { parseGlassDocument, reconstructGlassDocument } from './parseGlassBlocks'

/**
 * Add a chat block to a Glass file and returns the new Glass file.
 */
export function addChatBlock(glassfile: string, block: ChatBlock) {
  return addChatBlocks(glassfile, [block])
}

/**
 * Add a list of chat block to a Glass file and returns the new Glass file.
 */
export function addChatBlocks(glassfile: string, blocks: ChatBlock[]) {
  const parsed = parseGlassDocument(glassfile)
  return reconstructGlassDocument([
    ...parsed,
    ...blocks.flatMap(block => {
      return [
        {
          content: '\n\n',
        },
        {
          content: `<${upperCaseFirstChar(block.role)}${block.name ? ` name="${block.name}"` : ''}${
            block.type ? ` type="${block.type}"` : ''
          }${block.id ? ` id="${block.id}"` : ''}>\n${block.content}\n</${upperCaseFirstChar(block.role)}>`,
        },
      ]
    }),
  ])
}

function upperCaseFirstChar(str: string) {
  return str[0].toUpperCase() + str.slice(1)
}