import { ArrowLeft, ArrowRight, Monitor, Smartphone } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Direction } from "./data";
import { directions } from "./data";
import { LobbyPrototype } from "./LobbyPrototype";

function Thumbnail({ direction }: { direction: Direction }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  useEffect(() => {
    const node = box.current;
    if (!node) {
      return undefined;
    }
    const observer = new ResizeObserver(
      ([entry]: readonly ResizeObserverEntry[]) => {
        if (entry) {
          setScale(entry.contentRect.width / 1440);
        }
      },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <div aria-hidden="true" className="study-thumbnail" inert ref={box}>
      <iframe
        loading="lazy"
        src={`?design=${direction.id}&embed=1`}
        style={{ transform: `scale(${scale})` }}
        tabIndex={-1}
        title={`${direction.name} preview`}
      />
    </div>
  );
}

export function Gallery() {
  const query = new URLSearchParams(globalThis.location.search);
  const id = query.get("design");
  const direction = directions.find((candidate) => candidate.id === id);
  const [mobile, setMobile] = useState(query.get("viewport") === "mobile");
  function designLink(designID: string) {
    return `?design=${designID}${mobile ? "&viewport=mobile" : ""}`;
  }
  if (direction && query.get("embed") === "1") {
    return <LobbyPrototype direction={direction} />;
  }
  if (direction) {
    const index = directions.indexOf(direction);
    const previous =
      directions[(index + directions.length - 1) % directions.length];
    const next = directions[(index + 1) % directions.length];
    if (!previous || !next) {
      throw new Error("Prototype navigation is missing a direction.");
    }
    return (
      <div className="study-workbench">
        <header className="study-toolbar">
          <a className="study-back" href="prototypes.html">
            <ArrowLeft size={17} /> All ten
          </a>
          <label className="study-picker">
            <span>Design</span>
            <select
              aria-label="Design"
              onChange={(event) => {
                globalThis.location.search = designLink(event.target.value);
              }}
              value={direction.id}
            >
              {directions.map((item, number) => (
                <option key={item.id} value={item.id}>
                  {number + 1}. {item.name}
                </option>
              ))}
            </select>
          </label>
          <div aria-label="Preview size" className="study-devices">
            <button
              aria-label="Desktop preview"
              aria-pressed={!mobile}
              onClick={() => setMobile(false)}
            >
              <Monitor size={18} />
            </button>
            <button
              aria-label="Mobile preview"
              aria-pressed={mobile}
              onClick={() => setMobile(true)}
            >
              <Smartphone size={18} />
            </button>
          </div>
          <span className="study-sample">
            Interactive sample. No live games.
          </span>
          <div className="study-pagination">
            <a aria-label="Previous design" href={designLink(previous.id)}>
              <ArrowLeft size={17} />
            </a>
            <span>{index + 1} / 10</span>
            <a aria-label="Next design" href={designLink(next.id)}>
              <ArrowRight size={17} />
            </a>
          </div>
        </header>
        <div className={`study-stage ${mobile ? "study-mobile" : ""}`}>
          <iframe
            src={`?design=${direction.id}&embed=1`}
            title={`${direction.name} interactive prototype`}
          />
        </div>
      </div>
    );
  }
  return (
    <div className="study-index">
      <header className="study-index-header">
        <a className="study-wordmark" href="prototypes.html">
          hanab<span> / design studies</span>
        </a>
        <span>Same game. Ten different places to play.</span>
      </header>
      <main>
        {id && (
          <p role="alert">
            That design was not found. Choose one of the ten prototypes below.
          </p>
        )}
        <div className="study-intro">
          <div>
            <h1>
              Find your kind
              <br />
              of game room.
            </h1>
            <p>
              Ten directions for the next Hanab Live lobby. Different layouts,
              different moods, the same familiar game.
            </p>
          </div>
          <div className="study-instructions">
            <strong>Take a look around.</strong>
            <p>
              Open any design. Try the search, filters, sample table creation,
              and chat. Switch to mobile to see how it fits a smaller screen.
            </p>
            <span>
              All names, tables, and messages are fictional sample data.
            </span>
          </div>
        </div>
        <div className="study-grid">
          {directions.map((item, index) => (
            <a className="study-card" href={`?design=${item.id}`} key={item.id}>
              <Thumbnail direction={item} />
              <div className="study-card-caption">
                <div>
                  <span className="study-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h2>{item.name}</h2>
                </div>
                <span aria-hidden="true" className="study-swatches">
                  {item.colors.map((color) => (
                    <i key={color} style={{ background: color }} />
                  ))}
                </span>
              </div>
              <p>{item.summary}</p>
              <div className="study-card-foot">
                <span>{item.character}</span>
                <ArrowRight size={18} />
              </div>
            </a>
          ))}
        </div>
      </main>
      <footer>
        Designed with Impeccable's product-interface principles. These are
        alternatives to choose from, not changes to the live lobby.
      </footer>
    </div>
  );
}
