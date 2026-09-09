import { useEffect, useRef } from 'react'
import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import python from 'highlight.js/lib/languages/python'
import json from 'highlight.js/lib/languages/json'
import xml from 'highlight.js/lib/languages/xml'
import css from 'highlight.js/lib/languages/css'
import shell from 'highlight.js/lib/languages/shell'
import sql from 'highlight.js/lib/languages/sql'
import yaml from 'highlight.js/lib/languages/yaml'
import markdown from 'highlight.js/lib/languages/markdown'

import '../styles/hljs-bench-dark.css'

hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('python', python)
hljs.registerLanguage('json', json)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('css', css)
hljs.registerLanguage('shell', shell)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('markdown', markdown)

export default function HighlightedCode({ code, language }) {
  const codeRef = useRef(null)

  useEffect(() => {
    if (codeRef.current) {
      // Remove any previously injected hljs classes before re-highlighting
      codeRef.current.className = language ? `language-${language}` : ''
      hljs.highlightElement(codeRef.current)
    }
  }, [code, language])

  return (
    <pre className="text-xs font-mono bg-bench-950 p-2 overflow-x-auto max-h-40 text-dust">
      <code ref={codeRef} className={language ? `language-${language}` : ''}>
        {code}
      </code>
    </pre>
  )
}
