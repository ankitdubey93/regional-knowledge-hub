import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FactValue } from './FactValue';

/** {{fact:key}} becomes a link with a fact: URL, which the `a` renderer swaps for a FactValue. */
function withFactLinks(body: string): string {
  return body.replace(/\{\{fact:([a-zA-Z0-9.]+)\}\}/g, (_m, key: string) => `[${key}](fact:${key})`);
}

export function Markdown({ body }: { body: string }) {
  return (
    <div className="prose-doc">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(url) => (url.startsWith('fact:') ? url : defaultUrlTransform(url))}
        components={{
          a: ({ href, children }) => {
            if (href?.startsWith('fact:')) return <FactValue factKey={href.slice(5)} />;
            const external = href?.startsWith('http');
            return (
              <a href={href} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>
                {children}
              </a>
            );
          },
          table: ({ children }) => (
            <div className="my-4 overflow-x-auto rounded-lg border border-line">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {withFactLinks(body)}
      </ReactMarkdown>
    </div>
  );
}
