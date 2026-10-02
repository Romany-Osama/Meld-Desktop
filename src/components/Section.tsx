import { HomeSection, YtItem } from "../types";
import { ItemCard } from "./ItemCard";
import { withOccurrences } from "../lib/identity";

export function Section({
  section,
  onOpen,
  onMenu,
  shouldHide,
}: {
  section: HomeSection;
  onOpen: (item: YtItem) => void;
  onMenu: (item: YtItem) => void;
  shouldHide: (item: YtItem) => boolean;
}) {
  return (
    <section className="content-section">
      <div className="section-heading">
        <div>
          <h2>{section.title}</h2>
          {section.label && <p>{section.label}</p>}
        </div>
        {section.browseId && section.browseKind && (
          <button
            className="text-button"
            onClick={() =>
              onOpen({
                id: section.browseId!,
                kind: section.browseKind!,
                title: section.title,
                subtitle: section.label ?? "",
                thumbnail: section.thumbnail,
                artists: [],
                browseId: section.browseId,
                params: section.params,
              })
            }
          >
            Show all
          </button>
        )}
      </div>
      <div className="card-row">
        {withOccurrences(
          section.items.filter((item) => !shouldHide(item)),
          "section",
        ).map(({ item, key }) => (
          <ItemCard key={key} item={item} onOpen={onOpen} onMenu={onMenu} />
        ))}
      </div>
    </section>
  );
}
