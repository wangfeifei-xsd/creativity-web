import { Typography, theme } from 'antd'
import type { CSSProperties } from 'react'
import Markdown from 'react-markdown'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import './markdown-content.css'

export function MarkdownContent({ text }: { text: string }) {
  const { token } = theme.useToken()
  return <Typography className="markdown-content" style={{
    '--markdown-border': token.colorBorderSecondary,
    '--markdown-code-background': token.colorFillTertiary,
    '--markdown-link': token.colorLink,
  } as CSSProperties}>
    <Markdown remarkPlugins={[remarkGfm, remarkFrontmatter]} skipHtml components={{
      a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
      img: ({ src, alt, title }) => <img src={src} alt={alt ?? ''} title={title} loading="lazy" referrerPolicy="no-referrer" />,
    }}>{text}</Markdown>
  </Typography>
}
