export type Event<
  EventType extends string = string,
  EventData extends Record<string, unknown> = Record<string, unknown>
> = Readonly<{
  type: Readonly<EventType>;
  data: Readonly<EventData>;
}>;

export type Command<
  CommandType extends string = string,
  CommandData extends Record<string, unknown> = Record<string, unknown>
> = Readonly<{
  type: Readonly<CommandType>;
  data: Readonly<CommandData>;
}>;

export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

export type Reducer<State, TEvent extends Event> = {
  [K in TEvent['type']]: (state: State, event: Prettify<TEvent & { type: K }>) => State;
};

export type Dispatcher<State, TCommand extends Command, TEvent extends Event> = {
  [K in TCommand['type']]: (state: State, command: Prettify<TCommand & { type: K }>) => TEvent | Array<TEvent>;
};

export type Decider<State, TCommand extends Command, TEvent extends Event> = {
  reducer: Reducer<State, TEvent>;
  dispatcher: Dispatcher<State, TCommand, TEvent>;
  initialState: () => State;
};

function isKey<T extends object>(x: T, k: PropertyKey): k is keyof T {
  return k in x;
}

export interface Aggregate<State, TCommand extends Command, TEvent extends Event> {
  getState(): Readonly<State>;
  dispatch(command: TCommand): void;
  // emit(event: TEvent): void;
  allEvents(): ReadonlyArray<TEvent>;
  pendingEvents(): ReadonlyArray<TEvent>;
  flush(): ReadonlyArray<TEvent>;
}

export class AggregateRoot<State, TCommand extends Command, TEvent extends Event>
  implements Aggregate<State, TCommand, TEvent>
{
  #pendingEvents: Array<TEvent> = new Array();
  #state: State;

  constructor(private readonly decider: Decider<State, TCommand, TEvent>, private fromEvents: Array<TEvent>) {
    const state = decider.initialState();
    this.#state = fromEvents.reduce(this.#reduceFn, state);
  }

  #reduceFn = (agg: State, event: TEvent): State => {
    if (isKey(this.decider.reducer, event.type)) {
      return this.decider.reducer[event.type](agg, event);
    }
    return agg;
  };

  getState(): Readonly<State> {
    return this.#state;
  }
  dispatch(command: TCommand): void {
    if (!isKey(this.decider.dispatcher, command.type)) {
      return;
    }

    const newEvents = this.decider.dispatcher[command.type](this.#state, command);
    const events = Array.isArray(newEvents) ? newEvents : [newEvents];
    this.#state = events.reduce(this.#reduceFn, this.#state);
    this.#pendingEvents.push(...(Array.isArray(newEvents) ? newEvents : [newEvents]));
  }
  // emit(event: TEvent): void {
  //   this.#pendingEvents.push(newEvents);
  //   this.#state = this.#reduceFn(this.#state, event);
  // }
  allEvents(): readonly TEvent[] {
    return [...this.fromEvents, ...this.#pendingEvents];
  }
  pendingEvents(): readonly TEvent[] {
    return [...this.#pendingEvents];
  }
  flush(): ReadonlyArray<TEvent> {
    const flushed = [...this.#pendingEvents];
    this.fromEvents.push(...flushed);
    this.#pendingEvents.length = 0;
    return flushed;
  }
}

export const createAggregateFactory = <State, TCommand extends Command, TEvent extends Event>(
  decider: Decider<State, TCommand, TEvent>
) => {
  return function create(events?: TEvent[]): Aggregate<State, TCommand, TEvent> {
    return new AggregateRoot(decider, events ?? []);
  };
};
