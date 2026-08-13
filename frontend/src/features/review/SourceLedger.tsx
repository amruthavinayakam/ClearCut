import Drawer from "../../components/Drawer";
import type { ClearanceItem } from "../../types";


interface Props {
  item: ClearanceItem;
  open: boolean;
  onClose: () => void;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}

export default function SourceLedger({ item, open, onClose, returnFocusRef }: Props) {
  const sources = item.sources.filter(
    (source, index, all) => all.findIndex((candidate) => candidate.url === source.url) === index,
  );
  return (
    <Drawer open={open} title={`Sources · ${item.name}`} onClose={onClose} returnFocusRef={returnFocusRef}>
      <div className="source-ledger">
        {sources.map((source, index) => (
          <article key={`${source.url}-${index}`}>
            <p className="eyebrow">
              {source.via.replace(/_/g, " ")} · retrieved {source.retrieved_at.slice(0, 10)}
            </p>
            <h3>
              <a href={source.url} target="_blank" rel="noreferrer noopener">
                {source.title || source.url}
              </a>
            </h3>
            {source.field && <p>Supports: {source.field}</p>}
            {source.excerpt && <blockquote>{source.excerpt}</blockquote>}
            <code>{source.url}</code>
          </article>
        ))}
      </div>
    </Drawer>
  );
}
