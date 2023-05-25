
export function getInterstitialCodePrompt() {
  function getTestData() {
    return {}
  }

  const compile = async (opt: {}) => {
    const GLASS_STATE = {}

    const foo = 'bar'
    const baz = 'bar'

    const GLASSVAR = {}
    const TEMPLATE = `const foo = "bar"
<Prompt>
${foo}
</Prompt>
const baz = "bar"`
    return {
      fileName: 'interstitialCode',
      model: 'text-davinci-003',
      interpolatedDoc: TEMPLATE,
      originalDoc: 'const foo = "bar"\n<Prompt>\n${foo}\n</Prompt>\nconst baz = "bar"',
      state: GLASS_STATE,
      onResponse: undefined,
    }
  }

  return { getTestData, compile }
}