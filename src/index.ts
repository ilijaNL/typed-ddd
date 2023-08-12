import { Static, TSchema } from '@sinclair/typebox';

export * as TypeBox from '@sinclair/typebox';

export interface Event<Name, Data> {
  event_name: Name;
  data: Data;
}

export type Events = {
  [name: string]: TSchema;
};

export interface EventFactory<TName, T extends TSchema> {
  (payload: Static<T>): Readonly<Event<TName, Static<T>>>;
  schema: T;
  event_name: TName;
}

export type EventMapFactory<T extends Events> = {
  [P in keyof T]: EventFactory<P, T[P]>;
};

type Procedure<T extends Events, Input, Ctx, Res> = (
  factory: EventMapFactory<T>,
  input: Input,
  ctx: Ctx
) => Promise<{ events: ReadonlyArray<ExtractEvents<T>>; data: Res }>;

interface Procedures<T extends Events> {
  [name: string]: Procedure<T, any, any, any>;
}

export type Action<Input, Ctx, Output, Events> = (
  input: Input,
  ctx: Ctx
) => Promise<{
  events: Events;
  data: Output;
}>;

export type Handler<Input, Ctx, Output, Events, Effect> = (
  input: Input,
  ctx: Ctx
) => Promise<{
  events: Events;
  effects: ReadonlyArray<Effect>;
  data: Output;
}>;
type InferActionFromProcedure<T extends Procedure<any, any, any, any>> = Action<
  Parameters<T>[1],
  Parameters<T>[2],
  AsyncReturnType<T>['data'],
  AsyncReturnType<T>['events']
>;

type InferHandlerFromProcedure<T extends Procedure<any, any, any, any>, Effect> = Handler<
  Parameters<T>[1],
  Parameters<T>[2],
  AsyncReturnType<T>['data'],
  AsyncReturnType<T>['events'],
  Effect
>;

type AsyncReturnType<T extends (...args: any) => Promise<any>> = T extends (...args: any) => Promise<infer R> ? R : any;

export type Actions<T extends Procedures<any>> = {
  [P in keyof T]: InferActionFromProcedure<T[P]>;
};

export type Handlers<T extends Procedures<any>, Effect> = {
  [P in keyof T]: InferHandlerFromProcedure<T[P], Effect>;
};

export type ExtractEvents<T extends Events> = {
  [P in keyof T]: P extends string ? Event<P, Static<T[P]>> : never;
}[keyof T];

export type Effects<T extends Event<any, any>, TEffect> = {
  [P in T['event_name']]: (event: T extends { event_name: P } ? T : never) => ReadonlyArray<TEffect>;
};

const noop = () => {
  //
};

const createEventsFactory = <T extends Events>(definitions: T, validatorFn?: CreateValidator): EventMapFactory<T> => {
  return (Object.keys(definitions) as Array<keyof T>).reduce((agg, event_name) => {
    const schema = definitions[event_name];
    const validateFn = schema && validatorFn ? validatorFn(schema) : noop;

    function factory<TData>(input: TData): Event<keyof T, TData> {
      // run validation fn if specified
      validateFn(input);

      return {
        event_name: event_name,
        data: input,
      };
    }

    factory.event_name = event_name;
    factory.schema = definitions[event_name];

    agg[event_name] = factory;
    return agg;
  }, {} as EventMapFactory<T>);
};

function createEffectsFactory<T extends Event<any, any>, Effect>(effectsMapper: Effects<T, Effect>) {
  function mapping(events: ReadonlyArray<T>): ReadonlyArray<Effect> {
    return events
      .map((event) => {
        const name = event.event_name as keyof Effects<T, Effect>;
        return effectsMapper[name](event as any);
        // return convert(event as any);
      })
      .flat();
  }

  return mapping;
}

export type Domain<TEvents extends Events, TProcedures extends Procedures<TEvents>> = {
  actions: Actions<TProcedures>;
  eventsFactory: EventMapFactory<TEvents>;
};

export type CreateValidator = (schema: TSchema) => (input: any) => void;

export function createDomain<T extends Events, TProcedures extends Procedures<T>>(props: {
  /**
   * Map of events, the map key is used as event name
   */
  eventsMap: T;
  /**
   * Validator for a specific event, will be invoked when factory is used to create an event.
   * If not specified, skips the data validation for events (more performant)
   */
  createValidationFn?: CreateValidator;
  /**
   * Map of procedures
   */
  procedures: TProcedures;
}): Domain<T, TProcedures> {
  const { eventsMap: events, procedures, createValidationFn } = props;
  const eventsFactory = createEventsFactory(events, createValidationFn);
  const actions = (Object.keys(procedures) as Array<keyof TProcedures>).reduce((agg, procedureKey) => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const procedure = procedures[procedureKey]!;

    agg[procedureKey] = async (input, ctx) => {
      const result = await procedure(eventsFactory, input, ctx);

      return {
        data: result.data,
        events: result.events,
      };
    };

    return agg;
  }, {} as Actions<TProcedures>);

  return {
    actions,
    eventsFactory,
  };
}

export function createAdapter<TEvents extends Events, TProcedures extends Procedures<TEvents>>(
  /**
   * Applies to specific domain
   */
  domain: Domain<TEvents, TProcedures>
) {
  /**
   * Map of effects
   */
  return function create<Effect>(effectMap: Effects<ExtractEvents<TEvents>, Effect>) {
    const toEffects = createEffectsFactory(effectMap);
    const handlers = (Object.keys(domain.actions) as Array<keyof TProcedures>).reduce((agg, key) => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const action = domain.actions[key]!;

      agg[key] = async function execute(input, ctx) {
        const result = await action(input, ctx);

        return {
          data: result.data,
          effects: toEffects(result.events),
          events: result.events,
        };
      };
      return agg;
    }, {} as Handlers<TProcedures, Effect>);

    return {
      domain,
      toEffects,
      handlers,
    };
  };
}
