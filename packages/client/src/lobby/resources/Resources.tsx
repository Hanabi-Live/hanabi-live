// The "Resources" page: links to documentation, the community, and the project.

import { PROJECT_NAME } from "@hanabi-live/data";

interface Resource {
  readonly icon: string;
  readonly title: string;
  readonly href: string;
  readonly description: React.ReactNode;
}

const GITHUB_URL = "https://github.com/Hanabi-Live/hanabi-live";

const GROUPS = [
  {
    title: "Learn the Game",
    resources: [
      {
        icon: "fa-play-circle",
        title: "The Rules / How to Play",
        href: "https://www.youtube.com/watch?v=VrFCekQb4nY",
        description:
          "This website does not have a tutorial on how to play, so watch this video instead.",
      },
      {
        icon: "fa-book",
        title: "The Hanab Live Manual & List of Features",
        href: `${GITHUB_URL}/blob/main/docs/features.md`,
        description: "Get answers to the most common questions.",
      },
      {
        icon: "fa-chess",
        title: "Strategies and Conventions",
        href: "https://hanabi.github.io/",
        description:
          "This is a document that lists the strategies and conventions used by the H-Group. (You don't have to use them if you don't want to.)",
      },
      {
        icon: "fa-globe",
        title: "Hanabi Central Wiki",
        href: "https://hanabi.wiki/",
        description: "This wiki contains even more convention systems.",
      },
    ],
  },
  {
    title: "Community",
    resources: [
      {
        icon: "fa-comments",
        title: "The H-Group Discord Server",
        href: "https://discord.gg/FADvkJp",
        description: "A place to find teammates and discuss strategy.",
      },
      {
        icon: "fa-stopwatch",
        title: "Speedrun.com Leaderboards",
        href: "https://www.speedrun.com/hanabi",
        description: "The fastest times in the world are tracked here.",
      },
    ],
  },
  {
    title: "This Website",
    resources: [
      {
        icon: "fa-clipboard-list",
        title: "Changelog",
        href: `${GITHUB_URL}/blob/main/docs/changelog.md`,
        description: "See what has changed on the website over time.",
      },
      {
        icon: "fa-code",
        title: "The Code Repository",
        href: GITHUB_URL,
        description:
          "This client and server are open-source, hosted on GitHub.",
      },
      {
        icon: "fa-bug",
        title: "File a Bug Report",
        href: `${GITHUB_URL}/issues`,
        description:
          "Report bugs by opening a new issue on GitHub. (You will need to create a free GitHub account.) Make sure that someone else has not already opened the same issue.",
      },
    ],
  },
  {
    title: "Give Back",
    resources: [
      {
        icon: "fa-hand-holding-heart",
        title: "Make the World a Better Place",
        href: "https://www.givewell.org/charities/top-charities",
        description: (
          <>
            {PROJECT_NAME} is hosted free of charge and does not have any
            advertisements. If you enjoy the website and want to help out,
            consider donating a{" "}
            <DescriptionLink href="https://www.givingwhatwecan.org/">
              portion of your income
            </DescriptionLink>{" "}
            to the top-rated charities in the world. (
            <DescriptionLink href="https://en.wikipedia.org/wiki/GiveWell">
              GiveWell
            </DescriptionLink>{" "}
            is widely regarded as a pretty good organization for assessing which
            charities are good.)
          </>
        ),
      },
    ],
  },
] as const satisfies ReadonlyArray<{
  readonly title: string;
  readonly resources: readonly Resource[];
}>;

export function Resources(): React.JSX.Element {
  return (
    <>
      <h2>Resources</h2>
      {GROUPS.map(({ title, resources }, index) => (
        <section className={index === 0 ? undefined : "tw:mt-6"} key={title}>
          <h3 className="tw:mx-0 tw:mt-0 tw:mb-[0.6em] tw:text-[1em] tw:text-text-label">
            {title}
          </h3>
          <ul className="tw:m-0 tw:grid tw:list-none tw:grid-cols-[repeat(auto-fill,minmax(22em,1fr))] tw:gap-3 tw:p-0">
            {resources.map((resource) => (
              <ResourceItem key={resource.title} resource={resource} />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

/** One resource. Its title's link covers the whole item. */
function ResourceItem({ resource }: { readonly resource: Resource }) {
  return (
    <li className="tw:group tw:relative tw:m-0 tw:flex tw:items-start tw:gap-4 tw:rounded-(--radius) tw:border tw:border-solid tw:border-border-panel tw:bg-surface-panel tw:px-4 tw:py-[0.9em] tw:transition-[background-color,border-color] tw:duration-150 tw:ease-[ease] tw:focus-within:border-green tw:focus-within:bg-surface tw:hover:border-green tw:hover:bg-surface">
      <span className="tw:inline-flex tw:size-[2.3em] tw:shrink-0 tw:items-center tw:justify-center tw:rounded-full tw:bg-green-tint tw:text-[1.2em] tw:text-green-text">
        <i className={`fas ${resource.icon}`} />
      </span>
      <div className="tw:min-w-0">
        <a
          className="tw:border-b-0 tw:font-normal tw:text-text-strong tw:no-underline tw:group-focus-within:text-green-text tw:group-hover:text-green-text tw:after:absolute tw:after:inset-0 tw:after:content-['']"
          href={resource.href}
          rel="noopener noreferrer"
          target="_blank"
        >
          {resource.title}
        </a>
        <p className="tw:mx-0 tw:mt-[0.2em] tw:mb-0 tw:text-[0.9em] tw:leading-[1.5em]">
          {resource.description}
        </p>
      </div>
    </li>
  );
}

/** A link inside a description, which stays clickable on its own. */
function DescriptionLink({
  children,
  href,
}: {
  readonly children: React.ReactNode;
  readonly href: string;
}) {
  return (
    <a
      className="tw:relative tw:z-1"
      href={href}
      rel="noopener noreferrer"
      target="_blank"
    >
      {children}
    </a>
  );
}
