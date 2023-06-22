import { parseFrontmatterFromGlass } from '@glass-lang/glassc'
import { parseGlassBlocks, parseGlassDocument, removeGlassFrontmatter } from '@glass-lang/glasslib'
import * as prettier from 'prettier'
import { glassElements } from './elements'

export function formatDocument(text: string) {
  try {
    text = wrapIfNoBlocks(text)

    const nonSelfClosingTags = glassElements.filter(e => e.closingType !== 'selfClosing')

    const tagNames = glassElements.map(e => e.name).join('|')
    const lines = text.split('\n')
    const formattedLines: string[] = []
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index]

      // Check if line has any tags (with or without attributes), if yes, trim the line.
      if (new RegExp(`</?(${tagNames})(\\s+[^>]*)?>`).test(line)) {
        formattedLines.push(line.trim())
      } else {
        formattedLines.push(line)
      }
    }
    let finalText = formattedLines.join('\n').trim()
    const tags = nonSelfClosingTags.map(e => e.name)
    tags.forEach(tag => {
      const regexOpen = new RegExp(`<\\s+${tag}`, 'g')
      const regexClose = new RegExp(`${tag}\\s+>`, 'g')
      finalText = finalText.replace(regexOpen, `<${tag}`).replace(regexClose, `${tag}>`)
    })
    // Correctly format tag attributes and self-closing tags
    finalText = finalText.replace(/<(\w+)(\s+[^>]*?)(\/?)\s*>/g, (match, p1, p2, p3) => {
      // Trim trailing spaces from attributes and reassemble the tag
      return p3 ? `<${p1}${p2.trimEnd()} ${p3}>` : `<${p1}${p2.trimEnd()}>`
    })
    const frontmatter = parseFrontmatterFromGlass(finalText)
    if (frontmatter == null) {
      finalText = removeGlassFrontmatter(finalText)
    }

    // Check if the document contains any of the required tags
    const sections = parseGlassDocument(finalText)
    const blocks = sections.map(s => {
      if (s.type === 'frontmatter') {
        return s
      }
      if (s.type === 'block') {
        let childContent = s.child!.content
        if (childContent.length === 0) {
          const formatted = prettify(s.content).trim()
          return { ...s, content: formatted.startsWith(';') ? formatted.substring(1) : formatted }
        }
        const blockWithoutChild =
          s.content.substring(0, s.child!.position.start.offset - s.position.start.offset) +
          'GLASS_INNERBLOCK_SUBSTITUTION' +
          s.content.substring(s.child!.position.end.offset - s.position.start.offset)

        if (s.tag === 'Code' || s.tag === 'Test') {
          childContent = prettify(childContent).trim()
        }

        const formatted = prettify(blockWithoutChild)
          .replace(/\s*GLASS_INNERBLOCK_SUBSTITUTION\s*/, '\n' + childContent + '\n')
          .trim()
        return { ...s, content: formatted.startsWith(';') ? formatted.substring(1) : formatted }
      }
      return s
    })
    finalText = blocks.map(b => b.content).join('')

    // Add <Request /> tag if not present
    const finalBlocks = parseGlassBlocks(finalText)
    const hasRequest =
      finalText.includes('<Request ') || finalBlocks.some(b => b.type === 'block' && b.tag === 'Request')
    if (!hasRequest) {
      finalText = `${finalText}\n\n<Request model="gpt-3.5-turbo" />`
    }

    for (const element of glassElements) {
      const regex = new RegExp(`<${element.name}(\\s+[^>]*)?>\\s*<\\/${element.name}>`, 'g')
      finalText = finalText.replace(regex, `<${element.name}$1>\n\n</${element.name}>`)
    }

    return finalText.trim()
  } catch (e) {
    console.error(e)
    return text
  }
}
function wrapIfNoBlocks(text: string) {
  const tagNames = glassElements.map(e => e.name).join('|')
  const hasTags = new RegExp(`<(${tagNames})`).test(text)

  // If no tags are present, wrap the entire content in <User> </User> tags
  if (!hasTags) {
    return `<User>\n${text.trim()}\n</User>`
  }

  return text
}

function prettify(code: string) {
  return prettier.format(code, {
    parser: 'typescript',
    printWidth: 120,
    arrowParens: 'avoid',
    semi: false,
    singleQuote: true,
    trailingComma: 'es5',
  })
}
