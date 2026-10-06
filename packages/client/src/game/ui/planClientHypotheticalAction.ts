import type {
  GameAction,
  HypotheticalActionIntent,
  PlanHypotheticalActionContext,
} from "@hanabi-live/game";
import { getInitialCardState, planHypotheticalAction } from "@hanabi-live/game";

/** Adapts the client's available card views to the hypothetical planner. */
export function planClientHypotheticalAction(
  intent: HypotheticalActionIntent,
  context: PlanHypotheticalActionContext,
): readonly GameAction[] | null {
  const { gameState, metadata, variant, cardIdentities, cardViews } = context;
  if (
    (intent.type === "play" || intent.type === "discard")
    && metadata.options.deckPlays
    && gameState.cardsRemainingInTheDeck === 1
    && gameState.deck.length === cardIdentities.length - 1
    && intent.order === gameState.deck.length
    && !cardViews.some((view) => view.state.order === intent.order)
  ) {
    // The bottom card has no HanabiCard yet. Supply only the planner's data.
    return planHypotheticalAction(intent, {
      ...context,
      cardViews: [
        ...cardViews,
        {
          state: getInitialCardState(
            intent.order,
            variant,
            metadata.options.numPlayers,
          ),
          isStackBase: false,
          visibleSuitIndex: null,
          visibleRank: null,
        },
      ],
    });
  }

  return planHypotheticalAction(intent, context);
}
